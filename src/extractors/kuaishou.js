export async function extractKuaishou(targetUrl, env, puppeteer) {
  console.log("Attempting direct Kuaishou fetch:", targetUrl);

  let videoUrl = null;
  let videoTitle = "kuaishou_video";
  let usePuppeteer = true;

  try {
    const ksRes = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Referer": "https://www.kuaishou.com/"
      }
    });

    if (ksRes.ok) {
      const html = await ksRes.text();
      const startIdx = html.indexOf("window.INIT_STATE = {");
      if (startIdx !== -1) {
        const braceStart = html.indexOf("{", startIdx);
        const endIdx = html.indexOf("</script>", startIdx);
        if (braceStart !== -1 && endIdx !== -1) {
          const jsonEnd = html.lastIndexOf("}", endIdx) + 1;
          const jsonStr = html.substring(braceStart, jsonEnd);
          const state = JSON.parse(jsonStr);

          // Decrypt ROT-1 helper
          const decryptKey = (encKey) => {
            let dec = "";
            for (let j = 0; j < encKey.length; j++) {
              dec += String.fromCharCode(encKey.charCodeAt(j) - 1);
            }
            return dec;
          };

          for (const [encKey, val] of Object.entries(state)) {
            const decKey = decryptKey(encKey);
            if (decKey.includes("photo/simple/info")) {
              if (val && val.photo) {
                videoTitle = (val.photo.caption || "kuaishou_video") + "_kuaishou";
                if (val.photo.mainMvUrls && val.photo.mainMvUrls.length > 0) {
                  videoUrl = val.photo.mainMvUrls[0].url;
                } else if (val.photo.playUrls && val.photo.playUrls.length > 0) {
                  videoUrl = val.photo.playUrls[0].url;
                }
                if (videoUrl) {
                  usePuppeteer = false;
                  console.log("Direct Kuaishou parsing succeeded!");
                }
              }
              break;
            }
          }
        }
      }
    } else {
      console.log(`Direct Kuaishou fetch returned non-2xx status: ${ksRes.status}, falling back to Puppeteer...`);
    }
  } catch (ksErr) {
    console.error("Direct Kuaishou fetch error, falling back to Puppeteer...", ksErr);
  }

  if (usePuppeteer) {
    console.log("Launching Puppeteer for Kuaishou extraction:", targetUrl);
    if (!env.MYBROWSER) {
      return { success: false, status: 500, message: "Cloudflare Browser Rendering 绑定未配置 (env.MYBROWSER 字段缺失)" };
    }

    let browser;
    try {
      browser = await puppeteer.launch(env.MYBROWSER);
    } catch (launchErr) {
      console.error("Puppeteer launch error in Kuaishou extractor:", launchErr);
      if (launchErr.message.includes("429") || launchErr.message.includes("limit")) {
        return {
          success: false,
          status: 429,
          message: "由于解析服务每日免费浏览器额度（10分钟）已用尽，暂时无法启动云端引擎。建议重试或升级 Cloudflare 计划。注意：快手视频在正常额度下可直接通过直链模式高速提取。"
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
        if (contentType.includes("video") || url.includes("kwaicdn.com") || url.includes("kwimgs.com") || url.includes("gifshow.com")) {
          if (!videoUrl) {
            videoUrl = url;
          }
        }
      });

      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

      console.log("Detecting Kuaishou URL inside Puppeteer, waiting for INIT_STATE...");
      try {
        await page.waitForFunction(() => {
          return typeof window.INIT_STATE === "object" && 
                 window.INIT_STATE !== null &&
                 Object.keys(window.INIT_STATE).length > 0;
        }, { timeout: 6000 });

        const evalRes = await page.evaluate(() => {
          if (typeof window.INIT_STATE === "object" && window.INIT_STATE !== null) {
            const decryptKey = (encKey) => {
              let dec = "";
              for (let j = 0; j < encKey.length; j++) {
                dec += String.fromCharCode(encKey.charCodeAt(j) - 1);
              }
              return dec;
            };
            for (const [encKey, val] of Object.entries(window.INIT_STATE)) {
              const decryptKey = decryptKey(encKey);
              if (decKey.includes("photo/simple/info")) {
                if (val && val.photo) {
                  let vUrl = null;
                  if (val.photo.mainMvUrls && val.photo.mainMvUrls.length > 0) {
                    vUrl = val.photo.mainMvUrls[0].url;
                  } else if (val.photo.playUrls && val.photo.playUrls.length > 0) {
                    vUrl = val.photo.playUrls[0].url;
                  }
                  return {
                    url: vUrl,
                    title: val.photo.caption || document.title
                  };
                }
                break;
              }
            }
          }
          return null;
        });

        if (evalRes && evalRes.url) {
          videoUrl = evalRes.url;
          videoTitle = evalRes.title + "_kuaishou";
          console.log("Successfully extracted Kuaishou URL from INIT_STATE inside Puppeteer:", videoUrl);
        }
      } catch (ksErr) {
        console.error("Kuaishou Puppeteer state extraction failed:", ksErr.message);
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
      width: null,
      height: null
    }
  };
}
