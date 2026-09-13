import { beforeEach, describe, expect, it } from 'vitest';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { AdSession } from '../../src/economy/adsFlow';
import {
  canShowRewarded,
  createAdSession,
  createFakeAds,
  interstitialBlockedBy,
  maybeShowInterstitial,
  onResultShown,
  rewardedRemaining,
  showRewarded,
} from '../../src/economy/adsFlow';
import { AD_PLACEMENTS, INTERSTITIAL_RULES } from '../../src/economy/catalog';
import { noAds } from '../../src/economy/providers/noAds';
import { grantProduct } from '../../src/economy/wallet';

let save: SaveData;
let session: AdSession;
const T0 = new Date(2026, 8, 13, 12, 0, 0).getTime();
const DAY = 86_400_000;

beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  session = createAdSession();
});

/** Simulate `n` results (recordResult increments the persisted counter; onResultShown the session one). */
function results(n: number): void {
  for (let i = 0; i < n; i++) {
    save.adCounters.levelsCompleted += 1;
    onResultShown(session);
  }
}

describe('interstitial gating (ECONOMY.md §5.1)', () => {
  it('never before 5 completed levels, then on the 6th result and every 3rd after that', async () => {
    const ads = createFakeAds();
    const shownAt: number[] = [];
    for (let i = 1; i <= 12; i++) {
      results(1);
      // enough wall-clock between results so the cooldown never interferes here
      if (await maybeShowInterstitial(session, save, T0 + i * 300_000, ads)) shownAt.push(i);
    }
    expect(shownAt).toEqual([6, 9, 12]);
    expect(ads.interstitials).toBe(3);
  });

  it('respects the 120 s cooldown since the last ad of any kind', async () => {
    const ads = createFakeAds();
    results(6);
    expect(await maybeShowInterstitial(session, save, T0, ads)).toBe(true);
    results(3);
    expect(interstitialBlockedBy(session, save, T0 + 119_999, true)).toBe('cooldown');
    expect(await maybeShowInterstitial(session, save, T0 + 119_999, ads)).toBe(false);
    expect(await maybeShowInterstitial(session, save, T0 + INTERSTITIAL_RULES.minMsSinceLastAd, ads)).toBe(true);
  });

  it('caps at 4 per session', async () => {
    const ads = createFakeAds();
    let t = T0;
    let shown = 0;
    for (let i = 0; i < 30; i++) {
      results(3);
      t += 300_000;
      if (await maybeShowInterstitial(session, save, t, ads)) shown += 1;
    }
    expect(shown).toBe(INTERSTITIAL_RULES.sessionCap);
    expect(interstitialBlockedBy(session, save, t + 300_000, true)).toBe('sessionCap');
  });

  it('is skipped for remove-ads / premium owners and when no provider is available', async () => {
    results(6);
    expect(interstitialBlockedBy(session, save, T0, false)).toBe('unavailable');
    expect(await maybeShowInterstitial(session, save, T0, noAds)).toBe(false);
    grantProduct(save, 'remove_ads', 'tx');
    expect(interstitialBlockedBy(session, save, T0, true)).toBe('disabled');
    expect(await maybeShowInterstitial(session, save, T0, createFakeAds())).toBe(false);
    const premium = defaultSave();
    grantProduct(premium, 'premium_bundle', 'tx2');
    premium.adCounters.levelsCompleted = 9;
    expect(interstitialBlockedBy(createAdSession(), premium, T0, true)).toBe('disabled');
  });

  it('a rewarded video on the same result screen suppresses it and resets the counter', async () => {
    const ads = createFakeAds();
    results(6);
    expect(interstitialBlockedBy(session, save, T0, true)).toBeNull();
    expect(await showRewarded(session, save, 'rv_double_gold', T0, ads)).toBe(true);
    expect(interstitialBlockedBy(session, save, T0 + 300_000, true)).toBe('rewarded');
    results(1); // next result clears the flag but the counter restarted at the rewarded video
    expect(interstitialBlockedBy(session, save, T0 + 600_000, true)).toBe('notNth');
    results(2);
    expect(interstitialBlockedBy(session, save, T0 + 600_000, true)).toBeNull();
  });
});

describe('rewarded placements (ECONOMY.md §5.2)', () => {
  it('buttons are hidden when the provider is unavailable', () => {
    expect(canShowRewarded(session, save, 'rv_double_gold', T0, noAds)).toBe(false);
    expect(canShowRewarded(session, save, 'rv_double_gold', T0, createFakeAds())).toBe(true);
    expect(canShowRewarded(session, save, 'unknown', T0, createFakeAds())).toBe(false);
  });

  it('enforces the daily cap per placement and resets on the next calendar day', async () => {
    const ads = createFakeAds();
    const cap = AD_PLACEMENTS.find((p) => p.id === 'rv_continue')!.dailyCap;
    expect(rewardedRemaining(save, 'rv_continue', T0)).toBe(cap);
    let t = T0;
    for (let i = 0; i < cap; i++) {
      expect(await showRewarded(session, save, 'rv_continue', t, ads)).toBe(true);
      t += 61_000; // past the 60 s cooldown
    }
    expect(rewardedRemaining(save, 'rv_continue', t)).toBe(0);
    expect(canShowRewarded(session, save, 'rv_continue', t, ads)).toBe(false);
    expect(await showRewarded(session, save, 'rv_continue', t, ads)).toBe(false);
    expect(ads.rewarded).toBe(cap);
    // other placements keep their own counters
    expect(rewardedRemaining(save, 'rv_double_gold', t)).toBe(5);
    // next day: fresh
    expect(rewardedRemaining(save, 'rv_continue', T0 + DAY)).toBe(cap);
    expect(await showRewarded(session, save, 'rv_continue', T0 + DAY, ads)).toBe(true);
  });

  it('applies the per-placement cooldown', async () => {
    const ads = createFakeAds();
    expect(await showRewarded(session, save, 'rv_free_booster', T0, ads)).toBe(true);
    expect(canShowRewarded(session, save, 'rv_free_booster', T0 + 119_000, ads)).toBe(false);
    expect(canShowRewarded(session, save, 'rv_free_booster', T0 + 120_000, ads)).toBe(true);
    expect(canShowRewarded(session, save, 'rv_daily_chest', T0 + 1000, ads)).toBe(true); // separate placement
    expect(await showRewarded(session, save, 'rv_daily_chest', T0 + 1000, ads)).toBe(true);
    expect(rewardedRemaining(save, 'rv_daily_chest', T0 + 1000)).toBe(0); // cap 1 / day
  });

  it('does not count a video whose reward event never fired', async () => {
    const ads = createFakeAds();
    ads.rewardNext = false;
    expect(await showRewarded(session, save, 'rv_double_gold', T0, ads)).toBe(false);
    expect(rewardedRemaining(save, 'rv_double_gold', T0)).toBe(5);
    expect(session.rewardedOnResult).toBe(false);
  });
});
