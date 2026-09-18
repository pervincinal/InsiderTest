/**
 * Daily Challenge playtest (`npm run playtest -- --daily YYYY-MM-DD [--days N] [--seeds K]`): the
 * reference player on each day's challenge exactly as the client builds it — `challengeFor(dayKey)`'s
 * level, fixed seed and twist modifiers, no Commander upgrades. Pure and importable from tests; the
 * printing and the exit code live in scripts/playtest.ts.
 */
import { challengeFor } from '../../src/daily/challenge';
import type { DailyChallenge } from '../../src/daily/challenge';
import { DEFAULT_MODIFIERS } from '../../src/sim/index';
import type { LevelDef, PlayerModifiers } from '../../src/sim/index';
import { referencePlayerCommands } from '../../src/ai/index';
import { runHeadless, starsFor } from '../../src/ai/headless';
import type { RunResult } from '../../src/ai/headless';

/** Gate over the K seeds around the fixed one (the fixed seed itself must always be won). */
export const DAILY_WIN_RATE = 0.9;

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
