/**
 * Ad placement policy (ECONOMY.md §5) on top of the `AdsProvider` abstraction: rewarded placements with
 * daily caps + cooldowns (`AD_PLACEMENTS`) and the runtime provider override. The interstitial gating
 * (`INTERSTITIAL_RULES`) is in interstitial.ts and the dev fake in fakeAds.ts, both lazy (PERF-12).
 * The session part lives in an `AdSession` object owned by the app; the per-day counters persist
 * in `save.adCounters`. Every decision takes an explicit `nowMs` so the rules unit-test without a
 * clock. Rewards themselves are granted by the caller (this module only says "the ad was watched").
 *
 * Owned by the Frontend Engineer.
 */
import type { SaveData } from '../ui/save';
import { writeSave } from '../ui/save';
import type { AdsProvider } from './ads';
import { getAds } from './ads';
import type { AdPlacementDef } from './catalog';
import { AD_PLACEMENTS } from './catalog';
import { dayKey } from './wallet';

export interface AdSession {
  interstitialsShown: number;
  /**
   * `save.adCounters.levelsCompleted` (levels won) at the last ad of any kind, or at the session's
   * start (`createAdSession(wins)`): the "every Nth" cadence counts wins since then (AUD-B7 — a
   * defeat's result screen never brings an interstitial closer).
   */
  winsAtLastAd: number;
  /**
   * Levels won when the app started (fixed for the session). 0 = the player's first session — the
   * Starter Pack is not listed in it (`notFirstSession`, ECONOMY.md §4, AUD-B14).
   */
  readonly winsAtStart: number;
  /** Wall-clock ms of the last ad of any kind (-Infinity before the first). */
  lastAdAtMs: number;
  /** A rewarded video was watched on the result screen currently showing. */
  rewardedOnResult: boolean;
  /** Last rewarded video per placement id (cooldowns). */
  lastRewardedAtMs: Record<string, number>;
  rewardedShown: number;
}

/** `winsSoFar`: the save's `adCounters.levelsCompleted` when the session starts (the app passes its save's). */
export function createAdSession(winsSoFar = 0): AdSession {
  return { interstitialsShown: 0, winsAtLastAd: winsSoFar, winsAtStart: winsSoFar, lastAdAtMs: -Infinity, rewardedOnResult: false, lastRewardedAtMs: {}, rewardedShown: 0 };
}

/* ---------- provider selection (debug / e2e override) ---------- */

let override: AdsProvider | null = null;

/** Replace the runtime provider (fake ads in dev / Playwright); `null` restores `getAds()`. */
export function setAdsProvider(provider: AdsProvider | null): void {
  override = provider;
}

export function currentAds(): AdsProvider {
  return override ?? getAds();
}

/* ---------- rewarded ---------- */

export function placementById(id: string): AdPlacementDef | undefined {
  return (AD_PLACEMENTS as readonly AdPlacementDef[]).find((p) => p.id === id);
}

/** Reset the per-day counters when the calendar day changed. */
function rollDay(save: SaveData, nowMs: number): void {
  const today = dayKey(nowMs);
  if (save.adCounters.day !== today) save.adCounters = { ...save.adCounters, day: today, rewardedByPlacement: {} };
}

export function rewardedUsedToday(save: SaveData, placementId: string, nowMs = Date.now()): number {
  rollDay(save, nowMs);
  return save.adCounters.rewardedByPlacement[placementId] ?? 0;
}

/** Rewarded videos left today for a placement (0 for unknown placements). */
export function rewardedRemaining(save: SaveData, placementId: string, nowMs = Date.now()): number {
  const def = placementById(placementId);
  if (!def || def.type !== 'rewarded') return 0;
  return Math.max(0, def.dailyCap - rewardedUsedToday(save, placementId, nowMs));
}

/** Ms until the placement's cooldown allows another video (0 when ready). */
export function rewardedCooldownLeft(session: AdSession, placementId: string, nowMs = Date.now()): number {
  const def = placementById(placementId);
  const last = session.lastRewardedAtMs[placementId];
  if (!def || last === undefined) return 0;
  return Math.max(0, def.cooldownMs - (nowMs - last));
}

/** Button visibility: provider available (never shown disabled), cap not reached, cooldown over. */
export function canShowRewarded(session: AdSession, save: SaveData, placementId: string, nowMs = Date.now(), ads: AdsProvider = currentAds()): boolean {
  if (!ads.isAvailable()) return false;
  if (rewardedRemaining(save, placementId, nowMs) <= 0) return false;
  return rewardedCooldownLeft(session, placementId, nowMs) === 0;
}

/**
 * Show a rewarded video. Resolves true iff the network fired its reward event; on success the
 * daily counter, cooldown and "rewarded on this result" flag are updated and persisted.
 */
export async function showRewarded(session: AdSession, save: SaveData, placementId: string, nowMs = Date.now(), ads: AdsProvider = currentAds()): Promise<boolean> {
  if (!canShowRewarded(session, save, placementId, nowMs, ads)) return false;
  let rewarded = false;
  try {
    rewarded = (await ads.showRewarded(placementId)).rewarded;
  } catch {
    rewarded = false;
  }
  if (!rewarded) return false;
  rollDay(save, nowMs);
  save.adCounters.rewardedByPlacement[placementId] = (save.adCounters.rewardedByPlacement[placementId] ?? 0) + 1;
  session.lastRewardedAtMs[placementId] = nowMs;
  session.lastAdAtMs = nowMs;
  session.winsAtLastAd = save.adCounters.levelsCompleted;
  session.rewardedOnResult = true;
  session.rewardedShown += 1;
  writeSave(save);
  return true;
}
