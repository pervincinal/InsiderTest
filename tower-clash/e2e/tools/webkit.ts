import { existsSync } from 'node:fs';
import { webkit } from '@playwright/test';

/*
 * AUD-Q5 (2026-10-31): the `webkit-iphone` Playwright project (playwright.config.ts) runs e2e/webkit.spec.ts
 * on Playwright's WebKit. This container only has Chromium (/opt/pw-browsers, no `playwright install`
 * allowed), so the project must stay listable here and skip instead of failing; CI installs WebKit in the
 * `e2e (webkit)` job (.github/workflows/tower-clash-ci.yml) and sets `PW_WEBKIT=1`.
 *
 * Gate, one place for the config and the spec:
 *   - `PW_WEBKIT=1` — WebKit is REQUIRED: the tests always run, and a missing browser fails each of them
 *     with Playwright's own "Executable doesn't exist" error. CI can therefore never turn green on a run
 *     that skipped the WebKit tests.
 *   - otherwise the tests run when Playwright's WebKit build is installed where Playwright looks for it
 *     (`webkit.executablePath()`: `$PLAYWRIGHT_BROWSERS_PATH` or ~/.cache/ms-playwright,
 *     `webkit-<build>/pw_run.sh` for @playwright/test 1.47.2), and are skipped with WEBKIT_SKIP_REASON when
 *     it is not. `npx playwright test --list --project=webkit-iphone` lists them either way.
 */

/** iOS 26 Safari on an iPhone, the UA e2e/gestures430.spec.ts uses for the stakeholder's phone (hygiene pins they match). */
export const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

/** `PW_WEBKIT=1`: the run must exercise WebKit (CI). */
export const WEBKIT_REQUIRED = process.env.PW_WEBKIT === '1';

/** Where Playwright expects its WebKit build (it may not exist). */
export function webkitExecutable(): string {
  try {
    return webkit.executablePath();
  } catch {
    return '';
  }
}

/** Playwright's WebKit build is on disk. */
export function webkitInstalled(): boolean {
  const exe = webkitExecutable();
  return exe !== '' && existsSync(exe);
}

/** The WebKit tests run in this process (required, or the browser is there). */
export const WEBKIT_RUNS = WEBKIT_REQUIRED || webkitInstalled();

export const WEBKIT_SKIP_REASON =
  `AUD-Q5: Playwright WebKit is not installed (${webkitExecutable() || 'no path'}); ` +
  'the webkit-iphone project runs in CI (job "e2e (webkit)", PW_WEBKIT=1). Never `playwright install` in the shared container.';
