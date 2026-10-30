/*
 * The eager slice of the Daily / Weekly Challenge rules (PERF-11): the day / week keys the app shell
 * resolves "today" with, the unlock levels, the rewards and the streak milestones the result path
 * books (src/ui/daily.ts, src/ui/weekly.ts — both run at the end of a match). The generator itself
 * (twists, pools, `challengeFor` / `weeklyFor`) is ./challenge.ts, reached only by the level map and
 * the debug surface, so it rides in their lazy chunks. ./challenge.ts re-exports all of this, so
 * either path names the same bindings; eager code imports from here.
 * Pure: no Date here except converting a passed Date to its key.
 */

/** The challenge unlocks once the player has cleared level `UNLOCK_AFTER_LEVEL`. */
export const UNLOCK_AFTER_LEVEL = 8;

/** Rewards for the first win of the day (ECONOMY.md §3.x): base + per star. */
export const REWARD = Object.freeze({ gold: 30, goldPerStar: 10, crystals: 5 });

/** Streak milestones (ECONOMY.md §6.2): `[day, crystals]`, paid once per streak run when the streak reaches `day`. */
export const STREAK_MILESTONES = [
  [3, 5],
  [7, 20],
  [30, 100],
] as const;

/**
 * Week-streak milestones (WK-1, GDD §8.1): `[weeks, crystals]`, paid once by `recordWeeklyResult` when
 * the first win of a week brings `save.weekly.streak` to exactly `weeks`. No ledger: the streak passes
 * each value once per run, so a broken and rebuilt run pays again.
 */
export const WEEKLY_STREAK_MILESTONES = [
  [4, 15],
  [8, 30],
  [12, 60],
] as const;

/** `YYYY-MM-DD` in UTC for a Date (the UI's only Date use for the challenge). */
export function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The weekly unlocks once level `WEEKLY_UNLOCK_AFTER_LEVEL` has a star. */
export const WEEKLY_UNLOCK_AFTER_LEVEL = 32;
export const WEEKLY_REWARD = Object.freeze({ gold: 100, crystals: 20 });
export const WEEKLY_BEST_KEEP = 12;

/** The Monday (UTC) day key of the week containing `date`. */
export function weekKeyOf(date: Date): string {
  const back = (date.getUTCDay() + 6) % 7;
  return dayKeyOf(new Date(date.getTime() - back * 86_400_000));
}

/** Gold paid for a first win with `stars` stars. */
export function goldReward(stars: number): number {
  return REWARD.gold + REWARD.goldPerStar * Math.max(0, Math.min(3, stars));
}
