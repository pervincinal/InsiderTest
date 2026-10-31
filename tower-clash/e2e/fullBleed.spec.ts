import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { hudClientPoint, tapHud, tapRect } from './helpers/tap';
import { shotPath } from './tools/shots';

/*
 * BUG-34 (TestFlight 1.0.0 (8), iPhone 17 Pro Max, ~19.5:9): "the game does not fill the screen".
 * The 720×1280 map is letterboxed on any screen taller than 9:16; its margins used to be flat dark
 * bands (palette `letterbox` #1f8fc2) around a lighter sea, and the play HUD sat on the map rect's
 * edges. Now the sea covers the whole canvas on every screen, the HUD's glass bands reach the screen
 * edges with their content anchored to the safe-area edges, and the moved buttons take taps where
 * they are drawn. Two iPhone-class viewports with their Dynamic Island / home-indicator insets
 * (simulated like e2e/webview.spec.ts: the CSS custom properties index.html derives from env()).
 *
 * Like smoke.spec.ts this file imports nothing from src/; values mirror their source of truth.
 */

const SAVE_KEY = 'towerclash.save.v3';
// src/render/palette.ts — DEFAULT_THEME / DEFAULT_PALETTE water: gradient top / bottom, and the old flat band colour
const SEA_TOP = [0x3f, 0xb6, 0xde];
const SEA_BOTTOM = [0x8e, 0xe2, 0xf5];
const OLD_BAND = [0x1f, 0x8f, 0xc2];
// src/render/layout.ts — HUD / BOOSTERS (layout coordinates; the bands move, these do not)
const HUD = { pause: { x: 636, y: 18, w: 66, h: 60 }, menu: { x: 586, y: 1196, w: 116, h: 64 } };
const BOOSTERS = { overdrive: { x: 217, y: 1186, w: 66, h: 88 } };
// PAUSE.menu: the band's MENU opens the pause card (AUD-U4); the card's MENU leaves
const PAUSE_MENU = { x: 370, y: 860, w: 170, h: 72 };
// FE-11 — src/render/menuLayout.ts (layout coordinates of the menus; their header / bottom chrome move on a tall screen)
const TITLE_PLAY = { x: 180, y: 640, w: 360, h: 96 };
const TITLE_SETTINGS = { x: 180, y: 776, w: 172, h: 64 };
const MENU_BACK = { x: 18, y: 20, w: 140, h: 60 };
const SHOP_TABS = { x: 30, y: 112, w: 660, h: 60 };
const SHOP_ROW_0 = { x: 34, y: 200, w: 652, h: 168 };
const SETTINGS_COLOR_BLIND = { x: 470, y: 392, w: 160, h: 56 }; // AUD-F6: under the new Music row
const LEVEL_MAP = { tabDaily: { x: 126, y: 118, w: 118, h: 44 }, tabWeekly: { x: 244, y: 118, w: 118, h: 44 }, commander: { x: 60, y: 1206, w: 600, h: 54 }, nodeR: 46, top: 260, step: 150, amp: 185, period: 5 };
function levelNodeRect(index: number, scroll = 0): { x: number; y: number; w: number; h: number } {
  const cx = 360 + LEVEL_MAP.amp * Math.sin((index * Math.PI * 2) / LEVEL_MAP.period);
  const cy = LEVEL_MAP.top + index * LEVEL_MAP.step - scroll;
  return { x: cx - LEVEL_MAP.nodeR, y: cy - LEVEL_MAP.nodeR, w: LEVEL_MAP.nodeR * 2, h: LEVEL_MAP.nodeR * 2 };
}
/** Tap segment `i` of `count` of a segmented control (menuWidgets.ts drawSegmented: 4 px inset, equal widths). */
const segment = (r: { x: number; y: number; w: number; h: number }, count: number, i: number) => ({ x: r.x + 4 + i * ((r.w - 8) / count), y: r.y, w: (r.w - 8) / count, h: r.h });
// src/economy (booster price) — OVERDRIVE costs 30 gold
const OVERDRIVE_COST = 30;
const GOLD = 200;

// AUD-Q15: e2e/tools/shots.ts picks the tracked folder (default run) or <PW_OUTPUT>/__screenshots__

const PHONES = [
  { name: '390x844', viewport: { width: 390, height: 844 }, safe: { top: 47, bottom: 34 } },
  { name: '430x932', viewport: { width: 430, height: 932 }, safe: { top: 59, bottom: 34 } },
] as const;

type Rgb = readonly number[];
const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/** RGBA of the four corner pixels (2 device px in) of one of the stacked canvases. */
function corners(page: Page, id: 'game' | 'ground' | 'hud'): Promise<{ tl: number[]; tr: number[]; bl: number[]; br: number[] }> {
  return page.evaluate(
    (cid) =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          const c = document.getElementById(cid) as HTMLCanvasElement;
          const ctx = c.getContext('2d')!;
          const at = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
          resolve({ tl: at(2, 2), tr: at(c.width - 3, 2), bl: at(2, c.height - 3), br: at(c.width - 3, c.height - 3) });
        }),
      ),
    id,
  );
}

/** A corner is the sea when it is near the gradient colour of its edge (a faint wave band may cross it) and well away from the old flat band. */
function expectSea(px: number[], edge: Rgb, why: string): void {
  expect(px[3], `${why}: opaque`).toBe(255);
  expect(dist(px, edge), `${why}: ${px.slice(0, 3).join(',')} should be the sea (${edge.join(',')})`).toBeLessThan(45);
  expect(dist(px, OLD_BAND), `${why}: ${px.slice(0, 3).join(',')} must not be the old flat band colour`).toBeGreaterThan(dist(px, edge));
}

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const toClient = (page: Page, x: number, y: number) => page.evaluate(([lx, ly]) => window.__towerclash.toClient(lx, ly), [x, y] as const);
/** Where the current menu draws its layout point (FE-11), client px. */
const layoutToClient = (page: Page, x: number, y: number) =>
  page.evaluate(([lx, ly]) => new Promise<{ x: number; y: number }>((r) => requestAnimationFrame(() => r(window.__towerclash.layoutToClient(lx, ly)))), [x, y] as const);
const save = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__towerclash.economy.getSave())) as { gold: number; upgrades: Record<string, number>; settings: { colorBlind: boolean } });

async function boot(page: Page, safe: { top: number; bottom: number }): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.addInitScript(
    ([key, gold, inset]) => {
      localStorage.setItem(key, JSON.stringify({ version: 3, gold, stars: { '1': 3, '2': 3, '3': 3 } }));
      const apply = (): boolean => {
        const app = document.getElementById('app');
        if (!app) return false;
        app.style.setProperty('--safe-top', `${inset.top}px`);
        app.style.setProperty('--safe-bottom', `${inset.bottom}px`);
        return true;
      };
      if (!apply()) {
        new MutationObserver((_, obs) => {
          if (apply()) obs.disconnect();
        }).observe(document, { childList: true, subtree: true });
      }
    },
    [SAVE_KEY, GOLD, safe] as const,
  );
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function');
  await expect.poll(() => screen(page)).toBe('title');
  return errors;
}

for (const phone of PHONES) {
  test.describe(`full bleed on a ${phone.name} phone (BUG-34)`, () => {
    test.use({ viewport: phone.viewport });

    test('title: the sea reaches every corner, no flat bands', async ({ page }) => {
      const errors = await boot(page, phone.safe);
      // the map is letterboxed: its top edge sits well below the screen's top edge
      const top = await toClient(page, 0, 0);
      expect(top.y).toBeGreaterThan(phone.safe.top + 20);
      const title = await corners(page, 'game');
      expectSea(title.tl, SEA_TOP, 'title top-left');
      expectSea(title.tr, SEA_TOP, 'title top-right');
      expectSea(title.bl, SEA_BOTTOM, 'title bottom-left');
      expectSea(title.br, SEA_BOTTOM, 'title bottom-right');
      await page.screenshot({ path: shotPath(`fullbleed-${phone.name}-title`), scale: 'css' });
      expect(errors).toEqual([]);
    });

    test('play: sea under the margins, HUD glass to the screen edges, pause / boosters / MENU tappable where they are drawn', async ({ page }) => {
      const errors = await boot(page, phone.safe);
      expect(await page.evaluate(() => window.__towerclash.loadLevel(4, 1))).toBe(true);
      await expect.poll(() => screen(page)).toBe('play');
      await page.evaluate(() => window.__towerclash.startMatch()); // AUD-B11: the lesson card holds the match until a first input
      const t0 = await simTime(page);
      await expect.poll(() => simTime(page)).toBeGreaterThan(t0);

      // ground layer: the sea in all four corners; HUD layer: its glass bands cover the corners
      const ground = await corners(page, 'ground');
      // ART-24: the default play view is the flat map again — no horizon haze (that is the ?tilt= camera's), plain sea
      expectSea(ground.tl, SEA_TOP, 'ground top-left');
      expectSea(ground.tr, SEA_TOP, 'ground top-right');
      expectSea(ground.bl, SEA_BOTTOM, 'ground bottom-left');
      expectSea(ground.br, SEA_BOTTOM, 'ground bottom-right');
      await expect.poll(async () => Object.values(await corners(page, 'hud')).map((px) => px[3]! > 100), { message: 'HUD glass reaches all four corners' }).toEqual([true, true, true, true]);

      // the bands are anchored to the safe-area edges: pause sits right under the top inset, MENU right over the bottom one
      const pauseAt = await hudClientPoint(page, HUD.pause.x + HUD.pause.w / 2, HUD.pause.y);
      const pauseLayout = await toClient(page, HUD.pause.x + HUD.pause.w / 2, HUD.pause.y);
      const scale = (await toClient(page, 720, 0)).x / 720;
      expect(pauseAt.y, 'pause top edge = safe top + 18 layout px').toBeCloseTo(phone.safe.top + HUD.pause.y * scale, 0);
      expect(pauseAt.y).toBeLessThan(pauseLayout.y - 15);
      const menuBottom = await hudClientPoint(page, HUD.menu.x, HUD.menu.y + HUD.menu.h);
      expect(menuBottom.y, 'MENU bottom edge = safe bottom − 20 layout px').toBeCloseTo(phone.viewport.height - phone.safe.bottom - 20 * scale, 0);
      await page.screenshot({ path: shotPath(`fullbleed-${phone.name}-play`), scale: 'css' });

      // pause button: pauses (sim frozen), tapped again: resumes
      await tapHud(page, HUD.pause);
      const frozen = await simTime(page);
      await page.waitForTimeout(300);
      expect(await simTime(page), 'the anchored pause button pauses the sim').toBe(frozen);
      // paused frames are single-canvas: the dimmed sea still reaches the corners (no bright frame)
      const dimmed = await corners(page, 'game');
      for (const px of Object.values(dimmed)) expect(px[3]).toBe(255);
      expect(dist(dimmed.tl, SEA_TOP), 'the pause dim covers the margins too').toBeGreaterThan(30);
      await tapHud(page, HUD.pause);
      await expect.poll(() => simTime(page), { message: 'tapped again: resumes' }).toBeGreaterThan(frozen);

      // booster: OVERDRIVE fires from its anchored disc
      await tapHud(page, BOOSTERS.overdrive);
      await expect.poll(() => page.evaluate(() => window.__towerclash.getCoins())).toBe(GOLD - OVERDRIVE_COST);
      await expect.poll(() => page.evaluate(() => (window.__towerclash.getState()?.boosters ?? []).map((b) => b.type))).toEqual(['overdrive']);

      // MENU (AUD-U4): opens the pause card; the card's MENU goes back to the level map
      await tapHud(page, HUD.menu);
      const held = await simTime(page);
      await page.waitForTimeout(300);
      expect(await simTime(page), 'MENU pauses the sim').toBe(held);
      expect(await screen(page)).toBe('play');
      await tapRect(page, PAUSE_MENU);
      await expect.poll(() => screen(page)).toBe('levelSelect');
      const map = await corners(page, 'game');
      // the level map's header glass covers the top corners; the bottom ones are the sea or the map running on into the margin
      for (const px of Object.values(map)) expect(px[3]).toBe(255);
      expect(dist(map.bl, OLD_BAND)).toBeGreaterThan(40);
      expect(dist(map.br, OLD_BAND)).toBeGreaterThan(40);
      expect(errors).toEqual([]);
    });

    test('menus (FE-11): headers on the top safe edge, the commander chip on the bottom one; a shop tab, a settings row and a level node take taps where they are drawn', async ({ page }, info) => {
      const errors = await boot(page, phone.safe);
      const scale = (await toClient(page, 720, 0)).x / 720;
      const anchors = await page.evaluate(() => window.__towerclash.getAnchors());
      expect(anchors.top, 'the header moves up on a tall screen').toBeLessThan(-30);
      expect(anchors.bottom, 'the bottom chrome moves down').toBeGreaterThan(30);

      // shop: BACK on the top safe edge; the UPGRADES tab and Production's row where they are drawn
      await page.evaluate(() => window.__towerclash.economy.openShop('crystals'));
      await expect.poll(() => screen(page)).toBe('shop');
      const back = await layoutToClient(page, MENU_BACK.x, MENU_BACK.y);
      expect(back.y, 'BACK top edge = safe top + 20 layout px').toBeCloseTo(phone.safe.top + MENU_BACK.y * scale, 0);
      const tab = segment(SHOP_TABS, 4, 3);
      const tabAt = await layoutToClient(page, tab.x, tab.y);
      expect(tabAt.y, 'the tab row moved up with the header').toBeLessThan((await toClient(page, tab.x, tab.y)).y - 15);
      await tapRect(page, tab); // UPGRADES
      await tapRect(page, SHOP_ROW_0); // Production tier 1: 200 gold
      await expect.poll(async () => (await save(page)).upgrades.production ?? 0, { message: 'Production bought from the moved row' }).toBe(1);
      expect((await save(page)).gold).toBe(0);
      await page.screenshot({ path: info.outputPath(`fe11-${phone.name}-shop.png`), scale: 'css' });
      await tapRect(page, MENU_BACK);
      await expect.poll(() => screen(page)).toBe('title');

      // settings: the colour-blind row where it is drawn (the whole card follows the header up)
      await tapRect(page, TITLE_SETTINGS);
      await expect.poll(() => screen(page)).toBe('settings');
      const row = await layoutToClient(page, SETTINGS_COLOR_BLIND.x, SETTINGS_COLOR_BLIND.y);
      expect(row.y).toBeLessThan((await toClient(page, SETTINGS_COLOR_BLIND.x, SETTINGS_COLOR_BLIND.y)).y - 15);
      await tapRect(page, SETTINGS_COLOR_BLIND);
      await expect.poll(async () => (await save(page)).settings.colorBlind, { message: 'colour-blind toggled from the moved row' }).toBe(true);
      await tapRect(page, SETTINGS_COLOR_BLIND);
      await expect.poll(async () => (await save(page)).settings.colorBlind).toBe(false);
      await page.screenshot({ path: info.outputPath(`fe11-${phone.name}-settings.png`), scale: 'css' });
      await tapRect(page, MENU_BACK);
      await expect.poll(() => screen(page)).toBe('title');

      // level map: header + challenge card up, commander chip down to the bottom safe edge; WEEKLY tab and a node by tap
      await tapRect(page, TITLE_PLAY);
      await expect.poll(() => screen(page)).toBe('levelSelect');
      const chip = await layoutToClient(page, LEVEL_MAP.commander.x, LEVEL_MAP.commander.y + LEVEL_MAP.commander.h);
      expect(chip.y, 'chip bottom edge = safe bottom − 20 layout px').toBeCloseTo(phone.viewport.height - phone.safe.bottom - 20 * scale, 0);
      await tapRect(page, LEVEL_MAP.tabWeekly);
      await expect.poll(() => page.evaluate(() => window.__towerclash.weekly.tab())).toBe('weekly');
      await tapRect(page, LEVEL_MAP.tabDaily);
      await expect.poll(() => page.evaluate(() => window.__towerclash.weekly.tab())).toBe('daily');
      await page.evaluate(() => window.__towerclash.setLevelSelectScroll(0));
      await page.screenshot({ path: info.outputPath(`fe11-${phone.name}-levelmap.png`), scale: 'css' });
      await tapRect(page, levelNodeRect(1)); // level 2 (unlocked by the seeded stars); the path itself does not move
      await expect.poll(() => page.evaluate(() => window.__towerclash.getState()?.levelId ?? -1)).toBe(2);
      expect(errors).toEqual([]);
    });
  });
}
