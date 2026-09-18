/**
 * Daily Challenge playtest (`npm run playtest -- --daily YYYY-MM-DD [--days N] [--seeds K]`): the
 * reference player on each day's challenge exactly as the client builds it — `challengeFor(dayKey)`'s
 * level, fixed seed and twist modifiers, no Commander upgrades. Pool × twist sweep
 * (`npm run playtest -- --twist <id> [--seeds K]`, GDD §7.5 item 3): every pool level under one twist
 * over seeds 1..K, gate ≥ `TWIST_WIN_RATE` per level. Pure and importable from tests; the printing and
 * the exit code live in scripts/playtest.ts.
 */
import { POOL_FROM, POOL_TO, TWISTS, challengeFor } from '../../src/daily/challenge';
import type { DailyChallenge, Twist } from '../../src/daily/challenge';
import { DEFAULT_MODIFIERS } from '../../src/sim/index';
import type { LevelDef, PlayerModifiers } from '../../src/sim/index';
import { referencePlayerCommands } from '../../src/ai/index';
import { runHeadless, starsFor } from '../../src/ai/headless';
import type { RunResult } from '../../src/ai/headless';

/** Gate over the K seeds around the fixed one (the fixed seed itself must always be won). */
export const DAILY_WIN_RATE = 0.9;
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
export function dailySeeds(challenge: DailyChallenge, k: number): number[] {
  if (!Number.isInteger(k) || k < 1) throw new Error(`daily: bad seed count ${String(k)}`);
  return Array.from({ length: k }, (_, i) => challenge.seed + i);
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
 * control that tells a twist-caused loss from a level-caused one.
 */
export function runDaily(challenge: DailyChallenge, level: LevelDef, seedCount: number, twist = true): DailyRow {
  if (level.id !== challenge.levelId) throw new Error(`daily: level ${level.id} is not the ${challenge.dayKey} challenge (${challenge.levelId})`);
  const modifiers = twist ? challenge.twist.modifiers : DEFAULT_MODIFIERS;
  const seeds = dailySeeds(challenge, seedCount);
  const results: RunResult[] = [];
  const winTimes: number[] = [];
  const losers: number[] = [];
  let ticks = 0;
  for (const seed of seeds) {
    const r = runHeadless(level, seed, referencePlayerCommands, { modifiers });
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

/** Is the level in the daily pool (ids `POOL_FROM`…`POOL_TO`)? */
export function inPool(level: Pick<LevelDef, 'id'>): boolean {
  return level.id >= POOL_FROM && level.id <= POOL_TO;
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
 * a level outside the pool.
 */
export function runTwist(level: LevelDef, twist: Twist, seedCount: number): TwistRow {
  if (!inPool(level)) throw new Error(`daily: level ${level.id} is not in the challenge pool (${POOL_FROM}-${POOL_TO})`);
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
