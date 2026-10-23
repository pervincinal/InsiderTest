import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { onBlock, readWorkflow, runBlocks, stepText } from '../workflowYaml';
import { NAIVE_TIE_EXEMPT } from '../../scripts/lib/naivePlayer';

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
// Recursive (QA-26: the level content suite lives in e2e/integrity/), as paths relative to e2e/.
const E2E_SPECS = readdirSync(E2E_DIR, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.spec.ts'))
  .sort();

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
  it('blocks service workers by default', () => {
    const use = /\n  use: \{([\s\S]*?)\n  \},/.exec(PW_CONFIG)?.[1] ?? '';
    expect(use).toMatch(/serviceWorkers:\s*'block'/);
    expect(pwNumber('retries'), 'no retries outside the pwa project').toBe(0);
  });

  /*
   * QA-8: the PWA offline path is the one thing that needs the worker, so exactly one project
   * (`pwa`, e2e/pwa.spec.ts only) allows it — with the worker network-emulation flag the spec's
   * `setOffline` depends on, one retry for the BUG-16 stall, and its own output folder — and the
   * default project must not pick that spec up.
   */
  it('allows service workers in the pwa project only (QA-8)', () => {
    const projects = /\n  projects: \[([\s\S]*?)\n  \],/.exec(PW_CONFIG)?.[1] ?? '';
    const blocks = projects.split(/\n    \{\n/).filter((p) => p.trim());
    const allowing = blocks.filter((p) => /serviceWorkers:\s*'allow'/.test(p));
    expect(allowing).toHaveLength(1);
    const pwa = allowing[0]!;
    expect(pwa).toMatch(/name:\s*'pwa'/);
    expect(pwa).toMatch(/testMatch:\s*\/pwa\\\.spec\\\.ts\$\//);
    expect(pwa).toMatch(/retries:\s*1\b/);
    expect(pwa).toMatch(/outputDir:\s*path\.join\(OUTPUT_DIR,\s*'pwa'\)/);
    expect(blocks.filter((p) => /retries:/.test(p))).toHaveLength(1);
    const chromium = blocks.find((p) => /name:\s*'chromium'/.test(p)) ?? '';
    expect(chromium).toMatch(/testIgnore:\s*\/\(webview\|pwa\)\\\.spec\\\.ts\$\//);
    expect(PW_CONFIG).toMatch(/process\.env\.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS \?\?= '1'/);
    expect(E2E_SPECS).toContain('pwa.spec.ts');
    expect(readFileSync(new URL('pwa.spec.ts', E2E_DIR), 'utf8')).toMatch(/test\.use\(\{ serviceWorkers: 'allow' \}\)/);
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

/*
 * Regression test for BUG-25: the share toasts ("Shared" / "Saved") live 2.4 s of page wall clock,
 * and a one-shot `getToast()` read several protocol round-trips after the share resolved (each
 * carrying the ~1 MB base64 PNG) found the toast already gone under load. share.spec.ts must keep
 * recording toasts page-side and poll only a boolean for the captured payload.
 */
describe('tower-clash/e2e/share.spec.ts (BUG-25)', () => {
  const SHARE_SPEC = readFileSync(new URL('share.spec.ts', E2E_DIR), 'utf8');

  it('asserts the share toasts from the page-side recorder, never a one-shot getToast() read', () => {
    expect(SHARE_SPEC).toMatch(/await recordToasts\(page\);\n\s*await page\.goto\('\/'\)/);
    expect(SHARE_SPEC).not.toMatch(/expect\(await page\.evaluate\(\(\) => window\.__towerclash\.getToast\(\)\)\)/);
    for (const text of ['Shared', 'Saved']) expect(SHARE_SPEC).toContain(`expect.poll(() => toastsSeen(page), { message: 'the "${text}" toast went up (BUG-25)' }).toContain('${text}')`);
  });

  it('polls a boolean for the captured share payload, not the PNG itself', () => {
    expect(SHARE_SPEC).not.toMatch(/expect\.poll\(\(\) => page\.evaluate\(\(\) => window\.__shareCaptured \?\? null\)/);
  });
});

/*
 * QA-20: the e2e suite stays green under load without retries. Three guards:
 * - Toasts are read from the page-side recorder (e2e/helpers/toasts.ts, BUG-25 generalised): a
 *   one-shot `getToast()` read races the toast's 2.4–3.5 s wall-clock life. The only other
 *   `getToast()` call allowed is stalemate.spec.ts's `probe`, which samples the toast together with
 *   the sim time inside one evaluate and is polled for the whole match (a negative check).
 * - Taps go through e2e/helpers/tap.ts, which reads the client point inside a requestAnimationFrame
 *   callback: the shop builds its hit regions while drawing, and a tap before its first frame was
 *   dropped (economy.spec.ts "booster crate", 2026-10-10: 15 s poll timeout → 17.1 s failure).
 * - No fixed sleep above 1000 ms without a same-line `// ok:` reason (a wall-clock animation before a
 *   screenshot, a Date.now() back-off) — anything else must poll the state it waits for.
 */
const E2E_HELPERS_DIR = new URL('helpers/', E2E_DIR);
const E2E_FILES: { name: string; src: string }[] = [
  ...E2E_SPECS.map((f) => ({ name: f, src: readFileSync(new URL(f, E2E_DIR), 'utf8') })),
  ...readdirSync(E2E_HELPERS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ name: `helpers/${f}`, src: readFileSync(new URL(f, E2E_HELPERS_DIR), 'utf8') })),
];
/** Source lines without comment-only lines (`//`, `/*`, ` *`), with their 1-based numbers. */
const codeLines = (src: string): { n: number; line: string }[] =>
  src
    .split('\n')
    .map((line, i) => ({ n: i + 1, line }))
    .filter(({ line }) => !/^\s*(\/\/|\/\*|\*)/.test(line));

describe('tower-clash/e2e load tolerance (QA-20)', () => {
  it('no one-shot getToast() read outside e2e/helpers/toasts.ts', () => {
    const oneShot = /evaluate\(\s*\(\)\s*=>\s*window\.__towerclash\.getToast\(\)\s*\)/;
    const offenders: string[] = [];
    for (const { name, src } of E2E_FILES) {
      if (name === 'helpers/toasts.ts') continue;
      for (const { n, line } of codeLines(src)) {
        if (oneShot.test(line)) offenders.push(`${name}:${n}`);
        else if (/\.getToast\(\)/.test(line) && name !== 'stalemate.spec.ts') offenders.push(`${name}:${n} (getToast() call)`);
      }
    }
    expect(offenders, 'read toasts with expectToast / toastsSeen from e2e/helpers/toasts.ts').toEqual([]);
    expect(E2E_FILES.find((f) => f.name === 'helpers/toasts.ts')?.src).toMatch(/setInterval\(/);
  });

  it('every spec that reads the toast recorder installs it (toastsSeen throws at run time when it was not installed before boot)', () => {
    for (const { name, src } of E2E_FILES.filter((f) => /from '\.\/helpers\/toasts'/.test(f.src))) {
      expect(src, `${name} imports the recorder but never installs it`).toContain('await recordToasts(page);');
    }
    expect(E2E_FILES.find((f) => f.name === 'helpers/toasts.ts')?.src).toMatch(/throw new Error\('toastsSeen: recordToasts\(page\) was not installed/);
  });

  it('the specs the BUG-25 row listed assert toasts from the recorder', () => {
    for (const f of ['daily.spec.ts', 'weekly.spec.ts', 'lazy.spec.ts', 'weeklyMilestones.spec.ts', 'share.spec.ts', 'pwa.spec.ts']) {
      expect(E2E_FILES.find((x) => x.name === f)?.src, f).toMatch(/import \{[^}]*\brecordToasts\b[^}]*\} from '\.\/helpers\/toasts'/);
    }
  });

  it('no waitForTimeout above 1000 ms (or with a computed duration) without a same-line `// ok:` reason', () => {
    const offenders: string[] = [];
    for (const { name, src } of E2E_FILES) {
      for (const { n, line } of codeLines(src)) {
        for (const m of line.matchAll(/waitForTimeout\(([^)]*)\)/g)) {
          const arg = m[1]!.trim();
          const ms = /^[\d_]+$/.test(arg) ? Number(arg.replace(/_/g, '')) : NaN;
          if ((Number.isNaN(ms) || ms > 1000) && !/\/\/ ok: \S/.test(line)) offenders.push(`${name}:${n} waitForTimeout(${arg})`);
        }
      }
    }
    expect(offenders, 'poll the state instead, or justify the sleep with `// ok: <reason>` on the same line').toEqual([]);
  });

  it('taps are frame-synced: no spec defines its own tapRect / tapAt, the tapping specs import e2e/helpers/tap.ts', () => {
    const local = E2E_FILES.filter((f) => f.name.endsWith('.spec.ts') && /(async )?function (tapRect|tapAt)\(/.test(f.src)).map((f) => f.name);
    expect(local).toEqual([]);
    for (const f of ['economy.spec.ts', 'shopNoStore.spec.ts', 'smoke.spec.ts', 'tapSync.spec.ts']) {
      expect(E2E_FILES.find((x) => x.name === f)?.src, f).toMatch(/from '\.\/helpers\/tap'/);
    }
    const tap = E2E_FILES.find((f) => f.name === 'helpers/tap.ts')?.src ?? '';
    // FE-11: the frame-synced conversion goes through the current screen's band mapping (layoutToClient = toClient off the menus)
    expect(tap).toMatch(/requestAnimationFrame\(\(\) => resolve\(window\.__towerclash\.layoutToClient\(x, y\)\)\)/);
  });

  it('the preview serves a dist snapshot checked for completeness, never a bare cp of dist/', () => {
    // QA-28: the source build is `PW_DIST` (default dist/), so an agent can test its own scratch build
    expect(PW_CONFIG).toMatch(/\nconst DIST_DIR = process\.env\.PW_DIST \|\| 'dist';\n/);
    expect(PW_CONFIG).toMatch(/node e2e\/tools\/snapshotDist\.mjs "\$\{DIST_DIR\}" "\$\{DIST_SNAPSHOT\}" --attempts \d+ --delay-ms \d+/);
    expect(PW_CONFIG).not.toMatch(/cp -R dist\//);
  });
});

/*
 * QA-28 (2026-10-18): Day 32's chromium, pwa and WebView runs started in parallel without PW_OUTPUT all
 * wrote to test-results/; each run's "clear output" step deleted the others' artefacts and three tests died
 * with `ENOENT … .playwright-artifacts-N/….zip`. The config takes e2e/tools/runLock.ts's lock on the
 * resolved output directory in the runner process (workers carry TEST_WORKER_INDEX) at load time — before
 * "clear output", which a globalSetup would only run after — and a second live run on the same directory
 * fails fast naming PW_OUTPUT. The lock sits outside the output dir (the clear would delete it), is taken
 * with an exclusive create, released on exit, and a stale one is taken over (tests/scripts/runLock.test.ts).
 */
describe('tower-clash/playwright.config.ts run lock (QA-28)', () => {
  it('the runner takes the output-dir lock before defineConfig, and only the runner', () => {
    expect(PW_CONFIG).toMatch(/\nimport \{ acquireRunLock, releaseRunLock \} from '\.\/e2e\/tools\/runLock';\n/);
    const guard = /\nif \(process\.env\.TEST_WORKER_INDEX === undefined\) \{\n([\s\S]*?)\n\}\n/.exec(PW_CONFIG)?.[1] ?? '';
    expect(guard).toMatch(/const outputDir = path\.resolve\(fileURLToPath\(new URL\('\.', import\.meta\.url\)\), OUTPUT_DIR\);/);
    expect(guard).toMatch(/\n {2}acquireRunLock\(outputDir\);/);
    expect(guard).toMatch(/process\.once\('exit', \(\) => releaseRunLock\(outputDir\)\);/);
    expect(PW_CONFIG.indexOf('acquireRunLock(outputDir)')).toBeGreaterThan(PW_CONFIG.indexOf("const OUTPUT_DIR = process.env.PW_OUTPUT || 'test-results';"));
    expect(PW_CONFIG.indexOf('acquireRunLock(outputDir)')).toBeLessThan(PW_CONFIG.indexOf('export default defineConfig('));
    // no globalSetup / globalTeardown marker: it would run after "clear output" and live inside the cleared dir
    expect(PW_CONFIG).not.toMatch(/\bglobal(Setup|Teardown):/);
  });

  it('the lock lives outside the output dir, is exclusive, names PW_OUTPUT, and ignores dead or recycled pids', () => {
    const src = readFileSync(new URL('../../e2e/tools/runLock.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/export const DEFAULT_LOCK_DIR = path\.join\(os\.tmpdir\(\), 'tower-clash-e2e', 'locks'\);/);
    expect(src).toContain("openSync(file, 'wx')");
    expect(src).toMatch(/PW_OUTPUT=<scratch>\/pw-<name> PW_PORT=<free port>/);
    expect(src).toMatch(/if \(owner && isLive\(owner\.pid\)\) throw new Error\(lockedMessage\(outputDir, owner, file\)\);/);
    expect(src).toMatch(/\/playwright\/i\.test\(readFileSync\(cmdline, 'utf8'\)\)/);
  });

  it('the daily sprint verification step gives every Playwright invocation its own PW_PORT and PW_OUTPUT', () => {
    const skill = readFileSync(new URL('../../../.claude/skills/daily-sprint/SKILL.md', import.meta.url), 'utf8');
    expect(skill).toMatch(/every Playwright invocation gets its own `PW_PORT` and `PW_OUTPUT`, parallel ones included/);
  });
});

/*
 * BUG-47 / BUG-48 (2026-10-16): two e2e failure modes that only showed on a loaded host.
 * - BUG-47: perf.spec.ts gated rAF wall-clock intervals (level-50 median 66.6 ms, title 50.05 ms at host
 *   load 9–15, never idle). The frame gates now read the page's own main-thread work per frame from CDP
 *   `Performance.getMetrics` on the thread-CPU clock (`timeDomain: 'threadTicks'`), over the frames whose
 *   rAF timestamps fall inside the metrics window; the wall-clock interval is only reported.
 * - BUG-48: shopLayout.spec.ts's 412×915 helmet-card tests booted twice under their own 45 s budget
 *   (24–26 s idle → over 45 s at load 12–15). Split per palette; a per-test budget below the suite's
 *   must say on its line what it was measured at, so the next one is sized against a number.
 */
describe('tower-clash/e2e host-load independence (BUG-47, BUG-48)', () => {
  it('perf.spec.ts gates main-thread work per frame (CDP thread-CPU metrics), never the wall-clock frame interval', () => {
    const src = E2E_FILES.find((f) => f.name === 'perf.spec.ts')?.src ?? '';
    expect(src).toContain("cdp.send('Performance.enable', { timeDomain: 'threadTicks' })");
    expect(src).toContain("work: per('TaskDuration')");
    // frames are matched to the metrics window by timestamp, not counted by a sampler that starts after it
    expect(src).toMatch(/const lo = m0\.Timestamp! \* 1000 - nav;/);
    expect(src).toMatch(/expect\(f\.work, summary\)\.toBeLessThanOrEqual\(budget\)/);
    // the three frame samples (level 50 x10, title, shop) all go through the work gate
    expect([...src.matchAll(/expectFrameWork\(f, MIN_FRAMES\.(play|screen), summary, host\)/g)]).toHaveLength(3);
    const code = codeLines(src).map((l) => l.line).join('\n');
    expect(code, 'a wall-clock interval (rAF deltas) feeds an assertion').not.toMatch(/expect\([^;]*\b(deltas|med|p95)\b[^;]*\)\.toBeLessThan/);
  });

  /*
   * QA-27 (2026-10-17): the level-50 "worst case" sample ran at x10 on an unseeded match the bot wins in
   * 40–89 s sim (4–9 s wall), so its tail was the result screen. It now replays a fixed seed at x5 (seed 1:
   * won at 88.6 s sim; the window covers ≤ 60 s of it), every frame is checked to be on `play`, and the
   * screen after the sample must still be `play`.
   */
  it('perf.spec.ts samples level 50 on play frames only (fixed seed, x5, stayOn play, still play after)', () => {
    const src = E2E_FILES.find((f) => f.name === 'perf.spec.ts')?.src ?? '';
    expect(src).toMatch(/\nconst PLAY_SEED = \d+;/);
    const speed = Number(/\nconst PLAY_SPEED = (\d+);/.exec(src)?.[1] ?? NaN);
    // 8 s x speed of sim must stay well inside the seed's 88.6 s win (and 120 frames x the 10-tick cap = 60 s)
    expect(speed).toBeGreaterThan(0);
    expect(speed).toBeLessThanOrEqual(5);
    expect(src).toMatch(/tc\.setSpeed\(speed\);\s*const started = tc\.loadLevel\(id, seed\);\s*tc\.autoplay\(\);/);
    expect(src).toContain("const f = await sampleFrames(page, SAMPLE_MS, MIN_FRAMES.play, { stayOn: 'play' });");
    // the sampler ends at the first frame off the screen it guards
    expect(src).toMatch(/if \(stayOn && screen !== stayOn\) return resolve\(\{ left: screen, units \}\);/);
    expect(src).toContain('expect(f.left, `every sampled frame is on the play screen — ${summary}`).toBeNull();');
    expect(src).toContain("expect(screenAfter, `the match is still running after the sample — ${summary}`).toBe('play');");
  });

  /*
   * BUG-55 (2026-10-23): the thread-CPU work per frame scales with the host's raster speed (title idle, same
   * code: CI 26.0 ms, Day 37's container 47–52, Day 38's 37–39). Each worker measures a fixed calibration
   * page with the same CDP measure and scales the 50 ms budget by max(1, calib / CALIBRATION_REF_MS) —
   * forced to 1 on CI, where the absolute 50 ms stays authoritative — and a factor above 2.5 skips the
   * sample with an annotation instead of passing it.
   */
  it('perf.spec.ts scales the frame budget by a host calibration: 50 ms floor, 2.5x ceiling (skip), factor 1 on CI (BUG-55)', () => {
    const src = E2E_FILES.find((f) => f.name === 'perf.spec.ts')?.src ?? '';
    expect(src).toMatch(/\nconst FRAME_WORK_BUDGET_MS = 50;/);
    expect(src).toMatch(/\nconst HOST_FACTOR_CEILING = 2\.5;/);
    const ref = Number(/\nconst CALIBRATION_REF_MS = ([\d.]+);/.exec(src)?.[1] ?? NaN);
    expect(ref, 'a measured, positive calibration reference').toBeGreaterThan(0);
    // CI: the factor is forced to 1; elsewhere it never lowers the budget
    expect(src).toContain('const ci = !!process.env.CI;');
    expect(src).toMatch(/function hostFactor\(ratio: number, ci: boolean\): number \{\s*return ci \? 1 : Math\.max\(1, ratio\);\s*\}/);
    expect(src).toMatch(/function frameBudget\(h: HostCalibration\): number \{\s*return FRAME_WORK_BUDGET_MS \* h\.factor;\s*\}/);
    // over the ceiling: skip with an annotation (never a pass), and the gate double-checks the budget's range
    expect(src).toMatch(/if \(h\.factor <= HOST_FACTOR_CEILING\) return;[\s\S]{0,400}?annotations\.push\(\{ type: 'skipped-reason'[\s\S]{0,120}?test\.skip\(true, why\);/);
    expect(src).toContain('.toBeLessThanOrEqual(FRAME_WORK_BUDGET_MS * HOST_FACTOR_CEILING);');
    // every frame test calibrates first and checks the ceiling before it samples; every [perf] line carries the calibration
    expect([...src.matchAll(/const host = await calibrateHost\(page\);\n\s*skipIfHostTooSlow\(host\);/g)]).toHaveLength(3);
    expect(src).toMatch(/const line = `\$\{summary\}; \$\{describeHost\(h\)\}`;\s*console\.log\(`\[perf\] \$\{line\}`\);/);
    expect([...src.matchAll(/report\(summary, host\);/g)]).toHaveLength(4);
    // the calibration workload is code-independent: the spec imports nothing from src/
    expect(src).not.toMatch(/from '\.\.\/src\//);
  });

  it('a test.setTimeout below the suite timeout carries a measured `// ok:` reason on its line', () => {
    const suite = Number(/\n {2}timeout: ([\d_]+),\n/.exec(PW_CONFIG)?.[1]?.replace(/_/g, '') ?? NaN);
    expect(suite).toBe(90_000);
    const offenders: string[] = [];
    let short = 0;
    for (const { name, src } of E2E_FILES) {
      for (const { n, line } of codeLines(src)) {
        for (const m of line.matchAll(/\b(?:test|testInfo|info)\.setTimeout\(([^)]*)\)/g)) {
          const arg = m[1]!.trim();
          const ms = /^[\d_]+$/.test(arg) ? Number(arg.replace(/_/g, '')) : NaN;
          if (!Number.isNaN(ms) && ms >= suite) continue;
          short++;
          // e.g. `// ok: 6.7–10.1 s idle per palette (BUG-48, 2026-10-16)`: a duration in seconds
          if (!/\/\/ ok: .*\d s\b/.test(line)) offenders.push(`${name}:${n} setTimeout(${arg})`);
        }
      }
    }
    expect(short, 'the scan sees the short budgets (shopLayout, shopNoStore, review, perf, ...)').toBeGreaterThanOrEqual(8);
    expect(offenders, 'size a short budget against its measured run time: `// ok: <N s idle ...>` on the same line').toEqual([]);
  });

  it('shopLayout.spec.ts walks one palette per helmet-card test (BUG-48: no second boot inside a test)', () => {
    const src = E2E_FILES.find((f) => f.name === 'shopLayout.spec.ts')?.src ?? '';
    expect(src).toMatch(/for \(const palette of PALETTES\) \{/);
    // the only extra browser context is the language sweep's, one per language
    expect([...src.matchAll(/browser\.newContext\(/g)]).toHaveLength(1);
  });
});

/*
 * QA-17: the chromium e2e step runs on two Playwright workers to stay well inside its 15-minute CI
 * timeout. Parallelism stays at the file level (`fullyParallel: false`: a spec's tests run in
 * order in one worker), with at most 2 workers for the 4-vCPU runner and perf.spec.ts's frame
 * budget, and no retries, so a flaky test fails instead of being hidden.
 */
describe('tower-clash/playwright.config.ts (QA-17)', () => {
  it('parallelises whole spec files on at most two workers, never retrying chromium', () => {
    expect(PW_CONFIG).toMatch(/\n  fullyParallel: false,\n/);
    const workers = pwNumber('workers');
    expect(workers).toBeGreaterThanOrEqual(1);
    expect(workers).toBeLessThanOrEqual(2);
    expect(pwNumber('retries')).toBe(0);
  });
});

/*
 * QA-26: the chromium project (151 tests, 8.5–9.7 min as one step) runs in CI as a two-shard
 * matrix beside the check job. Guards: every test runs exactly once (both shards, chromium nowhere
 * else, the small projects still in `verify`), each shard builds its own dist/ before Playwright
 * starts (the preview serves the snapshotDist.mjs copy of it), gets its own port / output dir,
 * a red shard never cancels the other, and the check-run names the matrix produces are exactly
 * the group scripts/ciStatus.mjs requires together (a renamed or dropped shard would otherwise
 * vanish from the CI line instead of turning it red).
 */
describe('.github/workflows/tower-clash-ci.yml e2e shards (QA-26)', () => {
  const CI = readWorkflow('tower-clash-ci.yml');
  const job = (id: string): string => new RegExp(`\\n  ${id}:\\n([\\s\\S]*?)(?=\\n  [a-z][\\w-]*:\\n|$)`).exec(CI)?.[1] ?? '';
  const runs = (text: string): string[] => runBlocks(text).map((b) => b.run.trim());

  it('the e2e job is a fail-slow 2-shard matrix, parallel to verify, one port and output dir per shard', () => {
    const e2e = job('e2e');
    expect(e2e).toContain('    name: e2e (shard ${{ matrix.shard }}/2)\n');
    expect(e2e).not.toMatch(/\n    needs:/);
    expect(e2e).toContain('      fail-fast: false\n');
    expect(e2e).toContain('          - shard: 1\n            port: 4191\n          - shard: 2\n            port: 4192\n');
    expect(e2e).toContain('      PW_PORT: ${{ matrix.port }}\n');
    expect(e2e).toContain('      PW_OUTPUT: test-results/shard-${{ matrix.shard }}\n');
    const r = runs(e2e);
    const shard = r.indexOf('npx playwright test --project=chromium --shard=${{ matrix.shard }}/2');
    expect(shard).toBeGreaterThan(r.indexOf('npm run build'));
    expect(r.indexOf('npm run build')).toBeGreaterThan(r.indexOf('npm ci'));
    expect(r.indexOf('npm ci')).toBeGreaterThanOrEqual(0);
    expect(e2e).toContain('name: playwright-report-e2e-shard-${{ matrix.shard }}');
  });

  it('chromium runs only in the shards; verify keeps the webview and pwa projects on its own build', () => {
    const verify = job('verify');
    expect(verify).toContain('    name: check + playtest + build + e2e\n');
    const r = runs(verify);
    expect(r.filter((x) => /playwright test|npm run e2e\b/.test(x))).toEqual([
      'npx playwright test --project=android-webview',
      'npx playwright test --project=pwa',
    ]);
    expect(r.indexOf('npx playwright test --project=android-webview')).toBeGreaterThan(r.indexOf('npm run build'));
    expect(runs(CI).filter((x) => x.includes('--project=chromium'))).toHaveLength(1);
  });

  it('--shard=N/2 splits the chromium files with the heavy ones on both sides (content suite in e2e/integrity/)', () => {
    // Playwright 1.47 shards whole files (fullyParallel: false) by test count in path order. Measured
    // serial time per file on 2026-10-15 (mean of two runs, s): camera 232, shopLayout 215, content 157,
    // gestures430 126, shareLocales 112, economy 108, smoke 92, daily 89 — the split below holds
    // ≈ 770 / 780 s; with content.spec.ts at the top of e2e/ (second in path order) it was ≈ 590 / 950.
    // 2026-10-16 (BUG-48): shopLayout 7 → 13 tests (101 / 56, same files per shard), ≈ 100 s serial
    // (one boot per test instead of two), so shard 2 lost ≈ 1.5 min; re-measure before moving files.
    // 2026-10-21 (QA-30, 169 tests: + howto in shard 1, + tones / tutorial / lazy cases in shard 2):
    // 105 / 64 tests, wall 372 / 375 s locally (2 workers per shard), CI 297 / 338 s — no move needed.
    // A failure here means new tests moved the count boundary: re-measure and rebalance (QA-26).
    const cli = fileURLToPath(new URL('../../node_modules/@playwright/test/cli.js', import.meta.url));
    const list = (shard: string): string[] => {
      const r = spawnSync(process.execPath, [cli, 'test', '--project=chromium', '--list', `--shard=${shard}`], {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        encoding: 'utf8',
        env: { ...process.env, CI: '' },
      });
      expect(r.status, r.stderr).toBe(0);
      return [...new Set([...r.stdout.matchAll(/\[chromium\] › (\S+\.spec\.ts):\d+/g)].map((m) => m[1]!))].sort();
    };
    const [one, two] = [list('1/2'), list('2/2')];
    expect(one).toEqual(expect.arrayContaining(['camera.spec.ts', 'gestures430.spec.ts', 'integrity/content.spec.ts', 'economy.spec.ts', 'daily.spec.ts']));
    expect(two).toEqual(expect.arrayContaining(['shopLayout.spec.ts', 'shareLocales.spec.ts', 'smoke.spec.ts', 'lazy.spec.ts', 'weekly.spec.ts']));
    // every chromium spec in exactly one shard
    const chromium = E2E_SPECS.filter((f) => !/(webview|pwa)\.spec\.ts$/.test(f));
    expect([...one, ...two].sort()).toEqual(chromium);
  }, 30_000);

  it('the job names the workflow produces are the group ciStatus.mjs requires together', () => {
    const help = spawnSync(process.execPath, [new URL('../../scripts/ciStatus.mjs', import.meta.url).pathname, '--help'], { encoding: 'utf8' });
    expect(help.status).toBe(0);
    const group = /Required together:\n {2}(.*)\n/.exec(help.stdout)?.[1]?.split(' | ');
    const shards = [...job('e2e').matchAll(/\n {10}- shard: (\d+)\n/g)].map((m) => `e2e (shard ${m[1]}/2)`);
    expect(shards).toEqual(['e2e (shard 1/2)', 'e2e (shard 2/2)']);
    expect(group).toEqual(['check + playtest + build + e2e', ...shards]);
  });
});

/*
 * QA-30: "Naive human gate" gates both GD-7f tie orders on levels 1–16 (`--tie both`; LV-22 fixed
 * level 5's west start on 2026-10-21) with level 3's `tie desc` row exempt (`--tie-exempt 3`): GD-7h
 * cured that start with the tutorial steer, which the naive model never reads. The exempt ids in the
 * step must be exactly NAIVE_TIE_EXEMPT (scripts/lib/naivePlayer.ts, each with its item id) — a future
 * level cured by a tutorial goes into that registry with its item id and onto the step in one change.
 */
describe('.github/workflows/tower-clash-ci.yml naive human gate (QA-3, QA-30)', () => {
  const CI = readWorkflow('tower-clash-ci.yml');
  const NAME = 'Naive human gate (levels 1-16 x 5 seeds)';
  const GATE = 'npm run playtest -- --naive --seeds 5 --gate 1-16 --tie both --tie-exempt 3';

  it('gates 1-16 in both tie orders, exempting exactly the NAIVE_TIE_EXEMPT levels from tie desc', () => {
    expect(runBlocks(CI).filter((b) => b.step === NAME).map((b) => b.run)).toEqual([`${GATE}\n`]);
    const step = stepText(CI, NAME);
    expect(step).not.toMatch(/continue-on-error|\n\s+shell:/);
    const exempt = /--tie-exempt (\S+)/.exec(GATE)![1]!.split(',').map(Number);
    expect(exempt).toEqual(Object.keys(NAIVE_TIE_EXEMPT).map(Number));
    for (const id of exempt) expect(NAIVE_TIE_EXEMPT[id]).toMatch(/^[A-Z]+-\d+[a-z]?: /); // the item id that cured it
  });

  it('the runner wires --tie-exempt: level 3 seed 1 passes exempt, fails on its tie desc row without', () => {
    const tsx = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
    const run = (...extra: string[]) =>
      spawnSync(process.execPath, [tsx, 'scripts/playtest.ts', '--naive', '--level', '3', '--seeds', '1', '--gate', '3-3', '--tie', 'both', ...extra], {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        encoding: 'utf8',
      });
    const exempt = run('--tie-exempt', '3');
    expect(exempt.status, exempt.stdout + exempt.stderr).toBe(0);
    expect(exempt.stdout).toMatch(/\n  exempt lvl 3 Free Real Estate \[tie desc\]: 0\/1 — GD-7h: .*; not gated\n/);
    expect(exempt.stdout).toContain('naive gate lvl 3-3: 0 failed level(s) (asc 0, tie desc 0, tie desc exempt 3)');
    // if this turns 0, level 3's reversed start recovered: drop 3 from NAIVE_TIE_EXEMPT and the CI step
    const plain = run();
    expect(plain.status, plain.stdout).toBe(1);
    expect(plain.stdout).toContain('FAIL lvl 3 Free Real Estate [tie desc]: 0/1');
  }, 30_000);
});

/*
 * Regression test for BUG-26: the `deploy to GitHub Pages` job failed on every push from
 * 2026-09-28 to 2026-10-09 (first "Ensure GitHub Pages has been enabled", then "Branch … is not
 * allowed to deploy to github-pages due to environment protection rules") while the workflow
 * stayed green behind job-level `continue-on-error`. The job may stay continue-on-error (the
 * fix is a stakeholder setting), but its failure must be visible in the run: a separate job — the
 * environment rejection ends `deploy` before any of its steps run — that always runs after a good
 * build, detects "no deployment" from the deploy job's `page_url` output, and writes a
 * `::warning::` annotation plus a step-summary line naming the setting and the privacy URL.
 */
describe('.github/workflows/tower-clash-pages.yml (BUG-26)', () => {
  const PAGES = readFileSync(new URL('../../../.github/workflows/tower-clash-pages.yml', import.meta.url), 'utf8');
  const job = (id: string): string => new RegExp(`\\n  ${id}:\\n([\\s\\S]*?)(?=\\n  [a-z][\\w-]*:\\n|$)`).exec(PAGES)?.[1] ?? '';

  it('the deploy job exposes page_url so a later job can tell whether it deployed', () => {
    const deploy = job('deploy');
    expect(deploy).toContain('name: deploy to GitHub Pages');
    expect(deploy).toMatch(/\n    outputs:\n      page_url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}/);
  });

  it('a status job always runs after the build and flags a failed deploy as a warning and in the summary', () => {
    const status = job('pages-status');
    expect(status).toMatch(/needs: \[build, deploy\]/);
    expect(status).toMatch(/if: \$\{\{ always\(\) && needs\.build\.result == 'success' \}\}/);
    expect(status).not.toContain('continue-on-error');
    expect(status).toContain('PAGE_URL: ${{ needs.deploy.outputs.page_url }}');
    expect(status).toContain('echo "::warning title=GitHub Pages deploy failed (BUG-26)::$msg"');
    expect(status).toContain('echo "$msg" >> "$GITHUB_STEP_SUMMARY"');
    expect(status).toContain(
      'GitHub Pages is NOT enabled — enable it at Settings → Pages (Source: GitHub Actions); the privacy policy URL required by Apple and Google is not live',
    );
    expect(status).toContain('Settings → Environments → github-pages → Deployment branches');
  });
});

/*
 * QA-19: the MM-14 release-lane changes must not regress silently — the team reads only check-run
 * annotations, never job logs, so an xcodebuild / altool call outside `surface`, a logs artifact
 * that is skipped on failure or a lost device hint would hide the next failed build. The helper
 * itself is executed by tests/release/surfaceHelper.test.ts. MM-12 / MM-13 rule: a release
 * workflow starts from its request file, never from a push of its own file (once the secrets
 * exist, editing a workflow must not upload anything).
 */
describe('.github/workflows/tower-clash-ios-release.yml (QA-19, MM-14)', () => {
  const IOS = readWorkflow('tower-clash-ios-release.yml');
  const HELPER = 'Define the log-surfacing helper';

  it('every xcodebuild / xcrun altool call goes through surface (BUG-27), except `xcodebuild -version`', () => {
    const blocks = runBlocks(IOS).filter((b) => b.step !== HELPER);
    expect(blocks.length).toBeGreaterThanOrEqual(20);
    const bare: string[] = [];
    const surfaced: string[] = [];
    for (const { step, run } of blocks) {
      for (const raw of run.split('\n')) {
        // Quoted text is a message, not a call ("retrying with xcodebuild …", "xcodebuild (fallback)"),
        // unless it holds a command substitution: "$(xcodebuild archive …)" is still a call.
        const line = raw
          .trim()
          .replace(/'[^']*'/g, "''")
          .replace(/"(?:[^"\\]|\\.)*"/g, (q) => (q.includes('$(') ? q : '""'));
        if (line.startsWith('#')) continue;
        for (const m of line.matchAll(/\b(xcodebuild|xcrun\s+altool)\b/g)) {
          if (/^xcodebuild -version\b/.test(line.slice(m.index))) continue; // informational, cannot fail on signing
          const before = line.slice(0, m.index);
          if (/(^|\s)surface [\w-]+ $/.test(before)) surfaced.push(`${step}: ${before.trim().split(' ').pop()}`);
          else bare.push(`${step}: ${line}`);
        }
      }
    }
    expect(bare).toEqual([]);
    expect(surfaced.sort()).toEqual(
      [
        'Archive (Release, generic iOS device): archive',
        'Archive (Release, generic iOS device): archive',
        'Export signed .ipa: export',
        'Upload to App Store Connect (altool): upload',
        'Upload to App Store Connect (xcodebuild fallback): upload-fallback',
        'Validate with altool: validate',
      ].sort(),
    );
    for (const { run } of blocks.filter((b) => /\bsurface [\w-]+ (xcodebuild|xcrun)/.test(b.run))) {
      expect(run.startsWith('source "$RUNNER_TEMP/surface.sh"\n')).toBe(true);
    }
    // No line starts with a bare call anywhere in a run block (the plain grep of the backlog item).
    for (const { run } of blocks) expect(run).not.toMatch(/^\s*(xcodebuild (?!-version)|xcrun altool)/m);
  });

  it('the helper step is defined before the first step that sources it', () => {
    const at = (s: string): number => IOS.indexOf(s);
    expect(at(`- name: ${HELPER}`)).toBeGreaterThan(0);
    expect(at(`- name: ${HELPER}`)).toBeLessThan(at('source "$RUNNER_TEMP/surface.sh"'));
  });

  it('the ios-build-logs artifact is uploaded even when a step failed', () => {
    const logs = stepText(IOS, 'Upload build logs artifact');
    expect(logs).toMatch(/\n {8}if: always\(\)\n/);
    expect(logs).toContain('uses: actions/upload-artifact@v4');
    expect(logs).toContain('name: ios-build-logs');
    expect(logs).toContain('path: ${{ runner.temp }}/*.log');
  });

  it('the archive step turns "has no devices" into the "Register one device" annotation and keeps exit 65', () => {
    const archive = stepText(IOS, 'Archive (Release, generic iOS device)');
    expect(archive).toContain('if grep -q "has no devices" "$RUNNER_TEMP/archive.log"; then');
    expect(archive).toMatch(/echo "::error title=Register one device::[^"\n]*Devices -> \+ -> Platform iOS[^"\n]*UDID[^"\n]*ios-release\.request[^"\n]*LAUNCH_CHECKLIST\.md §0b step 5b\."/);
    expect(archive).toMatch(/\n {14}exit 65\n/);
  });
});

describe('release workflows start from their request file, never from their own path (QA-19, MM-12, MM-13)', () => {
  it.each([
    ['tower-clash-ios-release.yml', 'tower-clash/release/ios-release.request'],
    ['tower-clash-ios-store.yml', 'tower-clash/release/ios-store.request'],
    ['tower-clash-android-release.yml', 'tower-clash/release/android-release.request'],
  ])('%s', (file, request) => {
    const on = onBlock(readWorkflow(file));
    expect(on).toContain(`      - '${request}'`);
    expect(on).toContain('      - claude/tower-war-game-plan-weqwpb');
    expect(on).not.toContain(file);
    expect(on).not.toContain('.github/workflows');
    expect(on).not.toMatch(/pull_request|schedule|paths-ignore/);
  });
});
