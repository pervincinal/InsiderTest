import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ isNative: false, platform: 'web' as 'web' | 'ios' | 'android' }));

vi.mock('../../src/native/index', () => ({
  isNative: () => native.isNative,
  getPlatform: () => (native.isNative ? native.platform : 'web'),
}));

import { getStore, resetStoreForTests } from '../../src/economy/store';
import { configureFakeStore, fakeStore, resetFakeStore, FAKE_PURCHASE_DELAY_MS } from '../../src/economy/providers/fakeStore';
import { revenueCatStore, mapRevenueCatError, resetRevenueCatForTests } from '../../src/economy/providers/revenueCat';

beforeEach(() => {
  native.isNative = false;
  resetStoreForTests();
  resetFakeStore();
  resetRevenueCatForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getStore selection', () => {
  it('returns the fake store on the web', () => {
    expect(getStore()).toBe(fakeStore);
  });

  it('returns the RevenueCat store inside a native shell', () => {
    native.isNative = true;
    expect(getStore()).toBe(revenueCatStore);
  });

  it('caches the choice until reset', () => {
    const first = getStore();
    native.isNative = true;
    expect(getStore()).toBe(first);
    resetStoreForTests();
    expect(getStore()).toBe(revenueCatStore);
  });
});

describe('fakeStore', () => {
  it('is unavailable before init and available after', async () => {
    expect(fakeStore.isAvailable()).toBe(false);
    await fakeStore.init();
    expect(fakeStore.isAvailable()).toBe(true);
  });

  it('resolves ok after 300 ms with a unique transaction id', async () => {
    vi.useFakeTimers();
    await fakeStore.init();
    const p = fakeStore.purchase('crystals_small');
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(FAKE_PURCHASE_DELAY_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const r = await p;
    expect(settled).toBe(true);
    expect(r).toEqual({ ok: true, productId: 'crystals_small', transactionId: 'fake-1' });
    const r2 = fakeStore.purchase('crystals_small');
    await vi.advanceTimersByTimeAsync(FAKE_PURCHASE_DELAY_MS);
    expect((await r2).transactionId).toBe('fake-2');
  });

  it('failNext makes exactly the next purchase fail with the given reason', async () => {
    configureFakeStore({ failNext: 'cancelled', delayMs: 0 });
    expect(await fakeStore.purchase('remove_ads')).toEqual({ ok: false, productId: 'remove_ads', error: 'cancelled' });
    expect(await fakeStore.purchase('remove_ads')).toMatchObject({ ok: true, productId: 'remove_ads' });
    configureFakeStore({ failNext: 'failed' });
    configureFakeStore({ failNext: null });
    expect((await fakeStore.purchase('remove_ads')).ok).toBe(true);
  });

  it('does not report failed purchases as owned', async () => {
    configureFakeStore({ failNext: 'unavailable', delayMs: 0 });
    await fakeStore.purchase('remove_ads');
    expect(await fakeStore.restore()).toEqual([]);
  });

  it('restore returns configured owned ids plus purchases from this session', async () => {
    configureFakeStore({ owned: ['remove_ads'], delayMs: 0 });
    await fakeStore.purchase('starter_bundle');
    expect((await fakeStore.restore()).sort()).toEqual(['remove_ads', 'starter_bundle']);
  });

  it('formats prices from the price map and "$?.??" for unknown ids', async () => {
    configureFakeStore({ prices: { crystals_small: 0.99, crystals_big: 4.5 } });
    const products = await fakeStore.getProducts(['crystals_small', 'crystals_big', 'unknown_id']);
    expect(products).toEqual([
      { id: 'crystals_small', title: 'crystals_small', priceString: '$0.99', priceMicros: 990_000, currency: 'USD' },
      { id: 'crystals_big', title: 'crystals_big', priceString: '$4.50', priceMicros: 4_500_000, currency: 'USD' },
      { id: 'unknown_id', title: 'unknown_id', priceString: '$?.??', priceMicros: 0, currency: 'USD' },
    ]);
  });
});

describe('revenueCatStore without a configured key', () => {
  it('stays unavailable and never rejects', async () => {
    native.isNative = true;
    native.platform = 'android';
    await revenueCatStore.init();
    expect(revenueCatStore.isAvailable()).toBe(false);
    expect(await revenueCatStore.getProducts(['crystals_small'])).toEqual([]);
    expect(await revenueCatStore.purchase('crystals_small')).toEqual({
      ok: false,
      productId: 'crystals_small',
      error: 'unavailable',
    });
    expect(await revenueCatStore.restore()).toEqual([]);
  });

  it('maps RevenueCat error codes to the store vocabulary', () => {
    expect(mapRevenueCatError({ code: '1', userCancelled: true })).toBe('cancelled');
    expect(mapRevenueCatError({ code: 1 })).toBe('cancelled');
    expect(mapRevenueCatError({ code: '5' })).toBe('unavailable');
    expect(mapRevenueCatError({ code: '23' })).toBe('unavailable');
    expect(mapRevenueCatError({ code: '6' })).toBe('alreadyOwned');
    expect(mapRevenueCatError({ code: '10' })).toBe('failed');
    expect(mapRevenueCatError(new Error('boom'))).toBe('failed');
    expect(mapRevenueCatError(undefined)).toBe('failed');
  });
});
