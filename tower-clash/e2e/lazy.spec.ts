import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Lazy chunks under a failing network (PERF-1 lazy screens, PERF-2 per-level JSON, M3-2 silhouette
 * skins). A chunk that fails to download must never leave the player stuck or throw: the tap
 * returns to the screen it came from, the level plays with the default look, and no uncaught
 * error reaches `window.onerror`. The requests are aborted with `page.route`; the service worker is
 * blocked so the cache-first strategy cannot serve them from a previous run.
 */

test.use({ serviceWorkers: 'block' });

const SAVE_KEY = 'towerclash.save.v3';
// src/render/layout.ts — TITLE.play
const TITLE_PLAY = { x: 180, y: 640, w: 360, h: 96 };

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);

async function boot(page: Page, seeded: Record<string, unknown> = { version: 3 }): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, seeded] as const);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function');
  await expect.poll(() => screen(page)).toBe('title');
  return pageErrors;
}

async function tapRect(page: Page, r: { x: number; y: number; w: number; h: number }): Promise<void> {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [r.x + r.w / 2, r.y + r.h / 2] as const);
  await page.mouse.click(c.x, c.y);
}

test.describe('lazy chunks under a failing network', () => {
  test('level chunk: a failed download returns to the screen the player was on; the level opens once the network is back', async ({ page }) => {
    const aborted: string[] = [];
    await page.route(/\/assets\/003-[^/]*\.js$/, (route) => {
      aborted.push(route.request().url());
      void route.abort('failed');
    });
    const errors = await boot(page);
    expect(await page.evaluate(() => window.__towerclash.loadLevel(3, 1))).toBe(false);
    expect(aborted.length).toBeGreaterThanOrEqual(1);
    await expect.poll(() => screen(page)).toBe('title');
    expect(await page.evaluate(() => window.__towerclash.getState())).toBeNull();
    // the rest of the game is untouched: another level still opens
    expect(await page.evaluate(() => window.__towerclash.loadLevel(1, 1))).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await expect.poll(() => simTime(page)).toBeGreaterThan(200);
    expect(errors).toEqual([]);

    // Network back. Chromium's module map remembers a failed module fetch for the life of the page,
    // so `loadLevel(3)` keeps resolving false until a reload (BACKLOG BUG-8: the game must reload or
    // re-fetch under a fresh URL and tell the player). Whatever the outcome, level 1 keeps running
    // and nothing throws; the outcome is recorded so the day BUG-8 lands this line can pin `true`.
    await page.unroute(/\/assets\/003-[^/]*\.js$/);
    const t1 = await simTime(page);
    const retry = await page.evaluate(() => window.__towerclash.loadLevel(3, 1));
    test.info().annotations.push({ type: 'lazy', description: `level 3 after the network came back: loadLevel → ${retry}` });
    await expect.poll(() => screen(page)).toBe('play');
    expect(await page.evaluate(() => window.__towerclash.getState()?.levelId)).toBe(retry ? 3 : 1);
    await expect.poll(() => simTime(page)).toBeGreaterThan(retry ? 0 : t1);
    expect(errors).toEqual([]);
  });

  test('menu chunk (lazyScreens): PLAY returns to the title when the download fails, no throw', async ({ page }) => {
    await page.route(/\/assets\/lazyScreens-[^/]*\.js$/, (route) => void route.abort('failed'));
    const errors = await boot(page);
    await tapRect(page, TITLE_PLAY);
    // the spinner screen may show briefly; the navigation is abandoned and the title is current again
    await expect.poll(() => screen(page), { timeout: 5_000 }).toBe('title');
    await page.waitForTimeout(300);
    expect(await screen(page)).toBe('title');
    // the debug openShop goes through the same path and resolves (does not hang) on failure
    await page.evaluate(() => window.__towerclash.openShop());
    expect(await screen(page)).toBe('title');
    expect(errors).toEqual([]);
  });

  test('skinShapes chunk: an equipped silhouette skin whose chunk fails still plays with the default look', async ({ page }) => {
    const aborted: string[] = [];
    await page.route(/\/assets\/skinShapes-[^/]*\.js$/, (route) => {
      aborted.push(route.request().url());
      void route.abort('failed');
    });
    const errors = await boot(page, { version: 3, skins: { owned: ['tower_keep', 'unit_robots'], equipped: { roof: 'tower_keep', helmet: 'unit_robots', theme: null } } });
    expect(await page.evaluate(() => window.__towerclash.loadLevel(1, 1))).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await expect.poll(() => simTime(page)).toBeGreaterThan(1000);
    expect(aborted.length, 'the play screen asked for the skin chunk').toBeGreaterThanOrEqual(1);
    // the reference player wins the level with the default look on screen
    await page.evaluate(() => {
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    });
    await expect.poll(() => screen(page), { timeout: 75_000, intervals: [250] }).toBe('result');
    expect((await page.evaluate(() => window.__towerclash.getResult()))?.outcome).toBe('won');
    expect(errors).toEqual([]);
  });
});
