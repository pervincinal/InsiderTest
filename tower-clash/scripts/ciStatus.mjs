#!/usr/bin/env node
/**
 * CI status per job (QA-18, BUG-26). Reads the GitHub check runs of one commit — one per workflow
 * job — and prints each job's own conclusion, so a `continue-on-error` job that failed (the Pages
 * deploy, red on every push for 11 days behind a green workflow) can no longer hide.
 *
 * Usage:  node scripts/ciStatus.mjs [<sha>] [--allow <regex>] [--wait <seconds>] [--annotations] [--repo <owner/name>] | --help
 *   <sha>      commit to read (default `git rev-parse HEAD`; short shas are resolved with git)
 *   --allow    jobs whose name matches this regex may be red; reported as "expected"
 *              (the release lanes while their secrets do not exist)
 *   --wait     keep polling every 30 s while jobs are queued / in progress, up to <seconds>
 *   --annotations  (QA-19) under each red / expected-red job, print EVERY failure and notice
 *              annotation in full, in the API's order — e.g. the iOS lane's `surface` lines
 *              (`::error title=archive::…`, the `archive (log tail)` notice, "Register one
 *              device") — instead of only the first failure. Warnings are left out.
 * Exit: 0 every job green (or expected-red) · 1 a job that is not allowed concluded red
 *       (failure, timed_out, cancelled, action_required, …) · 2 jobs still running (or none yet)
 *       · 3 gh missing / API error / bad arguments.
 * Data: `gh api repos/<repo>/commits/<sha>/check-runs` and, for each red job, the first
 * failure-level message of `…/check-runs/<id>/annotations` (one call per red job; with
 * --annotations all of them). Only `repos/*` paths are used.
 * Required together (QA-26): tower-clash-ci.yml runs the chromium e2e as a two-shard matrix next to
 * the check job. Once any job of a REQUIRED_TOGETHER group reports for the commit, every job of the
 * group must report: one that is absent is "missing" (pending while other jobs still run, red once
 * all have finished) and one that concluded `skipped` is red — otherwise a shard that never ran
 * (matrix shrunk, job renamed, an `if:` that skipped it) would leave the e2e half-run behind a
 * green line. Pushes that do not trigger the workflow (path filters) report none of the group, and
 * nothing is required. `--allow` covers these like any other job.
 * --help prints this header and the required groups (the hygiene test checks them against the
 * workflow's job names).
 * Tests point CI_STATUS_GH at a fake gh (tests/scripts/ciStatus.test.ts); CI_STATUS_POLL_SECONDS
 * overrides the 30 s poll interval.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const GREEN = new Set(['success', 'neutral', 'skipped']);
const GENERIC = /^Process completed with exit code \d+\.?$/;
/** QA-26: check-run names that must all report once one of them does (see the header). */
const REQUIRED_TOGETHER = [
  // .github/workflows/tower-clash-ci.yml: `verify`, the `e2e` matrix (`e2e (shard ${{ matrix.shard }}/2)`)
  // and AUD-Q5's `e2e-webkit` (the webkit-iphone Playwright project)
  ['check + playtest + build + e2e', 'e2e (shard 1/2)', 'e2e (shard 2/2)', 'e2e (webkit)'],
];

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  const src = readFileSync(new URL(import.meta.url), 'utf8');
  const header = /\/\*\*\n([\s\S]*?)\*\//.exec(src)?.[1] ?? '';
  console.log(header.replace(/^ \* ?/gm, '').trimEnd());
  console.log('\nRequired together:');
  for (const group of REQUIRED_TOGETHER) console.log(`  ${group.join(' | ')}`);
  process.exit(0);
}

function fail(msg) {
  console.error(`ciStatus: ${msg}`);
  process.exit(3);
}

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  if (args[i + 1] === undefined) fail(`${name} needs a value`);
  return args.splice(i, 2)[1];
};
const allowSrc = opt('--allow');
const waitArg = opt('--wait');
const repo = opt('--repo') ?? 'pervincinal/InsiderTest';
const flag = (name) => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const showAll = flag('--annotations');
let allow;
try {
  allow = allowSrc === undefined ? undefined : new RegExp(allowSrc);
} catch (e) {
  fail(`invalid --allow regex: ${e.message}`);
}
const waitSeconds = waitArg === undefined ? 0 : Number(waitArg);
if (!Number.isFinite(waitSeconds) || waitSeconds < 0) fail(`invalid --wait ${waitArg}`);
const pollMs = Number(process.env.CI_STATUS_POLL_SECONDS ?? 30) * 1000;
if (args.some((a) => a.startsWith('--')) || args.length > 1) fail(`unknown arguments: ${args.join(' ')}`);

function resolveSha(ref) {
  const r = spawnSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.trim();
  if (ref === 'HEAD') fail('no <sha> given and `git rev-parse HEAD` failed (not in a git checkout?)');
  return ref;
}
const sha = resolveSha(args[0] ?? 'HEAD');

/** `gh api <path>` → parsed JSON. CI_STATUS_GH may name a fake gh (a .mjs/.js is run with node). */
function ghApi(path) {
  const gh = process.env.CI_STATUS_GH || 'gh';
  const viaNode = /\.[cm]?js$/.test(gh);
  const r = spawnSync(viaNode ? process.execPath : gh, [...(viaNode ? [gh] : []), 'api', path], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error?.code === 'ENOENT') {
    fail(`\`${gh}\` not found — install the GitHub CLI (https://cli.github.com) and run \`gh auth login\`, or set CI_STATUS_GH`);
  }
  if (r.error) fail(`gh api ${path}: ${r.error.message}`);
  if (r.status !== 0) fail(`gh api ${path} exited ${r.status}: ${(r.stderr || r.stdout).trim()}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    fail(`gh api ${path}: response is not JSON: ${r.stdout.slice(0, 200)}`);
  }
}

/** A job's annotations (GitHub keeps at most 50 per job, so one page of 100 holds them all). */
function annotations(id) {
  const notes = ghApi(`repos/${repo}/check-runs/${id}/annotations?per_page=100`);
  return Array.isArray(notes) ? notes : [];
}

/** First failure-level annotation, preferring a real message over "Process completed with exit code 1." */
function firstFailure(notes) {
  const failures = notes.filter((a) => a.annotation_level === 'failure');
  const best = failures.find((a) => !GENERIC.test(String(a.message).trim())) ?? failures[0];
  if (!best) return undefined;
  const line = String(best.message).trim().split('\n')[0];
  return line.length > 240 ? `${line.slice(0, 239)}…` : line;
}

/** --annotations: every failure / notice annotation, whole, continuation lines indented under it. */
function annotationLines(notes) {
  return notes
    .filter((a) => a.annotation_level === 'failure' || a.annotation_level === 'notice')
    .map((a) => {
      const title = a.title ? ` [${a.title}]` : '';
      const text = String(a.message ?? '').trim().split('\n').join('\n              ');
      return `      ${a.annotation_level.padEnd(7)}${title} ${text}`;
    });
}

function snapshot() {
  const data = ghApi(`repos/${repo}/commits/${sha}/check-runs?per_page=100&filter=latest`);
  const runs = (data.check_runs ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const required = new Set(REQUIRED_TOGETHER.filter((g) => g.some((n) => runs.some((r) => r.name === n))).flat());
  const jobs = runs.map((run) => {
    const done = run.status === 'completed';
    const skippedRequired = run.conclusion === 'skipped' && required.has(run.name);
    const ok = GREEN.has(run.conclusion) && !skippedRequired;
    const state = done ? (ok ? 'green' : allow?.test(run.name) ? 'expected' : 'red') : 'pending';
    return { id: run.id, name: run.name, status: run.status, conclusion: run.conclusion, state, note: skippedRequired ? 'required job did not run' : undefined };
  });
  const missing = [...required].filter((n) => !runs.some((r) => r.name === n));
  const running = jobs.some((j) => j.state === 'pending');
  for (const name of missing) {
    const state = running ? 'pending' : allow?.test(name) ? 'expected' : 'red';
    const peers = REQUIRED_TOGETHER.find((g) => g.includes(name)).filter((n) => n !== name);
    jobs.push({ id: undefined, name, status: 'missing', conclusion: 'missing', state, note: `no check run, required with ${peers.join(', ')}` });
  }
  return jobs.sort((a, b) => a.name.localeCompare(b.name));
}

const deadline = Date.now() + waitSeconds * 1000;
let jobs = snapshot();
while (waitSeconds > 0 && (jobs.length === 0 || jobs.some((j) => j.state === 'pending')) && Date.now() < deadline) {
  const n = jobs.filter((j) => j.state === 'pending').length;
  console.log(`ciStatus: ${jobs.length === 0 ? 'no check runs yet' : `${n} job(s) still running`} — polling again in ${pollMs / 1000} s`);
  await new Promise((r) => setTimeout(r, Math.min(pollMs, Math.max(0, deadline - Date.now()))));
  jobs = snapshot();
}

const short = sha.slice(0, 7);
if (jobs.length === 0) {
  console.log(`ciStatus: no check runs for ${short} in ${repo} yet (pushed? workflows path-filtered?)`);
  process.exit(2);
}
console.log(`ciStatus: ${repo} @ ${short} — ${jobs.length} job(s)`);
for (const j of jobs) {
  if (j.state === 'pending') {
    console.log(`  ${j.name}: ${j.status === 'missing' ? 'not started' : j.status}`);
    continue;
  }
  const tag = j.state === 'expected' ? ' (expected)' : '';
  const notes = j.state === 'green' || j.id === undefined ? [] : annotations(j.id);
  const why = j.note ?? firstFailure(notes);
  console.log(`  ${j.name}: ${j.conclusion}${tag}${why ? ` — ${why}` : ''}`);
  if (showAll) for (const line of annotationLines(notes)) console.log(line);
}

const names = (state) => jobs.filter((j) => j.state === state).map((j) => j.name);
const [green, expected, red, pending] = ['green', 'expected', 'red', 'pending'].map(names);
let summary = `CI: ${green.length} job(s) green, expected-red: ${expected.length ? expected.join(', ') : 'none'}`;
if (red.length) summary += `; RED: ${red.join(', ')}`;
if (pending.length) summary += `; still running: ${pending.join(', ')}`;
console.log(`${summary} (${short})`);
if (red.length) process.exit(1);
if (pending.length) {
  if (waitSeconds > 0) console.error(`ciStatus: still running after ${waitSeconds} s`);
  process.exit(2);
}
