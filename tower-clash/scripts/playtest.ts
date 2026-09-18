/**
 * `npm run playtest [-- --level N] [-- --seed S] [-- --seeds N] [-- --upgrades none|max]`
 * `npm run playtest -- --daily YYYY-MM-DD [--days N] [--seeds K] [--no-twist]`
 * `npm run playtest -- --twist <plain|lean|fastFeet|thinWalls|reinforced> [--seeds K]`
 * Headless balance run: for every level (or one), simulate (a) the reference player vs the enemies and
 * (b) an idle player vs the enemies, 50 ms ticks, AI every 500 ms, up to 180 s of sim time.
 *
 * Single-seed mode (default, `--seed S`): gates are (a) must win within 180 s; (b) must not win.
 * Multi-seed mode (`--seeds N`): runs (a) and (b) over seeds 1..N and prints per level wins/N, the star
 * distribution, median win time, worst time and the losing seeds. Gates: levels 1–8 must win every
 * seed, later levels ≥ 95 %; the idle player must never win.
 * `--upgrades max` gives the player every Commander upgrade at its cap (ECONOMY.md §3.2; read from the
 * catalog). Extra gate: the reference player's median stars over every level × seed must stay ≤ 2.5
 * (upgrades help, they do not trivialise). Exit 1 if any gate fails.
 * Daily mode (`--daily D`): the reference player on each day's Daily Challenge (`challengeFor`: level
 * 9–40, fixed seed, twist modifiers on the player side; no Commander upgrades) for D and the next N−1
 * days (`--days N`, default 1). `--seeds K` (default 1) measures each day over K seeds starting at the
 * fixed one (seed, seed+1, …). One row per day: level, twist, fixed-seed result, wins/K, median win
 * time, stars at the fixed seed. Gates: every day's fixed-seed run is won and wins/K ≥ 90 %.
 * `--no-twist` runs the same days and seeds without the twist — the control for blaming a twist or a level.
 * Twist mode (`--twist <id>`, GDD §7.5 item 3): the reference player on every pool level (9–40) with
 * that twist's modifiers over seeds 1..K (`--seeds K`, default 5). One row per level; gate per level:
 * wins/K ≥ 80 % (4/5 at K = 5), every win under 180 s.
 * Rng streams come from `rngsFor`, exactly as the game client derives them.
 */
import { performance } from 'node:perf_hooks';
import { loadAllLevels, loadLevel } from '../src/levels/index';
import { C, DEFAULT_MODIFIERS } from '../src/sim/index';
import type { LevelDef, PlayerModifiers } from '../src/sim/index';
import { referencePlayerCommands } from '../src/ai/index';
import { HEADLESS_MAX_MS, runHeadless, starsFor } from '../src/ai/headless';
import type { RunResult } from '../src/ai/headless';
import { maxedModifiers } from '../src/economy/maxUpgrades';
import { DAILY_WIN_RATE, TWIST_WIN_RATE, dailyPlan, inPool, runDaily, runTwist, twistById } from './lib/daily';
import type { DailyRow, TwistRow } from './lib/daily';
import { TWISTS } from '../src/daily/challenge';
import type { Twist } from '../src/daily/challenge';

export { runHeadless } from '../src/ai/headless';

const MAX_MS = HEADLESS_MAX_MS;
const DEFAULT_SEED = 1;
/** Multi-seed gate: levels up to this id must win every seed. */
const TUTORIAL_BAND_LAST = 8;
/** Multi-seed gate for later levels. */
const LATER_WIN_RATE = 0.95;
/** `--upgrades max` gate (ECONOMY.md §3.2): median stars over every level × seed. */
export const MAX_UPGRADES_MEDIAN_STARS = 2.5;

type Upgrades = 'none' | 'max';

interface Args {
  level?: number;
  seed: number;
  seeds?: number;
  upgrades: Upgrades;
  /** `--daily D`: first day key of the daily-challenge sweep. */
  daily?: string;
  /** `--days N`: number of consecutive days from `daily`. */
  days: number;
  /** `--no-twist`: daily mode without the twist modifiers (control run). */
  twist: boolean;
  /** `--twist <id>`: pool × twist sweep under this twist. */
  twistId?: Twist['id'];
}

function parseArgs(argv: string[]): Args {
  let level: number | undefined;
  let seed = DEFAULT_SEED;
  let seeds: number | undefined;
  let upgrades = 'none';
  let daily: string | undefined;
  let days = 1;
  let twist = true;
  let twistId: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === '--level' && next !== undefined) level = Number(next);
    else if (arg.startsWith('--level=')) level = Number(arg.slice('--level='.length));
    else if (arg === '--seeds' && next !== undefined) seeds = Number(next);
    else if (arg.startsWith('--seeds=')) seeds = Number(arg.slice('--seeds='.length));
    else if (arg === '--seed' && next !== undefined) seed = Number(next);
    else if (arg.startsWith('--seed=')) seed = Number(arg.slice('--seed='.length));
    else if (arg === '--upgrades' && next !== undefined) upgrades = next;
    else if (arg.startsWith('--upgrades=')) upgrades = arg.slice('--upgrades='.length);
    else if (arg === '--daily' && next !== undefined) daily = next;
    else if (arg.startsWith('--daily=')) daily = arg.slice('--daily='.length);
    else if (arg === '--days' && next !== undefined) days = Number(next);
    else if (arg.startsWith('--days=')) days = Number(arg.slice('--days='.length));
    else if (arg === '--no-twist') twist = false;
    else if (arg === '--twist' && next !== undefined) twistId = next;
    else if (arg.startsWith('--twist=')) twistId = arg.slice('--twist='.length);
  }
  if (level !== undefined && !Number.isInteger(level)) throw new Error(`bad --level ${String(level)}`);
  if (!Number.isInteger(seed)) throw new Error(`bad --seed ${String(seed)}`);
  if (seeds !== undefined && (!Number.isInteger(seeds) || seeds < 1)) throw new Error(`bad --seeds ${String(seeds)}`);
  if (upgrades !== 'none' && upgrades !== 'max') throw new Error(`bad --upgrades ${upgrades} (none|max)`);
  if (daily !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(daily)) throw new Error(`bad --daily ${daily} (YYYY-MM-DD)`);
  if (!Number.isInteger(days) || days < 1) throw new Error(`bad --days ${String(days)}`);
  const twistDef = twistId === undefined ? undefined : twistById(twistId);
  if (twistId !== undefined && !twistDef) throw new Error(`bad --twist ${twistId} (${TWISTS.map((t) => t.id).join('|')})`);
  if (twistDef && daily !== undefined) throw new Error('--twist and --daily are separate modes');
  return { level, seed, seeds, upgrades, daily, days, twist, twistId: twistDef?.id };
}

/** Re-exported for tools that used to read the max ladder from here (QA-3: the catalog is the source). */
export { maxedModifiers } from '../src/economy/maxUpgrades';

export function modifiersFor(upgrades: Upgrades): Readonly<PlayerModifiers> {
  return upgrades === 'max' ? maxedModifiers() : DEFAULT_MODIFIERS;
}

function fmtTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function starGlyphs(stars: number): string {
  return `${'*'.repeat(stars)}${' '.repeat(3 - stars)}`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

/** Median of a list of numbers (average of the two middle values for an even count); undefined for none. */
export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

async function selectLevels(only: number | undefined): Promise<LevelDef[]> {
  const all = await loadAllLevels();
  const levels = only === undefined ? all : all.filter((l) => l.id === only);
  if (levels.length === 0) {
    console.error(`No level with id ${String(only)}`);
    process.exit(1);
  }
  return levels;
}

/** Star distribution of a set of runs: index = stars (0..3), value = count. */
export type StarCounts = [number, number, number, number];

export interface LevelRow {
  level: LevelDef;
  seeds: number[];
  /** Reference-player result per seed, in `seeds` order. */
  ref: RunResult[];
  /** Idle-player result per seed, in `seeds` order. */
  idle: RunResult[];
  wins: number;
  stars: number[];
  starCounts: StarCounts;
  medianStars: number | undefined;
  medianMs: number | undefined;
  worstMs: number | undefined;
  losers: number[];
  /** Seeds on which doing nothing won (must be empty). */
  idleWins: number[];
  ticks: number;
}

/** Reference and idle player over the given seeds for one level. */
export function runLevel(level: LevelDef, seeds: readonly number[], modifiers: Readonly<PlayerModifiers>): LevelRow {
  const ref: RunResult[] = [];
  const idle: RunResult[] = [];
  const stars: number[] = [];
  const starCounts: StarCounts = [0, 0, 0, 0];
  const winTimes: number[] = [];
  const losers: number[] = [];
  const idleWins: number[] = [];
  let ticks = 0;
  for (const seed of seeds) {
    const r = runHeadless(level, seed, referencePlayerCommands, { modifiers });
    const i = runHeadless(level, seed, undefined, { modifiers });
    ref.push(r);
    idle.push(i);
    ticks += r.ticks + i.ticks;
    const s = starsFor(level, r);
    stars.push(s);
    starCounts[s]++;
    if (r.outcome === 'won') winTimes.push(r.timeMs);
    else losers.push(seed);
    if (i.outcome === 'won') idleWins.push(seed);
  }
  return {
    level,
    seeds: [...seeds],
    ref,
    idle,
    wins: winTimes.length,
    stars,
    starCounts,
    medianStars: median(stars),
    medianMs: median(winTimes),
    worstMs: winTimes.length ? Math.max(...winTimes) : undefined,
    losers,
    idleWins,
    ticks,
  };
}

/** Required win rate for a level in multi-seed mode. */
export function winRateGate(levelId: number): number {
  return levelId <= TUTORIAL_BAND_LAST ? 1 : LATER_WIN_RATE;
}

/** Kept for callers of the previous API: reference player over seeds 1..n, no upgrades. */
export function runSeeds(level: LevelDef, n: number): LevelRow {
  return runLevel(level, Array.from({ length: n }, (_, i) => i + 1), DEFAULT_MODIFIERS);
}

function fmtStarCounts(c: StarCounts): string {
  return `${c[3]}/${c[2]}/${c[1]}/${c[0]}`;
}

function fmtModifiers(m: Readonly<PlayerModifiers>): string {
  return `prod x${m.productionMul} cap x${m.capacityMul} garrison +${m.startGarrisonBonus} speed x${m.unitSpeedMul}`;
}

/** Overall star summary and the `--upgrades max` gate; returns the number of failed gates (0 or 1). */
function summariseStars(rows: LevelRow[], upgrades: Upgrades): number {
  const all = rows.flatMap((r) => r.stars);
  const counts: StarCounts = [0, 0, 0, 0];
  for (const s of all) counts[s as 0 | 1 | 2 | 3]++;
  const med = median(all) ?? 0;
  const perLevel = rows.map((r) => r.medianStars ?? 0);
  const levelMedian = median(perLevel) ?? 0;
  console.log(
    `stars over ${all.length} run(s): 3*/2*/1*/0* = ${fmtStarCounts(counts)}, median ${med.toFixed(1)} (median of per-level medians ${levelMedian.toFixed(1)})`,
  );
  if (upgrades !== 'max') return 0;
  if (med <= MAX_UPGRADES_MEDIAN_STARS) {
    console.log(`upgrades=max gate ok: median stars ${med.toFixed(1)} <= ${MAX_UPGRADES_MEDIAN_STARS}`);
    return 0;
  }
  console.log(`upgrades=max gate FAIL: median stars ${med.toFixed(1)} > ${MAX_UPGRADES_MEDIAN_STARS} (upgrades trivialise the game)`);
  const hot = rows.filter((r) => (r.medianStars ?? 0) > MAX_UPGRADES_MEDIAN_STARS);
  for (const r of hot) {
    console.log(`  lvl ${r.level.id} ${r.level.name}: median ${r.medianStars!.toFixed(1)}*, 3*/2*/1*/0* = ${fmtStarCounts(r.starCounts)}`);
  }
  return 1;
}

/** Default mode: one seed, reference player and idle player, both gates. */
function runSingleSeed(levels: LevelDef[], seed: number, upgrades: Upgrades): number {
  const mods = modifiersFor(upgrades);
  const header = `${pad('lvl', 4)} ${pad('name', 20)} ${pad('reference player', 24)} ${pad('idle player', 16)} gate`;
  console.log(`playtest  seed=${seed}  upgrades=${upgrades} (${fmtModifiers(mods)})  max=${fmtTime(MAX_MS)}  tick=${C.TICK_MS}ms  ai=${C.AI_TICK_MS}ms`);
  console.log(header);
  console.log('-'.repeat(header.length));

  let failed = 0;
  let totalTicks = 0;
  const rows: LevelRow[] = [];
  const t0 = performance.now();
  for (const level of levels) {
    const row = runLevel(level, [seed], mods);
    rows.push(row);
    totalTicks += row.ticks;
    const ref = row.ref[0]!;
    const idle = row.idle[0]!;

    const reasons: string[] = [];
    if (ref.outcome !== 'won') reasons.push(`reference player ${ref.outcome === 'lost' ? 'lost' : 'did not win'} by ${fmtTime(MAX_MS)}`);
    if (idle.outcome === 'won') reasons.push(`idle player won at ${fmtTime(idle.timeMs)}`);
    if (reasons.length) failed++;

    const refCell = ref.outcome === 'won' ? `won ${fmtTime(ref.timeMs)} ${starGlyphs(starsFor(level, ref))}` : `${ref.outcome} ${fmtTime(ref.timeMs)}`;
    const idleCell = idle.outcome === 'playing' ? `alive ${fmtTime(idle.timeMs)}` : `${idle.outcome} ${fmtTime(idle.timeMs)}`;
    const gate = reasons.length ? `FAIL: ${reasons.join('; ')}` : 'ok';
    console.log(`${pad(String(level.id), 4)} ${pad(level.name, 20)} ${pad(refCell, 24)} ${pad(idleCell, 16)} ${gate}`);
  }
  const elapsed = (performance.now() - t0) / 1000;
  console.log('-'.repeat(header.length));
  failed += summariseStars(rows, upgrades);
  console.log(
    `${levels.length} level(s), ${failed} failed gate(s). perf: ${totalTicks} ticks in ${elapsed.toFixed(2)}s = ${Math.round(totalTicks / Math.max(elapsed, 1e-6))} ticks/s`,
  );
  return failed;
}

/** Multi-seed mode: reference and idle player over seeds 1..n per level, win-rate gates by band. */
function runMultiSeed(levels: LevelDef[], n: number, upgrades: Upgrades): number {
  const mods = modifiersFor(upgrades);
  const seeds = Array.from({ length: n }, (_, i) => i + 1);
  const header = `${pad('lvl', 4)} ${pad('name', 20)} ${pad('wins', 8)} ${pad('3*/2*/1*/0*', 12)} ${pad('med*', 5)} ${pad('median', 8)} ${pad('worst', 8)} ${pad('idle', 6)} ${pad('gate', 6)} losing seeds`;
  console.log(
    `playtest  seeds=1..${n}  upgrades=${upgrades} (${fmtModifiers(mods)})  max=${fmtTime(MAX_MS)}  gate: lvl 1-${TUTORIAL_BAND_LAST} 100%, later >= ${Math.round(LATER_WIN_RATE * 100)}%, idle never wins`,
  );
  console.log(header);
  console.log('-'.repeat(header.length));

  let failed = 0;
  let totalTicks = 0;
  const rows: LevelRow[] = [];
  const t0 = performance.now();
  for (const level of levels) {
    const row = runLevel(level, seeds, mods);
    rows.push(row);
    totalTicks += row.ticks;
    const rate = row.wins / n;
    const ok = rate >= winRateGate(level.id) && row.idleWins.length === 0;
    if (!ok) failed++;
    const wins = `${row.wins}/${n}`;
    const med = row.medianStars === undefined ? '-' : row.medianStars.toFixed(1);
    const medianT = row.medianMs === undefined ? '-' : fmtTime(row.medianMs);
    const worst = row.worstMs === undefined ? '-' : fmtTime(row.worstMs);
    const idle = row.idleWins.length ? `WON:${row.idleWins.join(',')}` : 'ok';
    const losers = row.losers.length ? row.losers.join(',') : '-';
    console.log(
      `${pad(String(level.id), 4)} ${pad(level.name, 20)} ${pad(wins, 8)} ${pad(fmtStarCounts(row.starCounts), 12)} ${pad(med, 5)} ${pad(medianT, 8)} ${pad(worst, 8)} ${pad(idle, 6)} ${pad(ok ? 'ok' : 'FAIL', 6)} ${losers}`,
    );
  }
  const elapsed = (performance.now() - t0) / 1000;
  console.log('-'.repeat(header.length));
  failed += summariseStars(rows, upgrades);
  console.log(
    `${levels.length} level(s) x ${n} seed(s), ${failed} failed gate(s). perf: ${totalTicks} ticks in ${elapsed.toFixed(2)}s = ${Math.round(totalTicks / Math.max(elapsed, 1e-6))} ticks/s`,
  );
  return failed;
}

/**
 * Daily mode: the reference player on each day's challenge (level, fixed seed, twist modifiers, no
 * upgrades) over K seeds from the fixed one. Gate per day: fixed seed won and wins/K >= 90 %.
 */
async function runDailyMode(from: string, days: number, k: number, twist: boolean): Promise<number> {
  const plan = dailyPlan(from, days);
  const header = `${pad('day', 10)} ${pad('lvl', 4)} ${pad('name', 20)} ${pad('twist', 10)} ${pad('fixed seed', 22)} ${pad('wins', 6)} ${pad('median', 8)} ${pad('stars', 6)} ${pad('gate', 6)} losing seeds`;
  console.log(
    `playtest daily  ${from} +${days - 1} day(s)  seeds=K=${k} (fixed, fixed+1, …)  twist=${twist ? 'on' : 'OFF (control)'}  upgrades=none  max=${fmtTime(MAX_MS)}  gate: fixed seed won, wins/K >= ${Math.round(DAILY_WIN_RATE * 100)}%`,
  );
  console.log(header);
  console.log('-'.repeat(header.length));

  const rows: DailyRow[] = [];
  let totalTicks = 0;
  const t0 = performance.now();
  for (const challenge of plan) {
    const level = await loadLevel(challenge.levelId);
    if (!level) {
      console.error(`No level with id ${challenge.levelId} for ${challenge.dayKey}`);
      process.exit(1);
    }
    const row = runDaily(challenge, level, k, twist);
    rows.push(row);
    totalTicks += row.ticks;
    const fixed = row.fixed.outcome === 'won' ? `won ${fmtTime(row.fixed.timeMs)} (seed ${challenge.seed})` : `${row.fixed.outcome} ${fmtTime(row.fixed.timeMs)} (seed ${challenge.seed})`;
    const medianT = row.medianMs === undefined ? '-' : fmtTime(row.medianMs);
    const losers = row.losers.length ? row.losers.join(',') : '-';
    console.log(
      `${pad(challenge.dayKey, 10)} ${pad(String(level.id), 4)} ${pad(level.name, 20)} ${pad(challenge.twist.id, 10)} ${pad(fixed, 22)} ${pad(`${row.wins}/${k}`, 6)} ${pad(medianT, 8)} ${pad(starGlyphs(row.fixedStars), 6)} ${pad(row.ok ? 'ok' : 'FAIL', 6)} ${losers}`,
    );
  }
  const elapsed = (performance.now() - t0) / 1000;
  console.log('-'.repeat(header.length));

  const failed = rows.filter((r) => !r.ok);
  const fixedLost = rows.filter((r) => r.fixed.outcome !== 'won');
  const totalRuns = rows.length * k;
  const totalWins = rows.reduce((n, r) => n + r.wins, 0);
  const starCounts: StarCounts = [0, 0, 0, 0];
  for (const r of rows) starCounts[r.fixedStars]++;
  const byTwist = new Map<string, { days: number; wins: number; runs: number }>();
  for (const r of rows) {
    const t = byTwist.get(r.challenge.twist.id) ?? { days: 0, wins: 0, runs: 0 };
    t.days++;
    t.wins += r.wins;
    t.runs += k;
    byTwist.set(r.challenge.twist.id, t);
  }
  const levelsUsed = new Set(rows.map((r) => r.level.id));
  console.log(
    `${rows.length} day(s) over ${levelsUsed.size} level(s): fixed seed won ${rows.length - fixedLost.length}/${rows.length}, all seeds ${totalWins}/${totalRuns} (${((100 * totalWins) / totalRuns).toFixed(1)}%), fixed-seed stars 3*/2*/1*/0* = ${fmtStarCounts(starCounts)}`,
  );
  for (const [id, t] of byTwist) console.log(`  twist ${pad(id, 10)} ${t.days} day(s), wins ${t.wins}/${t.runs} (${((100 * t.wins) / t.runs).toFixed(1)}%)`);
  for (const r of failed) {
    const why: string[] = [];
    if (r.fixed.outcome !== 'won') why.push(`fixed seed ${r.challenge.seed} ${r.fixed.outcome}`);
    if (r.wins / k < DAILY_WIN_RATE) why.push(`${r.wins}/${k} < ${Math.round(DAILY_WIN_RATE * 100)}%`);
    console.log(`  FAIL ${r.challenge.dayKey} lvl ${r.level.id} ${r.level.name} [${r.challenge.twist.id}]: ${why.join('; ')}`);
  }
  console.log(
    `${failed.length} failed day(s). perf: ${totalTicks} ticks in ${elapsed.toFixed(2)}s = ${Math.round(totalTicks / Math.max(elapsed, 1e-6))} ticks/s`,
  );
  return failed.length;
}

/**
 * Twist mode: the reference player on every pool level under one twist over seeds 1..K. Gate per
 * level: wins/K >= TWIST_WIN_RATE (GDD §7.5 item 3: 4/5 at K = 5).
 */
async function runTwistMode(twistId: Twist['id'], k: number): Promise<number> {
  const twist = twistById(twistId)!;
  const levels = (await loadAllLevels()).filter(inPool);
  const header = `${pad('lvl', 4)} ${pad('name', 20)} ${pad('wins', 6)} ${pad('3*/2*/1*/0*', 12)} ${pad('median', 8)} ${pad('worst', 8)} ${pad('gate', 6)} losing seeds`;
  console.log(
    `playtest twist=${twist.id} (${fmtModifiers(twist.modifiers)})  pool lvl ${levels[0]?.id ?? '-'}-${levels[levels.length - 1]?.id ?? '-'}  seeds=1..${k}  upgrades=none  max=${fmtTime(MAX_MS)}  gate: wins/K >= ${Math.round(TWIST_WIN_RATE * 100)}%`,
  );
  console.log(header);
  console.log('-'.repeat(header.length));
  const rows: TwistRow[] = [];
  let totalTicks = 0;
  const t0 = performance.now();
  for (const level of levels) {
    const row = runTwist(level, twist, k);
    rows.push(row);
    totalTicks += row.ticks;
    const counts: StarCounts = [0, 0, 0, 0];
    for (const s of row.stars) counts[s]++;
    const medianT = row.medianMs === undefined ? '-' : fmtTime(row.medianMs);
    const worst = row.worstMs === undefined ? '-' : fmtTime(row.worstMs);
    const losers = row.losers.length ? row.losers.join(',') : '-';
    console.log(
      `${pad(String(level.id), 4)} ${pad(level.name, 20)} ${pad(`${row.wins}/${k}`, 6)} ${pad(fmtStarCounts(counts), 12)} ${pad(medianT, 8)} ${pad(worst, 8)} ${pad(row.ok ? 'ok' : 'FAIL', 6)} ${losers}`,
    );
  }
  const elapsed = (performance.now() - t0) / 1000;
  console.log('-'.repeat(header.length));
  const failed = rows.filter((r) => !r.ok);
  const totalWins = rows.reduce((n, r) => n + r.wins, 0);
  console.log(`${rows.length} level(s) x ${k} seed(s) under ${twist.id}: wins ${totalWins}/${rows.length * k} (${((100 * totalWins) / (rows.length * k)).toFixed(1)}%)`);
  for (const r of failed) console.log(`  FAIL lvl ${r.level.id} ${r.level.name} [${twist.id}]: ${r.wins}/${k} < ${Math.round(TWIST_WIN_RATE * 100)}% (lost ${r.losers.join(',')})`);
  console.log(`${failed.length} failed level(s). perf: ${totalTicks} ticks in ${elapsed.toFixed(2)}s = ${Math.round(totalTicks / Math.max(elapsed, 1e-6))} ticks/s`);
  return failed.length;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.twistId !== undefined) {
    const failed = await runTwistMode(args.twistId, args.seeds ?? 5);
    if (failed > 0) process.exit(1);
    return;
  }
  if (args.daily !== undefined) {
    const failed = await runDailyMode(args.daily, args.days, args.seeds ?? 1, args.twist);
    if (failed > 0) process.exit(1);
    return;
  }
  const levels = await selectLevels(args.level);
  const failed =
    args.seeds === undefined ? runSingleSeed(levels, args.seed, args.upgrades) : runMultiSeed(levels, args.seeds, args.upgrades);
  if (failed > 0) process.exit(1);
}

await main();
