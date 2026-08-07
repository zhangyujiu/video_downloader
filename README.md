# 视频无水印下载器 (抖音/B站/快手/小红书)

这是一个高性能、轻量级、无需服务器（Serverless）的抖音/B站/快手/小红书视频解析与下载解决方案。
项目前端采用日系冷淡工业风设计，自适应手机与电脑端；后端部署于 Cloudflare Workers 全球边缘网络，配合云端浏览器渲染（Browser Rendering）与流式中转代理，实现 100% 稳定的解析与下载。

---

## ⚡ 快速开始

### **在线服务地址**：[https://video-downloader.jackzhang20191314.workers.dev](https://video-downloader.jackzhang20191314.workers.dev)

1. **获取链接**：在抖音、B站、快手或小红书 App 内复制任意视频的分享链接或分享文案（支持 `v.douyin.com`、`b23.tv`、`v.kuaishou.com`、`xhslink.cn` 等）。
2. **提交解析**：打开上方网页，将复制的内容粘贴到输入框中，点击 **开始解析**。
3. **播放与下载**：解析成功后，可在网页内**直接在线播放预览（带声音）**，点击 **保存视频到手机** 即可高速保存至本地相册。

---

## 🛠️ 云端部署指南

本程序完全托管在您的 Cloudflare 免费账户中，无需租用服务器。

### 1. 环境准备
确保您的电脑上已安装 [Node.js](https://nodejs.org/)。

### 2. 下载并安装依赖
在终端中进入项目文件夹，安装命令行部署工具 Wrangler：
```bash
cd video_downloader
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

本项目之所以能实现 100% 稳定的跨平台解析与下载，核心在于针对抖音、B站、快手和小红书的不同防封与防盗链机制，设计了差异化的流式提取方案。

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

### 🤝 快手 (Kuaishou) 解析实现方案
1. **短链自动追踪**：快手分享短链（如 `v.kuaishou.com`）在出站请求时，自动跟随重定向并还原出快手移动端 H5 页面地址（`v.m.chenzhongtech.com/fw/photo/...`）。
2. **免浏览器解密提取 (0额度消耗)**：为绕过快手高强度的滑动验证码（`captcha.zt.kuaishou.com`），程序在云端直接抓取页面 HTML，提取嵌入的全局加密数据 `window.INIT_STATE`。
3. **ROT-1 密钥还原算法**：快手对 `INIT_STATE` 对象的 key 进行了偏移量为 +1 的 ROT-1 简单加密（例如将 `"string"` 加密为 `"tusjoh"`，`/rest/wd/ugH5App/photo/simple/info` 加密为 `.0sftu0xe0vhI6Bqq0qipup0tjnqmf0jogp`）。程序通过反向减一解密出对应的接口数据值，从而直接读取视频详情 `val.photo.mainMvUrls[0].url`，在完全不运行 JS 的情况下秒级解析，规避滑块风控。
4. **无头浏览器弹性降级**：如果直链解密失败，程序会自动降级通过 Puppeteer 浏览器引擎渲染页面，等待 `INIT_STATE` 脚本加载后，在沙箱环境中解密提取视频源。

### 📕 小红书 (Xiaohongshu) 解析实现方案
1. **短链重定向追踪**：自动跟随 `xhslink.cn` 短网址的跳转，还原出小红书移动端 H5 详情页地址（`www.xiaohongshu.com/discovery/item/...`）。
2. **云端渲染与视频流拦截**：小红书落地页包含高强度的 WAF 爬虫阻断。为此，Worker 启动 Puppeteer 浏览器容器，模拟移动端 iPhone Safari，在真实的浏览器环境中触发小红书的网页逻辑。
3. **精确媒体流拦截**：监听浏览器的响应，通过拦截 `xhscdn.com/stream/` 下含有 `/stream/` 路径特征的响应报文，提取出最核心的高画质 MP4 视频 CDN 播放源。自动过滤页面里的背景图、头像和静态 CSS/JS 资源，保证提取纯净的视频直链。

### 🔀 云端流式管道代理 (CORS & 403 跨域越狱)
无论是抖音、B站、快手还是小红书的 CDN，都有一定的防盗链或跨域下载限制。
- **动态防盗链伪装**：项目内置了中转路由 `/api/download?url=...`。Worker 在接收到下载请求时，会根据 URL 的归属自动在出站请求中注入 `Referer` 标头（B站注入 `bilibili.com`，抖音注入 `douyin.com`，快手注入 `kuaishou.com`，小红书注入 `xiaohongshu.com`）。
- **管道流 (Streaming Pipe) 实时中转**：Worker 通过在响应头中强行添加 CORS 跨域许可，并使用 **ReadableStream 管道流**，将 CDN 原始的视频比特流实时转发给用户浏览器。整个过程只做数据流 of 直传，内存开销极低，且完美避开了浏览器的跨域和 403 下载被拒问题。
