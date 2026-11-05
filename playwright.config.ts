import { defineConfig } from '@playwright/test';

/**
 * Web smoke test (D1): serves the example app's web export, built by
 * `yarn build:web-example`, and checks the rendered fixtures in Chromium.
 */
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
  },
  webServer: {
    command: `node scripts/serve-static.mjs example/dist-web ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
