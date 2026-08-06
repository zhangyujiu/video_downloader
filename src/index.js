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
      const title = reqUrl.searchParams.get("title") || "douyin_video";

      if (!videoCdnUrl) {
        return new Response("Missing video URL", { status: 400 });
      }

      try {
        const response = await fetch(videoCdnUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://www.douyin.com/"
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

        // Normalize modal URLs
        const parsedUrl = new URL(targetUrl);
        const modalId = parsedUrl.searchParams.get("modal_id");
        if (modalId) {
          targetUrl = `https://www.douyin.com/video/${modalId}`;
        }

        console.log("Opening URL in Puppeteer:", targetUrl);

        // Launch Cloudflare Browser Rendering instance
        if (!env.MYBROWSER) {
          return new Response(JSON.stringify({ success: false, message: "Cloudflare Browser Rendering 绑定未配置 (env.MYBROWSER 字段缺失)" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }

        const browser = await puppeteer.launch(env.MYBROWSER);
        let videoUrl = null;
        let videoTitle = "douyin_video";
        let width = null;
        let height = null;

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
            if ((contentType.includes("video") || url.includes("douyinvod.com")) && !url.includes("douyinstatic.com")) {
              if (!videoUrl) {
                videoUrl = url;
              }
            }
          });

          // Open video page directly
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

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
              console.error("DOM fallback error:", e);
            }
          }
        } finally {
          // Always close browser context to free up Cloudflare minutes
          await browser.close();
        }

        if (!videoUrl) {
          return new Response(JSON.stringify({ success: false, message: "未能解析到视频播放源，可能受制于抖音的风控拦截或视频已隐藏。" }), {
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
    if (!currentUrl.includes("v.douyin.com")) {
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
