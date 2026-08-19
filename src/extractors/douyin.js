export async function extractDouyin(targetUrl, env, puppeteer) {
  // Extract awemeId using regex from the URL
  const idMatch = targetUrl.match(/video\/(\d+)/) || targetUrl.match(/note\/(\d+)/);
  if (!idMatch) {
    return { success: false, status: 400, message: "无法从链接中提取到有效的视频 ID。" };
  }
  const awemeId = idMatch[1];

  let videoUrl = null;
  let videoTitle = "douyin_video";
  let width = null;
  let height = null;

  // Primary path: Direct API fetch with ttwid cookie register (0 browser rendering quota consumption, immune to WAF)
  try {
    const registerUrl = "https://ttwid.bytedance.com/ttwid/union/register/";
    const registerBody = {
      region: "cn",
      aid: 1768,
      needFid: "false",
      service: "www.douyin.com",
      migrate_info: { ticket: "", source: "node" }
    };

    const registerRes = await fetch(registerUrl, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "text/plain"
      },
      body: JSON.stringify(registerBody)
    });

    if (registerRes.ok) {
      const cookieHeader = registerRes.headers.get("Set-Cookie") || "";
      let ttwid = "";
      if (cookieHeader.includes("ttwid=")) {
        ttwid = cookieHeader.split("ttwid=")[1].split(";")[0];
      }

      if (ttwid) {
        const detailUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?device_platform=webp&aid=6383&channel=channel_pc_web&aweme_id=${awemeId}`;
        const detailRes = await fetch(detailUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": `https://www.douyin.com/video/${awemeId}`,
            "Cookie": `ttwid=${ttwid}`
          }
        });

        if (detailRes.ok) {
          const resJson = await detailRes.json();
          if (resJson && resJson.aweme_detail) {
            const detail = resJson.aweme_detail;
            const videoNode = detail.video;
            if (videoNode) {
              const playAddr = videoNode.play_addr || videoNode.play_addr_h264;
              if (playAddr && playAddr.url_list && playAddr.url_list.length > 0) {
                videoUrl = playAddr.url_list[0];
                videoTitle = detail.desc || videoTitle;
                if (videoNode.width) width = videoNode.width;
                if (videoNode.height) height = videoNode.height;
                
                console.log("Successfully extracted Douyin video details via direct ttwid register API fetch!");
              }
            }
          }
        }
      }
    }
  } catch (directErr) {
    console.warn("Douyin direct ttwid API fetch error:", directErr.message);
  }

  // Fallback path: Launch Puppeteer if direct fetch failed
  if (!videoUrl) {
    if (!env.MYBROWSER) {
      return { success: false, status: 500, message: "Cloudflare Browser Rendering 绑定未配置 (env.MYBROWSER 字段缺失)" };
    }

    let browser;
    try {
      browser = await puppeteer.launch(env.MYBROWSER);
    } catch (launchErr) {
      console.error("Puppeteer launch error in Douyin extractor:", launchErr);
      if (launchErr.message.includes("429") || launchErr.message.includes("limit")) {
        return {
          success: false,
          status: 429,
          message: "云端解析服务当前负载过高，请稍后重试。"
        };
      }
      return { success: false, status: 500, message: `浏览器引擎启动失败: ${launchErr.message}` };
    }

    try {
      const page = await browser.newPage();
      
      // Inject stealth webdriver override
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
      });

      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

      page.on("response", async (response) => {
        const url = response.url();
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
          } catch (e) {}
        }
        const contentType = response.headers()["content-type"] || "";
        if ((contentType.includes("video") || url.includes("douyinvod.com") || url.includes("zjcdn.com") || url.includes("bytevideocdn.com") || url.includes("amemv.com")) && !url.includes("douyinstatic.com") && !url.includes("webp")) {
          if (!videoUrl) {
            videoUrl = url;
          }
        }
      });

      try {
        // First visit home page to initialize cookies/session with stealth webdriver override active
        await page.goto("https://www.douyin.com/", { waitUntil: "domcontentloaded", timeout: 15000 });
        await new Promise(r => setTimeout(r, 2000));
      } catch (homeErr) {
        console.warn("Douyin home page init warning:", homeErr.message);
      }

      try {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
      } catch (gotoErr) {
        console.warn("Douyin target page navigation timeout/warning:", gotoErr.message);
      }

      for (let i = 0; i < 20; i++) {
        if (videoUrl) break;
        await new Promise(r => setTimeout(r, 500));
      }

      if (!videoUrl) {
        try {
          const evalRes = await page.evaluate(() => {
            const videoEl = document.querySelector("video");
            if (videoEl && videoEl.src && !videoEl.src.startsWith("blob:")) {
              return { url: videoEl.src, title: document.title };
            }
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
        } catch (e) {}
      }
    } finally {
      await browser.close();
    }
  }

  if (!videoUrl) {
    return { success: false, status: 404, message: "未能解析到视频播放源，可能受制于风控拦截或视频已隐藏。" };
  }

  return {
    success: true,
    data: {
      url: videoUrl,
      title: videoTitle,
      width,
      height
    }
  };
}
