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
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelDef } from '../src/sim/types';
import { provisionalWarning, reclockLevel } from './lib/reclockRule';
import type { TieLine } from './lib/reclockRule';

const DIR = join(import.meta.dirname, '..', 'src', 'levels');
const KEEP: Record<number, string> = { 1: 'tutorial clock', 33: 'weekly pin 2026-09-21' };

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1]! : def;
};
const seeds = Number(opt('--seeds', '20'));
const write = args.includes('--write');
const [onlyA, onlyB] = opt('--only', '1-50').split('-').map(Number) as [number, number];

const warning = provisionalWarning(seeds);
if (warning) console.log(warning);

const sec = (ms: number | undefined): string => (ms === undefined ? '—' : `${(ms / 1000).toFixed(1)}s`);
const tieCol = (asc: TieLine, desc: TieLine): string =>
  ` naive asc/desc ${sec(asc.medianMs)}/${sec(desc.medianMs)} 2★ ${asc.twoStar}/${desc.twoStar}`;

let changed = 0;
const changedIds: number[] = [];
const heldIds: number[] = [];
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
  const { star3, star2, same } = row;
  const losses = seeds - row.wins;
  const naive = row.asc && row.desc ? tieCol(row.asc, row.desc) : '';
  const floor = row.floor?.eligible
    ? row.floor.note
      ? ` — ${row.floor.note}`
      : row.floor.floorMs !== undefined
        ? ` floor ${row.floor.floorMs / 1000}`
        : ''
    : '';
  if (row.floor?.note) heldIds.push(level.id);
  const keep = KEEP[level.id];
  if (!same && !keep) changedIds.push(level.id);
  console.log(
    `${level.id}\t${level.name.padEnd(22)}\t${row.wins}/${seeds}${losses ? ` (${losses} lost)` : ''}\tmedian ${(row.medianMs / 1000).toFixed(1)}s\tworst ${(row.worstMs / 1000).toFixed(1)}s\t${level.star3 / 1000}/${level.star2 / 1000} → ${star3 / 1000}/${star2 / 1000}${row.step ? ` ${row.step}` : ''}${naive}${floor}${same ? '' : keep ? `\tKEPT (${keep})` : '\tCHANGED'}`,
  );
  if (same || keep || !write) continue;
  const next = raw.replace(/"star3": \d+/, `"star3": ${star3}`).replace(/"star2": \d+/, `"star2": ${star2}`);
  writeFileSync(path, next);
  changed++;
}
console.log(`reclock: CHANGED ${changedIds.join(', ') || 'none'}; tie floor held back (2★ gap filter) ${heldIds.join(', ') || 'none'}`);
if (warning) console.log(warning);
console.log(write ? `reclock: ${changed} level(s) written — run npm run levels:manifest` : 'reclock: dry run (add --write)');
