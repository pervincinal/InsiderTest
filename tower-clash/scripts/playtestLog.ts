/**
 * `npx tsx scripts/playtestLog.ts <log.txt> --tester <name> [--out sheet.csv] [--levels <json>] [--seeds K]
 * [--since YYYY-MM-DDTHH:MMZ] [--verify]` (`npm run playtest:log -- …`, QA-39) — the human playtest sheet's §D step
 * 2a: turn a tester's Diagnostics COPY LOG text into the CSV `npm run playtest:decide` reads (one row per try).
 * Mapping and exclusions: `scripts/lib/playtestLog.ts`. The free-text columns (`named`, `log`, `iv`, `note`) stay
 * empty for the Producer; `speed` comes from the log's `speed` column (QA-39-1; empty for a log from an older build,
 * which decide reads as ×1).
 *
 * `bot` (the §B.1 "Bot" column): the reference player's median win time over seeds 1..K (`--seeds`, default 20)
 * on this tree's `src/levels/*.json` — the number `npm run playtest -- --seeds 20` prints and `playtestDecide`
 * measures for unsampled levels, so it follows the levels instead of a table that goes stale when a level
 * changes. `--levels <json>` (decide's `{ "<id>": { s3, s2, bot } }` file) takes `bot` from that file instead;
 * hand decide the same file then.
 *
 * `--verify` also runs `scripts/replay.ts --from-log <log> --row N` for every `#replay` line and fails when one
 * does not print MATCH (§D 3a).
 *
 * Exit codes: 0 written; 1 the log was rejected (the message names the line), a level has no bot median, or a
 * `--verify` replay did not match; 2 usage.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelDef } from '../src/sim/types';
import { referencePlayerCommands } from '../src/ai/referencePlayer';
import { runHeadless } from '../src/ai/headless';
import { SheetError, median, parseLevelsFile } from './lib/playtestDecideRule';
import { LogError, convertLog, parseLog } from './lib/playtestLog';
import { DIAG_REPLAY_KEEP } from '../src/ui/diagnostics';

const ROOT = join(import.meta.dirname, '..');
const DIR = join(ROOT, 'src', 'levels');
const USAGE = 'usage: npx tsx scripts/playtestLog.ts <log.txt> --tester <name> [--out sheet.csv] [--levels <json>] [--seeds K] [--since YYYY-MM-DDTHH:MMZ] [--verify]';

function usage(msg: string): never {
  console.error(`playtestLog: ${msg}\n${USAGE}`);
  process.exit(2);
}
function fail(msg: string): never {
  console.error(`playtestLog: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const VALUED = new Set(['--tester', '--out', '--levels', '--seeds', '--since']);
const FLAGS = new Set(['--verify']);
const positional: string[] = [];
const values: Record<string, string> = {};
const flags = new Set<string>();
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (VALUED.has(a)) {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) usage(`${a} needs a value`);
    values[a] = v;
    i++;
  } else if (FLAGS.has(a)) flags.add(a);
  else if (a.startsWith('--')) usage(`unknown flag ${a}`);
  else positional.push(a);
}
if (positional.length !== 1) usage(positional.length ? `one log expected, got ${positional.length}` : 'missing <log.txt>');
if (values['--tester'] === undefined) usage('missing --tester <name>');
const seeds = Number(values['--seeds'] ?? '20');
if (!Number.isInteger(seeds) || seeds < 1) usage(`--seeds must be a positive integer, got ${values['--seeds']}`);
const since = values['--since'];
if (since !== undefined && !/^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/.test(since)) usage(`--since must be YYYY-MM-DDTHH:MMZ (the log's t), got ${since}`);
const logPath = positional[0]!;

const read = (path: string, what: string): string => {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    return fail(`cannot read ${what} ${path}: ${(e as Error).message}`);
  }
};

const levelDefs = new Map<number, LevelDef>();
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  const level = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as LevelDef;
  levelDefs.set(level.id, level);
}
let fromFile: Map<number, { botMs?: number }> | undefined;
if (values['--levels'] !== undefined) {
  try {
    fromFile = parseLevelsFile(read(values['--levels'], 'levels file'));
  } catch (e) {
    if (e instanceof SheetError) fail(e.message);
    throw e;
  }
}

const botMs = (id: number): number | undefined => {
  if (fromFile) {
    const ms = fromFile.get(id)?.botMs;
    if (ms === undefined) fail(`--levels ${values['--levels']}: level ${id} has no "bot"`);
    return ms;
  }
  const def = levelDefs.get(id)!;
  const wins: number[] = [];
  for (let s = 1; s <= seeds; s++) {
    const r = runHeadless(def, s, referencePlayerCommands);
    if (r.outcome === 'won') wins.push(r.timeMs);
  }
  return wins.length ? median(wins) : undefined;
};

let text: string;
let converted: ReturnType<typeof convertLog>;
let replayRows: number[];
let logRows = 0;
try {
  text = read(logPath, 'log');
  const log = parseLog(text, (id) => (fromFile ? fromFile.has(id) : levelDefs.has(id)));
  replayRows = log.replayRows;
  logRows = log.rows.length;
  converted = convertLog(log, { tester: values['--tester'], botMs, ...(since !== undefined ? { since } : {}) });
} catch (e) {
  if (e instanceof LogError) fail(`${logPath}: ${e.message}`);
  throw e;
}

const { csv, rows, excluded, warnings } = converted;
const out = values['--out'];
if (out) writeFileSync(out, csv);
else process.stdout.write(csv);

const levels = [...new Set(rows.map((r) => r.level))];
console.error(
  `playtestLog: ${rows.length} attempt row(s) on ${levels.length} level(s) for tester ${rows[0]!.tester}` +
    ` (bot ${fromFile ? `from --levels ${values['--levels']}` : `= reference player median, seeds 1..${seeds}, src/levels`})` +
    `${out ? ` → ${out}` : ''}`,
);
for (const x of excluded) console.error(`playtestLog: excluded ${x}`);
for (const w of warnings) console.error(`playtestLog: WARNING ${w}`);
console.error('playtestLog: fill named / log (17, 33, 49), iv (50) and note by hand from the chat lines and recordings');

if (flags.has('--verify')) {
  let bad = 0;
  if (replayRows.length === 0) console.error('playtestLog: --verify: the log has no #replay line');
  for (const n of replayRows) {
    const r = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(ROOT, 'scripts', 'replay.ts'), '--from-log', logPath, '--row', String(n)], { cwd: ROOT, encoding: 'utf8' });
    const ok = r.status === 0 && /^replay: MATCH/m.test(r.stdout);
    const head = /^replay: level .*$/m.exec(r.stdout)?.[0] ?? r.stderr.trim().split('\n').at(-1) ?? '';
    console.error(`playtestLog: --verify row ${n}: ${ok ? 'MATCH' : `NOT MATCHED (exit ${r.status})`} — ${head.replace(/^replay: /, '')}`);
    if (!ok) bad++;
  }
  const unverified = logRows - replayRows.length;
  console.error(`playtestLog: --verify: ${replayRows.length - bad}/${replayRows.length} MATCH; ${unverified} log row(s) carry no record (only the newest ${DIAG_REPLAY_KEEP} do)`);
  if (bad) process.exit(1);
}
