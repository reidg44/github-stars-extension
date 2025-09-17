// Root Playwright config for the project's e2e tests
/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: 'e2e',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 }
  }
};
