import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { SHOP, SHOP_TABS, shopTabsFor } from '../../src/render/menuLayout';
import type { ShopTab } from '../../src/render/menuLayout';
import type { ShopOpts } from '../../src/render/menusShop';
import { createAdSession } from '../../src/economy/adsFlow';
import { getStore } from '../../src/economy/store';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { ShopScreen } from '../../src/ui/shop';

/*
 * PUB-14: without an available store (native 1.0.0 shipped with no IAP, RevenueCat unconfigured or
 * still loading) the shop shows no Crystals / Bundles tabs — no greyed "$0.99" fallback prices for
 * App Review — and Skins / Upgrades re-flow over the whole tab row. The web build's fake store is
 * available, so the e2e suite only ever sees the four-tab shop; this file covers the other case.
 */

const drawn: ShopOpts[] = [];
vi.mock('../../src/render/menusShop', () => ({
  drawShop: (_view: unknown, _pal: unknown, o: ShopOpts) => void drawn.push(o),
}));

function fakeApp(save: SaveData): App {
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
    dayKey: () => '2026-10-03',
    weekKey: () => '2026-09-28',
  };
}

/** Pointer at the centre of segment `i` of `count` in the tab row (menuWidgets.segmentAt geometry). */
function tabPoint(i: number, count: number) {
  const r: Rect = SHOP.tabs;
  const segW = (r.w - 8) / count;
  return { x: r.x + 4 + segW * (i + 0.5), y: r.y + r.h / 2, id: 1, type: 'mouse' as const, timeMs: 0 };
}

function tap(screen: ShopScreen, p: ReturnType<typeof tabPoint>): void {
  screen.down(p);
  screen.up(p);
}

function lastDraw(screen: ShopScreen): ShopOpts {
  screen.draw({} as View, 0);
  const o = drawn[drawn.length - 1];
  if (!o) throw new Error('drawShop was not called');
  return o;
}

let save: SaveData;
let available: boolean;

beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  drawn.length = 0;
  available = false;
  vi.spyOn(getStore(), 'isAvailable').mockImplementation(() => available);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shopTabsFor (PUB-14)', () => {
  it('lists all four tabs with a store and only Skins + Upgrades without one', () => {
    expect(shopTabsFor(true)).toEqual(['crystals', 'bundles', 'skins', 'upgrades']);
    expect(shopTabsFor(true)).toEqual(SHOP_TABS);
    expect(shopTabsFor(false)).toEqual(['skins', 'upgrades']);
  });
});

describe('shop screen with the store unavailable', () => {
  it('opens on the first visible tab even when asked for Crystals (the wallet / title shop button)', () => {
    const shop = new ShopScreen(fakeApp(save), 'crystals');
    shop.enter();
    expect(shop.tabs).toEqual(['skins', 'upgrades']);
    expect(shop.currentTab).toBe('skins');
    const o = lastDraw(shop);
    expect(o.tab).toBe('skins');
    expect(o.tabs).toEqual(['skins', 'upgrades']);
    // nothing from the store tabs is laid out: no packs, converter, crate, bundles or RESTORE
    expect(o.packs).toEqual([]);
    expect(o.convert).toBeNull();
    expect(o.crate).toBeNull();
    expect(o.bundles).toEqual([]);
    expect(o.restoreRect).toBeNull();
    expect(o.skins.length).toBeGreaterThan(0);
  });

  it('the Bundles tab requested by a caller falls back as well; Upgrades stays as asked', () => {
    expect(new ShopScreen(fakeApp(save), 'bundles').currentTab).toBe('skins');
    expect(new ShopScreen(fakeApp(save), 'upgrades').currentTab).toBe('upgrades');
  });

  it('the re-flowed row is hit-tested as two segments; hidden tabs cannot be selected by tap, key or wallet', () => {
    const shop = new ShopScreen(fakeApp(save), 'skins');
    lastDraw(shop);
    // the right half of the row is Upgrades (with four tabs it would have been Skins + Upgrades)
    tap(shop, tabPoint(1, 2));
    expect(shop.currentTab).toBe('upgrades');
    // the leftmost quarter (where CRYSTALS sat in the four-tab row) is now Skins
    tap(shop, tabPoint(0, 4));
    expect(shop.currentTab).toBe('skins');
    tap(shop, tabPoint(1, 4)); // the old BUNDLES slot: still the left half → Skins
    expect(shop.currentTab).toBe('skins');
    // the wallet pill switches to Crystals only when that tab exists
    const wallet = { x: SHOP.wallet.x + 10, y: SHOP.wallet.y + 10, id: 1, type: 'mouse' as const, timeMs: 0 };
    tap(shop, wallet);
    expect(shop.currentTab).toBe('skins');
    shop.setTab('crystals');
    shop.setTab('bundles');
    expect(shop.currentTab).toBe('skins');
    // arrow keys cycle over the visible tabs only
    const key = (k: string) => shop.key({ key: k } as KeyboardEvent);
    const seen: ShopTab[] = [];
    for (let i = 0; i < 4; i++) {
      key('ArrowRight');
      seen.push(shop.currentTab);
    }
    expect(seen).toEqual(['upgrades', 'skins', 'upgrades', 'skins']);
    key('ArrowLeft');
    expect(shop.currentTab).toBe('upgrades');
    expect(lastDraw(shop).tabs).toEqual(['skins', 'upgrades']);
  });

  it('a store that becomes available later (native init finished) brings the four tabs back', () => {
    const shop = new ShopScreen(fakeApp(save), 'crystals');
    expect(shop.currentTab).toBe('skins');
    available = true;
    const o = lastDraw(shop);
    expect(o.tabs).toEqual(['crystals', 'bundles', 'skins', 'upgrades']);
    expect(o.tab).toBe('skins'); // the open tab does not jump
    tap(shop, tabPoint(0, 4));
    expect(shop.currentTab).toBe('crystals');
    const crystals = lastDraw(shop);
    expect(crystals.packs).toHaveLength(5);
    expect(crystals.restoreRect).not.toBeNull();
  });
});

describe('shop screen with the store available (web fake store) is unchanged', () => {
  it('four tabs, Crystals by default, the four-segment row hit-tests as before', () => {
    available = true;
    const shop = new ShopScreen(fakeApp(save));
    expect(shop.currentTab).toBe('crystals');
    const o = lastDraw(shop);
    expect(o.tabs).toEqual(['crystals', 'bundles', 'skins', 'upgrades']);
    expect(o.packs).toHaveLength(5);
    expect(o.storeAvailable).toBe(true);
    SHOP_TABS.forEach((tab, i) => {
      tap(shop, tabPoint(i, 4));
      expect(shop.currentTab).toBe(tab);
    });
  });
});
