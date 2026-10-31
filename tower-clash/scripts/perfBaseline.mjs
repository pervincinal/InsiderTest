#!/usr/bin/env node
/**
 * AUD-Q8: (re)write the relative perf gate's baseline, e2e/perf.baseline.json (`npm run perf:baseline`).
 *
 * e2e/perf.spec.ts gates each frame sample (level 50 autoplay, title idle, shop) on its `norm` — main-thread
 * work per frame divided by the worker's host calibration — against this file's `norm` for the scene on the
 * same kind of host (`ci` on CI, `container` elsewhere): fail over ×1.35, warn over ×1.2. A deliberate change
 * of the frame cost re-measures here, so the new numbers land as a reviewed diff with the head sha and date.
 *
 *   node scripts/perfBaseline.mjs [--runs 3] [--host container] [--dist <build dir>] [--port 4173] [--output <dir>]
 *       runs the spec's three frame tests `--runs` times on a built game (`--dist`, else $PW_DIST, else dist/ —
 *       this script never builds: `npm run build`, or `npx vite build --outDir <dir>` for a private build)
 *       and stores, per scene, the median `norm` (and work ms) of the runs and the median calibration;
 *   node scripts/perfBaseline.mjs --host ci --from-log <file> [--sha <sha>] [--source <text>]
 *       takes the numbers from the `[perf]` lines of a log (a CI job log or the html report's stdout), or from
 *       the one-line `[perf-table]` (on CI also a check-run `::notice` annotation, readable without the log):
 *       one entry per scene, the calibration from the `host calib` / `calib` part. CI's runner is not this host, so the
 *       `ci` entry always comes from CI's own output.
 * Other flags: --baseline <file> (default e2e/perf.baseline.json), --date YYYY-MM-DD (default today, UTC),
 * --sha (default `git rev-parse --short HEAD`), --source (free text, default says how it was measured),
 * --dry-run (print, do not write). Only the chosen host's entry is replaced; the others are kept.
 * A run whose test failed for any reason other than the relative gate itself (an `AUD-Q8` message) is not
 * a measurement: it is dropped whole and measured again, at most MAX_REJECTED times, then the script stops
 * and names it. Exit 0 written, 1 measurement failed, 2 bad arguments.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) fail(2, `${name} needs a value`);
  return v;
};

function fail(code, message) {
  console.error(`perfBaseline: ${message}`);
  process.exit(code);
}

const SCENES = ['title', 'shop']; // + `level<highest>` (named by the spec)
/** The frame tests of e2e/perf.spec.ts (their titles); the ground-build and overlay tests are not sampled. */
const GREP = 'main-thread work <=';
/** Runs dropped for failing for another reason than the relative gate (a boot timeout on a loaded host) before giving up. */
const MAX_REJECTED = 3;

const baselinePath = resolve(process.cwd(), opt('--baseline', join(root, 'e2e/perf.baseline.json')));
const host = opt('--host', 'container');
if (!/^[a-z][a-z0-9-]*$/.test(host)) fail(2, `--host must be a lower-case name, got "${host}"`);
const runs = Number(opt('--runs', '3'));
if (!Number.isInteger(runs) || runs < 1 || runs > 15) fail(2, `--runs must be 1..15, got ${opt('--runs', '3')}`);
const fromLog = opt('--from-log', null);
if (host === 'ci' && !fromLog && !process.env.CI) fail(2, 'the ci entry is CI\'s numbers: pass --from-log <a CI log>, or run this on CI');
const date = opt('--date', new Date().toISOString().slice(0, 10));
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(2, `--date must be YYYY-MM-DD, got ${date}`);
const sha = opt('--sha', null) ?? gitSha();

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;

/** `[perf]` lines → samples: `{ scene, workMs, calibMs }` (level N autoplay / title idle / shop). */
function samplesFromLog(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = /\[perf\] (level (\d+) [^:]*autoplay|title idle|shop[^:]*): main-thread work ([\d.]+) ms \/ frame.*host calib ([\d.]+) ms/.exec(line);
    if (!m) continue;
    const scene = m[2] ? `level${m[2]}` : m[1].startsWith('title') ? 'title' : 'shop';
    out.push({ scene, workMs: Number(m[3]), calibMs: Number(m[4]) });
  }
  // the spec's one-line `[perf-table]` (also CI's `::notice` annotation): scenes no `[perf]` line gave
  for (const line of text.split('\n')) {
    const t = /\[perf-table\][^|]*calib ([\d.]+) ms((?:\s*\|[^|]+)+)/.exec(line);
    if (!t) continue;
    for (const c of t[2].matchAll(/\|\s*(level\d+|title|shop) ([\d.]+) ms →/g)) {
      if (!out.some((s) => s.scene === c[1])) out.push({ scene: c[1], workMs: Number(c[2]), calibMs: Number(t[1]) });
    }
  }
  return out;
}

/** Every `perf-sample` annotation and every failure of a Playwright JSON report. */
function readReport(file) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const samples = [];
  const failures = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        const annotations = [...(t.annotations ?? []), ...results.flatMap((r) => r.annotations ?? [])];
        const seen = new Set();
        for (const a of annotations) {
          if (a.type !== 'perf-sample' || seen.has(a.description)) continue;
          seen.add(a.description);
          samples.push(JSON.parse(a.description));
        }
        for (const r of results) {
          if (r.status === 'passed' || r.status === 'skipped') continue;
          const message = (r.errors ?? []).map((e) => e.message ?? '').join('\n') || r.error?.message || r.status;
          failures.push({ title: spec.title, message, gate: /AUD-Q8/.test(message) });
        }
        if (results.some((r) => r.status === 'skipped')) failures.push({ title: spec.title, message: 'skipped (host too slow or a missing hook)', gate: false });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const s of report.suites ?? []) walk(s);
  for (const e of report.errors ?? []) failures.push({ title: '(run)', message: e.message ?? String(e), gate: false });
  return { samples, failures };
}

function measure() {
  const dist = opt('--dist', process.env.PW_DIST || 'dist');
  const distAbs = resolve(process.cwd(), dist);
  if (!existsSync(join(distAbs, 'index.html'))) fail(2, `no build at ${distAbs} — build first (npm run build, or npx vite build --outDir <dir>) and pass --dist`);
  const scratch = mkdtempSync(join(tmpdir(), 'perf-baseline-'));
  const port = opt('--port', process.env.PW_PORT || '4173');
  const output = opt('--output', process.env.PW_OUTPUT || join(scratch, 'pw'));
  const perRun = [];
  let rejected = 0;
  try {
    for (let k = 1; perRun.length < runs; k++) {
      const json = join(scratch, `run-${k}.json`);
      console.log(`perfBaseline: run ${k} (${perRun.length}/${runs} measured; dist ${distAbs}, port ${port})…`);
      const r = spawnSync(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', 'e2e/perf.spec.ts', '--project=chromium', '--grep', GREP, '--reporter=json'], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, PW_DIST: distAbs, PW_PORT: String(port), PW_OUTPUT: output, PERF_BASELINE_HOST: host, PLAYWRIGHT_JSON_OUTPUT_NAME: json },
        maxBuffer: 64 * 1024 * 1024,
      });
      if (!existsSync(json)) fail(1, `run ${k}: Playwright wrote no report (exit ${r.status})\n${(r.stderr || r.stdout || '').slice(-2000)}`);
      const { samples, failures } = readReport(json);
      const bad = failures.filter((f) => !f.gate);
      if (bad.length) {
        // a boot timeout on a loaded host is not a measurement: drop the whole run (never half of it), retry a bounded number of times
        const why = `run ${k} is not a measurement:\n${bad.map((f) => `  ${f.title}: ${f.message.split('\n')[0]}`).join('\n')}`;
        if (++rejected > MAX_REJECTED) fail(1, `${why}\n(${rejected} runs rejected, the most allowed is ${MAX_REJECTED})`);
        console.log(`perfBaseline: ${why}\nperfBaseline: dropped, measuring again (${rejected}/${MAX_REJECTED})`);
        continue;
      }
      for (const f of failures) console.log(`perfBaseline: run ${k}: relative gate tripped (expected when re-baselining a deliberate change): ${f.message.split('\n').find((l) => /AUD-Q8/.test(l)) ?? f.title}`);
      perRun.push(samples);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return perRun;
}

/** Per scene: median norm / work over the runs, every run's norm; the median calibration. */
function summarise(perRun) {
  const scenes = {};
  const calibs = [];
  const names = [...new Set(perRun.flatMap((run) => run.map((s) => s.scene)))].sort();
  const level = names.find((n) => /^level\d+$/.test(n));
  for (const want of [...(level ? [level] : []), ...SCENES]) if (!names.includes(want)) fail(1, `no sample for "${want}"${level ? '' : ' (and none for the level scene)'}`);
  if (!level) fail(1, 'no sample for the level scene');
  for (const run of perRun) {
    for (const want of [level, ...SCENES]) if (!run.some((s) => s.scene === want)) fail(1, `a run has no sample for "${want}"`);
    calibs.push(median(run.map((s) => s.calibMs)));
  }
  for (const name of [level, ...SCENES]) {
    const xs = perRun.map((run) => run.find((s) => s.scene === name));
    const norms = xs.map((s) => s.workMs / s.calibMs);
    scenes[name] = { workMs: round(median(xs.map((s) => s.workMs)), 2), norm: round(median(norms), 4), samples: norms.map((n) => round(n, 4)) };
  }
  return { calibMs: round(median(calibs), 2), scenes };
}

const perRun = fromLog
  ? [samplesFromLog(readFileSync(resolve(process.cwd(), fromLog), 'utf8'))]
  : measure();
const { calibMs, scenes } = summarise(perRun);
const source =
  opt('--source', null) ??
  (fromLog ? `the [perf] lines of ${fromLog}` : `npm run perf:baseline, ${runs} run(s) of e2e/perf.spec.ts's frame tests (median per scene)`);

const file = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {};
const previous = file.hosts?.[host] ?? null;
const next = {
  about:
    file.about ??
    'AUD-Q8 relative perf gate (e2e/perf.spec.ts): per host kind, each scene\'s main-thread work per frame over the calibration loop (norm). Fail over ×1.35, warn over ×1.2. Written by npm run perf:baseline (scripts/perfBaseline.mjs); do not edit the numbers by hand.',
  hosts: { ...(file.hosts ?? {}), [host]: { sha, date, source, runs: perRun.length, calibMs, scenes } },
};
const ordered = { about: next.about, hosts: Object.fromEntries(Object.entries(next.hosts).sort(([a], [b]) => a.localeCompare(b))) };

const cells = Object.entries(scenes).map(([name, s]) => {
  const was = previous?.scenes?.[name]?.norm;
  return `${name} ${s.norm.toFixed(3)}${was ? ` (was ${was.toFixed(3)}, ×${(s.norm / was).toFixed(2)})` : ''}`;
});
console.log(`perfBaseline: ${host} @ ${sha} ${date}, calib ${calibMs} ms | ${cells.join(' | ')}`);
if (flag('--dry-run')) {
  console.log(JSON.stringify(ordered.hosts[host], null, 2));
} else {
  writeFileSync(baselinePath, `${JSON.stringify(ordered, null, 2)}\n`);
  console.log(`perfBaseline: wrote ${baselinePath}`);
}
