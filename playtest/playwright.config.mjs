import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { webkit } from 'playwright';

function canLaunchWebkit() {
  let executablePath;
  try {
    executablePath = webkit.executablePath();
  } catch (_) {
    return false;
  }
  if (!existsSync(executablePath)) return false;

  try {
    const libraries = execFileSync('ldd', [executablePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return !/not found/.test(libraries);
  } catch (_) {
    return false;
  }
}

const skipWebkit = process.env.PLAYWRIGHT_SKIP_WEBKIT === '1';
const forceWebkit = process.env.PLAYWRIGHT_FORCE_WEBKIT === '1';
const webkitAvailable = !skipWebkit && (forceWebkit || canLaunchWebkit());

if (skipWebkit) {
  process.stderr.write('Playwright: mobile-webkit skipped by PLAYWRIGHT_SKIP_WEBKIT=1.\n');
} else if (!webkitAvailable) {
  process.stderr.write('Playwright: mobile-webkit skipped because WebKit is unavailable (missing browser or system libraries); nothing was installed.\n');
}

export default defineConfig({
  testDir: '.',
  timeout: 15 * 60 * 1000,
  workers: 1,
  use: { baseURL: process.env.BASE_URL || 'http://127.0.0.1:8777' },
  projects: [
    ...(webkitAvailable ? [{
      name: 'mobile-webkit',
      testIgnore: /journey\.spec\.mjs$/,
      use: { ...devices['iPhone 13'], browserName: 'webkit', hasTouch: true },
    }] : []),
    {
      name: 'chromium-fallback',
      testIgnore: /journey\.spec\.mjs$/,
      use: { ...devices['iPhone 13'], browserName: 'chromium', hasTouch: true },
    },
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
