import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Repository hygiene guards (QA). Regression test for BUG-2: the Android/iOS workflows write
 * `tower-clash/.env.production` from repository secrets (store keys, ad unit ids); Vite also
 * reads that file locally, so it must stay ignored or a developer can commit live keys.
 */
const GITIGNORE = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

describe('tower-clash/.gitignore (BUG-2)', () => {
  it('ignores the env files CI writes from secrets', () => {
    expect(GITIGNORE).toContain('.env.production');
    expect(GITIGNORE).toContain('.env*.local');
  });

  it('ignores build and test artefacts', () => {
    for (const entry of ['node_modules', 'dist', 'test-results', 'playwright-report']) expect(GITIGNORE).toContain(entry);
  });
});

/*
 * Regression test for BUG-6: a screenshot scratch file (`e2e/look2.tmp.spec.ts`, no assertions,
 * absolute output path) sat in Playwright's testDir and would have run in CI on the first
 * `git add -A`. Scratch specs belong in the session scratchpad; everything under e2e/ is a test.
 */
const E2E_DIR = new URL('../../e2e/', import.meta.url);
const E2E_SPECS = readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.ts'));

describe('tower-clash/e2e (BUG-6)', () => {
  it('holds no scratch / temporary specs', () => {
    expect(E2E_SPECS.filter((f) => /\.(tmp|scratch|wip|local)\.spec\.ts$/.test(f))).toEqual([]);
    expect(E2E_SPECS.length).toBeGreaterThanOrEqual(6); // smoke, content, economy, perf, webview, tutorial
  });

  it('every spec asserts something', () => {
    for (const f of E2E_SPECS) {
      const src = readFileSync(new URL(f, E2E_DIR), 'utf8');
      expect(src, `${f} has no expect()`).toMatch(/\bexpect(\.poll|\.soft)?\(/);
      expect(src, `${f} hard-codes an absolute output path`).not.toMatch(/['"`]\/(tmp|home|Users)\//);
    }
  });
});

/*
 * Regression test for BUG-16: `e2e/weekly.spec.ts` "RETRY / restart after the Monday rollover" sat on
 * `keyboard.press('r')` until the 90 s test timeout — the renderer's main thread stopped answering
 * input, `evaluate` and its own network events on a level-chunk `import()` routed through
 * public/sw.js (the worker claims every e2e page ~150 ms after boot and serves the lazy chunks from
 * its cache-first handler). Two guards in playwright.config.ts: no service worker in the e2e
 * suite (nothing tests it; the lazy specs already blocked it), and bounded per-step budgets so a
 * stall fails in seconds naming its step instead of eating the test budget.
 */
const PW_CONFIG = readFileSync(new URL('../../playwright.config.ts', import.meta.url), 'utf8');
const pwNumber = (key: string): number => {
  const m = new RegExp(`${key}:\\s*([\\d_]+)`).exec(PW_CONFIG);
  return m ? Number(m[1]!.replace(/_/g, '')) : NaN;
};

describe('tower-clash/playwright.config.ts (BUG-16)', () => {
  it('blocks service workers for every project', () => {
    const use = /\n  use: \{([\s\S]*?)\n  \},/.exec(PW_CONFIG)?.[1] ?? '';
    expect(use).toMatch(/serviceWorkers:\s*'block'/);
  });

  it('bounds actions, navigations and expect polls well under the test timeout', () => {
    const testTimeout = pwNumber('timeout');
    expect(testTimeout).toBeGreaterThanOrEqual(60_000);
    for (const key of ['actionTimeout', 'navigationTimeout']) {
      const v = pwNumber(key);
      expect(v, key).toBeGreaterThanOrEqual(10_000);
      expect(v, key).toBeLessThanOrEqual(30_000);
    }
    const expectTimeout = Number(/expect:\s*\{\s*timeout:\s*([\d_]+)/.exec(PW_CONFIG)?.[1]?.replace(/_/g, ''));
    expect(expectTimeout).toBeGreaterThanOrEqual(10_000);
    expect(expectTimeout).toBeLessThanOrEqual(20_000);
  });
});
