import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * QA-18 / BUG-26: `scripts/ciStatus.mjs` reports CI per job (GitHub check run), not per workflow.
 * The Pages deploy job failed on every push for 11 days behind `continue-on-error` while its
 * workflow stayed green; the Producer read workflow conclusions only. These tests run the real
 * script against a fake `gh` (CI_STATUS_GH=<fake.mjs>) that answers `gh api <path>` from fixtures
 * shaped like the real responses of 2026-10-09 (commits efeb5e7 / b6cbe5a), so no network is used.
 */

const SCRIPT = fileURLToPath(new URL('../../scripts/ciStatus.mjs', import.meta.url));
const SHA = 'efeb5e730f2a81f38549d1d92ae3015065af9606';
const PAGES_404 =
  'Error: Failed to create deployment (status: 404) with build version efeb5e7. Ensure GitHub Pages has been enabled: https://github.com/pervincinal/InsiderTest/settings/pages';
const NO_SECRETS = 'Missing repository secrets: APP_STORE_CONNECT_API_KEY_ID APP_STORE_CONNECT_API_ISSUER_ID';

type Run = { id: number; name: string; status: string; conclusion: string | null };
type Note = { annotation_level: string; message: string; title?: string };
const ok = (id: number, name: string): Run => ({ id, name, status: 'completed', conclusion: 'success' });
const red = (id: number, name: string): Run => ({ id, name, status: 'completed', conclusion: 'failure' });

const GREEN_RUNS = [ok(1, 'check + playtest + build + e2e'), ok(2, 'build web app'), ok(3, 'debug APK')];
const PAGES_RED = red(4, 'deploy to GitHub Pages');
const IOS_LANES = [red(5, 'signed archive + App Store Connect upload'), red(6, 'App Store Connect metadata / review submission')];
const NOTES: Record<number, Note[]> = {
  4: [
    { annotation_level: 'warning', message: 'Node.js 20 is deprecated.' },
    { annotation_level: 'failure', message: `${PAGES_404}\nsecond line` },
    { annotation_level: 'failure', message: 'Creating Pages deployment failed' },
  ],
  // the generic runner line comes first in the real response; the script must skip it
  5: [{ annotation_level: 'failure', message: 'Process completed with exit code 1.' }, { annotation_level: 'failure', message: NO_SECRETS }],
  6: [{ annotation_level: 'failure', message: 'Process completed with exit code 1.' }, { annotation_level: 'failure', message: NO_SECRETS }],
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * A fake `gh` answering `api repos/…/commits/<sha>/check-runs` with `states[call]` (the last state
 * repeats, so a list models a job finishing between polls) and `api repos/…/check-runs/<id>/annotations`.
 * Every requested path is appended to calls.log.
 */
function fakeGh(states: Run[][], notes: Record<number, Note[]> = NOTES): { gh: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'qa-cistatus-'));
  dirs.push(dir);
  const gh = join(dir, 'gh.mjs');
  writeFileSync(
    gh,
    `import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const dir = ${JSON.stringify(dir)};
const states = ${JSON.stringify(states)};
const notes = ${JSON.stringify(notes)};
const [cmd, path] = process.argv.slice(2);
appendFileSync(dir + '/calls.log', cmd + ' ' + path + '\\n');
if (cmd !== 'api') { console.error('fake gh: only api'); process.exit(1); }
let m;
if ((m = /^repos\\/[^/]+\\/[^/]+\\/commits\\/([^/]+)\\/check-runs/.exec(path))) {
  const n = existsSync(dir + '/n') ? Number(readFileSync(dir + '/n', 'utf8')) : 0;
  writeFileSync(dir + '/n', String(n + 1));
  const runs = states[Math.min(n, states.length - 1)];
  console.log(JSON.stringify({ total_count: runs.length, check_runs: runs.map((r) => ({ ...r, head_sha: m[1] })) }));
} else if ((m = /^repos\\/[^/]+\\/[^/]+\\/check-runs\\/(\\d+)\\/annotations/.exec(path))) {
  console.log(JSON.stringify(notes[m[1]] ?? []));
} else { console.error('gh: Not Found (HTTP 404)'); process.exit(1); }
`,
  );
  return { gh, dir };
}

function run(gh: string, ...extra: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [SCRIPT, SHA, ...extra], {
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, CI_STATUS_GH: gh, CI_STATUS_POLL_SECONDS: '0.05' },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('scripts/ciStatus.mjs — CI per job, not per workflow (QA-18, BUG-26)', () => {
  it('all jobs green → exit 0, one line per job and the report summary line', () => {
    const { gh, dir } = fakeGh([GREEN_RUNS]);
    const r = run(gh);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    for (const j of GREEN_RUNS) expect(r.stdout).toContain(`  ${j.name}: success\n`);
    expect(r.stdout).toContain('CI: 3 job(s) green, expected-red: none (efeb5e7)');
    const calls = readCalls(dir);
    expect(calls[0]).toBe(`api repos/pervincinal/InsiderTest/commits/${SHA}/check-runs?per_page=100&filter=latest`);
    expect(calls.some((c) => c.includes('/actions/'))).toBe(false); // the proxy blocks /actions/*
    expect(calls.some((c) => c.includes('/annotations'))).toBe(false); // green jobs need no annotations
  });

  it('a failed continue-on-error Pages deploy → exit 1 with its own conclusion and the first failure annotation', () => {
    const r = run(fakeGh([[...GREEN_RUNS, PAGES_RED]]).gh);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`  deploy to GitHub Pages: failure — ${PAGES_404}\n`);
    expect(r.stdout).not.toContain('second line');
    expect(r.stdout).toContain('CI: 3 job(s) green, expected-red: none; RED: deploy to GitHub Pages (efeb5e7)');
  });

  it('red release lanes matching --allow are "expected" → exit 0 when nothing else failed', () => {
    const r = run(fakeGh([[...GREEN_RUNS, ...IOS_LANES]]).gh, '--allow', 'App Store Connect|signed archive');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`  signed archive + App Store Connect upload: failure (expected) — ${NO_SECRETS}\n`);
    expect(r.stdout).toContain(`  App Store Connect metadata / review submission: failure (expected) — ${NO_SECRETS}\n`);
    expect(r.stdout).not.toContain('Process completed with exit code');
    expect(r.stdout).toContain(
      'CI: 3 job(s) green, expected-red: App Store Connect metadata / review submission, signed archive + App Store Connect upload (efeb5e7)',
    );
  });

  it('--allow does not excuse the Pages deploy → still exit 1', () => {
    const r = run(fakeGh([[...GREEN_RUNS, ...IOS_LANES, PAGES_RED]]).gh, '--allow', 'App Store Connect|signed archive');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('; RED: deploy to GitHub Pages (efeb5e7)');
  });

  it.each(['timed_out', 'cancelled'])('a job concluding %s is red → exit 1', (conclusion) => {
    const r = run(fakeGh([[...GREEN_RUNS, { ...PAGES_RED, conclusion }]]).gh);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`  deploy to GitHub Pages: ${conclusion} — `);
  });

  it.each(['queued', 'in_progress'])('a job still %s → exit 2 without --wait', (status) => {
    const r = run(fakeGh([[...GREEN_RUNS, { id: 4, name: 'deploy to GitHub Pages', status, conclusion: null }]]).gh);
    expect(r.status).toBe(2);
    expect(r.stdout).toContain(`  deploy to GitHub Pages: ${status}\n`);
    expect(r.stdout).toContain('; still running: deploy to GitHub Pages');
  });

  it('no check runs yet → exit 2', () => {
    const r = run(fakeGh([[]]).gh);
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/no check runs for efeb5e7/);
  });

  it('--wait polls until the running job finishes and then reports its conclusion', () => {
    const running = { id: 4, name: 'deploy to GitHub Pages', status: 'in_progress', conclusion: null };
    const { gh, dir } = fakeGh([[...GREEN_RUNS, running], [...GREEN_RUNS, running], [...GREEN_RUNS, PAGES_RED]]);
    const r = run(gh, '--wait', '10');
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/1 job\(s\) still running — polling again/);
    expect(r.stdout).toContain(`  deploy to GitHub Pages: failure — ${PAGES_404}\n`);
    expect(readCalls(dir).filter((c) => c.includes('/commits/'))).toHaveLength(3);
  });

  it('--wait gives up at the deadline with exit 2', () => {
    const running = { id: 4, name: 'deploy to GitHub Pages', status: 'queued', conclusion: null };
    const r = run(fakeGh([[...GREEN_RUNS, running]]).gh, '--wait', '0.2');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('still running after 0.2 s');
  });

  it('a missing gh is a clear error (exit 3), not a green or a stack trace', () => {
    const r = run('/nonexistent/qa-cistatus/gh');
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/`\/nonexistent\/qa-cistatus\/gh` not found — install the GitHub CLI/);
    expect(r.stderr).not.toMatch(/at .*\.mjs:\d+/);
  });

  it('a gh API error (a 403 from the proxy) → exit 3 with gh’s message', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qa-cistatus-'));
    dirs.push(dir);
    const gh = join(dir, 'gh.mjs');
    writeFileSync(gh, "console.error('gh: Access to this GitHub API path is not permitted through this proxy. (HTTP 403)'); process.exit(1);\n");
    const r = run(gh);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain('exited 1: gh: Access to this GitHub API path is not permitted through this proxy. (HTTP 403)');
  });
});

/*
 * QA-19: the iOS lane's `surface` helper (MM-14) writes several annotations per failed step —
 * one per xcodebuild error line, the log tail as a notice, the final exit-code error and the
 * "Register one device" hint. The first-failure summary shows one of them; --annotations prints
 * them all so the Producer sees the surfaced lines without a second call. Shapes as the
 * check-run annotations API returns them for `::error title=…::` / `::notice title=…::`.
 */
describe('scripts/ciStatus.mjs --annotations (QA-19)', () => {
  const IOS_RED = red(5, 'signed archive + App Store Connect upload');
  const TAIL = `Signing Identity: "Apple Development" ${'x'.repeat(1900)}`;
  const SURFACED: Note[] = [
    { annotation_level: 'failure', title: 'archive', message: "error: No profiles for 'com.pervincinal.towerclash' were found" },
    { annotation_level: 'failure', title: 'archive', message: '** ARCHIVE FAILED **' },
    { annotation_level: 'warning', title: '', message: 'Node.js 20 is deprecated.' },
    { annotation_level: 'notice', title: 'archive (log tail)', message: TAIL },
    { annotation_level: 'failure', title: '', message: 'archive failed with exit code 65 — full log in the artifact ios-build-logs' },
    { annotation_level: 'failure', title: 'Register one device', message: 'Apple cannot generate the development profile …\nsecond line' },
    { annotation_level: 'failure', title: '', message: 'Process completed with exit code 65.' },
  ];

  it('prints every failure and notice annotation of a red job, whole and in order, warnings left out', () => {
    const r = run(fakeGh([[...GREEN_RUNS, IOS_RED]], { 5: SURFACED }).gh, '--annotations');
    expect(r.status).toBe(1);
    const job = `  signed archive + App Store Connect upload: failure — error: No profiles for 'com.pervincinal.towerclash' were found\n`;
    expect(r.stdout).toContain(
      job +
        "      failure [archive] error: No profiles for 'com.pervincinal.towerclash' were found\n" +
        '      failure [archive] ** ARCHIVE FAILED **\n' +
        `      notice  [archive (log tail)] ${TAIL}\n` +
        '      failure archive failed with exit code 65 — full log in the artifact ios-build-logs\n' +
        '      failure [Register one device] Apple cannot generate the development profile …\n' +
        '              second line\n' +
        '      failure Process completed with exit code 65.\n' +
        'CI: 3 job(s) green, expected-red: none; RED: signed archive + App Store Connect upload (efeb5e7)\n',
    );
    expect(r.stdout).not.toContain('Node.js 20 is deprecated');
  });

  it('expected-red jobs list theirs too; green jobs are never asked; without the flag the output stays one line per job', () => {
    const notes = { ...NOTES, 5: SURFACED };
    const runs = [...GREEN_RUNS, IOS_RED, IOS_LANES[1]!];
    const allow = ['--allow', 'App Store Connect metadata'];
    const { gh, dir } = fakeGh([runs], notes);
    const all = run(gh, ...allow, '--annotations');
    expect(all.status).toBe(1);
    expect(all.stdout).toContain(
      `  App Store Connect metadata / review submission: failure (expected) — ${NO_SECRETS}\n` +
        '      failure Process completed with exit code 1.\n' +
        `      failure ${NO_SECRETS}\n`,
    );
    expect(all.stdout).toContain('      failure [Register one device] Apple cannot generate the development profile …\n');
    const annotationCalls = readCalls(dir).filter((c) => c.includes('/annotations'));
    expect(annotationCalls).toEqual([
      'api repos/pervincinal/InsiderTest/check-runs/6/annotations?per_page=100',
      'api repos/pervincinal/InsiderTest/check-runs/5/annotations?per_page=100',
    ]);
    const plain = run(fakeGh([runs], notes).gh, ...allow);
    expect(plain.stdout.split('\n').filter((l) => l.startsWith('      '))).toEqual([]);
    expect(plain.stdout).not.toContain('ARCHIVE FAILED');
    expect(plain.stdout).toContain(`  signed archive + App Store Connect upload: failure — error: No profiles for 'com.pervincinal.towerclash' were found\n`);
  });
});

function readCalls(dir: string): string[] {
  return readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n');
}
