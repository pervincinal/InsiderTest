/**
 * Advertising abstraction. The UI talks only to `AdsProvider`; the concrete provider is AdMob
 * inside a native shell (`providers/admob.ts`) and a no-op on the web (`providers/noAds.ts`).
 *
 * Contract for callers (Frontend Engineer):
 *   - Call `init()` once at startup (never rejects). It may show the Google UMP consent form
 *     (EEA/UK) — do it on the title screen, not mid-battle. There is NO iOS App Tracking
 *     Transparency prompt: the app does not track (STORE_LISTING.md §6.4 option A); iOS always
 *     requests non-personalised ads.
 *   - `isAvailable()` false => hide every ad-driven button (rewarded offers, etc.).
 *   - "Remove ads" is an entitlement the UI owns (from `StoreProvider`): when the player owns it,
 *     simply do not call `showInterstitial()`. Whether rewarded ads stay on for paying players is
 *     an ECONOMY.md decision; this module does not know about entitlements.
 *   - `showInterstitial()` resolves true iff an ad was actually shown (and dismissed). Never
 *     block gameplay on it; treat false as "carry on".
 *   - `showRewarded(placementId)` resolves `{ rewarded: true }` ONLY when the ad network fired
 *     its reward event. Grant the reward iff `rewarded`. `placementId` is an opaque string from
 *     the economy catalog (used for analytics and optional per-placement ad units).
 *   - Settings → "Privacy options" (privacy policy B.2): render the entry iff
 *     `await privacyOptionsRequired()` is true (Google requires it for EEA/UK users who saw the
 *     consent form) and call `showPrivacyOptions()` on tap. Both never reject; re-check
 *     `isAvailable()` afterwards because the player may have withdrawn consent.
 *
 * Owned by the Mobile Engineer.
 */
import { isNative } from '../native/index';
import { adMobAds } from './providers/admob';
import { noAds } from './providers/noAds';

export interface RewardedResult {
  rewarded: boolean;
}

export interface AdsProvider {
  /** Initialize the SDK and consent flow. Idempotent, never rejects. */
  init(): Promise<void>;
  /** False on the web, before `init()` finished, or when consent forbids ad requests. */
  isAvailable(): boolean;
  /** Show a full-screen interstitial. Resolves true iff an ad was shown; never rejects. */
  showInterstitial(): Promise<boolean>;
  /** Show a rewarded video. `{ rewarded: true }` only on the network's reward event; never rejects. */
  showRewarded(placementId: string): Promise<RewardedResult>;
  /**
   * True iff the consent SDK requires a "Privacy options" entry point in the app's settings
   * (UMP `privacyOptionsRequirementStatus === 'REQUIRED'`, i.e. an EEA/UK user who has seen the
   * consent form). False on the web, before `init()`, and everywhere consent is not required.
   * Never rejects.
   */
  privacyOptionsRequired(): Promise<boolean>;
  /**
   * Reopen the consent ("privacy options") form so the player can change or withdraw consent.
   * Resolves when the form is dismissed; no-op when `privacyOptionsRequired()` is false or an
   * ad is on screen. Never rejects.
   */
  showPrivacyOptions(): Promise<void>;
}

let ads: AdsProvider | null = null;

/** The ads provider for this runtime: AdMob inside a native shell, no-op everywhere else. */
export function getAds(): AdsProvider {
  if (!ads) ads = isNative() ? adMobAds : noAds;
  return ads;
}

/** Test hook: forget the cached provider so the next `getAds()` re-evaluates `isNative()`. */
export function resetAdsForTests(): void {
  ads = null;
}
