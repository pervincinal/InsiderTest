/**
 * No-op ads provider for the web / PWA / tests: never available, never shows anything, and a
 * rewarded request resolves `{ rewarded: false }` immediately (the UI hides rewarded buttons
 * when `isAvailable()` is false, so this path is only a safety net).
 */
import type { AdsProvider, RewardedResult } from '../ads';

export const noAds: AdsProvider = {
  async init(): Promise<void> {
    /* nothing to set up */
  },
  isAvailable(): boolean {
    return false;
  },
  async showInterstitial(): Promise<boolean> {
    return false;
  },
  async showRewarded(_placementId: string): Promise<RewardedResult> {
    return { rewarded: false };
  },
  async privacyOptionsRequired(): Promise<boolean> {
    return false;
  },
  async showPrivacyOptions(): Promise<void> {
    /* no consent SDK on the web */
  },
};
