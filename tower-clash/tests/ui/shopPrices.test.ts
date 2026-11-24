import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { ShopOpts } from '../../src/render/menusShop';
import { createAdSession } from '../../src/economy/adsFlow';
import { IAP_PRODUCTS } from '../../src/economy/catalog';
import type { IapProductDef } from '../../src/economy/catalog';
import { getStore } from '../../src/economy/store';
import type { StoreProduct } from '../../src/economy/store';
import { resetFakeStore } from '../../src/economy/providers/fakeStore';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { ShopScreen, resetShopTabMemory } from '../../src/ui/shop';

/*
 * REV-40: on a native build the shop opened before the store finished initialising showed the
 * hard-coded USD fallback ("$4.99") for the whole visit: `enter()` fired `init()` and asked for the
 * products at once, and the lazy RevenueCat wrapper answers `[]` while its chunk is still loading —
 * while BUY charged the store's real (localized) price. The products are now asked for once `init()`
 * has resolved; the USD catalog price stays the fallback for the web / `?store=off` (empty answer)
 * and for an id the store does not know (ECONOMY.md §3).
 */

const drawn: ShopOpts[] = [];
vi.mock('../../src/render/menusShop', () => ({
  drawShop: (_view: unknown, _pal: unknown, o: ShopOpts) => void drawn.push(o),
}));

const PACKS = (IAP_PRODUCTS as readonly IapProductDef[]).filter((p) => p.bonusPct !== undefined);
const usd = (id: string): string => `$${PACKS.find((p) => p.id === id)!.priceUsd.toFixed(2)}`;
/** What a localized store would answer for `id` (clearly not the USD string). */
const localized = (id: string): StoreProduct => ({ id, title: id, priceString: `₼ ${id}`, priceMicros: 1, currency: 'AZN' });

interface TestApp extends App {
  current?: Screen;
}

function fakeApp(save: SaveData, current?: Screen): TestApp {
  return {
    view: {} as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel: () => Promise.resolve(true),
    go() {},
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-11-24',
    weekKey: () => '2026-11-23',
    ...(current ? { current } : {}),
  };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function lastDraw(shop: ShopScreen): ShopOpts {
  shop.draw({} as View, 0);
  const o = drawn[drawn.length - 1];
  if (!o) throw new Error('drawShop was not called');
  return o;
}

/** The price strings the Crystals tab draws, by pack id. */
function drawnPrices(shop: ShopScreen): Record<string, string> {
  shop.setTab('crystals');
  return Object.fromEntries(lastDraw(shop).packs.map((c) => [c.id, c.price]));
}

/**
 * A native-like store: `init()` resolves only when the test says so, `isAvailable()` flips with it,
 * and the products are answered only once it is available (the lazy wrapper's `[]` before that).
 * `known`: the ids the store lists (unknown ids are omitted from the answer, store.ts contract).
 */
function lateStore(known: (id: string) => boolean = () => true) {
  let available = false;
  const waiting: (() => void)[] = [];
  // idempotent like the real one: pending until `finish()`, resolved at once from then on
  const init = vi.spyOn(getStore(), 'init').mockImplementation(() => (available ? Promise.resolve() : new Promise<void>((res) => void waiting.push(res))));
  vi.spyOn(getStore(), 'isAvailable').mockImplementation(() => available);
  const getProducts = vi.spyOn(getStore(), 'getProducts').mockImplementation((ids) => Promise.resolve(available ? ids.filter(known).map(localized) : []));
  const finish = (): void => {
    available = true;
    for (const w of waiting.splice(0)) w();
  };
  return { init, getProducts, finish };
}

let save: SaveData;

beforeEach(() => {
  setSaveStorageForTests(null);
  resetFakeStore();
  resetShopTabMemory();
  save = defaultSave();
  drawn.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shop prices with a store that initialises late (REV-40)', () => {
  it('asks for the products only once init() resolved, and then shows the store’s localized strings', async () => {
    const store = lateStore();
    const shop = new ShopScreen(fakeApp(save), 'crystals');
    shop.enter();
    await flush();
    expect(store.init).toHaveBeenCalled(); // PERF-11 (enter) and the price fetch chain on the same idempotent init
    expect(store.getProducts).not.toHaveBeenCalled(); // not the wrapper's empty answer
    expect(shop.tabs).toEqual(['skins', 'upgrades']); // the store tabs are still hidden (PUB-14)
    store.finish();
    await flush();
    expect(store.getProducts).toHaveBeenCalledTimes(1);
    expect(store.getProducts.mock.calls[0]![0]).toEqual(expect.arrayContaining(PACKS.map((p) => p.id)));
    const prices = drawnPrices(shop);
    expect(Object.keys(prices)).toHaveLength(PACKS.length);
    for (const p of PACKS) {
      expect(prices[p.id]).toBe(`₼ ${p.id}`);
      expect(prices[p.id]).not.toBe(usd(p.id)); // the shown price is what BUY charges, not the catalog's USD
    }
  });

  it('a pack the store does not list keeps the USD catalog fallback; the listed ones take the store’s string', async () => {
    const store = lateStore((id) => id !== 'crystals_550');
    const shop = new ShopScreen(fakeApp(save), 'crystals');
    shop.enter();
    store.finish();
    await flush();
    const prices = drawnPrices(shop);
    expect(prices['crystals_550']).toBe(usd('crystals_550'));
    expect(prices['crystals_100']).toBe('₼ crystals_100');
  });

  it('a shop left before the store answered does not take the prices (no write into a dead screen)', async () => {
    const store = lateStore();
    const other = { name: 'title' } as Screen;
    const shop = new ShopScreen(fakeApp(save, other), 'crystals'); // another screen is current by the time init lands
    shop.enter();
    store.finish();
    await flush();
    expect(store.getProducts).toHaveBeenCalledTimes(1);
    expect((shop as unknown as { prices: Map<string, string> }).prices.size).toBe(0);
    // the shop that is current takes them
    const app = fakeApp(save);
    const live = new ShopScreen(app, 'crystals');
    app.current = live;
    live.enter();
    await flush();
    expect(drawnPrices(live)['crystals_100']).toBe('₼ crystals_100');
  });

  it('a store that never becomes available (web `?store=off`, RevenueCat unconfigured) leaves the USD fallback in place', async () => {
    vi.spyOn(getStore(), 'init').mockResolvedValue(undefined);
    vi.spyOn(getStore(), 'isAvailable').mockImplementation(() => false);
    const getProducts = vi.spyOn(getStore(), 'getProducts').mockResolvedValue([]);
    const shop = new ShopScreen(fakeApp(save), 'crystals');
    shop.enter();
    await flush();
    expect(getProducts).toHaveBeenCalledTimes(1);
    expect((shop as unknown as { prices: Map<string, string> }).prices.size).toBe(0);
    // the fallback is the catalog's USD price (what `priceOf` draws once a store tab is on)
    expect(shop.tabs).toEqual(['skins', 'upgrades']);
  });

  it('the web fake store is unchanged: available at once, every pack priced from the catalog in USD', async () => {
    const shop = new ShopScreen(fakeApp(save), 'crystals');
    shop.enter();
    await flush();
    expect(getStore().isAvailable()).toBe(true);
    const prices = drawnPrices(shop);
    for (const p of PACKS) expect(prices[p.id]).toBe(usd(p.id));
  });
});
