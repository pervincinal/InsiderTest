/**
 * Weekly Challenge progress (GDD §8) over `SaveData`: the unlock gate, the week streak, the best
 * result per week and the once-per-week rewards. Pure over the save plus an explicit week key (the
 * Monday UTC day key) — no Date here: the app resolves "this week" once (`App.weekKey()`), so the
 * rules unit-test without a clock and the debug override (`setWeekKey`) makes the e2e deterministic.
 *
 * Like the daily (src/ui/daily.ts) this is a separate ledger from the campaign: a weekly win never
 * awards level stars, first-clear gold, milestones or achievements. Two rewards, each once per week
 * key: `WEEKLY_REWARD.gold` on the first win (any stars) and `WEEKLY_REWARD.crystals` the first time
 * an attempt's clock is at or under the level's 3★ target (`targetMs`) — first or later attempt.
 */
import type { LevelDef } from '../sim/types';
import type { WeeklyChallenge } from '../daily/challenge';
import { WEEKLY_BEST_KEEP, WEEKLY_REWARD, WEEKLY_UNLOCK_AFTER_LEVEL } from '../daily/challenge';
import { earnCrystals, earnGold } from '../economy/wallet';
import type { SaveData, WeeklyBest } from './save';
import { pruneChallengeBest, starsFor, writeSave } from './save';
import { STREAK_SHOWN_MAX } from './daily';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** The Monday key one week before `weekKey`. */
export function previousWeekKey(weekKey: string): string {
  const [y, m, d] = weekKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) - WEEK_MS).toISOString().slice(0, 10);
}

/** Milliseconds from `nowMs` (epoch) to the next Monday 00:00 UTC (1..WEEK_MS). The epoch was a Thursday. */
export function msToNextMonday(nowMs: number): number {
  const into = (((nowMs + 3 * DAY_MS) % WEEK_MS) + WEEK_MS) % WEEK_MS;
  return WEEK_MS - into;
}

/** The weekly opens once level `WEEKLY_UNLOCK_AFTER_LEVEL` has at least one star. */
export function weeklyUnlocked(save: SaveData): boolean {
  return (save.stars[String(WEEKLY_UNLOCK_AFTER_LEVEL)] ?? 0) >= 1;
}

/** Already won in week `weekKey` (the gold for that week is spent). */
export function weeklyDone(save: SaveData, weekKey: string): boolean {
  return save.weekly.lastWinWeek === weekKey || weekKey in save.weekly.best;
}

/** The 3★ target of week `weekKey` was reached (its crystals are spent). */
export function weeklyTargetDone(save: SaveData, weekKey: string): boolean {
  return save.weekly.best[weekKey]?.target === true;
}

/** Week streak as shown (capped), or 0 when broken (the last win is older than last week). */
export function shownWeekStreak(save: SaveData, weekKey: string): number {
  const last = save.weekly.lastWinWeek;
  if (last !== weekKey && last !== previousWeekKey(weekKey)) return 0;
  return Math.min(STREAK_SHOWN_MAX, save.weekly.streak);
}

/** What a weekly result did to the save (the result screen renders it). */
export interface WeeklyOutcome {
  weekKey: string;
  won: boolean;
  stars: number;
  /** First win of the week: `gold` below was paid. */
  firstWin: boolean;
  gold: number;
  /** This attempt reached the 3★ target for the first time this week: `crystals` below was paid. */
  targetHit: boolean;
  crystals: number;
  /** Week streak after this result (0 on a loss when no streak is live). */
  streak: number;
  /** Best result of the week after this result, or null (never won this week). */
  best: WeeklyBest | null;
  targetMs: number;
}

/**
 * Record a finished weekly match. A loss changes nothing. A win updates the week's best (more stars,
 * then less time); the first win of the week advances the streak (+1 when last week was won, else 1)
 * and pays the gold once; the first attempt at or under the target pays the crystals once.
 */
export function recordWeeklyResult(save: SaveData, challenge: WeeklyChallenge, level: Pick<LevelDef, 'star3' | 'star2'>, outcome: 'won' | 'lost', timeMs: number): WeeklyOutcome {
  const { weekKey, targetMs } = challenge;
  const w = save.weekly;
  const out: WeeklyOutcome = { weekKey, won: outcome === 'won', stars: 0, firstWin: false, gold: 0, targetHit: false, crystals: 0, streak: shownWeekStreak(save, weekKey), best: w.best[weekKey] ?? null, targetMs };
  if (outcome !== 'won') return out;
  const stars = starsFor(level, timeMs);
  out.stars = stars;
  const prev = w.best[weekKey];
  const better = !prev || stars > prev.stars || (stars === prev.stars && timeMs < prev.timeMs);
  const best: WeeklyBest = better ? { stars, timeMs, target: prev?.target === true } : prev;
  if (!best.target && timeMs <= targetMs) {
    best.target = true;
    out.targetHit = true;
    out.crystals = WEEKLY_REWARD.crystals;
    earnCrystals(save, out.crystals);
  }
  w.best[weekKey] = best;
  w.best = pruneChallengeBest(w.best, WEEKLY_BEST_KEEP);
  out.best = w.best[weekKey] ?? best;
  if (w.lastWinWeek !== weekKey) {
    out.firstWin = true;
    w.streak = w.lastWinWeek === previousWeekKey(weekKey) ? w.streak + 1 : 1;
    w.lastWinWeek = weekKey;
    out.gold = WEEKLY_REWARD.gold;
    earnGold(save, out.gold);
  }
  out.streak = Math.min(STREAK_SHOWN_MAX, w.streak);
  writeSave(save);
  return out;
}
