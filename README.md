# 视频无水印下载器 (抖音/B站)

这是一个高性能、轻量级、无需服务器（Serverless）的抖音/B站视频解析与无水印下载解决方案。
项目前端采用日系冷淡工业风设计，自适应手机与电脑端；后端部署于 Cloudflare Workers 全球边缘网络，配合云端浏览器渲染（Browser Rendering）与流式中转代理，实现 100% 稳定的解析与下载。

---

## ⚡ 快速开始

### **在线服务地址**：[https://video-downloader.jackzhang20191314.workers.dev](https://video-downloader.jackzhang20191314.workers.dev)

1. **获取链接**：在抖音或 B站 App 内复制任意视频的分享链接或分享文案（支持 `v.douyin.com`、`b23.tv`、`bilibili.com`）。
2. **提交解析**：打开上方网页，将复制的内容粘贴到输入框中，点击 **开始解析**。
3. **播放与下载**：解析成功后，可在网页内**直接在线播放预览（带声音）**，点击 **保存视频到手机** 即可无水印高速保存至本地相册。

---

## 🛠️ 云端部署指南

本程序完全托管在您的 Cloudflare 免费账户中，无需租用服务器。

### 1. 环境准备
确保您的电脑上已安装 [Node.js](https://nodejs.org/)。

### 2. 下载并安装依赖
在终端中进入项目文件夹，安装命令行部署工具 Wrangler：
```bash
cd douyin_downloader
npm install
```

### 3. 授权登录 Cloudflare
执行以下命令，在弹出的浏览器窗口中授权登录您的 Cloudflare 账户：
```bash
npx wrangler login
```

### 4. 开启云端浏览器服务 (免费)
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 进入左侧导航栏的 **Workers & Pages** -> **Plans**。
3. 找到 **Browser Rendering** 并开启激活（免费计划每天提供 10 分钟浏览器运行额度，足够日常使用）。

### 5. 一键部署上线
执行部署命令：
```bash
npx wrangler deploy
```
部署完成后，控制台将输出您的专属二级域名地址（如 `https://video-downloader.xxx.workers.dev`）。

---

## 🔬 核心技术实现方案

本项目之所以能实现 100% 稳定的跨平台解析与下载，核心在于针对抖音和 B站的不同防封与防盗链机制，设计了差异化的流式提取方案。

### 🎵 抖音 (Douyin) 解析实现方案
1. **短网址重定向追踪**：抖音分享链接（如 `v.douyin.com`）由 Worker 发起 `HEAD` 请求追踪，获取最终的 `www.douyin.com/video/7xxxxxxxxxx` 长链接。如果是合集/模块链接，提取 `modal_id` 参数并规范化为直连视频页。
2. **移动端伪装 (Bypass 滑块)**：使用数据中心 IP 直接调用抖音电脑端 API 会因缺少签名产生滑动拼图风控。为此，我们在启动云端无头浏览器（Puppeteer）时强行模拟 **iPhone Safari 移动端环境**（设置 Viewport 为 375x812 并注入移动端 User-Agent），从根本上避免触发拼图风控。
3. **网络数据包拦截**：监听浏览器的网络请求，一旦发现匹配 `aweme/v1/web/aweme/detail` 的核心接口响应，立即调用 `response.json()` 获取原生的视频属性对象。
4. **水印自动去除**：拦截到视频 CDN 地址后，通过正则替换算法：
   ```javascript
   videoUrl = videoUrl.replace("/playwm/", "/play/");
   ```
   将包含 `/playwm/`（有水印）的 CDN 路径热替换为 `/play/`（无水印），即可驱动 CDN 节点向客户端发送无水印的高清原片视频。

### 📺 哔哩哔哩 (B站) 解析实现方案
1. **自适应极速直连 (0额度消耗)**：当用户提交 B站链接时，后端优先使用标准 `fetch` 直接抓取 B站移动端 H5 网页（`m.bilibili.com/video/BVxxxx`）。如果请求未被 B站 WAF 阻拦，程序直接利用正则表达式提取网页中的全局状态机 JSON：
   ```javascript
   const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/);
   ```
   从中解析出 `state.video.playUrlInfo[0].url`。该直链是 B站专门为移动端 H5 播放器提供的 **音视频合并高清 MP4 文件**，免去了 DASH 协议下繁琐的音视频分离轨道合并（Muxing）工作。
2. **云端无头浏览器退避 (WAF 绕过)**：若极速直连受到 B站防火墙拦截返回 `412 Precondition Failed`，Worker 会**自动降级启用云端无头浏览器（Puppeteer）**，等待网页初始化并提取 `window.__INITIAL_STATE__` 变量，实现 100% 成功解析。

### 🔀 云端流式管道代理 (CORS & 403 跨域越狱)
无论是抖音的 `douyinvod.com` 还是 B站的 `bilivideo.com` CDN，都对 `Referer` 做了严格的限制，且存在跨域访问拦截。
- **动态防盗链伪装**：项目内置了中转路由 `/api/download?url=...`。Worker 在接收到下载请求时，会根据 URL 的归属自动在出站请求中注入 `Referer` 标头（B站注入 `bilibili.com`，抖音注入 `douyin.com`）。
- **管道流 (Streaming Pipe) 实时中转**：Worker 通过在响应头中强行添加 CORS 跨域许可，并使用 **ReadableStream 管道流**，将 CDN 原始的视频比特流实时转发给用户浏览器。整个过程只做数据流的直传，内存开销极低，且完美避开了浏览器的跨域和 403 下载被拒问题。
