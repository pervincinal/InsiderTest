import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { tapRect } from './helpers/tap';
import { expectToast, recordToasts } from './helpers/toasts';

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
// PERF-6: pause menu + result card drawing (src/render/hudOverlays.ts), warmed by the play screen
const OVERLAYS_CHUNK = /\/assets\/hudOverlays-[^/?]*\.js(\?.*)?$/;
// PERF-8: the English strings only the lazy screens / cards draw (src/ui/locales/enMenus.ts), loaded beside them
const EN_MENUS_CHUNK = /\/assets\/enMenus-[^/?]*\.js(\?.*)?$/;
// PERF-10: the level 2–4 tutorial steps + their English hints (src/ui/tutorialSteps.ts), loaded with a first play of those levels
const TUTORIAL_CHUNK = /\/assets\/tutorialSteps-[^/?]*\.js(\?.*)?$/;
// PERF-9: the enemy AI chunk, warmed by the idle preload after the first frame
const AI_CHUNK = /\/assets\/ai-[^/?]*\.js(\?.*)?$/;
// src/render/layout.ts — RESULT.retry
const RESULT_RETRY = { x: 275, y: 780, w: 170, h: 72 };
// src/render/palette.ts — DEFAULT_THEME.waterTop (#3fb6de): what the ground layer's top corner shows without the
// neon theme (BUG-34: the sea covers the margins, the gradient's top colour above the map)
const DEFAULT_SEA_TOP = [63, 182, 222];

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const text = (page: Page, key: string) => page.evaluate((k) => window.__towerclash.getText(k), key);

/** QA-6 boot budgets, per attempt: the document must commit within the first, the debug surface must appear within the second. */
const BOOT_NAV_TIMEOUT_MS = 10_000;
const BOOT_SURFACE_TIMEOUT_MS = 10_000;
const BOOT_ATTEMPTS = 2;

async function boot(page: Page, seeded: Record<string, unknown> = { version: 3 }): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, seeded] as const);
  await recordToasts(page); // QA-20: toasts are asserted from the page-side recorder (e2e/helpers/toasts.ts)
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
    await expectToast(page, await text(page, 'common.loadFailed'), { screen: 'title' });
    // a second tap while still offline re-fetches under a fresh URL (module map) and fails again with the toast
    const before = aborted.length;
    expect(await page.evaluate(() => window.__towerclash.loadLevel(3, 1))).toBe(false);
    expect(aborted.length).toBeGreaterThan(before);
    expect(aborted[aborted.length - 1]).toMatch(/003-[^/?]*\.js\?r=\d+$/);
    await expect.poll(() => screen(page)).toBe('title');
    // the same text while the first pill may still be up: the recorder cannot tell a re-show from the first one,
    // so this holds as much as the one-shot read it replaces did (the `?r=` re-fetch above is the real evidence)
    await expectToast(page, await text(page, 'common.loadFailed'), { screen: 'title' });
    // the rest of the game is untouched: another level still opens
    expect(await page.evaluate(() => window.__towerclash.loadLevel(1, 1))).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await page.evaluate(() => window.__towerclash.startMatch()); // AUD-B11: the lesson card holds the match until a first input
    await expect.poll(() => simTime(page)).toBeGreaterThan(200);
    expect(errors).toEqual([]);

    // Network back: the re-fetch under `?r=` gets through the pinned module-map entry and level 3 opens (BUG-8).
    await page.unroute(LEVEL3_CHUNK);
    const fetched = page.waitForResponse((r) => LEVEL3_CHUNK.test(r.url()) && r.url().includes('?r='));
    expect(await page.evaluate(() => window.__towerclash.loadLevel(3, 1))).toBe(true);
    expect((await fetched).ok()).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    expect(await page.evaluate(() => window.__towerclash.getState()?.levelId)).toBe(3);
    await page.evaluate(() => window.__towerclash.startMatch()); // AUD-B11: the lesson card holds the match until a first input
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
    await expectToast(page, await text(page, 'common.loadFailed'), { screen: 'title' });
    // the debug openShop goes through the same path and resolves (does not hang) on failure;
    // wait out the chunk back-off first so this attempt really issues a `?r=` re-fetch
    await page.waitForTimeout(3_300); // ok: src/lazyChunk.ts RETRY_AFTER_MS = 3000 is a Date.now() back-off, nothing to poll
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

  test('English menu strings chunk (enMenus, PERF-8): PLAY returns to the title with a toast when it fails, no throw; once the network is back the map opens in English', async ({ page }) => {
    const aborted: string[] = [];
    await page.route(EN_MENUS_CHUNK, (route) => {
      aborted.push(route.request().url());
      void route.abort('failed');
    });
    const errors = await boot(page);
    await tapRect(page, TITLE_PLAY);
    // the screens chunk itself may land; without their strings the map is not opened
    await expect.poll(() => screen(page), { timeout: 5_000 }).toBe('title');
    await page.waitForTimeout(300);
    expect(await screen(page)).toBe('title');
    await expectToast(page, await text(page, 'common.loadFailed'), { screen: 'title' });
    await expect.poll(() => aborted.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);

    // Network back: the strings are re-fetched under `?r=` (src/lazyChunk.ts) and the map opens with them.
    await page.unroute(EN_MENUS_CHUNK);
    const fetched = page.waitForResponse((r) => EN_MENUS_CHUNK.test(r.url()) && r.url().includes('?r='), { timeout: 15_000 });
    await tapRect(page, TITLE_PLAY);
    expect((await fetched).ok()).toBe(true);
    await expect.poll(() => screen(page), { timeout: 5_000 }).toBe('levelSelect');
    expect(await text(page, 'levels.title')).toBe('LEVELS');
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
    await page.evaluate(() => window.__towerclash.startMatch()); // AUD-B11: the lesson card holds the match until a first input
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
    // listen first: a draw on the result screen may re-fetch the chunk the moment the route is gone (aborted
    // requests never produce a response, so nothing is caught early)
    const fetched = page.waitForResponse((r) => SKIN_CHUNK.test(r.url()) && r.url().includes('?r='), { timeout: 15_000 });
    await page.unroute(SKIN_CHUNK);
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
    expect(ground, 'the ground layer is already lit by the neon theme').not.toEqual(DEFAULT_SEA_TOP);
    expect(playAt - started, 'the wait for the chunks is short').toBeLessThan(5_000);
    expect(await page.evaluate(() => window.__towerclash.getState()?.levelId)).toBe(15);
    await page.evaluate(() => window.__towerclash.startMatch()); // AUD-B11: the lesson card holds the match until a first input
    await expect.poll(() => simTime(page)).toBeGreaterThan(200);
    expect(errors).toEqual([]);
  });

  test('hudOverlays chunk (PERF-6): with the download failing the result still shows a plain card, no throw; the chunk is re-fetched under `?r=` once the network is back and RETRY works', async ({ page }) => {
    const aborted: string[] = [];
    await page.route(OVERLAYS_CHUNK, (route) => {
      aborted.push(route.request().url());
      void route.abort('failed');
    });
    const errors = await boot(page);
    expect(await page.evaluate(() => window.__towerclash.loadLevel(1, 1))).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    // the play screen warms the chunk right after its first frame (main.ts enterLevel → warmHudOverlays)
    await expect.poll(() => aborted.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => {
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    });
    await expect.poll(() => screen(page), { timeout: 75_000, intervals: [250] }).toBe('result');
    expect((await page.evaluate(() => window.__towerclash.getResult()))?.outcome).toBe('won');
    // the plain card is drawn frame after frame; draw-time retries are throttled (src/lazyChunk.ts RETRY_AFTER_MS),
    // so the result screen asks again once per back-off window — under a fresh URL (module map, BUG-8)
    await expect.poll(() => aborted.filter((u) => u.includes('?r=')).length, { timeout: 8_000 }).toBeGreaterThanOrEqual(1);
    expect(await screen(page)).toBe('result');
    expect(aborted.length).toBeLessThan(30);
    expect(errors).toEqual([]);

    // Network back: the result screen's next draw-time retry lands the real card (BUG-8 recovery), and its RETRY button restarts the level.
    await page.unroute(OVERLAYS_CHUNK);
    const fetched = page.waitForResponse((r) => OVERLAYS_CHUNK.test(r.url()) && r.url().includes('?r='), { timeout: 15_000 });
    expect((await fetched).ok()).toBe(true);
    await page.waitForTimeout(200);
    expect(await screen(page)).toBe('result');
    await tapRect(page, RESULT_RETRY);
    await expect.poll(() => screen(page), { timeout: 5_000 }).toBe('play');
    expect(errors).toEqual([]);
  });

  test('PERF-6 preload: the overlay chunk is fetched once at level start, long before the result; the result never waits and nothing is re-fetched', async ({ page }) => {
    const fetched: { url: string; at: number }[] = [];
    page.on('response', (r) => {
      if (OVERLAYS_CHUNK.test(r.url()) && r.ok()) fetched.push({ url: r.url(), at: Date.now() });
    });
    const errors = await boot(page);
    expect(await page.evaluate(() => window.__towerclash.loadLevel(1, 1))).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await expect.poll(() => fetched.length, { timeout: 5_000, message: 'overlay chunk warmed after the first play frame' }).toBe(1);
    const warmedAt = fetched[0]!.at;
    await page.evaluate(() => {
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    });
    await expect.poll(() => screen(page), { timeout: 75_000, intervals: [250] }).toBe('result');
    const resultAt = Date.now();
    expect(fetched, 'exactly one fetch, no `?r=` re-fetch').toHaveLength(1);
    expect(fetched[0]!.url).not.toContain('?r=');
    expect(warmedAt, 'the chunk landed before the result screen opened').toBeLessThan(resultAt);
    expect(errors).toEqual([]);
  });

  test('tutorialSteps chunk (PERF-10): not fetched at boot or for level 5; a first play of level 2 fetches it before its first frame and shows its hint', async ({ page }) => {
    const requests: string[] = [];
    let aiAt = 0;
    page.on('request', (r) => {
      if (TUTORIAL_CHUNK.test(r.url())) requests.push(r.url());
      if (AI_CHUNK.test(r.url()) && !aiAt) aiAt = Date.now();
    });
    const errors = await boot(page);
    // the idle preload after the first frame (current level 1: its level chunk, the AI) has run
    await expect.poll(() => aiAt, { message: 'idle preload ran (AI chunk requested)', timeout: 10_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(300); // ok: the same whenIdle callback issues every preload; a short grace for the last one
    expect(requests, 'no tutorialSteps request on the title').toEqual([]);
    // a level without a tutorial (and its next-level preload, 6) does not need the chunk either
    expect(await page.evaluate(() => window.__towerclash.loadLevel(5, 1))).toBe(true);
    await page.evaluate(() => window.__towerclash.startMatch()); // AUD-B11: the lesson card holds the match until a first input
    await expect.poll(() => simTime(page)).toBeGreaterThan(200);
    expect(requests, 'no tutorialSteps request for level 5').toEqual([]);
    // first play of level 2: the chunk is requested by the start, before the play screen exists
    const start = page.evaluate(() => window.__towerclash.loadLevel(2, 1));
    await page.waitForFunction(() => window.__towerclash.getState()?.levelId === 2);
    expect(requests.length, 'tutorialSteps requested by the level 2 start').toBe(1);
    expect(await start).toBe(true);
    await page.evaluate(() => window.__towerclash.startMatch()); // AUD-B11: the bubble shows once the card is gone
    await expect.poll(() => page.evaluate(() => window.__towerclash.getTutorialHint())).toBe(await text(page, 'tutorial.tapThenGrey'));
    expect(await text(page, 'tutorial.tapThenGrey')).not.toBe('tutorial.tapThenGrey');
    expect(requests, 'fetched once').toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('tutorialSteps chunk (PERF-10): a failed download starts level 3 without its tutorial, no throw; the tutorial comes up once the chunk lands', async ({ page }) => {
    const aborted: string[] = [];
    await page.route(TUTORIAL_CHUNK, (route) => {
      aborted.push(route.request().url());
      void route.abort('failed');
    });
    const errors = await boot(page);
    expect(await page.evaluate(() => window.__towerclash.loadLevel(3, 1)), 'the level starts anyway (the tutorial is not load-bearing)').toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    expect(aborted.length).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => window.__towerclash.startMatch()); // AUD-B11: the lesson card holds the match until a first input
    await expect.poll(() => simTime(page)).toBeGreaterThan(200);
    expect(await page.evaluate(() => window.__towerclash.getTutorialHint()), 'no tutorial while the chunk is missing').toBeNull();
    // network back: the play screen retries after the src/lazyChunk.ts back-off (3 s), under `?r=` (module map, BUG-8)
    await page.evaluate(() => window.__towerclash.setSpeed(0.2)); // keep step 1 (tap your tower, then a grey one) relevant
    const fetched = page.waitForResponse((r) => TUTORIAL_CHUNK.test(r.url()) && r.url().includes('?r='), { timeout: 15_000 });
    await page.unroute(TUTORIAL_CHUNK);
    expect((await fetched).ok()).toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.__towerclash.getTutorialHint()), { message: 'the tutorial shows once the chunk is in', timeout: 5_000 })
      .toBe(await text(page, 'tutorial.tapThenGrey'));
    expect(await screen(page)).toBe('play');
    expect(errors).toEqual([]);
  });
});
