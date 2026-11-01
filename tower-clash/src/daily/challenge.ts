import type { PlayerModifiers } from '../sim/types';
import { DEFAULT_MODIFIERS } from '../sim/types';
import { LEVEL_META } from '../levels/index';
import type { LevelMeta } from '../levels/index';

/*
 * Daily Challenge (GDD §7): one deterministic run per UTC day. The day key picks a level from the
 * challenge pool, a fixed seed and a "twist" (a player-side modifier set the sim already supports),
 * so every player in the world plays the same match that day and the reference bot can verify it.
 * Pure: no Date here — callers pass the day key (`dayKeyOf(new Date())` in the UI).
 *
 * PERF-11: the keys, unlock levels, rewards and milestones live in ./core.ts (re-exported here),
 * the part the eager result path needs; this generator is reached only by lazy chunks (level map,
 * debug surface) — eager code imports ./core.ts, never this file (checked on the build's source map,
 * BACKLOG PERF-11: no `daily/challenge.ts` in the entry chunk).
 */
export { REWARD, STREAK_MILESTONES, UNLOCK_AFTER_LEVEL, WEEKLY_BEST_KEEP, WEEKLY_REWARD, WEEKLY_STREAK_MILESTONES, WEEKLY_UNLOCK_AFTER_LEVEL, dayKeyOf, goldReward, weekKeyOf } from './core';

/** First level of the pool; the challenge unlocks once the player has cleared `UNLOCK_AFTER_LEVEL`. */
export const POOL_FROM = 9;
export const POOL_TO = 50;

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

export interface DailyChallenge {
  dayKey: string; // YYYY-MM-DD (UTC)
  levelId: number;
  seed: number;
  twist: Twist;
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

/** The day key of a day number (inverse of `dayNumberOf`); never throws, so hostile keys stay total. */
export function dayKeyOfNumber(n: number): string {
  const d = new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);
  const pad = (v: number, w: number): string => String(v).padStart(w, '0');
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

/** The raw twist draw of day `n`: `TWISTS[FNV(dayKey + "#twist") mod 5]` — the v1 rule, a second hash so the twist does not correlate with the seed. */
export function rawTwistForDay(n: number): Twist {
  return TWISTS[hashDayKey(`${dayKeyOfNumber(n)}#twist`) % TWISTS.length]!;
}

/**
 * The twist of day `n` with the guarantee that consecutive days never share a twist (DAILY-5,
 * GDD §7.2). Even days (n even, anchored on 2026-01-01 = 0) are *free*: they play their raw draw.
 * An odd day plays its raw draw unless that draw equals the raw draw of either neighbour (n−1 and
 * n+1, both even and therefore free); then it takes one of the 3–4 twists neither neighbour plays,
 * picked by a second hash (`#twist2`).
 *
 * Proof: any two consecutive days are one even day E and one odd day O. twist(E) = raw(E) and
 * twist(O) ∉ {raw(O−1), raw(O+1)}, a set that contains raw(E); hence twist(O) ≠ twist(E). The rule
 * reads only *raw* draws, never another day's effective twist, so it is O(1) (at most four hashes)
 * and never recurses. Odd days keep a uniform distribution by symmetry: the banned set is a
 * rotation-invariant draw, and the fallback is uniform over what is left.
 */
export function twistForDay(n: number): Twist {
  const raw = rawTwistForDay(n);
  if ((n & 1) === 0) return raw;
  const banned = new Set<Twist>([rawTwistForDay(n - 1), rawTwistForDay(n + 1)]);
  if (!banned.has(raw)) return raw;
  const allowed = TWISTS.filter((t) => !banned.has(t));
  return allowed[hashDayKey(`${dayKeyOfNumber(n)}#twist2`) % allowed.length]!;
}

function pool(): readonly { id: number; star3: number }[] {
  return LEVEL_META.filter((m) => m.id >= POOL_FROM && m.id <= POOL_TO);
}

/**
 * The challenge for a day key; throws on a malformed key. Deterministic and pure. Levels come
 * from a per-cycle shuffle of the pool (DAILY-4): day n plays position `n mod poolSize` of the
 * permutation seeded by `n div poolSize`, so a level never repeats within one cycle (42 days at
 * pool 9–50) and consecutive days still look random. The twist is `twistForDay(n)` (DAILY-5):
 * never the same twist on consecutive days.
 */
export function challengeFor(dayKey: string): DailyChallenge {
  const n = dayNumberOf(dayKey);
  const levels = pool();
  const cycle = Math.floor(n / levels.length);
  const pos = ((n % levels.length) + levels.length) % levels.length;
  const level = seededOrder(levels, hashDayKey(`cycle#${cycle}`))[pos]!;
  const h = hashDayKey(dayKey);
  return { dayKey, levelId: level.id, seed: (h % 1_000_000) + 1, twist: twistForDay(n) };
}

/* ---------- Weekly Challenge (GDD §8, WEEKLY-1) ---------- */

/** Weekly pool starts at band 4; the weekly unlocks once level `WEEKLY_UNLOCK_AFTER_LEVEL` has a star. */
export const WEEKLY_POOL_FROM = 33;

export interface WeeklyChallenge {
  weekKey: string; // YYYY-MM-DD of the week's Monday (UTC)
  levelId: number;
  seed: number;
  twist: Twist; // never 'plain'
  targetMs: number; // the level's own 3★ clock
}

export function isMondayKey(dayKey: string): boolean {
  if (!DAY_KEY.test(dayKey)) return false;
  const d = new Date(`${dayKey}T00:00:00Z`);
  // a real calendar date (V8 rolls `2026-02-30` over to Monday March 2) that is a Monday
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dayKey && d.getUTCDay() === 1;
}

/**
 * The cut-over Monday of the weekly cycle permutation (AUD-B13, GDD §8.1): week 0 of block 0. Every
 * week before it keeps the v1 draw byte-for-byte (saves hold weekly results by week key, the
 * TestFlight plan lists past weeks); from it on, levels come from one permutation per 18-week block.
 */
export const WEEKLY_CYCLE_FROM = '2026-11-09';

function weeklyPool(): readonly LevelMeta[] {
  return LEVEL_META.filter((m) => m.id >= WEEKLY_POOL_FROM && m.id <= POOL_TO);
}

/** Week index of a Monday key counted from `WEEKLY_CYCLE_FROM` (0 = the cut-over week, negative before it). */
export function weekIndexOf(weekKey: string): number {
  return (dayNumberOf(weekKey) - dayNumberOf(WEEKLY_CYCLE_FROM)) / 7;
}

/** The v1 level draw (2026-09-20 … 2026-11-08): `pool[FNV(weekKey + "#week") mod 18]`. Serves every key before the cut-over. */
export function legacyWeeklyLevelId(weekKey: string): number {
  const levels = weeklyPool();
  return levels[hashDayKey(`${weekKey}#week`) % levels.length]!.id;
}

/**
 * The level of week index `i ≥ 0` (AUD-B13): block `b = floor(i / 18)`, position `i mod 18` of
 * `seededOrder(pool, FNV("weekcycle#" + b))` — the daily's DAILY-4 construction, so no level repeats
 * inside a block. Boundary rule: when the block's first level equals the level of the week before the
 * block (block 0: the v1 draw of the Monday before the cut-over; later blocks: the last level of the
 * previous block's order, which the rule never touches), positions 0 and 1 of the block swap. The
 * previous block's last level is read from its *raw* order, so the rule is O(1) and never chains.
 */
function weeklyLevelAt(i: number): LevelMeta {
  const levels = weeklyPool();
  const size = levels.length;
  const block = Math.floor(i / size);
  const pos = i % size;
  const order = seededOrder(levels, hashDayKey(`weekcycle#${block}`));
  if (pos <= 1 && size > 2) {
    const before = block === 0 ? legacyWeeklyLevelId(dayKeyOfNumber(dayNumberOf(WEEKLY_CYCLE_FROM) - 7)) : seededOrder(levels, hashDayKey(`weekcycle#${block - 1}`))[size - 1]!.id;
    if (order[0]!.id === before) [order[0], order[1]] = [order[1]!, order[0]!];
  }
  return order[pos]!;
}

/**
 * The weekly challenge for a Monday key; throws on a non-Monday or malformed key. The level is the
 * v1 hash draw before `WEEKLY_CYCLE_FROM` and the cycle permutation from it on (`weeklyLevelAt`); seed
 * and twist are the v1 construction on every key: `seed = (FNV(weekKey + "#week") mod 1e6) + 1`,
 * `twist = non-plain TWISTS[FNV(weekKey + "#weektwist") mod 4]`.
 */
export function weeklyFor(weekKey: string): WeeklyChallenge {
  if (!isMondayKey(weekKey)) throw new Error(`weekly: not a Monday key ${weekKey}`);
  const i = weekIndexOf(weekKey);
  const levelId = i < 0 ? legacyWeeklyLevelId(weekKey) : weeklyLevelAt(i).id;
  const level = weeklyPool().find((m) => m.id === levelId)!;
  const h = hashDayKey(`${weekKey}#week`);
  const twists = TWISTS.filter((t) => t.id !== 'plain');
  const twist = twists[hashDayKey(`${weekKey}#weektwist`) % twists.length]!;
  return { weekKey, levelId: level.id, seed: (h % 1_000_000) + 1, twist, targetMs: level.star3 };
}
