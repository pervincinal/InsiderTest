import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * PERF-3 three stacked canvases (#ground / #game / #hud). What must hold on a real Chromium:
 *   1. the stack — three same-size canvases; input lands on #game (the HUD layer above it is
 *      `pointer-events: none`), for a real touch as well as a mouse click;
 *   2. play paints the ground and HUD layers; pause / result / level map leave the HUD layer fully
 *      transparent (nothing may sit above a menu or the pause card);
 *   3. a same-size resize (orientationchange fires before the metrics change on some browsers, and
 *      visualViewport echoes every window resize) followed by a pause must not leave stale HUD pixels
 *      on the top canvas (regression: `resizeLayers` reset the key without clearing the pixels, and
 *      `blankLayer` skips the clear on an empty key);
 *   4. a real viewport change re-sizes all three canvases and repaints the ground; a visibility change
 *      pauses the sim and blanks the HUD layer.
 * Like smoke.spec.ts this file imports nothing from src/; hit regions mirror src/render/layout.ts.
 */

const SAVE_KEY = 'towerclash.save.v3';
/** Levels 1–3 run the tutorial on a 0★ save; its hint frames use the single-canvas path on purpose (HUD on #game). */
const NO_TUTORIAL = { version: 3, gold: 100, stars: { '1': 1, '2': 1, '3': 1 } };
// src/render/layout.ts — TITLE.play, PAUSE.resume
const TITLE_PLAY = { x: 180, y: 640, w: 360, h: 96 };
const PAUSE_RESUME = { x: 210, y: 566, w: 300, h: 76 };
// src/sim/constants.ts — MAP_W / MAP_H
const MAP = { w: 720, h: 1280 };

/**
 * Pixel statistics of one canvas (every 7th pixel — enough to tell blank from painted, fast enough per
 * frame): `opaque` = sampled pixels with alpha > 0 (always all of them on the opaque ground layer),
 * `nonBlack` = sampled pixels that are not pure black (the opaque ground layer's "blank" colour).
 */
const stats = (page: Page, id: string) =>
  page.evaluate((cid) => {
    const c = document.getElementById(cid);
    if (!(c instanceof HTMLCanvasElement)) throw new Error(`${cid} is not a canvas`);
    const ctx = c.getContext('2d')!;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let opaque = 0;
    let nonBlack = 0;
    let sampled = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      sampled++;
      if (d[i + 3]! > 0) opaque++;
      if (d[i]! + d[i + 1]! + d[i + 2]! > 0) nonBlack++;
    }
    return { id: cid, w: c.width, h: c.height, cssW: c.style.width, cssH: c.style.height, opaque, nonBlack, sampled };
  }, id);

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const toClient = (page: Page, lx: number, ly: number) => page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [lx, ly] as const);
/** Wait for two animation frames (one full draw after whatever the caller changed). */
const twoFrames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
/** The element a pointer / touch at a logical point would hit. */
const hitElementId = async (page: Page, lx: number, ly: number) => {
  const c = await toClient(page, lx, ly);
  return page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id ?? null, [c.x, c.y] as const);
};

async function boot(page: Page, seeded: Record<string, unknown> = { version: 3 }): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, seeded] as const);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function');
  await expect.poll(() => screen(page)).toBe('title');
  return pageErrors;
}

async function expectHudBlank(page: Page, why: string): Promise<void> {
  await twoFrames(page);
  const hud = await stats(page, 'hud');
  expect(hud.opaque, `${why}: HUD layer must be fully transparent (${hud.opaque}/${hud.sampled} sampled pixels painted)`).toBe(0);
}

async function expectPlayLayersPainted(page: Page, why: string): Promise<void> {
  await expect.poll(async () => (await stats(page, 'hud')).opaque, { message: `${why}: HUD layer painted` }).toBeGreaterThan(0);
  const ground = await stats(page, 'ground');
  expect(ground.nonBlack, `${why}: ground layer painted`).toBeGreaterThan(ground.sampled * 0.5);
}

test.describe('PERF-3 canvas layers', () => {
  test('stack: three same-size canvases, input (touch and mouse) reaches #game through the HUD layer', async ({ page }) => {
    const errors = await boot(page);
    const [ground, game, hud] = await Promise.all([stats(page, 'ground'), stats(page, 'game'), stats(page, 'hud')]);
    for (const c of [ground, hud]) {
      expect([c.w, c.h], `${c.id} pixel size`).toEqual([game.w, game.h]);
      expect([c.cssW, c.cssH], `${c.id} CSS size`).toEqual([game.cssW, game.cssH]);
    }
    expect(game.w).toBeGreaterThan(0);
    // stacking order and hit-testing: the top canvas is #hud but it must not take the pointer
    expect(await page.evaluate(() => [...document.querySelectorAll('#app canvas')].map((c) => c.id))).toEqual(['ground', 'game', 'hud']);
    expect(await hitElementId(page, MAP.w / 2, MAP.h / 2)).toBe('game');
    expect(await hitElementId(page, 20, 20)).toBe('game'); // letterbox corner too: the canvases cover the viewport
    await expectHudBlank(page, 'title');
    // a real touch on PLAY (Pixel 5 project: hasTouch) opens the level map
    const c = await toClient(page, TITLE_PLAY.x + TITLE_PLAY.w / 2, TITLE_PLAY.y + TITLE_PLAY.h / 2);
    await page.touchscreen.tap(c.x, c.y);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    await expectHudBlank(page, 'level map');
    expect(await page.evaluate(() => window.__towerclash.back())).toBe(true);
    await expect.poll(() => screen(page)).toBe('title');
    expect(errors).toEqual([]);
  });

  test('play → same-size resize + pause → resume → result → map → next level: no stale HUD pixels, ground repainted', async ({ page }) => {
    test.slow();
    const errors = await boot(page, NO_TUTORIAL);
    expect(await page.evaluate(() => window.__towerclash.loadLevel(1, 1))).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await expect.poll(() => simTime(page)).toBeGreaterThan(400);
    await expectPlayLayersPainted(page, 'playing');
    const gameLive = await stats(page, 'game');
    expect(gameLive.opaque, 'the game canvas is cleared, not filled, while layered (the ground shows through)').toBeLessThan(gameLive.sampled);

    // 3. same-size resize, then pause in the same task (no frame in between)
    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
      window.__towerclash.back(); // pause
    });
    const tPaused = await simTime(page);
    await page.waitForTimeout(250);
    expect(await simTime(page), 'back() paused the sim').toBe(tPaused);
    await expectHudBlank(page, 'paused after a same-size resize');
    expect(await hitElementId(page, MAP.w / 2, MAP.h / 2)).toBe('game');

    // resume through the pause card: the layered path is back
    const r = await toClient(page, PAUSE_RESUME.x + PAUSE_RESUME.w / 2, PAUSE_RESUME.y + PAUSE_RESUME.h / 2);
    await page.mouse.click(r.x, r.y);
    await expect.poll(() => simTime(page)).toBeGreaterThan(tPaused);
    await expectPlayLayersPainted(page, 'resumed');

    // result screen (non-layered overlay) → map → another level
    await page.evaluate(() => {
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    });
    await expect.poll(() => screen(page), { timeout: 75_000, intervals: [250] }).toBe('result');
    await expectHudBlank(page, 'result');
    expect(await page.evaluate(() => window.__towerclash.back())).toBe(true); // Escape → level map
    await expect.poll(() => screen(page)).toBe('levelSelect');
    await expectHudBlank(page, 'level map after a result');
    expect(await page.evaluate(() => window.__towerclash.loadLevel(2, 1))).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await expect.poll(() => simTime(page)).toBeGreaterThan(400);
    await expectPlayLayersPainted(page, 'level 2');
    expect(errors).toEqual([]);
  });

  test('viewport change re-sizes all three canvases and repaints; a visibility change pauses and blanks the HUD layer', async ({ page }) => {
    const errors = await boot(page, NO_TUTORIAL);
    expect(await page.evaluate(() => window.__towerclash.loadLevel(1, 1))).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await expect.poll(() => simTime(page)).toBeGreaterThan(400);
    const before = await stats(page, 'game');

    await page.setViewportSize({ width: 360, height: 640 });
    await expect.poll(async () => (await stats(page, 'game')).w).not.toBe(before.w);
    await twoFrames(page);
    const [ground, game, hud] = await Promise.all([stats(page, 'ground'), stats(page, 'game'), stats(page, 'hud')]);
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    expect(game.w).toBeGreaterThanOrEqual(360); // ≥ 1 device px per CSS px
    expect(game.w).toBeLessThanOrEqual(Math.round(360 * dpr));
    for (const c of [ground, hud]) {
      expect([c.w, c.h], `${c.id} follows the game canvas`).toEqual([game.w, game.h]);
      expect([c.cssW, c.cssH]).toEqual([game.cssW, game.cssH]);
    }
    await expectPlayLayersPainted(page, 'after the viewport change');
    expect(await hitElementId(page, MAP.w / 2, MAP.h / 2)).toBe('game');

    // background: the sim freezes and the pause card is drawn on the game canvas, HUD layer blank
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const t = await simTime(page);
    await page.waitForTimeout(250);
    expect(await simTime(page), 'hidden → paused').toBe(t);
    await expectHudBlank(page, 'paused by visibilitychange');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(250);
    expect(await simTime(page), 'never auto-resumes').toBe(t);
    expect(errors).toEqual([]);
  });
});
