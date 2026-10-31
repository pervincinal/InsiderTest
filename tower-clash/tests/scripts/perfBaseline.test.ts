import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * AUD-Q8: the relative perf gate. e2e/perf.spec.ts divides each frame sample's main-thread work by the
 * worker's calibration (`norm`) and compares it with the committed baseline e2e/perf.baseline.json for
 * the kind of host (`ci` on CI, `container` elsewhere): fail over ×1.35, warn over ×1.2, the absolute
 * 50 ms ceiling kept beside it. `npm run perf:baseline` (scripts/perfBaseline.mjs) rewrites one host's
 * entry with the median of N runs, the head sha and the date. These tests run the script on fake `[perf]`
 * logs (`--from-log`, no browser), pin the spec's gate and check the committed file's shape.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/perfBaseline.mjs');
const SPEC = readFileSync(join(ROOT, 'e2e/perf.spec.ts'), 'utf8');
const BASELINE = JSON.parse(readFileSync(join(ROOT, 'e2e/perf.baseline.json'), 'utf8')) as {
  about: string;
  hosts: Record<string, { sha: string; date: string; source: string; runs: number; calibMs: number; scenes: Record<string, { workMs: number; norm: number; samples: number[] }> }>;
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'perf-baseline-test-'));
  dirs.push(d);
  return d;
}
function run(args: string[]): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CI: '' } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** `[perf]` lines as perf.spec.ts prints them (shortened between the parts the script reads). */
const LOG = [
  'noise before',
  '[perf] level 50 seed 1 x5 autoplay: main-thread work 14.3 ms / frame (script 2.0, …) over 300 frames in 8000 ms — …; host calib 11.5 ms / frame (median of 11.4 / 11.5 / 11.6) over 99 frames, ref 20 → ratio 0.58, factor 1.00 (CI: forced to 1), ceiling 2.5',
  '[perf] level 40 ground build at 4x CPU: camera 100 ms; host calib 11.5 ms / frame over 99 frames',
  '[perf] title idle: main-thread work 17.6 ms / frame (script 2.0, …); screen after: title; host calib 11.5 ms / frame over 99 frames, ref 20',
  '[perf] shop (screen "shop"): main-thread work 15.5 ms / frame (…); screen after: shop; host calib 11.5 ms / frame over 99 frames, ref 20',
].join('\n');

describe('scripts/perfBaseline.mjs (AUD-Q8)', () => {
  it('--from-log writes the host entry: per scene work, norm = work / calib, the calibration, sha, date, source', () => {
    const d = tmp();
    writeFileSync(join(d, 'ci.log'), LOG);
    const file = join(d, 'baseline.json');
    const r = run(['--host', 'ci', '--from-log', join(d, 'ci.log'), '--baseline', file, '--sha', 'b59785a', '--date', '2026-10-29', '--source', 'CI run 106']);
    expect(r.status, r.out).toBe(0);
    const out = JSON.parse(readFileSync(file, 'utf8'));
    expect(Object.keys(out.hosts)).toEqual(['ci']);
    const ci = out.hosts.ci;
    expect(ci).toMatchObject({ sha: 'b59785a', date: '2026-10-29', source: 'CI run 106', runs: 1, calibMs: 11.5 });
    expect(Object.keys(ci.scenes).sort()).toEqual(['level50', 'shop', 'title']);
    expect(ci.scenes.level50).toEqual({ workMs: 14.3, norm: 1.2435, samples: [1.2435] });
    expect(ci.scenes.title.norm).toBeCloseTo(17.6 / 11.5, 4);
    expect(ci.scenes.shop.norm).toBeCloseTo(15.5 / 11.5, 4);
    expect(r.out).toMatch(/perfBaseline: ci @ b59785a 2026-10-29, calib 11\.5 ms \| level50 1\.244 \| title 1\.530 \| shop 1\.348/);
  });

  it('replaces only its host and prints the change against the previous numbers', () => {
    const d = tmp();
    const file = join(d, 'baseline.json');
    writeFileSync(file, JSON.stringify({ about: 'keep me', hosts: { container: { sha: 'aaa', date: '2026-10-30', source: 'x', runs: 5, calibMs: 22, scenes: { level50: { workMs: 25, norm: 1.1 } } }, ci: { sha: 'old', scenes: { title: { norm: 1.0 } } } } }));
    writeFileSync(join(d, 'ci.log'), LOG);
    const r = run(['--host', 'ci', '--from-log', join(d, 'ci.log'), '--baseline', file, '--sha', 'new']);
    expect(r.status, r.out).toBe(0);
    const out = JSON.parse(readFileSync(file, 'utf8'));
    expect(out.about).toBe('keep me');
    expect(out.hosts.container.sha).toBe('aaa');
    expect(out.hosts.ci.sha).toBe('new');
    expect(r.out).toMatch(/title 1\.530 \(was 1\.000, ×1\.53\)/);
    expect(out.hosts.ci.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('--from-log also reads the one-line [perf-table] (CI prints it as a ::notice check-run annotation)', () => {
    const d = tmp();
    const table = '::notice title=perf table (AUD-Q8)::[perf-table] ci baseline (b59785a), calib 12.0 ms | level50 15.0 ms → 1.250 / 1.244 ×1.01 ok | title 18.0 ms → 1.500 / 1.530 ×0.98 ok | shop 16.2 ms → 1.350 / 1.348 ×1.00 ok';
    writeFileSync(join(d, 'notice.txt'), `${table}\n`);
    const file = join(d, 'baseline.json');
    const r = run(['--host', 'ci', '--from-log', join(d, 'notice.txt'), '--baseline', file, '--sha', 'c0ffee1']);
    expect(r.status, r.out).toBe(0);
    const ci = JSON.parse(readFileSync(file, 'utf8')).hosts.ci;
    expect(ci.calibMs).toBe(12);
    expect(ci.scenes).toEqual({ level50: { workMs: 15, norm: 1.25, samples: [1.25] }, title: { workMs: 18, norm: 1.5, samples: [1.5] }, shop: { workMs: 16.2, norm: 1.35, samples: [1.35] } });
  });

  it('--dry-run writes nothing', () => {
    const d = tmp();
    writeFileSync(join(d, 'ci.log'), LOG);
    const file = join(d, 'baseline.json');
    writeFileSync(file, '{"hosts":{}}');
    const r = run(['--host', 'ci', '--from-log', join(d, 'ci.log'), '--baseline', file, '--dry-run']);
    expect(r.status, r.out).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe('{"hosts":{}}');
  });

  it('refuses: a log without a scene (1), the ci entry measured off CI (2), a bad --runs / --date / --host (2), no build (2)', () => {
    const d = tmp();
    writeFileSync(join(d, 'short.log'), LOG.split('\n').filter((l) => !l.includes('shop')).join('\n'));
    const file = join(d, 'baseline.json');
    const short = run(['--host', 'ci', '--from-log', join(d, 'short.log'), '--baseline', file]);
    expect(short.status).toBe(1);
    expect(short.out).toContain('no sample for "shop"');
    expect(run(['--host', 'ci', '--baseline', file]).status).toBe(2);
    expect(run(['--runs', '0', '--baseline', file]).status).toBe(2);
    expect(run(['--date', '31.10.2026', '--from-log', join(d, 'short.log'), '--baseline', file]).status).toBe(2);
    expect(run(['--host', 'Bad Host', '--baseline', file]).status).toBe(2);
    const nobuild = run(['--dist', join(d, 'nothing-here'), '--baseline', file]);
    expect(nobuild.status).toBe(2);
    expect(nobuild.out).toContain('build first');
  });

  it('is `npm run perf:baseline`', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['perf:baseline']).toBe('node scripts/perfBaseline.mjs');
  });
});

describe('e2e/perf.spec.ts relative gate (AUD-Q8)', () => {
  it('fails over ×1.35 and warns over ×1.2 of the baseline norm, per kind of host, next to the absolute 50 ms', () => {
    expect(SPEC).toMatch(/\nconst REGRESSION_FAIL_RATIO = 1\.35;/);
    expect(SPEC).toMatch(/\nconst REGRESSION_WARN_RATIO = 1\.2;/);
    expect(SPEC).toMatch(/\nconst FRAME_WORK_BUDGET_MS = 50;/);
    expect(SPEC).toContain("const BASELINE_HOST = process.env.PERF_BASELINE_HOST || (process.env.CI ? 'ci' : 'container');");
    expect(SPEC).toContain("new URL('./perf.baseline.json', import.meta.url)");
    expect(SPEC).toMatch(/function regressionVerdict\(ratio: number\): GateRow\['verdict'\] \{\s*return ratio > REGRESSION_FAIL_RATIO \? 'FAIL' : ratio > REGRESSION_WARN_RATIO \? 'WARN' : 'ok';\s*\}/);
    expect(SPEC).toContain('const norm = f.work / h.calibMs;');
    expect(SPEC).toContain('expect(ratio, `AUD-Q8 relative gate — ${line}`).toBeLessThanOrEqual(REGRESSION_FAIL_RATIO);');
    // every frame sample: the absolute gate, then the relative one, on the scene names the baseline uses
    expect([...SPEC.matchAll(/expectFrameWork\(f, MIN_FRAMES\.(?:play|screen), summary, host\);\n\s*expectNoRegression\((`level\$\{HIGHEST\}`|'title'|'shop'), f, host\);/g)].map((m) => m[1])).toEqual(['`level${HIGHEST}`', "'title'", "'shop'"]);
    // the sample annotation the script reads is pushed before the gate can fail
    expect(SPEC.indexOf("type: 'perf-sample'")).toBeLessThan(SPEC.indexOf('expect(ratio, `AUD-Q8 relative gate'));
    // the one-line table, and on GitHub Actions the table / a WARN or FAIL as check-run annotations
    expect(SPEC).toContain('const table = `[perf-table] ${BASELINE_HOST} baseline');
    expect(SPEC).toContain('if (process.env.GITHUB_ACTIONS) console.log(`::notice title=perf table (AUD-Q8)::${table}`);');
    expect(SPEC).toContain("if (verdict !== 'ok' && process.env.GITHUB_ACTIONS) console.log(`::warning title=perf ${verdict} (AUD-Q8)::${line}`);");
    // the calibration is a median of 1 s windows
    expect(SPEC).toMatch(/\nconst CALIBRATION_WINDOWS = 5;/);
    expect(SPEC).toContain('const calibMs = median(windows.map((w) => w.work));');
  });
});

describe('e2e/perf.baseline.json (AUD-Q8)', () => {
  it('holds this container\'s and CI\'s numbers for the three scenes, each with its sha and date', () => {
    expect(Object.keys(BASELINE.hosts).sort()).toEqual(['ci', 'container']);
    for (const [name, host] of Object.entries(BASELINE.hosts)) {
      expect(host.sha, name).toMatch(/^[0-9a-f]{7,}$/);
      expect(host.date, name).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(host.calibMs, name).toBeGreaterThan(0);
      expect(Object.keys(host.scenes).sort(), name).toEqual(['level50', 'shop', 'title']);
      for (const [scene, s] of Object.entries(host.scenes)) {
        expect(s.norm, `${name} ${scene}`).toBeCloseTo(s.workMs / host.calibMs, 1);
        expect(s.norm, `${name} ${scene}`).toBeGreaterThan(0.5);
        expect(s.norm, `${name} ${scene}`).toBeLessThan(3);
      }
    }
  });

  it('the ci entry is CI run 106 (QA-31: calib 11.5, level 50 14.3, title 17.6, shop 15.5 ms) until a CI log re-measures it', () => {
    const ci = BASELINE.hosts.ci!;
    if (ci.sha !== 'b59785a') return; // re-measured from a CI log since: the shape test above still holds
    expect(ci.calibMs).toBe(11.5);
    expect(ci.scenes.level50!.workMs).toBe(14.3);
    expect(ci.scenes.title!.workMs).toBe(17.6);
    expect(ci.scenes.shop!.workMs).toBe(15.5);
  });

  it('the level scene is the highest authored level, the one the spec samples', () => {
    const dir = join(ROOT, 'src/levels');
    const ids = readdirSync(dir)
      .filter((f) => /^\d{3}-.*\.json$/.test(f))
      .map((f) => (JSON.parse(readFileSync(join(dir, f), 'utf8')) as { id: number }).id);
    const scene = `level${Math.max(...ids)}`;
    for (const [name, host] of Object.entries(BASELINE.hosts)) expect(Object.keys(host.scenes), `${name}: re-measure with npm run perf:baseline when the highest level changes`).toContain(scene);
  });
});
