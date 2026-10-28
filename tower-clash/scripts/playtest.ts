/**
 * `npm run playtest [-- --level N] [-- --seed S] [-- --seeds N] [-- --upgrades none|max]`
 * `npm run playtest -- --daily YYYY-MM-DD [--days N] [--seeds K] [--no-twist] [--naive [--react MS]]`
 * `npm run playtest -- --weekly YYYY-MM-DD(Monday) [--weeks N] [--seeds K] [--no-twist] [--naive [--react MS]]`
 * `npm run playtest -- --twist <plain|lean|fastFeet|thinWalls|reinforced> [--seeds K] [--pool a-b]`
 * `npm run playtest -- --naive [--seeds K] [--react MS] [--gate a-b] [--tie asc|desc|both] [--tie-exempt a[,b]]`
 * `npm run playtest -- --naive --level N --follow "prio=a,b;hold=c[@N];noprioFrom=d" [--seeds K] [--react MS]` (or `--prefer a,b [--hold c[@N]]`)
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
 * Weekly mode (`--weekly M`, GDD §8): the reference player on each week's Weekly Challenge
 * (`weeklyFor`: level 33–POOL_TO, fixed seed, a non-plain twist, 3★ target = the level's `star3`) for
 * the Monday M and the next N−1 weeks (`--weeks N`, default 1), K seeds from the fixed one (`--seeds K`,
 * default 1). One row per week: level, twist, fixed-seed result, wins/K, median, best time vs the target
 * and which seed(s) reach it. Gates per week: fixed seed won, wins/K ≥ 90 %, and at least one of the K
 * seeds finishes ≤ targetMs (else "level/clock item" for the Level Designer). A non-Monday key is an error.
 * Twist mode (`--twist <id>`, GDD §7.5 item 3): the reference player on every pool level (`--pool a-b`,
 * default POOL_FROM–POOL_TO) with that twist's modifiers over seeds 1..K (`--seeds K`, default 5). One
 * row per level; gate per level: wins/K ≥ 80 % (4/5 at K = 5), every win under 180 s.
 * Naive mode (`--naive`, QA-3): the naive human line (`scripts/lib/naivePlayer.ts` — every `--react MS`,
 * default 4000, each own tower with a free link streams to its nearest non-own tower; never unlinks, never
 * boosts) on every level over seeds 1..K (`--seeds K`, default 5). One row per level: wins/K, stars at the
 * level's clocks, median win time, and whether the line holds (≥ 50 % wins) within `star2`. No gate —
 * informational (exit 0); the summary line is what the report quotes.
 * `--daily … --naive` / `--weekly … --naive` (QA-7): the same naive line on each day's / week's challenge
 * (its level, fixed seed and twist, K seeds from the fixed one): one row per day / week with wins/K, the
 * median win time and whether the line holds (≥ 50 % wins). Informational, no gate (exit 0).
 * `--naive --level N --follow SPEC` (GD-6h, GDD §3.12 item 12 (a)): the literal card follower — the naive
 * line, but free links go first to the `prio` towers in order, `hold` towers wait for L2 (`hold=c@3`, GD-11g:
 * for L3), `noprioFrom` towers play plain naive. The naive row plus a "rule (a)" line (`ruleA`): on levels 1–16 the follower must
 * win the level's naive gate share (at 4 s) and keep its median within `star2`; past 16 (GD-8f, GDD §3.14
 * (a)) it must win ≥ 80 % and keep its `asc` median ≤ max(`star2`, plain naive `asc` median + 5 s) — the
 * runner also runs that plain naive row (same K and reaction, printed as `naive (bar)`); a naive line
 * under 50 % leaves the bar at `star2`; a `tie desc` row is judged on wins only. Informational (exit 0).
 * `--naive --tie desc|both` (GD-7f, GDD §3.12 (i) (c), §3.13 (f)): the naive line with the id tie-break of
 * its target reversed (larger id first on an exact (neutral-first, lane length) tie) — the other side of
 * every mirror pair. `desc` prints only that line, `both` one extra `tie desc` row per level under the
 * default row; `asc` (default) is today's output byte for byte. With `--gate a-b --tie both` a level fails
 * when either order is under its share; `reclock.ts`'s star2 floor stays on the `asc` median.
 * `--tie-exempt a[,b]` (QA-30, with `--gate … --tie both`): those levels' `tie desc` rows print `exempt`
 * and leave the gate (ids must be in `NAIVE_TIE_EXEMPT`: levels cured by a tutorial steer); `asc` stays gated.
 * The flag rules live in scripts/lib/playtestArgs.ts (unit-tested); rng streams come from `rngsFor`,
 * exactly as the game client derives them.
 */
import { performance } from 'node:perf_hooks';
import { loadAllLevels, loadLevel } from '../src/levels/index';
import { C, DEFAULT_MODIFIERS } from '../src/sim/index';
import type { LevelDef, PlayerModifiers } from '../src/sim/index';
import { referencePlayerCommands } from '../src/ai/index';
import { HEADLESS_MAX_MS, runHeadless, starsFor } from '../src/ai/headless';
import type { RunResult } from '../src/ai/headless';
import { maxedModifiers } from '../src/economy/maxUpgrades';
import { DAILY_WIN_RATE, TWIST_WIN_RATE, WEEKLY_WIN_RATE, dailyPlan, inPool, runDaily, runTwist, runWeekly, twistById, weeklyPlan } from './lib/daily';
import type { DailyRow, PoolRange, TwistRow, WeeklyRow } from './lib/daily';
import type { Twist } from '../src/daily/challenge';
import { NAIVE_GATE_LAST, NAIVE_REACT_MS, NAIVE_TIE_EXEMPT, NAIVE_WIN_RATE, formatFollowSpec, makeNaivePlayer, naiveGate, naiveGateMinWins, naiveGateRate, ruleA, runNaive } from './lib/naivePlayer';
import type { FollowSpec, NaiveGateRange, NaiveRow, NaiveTie } from './lib/naivePlayer';
import { parseArgs, tiesOf } from './lib/playtestArgs';
import type { TieMode, Upgrades } from './lib/playtestArgs';

export { runHeadless } from '../src/ai/headless';
export { parseArgs } from './lib/playtestArgs';
export type { Args, Upgrades } from './lib/playtestArgs';

const MAX_MS = HEADLESS_MAX_MS;
/** Multi-seed gate: levels up to this id must win every seed. */
const TUTORIAL_BAND_LAST = 8;
/** Multi-seed gate for later levels. */
const LATER_WIN_RATE = 0.95;
/** `--upgrades max` gate (ECONOMY.md §3.2): median stars over every level × seed. */
export const MAX_UPGRADES_MEDIAN_STARS = 2.5;

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
 * Weekly mode (GDD §8): the reference player on each week's challenge (level 33+, fixed seed, non-plain
 * twist, no upgrades) over K seeds from the fixed one. Gate per week: fixed seed won, wins/K >= 90 %
 * and at least one seed within the 3★ target (`weekly.targetMs` = the level's `star3`).
 */
async function runWeeklyMode(from: string, weeks: number, k: number, twist: boolean): Promise<number> {
  const plan = weeklyPlan(from, weeks);
  const header = `${pad('week', 10)} ${pad('lvl', 4)} ${pad('name', 20)} ${pad('twist', 10)} ${pad('fixed seed', 24)} ${pad('wins', 6)} ${pad('median', 8)} ${pad('best / target', 16)} ${pad('3* by', 12)} ${pad('gate', 6)} losing seeds`;
  console.log(
    `playtest weekly  ${from} +${weeks - 1} week(s)  seeds=K=${k} (fixed, fixed+1, …)  twist=${twist ? 'on' : 'OFF (control)'}  upgrades=none  max=${fmtTime(MAX_MS)}  gate: fixed seed won, wins/K >= ${Math.round(WEEKLY_WIN_RATE * 100)}%, >= 1 seed <= 3* target`,
  );
  console.log(header);
  console.log('-'.repeat(header.length));

  const rows: WeeklyRow[] = [];
  let totalTicks = 0;
  const t0 = performance.now();
  for (const challenge of plan) {
    const level = await loadLevel(challenge.levelId);
    if (!level) {
      console.error(`No level with id ${challenge.levelId} for week ${challenge.weekKey}`);
      process.exit(1);
    }
    const row = runWeekly(challenge, level, k, twist);
    rows.push(row);
    totalTicks += row.ticks;
    const fixed =
      row.fixed.outcome === 'won'
        ? `won ${fmtTime(row.fixed.timeMs)} ${starGlyphs(row.fixedStars)} (seed ${challenge.seed})`
        : `${row.fixed.outcome} ${fmtTime(row.fixed.timeMs)} (seed ${challenge.seed})`;
    const medianT = row.medianMs === undefined ? '-' : fmtTime(row.medianMs);
    const best = `${row.bestMs === undefined ? '-' : fmtTime(row.bestMs)} / ${fmtTime(challenge.targetMs)}`;
    const by = row.fixedOnTarget ? 'fixed' : row.targetSeeds.length ? `seed ${row.targetSeeds[0]}` : 'NONE';
    const gate = row.ok ? 'ok' : 'FAIL';
    const losers = row.losers.length ? row.losers.join(',') : '-';
    console.log(
      `${pad(challenge.weekKey, 10)} ${pad(String(level.id), 4)} ${pad(level.name, 20)} ${pad(challenge.twist.id, 10)} ${pad(fixed, 24)} ${pad(`${row.wins}/${k}`, 6)} ${pad(medianT, 8)} ${pad(best, 16)} ${pad(`${by} (${row.targetSeeds.length}/${k})`, 12)} ${pad(gate, 6)} ${losers}`,
    );
  }
  const elapsed = (performance.now() - t0) / 1000;
  console.log('-'.repeat(header.length));

  const failed = rows.filter((r) => !r.ok);
  const fixedLost = rows.filter((r) => r.fixed.outcome !== 'won');
  const fixedOnTarget = rows.filter((r) => r.fixedOnTarget);
  const anyOnTarget = rows.filter((r) => r.targetOk);
  const totalRuns = rows.length * k;
  const totalWins = rows.reduce((n, r) => n + r.wins, 0);
  const totalOnTarget = rows.reduce((n, r) => n + r.targetSeeds.length, 0);
  const starCounts: StarCounts = [0, 0, 0, 0];
  for (const r of rows) starCounts[r.fixedStars]++;
  const byTwist = new Map<string, { weeks: number; wins: number; runs: number; onTarget: number }>();
  for (const r of rows) {
    const t = byTwist.get(r.challenge.twist.id) ?? { weeks: 0, wins: 0, runs: 0, onTarget: 0 };
    t.weeks++;
    t.wins += r.wins;
    t.runs += k;
    t.onTarget += r.targetSeeds.length;
    byTwist.set(r.challenge.twist.id, t);
  }
  const levelsUsed = new Set(rows.map((r) => r.level.id));
  console.log(
    `${rows.length} week(s) over ${levelsUsed.size} level(s): fixed seed won ${rows.length - fixedLost.length}/${rows.length}, all seeds ${totalWins}/${totalRuns} (${((100 * totalWins) / totalRuns).toFixed(1)}%), fixed-seed stars 3*/2*/1*/0* = ${fmtStarCounts(starCounts)}; 3* target: fixed seed ${fixedOnTarget.length}/${rows.length}, any seed ${anyOnTarget.length}/${rows.length}, runs ${totalOnTarget}/${totalRuns}`,
  );
  for (const [id, t] of byTwist) {
    console.log(`  twist ${pad(id, 10)} ${t.weeks} week(s), wins ${t.wins}/${t.runs} (${((100 * t.wins) / t.runs).toFixed(1)}%), on target ${t.onTarget}/${t.runs}`);
  }
  for (const r of failed) {
    const why: string[] = [];
    if (r.fixed.outcome !== 'won') why.push(`fixed seed ${r.challenge.seed} ${r.fixed.outcome}`);
    if (r.wins / k < WEEKLY_WIN_RATE) why.push(`${r.wins}/${k} < ${Math.round(WEEKLY_WIN_RATE * 100)}%`);
    // the 3★ target is reported, not gated (star3 sits at 0.9 × the bot's median by design)
    console.log(`  FAIL ${r.challenge.weekKey} lvl ${r.level.id} ${r.level.name} [${r.challenge.twist.id}]: ${why.join('; ')}`);
  }
  console.log(
    `${failed.length} failed week(s). perf: ${totalTicks} ticks in ${elapsed.toFixed(2)}s = ${Math.round(totalTicks / Math.max(elapsed, 1e-6))} ticks/s`,
  );
  return failed.length;
}

/**
 * Twist mode: the reference player on every pool level under one twist over seeds 1..K. Gate per
 * level: wins/K >= TWIST_WIN_RATE (GDD §7.5 item 3: 4/5 at K = 5). `pool` is the id range swept
 * (`--pool a-b`, default the daily pool).
 */
async function runTwistMode(twistId: Twist['id'], k: number, pool: Readonly<PoolRange>): Promise<number> {
  const twist = twistById(twistId)!;
  const levels = (await loadAllLevels()).filter((l) => inPool(l, pool));
  if (levels.length === 0) {
    console.error(`No levels in --pool ${pool.from}-${pool.to}`);
    process.exit(1);
  }
  const header = `${pad('lvl', 4)} ${pad('name', 20)} ${pad('wins', 6)} ${pad('3*/2*/1*/0*', 12)} ${pad('median', 8)} ${pad('worst', 8)} ${pad('gate', 6)} losing seeds`;
  console.log(
    `playtest twist=${twist.id} (${fmtModifiers(twist.modifiers)})  pool lvl ${pool.from}-${pool.to} (${levels.length} level(s): ${levels[0]?.id ?? '-'}-${levels[levels.length - 1]?.id ?? '-'})  seeds=1..${k}  upgrades=none  max=${fmtTime(MAX_MS)}  gate: wins/K >= ${Math.round(TWIST_WIN_RATE * 100)}%`,
  );
  console.log(header);
  console.log('-'.repeat(header.length));
  const rows: TwistRow[] = [];
  let totalTicks = 0;
  const t0 = performance.now();
  for (const level of levels) {
    const row = runTwist(level, twist, k, pool);
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

/**
 * Naive mode (QA-3): the naive human line on every level over seeds 1..K. Informational without
 * `--gate` — always exit 0. "holds" = wins/K ≥ NAIVE_WIN_RATE; "star2" = holds and the median win is
 * within the level's `star2` clock. Levels 1–8 (the tutorial band) are expected to hold; a miss there
 * is a level or design item, reported with the losing seeds so a trace can say why.
 *
 * With `--gate a-b` (CI, levels 1–NAIVE_GATE_LAST, default reaction only): every level of the range
 * must win ≥ `naiveGateRate(id)` of its seeds (80 % for 1–8 = 4/5, 60 % for 9–16 = 3/5 at K = 5;
 * `naiveGate` in scripts/lib/naivePlayer.ts). Returns the number of failed levels (0 without a gate).
 *
 * With `follow` (GD-6h, never with a gate): the literal card follower instead of the naive line, same
 * row, plus the GDD §3.12 (a) verdict per level — wins ≥ the naive gate share and median ≤ `star2` on
 * 1–16; past 16 (GD-8f, §3.14 (a)) wins ≥ 80 % and the `asc` median ≤ max(`star2`, naive `asc` median
 * + 5 s), with the plain naive `asc` row run alongside (row `naive (bar)`, not counted in the summary).
 *
 * With `tie` (GD-7f) `desc`: the reversed id tie-break instead; `both`: each level's default row, then a
 * row labelled `tie desc`, one summary line per order, and a gate (if any) over both orders — a level
 * fails when either is under its share. `asc` prints exactly what it printed before GD-7f.
 */
async function runNaiveMode(levels: LevelDef[], k: number, reactMs: number, gate: NaiveGateRange | undefined, follow?: FollowSpec, tie: TieMode = 'asc', tieExempt: readonly number[] = []): Promise<number> {
  const ties = tiesOf(tie);
  const tieLabel = (t: NaiveTie | undefined): string => (t === 'desc' ? ' tie desc' : '');
  const header = `${pad('lvl', 4)} ${pad('name', 20)} ${pad('wins', 6)} ${pad('3*/2*/1*/0*', 12)} ${pad('median', 8)} ${pad('worst', 8)} ${pad('star2', 8)} ${pad('holds', 6)} ${pad('star2?', 7)} ${pad('gate', 6)} losing seeds`;
  const gateNote = gate
    ? `gate lvl ${gate.from}-${gate.to}: wins/K >= ${Math.round(naiveGateRate(gate.from)! * 100)}%` +
      (naiveGateRate(gate.to) !== naiveGateRate(gate.from) ? ` (lvl 1-8) / >= ${Math.round(naiveGateRate(gate.to)! * 100)}% (lvl 9-${NAIVE_GATE_LAST})` : '')
    : 'no gate';
  const line = follow ? `card follower [${formatFollowSpec(follow)}]` : 'naive';
  const tieNote = tie === 'asc' ? '' : `  tie=${tie} (desc = the larger id on an exact target tie${tie === 'both' ? '; extra rows labelled "tie desc"' : ''})`;
  console.log(
    `playtest ${line}  react=${reactMs}ms  seeds=1..${k}  upgrades=none  max=${fmtTime(MAX_MS)}  informational: holds = wins/K >= ${Math.round(NAIVE_WIN_RATE * 100)}%, star2? = holds and median <= star2 (${gateNote})${tieNote}`,
  );
  console.log(header);
  console.log('-'.repeat(header.length));
  const rows: NaiveRow[] = [];
  const barRows = new Map<number, NaiveRow>(); // GD-8f: the plain naive asc row behind a follower's §3.14 clock bar
  let totalTicks = 0;
  const t0 = performance.now();
  const printRow = (level: LevelDef, row: NaiveRow, name: string, gateCol: string): void => {
    const medianT = row.medianMs === undefined ? '-' : fmtTime(row.medianMs);
    const worst = row.worstMs === undefined ? '-' : fmtTime(row.worstMs);
    const losers = row.losers.length ? row.losers.join(',') : '-';
    console.log(
      `${pad(String(level.id), 4)} ${pad(name, 20)} ${pad(`${row.wins}/${k}`, 6)} ${pad(fmtStarCounts(row.starCounts), 12)} ${pad(medianT, 8)} ${pad(worst, 8)} ${pad(fmtTime(level.star2), 8)} ${pad(row.holds ? 'yes' : 'NO', 6)} ${pad(row.withinStar2 ? 'yes' : 'no', 7)} ${pad(gateCol, 6)} ${losers}`,
    );
  };
  for (const level of levels) {
    for (const t of ties) {
      const row = runNaive(level, k, reactMs, follow, t);
      rows.push(row);
      totalTicks += row.ticks;
      const gated = gate !== undefined && level.id >= gate.from && level.id <= gate.to;
      const exempt = gated && t === 'desc' && tieExempt.includes(level.id); // QA-30: tutorial-cured, not gated
      const gateCol = exempt ? 'exempt' : gated ? (row.wins >= naiveGateMinWins(naiveGateRate(level.id)!, k) ? 'ok' : 'FAIL') : '-';
      const name = tie === 'both' && t === 'desc' ? '  tie desc' : level.name; // GD-7f: the extra row sits under the level's own
      printRow(level, row, name, gateCol);
    }
    // GD-8f (GDD §3.14 (a)): past the naive gate the follower's asc median is judged against
    // max(star2, the plain naive asc median of this run + 5 s) — run that row too (same K and reaction)
    if (follow && level.id > NAIVE_GATE_LAST && ties.includes('asc')) {
      const naiveRow = runNaive(level, k, reactMs, undefined, 'asc');
      barRows.set(level.id, naiveRow);
      totalTicks += naiveRow.ticks;
      printRow(level, naiveRow, '  naive (bar)', '-');
    }
  }
  const elapsed = (performance.now() - t0) / 1000;
  console.log('-'.repeat(header.length));
  for (const t of ties) {
    const ofTie = rows.filter((r) => (r.tie ?? 'asc') === t);
    const held = ofTie.filter((r) => r.holds);
    const within = ofTie.filter((r) => r.withinStar2);
    const totalWins = ofTie.reduce((n, r) => n + r.wins, 0);
    console.log(
      `${follow ? 'follower' : 'naive'}${tieLabel(t)}: ${held.length}/${ofTie.length} levels won at >= ${Math.round(NAIVE_WIN_RATE * 100)} %, ${within.length} within star2 (react ${reactMs} ms, all seeds ${totalWins}/${ofTie.length * k})`,
    );
  }
  if (follow) {
    // GDD §3.12 item 12 (a): a card rewrite's literal follower holds the naive gate and the star2 median at 4 s
    // (levels 1–16); GD-8f / GDD §3.14 (a): past 16, wins >= 80 % and the asc median within the naive-based bar
    for (const r of rows) {
      const { ok, text } = ruleA(r, barRows.get(r.level.id));
      const note = reactMs === NAIVE_REACT_MS ? '' : ` (rule (a) is defined at ${NAIVE_REACT_MS} ms; this run is ${reactMs} ms)`;
      console.log(`  rule (a)${tieLabel(r.tie)} lvl ${r.level.id} ${r.level.name}: ${text} -> ${ok ? 'ok' : 'NO'}${note}`);
    }
  }
  const tutorialMiss = follow ? [] : rows.filter((r) => r.level.id <= TUTORIAL_BAND_LAST && !r.holds);
  for (const r of tutorialMiss) console.log(`  tutorial band${tieLabel(r.tie)}: lvl ${r.level.id} ${r.level.name} ${r.wins}/${k} (lost ${r.losers.join(',')}) — level/design item${r.tie === 'desc' ? ' (reversed-tie start)' : ''}`);
  let failed = 0;
  if (gate) {
    const failures = naiveGate(rows, gate, ties, tieExempt);
    for (const f of failures) {
      console.log(`  FAIL lvl ${f.levelId} ${f.name}${f.tie === 'desc' ? ' [tie desc]' : ''}: ${f.wins}/${f.k} < ${Math.round(f.rate * 100)}% (need ${f.minWins}/${f.k}${f.losers.length ? `, lost ${f.losers.join(',')}` : ''}) — level/design item for the Level Designer`);
    }
    // QA-30: say what the exemption hides, and when it has become dead weight
    for (const id of tieExempt) {
      const r = rows.find((x) => x.level.id === id && x.tie === 'desc');
      if (!r) continue;
      const passes = r.wins >= naiveGateMinWins(naiveGateRate(id)!, k);
      console.log(`  exempt lvl ${id} ${r.level.name} [tie desc]: ${r.wins}/${k} — ${NAIVE_TIE_EXEMPT[id]}${passes ? '; now passes: drop it from --tie-exempt' : '; not gated'}`);
    }
    failed = new Set(failures.map((f) => f.levelId)).size; // GD-7f: a level failing in both orders counts once
    const exemptNote = tieExempt.length ? `, tie desc exempt ${tieExempt.join(',')}` : '';
    const byOrder = tie === 'both' ? ` (asc ${failures.filter((f) => f.tie === undefined).length}, tie desc ${failures.filter((f) => f.tie === 'desc').length}${exemptNote})` : '';
    console.log(`naive gate lvl ${gate.from}-${gate.to}: ${failed} failed level(s)${byOrder}`);
  }
  console.log(`perf: ${totalTicks} ticks in ${elapsed.toFixed(2)}s = ${Math.round(totalTicks / Math.max(elapsed, 1e-6))} ticks/s`);
  return failed;
}

/**
 * QA-7: the naive human line on each day's / week's challenge — the challenge's level, fixed seed and
 * twist (or the `--no-twist` control), K seeds from the fixed one, the naive bot instead of the
 * reference player. One row per challenge: wins/K, median win time, `holds` = wins/K ≥ NAIVE_WIN_RATE,
 * losing seeds. Informational: no gate, always 0 failures; the summary line names the challenges the
 * line loses at ≥ 50 % so a level/design item can be traced from the losing seed.
 */
async function runChallengeNaiveMode(kind: 'daily' | 'weekly', from: string, count: number, k: number, twist: boolean, reactMs: number): Promise<number> {
  const plan: (DailyRow['challenge'] | WeeklyRow['challenge'])[] = kind === 'daily' ? dailyPlan(from, count) : weeklyPlan(from, count);
  const keyOf = (c: DailyRow['challenge'] | WeeklyRow['challenge']): string => ('dayKey' in c ? c.dayKey : c.weekKey);
  const unit = kind === 'daily' ? 'day' : 'week';
  const header = `${pad(unit, 10)} ${pad('lvl', 4)} ${pad('name', 20)} ${pad('twist', 10)} ${pad('seed', 8)} ${pad('wins', 6)} ${pad('median', 8)} ${pad('holds', 6)} losing seeds`;
  console.log(
    `playtest ${kind} naive  ${from} +${count - 1} ${unit}(s)  react=${reactMs}ms  seeds=K=${k} (fixed, fixed+1, …)  twist=${twist ? 'on' : 'OFF (control)'}  upgrades=none  max=${fmtTime(MAX_MS)}  informational: holds = wins/K >= ${Math.round(NAIVE_WIN_RATE * 100)}%, no gate`,
  );
  console.log(header);
  console.log('-'.repeat(header.length));
  const rows: (DailyRow | WeeklyRow)[] = [];
  let totalTicks = 0;
  const t0 = performance.now();
  for (const challenge of plan) {
    const level = await loadLevel(challenge.levelId);
    if (!level) {
      console.error(`No level with id ${challenge.levelId} for ${keyOf(challenge)}`);
      process.exit(1);
    }
    const player = () => makeNaivePlayer({ reactMs });
    const row = 'dayKey' in challenge ? runDaily(challenge, level, k, twist, player) : runWeekly(challenge, level, k, twist, player);
    rows.push(row);
    totalTicks += row.ticks;
    const holds = row.wins / k >= NAIVE_WIN_RATE;
    const medianT = row.medianMs === undefined ? '-' : fmtTime(row.medianMs);
    const losers = row.losers.length ? row.losers.join(',') : '-';
    console.log(
      `${pad(keyOf(challenge), 10)} ${pad(String(level.id), 4)} ${pad(level.name, 20)} ${pad(challenge.twist.id, 10)} ${pad(String(challenge.seed), 8)} ${pad(`${row.wins}/${k}`, 6)} ${pad(medianT, 8)} ${pad(holds ? 'yes' : 'NO', 6)} ${losers}`,
    );
  }
  const elapsed = (performance.now() - t0) / 1000;
  console.log('-'.repeat(header.length));
  const held = rows.filter((r) => r.wins / k >= NAIVE_WIN_RATE);
  const totalWins = rows.reduce((n, r) => n + r.wins, 0);
  console.log(
    `naive ${kind}: ${held.length}/${rows.length} ${unit}(s) won at >= ${Math.round(NAIVE_WIN_RATE * 100)} % (react ${reactMs} ms, all seeds ${totalWins}/${rows.length * k})`,
  );
  for (const r of rows) {
    if (r.wins / k >= NAIVE_WIN_RATE) continue;
    console.log(`  ${keyOf(r.challenge)} lvl ${r.level.id} ${r.level.name} [${r.challenge.twist.id}]: ${r.wins}/${k}${r.losers.length ? ` (lost ${r.losers.join(',')})` : ''} — informational`);
  }
  console.log(`perf: ${totalTicks} ticks in ${elapsed.toFixed(2)}s = ${Math.round(totalTicks / Math.max(elapsed, 1e-6))} ticks/s`);
  return 0;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.naive && args.daily !== undefined) {
    await runChallengeNaiveMode('daily', args.daily, args.days, args.seeds ?? 5, args.twist, args.reactMs);
    return;
  }
  if (args.naive && args.weekly !== undefined) {
    await runChallengeNaiveMode('weekly', args.weekly, args.weeks, args.seeds ?? 5, args.twist, args.reactMs);
    return;
  }
  if (args.naive) {
    const failed = await runNaiveMode(await selectLevels(args.level), args.seeds ?? 5, args.reactMs, args.gate, args.follow, args.tie ?? 'asc', args.tieExempt);
    if (failed > 0) process.exit(1);
    return;
  }
  if (args.twistId !== undefined) {
    const failed = await runTwistMode(args.twistId, args.seeds ?? 5, args.pool);
    if (failed > 0) process.exit(1);
    return;
  }
  if (args.weekly !== undefined) {
    const failed = await runWeeklyMode(args.weekly, args.weeks, args.seeds ?? 1, args.twist);
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
