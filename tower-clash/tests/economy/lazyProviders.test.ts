/**
 * PERF-7: the native providers (`providers/admob.ts`, `providers/revenueCat.ts` and the
 * `providers/config.ts` / `capacitor.config.ts` they pull in) are loaded with a dynamic `import()`
 * inside `init()` of the wrapper that `getAds()` / `getStore()` return in a native shell. The web
 * runtime must never request them; the native runtime must await the import in `init()`; and a
 * failed import must leave the wrapper unavailable without rejecting anything.
 *
 * Both provider modules are mocked with factories that count evaluations (see `freshModules`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ctl = {
  isNative: false,
  imports: { admob: 0, revenueCat: 0 },
  // What the mocked native providers report once their own init() ran.
  adsAvailable: true,
  storeAvailable: true,
  adsInitCalls: 0,
  storeInitCalls: 0,
};

vi.mock('../../src/native/index', () => ({
  isNative: () => ctl.isNative,
  getPlatform: () => (ctl.isNative ? 'android' : 'web'),
}));

type AdsModule = typeof import('../../src/economy/ads');
type StoreModule = typeof import('../../src/economy/store');

/**
 * Fresh `ads.ts` / `store.ts` instances with the native provider modules mocked by factories that
 * count evaluations. `vi.mock` factories are cached across `vi.resetModules()`, so the mocks are
 * (re)registered with `vi.doMock` for every test — a fresh registry, a fresh count.
 */
async function freshModules({ failImport = false } = {}): Promise<{ ads: AdsModule; store: StoreModule }> {
  vi.resetModules();
  vi.doMock('../../src/economy/providers/admob', () => {
    ctl.imports.admob++;
    if (failImport) throw new Error('Failed to fetch dynamically imported module: admob');
    let ready = false;
    return {
      adMobAds: {
        async init() {
          ctl.adsInitCalls++;
          ready = ctl.adsAvailable;
        },
        isAvailable: () => ready,
        showInterstitial: async () => ready,
        showRewarded: async (placementId: string) => ({ rewarded: ready && placementId === 'level_retry' }),
        privacyOptionsRequired: async () => ready,
        showPrivacyOptions: async () => undefined,
      },
    };
  });
  vi.doMock('../../src/economy/providers/revenueCat', () => {
    ctl.imports.revenueCat++;
    if (failImport) throw new Error('Failed to fetch dynamically imported module: revenueCat');
    let ready = false;
    return {
      revenueCatStore: {
        async init() {
          ctl.storeInitCalls++;
          ready = ctl.storeAvailable;
        },
        isAvailable: () => ready,
        getProducts: async (ids: string[]) =>
          ready ? ids.map((id) => ({ id, title: id, priceString: '$1.99', priceMicros: 1_990_000, currency: 'USD' })) : [],
        purchase: async (id: string) =>
          ready ? { ok: true, productId: id, transactionId: 'rc-1' } : { ok: false, productId: id, error: 'unavailable' },
        restore: async () => (ready ? ['remove_ads'] : []),
        getSupportId: async () => (ready ? '$RCAnonymousID:abc' : null),
      },
    };
  });
  const [ads, store] = await Promise.all([import('../../src/economy/ads'), import('../../src/economy/store')]);
  return { ads, store };
}

beforeEach(() => {
  ctl.isNative = false;
  ctl.imports.admob = 0;
  ctl.imports.revenueCat = 0;
  ctl.adsAvailable = true;
  ctl.storeAvailable = true;
  ctl.adsInitCalls = 0;
  ctl.storeInitCalls = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('web runtime', () => {
  it('never imports the native provider modules, even through init()', async () => {
    const { ads, store } = await freshModules();
    expect(ctl.imports).toEqual({ admob: 0, revenueCat: 0 });
    await ads.getAds().init();
    await store.getStore().init();
    expect(ctl.imports).toEqual({ admob: 0, revenueCat: 0 });
    expect(ads.getAds().isAvailable()).toBe(false);
    expect(store.getStore().isAvailable()).toBe(true); // the fake store
  });
});

describe('native runtime: ads', () => {
  it('imports admob inside init() (not on getAds()) and becomes available once init resolves', async () => {
    ctl.isNative = true;
    const { ads } = await freshModules();
    const provider = ads.getAds();
    expect(ctl.imports.admob).toBe(0);
    expect(provider.isAvailable()).toBe(false);

    const init = provider.init();
    // Synchronously after init(): the import is in flight, nothing is available yet.
    expect(provider.isAvailable()).toBe(false);
    await init;
    expect(ctl.imports.admob).toBe(1);
    expect(ctl.adsInitCalls).toBe(1);
    expect(provider.isAvailable()).toBe(true);

    // Every call is delegated to the loaded provider.
    expect(await provider.showInterstitial()).toBe(true);
    expect(await provider.showRewarded('level_retry')).toEqual({ rewarded: true });
    expect(await provider.showRewarded('other')).toEqual({ rewarded: false });
    expect(await provider.privacyOptionsRequired()).toBe(true);
    await expect(provider.showPrivacyOptions()).resolves.toBeUndefined();
  });

  it('init() is idempotent: one import, one provider init, same promise', async () => {
    ctl.isNative = true;
    const { ads } = await freshModules();
    const provider = ads.getAds();
    const a = provider.init();
    const b = provider.init();
    expect(a).toBe(b);
    await Promise.all([a, b]);
    await provider.init();
    expect(ctl.imports.admob).toBe(1);
    expect(ctl.adsInitCalls).toBe(1);
  });

  it('answers like the no-op provider before init() resolves', async () => {
    ctl.isNative = true;
    const { ads } = await freshModules();
    const provider = ads.getAds();
    expect(provider.isAvailable()).toBe(false);
    expect(await provider.showInterstitial()).toBe(false);
    expect(await provider.showRewarded('level_retry')).toEqual({ rewarded: false });
    expect(await provider.privacyOptionsRequired()).toBe(false);
    await expect(provider.showPrivacyOptions()).resolves.toBeUndefined();
    expect(ctl.imports.admob).toBe(0);
  });

  it('a failed import leaves ads unavailable and nothing rejects', async () => {
    ctl.isNative = true;
    const { ads } = await freshModules({ failImport: true });
    const provider = ads.getAds();
    await expect(provider.init()).resolves.toBeUndefined();
    expect(ctl.imports.admob).toBe(1);
    expect(ctl.adsInitCalls).toBe(0);
    expect(provider.isAvailable()).toBe(false);
    expect(await provider.showInterstitial()).toBe(false);
    expect(await provider.showRewarded('level_retry')).toEqual({ rewarded: false });
    expect(await provider.privacyOptionsRequired()).toBe(false);
    await expect(provider.showPrivacyOptions()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith('[ads] AdMob provider failed to load:', expect.any(Error));
  });

  it('stays unavailable when the loaded provider itself reports unavailable (no consent / SDK error)', async () => {
    ctl.isNative = true;
    ctl.adsAvailable = false;
    const { ads } = await freshModules();
    const provider = ads.getAds();
    await provider.init();
    expect(ctl.imports.admob).toBe(1);
    expect(provider.isAvailable()).toBe(false);
    expect(await provider.showInterstitial()).toBe(false);
  });
});

describe('native runtime: store', () => {
  it('imports revenueCat inside init() (not on getStore()) and becomes available once init resolves', async () => {
    ctl.isNative = true;
    const { store } = await freshModules();
    const provider = store.getStore();
    expect(ctl.imports.revenueCat).toBe(0);
    expect(provider.isAvailable()).toBe(false);

    const init = provider.init();
    expect(provider.isAvailable()).toBe(false);
    await init;
    expect(ctl.imports.revenueCat).toBe(1);
    expect(ctl.storeInitCalls).toBe(1);
    expect(provider.isAvailable()).toBe(true);

    expect(await provider.getProducts(['crystals_small'])).toEqual([
      { id: 'crystals_small', title: 'crystals_small', priceString: '$1.99', priceMicros: 1_990_000, currency: 'USD' },
    ]);
    expect(await provider.purchase('remove_ads')).toEqual({ ok: true, productId: 'remove_ads', transactionId: 'rc-1' });
    expect(await provider.restore()).toEqual(['remove_ads']);
    expect(await provider.getSupportId()).toBe('$RCAnonymousID:abc');
  });

  it('init() is idempotent: one import, one provider init, same promise', async () => {
    ctl.isNative = true;
    const { store } = await freshModules();
    const provider = store.getStore();
    const a = provider.init();
    expect(provider.init()).toBe(a);
    await a;
    await provider.init();
    expect(ctl.imports.revenueCat).toBe(1);
    expect(ctl.storeInitCalls).toBe(1);
  });

  it('answers like an unconfigured store before init() resolves', async () => {
    ctl.isNative = true;
    const { store } = await freshModules();
    const provider = store.getStore();
    expect(provider.isAvailable()).toBe(false);
    expect(await provider.getProducts(['crystals_small'])).toEqual([]);
    expect(await provider.purchase('remove_ads')).toEqual({ ok: false, productId: 'remove_ads', error: 'unavailable' });
    expect(await provider.restore()).toEqual([]);
    expect(await provider.getSupportId()).toBeNull();
    expect(ctl.imports.revenueCat).toBe(0);
  });

  it('a failed import leaves the store unavailable and nothing rejects', async () => {
    ctl.isNative = true;
    const { store } = await freshModules({ failImport: true });
    const provider = store.getStore();
    await expect(provider.init()).resolves.toBeUndefined();
    expect(ctl.imports.revenueCat).toBe(1);
    expect(ctl.storeInitCalls).toBe(0);
    expect(provider.isAvailable()).toBe(false);
    expect(await provider.getProducts(['crystals_small'])).toEqual([]);
    expect(await provider.purchase('remove_ads')).toEqual({ ok: false, productId: 'remove_ads', error: 'unavailable' });
    expect(await provider.restore()).toEqual([]);
    expect(await provider.getSupportId()).toBeNull();
    expect(console.warn).toHaveBeenCalledWith('[store] RevenueCat provider failed to load:', expect.any(Error));
  });

  it('resetStoreForTests / resetAdsForTests forget the loaded module so the next init() imports again', async () => {
    ctl.isNative = true;
    const { ads, store } = await freshModules();
    await ads.getAds().init();
    await store.getStore().init();
    expect(ctl.imports).toEqual({ admob: 1, revenueCat: 1 });
    ads.resetAdsForTests();
    store.resetStoreForTests();
    expect(ads.getAds().isAvailable()).toBe(false);
    expect(store.getStore().isAvailable()).toBe(false);
    await ads.getAds().init();
    await store.getStore().init();
    // The module registry still caches the factories' modules; only the wrapper's cache was reset.
    expect(ads.getAds().isAvailable()).toBe(true);
    expect(store.getStore().isAvailable()).toBe(true);
  });
});
