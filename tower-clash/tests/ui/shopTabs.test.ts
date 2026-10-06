import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { SHOP, SHOP_TABS, shopSkinRect, shopTabsFor } from '../../src/render/menuLayout';
import type { ShopTab } from '../../src/render/menuLayout';
import type { ShopOpts } from '../../src/render/menusShop';
import { createAdSession } from '../../src/economy/adsFlow';
import { getStore } from '../../src/economy/store';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { ShopScreen, skinListed } from '../../src/ui/shop';
import { shopSkins } from '../../src/economy/entitlements';

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

/*
 * FE-6: without a store the Skins tab does not list skins that only come with a pack (Starter Pack /
 * Premium) — no disabled "PACK ONLY" card pointing at a product that cannot be bought — unless the
 * player owns them (after a restore they must still see and equip them).
 */
const PACK_ONLY = shopSkins()
  .filter((s) => s.source !== 'shop')
  .map((s) => s.id);

/** Max scroll of the open tab (setScroll clamps to it). */
function maxScroll(shop: ShopScreen): number {
  shop.setScroll(1e6);
  const y = shop.scrollY;
  shop.setScroll(0);
  return y;
}

describe('pack-only skins (FE-6)', () => {
  it('the catalog has pack-only skins for this test to mean anything', () => {
    expect(PACK_ONLY).toEqual(['roof_gold', 'helmet_bronze', 'helmet_royal']);
  });

  it('skinListed: everything with a store; without one only shop skins and owned pack skins', () => {
    for (const s of shopSkins()) {
      expect(skinListed(s, [], true)).toBe(true);
      expect(skinListed(s, [], false)).toBe(s.source === 'shop');
      expect(skinListed(s, [s.id], false)).toBe(true);
    }
  });

  it('store unavailable: no pack-only cards, no PACK ONLY label, the grid re-flows and the scroll shrinks', () => {
    available = true;
    const withStore = new ShopScreen(fakeApp(save), 'skins');
    const full = lastDraw(withStore);
    const fullMax = maxScroll(withStore);
    available = false;
    const shop = new ShopScreen(fakeApp(save), 'skins');
    const o = lastDraw(shop);
    const ids = o.skins.map((c) => c.id);
    expect(ids).toEqual(
      shopSkins()
        .filter((s) => s.source === 'shop')
        .map((s) => s.id),
    );
    for (const id of PACK_ONLY) expect(ids).not.toContain(id);
    // `locked` is what draws the disabled "PACK ONLY" button
    expect(o.skins.filter((c) => c.locked)).toEqual([]);
    expect(o.skinHeaders).toHaveLength(full.skinHeaders.length); // every category still has cards
    // re-flow: each category's cards fill consecutive grid slots under its header
    for (const h of o.skinHeaders) {
      const next = o.skinHeaders.find((x) => x.y > h.y)?.y ?? Infinity;
      const cards = o.skins.filter((c) => c.rect.y > h.y && c.rect.y < next);
      cards.forEach((c, i) => expect(c.rect).toEqual(shopSkinRect(h.y, i)));
    }
    // roof_thatch moves into the slot roof_gold had with the store
    expect(o.skins.find((c) => c.id === 'roof_thatch')?.rect).toEqual(full.skins.find((c) => c.id === 'roof_gold')?.rect);
    // helmets: 7 cards (three rows, skin drop #2) → 5 (two rows), so the content and the max scroll lose one row
    const row = SHOP.skin.h + SHOP.skin.gapY;
    expect(maxScroll(shop)).toBe(fullMax - row);
    // tapping the old roof_gold slot hits roof_thatch (an unaffordable crystal skin → toast, no PACK ONLY toast)
    const r = full.skins.find((c) => c.id === 'roof_gold')!.rect;
    const p = { x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, type: 'mouse' as const, timeMs: 0 };
    tap(shop, p);
    const text = shop.toast.opts(0)?.text;
    expect(text).toBeTruthy();
    expect(text).not.toMatch(/Starter Pack|Premium/);
  });

  it('store unavailable: an owned pack skin is still listed as OWNED and can be equipped', () => {
    save.skins.owned.push('helmet_royal');
    const shop = new ShopScreen(fakeApp(save), 'skins');
    const o = lastDraw(shop);
    const royal = o.skins.find((c) => c.id === 'helmet_royal');
    expect(royal).toMatchObject({ owned: true, equipped: false, locked: false });
    expect(o.skins.map((c) => c.id)).not.toContain('helmet_bronze');
    expect(o.skins.map((c) => c.id)).not.toContain('roof_gold');
    shop.equipSkin('helmet_royal', 'helmet');
    expect(lastDraw(shop).skins.find((c) => c.id === 'helmet_royal')).toMatchObject({ owned: true, equipped: true });
  });

  it('skin drop #2 (ART-11): the crusader and spartan helmets are crystal skins listed with and without a store, after the launch helmets', () => {
    for (const storeOn of [true, false]) {
      available = storeOn;
      const o = lastDraw(new ShopScreen(fakeApp(save), 'skins'));
      const helmets = o.skins.filter((c) => c.id.startsWith('helmet_')).map((c) => c.id);
      expect(helmets.slice(-2), `store ${storeOn}`).toEqual(['helmet_crusader', 'helmet_spartan']);
      expect(o.skins.find((c) => c.id === 'helmet_crusader'), `store ${storeOn}`).toMatchObject({ spriteId: 'helmet.crusader', cost: 120, owned: false, locked: false });
      expect(o.skins.find((c) => c.id === 'helmet_spartan'), `store ${storeOn}`).toMatchObject({ spriteId: 'helmet.spartan', cost: 150, owned: false, locked: false });
    }
    expect(PACK_ONLY).not.toContain('helmet_crusader');
    expect(PACK_ONLY).not.toContain('helmet_spartan');
  });

  it('store available (web): the full catalog list, pack-only skins shown with PACK ONLY as before', () => {
    available = true;
    const o = lastDraw(new ShopScreen(fakeApp(save), 'skins'));
    expect(o.skins.map((c) => c.id)).toEqual(shopSkins().map((s) => s.id));
    expect(o.skins.filter((c) => c.locked).map((c) => c.id)).toEqual(PACK_ONLY);
  });
});
