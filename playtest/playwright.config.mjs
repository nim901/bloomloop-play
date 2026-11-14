import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 15 * 60 * 1000,
  workers: 1,
  use: { baseURL: process.env.BASE_URL || 'http://127.0.0.1:8777' },
  projects: [
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit', hasTouch: true } },
    { name: 'chromium-fallback', use: { ...devices['iPhone 13'], browserName: 'chromium', hasTouch: true } },
    {
      name: 'chromium-iphone-13',
      testMatch: /journey\.spec\.mjs$/,
      use: { ...devices['iPhone 13'], browserName: 'chromium', hasTouch: true },
    },
    {
      name: 'desktop-chromium',
      testMatch: /journey\.spec\.mjs$/,
      use: { ...devices['Desktop Chrome'], browserName: 'chromium', hasTouch: false },
    },
  ],
});
