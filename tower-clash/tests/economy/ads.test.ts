import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('never requires a privacy-options entry and showPrivacyOptions is a no-op', async () => {
    expect(await noAds.privacyOptionsRequired()).toBe(false);
    await expect(noAds.showPrivacyOptions()).resolves.toBeUndefined();
  });
});

describe('adMobAds before init', () => {
  it('is unavailable and never rejects', async () => {
    expect(adMobAds.isAvailable()).toBe(false);
    expect(await adMobAds.showInterstitial()).toBe(false);
    expect(await adMobAds.showRewarded('x')).toEqual({ rewarded: false });
  });

  it('reports no privacy-options requirement and showPrivacyOptions is a no-op', async () => {
    expect(await adMobAds.privacyOptionsRequired()).toBe(false);
    await expect(adMobAds.showPrivacyOptions()).resolves.toBeUndefined();
  });

  it('init() on the web is a no-op and leaves the privacy-options status untouched', async () => {
    await adMobAds.init();
    expect(adMobAds.isAvailable()).toBe(false);
    expect(await adMobAds.privacyOptionsRequired()).toBe(false);
  });
});

// ECON-3 "no tracking" (docs/publishing/STORE_LISTING.md §6.4 option A): the iOS App Tracking
// Transparency prompt must never come back by accident — the App Privacy answers depend on it.
describe('no tracking (ECON-3)', () => {
  const ROOT = join(__dirname, '..', '..');
  const admobSrc = readFileSync(join(ROOT, 'src', 'economy', 'providers', 'admob.ts'), 'utf8');

  it('the AdMob provider never calls the ATT APIs', () => {
    expect(admobSrc).not.toMatch(/AdMob\s*\.\s*requestTrackingAuthorization\s*\(/);
    expect(admobSrc).not.toMatch(/AdMob\s*\.\s*trackingAuthorizationStatus\s*\(/);
  });

  it('every ad request passes the non-personalised flag (npa) through', () => {
    expect(admobSrc).toMatch(/prepareInterstitial\(\{[^}]*\bnpa:/s);
    expect(admobSrc).toMatch(/prepareRewardVideoAd\(\{[^}]*\bnpa:/s);
    expect(admobSrc).toMatch(/nonPersonalised = platform === 'ios'/);
  });

  it('Info.plist has no NSUserTrackingUsageDescription key but keeps SKAdNetworkItems', () => {
    const plist = readFileSync(join(ROOT, 'ios', 'App', 'App', 'Info.plist'), 'utf8');
    expect(plist).not.toMatch(/<key>NSUserTrackingUsageDescription<\/key>/);
    expect(plist).toMatch(/<key>SKAdNetworkItems<\/key>/);
    expect(plist).toMatch(/cstr6suwn9\.skadnetwork/);
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
