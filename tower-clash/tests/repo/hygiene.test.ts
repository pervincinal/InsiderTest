import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { onBlock, readWorkflow, runBlocks, stepText } from '../workflowYaml';

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
