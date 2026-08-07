export async function extractBilibili(targetUrl, env, puppeteer) {
  const bvidMatch = targetUrl.match(/video\/(BV[a-zA-Z0-9]+)/);
  const cleanBiliUrl = bvidMatch ? `https://m.bilibili.com/video/${bvidMatch[1]}` : targetUrl;
  console.log("Attempting direct Bilibili fetch:", cleanBiliUrl);

  let videoUrl = null;
  let videoTitle = "bilibili_video";
  let usePuppeteer = true;

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
          usePuppeteer = false;
          console.log("Direct Bilibili parsing succeeded!");
        }
      }
    } else {
      console.log(`Direct Bilibili fetch returned non-2xx status: ${biliRes.status}, falling back to Puppeteer...`);
    }
  } catch (biliErr) {
    console.error("Direct Bilibili fetch error, falling back to Puppeteer...", biliErr);
  }

  if (usePuppeteer) {
    console.log("Launching Puppeteer for Bilibili extraction:", cleanBiliUrl);
    if (!env.MYBROWSER) {
      return { success: false, status: 500, message: "Cloudflare Browser Rendering 绑定未配置 (env.MYBROWSER 字段缺失)" };
    }

    let browser;
    try {
      browser = await puppeteer.launch(env.MYBROWSER);
    } catch (launchErr) {
      console.error("Puppeteer launch error in Bilibili extractor:", launchErr);
      if (launchErr.message.includes("429") || launchErr.message.includes("limit")) {
        return {
          success: false,
          status: 429,
          message: "由于解析服务每日免费浏览器额度（10分钟）已用尽，暂时无法启动云端引擎。建议重试或升级 Cloudflare 计划。注意：B站视频在正常额度下可直接通过直链模式高速提取。"
        };
      }
      return { success: false, status: 500, message: `浏览器引擎启动失败: ${launchErr.message}` };
    }

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
      await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1");

      // Intercept direct video stream
      page.on("response", async (response) => {
        const url = response.url();
        const contentType = response.headers()["content-type"] || "";
        if (contentType.includes("video") || url.includes("bilivideo.com")) {
          if (!videoUrl) {
            videoUrl = url;
          }
        }
      });

      await page.goto(cleanBiliUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

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

      // Poll fallback
      for (let i = 0; i < 20; i++) {
        if (videoUrl) break;
        await new Promise(r => setTimeout(r, 500));
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
      width: 1920,
      height: 1080
    }
  };
}
