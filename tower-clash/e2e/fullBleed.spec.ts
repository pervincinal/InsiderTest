import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { hudClientPoint, tapHud } from './helpers/tap';

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
const BOOSTERS = { overdrive: { x: 232, y: 1186, w: 66, h: 88 } };
// src/economy (booster price) — OVERDRIVE costs 30 gold
const OVERDRIVE_COST = 30;
const GOLD = 200;

const SHOTS = fileURLToPath(new URL('./__screenshots__/', import.meta.url));

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
      await page.screenshot({ path: `${SHOTS}fullbleed-${phone.name}-title.png`, scale: 'css' });
      expect(errors).toEqual([]);
    });

    test('play: sea under the margins, HUD glass to the screen edges, pause / boosters / MENU tappable where they are drawn', async ({ page }) => {
      const errors = await boot(page, phone.safe);
      expect(await page.evaluate(() => window.__towerclash.loadLevel(4, 1))).toBe(true);
      await expect.poll(() => screen(page)).toBe('play');
      const t0 = await simTime(page);
      await expect.poll(() => simTime(page)).toBeGreaterThan(t0);

      // ground layer: the sea in all four corners; HUD layer: its glass bands cover the corners
      const ground = await corners(page, 'ground');
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
      await page.screenshot({ path: `${SHOTS}fullbleed-${phone.name}-play.png`, scale: 'css' });

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

      // MENU: back to the level map
      await tapHud(page, HUD.menu);
      await expect.poll(() => screen(page)).toBe('levelSelect');
      const map = await corners(page, 'game');
      // the level map's header glass covers the top corners; the bottom ones are the sea or the map running on into the margin
      for (const px of Object.values(map)) expect(px[3]).toBe(255);
      expect(dist(map.bl, OLD_BAND)).toBeGreaterThan(40);
      expect(dist(map.br, OLD_BAND)).toBeGreaterThan(40);
      expect(errors).toEqual([]);
    });
  });
}
