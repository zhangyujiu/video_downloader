import puppeteer from "@cloudflare/puppeteer";
import { htmlContent } from "./frontend.js";

export default {
  async fetch(request, env) {
    const reqUrl = new URL(request.url);

    // 1. Route to frontend homepage
    if (reqUrl.pathname === "/" || reqUrl.pathname === "/index.html") {
      return new Response(htmlContent, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // 2. Route to download proxy API
    if (reqUrl.pathname === "/api/download") {
      const videoCdnUrl = reqUrl.searchParams.get("url");
      const title = reqUrl.searchParams.get("title") || "video";

      if (!videoCdnUrl) {
        return new Response("Missing video URL", { status: 400 });
      }

      try {
        const referer = videoCdnUrl.includes("bilivideo.com") || videoCdnUrl.includes("bilibili")
          ? "https://www.bilibili.com/"
          : "https://www.douyin.com/";

        const response = await fetch(videoCdnUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": referer
          }
        });

        if (!response.ok) {
          return new Response(`Failed to fetch video stream from CDN. Status: ${response.status}`, { status: 502 });
        }

        const headers = new Headers(response.headers);
        headers.set("Access-Control-Allow-Origin", "*");

        const isPreview = reqUrl.searchParams.get("preview") === "true";
        if (isPreview) {
          headers.set("Content-Disposition", "inline");
        } else {
          // Force browser to save file as attachment
          const safeTitle = encodeURIComponent(title.replace(/[\\/*?:"<>|]/g, "").trim());
          headers.set("Content-Disposition", `attachment; filename="${safeTitle}.mp4"`);
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: headers
        });
      } catch (err) {
        return new Response(`Proxy download error: ${err.message}`, { status: 500 });
      }
    }

    // 3. Route to extraction API
    if (reqUrl.pathname === "/api/extract" && request.method === "POST") {
      try {
        const body = await request.json();
        let inputText = body.text || "";

        // Extract URL using regex
        const urlMatch = inputText.match(/https?:\/\/[^\s]+/);
        if (!urlMatch) {
          return new Response(JSON.stringify({ success: false, message: "未能在输入中找到有效链接" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        let targetUrl = urlMatch[0];
        
        // Resolve redirects (short URL to long URL)
        targetUrl = await resolveRedirect(targetUrl);

        // Normalize modal URLs for Douyin
        const parsedUrl = new URL(targetUrl);
        const modalId = parsedUrl.searchParams.get("modal_id");
        if (modalId) {
          targetUrl = `https://www.douyin.com/video/${modalId}`;
        }

        let usePuppeteer = true;
        let videoUrl = null;
        let videoTitle = "video";
        let width = null;
        let height = null;

        // Try direct Bilibili parsing first (to save Puppeteer minutes and bypass rate limits)
        if (targetUrl.includes("bilibili.com") || targetUrl.includes("b23.tv")) {
          const bvidMatch = targetUrl.match(/video\/(BV[a-zA-Z0-9]+)/);
          const cleanBiliUrl = bvidMatch ? `https://m.bilibili.com/video/${bvidMatch[1]}` : targetUrl;
          console.log("Attempting direct Bilibili fetch:", cleanBiliUrl);

          try {
            const biliRes = await fetch(cleanBiliUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
                "Referer": "https://www.bilibili.com/"
              }
            });

            if (biliRes.ok) {
              const html = await biliRes.text();
              const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/);
              if (stateMatch) {
                const state = JSON.parse(stateMatch[1]);
                if (state && state.video && state.video.playUrlInfo && state.video.playUrlInfo.length > 0) {
                  videoUrl = state.video.playUrlInfo[0].url;
                  videoTitle = ((state.video.viewInfo && state.video.viewInfo.title) || "bilibili_video") + "_bilibili";
                  usePuppeteer = false; // Successfully parsed without Puppeteer!
                  console.log("Direct Bilibili parsing succeeded!");
                }
              }
            } else {
              console.log(`Direct Bilibili fetch returned non-2xx status: ${biliRes.status}, falling back to Puppeteer...`);
            }
          } catch (biliErr) {
            console.error("Direct Bilibili fetch error, falling back to Puppeteer...", biliErr);
          }
        }

        if (usePuppeteer) {
          console.log("Launching Puppeteer for extraction:", targetUrl);
          
          if (!env.MYBROWSER) {
            return new Response(JSON.stringify({ success: false, message: "Cloudflare Browser Rendering 绑定未配置 (env.MYBROWSER 字段缺失)" }), {
              status: 500,
              headers: { "Content-Type": "application/json" }
            });
          }

          let browser;
          try {
            browser = await puppeteer.launch(env.MYBROWSER);
          } catch (launchErr) {
            console.error("Puppeteer launch error:", launchErr);
            if (launchErr.message.includes("429") || launchErr.message.includes("limit")) {
              return new Response(JSON.stringify({ 
                success: false, 
                message: "由于解析服务每日免费浏览器额度（10分钟）已用尽，暂时无法启动云端引擎。建议重试或升级 Cloudflare 计划。注意：B站视频在正常额度下可直接通过直链模式高速提取。" 
              }), {
                status: 429,
                headers: { "Content-Type": "application/json" }
              });
            }
            return new Response(JSON.stringify({ success: false, message: `浏览器引擎启动失败: ${launchErr.message}` }), {
              status: 500,
              headers: { "Content-Type": "application/json" }
            });
          }

          try {
            const page = await browser.newPage();
            // Set custom viewport and headers to simulate mobile iPhone
            await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
            await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1");

            // Network interceptor
            page.on("response", async (response) => {
              const url = response.url();
              
              // 1. Intercept detail API response
              if (url.includes("aweme/v1/web/aweme/detail") || url.includes("aweme/v1/device/info")) {
                try {
                  const data = await response.json();
                  if (data && data.aweme_detail) {
                    const videoNode = data.aweme_detail.video;
                    if (videoNode) {
                      const playAddr = videoNode.play_addr || videoNode.play_addr_h264;
                      if (playAddr && playAddr.url_list && playAddr.url_list.length > 0) {
                        videoUrl = playAddr.url_list[0];
                        if (data.aweme_detail.desc) {
                          videoTitle = data.aweme_detail.desc;
                        }
                        if (videoNode.width) width = videoNode.width;
                        if (videoNode.height) height = videoNode.height;
                      }
                    }
                  }
                } catch (e) {
                  // Ignore parsing errors
                }
              }

              // 2. Intercept direct video requests (fallback)
              const contentType = response.headers()["content-type"] || "";
              if ((contentType.includes("video") || url.includes("douyinvod.com") || url.includes("bilivideo.com")) && !url.includes("douyinstatic.com")) {
                if (!videoUrl) {
                  videoUrl = url;
                }
              }
            });

            // Open video page directly
            await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

            // Extract Bilibili data if applicable
            if (targetUrl.includes("bilibili.com") || targetUrl.includes("b23.tv")) {
              console.log("Detecting Bilibili URL, waiting for __INITIAL_STATE__ inside Puppeteer...");
              try {
                await page.waitForFunction(() => {
                  return typeof window.__INITIAL_STATE__ === "object" && 
                         window.__INITIAL_STATE__ !== null && 
                         window.__INITIAL_STATE__.video && 
                         window.__INITIAL_STATE__.video.playUrlInfo &&
                         window.__INITIAL_STATE__.video.playUrlInfo.length > 0;
                }, { timeout: 6000 });

                const evalRes = await page.evaluate(() => {
                  const state = window.__INITIAL_STATE__;
                  return {
                    url: state.video.playUrlInfo[0].url,
                    title: (state.video.viewInfo && state.video.viewInfo.title) || document.title
                  };
                });

                if (evalRes && evalRes.url) {
                  videoUrl = evalRes.url;
                  videoTitle = evalRes.title + "_bilibili";
                  console.log("Successfully extracted Bilibili URL from INITIAL_STATE inside Puppeteer:", videoUrl);
                }
              } catch (biliErr) {
                console.error("Bilibili __INITIAL_STATE__ extraction failed inside Puppeteer:", biliErr.message);
              }
            }

            // Poll for video URL up to 10 seconds
            for (let i = 0; i < 20; i++) {
              if (videoUrl) break;
              await new Promise(r => setTimeout(r, 500));
            }

            // Fallback: Check DOM if still not found
            if (!videoUrl) {
              try {
                const evalRes = await page.evaluate(() => {
                  // Check video element
                  const videoEl = document.querySelector("video");
                  if (videoEl && videoEl.src && !videoEl.src.startsWith("blob:")) {
                    return { url: videoEl.src, title: document.title };
                  }
                  // Check render data
                  const renderDataEl = document.getElementById("RENDER_DATA");
                  if (renderDataEl) {
                    return { renderData: renderDataEl.textContent };
                  }
                  return null;
                });

                if (evalRes) {
                  if (evalRes.url) {
                    videoUrl = evalRes.url;
                    videoTitle = evalRes.title || videoTitle;
                  } else if (evalRes.renderData) {
                    const decoded = decodeURIComponent(evalRes.renderData);
                    const renderData = JSON.parse(decoded);
                    const findVal = (obj, key) => {
                      if (!obj || typeof obj !== "object") return null;
                      if (obj[key]) return obj[key];
                      for (const k in obj) {
                        const res = findVal(obj[k], key);
                        if (res) return res;
                      }
                      return null;
                    };
                    const detail = findVal(renderData, "awemeDetail") || findVal(renderData, "aweme_detail");
                    if (detail && detail.video) {
                      const playAddr = detail.video.play_addr || detail.video.play_addr_h264;
                      if (playAddr && playAddr.url_list && playAddr.url_list.length > 0) {
                        videoUrl = playAddr.url_list[0];
                        videoTitle = detail.desc || videoTitle;
                        width = detail.video.width;
                        height = detail.video.height;
                      }
                    }
                  }
                }
              } catch (e) {
                // Ignore DOM errors
              }
            }
          } finally {
            // Always close browser context to free up Cloudflare minutes
            await browser.close();
          }
        }

        if (!videoUrl) {
          return new Response(JSON.stringify({ success: false, message: "未能解析到视频播放源，可能受制于风控拦截或视频已隐藏。" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Return result
        if (videoUrl.startsWith("http://")) {
          videoUrl = "https://" + videoUrl.slice(7);
        }

        // Remove watermark by replacing playwm with play
        videoUrl = videoUrl.replace("/playwm/", "/play/");

        return new Response(JSON.stringify({
          success: true,
          data: {
            url: videoUrl,
            title: videoTitle,
            width,
            height
          }
        }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (err) {
        console.error("Extraction error:", err);
        return new Response(JSON.stringify({ success: false, message: `服务器解析错误: ${err.message}` }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Default route
    return new Response("Not Found", { status: 404 });
  }
};

async function resolveRedirect(url) {
  let currentUrl = url;
  const maxRedirects = 5;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  for (let i = 0; i < maxRedirects; i++) {
    if (!currentUrl.includes("v.douyin.com") && !currentUrl.includes("b23.tv")) {
      break;
    }

    try {
      const res = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: headers
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (location) {
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }
      }
      break;
    } catch (e) {
      console.error("Error resolving redirect:", e);
      break;
    }
  }
  return currentUrl;
}
