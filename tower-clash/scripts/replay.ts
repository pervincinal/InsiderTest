/**
 * `npx tsx scripts/replay.ts <file.json> [--max-ms N]` — verify a replay record v1 (SIM-R1, `src/sim/replay.ts`;
 * GDD §5 "Replay record v1"). Prints the level, seed, rules id, command count (player / AI), re-runs the match
 * headlessly from the record alone (no AI involved: every command is in the file), prints the outcome, the time,
 * the final-state hash and whether it matches the recorded one. Exit 1 on a mismatch (or a continued / open
 * record, which cannot be verified), 2 on a bad file or an unknown level.
 *
 * `npx tsx scripts/replay.ts --record <level> <seed> [--out file.json] [--max-ms N]` — record the reference player
 * vs the level's enemies headlessly (scripts/lib/recordReplay.ts, the `runHeadless` loop) and write the record
 * (stdout without `--out`). The committed fixture tests/fixtures/replay-l15-s1.json is `--record 15 1`; re-record
 * it when a sim rule changes (the node test and the e2e read its hash).
 *
 * Get a record from the browser with `window.__towerclash.getReplay()` (debug surface; a JSON string).
 *
 * `npx tsx scripts/replay.ts --from-log <log.txt> [--row N] [--out file.json]` (DIAG-2, frontend; argument
 * parsing only) — the file is a tester's pasted Diagnostics COPY LOG text: take its last `#replay <row> <json>`
 * line (or row N's), write it with `--out`, and verify it as above.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelDef } from '../src/sim/types';
import { parseReplay, rulesId, serializeReplay, verifyReplay } from '../src/sim/replay';
import type { Replay } from '../src/sim/replay';
import { referencePlayerCommands } from '../src/ai/index';
import { recordHeadless } from './lib/recordReplay';

const DIR = join(import.meta.dirname, '..', 'src', 'levels');

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--row' && args[i - 1] !== '--out' && args[i - 1] !== '--max-ms');
const opt = (name: string, def: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1]! : def;
};
const maxMs = Number(opt('--max-ms', '180000'));
const recordAt = args.indexOf('--record');
const fromLog = args.includes('--from-log');

/** DIAG-2: the record JSON of a COPY LOG text — the last `#replay <row> {…}` line, or row `--row N`'s. */
function replayFromLog(text: string, row: string): string {
  const lines = text.split(/\r?\n/).filter((l) => /^#replay \d+ \{/.test(l) && (row === '' || l.startsWith(`#replay ${row} `)));
  if (lines.length === 0) throw new Error(`no #replay line${row ? ` for row ${row}` : ''} in the log`);
  const json = lines.at(-1)!.replace(/^#replay \d+ /, '');
  if (json.includes('"dropped"')) throw new Error(`the record was not kept (${json})`);
  return json;
}

/** The shipped level with `id` (the JSON files of src/levels, like scripts/reclock.ts reads them). */
function loadLevelSync(id: number): LevelDef | undefined {
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.json')).sort()) {
    const level = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as LevelDef;
    if (level.id === id) return level;
  }
  return undefined;
}

if (recordAt >= 0) {
  const id = Number(args[recordAt + 1]);
  const seed = Number(args[recordAt + 2]);
  const level = loadLevelSync(id);
  if (!level || !Number.isInteger(seed)) {
    console.error('usage: npx tsx scripts/replay.ts --record <level> <seed> [--out file.json] [--max-ms N]');
    process.exit(2);
  }
  const { replay } = recordHeadless(level, seed, referencePlayerCommands, maxMs);
  const json = serializeReplay(replay);
  const out = opt('--out', '');
  if (out) {
    writeFileSync(out, json + '\n');
    console.log(`replay: level ${level.id} "${level.name}" seed ${seed}: ${replay.commands.length} command(s), ${replay.outcome!.result} at ${(replay.outcome!.timeMs / 1000).toFixed(2)} s, hash ${replay.outcome!.hash}, ${json.length} B → ${out}`);
  } else {
    console.log(json);
  }
  process.exit(0);
}

if (!file) {
  console.error('usage: npx tsx scripts/replay.ts <file.json> [--max-ms N] | --from-log <log.txt> [--row N] [--out file.json] | --record <level> <seed> [--out file.json]');
  process.exit(2);
}

let replay: Replay;
try {
  const text = readFileSync(file, 'utf8');
  const json = fromLog ? replayFromLog(text, opt('--row', '')) : text;
  replay = parseReplay(json);
  if (fromLog && opt('--out', '')) writeFileSync(opt('--out', ''), json + '\n');
} catch (err) {
  console.error(`replay: cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}
const level = loadLevelSync(replay.levelId);
if (!level) {
  console.error(`replay: level ${replay.levelId} is not a shipped level`);
  process.exit(2);
}

const ai = replay.commands.filter((e) => e.a === 1).length;
console.log(`replay: level ${level.id} "${level.name}"  seed ${replay.seed}  rules ${replay.rules}${replay.rules === rulesId() ? '' : ` (this build: ${rulesId()})`}`);
console.log(`replay: ${replay.commands.length} command(s) — ${replay.commands.length - ai} player, ${ai} AI${replay.ai ? `; level ai ${JSON.stringify(replay.ai)}` : ''}${replay.continued ? '; CONTINUED (not verifiable)' : ''}`);
console.log(
  `replay: modifiers production ×${replay.modifiers.productionMul} capacity ×${replay.modifiers.capacityMul} garrison +${replay.modifiers.startGarrisonBonus} speed ×${replay.modifiers.unitSpeedMul}`,
);
if (replay.outcome) console.log(`replay: recorded ${replay.outcome.result} at ${(replay.outcome.timeMs / 1000).toFixed(2)} s, hash ${replay.outcome.hash}`);
else console.log(`replay: open record (no outcome) — re-running to ${maxMs / 1000} s`);

const v = verifyReplay(level, replay, { maxMs });
console.log(`replay: re-run ${v.outcome} at ${(v.timeMs / 1000).toFixed(2)} s, hash ${v.hash}`);
if (v.matches) {
  console.log(`replay: MATCH${v.rulesMatch ? '' : ' (rules id differs from this build — same result nonetheless)'}`);
} else {
  const why =
    v.reason === 'open' ? 'the record has no outcome to compare with'
    : v.reason === 'continued' ? 'the match used the Continue rewind (v1 records do not replay it)'
    : v.reason === 'time' ? `ended at ${v.timeMs} ms, recorded ${replay.outcome!.timeMs} ms`
    : v.reason === 'outcome' ? `outcome ${v.outcome}, recorded ${replay.outcome!.result}`
    : `hash ${v.hash}, recorded ${v.expected}`;
  console.log(`replay: MISMATCH — ${why}${v.rulesMatch ? '' : ' (rules id differs from this build: a sim constant changed since the record)'}`);
  process.exit(1);
}
