export async function extractDouyin(targetUrl, env, puppeteer) {
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
        message: "由于解析服务每日免费浏览器额度（10分钟）已用尽，暂时无法启动云端引擎。建议重试或升级 Cloudflare 计划。注意：B站/快手视频在正常额度下可直接通过直链模式高速提取。"
      };
    }
    return { success: false, status: 500, message: `浏览器引擎启动失败: ${launchErr.message}` };
  }

  let videoUrl = null;
  let videoTitle = "douyin_video";
  let width = null;
  let height = null;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1");

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
      if ((contentType.includes("video") || url.includes("douyinvod.com")) && !url.includes("douyinstatic.com")) {
        if (!videoUrl) {
          videoUrl = url;
        }
      }
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

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
