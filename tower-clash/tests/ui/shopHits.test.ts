import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { SHOP, shopRowRect, shopSkinRect } from '../../src/render/menuLayout';
import { createAdSession } from '../../src/economy/adsFlow';
import { getStore } from '../../src/economy/store';
import { CRYSTAL_SERVICES } from '../../src/economy/catalog';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { ShopScreen } from '../../src/ui/shop';
import { UPGRADE_DEFS } from '../../src/ui/upgrades';

/*
 * FE-10 (from BUG-31): the shop built its hit regions only while drawing, so a tap between `go(shop)`
 * (or a tab switch) and the shop's first painted frame hit nothing and was dropped. Now `enter()`,
 * `setTab()` and every content hit test rebuild them from the current tab and save: these taps land
 * with no `draw()` at all (drawShop is mocked to fail the test if it were needed).
 */

let draws = 0;
vi.mock('../../src/render/menusShop', () => ({
  drawShop: () => void draws++,
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
    dayKey: () => '2026-10-12',
    weekKey: () => '2026-10-12',
  };
}

const tap = (shop: ShopScreen, r: Rect): void => {
  const p = { x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, type: 'touch' as const, timeMs: 0 };
  shop.down(p);
  shop.up(p);
};

/** Centre of segment `i` of the tab row (menuWidgets.segmentAt geometry). */
const tabRect = (i: number, count: number): Rect => {
  const w = (SHOP.tabs.w - 8) / count;
  return { x: SHOP.tabs.x + 4 + w * i, y: SHOP.tabs.y, w, h: SHOP.tabs.h };
};

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  draws = 0;
  vi.spyOn(getStore(), 'isAvailable').mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('shop hit regions without a painted frame (FE-10)', () => {
  it('a tap right after enter() hits the booster crate on the Bundles tab', () => {
    save.crystals = 100;
    const shop = new ShopScreen(fakeApp(save), 'bundles');
    shop.enter();
    tap(shop, shopRowRect(0)); // the crate is the first row
    const crate = CRYSTAL_SERVICES.boosterCrate;
    expect(save.crystals).toBe(100 - crate.costCrystals);
    expect(save.charges).toEqual(crate.charges);
    expect(draws).toBe(0);
  });

  it('a tap right after setTab() hits the new tab, not the old one', () => {
    save.gold = 10_000;
    save.crystals = 100;
    const shop = new ShopScreen(fakeApp(save), 'bundles');
    shop.enter();
    shop.setTab('upgrades');
    tap(shop, shopRowRect(0)); // Bundles row 0 is the crate; Upgrades row 0 is the first track
    expect(save.upgrades[UPGRADE_DEFS[0]!.id]).toBe(1);
    expect(save.crystals).toBe(100); // no crate bought
    expect(draws).toBe(0);
  });

  it('a tab tapped in the row switches, and the next tap already hits that tab’s cards', () => {
    save.crystals = 500;
    const shop = new ShopScreen(fakeApp(save), 'crystals');
    shop.enter();
    const tabs = shop.tabs;
    tap(shop, tabRect(tabs.indexOf('skins'), tabs.length));
    expect(shop.currentTab).toBe('skins');
    tap(shop, shopSkinRect(SHOP.row.y0 - 6, 0)); // first roof card: bought and equipped
    expect(save.skins.owned).toHaveLength(1);
    expect(save.skins.equipped.roof).toBe(save.skins.owned[0]);
    // the same card again, before any frame: the rebuilt regions know it is owned now → unequip
    tap(shop, shopSkinRect(SHOP.row.y0 - 6, 0));
    expect(save.skins.equipped.roof).toBeNull();
    expect(save.skins.owned).toHaveLength(1);
    expect(draws).toBe(0);
  });

  it('wheel scrolling before the first frame is clamped to the real content height (not to 0)', () => {
    const shop = new ShopScreen(fakeApp(save), 'skins');
    shop.enter();
    shop.wheel(300);
    expect(shop.scrollY).toBe(300);
    expect(draws).toBe(0);
  });
});
