/**
 * `npx tsx scripts/reclock.ts [--seeds 20] [--write] [--only a-b]` — derive star clocks from the reference
 * player (GDD §3 "Pacing / star clocks"): star3 = 0.9 × median (K seeds) rounded to 5 s; star2 = max(2 × star3,
 * worst win rounded up to 5 s); both capped at 180 s; then the boundary step: if ≥ 80 % of 10 max-upgrade runs
 * would be 3★ at that clock, star3 steps down 5 s once. Pinned levels (`KEEP`) are reported but never written
 * (level 1 = tutorial clock, level 33 = the first shipped weekly target). Without `--write` it only prints.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelDef, PlayerModifiers } from '../src/sim/types';
import { referencePlayerCommands } from '../src/ai/referencePlayer';
import { runHeadless } from '../src/ai/headless';

const DIR = join(import.meta.dirname, '..', 'src', 'levels');
const KEEP: Record<number, string> = { 1: 'tutorial clock', 33: 'weekly pin 2026-09-21' };
const MAX_MODIFIERS: PlayerModifiers = { productionMul: 1.2, capacityMul: 1.25, startGarrisonBonus: 5, unitSpeedMul: 1.15 };
const CAP_MS = 180_000;

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1]! : def;
};
const seeds = Number(opt('--seeds', '20'));
const write = args.includes('--write');
const [onlyA, onlyB] = opt('--only', '1-50').split('-').map(Number) as [number, number];

const round5 = (ms: number): number => Math.round(ms / 5000) * 5000;
const ceil5 = (ms: number): number => Math.ceil(ms / 5000) * 5000;

let changed = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  const path = join(DIR, file);
  const raw = readFileSync(path, 'utf8');
  const level = JSON.parse(raw) as LevelDef;
  if (level.id < onlyA || level.id > onlyB) continue;
  const times: number[] = [];
  let losses = 0;
  for (let s = 1; s <= seeds; s++) {
    const r = runHeadless(level, s, referencePlayerCommands);
    if (r.outcome === 'won') times.push(r.timeMs);
    else losses++;
  }
  if (times.length === 0) {
    console.log(`${level.id}\t${level.name}\tNO WINS`);
    continue;
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor((times.length - 1) / 2)]!;
  const worst = times[times.length - 1]!;
  let star3 = Math.min(CAP_MS, round5(0.9 * median));
  let step = '';
  // Boundary step: maxed commander upgrades must not push a level to ≥ 80 % 3★.
  let threeStar = 0;
  for (let s = 1; s <= 10; s++) {
    const r = runHeadless(level, s, referencePlayerCommands, { modifiers: MAX_MODIFIERS });
    if (r.outcome === 'won' && r.timeMs <= star3) threeStar++;
  }
  if (threeStar >= 8 && star3 > 5000) {
    star3 -= 5000;
    step = ` step(${threeStar}/10)`;
  }
  const star2 = Math.min(CAP_MS, Math.max(2 * star3, ceil5(worst)));
  const same = star3 === level.star3 && star2 === level.star2;
  const keep = KEEP[level.id];
  console.log(
    `${level.id}\t${level.name.padEnd(22)}\t${times.length}/${seeds}${losses ? ` (${losses} lost)` : ''}\tmedian ${(median / 1000).toFixed(1)}s\tworst ${(worst / 1000).toFixed(1)}s\t${level.star3 / 1000}/${level.star2 / 1000} → ${star3 / 1000}/${star2 / 1000}${step}${same ? '' : keep ? `\tKEPT (${keep})` : '\tCHANGED'}`,
  );
  if (same || keep || !write) continue;
  const next = raw.replace(/"star3": \d+/, `"star3": ${star3}`).replace(/"star2": \d+/, `"star2": ${star2}`);
  writeFileSync(path, next);
  changed++;
}
console.log(write ? `reclock: ${changed} level(s) written — run npm run levels:manifest` : 'reclock: dry run (add --write)');
