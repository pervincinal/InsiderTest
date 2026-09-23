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

/**
 * QA-4: parallel agents share one checkout, so each run can pick its own preview port and output
 * directory without a scratch config: `PW_PORT` (default 4173) sets both `baseURL` and the preview
 * server's `--port`; `PW_OUTPUT` (default `test-results`) sets `outputDir` (traces, screenshots on
 * failure). Example: `PW_PORT=4192 PW_OUTPUT=<scratchpad>/pw-qa npx playwright test --project=chromium e2e/smoke.spec.ts`.
 */
const DEFAULT_PORT = 4173;
const PORT = process.env.PW_PORT ? Number(process.env.PW_PORT) : DEFAULT_PORT;
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) throw new Error(`PW_PORT must be a TCP port, got ${String(process.env.PW_PORT)}`);
const OUTPUT_DIR = process.env.PW_OUTPUT || 'test-results';

export default defineConfig({
  testDir: 'e2e',
  outputDir: OUTPUT_DIR,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: `http://localhost:${PORT}`,
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
    command: `npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
});
