export const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>抖音视频下载器</title>
  <!-- Google Fonts Outfit & JetBrains Mono -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Outfit:wght@300;400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #f4f4f6;
      --card-bg: #ffffff;
      --card-border: #e4e4e7;
      --accent-orange: #ff5500;
      --accent-green: #10b981;
      --text-primary: #09090b;
      --text-secondary: #71717a;
      --error-red: #ef4444;
      --terminal-bg: #fafafa;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'JetBrains Mono', 'Noto Sans SC', monospace;
      background-color: var(--bg-color);
      background-image: 
        linear-gradient(rgba(228, 228, 231, 0.4) 1px, transparent 1px),
        linear-gradient(90deg, rgba(228, 228, 231, 0.4) 1px, transparent 1px);
      background-size: 20px 20px;
      color: var(--text-primary);
      min-height: 100vh;
      margin: 0;
      padding: 0;
    }

    .wrapper {
      width: 100%;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }

    .container {
      width: 100%;
      max-width: 480px;
      position: relative;
    }

    /* Minimalist Technical Card */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0px; /* Sharp brutalist edges */
      padding: 40px 28px;
      box-shadow: 0 4px 24px rgba(9, 9, 11, 0.02);
      position: relative;
    }

    header {
      margin-bottom: 28px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--card-border);
    }

    h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 1.35rem;
      font-weight: 500;
      letter-spacing: 0.12em;
      color: var(--text-primary);
      text-transform: uppercase;
      display: inline-block;
      border-bottom: 2px solid var(--accent-orange);
      padding-bottom: 6px;
      margin-bottom: 8px;
    }

    .subtitle {
      font-size: 0.7rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-top: 4px;
    }

    /* Input Fields */
    .input-group {
      margin-bottom: 20px;
    }

    textarea {
      width: 100%;
      height: 110px;
      background: var(--terminal-bg);
      border: 1px solid var(--card-border);
      border-radius: 0px;
      padding: 16px;
      color: var(--text-primary);
      font-family: inherit;
      font-size: 0.85rem;
      resize: none;
      outline: none;
      line-height: 1.5;
      transition: all 0.2s ease;
    }

    textarea:focus {
      background: #ffffff;
      border-color: var(--accent-orange);
    }

    textarea::placeholder {
      color: #a1a1aa;
    }

    /* Buttons */
    .btn {
      width: 100%;
      height: 46px;
      background: var(--text-primary);
      border: 1px solid var(--text-primary);
      border-radius: 0px;
      color: #ffffff;
      font-family: inherit;
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.25s ease;
    }

    .btn:hover {
      background: var(--accent-orange);
      border-color: var(--accent-orange);
      color: #ffffff;
    }

    .btn:active {
      transform: translateY(1px);
    }

    .btn:disabled {
      border-color: var(--card-border);
      color: var(--text-secondary);
      background: #f4f4f5;
      cursor: not-allowed;
      box-shadow: none;
    }

    /* Statuses and Console Output */
    .status-container {
      display: none;
      margin-top: 20px;
      padding: 14px;
      background: var(--terminal-bg);
      border-radius: 0px;
      border: 1px solid var(--card-border);
    }

    .loader {
      width: 100%;
      height: 3px;
      background: var(--card-border);
      overflow: hidden;
      margin-bottom: 10px;
    }

    .loader-bar {
      width: 30%;
      height: 100%;
      background: var(--accent-orange);
      animation: loading-anim 1.2s infinite ease-in-out;
    }

    @keyframes loading-anim {
      0% { margin-left: -30%; }
      100% { margin-left: 100%; }
    }

    .status-text {
      font-size: 0.78rem;
      color: var(--accent-orange);
      font-weight: 500;
      text-align: left;
    }

    /* Preview Module */
    .preview-container {
      display: none;
      margin-top: 24px;
      animation: fadeIn 0.25s ease-out forwards;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .video-title-box {
      background: var(--terminal-bg);
      border: 1px solid var(--card-border);
      border-radius: 0px;
      padding: 12px;
      margin-bottom: 16px;
    }

    .video-title-tag {
      font-size: 0.68rem;
      color: var(--accent-orange);
      text-transform: uppercase;
      margin-bottom: 4px;
      font-weight: 700;
    }

    .video-title-tag::before {
      content: "[INFO]";
    }

    .video-title {
      font-size: 0.8rem;
      color: var(--text-primary);
      line-height: 1.5;
      word-break: break-all;
    }

    .video-wrapper {
      position: relative;
      width: 100%;
      border-radius: 0px;
      border: 1px solid var(--card-border);
      overflow: hidden;
      background: #000;
      margin-bottom: 20px;
      aspect-ratio: 16 / 9;
    }

    .video-wrapper.portrait {
      aspect-ratio: 9 / 16;
      max-height: 380px;
      width: auto;
      margin-left: auto;
      margin-right: auto;
    }

    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      outline: none;
    }

    /* Error Alert styling */
    .error-alert {
      display: none;
      margin-top: 20px;
      background: rgba(239, 68, 68, 0.03);
      border: 1px solid rgba(239, 68, 68, 0.15);
      border-radius: 0px;
      padding: 12px;
      color: var(--error-red);
      font-size: 0.78rem;
      line-height: 1.4;
      text-align: left;
    }

    footer {
      margin-top: 32px;
      text-align: center;
      font-size: 0.68rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    /* Responsive adjustments */
    @media (max-width: 480px) {
      .card {
        padding: 32px 20px;
      }
      h1 {
        font-size: 1.2rem;
      }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="card">
        <header>
          <h1>视频下载助手</h1>
          <div class="subtitle">Cloudflare Edge 视频解析与代理下载</div>
        </header>
  
        <main>
          <div class="input-group">
            <textarea id="urlInput" placeholder="在此粘贴抖音分享文案、短链接（v.douyin.com）或网页长链接..."></textarea>
          </div>
  
          <button id="extractBtn" class="btn">
            <span>开始解析</span>
          </button>
  
          <div id="statusContainer" class="status-container">
            <div class="loader">
              <div class="loader-bar"></div>
            </div>
            <div id="statusText" class="status-text">INIT STATUS...</div>
          </div>
  
          <div id="errorAlert" class="error-alert"></div>
  
          <div id="previewContainer" class="preview-container">
            <div class="video-title-box">
              <div class="video-title-tag"></div>
              <div id="videoTitle" class="video-title">视频标题</div>
            </div>
            <div id="videoWrapper" class="video-wrapper">
              <video id="videoPlayer" controls playsinline preload="auto">
                您的浏览器不支持 HTML5 视频播放。
              </video>
            </div>
            <button id="downloadBtn" class="btn" style="background: var(--text-primary); border-color: var(--text-primary);">
              <span>保存视频到手机</span>
            </button>
          </div>
        </main>
  
        <footer>
          CF Browser Run Engine
        </footer>
      </div>
    </div>
  </div>

  <script>
    const urlInput = document.getElementById('urlInput');
    const extractBtn = document.getElementById('extractBtn');
    const statusContainer = document.getElementById('statusContainer');
    const statusText = document.getElementById('statusText');
    const errorAlert = document.getElementById('errorAlert');
    const previewContainer = document.getElementById('previewContainer');
    const videoTitle = document.getElementById('videoTitle');
    const videoPlayer = document.getElementById('videoPlayer');
    const videoWrapper = document.getElementById('videoWrapper');
    const downloadBtn = document.getElementById('downloadBtn');

    let extractedData = null;

    // Helper: Show/Hide Elements
    function show(element) { element.style.display = 'block'; }
    function hide(element) { element.style.display = 'none'; }

    // Start extraction
    extractBtn.addEventListener('click', async () => {
      const rawText = urlInput.value.trim();
      if (!rawText) {
        showError('请输入有效的分享链接或内容！');
        return;
      }

      // Reset UI
      hide(errorAlert);
      hide(previewContainer);
      show(statusContainer);
      extractBtn.disabled = true;
      statusText.innerText = '正在启动云端渲染引擎...';

      // Start request
      try {
        const response = await fetch('/api/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: rawText })
        });

        const result = await response.json();

        if (response.status !== 200 || !result.success) {
          throw new Error(result.message || '解析失败，请检查链接是否正确。');
        }

        extractedData = result.data;
        showPreview(extractedData);
      } catch (err) {
        showError(err.message);
      } finally {
        hide(statusContainer);
        extractBtn.disabled = false;
      }
    });

    function showError(msg) {
      errorAlert.innerText = '> ' + msg;
      show(errorAlert);
    }

    function showPreview(data) {
      videoTitle.innerText = data.title;
      videoPlayer.src = \`/api/download?url=\${encodeURIComponent(data.url)}&preview=true\`;
      
      // Determine video orientation layout based on aspect ratio from title/video details
      if (data.width && data.height && data.width < data.height) {
        videoWrapper.classList.add('portrait');
      } else {
        videoWrapper.classList.remove('portrait');
      }
      
      show(previewContainer);
      
      // Setup download handler
      downloadBtn.onclick = () => {
        // Trigger download via proxy to avoid referrer blocking
        const downloadUrl = \`/api/download?url=\${encodeURIComponent(data.url)}&title=\${encodeURIComponent(data.title)}\`;
        window.location.href = downloadUrl;
      };
      
      // Add visual hover effect for download button when active
      downloadBtn.onmouseover = () => {
        downloadBtn.style.background = 'var(--accent-green)';
        downloadBtn.style.borderColor = 'var(--accent-green)';
      };
      downloadBtn.onmouseout = () => {
        downloadBtn.style.background = 'var(--text-primary)';
        downloadBtn.style.borderColor = 'var(--text-primary)';
      };
    }
  </script>
</body>
</html>`;
