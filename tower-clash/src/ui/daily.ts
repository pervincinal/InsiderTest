/**
 * Daily Challenge progress (GDD §7) over `SaveData`: the unlock gate, the win streak, the best
 * result per day and the once-per-day reward. Pure over the save plus an explicit day key — no
 * Date here (the app resolves "today" once, `App.dayKey()`), so the rules unit-test without a clock
 * and the debug override (`setDayKey`) makes the e2e deterministic.
 *
 * The challenge is a separate path from `recordResult`: a challenge win never awards level stars,
 * first-clear gold, replay gold, milestones or achievements — the reward is `goldReward(stars)` +
 * `REWARD.crystals`, paid through the wallet on the first win of the day only.
 */
import type { LevelDef } from '../sim/types';
import type { DailyChallenge } from '../daily/challenge';
import { REWARD, UNLOCK_AFTER_LEVEL, goldReward } from '../daily/challenge';
import { earnCrystals, earnGold } from '../economy/wallet';
import type { ChallengeBest, SaveData } from './save';
import { pruneChallengeBest, starsFor, writeSave } from './save';

/** Streak shown on the card / result is capped here (the save keeps the real count). */
export const STREAK_SHOWN_MAX = 99;

const DAY_MS = 86_400_000;

/** The UTC day key one day before `dayKey` (`2026-03-01` → `2026-02-29`). */
export function previousDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) - DAY_MS).toISOString().slice(0, 10);
}

/** Milliseconds from `nowMs` (epoch) to the next UTC midnight (1..DAY_MS). */
export function msToUtcMidnight(nowMs: number): number {
  const into = ((nowMs % DAY_MS) + DAY_MS) % DAY_MS;
  return DAY_MS - into;
}

/** The challenge opens once level `UNLOCK_AFTER_LEVEL` has at least one star. */
export function challengeUnlocked(save: SaveData): boolean {
  return (save.stars[String(UNLOCK_AFTER_LEVEL)] ?? 0) >= 1;
}

/** Already won on `dayKey` (the reward for that day is spent). */
export function challengeDone(save: SaveData, dayKey: string): boolean {
  return save.challenge.lastWinDay === dayKey || dayKey in save.challenge.best;
}

/** Streak as shown (capped), or 0 when the streak is broken (the last win is older than yesterday). */
export function shownStreak(save: SaveData, dayKey: string): number {
  const last = save.challenge.lastWinDay;
  if (last !== dayKey && last !== previousDayKey(dayKey)) return 0;
  return Math.min(STREAK_SHOWN_MAX, save.challenge.streak);
}

/** What a challenge result did to the save (the result screen renders it). */
export interface DailyOutcome {
  dayKey: string;
  won: boolean;
  stars: number;
  /** First win of the day: the reward below was paid. */
  firstWin: boolean;
  gold: number;
  crystals: number;
  /** Streak after this result (0 on a loss when no streak is live). */
  streak: number;
  /** Best result of the day after this result, or null (never won today). */
  best: ChallengeBest | null;
}

/** `a` beats `b` when it has more stars, or the same stars in less time. */
function better(a: ChallengeBest, b: ChallengeBest | undefined): boolean {
  if (!b) return true;
  return a.stars > b.stars || (a.stars === b.stars && a.timeMs < b.timeMs);
}

/**
 * Record a finished challenge match. A loss changes nothing (no defeat counters: the challenge
 * has no continue or skip). A win updates the day's best; the first win of the day advances the
 * streak (+1 when yesterday was won, else back to 1) and pays the reward once.
 */
export function recordChallengeResult(save: SaveData, challenge: DailyChallenge, level: Pick<LevelDef, 'star3' | 'star2'>, outcome: 'won' | 'lost', timeMs: number): DailyOutcome {
  const { dayKey } = challenge;
  const c = save.challenge;
  const out: DailyOutcome = { dayKey, won: outcome === 'won', stars: 0, firstWin: false, gold: 0, crystals: 0, streak: shownStreak(save, dayKey), best: c.best[dayKey] ?? null };
  if (outcome !== 'won') return out;
  const stars = starsFor(level, timeMs);
  out.stars = stars;
  const result: ChallengeBest = { stars, timeMs };
  if (better(result, c.best[dayKey])) c.best[dayKey] = result;
  c.best = pruneChallengeBest(c.best);
  out.best = c.best[dayKey] ?? result;
  if (c.lastWinDay !== dayKey) {
    out.firstWin = true;
    c.streak = c.lastWinDay === previousDayKey(dayKey) ? c.streak + 1 : 1;
    c.lastWinDay = dayKey;
    out.gold = goldReward(stars);
    out.crystals = REWARD.crystals;
    earnGold(save, out.gold);
    earnCrystals(save, out.crystals);
  }
  out.streak = Math.min(STREAK_SHOWN_MAX, c.streak);
  writeSave(save);
  return out;
}
