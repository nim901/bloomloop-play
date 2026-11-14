import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { webkit } from 'playwright';

const webkitLddDirectories = [
  'minibrowser-gtk',
  join('minibrowser-gtk', 'bin'),
  join('minibrowser-gtk', 'lib'),
  join('minibrowser-gtk', 'sys', 'lib'),
  'minibrowser-wpe',
  join('minibrowser-wpe', 'bin'),
  join('minibrowser-wpe', 'lib'),
  join('minibrowser-wpe', 'sys', 'lib'),
];

function isElf(filePath) {
  let fileDescriptor;
  try {
    const header = Buffer.alloc(4);
    fileDescriptor = openSync(filePath, 'r');
    return readSync(fileDescriptor, header, 0, header.length, 0) === header.length &&
      header.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  } catch (_) {
    return false;
  } finally {
    if (fileDescriptor !== undefined) closeSync(fileDescriptor);
  }
}

function filesToCheck(directoryPath) {
  if (!existsSync(directoryPath) || !statSync(directoryPath).isDirectory()) return [];
  return readdirSync(directoryPath, { withFileTypes: true })
    .filter(entry => entry.isFile() || entry.isSymbolicLink())
    .map(entry => join(directoryPath, entry.name))
    .filter(isElf);
}

function webkitExecutablePath() {
  let executablePath;
  try {
    executablePath = webkit.executablePath();
  } catch (_) {
    return null;
  }
  if (!existsSync(executablePath) || !statSync(executablePath).isFile()) return null;
  const installDir = dirname(executablePath);
  if (!existsSync(installDir) || !statSync(installDir).isDirectory()) return null;
  return { executablePath, installDir };
}

function canLaunchWebkit() {
  const install = webkitExecutablePath();
  if (!install) return false;

  const directories = webkitLddDirectories.map(directory => join(install.installDir, directory));
  const files = directories.flatMap(filesToCheck);
  if (!files.length) return false;

  return files.every(filePath => {
    try {
      const libraries = execFileSync('ldd', [filePath], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: {
          ...process.env,
          LD_LIBRARY_PATH: [
            ...directories,
            process.env.LD_LIBRARY_PATH,
          ].filter(Boolean).join(':'),
        },
      });
      return !/not found/.test(libraries);
    } catch (_) {
      return false;
    }
  });
}

function hasWebkitInstall() {
  return webkitExecutablePath() !== null;
}

const skipWebkit = process.env.PLAYWRIGHT_SKIP_WEBKIT === '1';
const forceWebkit = process.env.PLAYWRIGHT_FORCE_WEBKIT === '1';
const webkitInstalled = !skipWebkit && hasWebkitInstall();
const webkitAvailable = webkitInstalled && (forceWebkit || canLaunchWebkit());

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
