import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ isNative: false }));

vi.mock('../../src/native/index', () => ({
  isNative: () => native.isNative,
  getPlatform: () => (native.isNative ? 'android' : 'web'),
}));

import { getAds, resetAdsForTests } from '../../src/economy/ads';
import { noAds } from '../../src/economy/providers/noAds';
import { adMobAds, resetAdMobForTests } from '../../src/economy/providers/admob';
import { ADMOB_TEST_UNITS, adMobUnits } from '../../src/economy/providers/config';

beforeEach(() => {
  native.isNative = false;
  resetAdsForTests();
  resetAdMobForTests();
});

describe('getAds selection', () => {
  it('returns the no-op provider on the web', () => {
    expect(getAds()).toBe(noAds);
  });

  it('returns the AdMob provider inside a native shell', () => {
    native.isNative = true;
    expect(getAds()).toBe(adMobAds);
  });
});

describe('noAds', () => {
  it('is never available and resolves immediately', async () => {
    await noAds.init();
    expect(noAds.isAvailable()).toBe(false);
    expect(await noAds.showInterstitial()).toBe(false);
    expect(await noAds.showRewarded('level_retry')).toEqual({ rewarded: false });
  });
});

describe('adMobAds before init', () => {
  it('is unavailable and never rejects', async () => {
    expect(adMobAds.isAvailable()).toBe(false);
    expect(await adMobAds.showInterstitial()).toBe(false);
    expect(await adMobAds.showRewarded('x')).toEqual({ rewarded: false });
  });
});

describe('ad unit configuration', () => {
  it('falls back to Google test units when nothing is configured', () => {
    for (const platform of ['android', 'ios'] as const) {
      const u = adMobUnits(platform);
      expect(u.interstitial).toBe(ADMOB_TEST_UNITS[platform].interstitial);
      expect(u.rewarded).toBe(ADMOB_TEST_UNITS[platform].rewarded);
      expect(u.usesTestIds).toBe(true);
    }
  });

  it('uses Google\'s official test ids', () => {
    expect(ADMOB_TEST_UNITS.android.appId).toBe('ca-app-pub-3940256099942544~3347511713');
    expect(ADMOB_TEST_UNITS.ios.appId).toBe('ca-app-pub-3940256099942544~1458002511');
  });
});
