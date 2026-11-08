/**
 * Level-break interstitial policy (ECONOMY.md §5.1) on top of `adsFlow.ts`'s session and provider.
 * Its only caller is the result screen, so it lives in that lazy chunk (PERF-12) rather than in the
 * eager bundle with the rewarded-video rules the play HUD needs.
 *
 * Owned by the Frontend Engineer.
 */
import type { SaveData } from '../ui/save';
import type { AdsProvider } from './ads';
import type { AdSession } from './adsFlow';
import { currentAds } from './adsFlow';
import { INTERSTITIAL_RULES } from './catalog';
import { interstitialsDisabled } from './entitlements';

/** Call once per result screen (win or loss) before deciding on an interstitial. */
export function onResultShown(session: AdSession): void {
  session.rewardedOnResult = false;
}

export type InterstitialBlock = 'disabled' | 'unavailable' | 'tooEarly' | 'defeatStreak' | 'notNth' | 'cooldown' | 'sessionCap' | 'rewarded';

/** Longest defeat streak (`save.defeats`, the skip offer's count) on a level not yet cleared. */
export function unclearedDefeatStreak(save: SaveData): number {
  return Math.max(0, ...Object.entries(save.defeats).map(([id, n]) => (save.stars[id] ? 0 : n)));
}

/**
 * Why an interstitial may not fire now, or null when it may (ECONOMY.md §5.1). The one side effect:
 * a win count below the session's anchor (progress was reset) moves the anchor down to it.
 */
export function interstitialBlockedBy(session: AdSession, save: SaveData, nowMs: number, available: boolean): InterstitialBlock | null {
  session.winsAtLastAd = Math.min(session.winsAtLastAd, save.adCounters.levelsCompleted);
  if (interstitialsDisabled(save)) return 'disabled';
  if (!available) return 'unavailable';
  if (save.adCounters.levelsCompleted <= INTERSTITIAL_RULES.minLevelsCompleted) return 'tooEarly';
  if (unclearedDefeatStreak(save) >= INTERSTITIAL_RULES.noneFromDefeatStreak) return 'defeatStreak';
  if (session.interstitialsShown >= INTERSTITIAL_RULES.sessionCap) return 'sessionCap';
  if (INTERSTITIAL_RULES.skipAfterRewarded && session.rewardedOnResult) return 'rewarded';
  if (save.adCounters.levelsCompleted - session.winsAtLastAd < INTERSTITIAL_RULES.everyNthCompletedLevel) return 'notNth';
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
    session.winsAtLastAd = save.adCounters.levelsCompleted;
    session.lastAdAtMs = nowMs;
  }
  return shown;
}
