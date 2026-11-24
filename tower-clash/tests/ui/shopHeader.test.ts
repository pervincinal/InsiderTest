import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { SHOP, shopSkinRect } from '../../src/render/menuLayout';
import type { ShopOpts } from '../../src/render/menusShop';
import { createAdSession } from '../../src/economy/adsFlow';
import { getStore } from '../../src/economy/store';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { ShopScreen, resetShopTabMemory, shopBrowseTab } from '../../src/ui/shop';
import { t } from '../../src/ui/i18n';

/*
 * REV-42: a press on one header control released over another acted on the release target (finger
 * down on BACK, slide along the header to the wallet, lift → the shop jumped to CRYSTALS). The release
 * must land on the control the press started on (as settings.ts / achievements.ts); a header press
 * released on the list buys nothing, a list press released on the header leaves nothing.
 * REV-44: the shop's own wallet pill shows CRYSTALS without touching the AUD-U25 tab memory (it is not
 * a pick, like the title's and the map's pills), and says why when the store tabs are hidden.
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
    dayKey: () => '2026-11-24',
    weekKey: () => '2026-11-23',
  };
}

const centre = (r: Rect, timeMs = 0) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, type: 'touch' as const, timeMs });
/** Centre of segment `i` of `count` in the tab row (menuWidgets.segmentAt geometry). */
const tabSeg = (i: number, count: number): Rect => {
  const w = (SHOP.tabs.w - 8) / count;
  return { x: SHOP.tabs.x + 4 + w * i, y: SHOP.tabs.y, w, h: SHOP.tabs.h };
};

/** Press on `from`, slide (a few horizontal-ish samples) and lift on `to`. */
function slide(shop: ShopScreen, from: Rect, to: Rect): void {
  const a = centre(from, 0);
  const b = centre(to, 120);
  shop.down(a);
  for (let i = 1; i <= 3; i++) shop.move({ ...a, x: a.x + ((b.x - a.x) * i) / 4, y: a.y + ((b.y - a.y) * i) / 4, timeMs: i * 30 });
  shop.up(b);
}

const tap = (shop: ShopScreen, r: Rect): void => slide(shop, r, r);

let save: SaveData;
let available: boolean;
let backs: number;
let shop: ShopScreen;

beforeEach(() => {
  setSaveStorageForTests(null);
  resetShopTabMemory();
  save = defaultSave();
  save.crystals = 1000;
  drawn.length = 0;
  available = true;
  backs = 0;
  vi.spyOn(getStore(), 'isAvailable').mockImplementation(() => available);
  shop = new ShopScreen(fakeApp(save), 'skins', () => void (backs += 1));
  shop.enter();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shop header: a press is acted on only where it started (REV-42)', () => {
  it('down on BACK, lifted on the wallet: neither leaves nor switches to Crystals', () => {
    slide(shop, SHOP.back, SHOP.wallet);
    expect(backs).toBe(0);
    expect(shop.currentTab).toBe('skins');
  });

  it('down on the wallet, lifted on BACK: nothing', () => {
    slide(shop, SHOP.wallet, SHOP.back);
    expect(backs).toBe(0);
    expect(shop.currentTab).toBe('skins');
  });

  it('down on a tab, lifted on BACK — and down on BACK, lifted on a tab: no switch, no leave', () => {
    // (the tab row is 60 px under the header: this travel is also a drag, kept as a regression guard)
    const tabs = shop.tabs;
    slide(shop, tabSeg(tabs.indexOf('upgrades'), tabs.length), SHOP.back);
    expect(shop.currentTab).toBe('skins');
    expect(backs).toBe(0);
    slide(shop, SHOP.back, tabSeg(tabs.indexOf('upgrades'), tabs.length));
    expect(shop.currentTab).toBe('skins');
    expect(backs).toBe(0);
  });

  it('a header press lifted on the empty header, or on a skin card, does nothing; a card press lifted on the header leaves nothing', () => {
    const card = shopSkinRect(SHOP.row.y0 - 6, 0); // first roof: affordable → a tap would open the confirm card
    const gap: Rect = { x: SHOP.back.x + SHOP.back.w + 60, y: SHOP.back.y, w: 40, h: SHOP.back.h }; // between BACK and the wallet
    slide(shop, SHOP.back, gap);
    slide(shop, SHOP.wallet, gap);
    expect(backs).toBe(0);
    expect(shop.currentTab).toBe('skins');
    // header ↔ list travel is a drag (AUD-U18): nothing either; it scrolled the list and left momentum,
    // both undone before the next tap
    slide(shop, SHOP.back, card);
    slide(shop, card, SHOP.back);
    expect(shop.pendingSpend).toBeNull();
    expect(backs).toBe(0);
    shop.cancel();
    shop.setScroll(0);
    tap(shop, card); // a plain tap on it still asks
    expect(shop.pendingSpend).not.toBeNull();
  });

  it('plain taps still work: BACK leaves, the wallet opens Crystals, a tab switches', () => {
    const tabs = shop.tabs;
    tap(shop, tabSeg(tabs.indexOf('upgrades'), tabs.length));
    expect(shop.currentTab).toBe('upgrades');
    tap(shop, SHOP.wallet);
    expect(shop.currentTab).toBe('crystals');
    tap(shop, SHOP.back);
    expect(backs).toBe(1);
  });

  it('the press look: the header control is the pressed rect while held, and no card is', () => {
    shop.down(centre(SHOP.wallet));
    shop.draw({} as View, 0);
    expect(drawn.at(-1)!.pressed).toBe(SHOP.wallet);
    shop.up(centre(SHOP.wallet));
    shop.draw({} as View, 0);
    expect(drawn.at(-1)!.pressed).toBeNull();
  });
});

describe('the shop’s own wallet pill (REV-44)', () => {
  it('shows CRYSTALS without changing the AUD-U25 tab memory', () => {
    const tabs = shop.tabs;
    tap(shop, tabSeg(tabs.indexOf('upgrades'), tabs.length)); // a pick: remembered
    expect(shopBrowseTab()).toBe('upgrades');
    tap(shop, SHOP.wallet);
    expect(shop.currentTab).toBe('crystals');
    expect(shopBrowseTab()).toBe('upgrades'); // not a pick
    expect(new ShopScreen(fakeApp(save)).currentTab).toBe('upgrades');
    tap(shop, SHOP.back);
    expect(backs).toBe(1);
  });

  it('a fresh session: the wallet opens Crystals and the next browse still opens on Skins', () => {
    tap(shop, SHOP.wallet);
    expect(shop.currentTab).toBe('crystals');
    expect(shopBrowseTab()).toBe('skins');
    expect(new ShopScreen(fakeApp(save)).currentTab).toBe('skins');
  });

  it('with the store tabs hidden it says the store is unavailable instead of doing nothing', () => {
    available = false;
    expect(shop.tabs).toEqual(['skins', 'upgrades']);
    expect(shop.toast.opts(0)).toBeNull();
    tap(shop, SHOP.wallet);
    expect(shop.currentTab).toBe('skins');
    expect(shop.toast.opts(0)?.text).toBe(t('shop.toast.storeUnavailablePlatform'));
    expect(shop.toast.opts(0)?.kind).toBe('error');
    expect(shopBrowseTab()).toBe('skins');
  });

  it('setTab (a tab tap, the arrow keys) still remembers the pick; the wallet does not override it', () => {
    shop.setTab('bundles');
    expect(shopBrowseTab()).toBe('bundles');
    tap(shop, SHOP.wallet);
    expect(shop.currentTab).toBe('crystals');
    expect(shopBrowseTab()).toBe('bundles');
  });
});
