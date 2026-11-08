/**
 * Dev / e2e fake ads provider (`?fakeads=1`, `__towerclash.economy.setAdsAvailable`). A lazy chunk
 * (PERF-12): main.ts imports it only for the `?fakeads=1` flag and the debug surface (src/debug.ts)
 * statically, so none of it is in the eager bundle a player downloads.
 *
 * Owned by the Frontend Engineer.
 */
import type { AdsProvider } from './ads';
import { setAdsProvider } from './adsFlow';

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

let installed: FakeAdsProvider | null = null;

/** Install (true) or remove (false) the fake as the runtime ads provider (`setAdsProvider`). */
export function setFakeAds(on: boolean, delayMs = 0): void {
  installed = on ? createFakeAds(delayMs) : null;
  setAdsProvider(installed);
}

/** The installed fake, or null (the debug surface's `getAdStats`). */
export function fakeAds(): FakeAdsProvider | null {
  return installed;
}
