/**
 * Ad placement policy (ECONOMY.md §5) on top of the `AdsProvider` abstraction: interstitial gating
 * (`INTERSTITIAL_RULES`) and rewarded placements with daily caps + cooldowns (`AD_PLACEMENTS`).
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
import { AD_PLACEMENTS, INTERSTITIAL_RULES } from './catalog';
import { interstitialsDisabled } from './entitlements';
import { dayKey } from './wallet';

export interface AdSession {
  interstitialsShown: number;
  /** Results seen since the last ad of any kind (a rewarded video resets it too). */
  levelsSinceAd: number;
  /** Wall-clock ms of the last ad of any kind (-Infinity before the first). */
  lastAdAtMs: number;
  /** A rewarded video was watched on the result screen currently showing. */
  rewardedOnResult: boolean;
  /** Last rewarded video per placement id (cooldowns). */
  lastRewardedAtMs: Record<string, number>;
  rewardedShown: number;
}

export function createAdSession(): AdSession {
  return { interstitialsShown: 0, levelsSinceAd: 0, lastAdAtMs: -Infinity, rewardedOnResult: false, lastRewardedAtMs: {}, rewardedShown: 0 };
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

export interface FakeAdsProvider extends AdsProvider {
  interstitials: number;
  rewarded: number;
  /** Whether the next rewarded videos fire their reward event (default true). */
  rewardNext: boolean;
}

/** In-memory ads provider: always available, every interstitial "shows", rewarded videos reward at once. */
export function createFakeAds(delayMs = 0): FakeAdsProvider {
  const wait = (): Promise<void> => (delayMs > 0 ? new Promise((r) => setTimeout(r, delayMs)) : Promise.resolve());
  const fake: FakeAdsProvider = {
    interstitials: 0,
    rewarded: 0,
    rewardNext: true,
    async init() {
      /* nothing */
    },
    isAvailable: () => true,
    async showInterstitial() {
      await wait();
      fake.interstitials += 1;
      return true;
    },
    async showRewarded() {
      await wait();
      if (!fake.rewardNext) return { rewarded: false };
      fake.rewarded += 1;
      return { rewarded: true };
    },
    // No consent SDK in the fake: the Settings "Privacy options" entry stays hidden.
    privacyOptionsRequired: async () => false,
    showPrivacyOptions: async () => undefined,
  };
  return fake;
}

/* ---------- interstitial ---------- */

/** Call once per result screen (win or loss) before deciding on an interstitial. */
export function onResultShown(session: AdSession): void {
  session.levelsSinceAd += 1;
  session.rewardedOnResult = false;
}

export type InterstitialBlock = 'disabled' | 'unavailable' | 'tooEarly' | 'notNth' | 'cooldown' | 'sessionCap' | 'rewarded';

/** Why an interstitial may not fire now, or null when it may (ECONOMY.md §5.1). */
export function interstitialBlockedBy(session: AdSession, save: SaveData, nowMs: number, available: boolean): InterstitialBlock | null {
  if (interstitialsDisabled(save)) return 'disabled';
  if (!available) return 'unavailable';
  if (save.adCounters.levelsCompleted <= INTERSTITIAL_RULES.minLevelsCompleted) return 'tooEarly';
  if (session.interstitialsShown >= INTERSTITIAL_RULES.sessionCap) return 'sessionCap';
  if (INTERSTITIAL_RULES.skipAfterRewarded && session.rewardedOnResult) return 'rewarded';
  if (session.levelsSinceAd < INTERSTITIAL_RULES.everyNthCompletedLevel) return 'notNth';
  if (nowMs - session.lastAdAtMs < INTERSTITIAL_RULES.minMsSinceLastAd) return 'cooldown';
  return null;
}

/**
 * Show the level-break interstitial when every rule allows it. Resolves true iff an ad was shown;
 * never rejects, never blocks the caller's navigation on failure.
 */
export async function maybeShowInterstitial(session: AdSession, save: SaveData, nowMs = Date.now(), ads: AdsProvider = currentAds()): Promise<boolean> {
  if (interstitialBlockedBy(session, save, nowMs, ads.isAvailable())) return false;
  let shown = false;
  try {
    shown = await ads.showInterstitial();
  } catch {
    shown = false;
  }
  if (shown) {
    session.interstitialsShown += 1;
    session.levelsSinceAd = 0;
    session.lastAdAtMs = nowMs;
  }
  return shown;
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
  session.levelsSinceAd = 0;
  session.rewardedOnResult = true;
  session.rewardedShown += 1;
  writeSave(save);
  return true;
}
