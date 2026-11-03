import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { SHOP } from '../../src/render/menuLayout';
import { createAdSession } from '../../src/economy/adsFlow';
import { getStore } from '../../src/economy/store';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { ShopScreen } from '../../src/ui/shop';
import { flingDistance } from '../../src/ui/fling';
import { setReducedMotionOverride } from '../../src/ui/motion';

/*
 * AUD-U18: the shop list flings like the level map (src/ui/fling.ts): it glides on after a quick drag,
 * decays and stops, clamps hard at either end, a press while it glides stops it and buys / opens
 * nothing, and reduced motion leaves it where the finger did. A tab switch stops it.
 */

vi.mock('../../src/render/menusShop', () => ({ drawShop: () => undefined }));

const VIEW = { scale: 0.5 } as View;

function fakeApp(save: SaveData): App {
  return {
    view: VIEW,
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
    dayKey: () => '2026-11-03',
    weekKey: () => '2026-11-02',
  };
}

const pt = (x: number, y: number, timeMs: number) => ({ x, y, id: 1, type: 'touch' as const, timeMs });
const X = 360;
const Y0 = SHOP.contentTop + 500;

function drag(s: ShopScreen, dy: number, ms: number, t0 = 1000): number {
  s.down(pt(X, Y0, t0));
  const n = Math.round(ms / 8);
  for (let i = 1; i <= n; i++) s.move(pt(X, Y0 + (dy * i) / n, t0 + i * 8));
  s.up(pt(X, Y0 + dy, t0 + n * 8));
  return t0 + n * 8;
}

function frames(s: ShopScreen, t: number): number {
  for (let i = 0; i < 1000 && s.flinging; i++) s.draw(VIEW, (t += 16));
  return t;
}

let save: SaveData;
let shop: ShopScreen;
let max = 0;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  save.crystals = 1000;
  vi.spyOn(getStore(), 'isAvailable').mockImplementation(() => true);
  shop = new ShopScreen(fakeApp(save), 'skins');
  shop.enter();
  shop.draw(VIEW, 0);
  shop.setScroll(1e9);
  max = shop.scrollY;
  shop.setScroll(0);
});
afterEach(() => {
  setReducedMotionOverride(null);
  vi.restoreAllMocks();
});

describe('shop momentum (AUD-U18)', () => {
  it('the Skins list is long enough to fling', () => {
    expect(max).toBeGreaterThan(600);
  });

  it('a quick drag glides on after the lift, decays and stops', () => {
    const t = drag(shop, -120, 96); // 1.25 px / ms, finger up
    expect(shop.scrollY).toBeCloseTo(120, 6);
    expect(shop.flinging).toBe(true);
    shop.draw(VIEW, t + 16);
    const a = shop.scrollY;
    expect(a).toBeGreaterThan(120);
    frames(shop, t + 16);
    expect(shop.flinging).toBe(false);
    const travelled = shop.scrollY - 120;
    expect(travelled).toBeGreaterThan(Math.min(flingDistance(1.25) * 0.9, max - 120 - 1));
    expect(travelled).toBeLessThan(flingDistance(1.4));
  });

  it('clamps hard at the bottom and the top; the fling stops there', () => {
    shop.setScroll(max - 40);
    frames(shop, drag(shop, -100, 48));
    expect(shop.scrollY).toBe(max);
    expect(shop.flinging).toBe(false);
    shop.setScroll(40);
    frames(shop, drag(shop, 100, 48, 5000));
    expect(shop.scrollY).toBe(0);
    expect(shop.flinging).toBe(false);
  });

  it('a press during the glide stops it and opens nothing; the next tap acts', () => {
    let t = drag(shop, -120, 96);
    shop.draw(VIEW, (t += 16));
    expect(shop.flinging).toBe(true);
    const at = shop.scrollY;
    shop.down(pt(X, SHOP.contentTop + 100, t + 1));
    shop.up(pt(X, SHOP.contentTop + 100, t + 30));
    expect(shop.flinging).toBe(false);
    expect(shop.pendingSpend).toBeNull();
    shop.draw(VIEW, t + 300);
    expect(shop.scrollY).toBe(at);
    // the same spot, tapped again with the list at rest, does act (a skin row: equip or the spend card)
    const equipped = JSON.stringify(save.skins ?? null);
    shop.down(pt(X, SHOP.contentTop + 100, t + 400));
    shop.up(pt(X, SHOP.contentTop + 100, t + 430));
    expect(shop.pendingSpend !== null || JSON.stringify(save.skins ?? null) !== equipped).toBe(true);
  });

  it('reduced motion: no glide', () => {
    setReducedMotionOverride(true);
    const t = drag(shop, -120, 96);
    expect(shop.flinging).toBe(false);
    shop.draw(VIEW, t + 100);
    expect(shop.scrollY).toBeCloseTo(120, 6);
  });

  it('a tab switch stops the glide', () => {
    drag(shop, -120, 96);
    expect(shop.flinging).toBe(true);
    shop.setTab('upgrades');
    expect(shop.flinging).toBe(false);
    expect(shop.scrollY).toBe(0);
  });
});
