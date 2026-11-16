// frontend/scripts/generate-combined-report.js — Merges Real E2E and Mock E2E Playwright HTML reports into a unified GitHub Pages portal
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const realReportDir = path.join(rootDir, "playwright-report-real");
const mockReportDir = path.join(rootDir, "playwright-report");
const combinedDir = path.join(rootDir, "combined-report");

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  return true;
}

console.log("📦 Preparing unified Playwright report portal...");

// 1. Clean / create combined-report directory
if (fs.existsSync(combinedDir)) {
  fs.rmSync(combinedDir, { recursive: true, force: true });
}
fs.mkdirSync(combinedDir, { recursive: true });

// 2. Copy Real E2E Report
const hasReal = copyDirSync(realReportDir, path.join(combinedDir, "real"));
console.log(hasReal ? "✅ Copied Real Backend E2E report to combined-report/real/" : "⚠️ Real E2E report not found at " + realReportDir);

// 3. Copy Mock E2E Report
const hasMock = copyDirSync(mockReportDir, path.join(combinedDir, "mock"));
console.log(hasMock ? "✅ Copied Mock E2E report to combined-report/mock/" : "⚠️ Mock E2E report not found at " + mockReportDir);

// 4. Generate Portal index.html
const defaultTab = hasReal ? "real" : "mock";

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SuperMart POS — Playwright Test Reports</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0f141c;
      --card-bg: #171f2c;
      --border: #232f42;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-dark: #0284c7;
      --accent-glow: rgba(56, 189, 248, 0.15);
      --success: #34d399;
      --success-glow: rgba(52, 211, 153, 0.15);
      --font: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* Top Navigation Bar */
    header {
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      z-index: 10;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-logo {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: #0f172a;
      font-size: 16px;
    }

    .brand-title {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .brand-subtitle {
      font-size: 11.5px;
      color: var(--text-muted);
    }

    /* Tab Switcher */
    .tabs {
      display: flex;
      background: #0b0f17;
      padding: 4px;
      border-radius: 10px;
      border: 1px solid var(--border);
      gap: 4px;
    }

    .tab-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 7px 14px;
      border-radius: 7px;
      font-family: var(--font);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none;
    }

    .tab-btn:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.05);
    }

    .tab-btn.active {
      color: #0f172a;
      background: var(--accent);
      font-weight: 600;
      box-shadow: 0 0 12px var(--accent-glow);
    }

    .badge {
      font-size: 10.5px;
      padding: 2px 7px;
      border-radius: 9999px;
      font-family: var(--font-mono);
      font-weight: 600;
      background: rgba(0, 0, 0, 0.2);
    }

    .tab-btn.active .badge {
      background: rgba(15, 23, 42, 0.25);
      color: #0f172a;
    }

    /* Actions */
    .actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .btn-action {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 7px;
      font-size: 12.5px;
      font-family: var(--font);
      font-weight: 500;
      color: var(--text);
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      text-decoration: none;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-action:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: #3b4d6b;
    }

    /* Frame Container */
    #report-frame {
      flex: 1;
      width: 100%;
      height: 100%;
      border: none;
      background: #ffffff;
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: var(--text-muted);
      font-size: 14px;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-logo">SM</div>
      <div>
        <div class="brand-title">SuperMart POS · Playwright E2E Reports</div>
        <div class="brand-subtitle">Branch: <code>dev</code> · Automated CI/CD Report Hub</div>
      </div>
    </div>

    <div class="tabs">
      <button id="tab-real" class="tab-btn ${defaultTab === "real" ? "active" : ""}" onclick="switchReport('real')">
        <span>🚀 Real Backend E2E</span>
        <span class="badge">MySQL + Express</span>
      </button>
      <button id="tab-mock" class="tab-btn ${defaultTab === "mock" ? "active" : ""}" onclick="switchReport('mock')">
        <span>🧪 Mock E2E</span>
        <span class="badge">Isolated UI</span>
      </button>
    </div>

    <div class="actions">
      <a id="btn-fullscreen" class="btn-action" href="./${defaultTab}/index.html" target="_blank" rel="noopener">
        <span>Open in Full Page</span> ↗
      </a>
    </div>
  </header>

  <iframe id="report-frame" src="./${defaultTab}/index.html" title="Playwright Test Report"></iframe>

  <script>
    function switchReport(type) {
      document.getElementById('tab-real').classList.toggle('active', type === 'real');
      document.getElementById('tab-mock').classList.toggle('active', type === 'mock');
      
      const frame = document.getElementById('report-frame');
      const fullscreenBtn = document.getElementById('btn-fullscreen');
      const url = './' + type + '/index.html';
      
      frame.src = url;
      fullscreenBtn.href = url;
      
      if (history.replaceState) {
        history.replaceState(null, '', '#' + type);
      }
    }

    // Hash navigation on load
    window.addEventListener('DOMContentLoaded', () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'real' || hash === 'mock') {
        switchReport(hash);
      }
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(combinedDir, "index.html"), htmlContent, "utf8");
console.log("🎉 Combined Playwright portal created at frontend/combined-report/index.html!");
