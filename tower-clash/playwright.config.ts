import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Locally the sandbox ships Chromium 1194 under /opt/pw-browsers while @playwright/test 1.47.2
 * expects build 1134, so we point straight at the binary. In CI the path does not exist and
 * `npx playwright install --with-deps chromium` provides the matching browser instead.
 */
const LOCAL_HEADLESS_SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const launchOptions = existsSync(LOCAL_HEADLESS_SHELL) ? { executablePath: LOCAL_HEADLESS_SHELL } : {};

/**
 * Android WebView user agent: the stock Pixel 7 Chrome UA with the `; wv` marker Android adds
 * inside the platform parentheses and the `Version/4.0` token every WebView carries. This is
 * what the Capacitor shell reports, so `; wv)` sniffing in the game (if any) sees the real thing.
 */
const WEBVIEW_UA = devices['Pixel 7'].userAgent
  .replace(') AppleWebKit', ' Build/UP1A.231105.001; wv) AppleWebKit')
  .replace(' Chrome/', ' Version/4.0 Chrome/');

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // Default project: `npm run e2e` (smoke, content, economy, perf). Mobile-sized Chromium.
      name: 'chromium',
      use: { ...devices['Pixel 5'] },
      testIgnore: /webview\.spec\.ts$/,
    },
    {
      // Android WebView emulation: `npm run e2e:webview` (QA-1). Pixel 7 metrics, WebView UA,
      // touch input. Only e2e/webview.spec.ts runs here so the default run stays as fast as before.
      name: 'android-webview',
      use: { ...devices['Pixel 7'], userAgent: WEBVIEW_UA, isMobile: true, hasTouch: true },
      testMatch: /webview\.spec\.ts$/,
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
});
