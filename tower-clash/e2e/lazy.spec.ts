import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Lazy chunks under a failing network (PERF-1 lazy screens, PERF-2 per-level JSON, M3-2 silhouette
 * skins). A chunk that fails to download must never leave the player stuck or throw: the tap
 * returns to the screen it came from with a toast, the level plays with the default look, and no
 * uncaught error reaches `window.onerror`. Once the network is back the chunk must load again
 * (BUG-8): the browser's module map pins the failed URL, so src/lazyChunk.ts re-fetches it under a
 * `?r=<time>` query. The requests are aborted with `page.route` (query included, so the re-fetch
 * is aborted as long as the route is on); the service worker is blocked so the cache-first
 * strategy cannot serve them from a previous run.
 *
 * Boot (QA-6): `page.goto` in the test runner has no navigation timeout of its own, so a stalled
 * navigation only surfaces as the 90 s test timeout (seen twice on "menu chunk" in full-suite runs,
 * never alone; not reproduced in 3 full-suite runs + 37 sequenced boots under a load average of 5–7).
 * `boot` therefore navigates with `waitUntil: 'commit'` (the document is in; Chromium's `load`
 * lifecycle is not waited on), polls the game's debug surface under its own bound, and retries the
 * navigation once — a stalled boot fails in ≤ 40 s with a message that names the phase instead of
 * eating the whole test budget. The route stays registered before the navigation: with any route
 * on, Playwright pauses every request (the document included) and continues the non-matching ones
 * server-side; measured cost on this machine ≈ 0 (Chromium `load` at 70–150 ms with the route on).
 */

test.use({ serviceWorkers: 'block' });

const SAVE_KEY = 'towerclash.save.v3';
// src/render/layout.ts — TITLE.play
const TITLE_PLAY = { x: 180, y: 640, w: 360, h: 96 };
const LEVEL3_CHUNK = /\/assets\/003-[^/?]*\.js(\?.*)?$/;
const MENU_CHUNK = /\/assets\/lazyScreens-[^/?]*\.js(\?.*)?$/;
const SKIN_CHUNK = /\/assets\/skinShapes-[^/?]*\.js(\?.*)?$/;
const THEMES_CHUNK = /\/assets\/themes-[^/?]*\.js(\?.*)?$/;
const LEVEL15_CHUNK = /\/assets\/015-[^/?]*\.js(\?.*)?$/;
// src/render/palette.ts — DEFAULT_THEME.letterbox (#1f8fc2): what the ground layer shows without the neon theme
const DEFAULT_LETTERBOX = [31, 143, 194];

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const toast = (page: Page) => page.evaluate(() => window.__towerclash.getToast());
const text = (page: Page, key: string) => page.evaluate((k) => window.__towerclash.getText(k), key);

/** QA-6 boot budgets, per attempt: the document must commit within the first, the debug surface must appear within the second. */
const BOOT_NAV_TIMEOUT_MS = 10_000;
const BOOT_SURFACE_TIMEOUT_MS = 10_000;
const BOOT_ATTEMPTS = 2;

async function boot(page: Page, seeded: Record<string, unknown> = { version: 3 }): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, seeded] as const);
  const failures: string[] = [];
  for (let attempt = 1; attempt <= BOOT_ATTEMPTS; attempt++) {
    let phase = `navigation (${BOOT_NAV_TIMEOUT_MS} ms)`;
    try {
      await page.goto('/', { waitUntil: 'commit', timeout: BOOT_NAV_TIMEOUT_MS });
      phase = `debug surface (${BOOT_SURFACE_TIMEOUT_MS} ms)`;
      await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function', undefined, { timeout: BOOT_SURFACE_TIMEOUT_MS });
      phase = 'title screen';
      await expect.poll(() => screen(page)).toBe('title');
      return pageErrors;
    } catch (err) {
      failures.push(`attempt ${attempt} stalled in ${phase}: ${String(err).split('\n')[0]}`);
      console.warn(`boot: ${failures[failures.length - 1]}`);
    }
  }
  throw new Error(`boot: the game did not come up in ${BOOT_ATTEMPTS} attempts\n${failures.join('\n')}`);
}

async function tapRect(page: Page, r: { x: number; y: number; w: number; h: number }): Promise<void> {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [r.x + r.w / 2, r.y + r.h / 2] as const);
  await page.mouse.click(c.x, c.y);
}

test.describe('lazy chunks under a failing network', () => {
  test('level chunk: a failed download returns to the screen the player was on with a toast; the level opens once the network is back', async ({ page }) => {
    const aborted: string[] = [];
    await page.route(LEVEL3_CHUNK, (route) => {
      aborted.push(route.request().url());
      void route.abort('failed');
    });
    const errors = await boot(page);
    expect(await page.evaluate(() => window.__towerclash.loadLevel(3, 1))).toBe(false);
    expect(aborted.length).toBeGreaterThanOrEqual(1);
    await expect.poll(() => screen(page)).toBe('title');
    expect(await page.evaluate(() => window.__towerclash.getState())).toBeNull();
    expect(await toast(page)).toBe(await text(page, 'common.loadFailed'));
    // a second tap while still offline re-fetches under a fresh URL (module map) and fails again with the toast
    const before = aborted.length;
    expect(await page.evaluate(() => window.__towerclash.loadLevel(3, 1))).toBe(false);
    expect(aborted.length).toBeGreaterThan(before);
    expect(aborted[aborted.length - 1]).toMatch(/003-[^/?]*\.js\?r=\d+$/);
    await expect.poll(() => screen(page)).toBe('title');
    expect(await toast(page)).toBe(await text(page, 'common.loadFailed'));
    // the rest of the game is untouched: another level still opens
    expect(await page.evaluate(() => window.__towerclash.loadLevel(1, 1))).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await expect.poll(() => simTime(page)).toBeGreaterThan(200);
    expect(errors).toEqual([]);

    // Network back: the re-fetch under `?r=` gets through the pinned module-map entry and level 3 opens (BUG-8).
    await page.unroute(LEVEL3_CHUNK);
    const fetched = page.waitForResponse((r) => LEVEL3_CHUNK.test(r.url()) && r.url().includes('?r='));
    expect(await page.evaluate(() => window.__towerclash.loadLevel(3, 1))).toBe(true);
    expect((await fetched).ok()).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    expect(await page.evaluate(() => window.__towerclash.getState()?.levelId)).toBe(3);
    await expect.poll(() => simTime(page)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('menu chunk (lazyScreens): PLAY returns to the title with a toast when the download fails, no throw; opens once the network is back', async ({ page }) => {
    const aborted: string[] = [];
    await page.route(MENU_CHUNK, (route) => {
      aborted.push(route.request().url());
      void route.abort('failed');
    });
    const errors = await boot(page);
    await tapRect(page, TITLE_PLAY);
    // the spinner screen may show briefly; the navigation is abandoned and the title is current again
    await expect.poll(() => screen(page), { timeout: 5_000 }).toBe('title');
    await page.waitForTimeout(300);
    expect(await screen(page)).toBe('title');
    expect(await toast(page)).toBe(await text(page, 'common.loadFailed'));
    // the debug openShop goes through the same path and resolves (does not hang) on failure;
    // wait out the chunk back-off first so this attempt really issues a `?r=` re-fetch
    await page.waitForTimeout(3_300);
    await page.evaluate(() => window.__towerclash.openShop());
    expect(await screen(page)).toBe('title');
    // the idle preload failed first, so every user attempt since is a `?r=` re-fetch, aborted here
    // (the preload and the openShop attempt race the assertions, so poll instead of counting once)
    // the PLAY attempt and the openShop attempt are the two guaranteed requests; the idle preload
    // may or may not have fired before the taps, so only the user-driven `?r=` re-fetch is asserted
    await expect.poll(() => aborted.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
    await expect.poll(() => aborted.filter((u) => u.includes('?r=')).length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);

    await page.unroute(MENU_CHUNK);
    await tapRect(page, TITLE_PLAY);
    await expect.poll(() => screen(page), { timeout: 5_000 }).toBe('levelSelect');
    expect(errors).toEqual([]);
  });

  test('skinShapes chunk: an equipped silhouette skin whose chunk fails still plays with the default look; the chunk is re-fetched once the network is back', async ({ page }) => {
    const aborted: string[] = [];
    await page.route(SKIN_CHUNK, (route) => {
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
    // draw-time retries are throttled (src/lazyChunk.ts RETRY_AFTER_MS): a match at ×10 asks a handful of times, not once per frame
    expect(aborted.length).toBeLessThan(30);
    expect(errors).toEqual([]);

    // Network back: the next level's first skinned frame re-fetches the chunk under `?r=` and it lands.
    await page.unroute(SKIN_CHUNK);
    const fetched = page.waitForResponse((r) => SKIN_CHUNK.test(r.url()) && r.url().includes('?r='), { timeout: 15_000 });
    expect(await page.evaluate(() => window.__towerclash.loadLevel(2, 1))).toBe(true);
    expect((await fetched).ok()).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    expect(errors).toEqual([]);
  });

  test('PERF-5 preload: an equipped lazy roof + neon theme fetch their chunks at level start, before the first play frame, no throw', async ({ page }) => {
    const requests: { url: string; at: number }[] = [];
    page.on('request', (r) => {
      const url = r.url();
      if (SKIN_CHUNK.test(url) || THEMES_CHUNK.test(url) || LEVEL15_CHUNK.test(url)) requests.push({ url, at: Date.now() });
    });
    const errors = await boot(page, { version: 3, skins: { owned: ['roof_slate', 'theme_neon'], equipped: { roof: 'roof_slate', helmet: null, theme: 'theme_neon' } } });
    // the idle preload may have warmed the chunks on the title already (the themed title asks for `themes`);
    // whatever is left is requested by startLevel before the play screen exists
    const started = Date.now();
    const start = page.evaluate(() => window.__towerclash.loadLevel(15, 1));
    await page.waitForFunction(() => window.__towerclash.getScreen() === 'play');
    const playAt = Date.now();
    expect(await start).toBe(true);
    const ground = await page.evaluate(() => {
      const g = document.getElementById('ground') as HTMLCanvasElement;
      return Array.from(g.getContext('2d')!.getImageData(2, 2, 1, 1).data.slice(0, 3));
    });
    const skin = requests.find((r) => SKIN_CHUNK.test(r.url));
    const themes = requests.find((r) => THEMES_CHUNK.test(r.url));
    expect(skin, 'the roof material chunk was requested').toBeDefined();
    expect(themes, 'the themes chunk was requested').toBeDefined();
    expect(skin!.at, 'skin chunk requested before the first play frame').toBeLessThanOrEqual(playAt);
    expect(themes!.at, 'themes chunk requested before the first play frame').toBeLessThanOrEqual(playAt);
    expect(ground, 'the ground layer is already lit by the neon theme').not.toEqual(DEFAULT_LETTERBOX);
    expect(playAt - started, 'the wait for the chunks is short').toBeLessThan(5_000);
    expect(await page.evaluate(() => window.__towerclash.getState()?.levelId)).toBe(15);
    await expect.poll(() => simTime(page)).toBeGreaterThan(200);
    expect(errors).toEqual([]);
  });
});
