import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * QA-16 B: shop layout at phone sizes after skin drop #2 (ART-11: 7 helmet cards → 3 rows with a
 * store, 5 → 2 rows without). For each viewport (360×640, 390×844, 412×915), with and without
 * `?store=off`, in the default and the colour-blind palette, under simulated phone safe areas
 * (status bar 44 px, gesture bar 34 px — the same values as e2e/webview.spec.ts):
 *   1. the HELMETS section lists the right cards on the mirrored 3-column grid, in catalog order, and
 *      sits between the ROOFS rows and the THEMES header without touching either;
 *   2. every helmet card can be scrolled fully into the content viewport (below the tab row's glass
 *      band, above the content bottom) and then lies inside the canvas and inside the safe box on the
 *      client (CSS px) — so it overlaps neither the tab bar nor the bottom safe area;
 *   3. at that scroll its name and its button label (price / EQUIP / EQUIPPED / PACK ONLY) are drawn
 *      inside the card / the button, unsqueezed (`fillText` maxWidth not reached), and the EQUIPPED and
 *      price buttons are really painted there in the palette's colour (pixel probe on #game) — the
 *      colour-blind palette swaps the EQUIPPED fill (owners.enemy2) only;
 *   4. one more pass at 360×640 checks every skin card's name and button label in en / az / ru / tr.
 *
 * Canvas-drawn, so (like e2e/shopNoStore.spec.ts) an init script wraps `fillText` and records each
 * string drawn on #game with its logical (720×1280) position, alignment, measured width and maxWidth.
 * Geometry is mirrored from src/render/menuLayout.ts / menusShop.ts (this file imports nothing from src/).
 * Evidence screenshots go to the test output dir (PW_OUTPUT), never to e2e/__screenshots__.
 */

type R = { x: number; y: number; w: number; h: number };
// src/render/menuLayout.ts — SHOP: tab row, content viewport, glass band under the tabs (menusShop.ts drawShop: tabs.y + tabs.h + 12)
const SHOP_TABS: R = { x: 30, y: 112, w: 660, h: 60 };
const CONTENT_TOP = 192;
const CONTENT_BOTTOM = 1262;
const GLASS_BAND_BOTTOM = SHOP_TABS.y + SHOP_TABS.h + 12;
// src/render/menuLayout.ts — SHOP.skin, shopSkinRect; src/ui/shop.ts layout(): roofs at SHOP.row.y0 − 6, each section 22 px under the previous one
const SKIN = { w: 208, h: 236, gapX: 14, gapY: 16, x0: 34, headerH: 46 };
const SKIN_ROOFS_TOP = 194;
function shopSkinRect(top: number, i: number): R {
  return { x: SKIN.x0 + (i % 3) * (SKIN.w + SKIN.gapX), y: top + SKIN.headerH + Math.floor(i / 3) * (SKIN.h + SKIN.gapY), w: SKIN.w, h: SKIN.h };
}
const sectionBottom = (top: number, cards: number) => top + SKIN.headerH + Math.ceil(cards / 3) * (SKIN.h + SKIN.gapY) - SKIN.gapY;
// src/render/menusShop.ts drawSkinCard: name centred at card.y + 142 (maxWidth w − 20); shopBuyRect(card, w − 36, 54); button label at buy.y + 25 + 1
const LABEL_DY = 142;
const buyRect = (card: R): R => ({ x: card.x + 18, y: card.y + SKIN.h - 54 - 16, w: SKIN.w - 36, h: 54 });
const BUTTON_TEXT_DY = SKIN.h - 54 - 16 + (54 - 4) / 2 + 1;
// src/economy/catalog.ts SKINS (catalog order = card order); pack-only (starter / premium) helmets are hidden without a store (FE-6)
const ROOFS = { store: 6, noStore: 5 };
const HELMETS = ['helmet_bronze', 'helmet_viking', 'helmet_knight', 'helmet_samurai', 'helmet_royal', 'helmet_crusader', 'helmet_spartan'] as const;
const PACK_ONLY_HELMETS = new Set<string>(['helmet_bronze', 'helmet_royal']);
const OWNED = 'helmet_knight'; // owned, not equipped → EQUIP
const EQUIPPED = 'helmet_viking'; // owned and equipped → EQUIPPED
// src/render/palette.ts — owners.player (price buttons, both palettes), owners.enemy2 (EQUIPPED: green / colour-blind purple)
const FILL = { price: '#2f6df6', equipped: '#2ec27e', equippedCB: '#a855f7' };
const SAFE = { top: 44, bottom: 34 };
const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
] as const;
const SAVE_KEY = 'towerclash.save.v3';

interface Drawn {
  t: string;
  /** Logical anchor (fillText x, y). */
  x: number;
  y: number;
  /** Logical horizontal extent of the drawn glyphs (maxWidth applied). */
  left: number;
  right: number;
  /** measureText width and the maxWidth passed to fillText (logical px; null = none). */
  width: number;
  maxWidth: number | null;
  fill: string;
}
type RawText = { t: string; dx: number; dy: number; align: string; width: number; maxWidth: number | null; fill: string; sx: number };
type RecWindow = Window & { __qaTexts: RawText[] | null };

function seededSave(colorBlind: boolean, language = 'en'): Record<string, unknown> {
  return {
    version: 3,
    gold: 0,
    crystals: 1000, // every price affordable → enabled buttons in the player colour
    stars: { '1': 3 },
    settings: { language, colorBlind },
    skins: { owned: [EQUIPPED, OWNED], equipped: { roof: null, helmet: EQUIPPED, theme: null } },
  };
}

async function boot(page: Page, url: string, save: Record<string, unknown>): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, save] as const);
  await page.addInitScript((safe) => {
    const apply = (): boolean => {
      const app = document.getElementById('app');
      if (!app) return false;
      app.style.setProperty('--safe-top', `${safe.top}px`);
      app.style.setProperty('--safe-bottom', `${safe.bottom}px`);
      return true;
    };
    if (!apply()) {
      new MutationObserver((_, obs) => {
        if (apply()) obs.disconnect();
      }).observe(document, { childList: true, subtree: true });
    }
  }, SAFE);
  await page.addInitScript(() => {
    const w = window as unknown as RecWindow;
    w.__qaTexts = null;
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text: string, x: number, y: number, maxWidth?: number): void {
      const rec = w.__qaTexts;
      if (rec && this.canvas.id === 'game') {
        const m = this.getTransform();
        rec.push({
          t: String(text),
          dx: m.a * x + m.c * y + m.e,
          dy: m.b * x + m.d * y + m.f,
          align: this.textAlign,
          width: this.measureText(String(text)).width,
          maxWidth: maxWidth ?? null,
          fill: typeof this.fillStyle === 'string' ? this.fillStyle : 'gradient',
          sx: m.a,
        });
      }
      if (maxWidth === undefined) orig.call(this, text, x, y);
      else orig.call(this, text, x, y, maxWidth);
    };
  });
  await page.goto(url);
  await page.waitForFunction(() => typeof window.__towerclash?.economy?.getSave === 'function');
  return errors;
}

/** Every string drawn on #game during the next three frames, in logical coordinates (deduplicated). */
async function drawnTexts(page: Page): Promise<Drawn[]> {
  const list = await page.evaluate(async () => {
    const w = window as unknown as RecWindow;
    w.__qaTexts = [];
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    const rec = w.__qaTexts ?? [];
    w.__qaTexts = null;
    const c = document.getElementById('game') as HTMLCanvasElement;
    const b = c.getBoundingClientRect();
    const o = window.__towerclash.toClient(0, 0);
    const e = window.__towerclash.toClient(720, 1280);
    const kx = (b.width / c.width) * (720 / (e.x - o.x)); // device px → logical px
    return rec.map((r) => {
      const cx = b.left + (r.dx * b.width) / c.width;
      const cy = b.top + (r.dy * b.height) / c.height;
      // measureText / maxWidth are in the context's user space: × the matrix scale → device px → logical
      const toLogical = r.sx * kx;
      return { ...r, x: ((cx - o.x) * 720) / (e.x - o.x), y: ((cy - o.y) * 1280) / (e.y - o.y), width: r.width * toLogical, maxWidth: r.maxWidth === null ? null : r.maxWidth * toLogical };
    });
  });
  const seen = new Map<string, Drawn>();
  for (const r of list) {
    const shown = r.maxWidth === null ? r.width : Math.min(r.width, r.maxWidth);
    const left = r.align === 'center' ? r.x - shown / 2 : r.align === 'right' || r.align === 'end' ? r.x - shown : r.x;
    seen.set(`${r.t}@${Math.round(r.x)},${Math.round(r.y)}`, { t: r.t, x: r.x, y: r.y, left, right: left + shown, width: r.width, maxWidth: r.maxWidth, fill: r.fill });
  }
  return [...seen.values()];
}

/** Mean RGB of the 3×3 device pixels of #game around a logical point. */
const pixelAt = (page: Page, p: { x: number; y: number }) =>
  page.evaluate(({ x, y }) => {
    const c = document.getElementById('game') as HTMLCanvasElement;
    const b = c.getBoundingClientRect();
    const q = window.__towerclash.toClient(x, y);
    const px = Math.round(((q.x - b.left) * c.width) / b.width);
    const py = Math.round(((q.y - b.top) * c.height) / b.height);
    const d = c.getContext('2d')!.getImageData(px - 1, py - 1, 3, 3).data;
    const out = [0, 0, 0];
    for (let i = 0; i < 9; i++) for (let k = 0; k < 3; k++) out[k]! += d[i * 4 + k]! / 9;
    return out as [number, number, number];
  }, p);

const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** WCAG contrast ratio of two sRGB colours. */
function contrast(a: readonly number[], b: readonly number[]): number {
  const lum = (c: readonly number[]) => {
    const [r, g, bl] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (l1! + 0.05) / (l2! + 0.05);
}

const text = (page: Page, key: string) => page.evaluate((k) => window.__towerclash.getText(k), key);
const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());

async function openSkins(page: Page): Promise<void> {
  await page.evaluate(() => window.__towerclash.economy.openShop('skins'));
  await expect.poll(() => screen(page)).toBe('shop');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(200); // screen transition settled
}

/** Text drawn closest to logical (x, y) within the tolerances, or undefined. */
const near = (texts: Drawn[], x: number, y: number, tx: number, ty: number) =>
  texts.filter((d) => Math.abs(d.x - x) <= tx && Math.abs(d.y - y) <= ty).sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0];

interface CardFinding {
  id: string;
  label: string;
  button: string;
  scroll: number;
  contrast: number | null;
}

/** QA-16 B checks 1–3 for one viewport / store mode / palette. Returns per-card details for the annotation. */
async function checkHelmets(page: Page, opts: { store: boolean; colorBlind: boolean; tag: string }): Promise<CardFinding[]> {
  const vp = page.viewportSize()!;
  const listed = HELMETS.filter((id) => opts.store || !PACK_ONLY_HELMETS.has(id));
  expect(listed).toHaveLength(opts.store ? 7 : 5);
  const roofs = opts.store ? ROOFS.store : ROOFS.noStore;
  const helmetsTop = sectionBottom(SKIN_ROOFS_TOP, roofs) + 22;
  const themesTop = sectionBottom(helmetsTop, listed.length) + 22;
  const S = {
    helmets: await text(page, 'shop.helmets'),
    themes: await text(page, 'shop.themes'),
    equip: await text(page, 'shop.equip'),
    equipped: await text(page, 'shop.equipped'),
    packOnly: await text(page, 'shop.packOnly'),
  };
  const names = await Promise.all(listed.map((id) => text(page, `skin.${id}.short`)));
  const expectedButton = (id: string): string =>
    id === EQUIPPED ? S.equipped : id === OWNED ? S.equip : PACK_ONLY_HELMETS.has(id) ? S.packOnly : '';

  expect(await page.evaluate(() => window.__towerclash.economy.shopScroll(0))).toBe(0);
  // 1. section headers: HELMETS pill where the layout puts it, THEMES after the last helmet row
  const all = await drawnTexts(page);
  const header = all.find((d) => d.t === S.helmets);
  const themes = all.find((d) => d.t === S.themes);
  expect(header, 'HELMETS header drawn').toBeDefined();
  expect(themes, 'THEMES header drawn').toBeDefined();
  expect(Math.abs(header!.y - (helmetsTop + 19)), 'HELMETS header y').toBeLessThanOrEqual(3);
  expect(Math.abs(themes!.y - (themesTop + 19)), 'THEMES header y').toBeLessThanOrEqual(3);
  const lastHelmet = shopSkinRect(helmetsTop, listed.length - 1);
  expect(themes!.y - 19, 'THEMES header clears the last helmet row').toBeGreaterThanOrEqual(lastHelmet.y + lastHelmet.h + 16);
  expect(header!.y - 19, 'HELMETS header clears the last roof row').toBeGreaterThanOrEqual(sectionBottom(SKIN_ROOFS_TOP, roofs) + 16);
  // pack-only helmets are absent without a store
  for (const id of HELMETS.filter((h) => !listed.includes(h))) expect(all.map((d) => d.t)).not.toContain(await text(page, `skin.${id}.short`));

  const findings: CardFinding[] = [];
  for (const [i, id] of listed.entries()) {
    const card = shopSkinRect(helmetsTop, i);
    // 2. scroll the card to the middle of the content viewport (clamped by the shop) → fully inside it
    const want = Math.round(card.y + card.h / 2 - (CONTENT_TOP + CONTENT_BOTTOM) / 2);
    const s = await page.evaluate((y) => window.__towerclash.economy.shopScroll(y), Math.max(0, want));
    const top = card.y - s;
    const bottom = card.y + card.h - s;
    const where = `${opts.tag} ${id} (card #${i}, scroll ${s})`;
    expect(top, `${where}: top under the tab bar's glass band`).toBeGreaterThanOrEqual(CONTENT_TOP);
    expect(top, where).toBeGreaterThan(GLASS_BAND_BOTTOM);
    expect(bottom, `${where}: bottom above the content bottom`).toBeLessThanOrEqual(CONTENT_BOTTOM);
    const corners = await page.evaluate(
      ([a, b]) => [window.__towerclash.toClient(a.x, a.y), window.__towerclash.toClient(b.x, b.y)],
      [
        { x: card.x, y: top },
        { x: card.x + card.w, y: bottom },
      ] as const,
    );
    expect(corners[0]!.x, `${where}: left edge on screen`).toBeGreaterThanOrEqual(0);
    expect(corners[1]!.x, `${where}: right edge on screen`).toBeLessThanOrEqual(vp.width);
    expect(corners[0]!.y, `${where}: clear of the status-bar inset`).toBeGreaterThanOrEqual(SAFE.top);
    expect(corners[1]!.y, `${where}: clear of the bottom safe area`).toBeLessThanOrEqual(vp.height - SAFE.bottom);

    // 3. name + button label of this card, drawn inside it and unsqueezed
    const texts = await drawnTexts(page);
    const name = near(texts, card.x + card.w / 2, top + LABEL_DY, 4, 4);
    expect(name?.t, `${where}: card name`).toBe(names[i]);
    expect(name!.left, `${where}: name inside the card`).toBeGreaterThanOrEqual(card.x + 8);
    expect(name!.right, `${where}: name inside the card`).toBeLessThanOrEqual(card.x + card.w - 8);
    expect(name!.width, `${where}: name "${name!.t}" squeezed (${name!.width.toFixed(1)} > ${name!.maxWidth?.toFixed(1)})`).toBeLessThanOrEqual((name!.maxWidth ?? Infinity) + 0.5);
    const buy = buyRect({ ...card, y: top });
    const btn = near(texts, card.x + card.w / 2, top + BUTTON_TEXT_DY, 70, 6);
    const want2 = expectedButton(id) || /^\d+$/;
    if (typeof want2 === 'string') expect(btn?.t, `${where}: button label`).toBe(want2);
    else expect(btn?.t, `${where}: price`).toMatch(want2);
    expect(btn!.left, `${where}: "${btn!.t}" inside its button`).toBeGreaterThanOrEqual(buy.x + 6);
    expect(btn!.right, `${where}: "${btn!.t}" inside its button`).toBeLessThanOrEqual(buy.x + buy.w - 6);
    expect(btn!.width, `${where}: "${btn!.t}" squeezed`).toBeLessThanOrEqual((btn!.maxWidth ?? Infinity) + 0.5);
    expect(btn!.y, `${where}: label inside the content viewport`).toBeLessThanOrEqual(CONTENT_BOTTOM - 10);

    // painted: the EQUIPPED / price button face carries the palette colour at its lower left
    let ratio: number | null = null;
    if (id === EQUIPPED || !expectedButton(id)) {
      const fill = id === EQUIPPED ? (opts.colorBlind ? FILL.equippedCB : FILL.equipped) : FILL.price;
      const px = await pixelAt(page, { x: buy.x + 22, y: buy.y + 40 });
      expect(dist(px, hex(fill)), `${where}: button face ${px.map(Math.round).join(',')} vs ${fill}`).toBeLessThanOrEqual(45);
      ratio = btn!.fill.startsWith('#') ? Math.round(contrast(hex(btn!.fill), px) * 100) / 100 : null;
    }
    findings.push({ id, label: name!.t, button: btn!.t, scroll: s, contrast: ratio });
  }
  return findings;
}

const label = (vp: { width: number; height: number }) => `${vp.width}x${vp.height}`;

for (const vp of VIEWPORTS) {
  test.describe(`shop layout at ${label(vp)} (QA-16 B)`, () => {
    test.use({ viewport: vp });

    for (const store of [true, false]) {
      test(`${store ? 'store' : '?store=off'}: every helmet card scrolls fully into view inside the safe box, labels fit — default and colour-blind palette`, async ({ page, browser }, info) => {
        test.setTimeout(45_000);
        const notes: string[] = [];
        for (const colorBlind of [false, true]) {
          // a fresh page per palette (the palette is read from the seeded save at boot)
          const p = colorBlind ? await (await browser.newContext({ ...info.project.use, viewport: vp })).newPage() : page;
          const tag = `${label(vp)} ${store ? 'store' : 'no-store'} ${colorBlind ? 'colour-blind' : 'default'}`;
          const errors = await boot(p, `/?lang=en${store ? '' : '&store=off'}`, seededSave(colorBlind));
          expect(await p.evaluate(() => window.__towerclash.storeAvailable)).toBe(store);
          await openSkins(p);
          const findings = await checkHelmets(p, { store, colorBlind, tag });
          // evidence: the helmet rows in view (scroll to the middle helmet row)
          await p.evaluate(() => window.__towerclash.economy.shopScroll(560));
          await p.waitForTimeout(150);
          await p.screenshot({ path: info.outputPath(`shop-${label(vp)}-${store ? 'store' : 'nostore'}-${colorBlind ? 'cb' : 'default'}.png`), scale: 'css' });
          notes.push(`${tag}: ${findings.map((f) => `${f.label}=${f.button}${f.contrast === null ? '' : ` (${f.contrast}:1)`}`).join(', ')}`);
          expect(errors, tag).toEqual([]);
          if (colorBlind) await p.context().close();
        }
        info.annotations.push({ type: 'shop-layout', description: notes.join(' | ') });
      });
    }
  });
}

test.describe('shop skin labels in every language at 360x640 (QA-16 B)', () => {
  test.use({ viewport: VIEWPORTS[0] });

  test('en / az / ru / tr: every skin card name and button label fits its card unsqueezed', async ({ browser }, info) => {
    test.setTimeout(45_000);
    const squeezed: string[] = [];
    for (const lang of ['en', 'az', 'ru', 'tr'] as const) {
      const ctx = await browser.newContext({ ...info.project.use, viewport: VIEWPORTS[0] });
      const page = await ctx.newPage();
      const errors = await boot(page, `/?lang=${lang}`, seededSave(false, lang));
      expect(await page.evaluate(() => window.__towerclash.getLanguage())).toBe(lang);
      await openSkins(page);
      const S = await Promise.all(['shop.equip', 'shop.equipped', 'shop.packOnly'].map((k) => text(page, k)));
      const texts = await drawnTexts(page); // every card of the tab is drawn each frame, whatever the scroll
      const cardNames = texts.filter((d) => d.maxWidth !== null && Math.abs(d.maxWidth - (SKIN.w - 20)) < 0.5);
      expect(cardNames.length, `${lang}: card names drawn`).toBeGreaterThanOrEqual(20);
      for (const s of S) expect(texts.map((d) => d.t), `${lang}: "${s}" drawn`).toContain(s);
      for (const d of texts) {
        if (d.maxWidth !== null && d.width > d.maxWidth + 0.5) squeezed.push(`${lang} "${d.t}" ${d.width.toFixed(1)} > ${d.maxWidth.toFixed(1)}`);
      }
      await page.screenshot({ path: info.outputPath(`shop-360x640-${lang}.png`), scale: 'css' }); // roofs row 2: the Gold roof's PACK ONLY
      expect(errors, lang).toEqual([]);
      await ctx.close();
    }
    info.annotations.push({ type: 'squeezed', description: squeezed.join(' | ') || 'none' });
    expect(squeezed, 'labels compressed by fillText maxWidth').toEqual([]);
  });
});
