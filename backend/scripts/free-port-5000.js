// backend/scripts/free-port-5000.js — Automatically frees port 5000 before tests
const { execSync } = require("child_process");

function freePort(port) {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
      const lines = out.split("\n").filter((l) => l.includes("LISTENING"));
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0" && pid !== String(process.pid)) {
          execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
          console.log(`[Auto-Clean] Terminated stale process on port ${port} (PID ${pid})`);
        }
      }
    } else {
      execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: "ignore" });
      console.log(`[Auto-Clean] Freed port ${port}`);
    }
  } catch {
    // Port was already free
  }
}

freePort(5000);
