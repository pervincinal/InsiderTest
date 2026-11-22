/**
 * REV-21 / REV-24 (docs/ECONOMY.md §5): the AdMob provider inside a (mocked) native shell, against
 * a fake `@capacitor-community/admob` that records every load / show and lets a test hold a load
 * open. Two placements map to two rewarded units (`rewardedByPlacement`): the ad shown for a
 * placement must be that placement's unit even when another unit's load is in flight, and two
 * show requests must never overlap (`showing` is claimed before the first await).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (payload?: unknown) => void;

const sdk = vi.hoisted(() => ({
  /** `adId`s handed to prepareInterstitial / prepareRewardVideoAd, in call order. */
  loads: [] as string[],
  /** Loads that resolve only when `release(adId)` is called (else at once). */
  manual: false,
  pending: new Map<string, Array<() => void>>(),
  /** What the fake SDK holds right now. */
  interstitialLoaded: null as string | null,
  rewardedLoaded: null as string | null,
  /** Units shown by showInterstitial / showRewardVideoAd. */
  shownInterstitials: [] as string[],
  shownRewarded: [] as string[],
  listeners: new Map<string, Set<Listener>>(),
  reset(): void {
    this.loads = [];
    this.manual = false;
    this.pending = new Map();
    this.interstitialLoaded = null;
    this.rewardedLoaded = null;
    this.shownInterstitials = [];
    this.shownRewarded = [];
    this.listeners = new Map();
  },
  release(adId: string): void {
    const waiters = this.pending.get(adId) ?? [];
    this.pending.delete(adId);
    for (const w of waiters) w();
  },
  emit(event: string, payload?: unknown): void {
    for (const l of this.listeners.get(event) ?? []) l(payload);
  },
  load(adId: string): Promise<void> {
    this.loads.push(adId);
    if (!this.manual) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const list = this.pending.get(adId) ?? [];
      list.push(resolve);
      this.pending.set(adId, list);
    });
  },
}));

vi.mock('@capacitor-community/admob', () => {
  const InterstitialAdPluginEvents = {
    Showed: 'interstitialAdShowed',
    Dismissed: 'interstitialAdDismissed',
    FailedToShow: 'interstitialAdFailedToShow',
  };
  const RewardAdPluginEvents = {
    Rewarded: 'onRewardedVideoAdReward',
    Dismissed: 'onRewardedVideoAdDismissed',
    FailedToShow: 'onRewardedVideoAdFailedToShow',
  };
  const AdMob = {
    initialize: async () => undefined,
    requestConsentInfo: async () => ({ status: 'NOT_REQUIRED', isConsentFormAvailable: false, canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' }),
    showConsentForm: async () => ({ status: 'OBTAINED', isConsentFormAvailable: true, canRequestAds: true }),
    showPrivacyOptionsForm: async () => undefined,
    addListener: (event: string, fn: Listener) => {
      const set = sdk.listeners.get(event) ?? new Set<Listener>();
      set.add(fn);
      sdk.listeners.set(event, set);
      return Promise.resolve({ remove: async () => void set.delete(fn) });
    },
    prepareInterstitial: async ({ adId }: { adId: string }) => {
      await sdk.load(adId);
      sdk.interstitialLoaded = adId;
    },
    prepareRewardVideoAd: async ({ adId }: { adId: string }) => {
      await sdk.load(adId);
      sdk.rewardedLoaded = adId;
    },
    showInterstitial: async () => {
      if (!sdk.interstitialLoaded) throw new Error('no interstitial loaded');
      sdk.shownInterstitials.push(sdk.interstitialLoaded);
      sdk.interstitialLoaded = null;
      sdk.emit(InterstitialAdPluginEvents.Showed);
      sdk.emit(InterstitialAdPluginEvents.Dismissed);
    },
    showRewardVideoAd: async () => {
      if (!sdk.rewardedLoaded) throw new Error('no rewarded ad loaded');
      sdk.shownRewarded.push(sdk.rewardedLoaded);
      sdk.rewardedLoaded = null;
      sdk.emit(RewardAdPluginEvents.Rewarded, { type: 'coins', amount: 1 });
      sdk.emit(RewardAdPluginEvents.Dismissed);
    },
  };
  return {
    AdMob,
    AdmobConsentStatus: { NOT_REQUIRED: 'NOT_REQUIRED', OBTAINED: 'OBTAINED', REQUIRED: 'REQUIRED', UNKNOWN: 'UNKNOWN' },
    MaxAdContentRating: { General: 'General' },
    InterstitialAdPluginEvents,
    RewardAdPluginEvents,
  };
});

vi.mock('../../src/native/index', () => ({
  isNative: () => true,
  getPlatform: () => 'android',
}));

const UNITS = { interstitial: 'unit-I', rewarded: 'unit-A', rewardedByPlacement: { rv_continue: 'unit-B' }, usesTestIds: true };
vi.mock('../../src/economy/providers/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/economy/providers/config')>()),
  adMobUnits: () => UNITS,
}));

import { adMobAds, resetAdMobForTests } from '../../src/economy/providers/admob';

/** Let pending promise chains settle without moving the clock. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  sdk.reset();
  resetAdMobForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('init', () => {
  it('initialises, runs consent, and preloads the interstitial and the default rewarded unit', async () => {
    await adMobAds.init();
    expect(adMobAds.isAvailable()).toBe(true);
    expect(sdk.loads).toEqual(['unit-I', 'unit-A']);
  });
});

describe('showRewarded plays the placement\'s unit (REV-21)', () => {
  it('a placement without its own unit shows the preloaded default unit without another load', async () => {
    await adMobAds.init();
    await settle();
    expect(await adMobAds.showRewarded('level_retry')).toEqual({ rewarded: true });
    expect(sdk.shownRewarded).toEqual(['unit-A']);
    await settle();
    expect(sdk.loads).toEqual(['unit-I', 'unit-A', 'unit-A']); // the next default ad is preloaded after the show
  });

  it('a placement with its own unit loads and shows that unit while the default one is ready', async () => {
    await adMobAds.init();
    await settle();
    expect(await adMobAds.showRewarded('rv_continue')).toEqual({ rewarded: true });
    expect(sdk.shownRewarded).toEqual(['unit-B']);
    expect(sdk.loads.slice(0, 3)).toEqual(['unit-I', 'unit-A', 'unit-B']);
  });

  it('Continue tapped while the default unit is still loading: waits, loads the rv_continue unit and shows it — never the default', async () => {
    sdk.manual = true;
    await adMobAds.init(); // unit-I and unit-A loads are held open
    expect(sdk.loads).toEqual(['unit-I', 'unit-A']);
    const result = adMobAds.showRewarded('rv_continue');
    await settle();
    expect(sdk.loads).toEqual(['unit-I', 'unit-A']); // unit-B is not requested on top of the in-flight load
    expect(sdk.shownRewarded).toEqual([]);
    sdk.release('unit-A');
    await settle();
    expect(sdk.loads).toEqual(['unit-I', 'unit-A', 'unit-B']); // ...but right after it settles
    expect(sdk.shownRewarded).toEqual([]); // and nothing is shown before unit-B is loaded
    sdk.release('unit-B');
    expect(await result).toEqual({ rewarded: true });
    expect(sdk.shownRewarded).toEqual(['unit-B']);
    sdk.release('unit-A'); // the post-show default preload
    await settle();
    expect(sdk.loads).toEqual(['unit-I', 'unit-A', 'unit-B', 'unit-A']);
  });

  it('a request for the unit already in flight shares that load (no duplicate prepare call)', async () => {
    sdk.manual = true;
    await adMobAds.init();
    const result = adMobAds.showRewarded('level_retry'); // default unit, same as the in-flight one
    await settle();
    expect(sdk.loads).toEqual(['unit-I', 'unit-A']);
    sdk.release('unit-A');
    expect(await result).toEqual({ rewarded: true });
    expect(sdk.shownRewarded).toEqual(['unit-A']);
  });

  it('a load that finishes only after its 12 s timeout cannot override a newer unit', async () => {
    vi.useFakeTimers();
    sdk.manual = true;
    await adMobAds.init();
    await vi.advanceTimersByTimeAsync(12_000); // the init preload of unit-A gives up (the SDK call is still running)
    const result = adMobAds.showRewarded('rv_continue');
    await settle();
    expect(sdk.loads).toEqual(['unit-I', 'unit-A', 'unit-B']);
    sdk.release('unit-A'); // the stale load lands now: it must not be taken for the loaded ad
    await settle();
    expect(sdk.shownRewarded).toEqual([]);
    sdk.release('unit-B');
    expect(await result).toEqual({ rewarded: true });
    expect(sdk.shownRewarded).toEqual(['unit-B']);
  });

  it('a failed or timed-out load yields { rewarded: false } and leaves the provider usable', async () => {
    vi.useFakeTimers();
    sdk.manual = true;
    await adMobAds.init();
    sdk.release('unit-A');
    await settle();
    const result = adMobAds.showRewarded('rv_continue');
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await result).toEqual({ rewarded: false });
    expect(sdk.shownRewarded).toEqual([]);
    // The late unit-B load lands (nothing newer was requested, so the SDK really holds unit-B now):
    // the next default-placement show must load unit-A again rather than play unit-B.
    sdk.release('unit-B');
    await settle();
    const next = adMobAds.showRewarded('level_retry');
    await settle();
    expect(sdk.loads).toEqual(['unit-I', 'unit-A', 'unit-B', 'unit-A']);
    sdk.release('unit-A');
    expect(await next).toEqual({ rewarded: true });
    expect(sdk.shownRewarded).toEqual(['unit-A']);
  });
});

describe('show requests never overlap (REV-24)', () => {
  it('showInterstitial during a rewarded load is refused; the rewarded ad still completes; the interstitial works afterwards', async () => {
    sdk.manual = true;
    await adMobAds.init();
    sdk.release('unit-I');
    await settle();
    const rewarded = adMobAds.showRewarded('level_retry'); // waits for unit-A
    await settle();
    expect(await adMobAds.showInterstitial()).toBe(false); // refused at once, nothing shown
    expect(sdk.shownInterstitials).toEqual([]);
    sdk.release('unit-A');
    expect(await rewarded).toEqual({ rewarded: true });
    expect(sdk.shownRewarded).toEqual(['unit-A']);
    expect(await adMobAds.showInterstitial()).toBe(true);
    expect(sdk.shownInterstitials).toEqual(['unit-I']);
  });

  it('a second showRewarded during the first one\'s load is refused and does not show a second ad', async () => {
    sdk.manual = true;
    await adMobAds.init();
    const first = adMobAds.showRewarded('level_retry');
    await settle();
    expect(await adMobAds.showRewarded('rv_continue')).toEqual({ rewarded: false });
    sdk.release('unit-A');
    expect(await first).toEqual({ rewarded: true });
    expect(sdk.shownRewarded).toEqual(['unit-A']);
    expect(sdk.loads).not.toContain('unit-B');
  });

  it('showRewarded during an interstitial load is refused and the guard is released when the interstitial finishes', async () => {
    sdk.manual = true;
    await adMobAds.init();
    sdk.release('unit-A');
    await settle();
    const interstitial = adMobAds.showInterstitial(); // waits for unit-I
    await settle();
    expect(await adMobAds.showRewarded('level_retry')).toEqual({ rewarded: false });
    sdk.release('unit-I');
    expect(await interstitial).toBe(true);
    expect(await adMobAds.showRewarded('level_retry')).toEqual({ rewarded: true });
    expect(sdk.shownRewarded).toEqual(['unit-A']);
  });

  it('the guard is released when the ad fails to load', async () => {
    vi.useFakeTimers();
    sdk.manual = true;
    await adMobAds.init();
    const first = adMobAds.showInterstitial();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await first).toBe(false);
    sdk.release('unit-I');
    sdk.release('unit-A');
    await settle();
    expect(await adMobAds.showRewarded('level_retry')).toEqual({ rewarded: true });
  });
});
