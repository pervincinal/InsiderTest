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
export const POOL_TO = 40;
export const UNLOCK_AFTER_LEVEL = 8;

export interface Twist {
  id: 'plain' | 'lean' | 'fastFeet' | 'thinWalls' | 'reinforced';
  modifiers: Readonly<PlayerModifiers>;
}

export const TWISTS: readonly Twist[] = Object.freeze([
  { id: 'plain', modifiers: DEFAULT_MODIFIERS },
  { id: 'lean', modifiers: { ...DEFAULT_MODIFIERS, productionMul: 0.85 } },
  { id: 'fastFeet', modifiers: { ...DEFAULT_MODIFIERS, unitSpeedMul: 1.25 } },
  { id: 'thinWalls', modifiers: { ...DEFAULT_MODIFIERS, capacityMul: 0.8 } },
  { id: 'reinforced', modifiers: { ...DEFAULT_MODIFIERS, startGarrisonBonus: 5 } },
]);

/** Rewards for the first win of the day (ECONOMY.md §3.x): base + per star. */
export const REWARD = Object.freeze({ gold: 30, goldPerStar: 10, crystals: 5 });

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

/** The challenge for a day key; throws on a malformed key. Deterministic and pure. */
export function challengeFor(dayKey: string): DailyChallenge {
  if (!DAY_KEY.test(dayKey)) throw new Error(`daily: bad day key ${dayKey}`);
  const h = hashDayKey(dayKey);
  const pool = LEVEL_META.filter((m) => m.id >= POOL_FROM && m.id <= POOL_TO);
  const level = pool[h % pool.length]!;
  // a second hash so the twist does not correlate with the level choice
  const h2 = hashDayKey(`${dayKey}#twist`);
  const twist = TWISTS[h2 % TWISTS.length]!;
  return { dayKey, levelId: level.id, seed: (h % 1_000_000) + 1, twist };
}

/** Gold paid for a first win with `stars` stars. */
export function goldReward(stars: number): number {
  return REWARD.gold + REWARD.goldPerStar * Math.max(0, Math.min(3, stars));
}
