import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

/**
 * QA-6: the preview serves a snapshot of dist/, never dist/ itself. Agents share one checkout and a
 * parallel `npm run build` / `npm run e2e` rewrites dist/ with fresh content hashes mid-run: a page
 * that booted on the old index.html then 404s on every lazy chunk (2026-09-25 trace under load:
 * `lazyScreens-BffMi0Eb.js?r=…` → 404 right after dist/ became `lazyScreens-Dtx9ipZ5.js`; the lazy
 * "menu chunk" and the smoke "language" tests failed), and a boot that lands inside the rewrite
 * window finds no `index-*.js` and never comes up — the silent 90 s timeouts seen on lazy.spec.
 * The copy is taken by the web-server command, i.e. once per server start, before any test. It is
 * keyed by port under the OS temp dir (≈ 5 MB): a second run that attaches to a running server
 * (`reuseExistingServer`, local only) sees the same files that server has served all along, and no
 * run's 'clear output' can delete another's snapshot. Whatever happens to dist/ meanwhile, a running
 * suite keeps serving the build it started with.
 */
const DIST_SNAPSHOT = path.join(os.tmpdir(), 'tower-clash-e2e', String(PORT), 'dist');
const PREVIEW_COMMAND = [
  `test -d dist || { echo 'e2e: no dist/ — run npm run build first' >&2; exit 1; }`,
  `rm -rf "${DIST_SNAPSHOT}"`,
  `mkdir -p "${DIST_SNAPSHOT}"`,
  `cp -R dist/. "${DIST_SNAPSHOT}"`,
  `npm run preview -- --outDir "${DIST_SNAPSHOT}" --port ${PORT} --strictPort`,
].join(' && ');

export default defineConfig({
  testDir: 'e2e',
  outputDir: OUTPUT_DIR,
  timeout: 90_000,
  /**
   * BUG-16: bounded per-step budgets, so a stalled step fails in seconds naming itself (e.g.
   * "keyboard.press: Timeout 20000ms exceeded") instead of silently eating the 90 s test budget.
   * Every legitimately long wait in e2e/ carries its own explicit timeout (`expect.poll` up to
   * 75 s for the ×10 autoplay wins, `waitForFunction` 20 s, `waitForResponse` 15 s); what these
   * defaults bound are boot `waitForFunction`s, `page.goto`, clicks / key presses and screenshots,
   * all sub-second under load. `page.evaluate` has no timeout of its own and stays on the test budget.
   */
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions,
    trace: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 20_000,
    /**
     * BUG-16: no test exercises public/sw.js (smoke only fetches it with `page.request`), yet with
     * the default 'allow' it installs on every boot, claims the page ~150 ms in, and from then on
     * serves every lazy chunk (`import()`) from its cache-first handler while Playwright's
     * DevTools auto-attach (`waitForDebuggerOnStart`) is wired to it. Both recorded renderer
     * hangs (weekly `keyboard.press('r')` 2026-09-25, and the same signature on a level-map load in
     * the 2026-09-26 boot rig, on another build) sat on a level chunk `import()` routed through the
     * worker that was never answered while the page's main thread stopped acknowledging input,
     * `evaluate` and its own network events. The lazy specs already blocked the worker for the
     * same determinism; this makes the whole suite fetch straight from the preview server.
     */
    serviceWorkers: 'block',
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
    command: PREVIEW_COMMAND,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
});
