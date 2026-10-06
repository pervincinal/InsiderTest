import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * QA-13: the no-store shop — what App Review sees on build 8 (no IAP products configured), reached on
 * the web build with `/?store=off` (FE-6, src/economy/store.ts `storeOffByUrl`). The contract is
 * docs/publishing/TESTFLIGHT_TEST_PLAN.md TF-15 + PUB-14 / FE-6: exactly two tabs (SKINS, UPGRADES),
 * the shop opens on SKINS even when asked for Crystals, no pack-only skin card and no "PACK ONLY"
 * label, no price string, no RESTORE button and no "store unavailable" line; crystal skins still buy
 * and equip; a granted premium bundle lists the Gold roof / Royal helmet as EQUIP. The plain URL keeps
 * all four tabs (and is the positive control for every "not drawn" assertion below).
 *
 * Everything is canvas-drawn and the debug surface exposes no shop card list, so an init script wraps
 * `CanvasRenderingContext2D.prototype.fillText` and, only while a capture is running, records each
 * string drawn on the #game canvas with its position mapped back to logical (720×1280) coordinates.
 * The shop draws every card of the active tab each frame (clipping does not skip the call), so one
 * capture sees the whole tab regardless of scroll. Strings are compared with `getText(key)` — the
 * same dictionary the screen uses — so nothing is hard-coded but the keys.
 *
 * Like the other specs this file imports nothing from src/; the rects it taps are mirrored from
 * src/render/menuLayout.ts (SHOP, shopSkinRect) with a pointer to their source of truth.
 */

// src/render/menuLayout.ts — SHOP.tabs, SHOP_TABS (all four, store available), shopSkinRect, SHOP.row.y0 - 6
type R = { x: number; y: number; w: number; h: number };
const SHOP_TABS_RECT: R = { x: 30, y: 112, w: 660, h: 60 };
const FOUR_TABS = ['crystals', 'bundles', 'skins', 'upgrades'] as const;
const SKIN_ROOFS_TOP = 194;
function shopSkinRect(top: number, i: number): R {
  return { x: 34 + (i % 3) * (208 + 14), y: top + 46 + Math.floor(i / 3) * (236 + 16), w: 208, h: 236 };
}
// src/render/menusShop.ts drawSkinCard: label at card.y + 142, buy button centred at card.y + h − 16 − 27 → +51 under the label
const SKIN_BUTTON_BELOW_LABEL = 51;
// src/economy/catalog.ts — SKINS (catalog order = card order) and the Slate price
const SLATE_COST = 80;
const SHOP_SKINS = ['roof_slate', 'roof_pagoda', 'roof_onion', 'roof_thatch', 'roof_glass', 'helmet_viking', 'helmet_knight', 'helmet_samurai', 'helmet_crusader', 'helmet_spartan'] as const;
const PACK_SKINS = ['roof_gold', 'helmet_bronze', 'helmet_royal'] as const;
const SEEDED_CRYSTALS = 200;
const SAVE_KEY = 'towerclash.save.v3';
const SHOTS = fileURLToPath(new URL('./__screenshots__/', import.meta.url));
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}${name}.png`, scale: 'css' });
/** A price string as the shop would draw it: "$0.99", "₼1,69", "9.99 €" … (wallet amounts are integers). */
const PRICE_RE = /[$€£₼₺₽]|\d[.,]\d{2}(?!\d)/;

interface DrawnText {
  t: string;
  x: number;
  y: number;
}
type RecWindow = Window & { __qaTexts: { t: string; dx: number; dy: number }[] | null };

/** Level 8 cleared (Starter Pack would be listed after level 5 with a store) and ≥ 200 crystals. */
function seededSave(): Record<string, unknown> {
  const stars: Record<string, number> = {};
  for (let id = 1; id <= 8; id++) stars[String(id)] = 3;
  return { version: 3, gold: 0, crystals: SEEDED_CRYSTALS, stars, settings: { language: 'en' } };
}

async function boot(page: Page, url: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, seededSave()] as const);
  await page.addInitScript(() => {
    const w = window as unknown as RecWindow;
    w.__qaTexts = null;
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text: string, x: number, y: number, maxWidth?: number): void {
      const rec = w.__qaTexts;
      if (rec && this.canvas.id === 'game') {
        const m = this.getTransform();
        rec.push({ t: String(text), dx: m.a * x + m.c * y + m.e, dy: m.b * x + m.d * y + m.f });
      }
      if (maxWidth === undefined) orig.call(this, text, x, y);
      else orig.call(this, text, x, y, maxWidth);
    };
  });
  await page.goto(url);
  await page.waitForFunction(() => typeof window.__towerclash?.economy?.getSave === 'function');
  return errors;
}

/** Every string drawn on #game during the next three animation frames, in logical coordinates (deduplicated). */
async function drawnTexts(page: Page): Promise<DrawnText[]> {
  const list = await page.evaluate(async () => {
    const w = window as unknown as RecWindow;
    w.__qaTexts = [];
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    const rec = w.__qaTexts ?? [];
    w.__qaTexts = null;
    const c = document.getElementById('game');
    if (!(c instanceof HTMLCanvasElement)) throw new Error('#game is not a canvas');
    const b = c.getBoundingClientRect();
    const o = window.__towerclash.toClient(0, 0);
    const e = window.__towerclash.toClient(720, 1280);
    return rec.map(({ t, dx, dy }) => {
      const cx = b.left + (dx * b.width) / c.width;
      const cy = b.top + (dy * b.height) / c.height;
      return { t, x: ((cx - o.x) * 720) / (e.x - o.x), y: ((cy - o.y) * 1280) / (e.y - o.y) };
    });
  });
  const seen = new Map<string, DrawnText>();
  for (const d of list) seen.set(`${d.t}@${Math.round(d.x)},${Math.round(d.y)}`, d);
  return [...seen.values()];
}

const inside = (d: DrawnText, r: R) => d.x >= r.x && d.x <= r.x + r.w && d.y >= r.y && d.y <= r.y + r.h;
/** Labels of the segmented tab row, left to right. */
const tabLabels = (texts: DrawnText[]) =>
  texts
    .filter((d) => inside(d, SHOP_TABS_RECT))
    .sort((a, b) => a.x - b.x)
    .map((d) => d.t);
/** The button text of the skin card whose name label is `label` (null when no such card is drawn). */
function skinButton(texts: DrawnText[], label: string): string | null {
  const name = texts.find((d) => d.t === label);
  if (!name) return null;
  const btn = texts.find((d) => d !== name && Math.abs(d.y - (name.y + SKIN_BUTTON_BELOW_LABEL)) <= 14 && Math.abs(d.x - name.x) <= 100);
  return btn?.t ?? null;
}

async function tapRect(page: Page, r: R): Promise<void> {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [r.x + r.w / 2, r.y + r.h / 2] as const);
  await page.mouse.click(c.x, c.y);
}

/** Tap segment `i` of `count` in the tab row (`drawSegmented`: 4 px inset, equal widths). */
async function tapTabSegment(page: Page, count: number, i: number): Promise<void> {
  const segW = (SHOP_TABS_RECT.w - 8) / count;
  await tapRect(page, { x: SHOP_TABS_RECT.x + 4 + i * segW, y: SHOP_TABS_RECT.y, w: segW, h: SHOP_TABS_RECT.h });
}

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const text = (page: Page, key: string) => page.evaluate((k) => window.__towerclash.getText(k), key);
const save = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(JSON.stringify(window.__towerclash.economy.getSave())) as {
        crystals: number;
        skins: { owned: string[]; equipped: { roof: string | null; helmet: string | null } };
        entitlements: { noAds: boolean };
      },
  );
/** Short card names (`skin.<id>.short`) of the given catalog ids. */
const shortNames = (page: Page, ids: readonly string[]) => Promise.all(ids.map((id) => text(page, `skin.${id}.short`)));
/** The UI strings the assertions read, in the current language. */
async function strings(page: Page) {
  const keys = ['shop.tab.crystals', 'shop.tab.bundles', 'shop.tab.skins', 'shop.tab.upgrades', 'shop.packOnly', 'shop.restore', 'shop.storeUnavailable', 'shop.testStore', 'shop.equip', 'shop.equipped', 'shop.roofs', 'shop.helmets', 'shop.upgradesFooter'] as const;
  const values = await Promise.all(keys.map((k) => text(page, k)));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]!])) as Record<(typeof keys)[number], string>;
}

test.describe('shop without a store (QA-13, App Review build 8)', () => {
  test('?store=off: two tabs opening on SKINS, no pack-only card / price / RESTORE / store line; crystal skin buys, premium grant lists EQUIP', async ({ page }) => {
    test.setTimeout(30_000);
    const errors = await boot(page, '/?lang=en&store=off');
    expect(await page.evaluate(() => window.__towerclash.storeAvailable)).toBe(false);
    const S = await strings(page);
    expect(S['shop.tab.skins']).toBe('SKINS'); // the seeded language is English
    await page.evaluate(() => window.__towerclash.economy.openShop('crystals')); // asked for Crystals …
    await expect.poll(() => screen(page)).toBe('shop');
    let texts = await drawnTexts(page);
    expect(tabLabels(texts)).toEqual([S['shop.tab.skins'], S['shop.tab.upgrades']]); // … exactly two tabs
    const all = () => texts.map((d) => d.t);
    expect(all()).toContain(S['shop.roofs']); // … and it opened on SKINS
    expect(all()).toContain(S['shop.helmets']);
    for (const hidden of [S['shop.tab.crystals'], S['shop.tab.bundles'], S['shop.packOnly'], S['shop.restore'], S['shop.storeUnavailable'], S['shop.testStore']]) expect(all()).not.toContain(hidden);
    expect(all().filter((s) => PRICE_RE.test(s))).toEqual([]);
    // the crystal skins are listed with a crystal price, the pack-only ones are not listed at all
    const shopNames = await shortNames(page, SHOP_SKINS);
    const packNames = await shortNames(page, PACK_SKINS);
    for (const name of shopNames) expect(skinButton(texts, name), name).toMatch(/^\d+$/);
    for (const name of packNames) expect(all(), name).not.toContain(name);
    await page.waitForTimeout(250);
    await shot(page, 'look3-shop-nostore');

    // tab row: UPGRADES works; the area the four-tab row gives to CRYSTALS / BUNDLES now belongs to SKINS
    await tapTabSegment(page, 2, 1);
    await expect.poll(async () => (await drawnTexts(page)).map((d) => d.t)).toContain(S['shop.upgradesFooter']);
    texts = await drawnTexts(page);
    expect(all()).not.toContain(S['shop.roofs']);
    expect(all().filter((s) => PRICE_RE.test(s))).toEqual([]);
    expect(all()).not.toContain(S['shop.restore']);
    await tapTabSegment(page, FOUR_TABS.length, FOUR_TABS.indexOf('crystals'));
    await expect.poll(async () => (await drawnTexts(page)).map((d) => d.t)).toContain(S['shop.roofs']);
    await tapTabSegment(page, FOUR_TABS.length, FOUR_TABS.indexOf('bundles'));
    await page.waitForTimeout(150);
    texts = await drawnTexts(page);
    expect(tabLabels(texts)).toEqual([S['shop.tab.skins'], S['shop.tab.upgrades']]);
    expect(all()).toContain(S['shop.roofs']);
    expect(await screen(page)).toBe('shop');
    expect(await page.evaluate(() => window.__towerclash.getToast())).toBeNull(); // no "store unavailable" toast either

    // Slate roof (first roof card) for earned crystals → owned and equipped; tap again → EQUIP
    await tapRect(page, shopSkinRect(SKIN_ROOFS_TOP, 0));
    await expect.poll(async () => (await save(page)).skins.equipped.roof).toBe('roof_slate');
    let s = await save(page);
    expect(s.crystals).toBe(SEEDED_CRYSTALS - SLATE_COST);
    expect(s.skins.owned).toEqual(['roof_slate']);
    const [slate] = shopNames;
    expect(skinButton(await drawnTexts(page), slate!)).toBe(S['shop.equipped']);
    await tapRect(page, shopSkinRect(SKIN_ROOFS_TOP, 0));
    await expect.poll(async () => (await save(page)).skins.equipped.roof).toBeNull();
    expect(skinButton(await drawnTexts(page), slate!)).toBe(S['shop.equip']);
    await tapRect(page, shopSkinRect(SKIN_ROOFS_TOP, 0));
    await expect.poll(async () => (await save(page)).skins.equipped.roof).toBe('roof_slate');

    // premium bundle granted (as a restore would): Gold roof and Royal helmet appear as EQUIP; Bronze stays unlisted
    const granted = await page.evaluate(() => window.__towerclash.economy.grant('premium_bundle'));
    expect(granted).not.toBeNull();
    s = await save(page);
    expect(s.skins.owned).toEqual(expect.arrayContaining(['roof_gold', 'helmet_royal']));
    expect(s.skins.equipped.roof).toBe('roof_slate'); // a grant does not change what is equipped
    const [gold, , royal] = packNames;
    texts = await drawnTexts(page);
    expect(skinButton(texts, gold!)).toBe(S['shop.equip']);
    expect(skinButton(texts, royal!)).toBe(S['shop.equip']);
    expect(skinButton(texts, slate!)).toBe(S['shop.equipped']);
    expect(all()).not.toContain(packNames[1]); // Bronze helmet: starter pack only, not owned
    expect(all()).not.toContain(S['shop.packOnly']);
    expect(tabLabels(texts)).toEqual([S['shop.tab.skins'], S['shop.tab.upgrades']]);
    // tapping the re-flowed Gold card equips it
    const goldLabel = texts.find((d) => d.t === gold)!;
    await tapRect(page, { x: goldLabel.x - 10, y: goldLabel.y + SKIN_BUTTON_BELOW_LABEL - 10, w: 20, h: 20 });
    await expect.poll(async () => (await save(page)).skins.equipped.roof).toBe('roof_gold');
    expect(skinButton(await drawnTexts(page), gold!)).toBe(S['shop.equipped']);
    expect(await page.evaluate(() => window.__towerclash.storeAvailable)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('plain URL: the store is available and the shop keeps four tabs, prices, RESTORE and the PACK ONLY card', async ({ page }) => {
    test.setTimeout(30_000);
    const errors = await boot(page, '/?lang=en');
    await expect.poll(() => page.evaluate(() => window.__towerclash.storeAvailable)).toBe(true);
    const S = await strings(page);
    await page.evaluate(() => window.__towerclash.economy.openShop('crystals'));
    await expect.poll(() => screen(page)).toBe('shop');
    // fake-store prices arrive asynchronously; the catalog fallback is a "$x.xx" string as well
    await expect.poll(async () => (await drawnTexts(page)).filter((d) => PRICE_RE.test(d.t)).length).toBeGreaterThan(0);
    let texts = await drawnTexts(page);
    expect(tabLabels(texts)).toEqual([S['shop.tab.crystals'], S['shop.tab.bundles'], S['shop.tab.skins'], S['shop.tab.upgrades']]);
    const all = () => texts.map((d) => d.t);
    expect(all()).toContain(S['shop.restore']);
    expect(all()).toContain(S['shop.testStore']);
    expect(all()).not.toContain(S['shop.roofs']); // opened on CRYSTALS, as asked
    // SKINS: the pack-only cards are listed, locked
    await tapTabSegment(page, FOUR_TABS.length, FOUR_TABS.indexOf('skins'));
    await expect.poll(async () => (await drawnTexts(page)).map((d) => d.t)).toContain(S['shop.roofs']);
    texts = await drawnTexts(page);
    for (const name of await shortNames(page, PACK_SKINS)) expect(skinButton(texts, name), name).toBe(S['shop.packOnly']);
    expect(tabLabels(texts)).toHaveLength(FOUR_TABS.length);
    expect(errors).toEqual([]);
  });
});
