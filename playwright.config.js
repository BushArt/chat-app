const { defineConfig } = require('@playwright/test');

const PORT = process.env.PLAYWRIGHT_PORT || 3456;

module.exports = defineConfig({
  testDir: '__tests__/browser',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node scripts/playwright-server.js',
    url: `http://127.0.0.1:${PORT}/ping`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
