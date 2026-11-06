/**
 * `npx tsx scripts/reclock.ts [--seeds 20] [--write] [--only a-b]` — derive star clocks from the reference
 * player (GDD §3 "Pacing / star clocks"): star3 = 0.9 × median (K seeds) rounded to 5 s; star2 = max(2 × star3,
 * worst win rounded up to 5 s); both capped at 180 s; then the boundary step: if ≥ 80 % of 10 max-upgrade runs
 * would be 3★ at that clock, star3 steps down 5 s once. Pinned levels (`KEEP`) are reported but never written
 * (level 1 = tutorial clock, level 33 = the first shipped weekly target). AUD-B10 (2026-11-02) tie floor: star2 is
 * also at least the slower of the naive first-time line's two tie orders (`asc`, `tie desc`; K seeds, 4 s
 * reactions) rounded up to 5 s — on levels 1–16 always, past 16 on a daily-pool level whose two medians differ by
 * > 5 s; defined at K = 20 (a lower K warns that floors are provisional). A floor that would raise today's star2
 * is applied only when the two orders' 2★ counts differ by ≥ 8 of 20 (else `floor would be X — not applied`).
 * Rule and filter: `scripts/lib/reclockRule.ts`. Without `--write` it only prints.
 *
 * LV-12 (2026-11-06), for the day the human playtest sets clocks (docs/reviews/2026-11-05-human-playtest-sheet.md §C):
 * - `HUMAN` (`scripts/lib/reclockPins.ts`, beside `KEEP`; id → { star3?, star2?, source: 'sheet YYYY-MM-DD', note })
 *   pins one clock to the human-set value: the row prints it as `human-pinned` next to what the bot would propose,
 *   it never counts as `CHANGED`, and `--write` writes the pin, not the bot. Empty today. There is no
 *   `--human <file.csv>` option on purpose: `scripts/playtestDecide.ts` (`npm run playtest:decide`, QA-36) turns a
 *   filled sheet into proposals (its HUMAN JSON is checked with `validateHumanPins`), and a proposal becomes a pin
 *   only by hand after the stakeholder's sign-off (one entry, with its sheet date).
 * - `--gd12` reports the GD-12 card-reader star2 floor on 17–50 (GDD §3 "Star-2 floor after launch", AUD-B5):
 *   each level's shipped card spec (`scripts/lib/cardSpecs.ts`) run through the `--follow` machinery in both tie
 *   orders at K, the slower median rounded up to 5 s, capped at 180 s, never below the bot's star2; the row's
 *   `gd12` column says `BELOW` where today's clock is under it, and a table of 17–50 follows the rows. It is
 *   reported, not applied: `--write --gd12-apply` is the AUD-B5 switch (refused without `--write`; a
 *   human-pinned star2 is never raised by it). A level without a card spec reads the plain naive line, marked.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelDef } from '../src/sim/types';
import { CARD_SPECS, missingCardSpecs } from './lib/cardSpecs';
import { HUMAN, KEEP, validateHumanPins } from './lib/reclockPins';
import { GD12_APPLY_REFUSAL, formatReclockRow, gd12Applies, gd12Line, proposeClocks, provisionalWarning, reclockLevel } from './lib/reclockRule';
import type { Gd12Line } from './lib/reclockRule';

const DIR = join(import.meta.dirname, '..', 'src', 'levels');

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1]! : def;
};
const seeds = Number(opt('--seeds', '20'));
const write = args.includes('--write');
const gd12Apply = args.includes('--gd12-apply');
const gd12 = args.includes('--gd12') || gd12Apply;
const [onlyA, onlyB] = opt('--only', '1-50').split('-').map(Number) as [number, number];

// The AUD-B5 switch: the GD-12 floor is written only when both flags are given; nothing else runs otherwise.
if (gd12Apply && !write) {
  console.error(GD12_APPLY_REFUSAL);
  process.exit(1);
}
validateHumanPins(HUMAN);
const missing = missingCardSpecs();
if (gd12 && missing.length > 0) console.log(`reclock: WARNING no CARD_SPECS entry for ${missing.join(', ')} — those rows read the plain naive line`);

const warning = provisionalWarning(seeds);
if (warning) console.log(warning);

let changed = 0;
const changedIds: number[] = [];
const heldIds: number[] = [];
const pinnedIds: number[] = [];
const mismatchIds: number[] = [];
const gd12Rows: { level: LevelDef; line: Gd12Line; applied: boolean }[] = [];
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  const path = join(DIR, file);
  const raw = readFileSync(path, 'utf8');
  const level = JSON.parse(raw) as LevelDef;
  if (level.id < onlyA || level.id > onlyB) continue;
  const row = reclockLevel(level, seeds);
  if (!row) {
    console.log(`${level.id}\t${level.name}\tNO WINS`);
    continue;
  }
  const keep = KEEP[level.id];
  const pin = HUMAN[level.id];
  // The GD-12 floor reads the bot's proposed star2 (base + tie floor) as its own floor, never a pin.
  const line = gd12 && gd12Applies(level.id) ? gd12Line(level, seeds, CARD_SPECS[level.id], level.star2, row.star2) : undefined;
  const proposal = proposeClocks(row, pin, line, gd12Apply);
  const report = formatReclockRow(row, { keep, pin, gd12: line, gd12Apply });
  if (report.held) heldIds.push(level.id);
  if (report.pinned) pinnedIds.push(level.id);
  if (report.pinMismatch) mismatchIds.push(level.id);
  if (report.changed) changedIds.push(level.id);
  if (line) gd12Rows.push({ level, line, applied: proposal.gd12Applied && !keep });
  console.log(report.text);
  if (!report.changed || !write) continue;
  const next = raw.replace(/"star3": \d+/, `"star3": ${proposal.star3}`).replace(/"star2": \d+/, `"star2": ${proposal.star2}`);
  writeFileSync(path, next);
  changed++;
}
console.log(
  `reclock: CHANGED ${changedIds.join(', ') || 'none'}; tie floor held back (2★ gap filter) ${heldIds.join(', ') || 'none'}; human-pinned ${pinnedIds.join(', ') || 'none'}${mismatchIds.length ? `; PIN ≠ JSON on ${mismatchIds.join(', ')} — edit the JSON by hand` : ''}`,
);
if (gd12) {
  const below = gd12Rows.filter((r) => r.line.below).map((r) => r.level.id);
  const applied = gd12Rows.filter((r) => r.applied).map((r) => r.level.id);
  console.log('');
  console.log('GD-12 card-reader star2 floor (17–50; the slower of the card reader\'s asc / tie desc medians, rounded up to 5 s)');
  console.log('lvl\tstar2 today\tGD-12 floor\tbelow?\tcard reader asc/desc\tspec (source)');
  for (const { level, line, applied: a } of gd12Rows) {
    const floor = line.floorMs === undefined ? '—' : `${line.floorMs / 1000}`;
    const verdict = line.floorMs === undefined ? 'no win' : a ? 'applied' : line.below ? 'YES' : 'no';
    const med = (ms: number | undefined): string => (ms === undefined ? '—' : (ms / 1000).toFixed(1));
    const spec = line.spec ?? 'naive (no card spec)';
    console.log(`${level.id}\t${level.star2 / 1000}\t${floor}\t${verdict}\t${med(line.asc.medianMs)}/${med(line.desc.medianMs)} (${line.asc.wins}/${seeds}, ${line.desc.wins}/${seeds})\t${spec} (${line.source})`);
  }
  console.log(
    gd12Apply
      ? `reclock: GD-12 floor applied on ${applied.join(', ') || 'none'} (AUD-B5 switch --write --gd12-apply)`
      : `reclock: GD-12 floor BELOW today's star2 on ${below.join(', ') || 'none'} — reported, not applied (the AUD-B5 switch is --write --gd12-apply)`,
  );
}
if (warning) console.log(warning);
console.log(write ? `reclock: ${changed} level(s) written — run npm run levels:manifest` : 'reclock: dry run (add --write)');
