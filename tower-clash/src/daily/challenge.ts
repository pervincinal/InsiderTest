import type { PlayerModifiers } from '../sim/types';
import { DEFAULT_MODIFIERS } from '../sim/types';
import { LEVEL_META } from '../levels/index';

/*
 * Daily Challenge (GDD §7): one deterministic run per UTC day. The day key picks a level from the
 * challenge pool, a fixed seed and a "twist" (a player-side modifier set the sim already supports),
 * so every player in the world plays the same match that day and the reference bot can verify it.
 * Pure: no Date here — callers pass the day key (`dayKeyOf(new Date())` in the UI).
 */

/** First level of the pool; the challenge unlocks once the player has cleared `UNLOCK_AFTER_LEVEL`. */
export const POOL_FROM = 9;
export const POOL_TO = 50;
export const UNLOCK_AFTER_LEVEL = 8;

export interface Twist {
  id: 'plain' | 'lean' | 'fastFeet' | 'thinWalls' | 'reinforced';
  modifiers: Readonly<PlayerModifiers>;
}

export const TWISTS: readonly Twist[] = Object.freeze([
  { id: 'plain', modifiers: DEFAULT_MODIFIERS },
  { id: 'lean', modifiers: { ...DEFAULT_MODIFIERS, productionMul: 0.9 } },
  { id: 'fastFeet', modifiers: { ...DEFAULT_MODIFIERS, unitSpeedMul: 1.25 } },
  { id: 'thinWalls', modifiers: { ...DEFAULT_MODIFIERS, capacityMul: 0.8 } },
  { id: 'reinforced', modifiers: { ...DEFAULT_MODIFIERS, startGarrisonBonus: 5 } },
]);

/** Rewards for the first win of the day (ECONOMY.md §3.x): base + per star. */
export const REWARD = Object.freeze({ gold: 30, goldPerStar: 10, crystals: 5 });

/** Streak milestones (ECONOMY.md §6.2): `[day, crystals]`, paid once per streak run when the streak reaches `day`. */
export const STREAK_MILESTONES = [
  [3, 5],
  [7, 20],
  [30, 100],
] as const;

export interface DailyChallenge {
  dayKey: string; // YYYY-MM-DD (UTC)
  levelId: number;
  seed: number;
  twist: Twist;
}

/** `YYYY-MM-DD` in UTC for a Date (the UI's only Date use for the challenge). */
export function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** FNV-1a 32-bit over the key: stable across platforms, spreads consecutive days well. */
export function hashDayKey(dayKey: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < dayKey.length; i++) {
    h ^= dayKey.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Day number of a key since 2026-01-01 UTC (negative before it). */
export function dayNumberOf(dayKey: string): number {
  if (!DAY_KEY.test(dayKey)) throw new Error(`daily: bad day key ${dayKey}`);
  const t = Date.UTC(Number(dayKey.slice(0, 4)), Number(dayKey.slice(5, 7)) - 1, Number(dayKey.slice(8, 10)));
  return Math.round((t - Date.UTC(2026, 0, 1)) / 86_400_000);
}

/** Deterministic Fisher–Yates over a copy of `items`, driven by a 32-bit hash (mulberry32 step). */
export function seededOrder<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function pool(): readonly { id: number; star3: number }[] {
  return LEVEL_META.filter((m) => m.id >= POOL_FROM && m.id <= POOL_TO);
}

/**
 * The challenge for a day key; throws on a malformed key. Deterministic and pure. Levels come
 * from a per-cycle shuffle of the pool (DAILY-4): day n plays position `n mod poolSize` of the
 * permutation seeded by `n div poolSize`, so a level never repeats within one cycle (42 days at
 * pool 9–50) and consecutive days still look random.
 */
export function challengeFor(dayKey: string): DailyChallenge {
  const n = dayNumberOf(dayKey);
  const levels = pool();
  const cycle = Math.floor(n / levels.length);
  const pos = ((n % levels.length) + levels.length) % levels.length;
  const level = seededOrder(levels, hashDayKey(`cycle#${cycle}`))[pos]!;
  const h = hashDayKey(dayKey);
  // a second hash so the twist does not correlate with the seed
  const h2 = hashDayKey(`${dayKey}#twist`);
  const twist = TWISTS[h2 % TWISTS.length]!;
  return { dayKey, levelId: level.id, seed: (h % 1_000_000) + 1, twist };
}

/* ---------- Weekly Challenge (GDD §8, WEEKLY-1) ---------- */

/** Weekly pool starts at band 4; the weekly unlocks once level `WEEKLY_UNLOCK_AFTER_LEVEL` has a star. */
export const WEEKLY_POOL_FROM = 33;
export const WEEKLY_UNLOCK_AFTER_LEVEL = 32;
export const WEEKLY_REWARD = Object.freeze({ gold: 100, crystals: 20 });
export const WEEKLY_BEST_KEEP = 12;

export interface WeeklyChallenge {
  weekKey: string; // YYYY-MM-DD of the week's Monday (UTC)
  levelId: number;
  seed: number;
  twist: Twist; // never 'plain'
  targetMs: number; // the level's own 3★ clock
}

/** The Monday (UTC) day key of the week containing `date`. */
export function weekKeyOf(date: Date): string {
  const back = (date.getUTCDay() + 6) % 7;
  return dayKeyOf(new Date(date.getTime() - back * 86_400_000));
}

export function isMondayKey(dayKey: string): boolean {
  if (!DAY_KEY.test(dayKey)) return false;
  const d = new Date(`${dayKey}T00:00:00Z`);
  // a real calendar date (V8 rolls `2026-02-30` over to Monday March 2) that is a Monday
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dayKey && d.getUTCDay() === 1;
}

/** The weekly challenge for a Monday key; throws on a non-Monday or malformed key. */
export function weeklyFor(weekKey: string): WeeklyChallenge {
  if (!isMondayKey(weekKey)) throw new Error(`weekly: not a Monday key ${weekKey}`);
  const levels = LEVEL_META.filter((m) => m.id >= WEEKLY_POOL_FROM && m.id <= POOL_TO);
  const h = hashDayKey(`${weekKey}#week`);
  const level = levels[h % levels.length]!;
  const twists = TWISTS.filter((t) => t.id !== 'plain');
  const twist = twists[hashDayKey(`${weekKey}#weektwist`) % twists.length]!;
  return { weekKey, levelId: level.id, seed: (h % 1_000_000) + 1, twist, targetMs: level.star3 };
}

/** Gold paid for a first win with `stars` stars. */
export function goldReward(stars: number): number {
  return REWARD.gold + REWARD.goldPerStar * Math.max(0, Math.min(3, stars));
}
