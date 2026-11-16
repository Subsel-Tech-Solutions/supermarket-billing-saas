// playwright.real.config.js — Dedicated Playwright configuration for Real Backend E2E integration testing
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e-real",
  fullyParallel: false, // Run sequentially: tests depend on transactional state progression
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-real", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  globalSetup: require.resolve("./e2e-real/helpers/globalSetup.js"),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node server.js",
      cwd: "../backend",
      url: "http://127.0.0.1:5000/api/health",
      reuseExistingServer: false,
      timeout: 45_000,
      env: {
        E2E_MODE: "true",
        PORT: "5000",
        NODE_ENV: "development",
        DB_NAME: "supermart_test_master",
        DB_USER: "supermart_e2e",
        DB_PASSWORD: "E2eSecurePass_2026!",
        TENANT_DB_PREFIX: "sm_test_shop_",
        DISABLE_RATE_LIMIT: "true",
      },
    },
    {
      command: "npm start",
      cwd: ".",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        BROWSER: "none",
        CI: "true",
        HOST: "127.0.0.1",
        PORT: "3000",
      },
    },
  ],
});
