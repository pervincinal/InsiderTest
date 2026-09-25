/**
 * Daily Challenge playtest (`npm run playtest -- --daily YYYY-MM-DD [--days N] [--seeds K]`): the
 * reference player on each day's challenge exactly as the client builds it — `challengeFor(dayKey)`'s
 * level, fixed seed and twist modifiers, no Commander upgrades. Weekly Challenge playtest
 * (`npm run playtest -- --weekly <Monday> [--weeks N] [--seeds K]`, GDD §8): the same for
 * `weeklyFor(weekKey)` plus the 3★ target check — at least one of the K seeds must finish within
 * `targetMs` (the level's own `star3` clock), else the week is a level/clock item. Pool × twist sweep
 * (`npm run playtest -- --twist <id> [--seeds K] [--pool a-b]`, GDD §7.5 item 3): every pool level under
 * one twist over seeds 1..K, gate ≥ `TWIST_WIN_RATE` per level. Pure and importable from tests; the
 * printing and the exit code live in scripts/playtest.ts.
 */
import { POOL_FROM, POOL_TO, TWISTS, challengeFor, isMondayKey, weeklyFor } from '../../src/daily/challenge';
import type { DailyChallenge, Twist, WeeklyChallenge } from '../../src/daily/challenge';
import { DEFAULT_MODIFIERS } from '../../src/sim/index';
import type { LevelDef, PlayerModifiers } from '../../src/sim/index';
import { referencePlayerCommands } from '../../src/ai/index';
import { runHeadless, starsFor } from '../../src/ai/headless';
import type { PlayerBot, RunResult } from '../../src/ai/headless';

/** The bot a challenge run plays with: a fresh instance per seed (`makeNaivePlayer` keeps memory); the default is the reference player. */
export type PlayerFactory = () => PlayerBot;
const referencePlayer: PlayerFactory = () => referencePlayerCommands;

/** Gate over the K seeds around the fixed one (the fixed seed itself must always be won). */
export const DAILY_WIN_RATE = 0.9;
/** Weekly gate (GDD §8): the same win-rate rule as the daily, plus ≥ 1 of the K seeds within the 3★ target. */
/** Weekly gate: 4/5 like the twist gate (one fixed seed per week; near-neighbour seeds only measure robustness). */
export const WEEKLY_WIN_RATE = 0.8;
/** Pool × twist gate (GDD §7.5 item 3): every pool level wins at least this share of its seeds under every twist (4/5 at K = 5). */
export const TWIST_WIN_RATE = 0.8;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The UTC day key `days` days after `dayKey` (0 = same day); throws on a malformed key. */
export function addDays(dayKey: string, days: number): string {
  if (!DAY_KEY.test(dayKey)) throw new Error(`daily: bad day key ${dayKey}`);
  const t = Date.UTC(Number(dayKey.slice(0, 4)), Number(dayKey.slice(5, 7)) - 1, Number(dayKey.slice(8, 10)));
  if (Number.isNaN(t)) throw new Error(`daily: bad day key ${dayKey}`);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

/** The challenges for `from` and the next `days - 1` days, in order — one per calendar day. */
export function dailyPlan(from: string, days: number): DailyChallenge[] {
  if (!Number.isInteger(days) || days < 1) throw new Error(`daily: bad day count ${String(days)}`);
  return Array.from({ length: days }, (_, i) => challengeFor(addDays(from, i)));
}

/** The K seeds a challenge is measured over: the fixed seed first, then seed+1, seed+2, … */
export function dailySeeds(challenge: Pick<DailyChallenge, 'seed'>, k: number): number[] {
  if (!Number.isInteger(k) || k < 1) throw new Error(`daily: bad seed count ${String(k)}`);
  return Array.from({ length: k }, (_, i) => challenge.seed + i);
}

/** The Monday key `weeks` weeks after the Monday `weekKey` (0 = same week); throws on a non-Monday or malformed key. */
export function addWeeks(weekKey: string, weeks: number): string {
  if (!isMondayKey(weekKey)) throw new Error(`weekly: ${weekKey} is not a Monday (UTC) key`);
  return addDays(weekKey, 7 * weeks);
}

/** The weekly challenges for the Monday `from` and the next `weeks - 1` weeks, in order — one per week. */
export function weeklyPlan(from: string, weeks: number): WeeklyChallenge[] {
  if (!Number.isInteger(weeks) || weeks < 1) throw new Error(`weekly: bad week count ${String(weeks)}`);
  return Array.from({ length: weeks }, (_, i) => weeklyFor(addWeeks(from, i)));
}

/** The K seeds a weekly is measured over: the fixed seed first, then seed+1, seed+2, … (same rule as the daily). */
export function weeklySeeds(challenge: Pick<WeeklyChallenge, 'seed'>, k: number): number[] {
  return dailySeeds(challenge, k);
}

export interface DailyRow {
  challenge: DailyChallenge;
  level: LevelDef;
  /** Modifiers the runs used: the twist's, or `DEFAULT_MODIFIERS` when `twist` was switched off. */
  modifiers: Readonly<PlayerModifiers>;
  seeds: number[];
  /** One result per entry of `seeds`; `results[0]` is the fixed seed. */
  results: RunResult[];
  fixed: RunResult;
  fixedStars: 0 | 1 | 2 | 3;
  wins: number;
  /** Median win time over the winning seeds, ms; undefined when none won. */
  medianMs: number | undefined;
  /** Losing seeds, in `seeds` order. */
  losers: number[];
  ticks: number;
  /** Fixed seed won and wins / K >= DAILY_WIN_RATE. */
  ok: boolean;
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Reference player on one day's challenge over `seedCount` seeds (the fixed one first). `level` must
 * be the challenge's level. `twist: false` runs the same level and seeds with no modifiers — the
 * control that tells a twist-caused loss from a level-caused one. `player` swaps the line (QA-7:
 * `() => makeNaivePlayer()` for the naive human line; `ok` then reads as the same gate but is informational).
 */
export function runDaily(challenge: DailyChallenge, level: LevelDef, seedCount: number, twist = true, player: PlayerFactory = referencePlayer): DailyRow {
  if (level.id !== challenge.levelId) throw new Error(`daily: level ${level.id} is not the ${challenge.dayKey} challenge (${challenge.levelId})`);
  const modifiers = twist ? challenge.twist.modifiers : DEFAULT_MODIFIERS;
  const seeds = dailySeeds(challenge, seedCount);
  const results: RunResult[] = [];
  const winTimes: number[] = [];
  const losers: number[] = [];
  let ticks = 0;
  for (const seed of seeds) {
    const r = runHeadless(level, seed, player(), { modifiers });
    results.push(r);
    ticks += r.ticks;
    if (r.outcome === 'won') winTimes.push(r.timeMs);
    else losers.push(seed);
  }
  const fixed = results[0]!;
  const wins = winTimes.length;
  return {
    challenge,
    level,
    modifiers,
    seeds,
    results,
    fixed,
    fixedStars: starsFor(level, fixed),
    wins,
    medianMs: median(winTimes),
    losers,
    ticks,
    ok: fixed.outcome === 'won' && wins / seedCount >= DAILY_WIN_RATE,
  };
}

/** The twist with this id, or undefined (`--twist` validation). */
export function twistById(id: string): Twist | undefined {
  return TWISTS.find((t) => t.id === id);
}

/** An inclusive id range of levels for the twist sweep (`--pool a-b`). */
export interface PoolRange {
  from: number;
  to: number;
}

/** The daily pool as shipped: `POOL_FROM`…`POOL_TO`. */
export const DEFAULT_POOL: Readonly<PoolRange> = Object.freeze({ from: POOL_FROM, to: POOL_TO });

/** Parses `a-b` (both inclusive, 1 ≤ a ≤ b) into a pool range; throws on anything else. */
export function parsePool(spec: string): PoolRange {
  const m = /^(\d+)-(\d+)$/.exec(spec.trim());
  if (!m) throw new Error(`bad --pool ${spec} (a-b, e.g. ${POOL_FROM}-${POOL_TO})`);
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (from < 1 || to < from) throw new Error(`bad --pool ${spec} (need 1 <= a <= b)`);
  return { from, to };
}

/** Is the level in the pool (ids `from`…`to`; the daily pool `POOL_FROM`…`POOL_TO` by default)? */
export function inPool(level: Pick<LevelDef, 'id'>, pool: Readonly<PoolRange> = DEFAULT_POOL): boolean {
  return level.id >= pool.from && level.id <= pool.to;
}

export interface WeeklyRow {
  challenge: WeeklyChallenge;
  level: LevelDef;
  /** Modifiers the runs used: the twist's, or `DEFAULT_MODIFIERS` when `twist` was switched off. */
  modifiers: Readonly<PlayerModifiers>;
  seeds: number[];
  /** One result per entry of `seeds`; `results[0]` is the fixed seed. */
  results: RunResult[];
  fixed: RunResult;
  fixedStars: 0 | 1 | 2 | 3;
  wins: number;
  /** Median win time over the winning seeds, ms; undefined when none won. */
  medianMs: number | undefined;
  /** Fastest win over all K seeds, ms; undefined when none won. */
  bestMs: number | undefined;
  /** Seed of the fastest win; undefined when none won. */
  bestSeed: number | undefined;
  /** The fixed seed won within `challenge.targetMs` (its own 3★ clock). */
  fixedOnTarget: boolean;
  /** Seeds (in `seeds` order) that won within `challenge.targetMs`. */
  targetSeeds: number[];
  /** Losing seeds, in `seeds` order. */
  losers: number[];
  ticks: number;
  /** Fixed seed won and wins / K >= WEEKLY_WIN_RATE. */
  winsOk: boolean;
  /** At least one of the K seeds reached the 3★ target (else a level/clock item for the Level Designer). */
  targetOk: boolean;
  /** `winsOk` — the 3★ target is informational (star3 is tuned for humans faster than the bot; Producer decision 2026-09-20). */
  ok: boolean;
}

/**
 * Reference player on one week's challenge over `seedCount` seeds (the fixed one first), exactly as
 * the client builds it: the week's level, fixed seed and twist modifiers, no upgrades. `level` must be
 * the challenge's level. `twist: false` is the no-modifier control, as for `runDaily`. Besides the
 * daily gate the row reports the 3★ target: which seeds finished within `challenge.targetMs`.
 * `player` swaps the line (QA-7: the naive human line), as for `runDaily`.
 */
export function runWeekly(challenge: WeeklyChallenge, level: LevelDef, seedCount: number, twist = true, player: PlayerFactory = referencePlayer): WeeklyRow {
  if (level.id !== challenge.levelId) throw new Error(`weekly: level ${level.id} is not the ${challenge.weekKey} challenge (${challenge.levelId})`);
  const modifiers = twist ? challenge.twist.modifiers : DEFAULT_MODIFIERS;
  const seeds = weeklySeeds(challenge, seedCount);
  const results: RunResult[] = [];
  const winTimes: number[] = [];
  const losers: number[] = [];
  const targetSeeds: number[] = [];
  let bestMs: number | undefined;
  let bestSeed: number | undefined;
  let ticks = 0;
  for (const seed of seeds) {
    const r = runHeadless(level, seed, player(), { modifiers });
    results.push(r);
    ticks += r.ticks;
    if (r.outcome === 'won') {
      winTimes.push(r.timeMs);
      if (r.timeMs <= challenge.targetMs) targetSeeds.push(seed);
      if (bestMs === undefined || r.timeMs < bestMs) {
        bestMs = r.timeMs;
        bestSeed = seed;
      }
    } else losers.push(seed);
  }
  const fixed = results[0]!;
  const wins = winTimes.length;
  const winsOk = fixed.outcome === 'won' && wins / seedCount >= WEEKLY_WIN_RATE;
  const targetOk = targetSeeds.length > 0;
  return {
    challenge,
    level,
    modifiers,
    seeds,
    results,
    fixed,
    fixedStars: starsFor(level, fixed),
    wins,
    medianMs: median(winTimes),
    bestMs,
    bestSeed,
    fixedOnTarget: fixed.outcome === 'won' && fixed.timeMs <= challenge.targetMs,
    targetSeeds,
    losers,
    ticks,
    winsOk,
    targetOk,
    ok: winsOk,
  };
}

export interface TwistRow {
  level: LevelDef;
  twist: Twist;
  seeds: number[];
  /** One result per entry of `seeds`. */
  results: RunResult[];
  wins: number;
  stars: (0 | 1 | 2 | 3)[];
  medianMs: number | undefined;
  worstMs: number | undefined;
  losers: number[];
  ticks: number;
  /** wins / K >= TWIST_WIN_RATE. */
  ok: boolean;
}

/**
 * Reference player on one pool level under one twist over seeds 1..`seedCount` (the campaign seeds,
 * not a day's fixed one: the sweep asks whether the level is winnable under the twist at all). Refuses
 * a level outside `pool` (the daily pool by default; `--pool a-b` widens it, GDD §3 band 5).
 */
export function runTwist(level: LevelDef, twist: Twist, seedCount: number, pool: Readonly<PoolRange> = DEFAULT_POOL): TwistRow {
  if (!inPool(level, pool)) throw new Error(`daily: level ${level.id} is not in the challenge pool (${pool.from}-${pool.to})`);
  if (!Number.isInteger(seedCount) || seedCount < 1) throw new Error(`daily: bad seed count ${String(seedCount)}`);
  const seeds = Array.from({ length: seedCount }, (_, i) => i + 1);
  const results: RunResult[] = [];
  const stars: (0 | 1 | 2 | 3)[] = [];
  const winTimes: number[] = [];
  const losers: number[] = [];
  let ticks = 0;
  for (const seed of seeds) {
    const r = runHeadless(level, seed, referencePlayerCommands, { modifiers: twist.modifiers });
    results.push(r);
    stars.push(starsFor(level, r));
    ticks += r.ticks;
    if (r.outcome === 'won') winTimes.push(r.timeMs);
    else losers.push(seed);
  }
  const wins = winTimes.length;
  return {
    level,
    twist,
    seeds,
    results,
    wins,
    stars,
    medianMs: median(winTimes),
    worstMs: winTimes.length ? Math.max(...winTimes) : undefined,
    losers,
    ticks,
    ok: wins / seedCount >= TWIST_WIN_RATE,
  };
}
