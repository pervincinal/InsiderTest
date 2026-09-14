import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: /look2\.tmp\.spec\.ts/,
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4188',
    ...devices['Pixel 5'],
    deviceScaleFactor: 2,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' },
  },
  reporter: [['list']],
});
