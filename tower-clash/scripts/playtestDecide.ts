/**
 * `npx tsx scripts/playtestDecide.ts <sheet.csv> [--levels <json>] [--seeds 20] [--date YYYY-MM-DD]`
 * (`npm run playtest:decide -- <sheet.csv>`) — the mechanical §C of
 * docs/reviews/2026-11-05-human-playtest-sheet.md on a filled human playtest sheet (QA-36; ported from the Game
 * Designer's scratch `decide.mjs`). Prints markdown to paste into the playtest review: the C.1 `star3` table
 * (zones F / M / S at r = H / B < 0.85 / ≤ 1.10 / > 1.10, round5, the `star2` guard, pins 1 / 33, band moves), H3,
 * C.2's human half of the 2★ floor, C.3 per tester, C.4, the C.5 side outputs, and a JSON block for
 * `scripts/reclock.ts`'s human-clock pin table (`HUMAN` in `scripts/lib/reclockPins.ts`: id → { star3?, star2?,
 * source: 'sheet YYYY-MM-DD', note }, ms; only `star3` is proposed — the B5 `star2` floor is `reclock.ts --gd12`'s,
 * not a per-level human value). The block is a proposal: a row becomes a pin by hand, after the sign-off. Every line is
 * tagged `DECISION` (N ≥ 3 testers) or `PROVISIONAL`. Rules: `scripts/lib/playtestDecideRule.ts`.
 *
 * The CSV (one row per try; `#` lines and blank lines skipped; any column order; a field with a comma is
 * double-quoted):
 *   tester,level,bot,attempt,result,time,stars,first_ever,speed,boosters,help,named,log,iv,note[,time_ms]
 * - `tester` any name; N = the number of distinct testers. `level` 1–50. `attempt` 1, 2, … per tester and level.
 * - `bot` (required; on at least one row of each level, equal on all) = the reference player median in seconds,
 *   the sheet's §B.1 "Bot" column (re-run `npm run playtest -- --seeds 20` when the build's levels changed, §D 2).
 * - `result` W / L / R (the AZ Q / M / G are accepted). `time` the card's mm:ss (a win needs one); `time_ms`
 *   (optional) the Diagnostics `timeMs`, used instead of `time` when filled. `stars` 1–3 on a win, 0 / empty else.
 * - `first_ever` 1 when "before" was 0. `speed` 1 / 2 = the game speed (only ×1 is a valid time; the "as fast as
 *   you can" retry is just a later attempt). `boosters` count fired. `help` 1 = REINFORCEMENTS / KÖMƏK used.
 * - `named` / `log` (17, 33, 49) = the tester's colour / the recording's: red, green, yellow, nobody (`none` and
 *   the AZ words accepted). `iv` 1 on the level-50 row when C.3 (iv) holds. `note` free text.
 *
 * Clocks (`star3` / `star2`) come from `src/levels/*.json`, or from `--levels <json>` (a pre-computed
 * `{ "<id>": { "s3": 25, "s2": 60, "bot": 27.8 } }` in seconds; `bot` there fills an empty CSV `bot` cell). A band
 * move needs the bot median of the band's unsampled levels: taken from `--levels` when given, else measured here
 * with the reference player over seeds 1..K (`--seeds`, default 20, the median `npm run playtest` prints).
 * `--date` = the play date for the HUMAN entries' `source` (`sheet <date>`); default: a YYYY-MM-DD in the sheet's file
 * name (e.g. `2026-11-07-playtest.csv`), else the placeholder `sheet YYYY-MM-DD` with a warning.
 *
 * Exit codes: 0 printed; 1 the sheet or the levels file was rejected (the message names the line); 2 usage.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { LevelDef } from '../src/sim/types';
import { referencePlayerCommands } from '../src/ai/referencePlayer';
import { runHeadless } from '../src/ai/headless';
import { SheetError, decide, median, parseLevelsFile, parseSheet, renderMarkdown } from './lib/playtestDecideRule';
import type { Clock } from './lib/playtestDecideRule';

const DIR = join(import.meta.dirname, '..', 'src', 'levels');
const USAGE = 'usage: npx tsx scripts/playtestDecide.ts <sheet.csv> [--levels <json>] [--seeds K] [--date YYYY-MM-DD]';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
const VALUED = new Set(['--levels', '--seeds', '--date']);
const positional: string[] = [];
const values: Record<string, string> = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (VALUED.has(a)) {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) usage(`${a} needs a value`);
    values[a] = v!;
    i++;
  } else if (a.startsWith('--')) usage(`unknown flag ${a}`);
  else positional.push(a);
}
if (positional.length !== 1) usage(positional.length ? `one sheet expected, got ${positional.length}` : 'missing <sheet.csv>');
const seeds = Number(values['--seeds'] ?? '20');
if (!Number.isInteger(seeds) || seeds < 1) usage(`--seeds must be a positive integer, got ${values['--seeds']}`);
const sheetPath = positional[0]!;
const DATE_RE = /\d{4}-\d{2}-\d{2}/;
if (values['--date'] !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(values['--date'])) usage(`--date must be YYYY-MM-DD, got ${values['--date']}`);
const playDate = values['--date'] ?? DATE_RE.exec(basename(sheetPath))?.[0];

function usage(msg: string): never {
  console.error(`playtestDecide: ${msg}\n${USAGE}`);
  process.exit(2);
}

function fail(msg: string): never {
  console.error(`playtestDecide: ${msg}`);
  process.exit(1);
}

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
const fromFile = values['--levels'] !== undefined ? (() => {
  try {
    return parseLevelsFile(read(values['--levels']!, 'levels file'));
  } catch (e) {
    if (e instanceof SheetError) fail(e.message);
    throw e;
  }
})() : undefined;
const clockOf = (id: number): Clock | undefined => {
  if (fromFile) return fromFile.get(id);
  const def = levelDefs.get(id);
  return def ? { star3: def.star3, star2: def.star2 } : undefined;
};

const measured = new Map<number, number | undefined>();
const botOf = (id: number): number | undefined => {
  if (measured.has(id)) return measured.get(id);
  const def = levelDefs.get(id);
  let ms: number | undefined;
  if (def) {
    const wins: number[] = [];
    for (let s = 1; s <= seeds; s++) {
      const r = runHeadless(def, s, referencePlayerCommands);
      if (r.outcome === 'won') wins.push(r.timeMs);
    }
    ms = wins.length ? median(wins) : undefined;
    console.error(`playtestDecide: measured level ${id} bot median ${ms === undefined ? 'no win' : `${(ms / 1000).toFixed(1)} s`} (reference player, K = ${seeds})`);
  }
  measured.set(id, ms);
  return ms;
};

try {
  const isLevel = (id: number): boolean => (fromFile ? fromFile.has(id) : levelDefs.has(id));
  const sheet = parseSheet(read(sheetPath, 'sheet'), isLevel);
  const d = decide({ sheet, clockOf, botOf });
  const name = basename(sheetPath);
  console.log(renderMarkdown(d, {
    sheetName: name,
    clocksFrom: fromFile ? `--levels ${basename(values['--levels']!)}` : '`src/levels/*.json`',
    source: `sheet ${playDate ?? 'YYYY-MM-DD'}`,
  }));
  if (!playDate) console.error('playtestDecide: no play date (--date or a YYYY-MM-DD in the file name): the HUMAN block says "sheet YYYY-MM-DD"');
} catch (e) {
  if (e instanceof SheetError) fail(`${sheetPath}: ${e.message}`);
  throw e;
}
