export async function extractXiaohongshu(targetUrl, env, puppeteer) {
  if (!env.MYBROWSER) {
    return { success: false, status: 500, message: "Cloudflare Browser Rendering 绑定未配置 (env.MYBROWSER 字段缺失)" };
  }

  let browser;
  try {
    browser = await puppeteer.launch(env.MYBROWSER);
  } catch (launchErr) {
    console.error("Puppeteer launch error in Xiaohongshu extractor:", launchErr);
    if (launchErr.message.includes("429") || launchErr.message.includes("limit")) {
      return {
        success: false,
        status: 429,
        message: "云端解析服务当前负载过高，请稍后重试。"
      };
    }
    return { success: false, status: 500, message: `浏览器引擎启动失败: ${launchErr.message}` };
  }

  let videoUrl = null;
  let videoTitle = "xiaohongshu_video";
  let width = null;
  let height = null;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1");

    page.on("response", async (response) => {
      const url = response.url();
      const contentType = response.headers()["content-type"] || "";
      if (contentType.includes("video") || (url.includes("xhscdn.com") && url.includes("/stream/"))) {
        if (!videoUrl) {
          videoUrl = url;
        }
      }
    });

    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    } catch (gotoErr) {
      console.warn("Xiaohongshu page navigation timeout/warning:", gotoErr.message);
    }

    // Poll for video URL
    for (let i = 0; i < 20; i++) {
      if (videoUrl) break;
      await new Promise(r => setTimeout(r, 500));
    }

    // Fallback: Check DOM if still not found
    if (!videoUrl) {
      try {
        const evalRes = await page.evaluate(() => {
          const videoEl = document.querySelector("video");
          if (videoEl && videoEl.src && !videoEl.src.startsWith("blob:")) {
            return { url: videoEl.src, title: document.title };
          }
          return null;
        });

        if (evalRes && evalRes.url) {
          videoUrl = evalRes.url;
          videoTitle = evalRes.title || videoTitle;
        }
      } catch (e) {}
    }

    // Attempt to scrape page title for naming if not already updated
    if (videoTitle === "xiaohongshu_video") {
      try {
        const pageTitle = await page.evaluate(() => document.title);
        if (pageTitle) {
          videoTitle = pageTitle;
        }
      } catch (titleErr) {}
    }

  } finally {
    await browser.close();
  }

  if (!videoUrl) {
    return { success: false, status: 404, message: "未能解析到小红书视频播放源，可能该篇笔记不是视频笔记（如图文笔记）或视频已被隐藏。" };
  }

  return {
    success: true,
    data: {
      url: videoUrl,
      title: videoTitle + "_xiaohongshu",
      width,
      height
    }
  };
}
