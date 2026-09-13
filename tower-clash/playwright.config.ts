import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Locally the sandbox ships Chromium 1194 under /opt/pw-browsers while @playwright/test 1.47.2
 * expects build 1134, so we point straight at the binary. In CI the path does not exist and
 * `npx playwright install --with-deps chromium` provides the matching browser instead.
 */
const LOCAL_HEADLESS_SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const launchOptions = existsSync(LOCAL_HEADLESS_SHELL) ? { executablePath: LOCAL_HEADLESS_SHELL } : {};

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
    ...devices['Pixel 5'],
    launchOptions,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
});
