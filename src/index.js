import puppeteer from "@cloudflare/puppeteer";
import { htmlContent } from "./frontend.js";
import { extractDouyin } from "./extractors/douyin.js";
import { extractBilibili } from "./extractors/bilibili.js";
import { extractKuaishou } from "./extractors/kuaishou.js";
import { extractXiaohongshu } from "./extractors/xiaohongshu.js";

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
        let referer = "https://www.douyin.com/";
        if (videoCdnUrl.includes("bilivideo.com") || videoCdnUrl.includes("bilibili")) {
          referer = "https://www.bilibili.com/";
        } else if (videoCdnUrl.includes("kwai") || videoCdnUrl.includes("yximgs.com") || videoCdnUrl.includes("gifshow.com")) {
          referer = "https://www.kuaishou.com/";
        } else if (videoCdnUrl.includes("xhscdn.com") || videoCdnUrl.includes("xiaohongshu")) {
          referer = "https://www.xiaohongshu.com/";
        }

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

        // Delegate to specific platform extractors
        let result;
        if (targetUrl.includes("bilibili.com") || targetUrl.includes("b23.tv")) {
          result = await extractBilibili(targetUrl, env, puppeteer);
        } else if (targetUrl.includes("kuaishou.com") || targetUrl.includes("chenzhongtech.com")) {
          result = await extractKuaishou(targetUrl, env, puppeteer);
        } else if (targetUrl.includes("xiaohongshu.com") || targetUrl.includes("xhslink.cn")) {
          result = await extractXiaohongshu(targetUrl, env, puppeteer);
        } else {
          result = await extractDouyin(targetUrl, env, puppeteer);
        }

        if (!result.success) {
          return new Response(JSON.stringify({ success: false, message: result.message }), {
            status: result.status || 500,
            headers: { "Content-Type": "application/json" }
          });
        }

        let { url: videoUrl, title: videoTitle, width, height } = result.data;

        // Global normalization: Force HTTPS
        if (videoUrl.startsWith("http://")) {
          videoUrl = "https://" + videoUrl.slice(7);
        }

        // Remove watermark by replacing playwm with play (Douyin-specific, safe for others)
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
    if (!currentUrl.includes("v.douyin.com") && !currentUrl.includes("b23.tv") && !currentUrl.includes("v.kuaishou.com") && !currentUrl.includes("xhslink.cn")) {
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
