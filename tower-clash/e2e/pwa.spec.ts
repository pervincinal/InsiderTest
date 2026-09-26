import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

/*
 * QA-8: the PWA offline path — public/sw.js (precache of the app shell + cache-first runtime cache
 * for ./assets/*) under a real service-worker registration. Runs only in the `pwa` Playwright
 * project (`npm run e2e:pwa`): `serviceWorkers: 'allow'`, its own output folder, and `retries: 1` —
 * the one project in the suite with a retry, because BUG-16 is a headless-Chromium main-thread
 * stall on a worker-routed lazy chunk `import()` (~1 per 500 boots, not game or spec logic) that
 * the rest of the suite avoids by blocking the worker; here the worker is the thing under test, so
 * a stalled boot is retried once instead of failing the run. Every step still carries its own bound
 * (actionTimeout / navigationTimeout 20 s from the config, polls ≤ 20 s, the whole test 60 s), so a
 * stall fails fast and names its step; the retry is never a cover for a red assertion.
 *
 * Offline (`goOffline`): the worker's network attempts are cut with `context.route('**\/*', abort)`
 * and `context.setOffline(true)` sets `navigator.onLine` and cuts the page's own direct requests.
 * Both reach the worker target only when Playwright has attached a network manager to it, i.e.
 * with `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` at browser launch (playwright.config.ts
 * sets it); without it every request the worker's fetch handler forwards to the network still
 * reaches the preview server (measured 2026-09-26: a never-cached chunk fetched through the worker
 * came back 200 "offline") and this spec would prove nothing, so it refuses to run without the flag.
 * `setOffline` alone is not enough either: Chromium drops the worker's emulated network conditions
 * on every navigation of the controlled page (measured: a direct worker `fetch` fails right after
 * `setOffline(true)`, succeeds again after the next `page.goto`, fails again once re-applied, and so
 * on), whereas the route's Fetch-domain interception survives navigations — and the page's own
 * navigation and cached subresources still resolve from the worker's cache with the route on, since
 * a request the worker answers from Cache Storage never reaches the network layer.
 *
 * One test, four steps that build on the same registration:
 *  1. first launch: the worker registers, `navigator.serviceWorker.ready` resolves, the page is
 *     claimed, and the single `towerclash-*` cache holds every PRECACHE entry of public/sw.js
 *     (index.html, manifest, icons, fonts — the list is read from the file, not copied here).
 *  2. second launch (online): the document and everything after it go through the worker's
 *     cache-first handler, so the entry chunk `assets/index-*.js`, the level-1 chunk and the lazy
 *     screens (idle preloads, src/main.ts `preloadLazy`) land in the runtime cache.
 *     BUG-18: after the *first* launch alone the entry chunk is not cached — it was fetched before
 *     the worker claimed the page and PRECACHE does not list it — so a player who opened the game
 *     once and went offline gets the cached index.html with no script. Until public/sw.js precaches
 *     the entry chunk this spec warms it with the second launch; once fixed, move the entry-chunk
 *     assertion into step 1 and drop the second launch.
 *  3. offline: reload → the title renders from the cache, `navigator.onLine` is false, level 1
 *     starts from the cached chunk and the sim advances; a reload while still offline boots again;
 *     a level whose chunk was never fetched (level 3 — level 2 is preloaded when level 1 starts, so
 *     3 is the first cold one) fails gracefully: `loadLevel` resolves false, the title is current,
 *     the game's own toast (`common.loadFailed`, src/main.ts `chunkFailed`) is on screen, and no
 *     uncaught error reached `window.onerror`.
 *  4. back online: the same level loads on the next tap through the `?r=` re-fetch (BUG-8 path,
 *     src/lazyChunk.ts) and its chunk is now in the runtime cache.
 */

test.use({ serviceWorkers: 'allow' });

const SAVE_KEY = 'towerclash.save.v3';
const ENTRY_CHUNK = /^\/assets\/index-[^/]+\.js$/;
const LEVEL1_CHUNK = /^\/assets\/001-[^/]+\.js$/;
const MENU_CHUNK = /^\/assets\/lazyScreens-[^/]+\.js$/;
/** The first level no boot / level-1 start preloads (see the header). */
const COLD_LEVEL = 3;
const COLD_CHUNK = /\/assets\/003-[^/?]*\.js(\?.*)?$/;

/** public/sw.js PRECACHE, as cache-key pathnames ('./' → '/', './index.html' → '/index.html'). */
const SW_SOURCE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const PRECACHE = [...(/const PRECACHE = \[([\s\S]*?)\];/.exec(SW_SOURCE)?.[1] ?? '').matchAll(/'\.\/([^']*)'/g)].map((m) => `/${m[1]}`);

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const levelId = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.levelId ?? -1);
const toast = (page: Page) => page.evaluate(() => window.__towerclash.getToast());
const text = (page: Page, key: string) => page.evaluate((k) => window.__towerclash.getText(k), key);
const onLine = (page: Page) => page.evaluate(() => navigator.onLine);
const controlled = (page: Page) => page.evaluate(() => navigator.serviceWorker.controller !== null);
/** Every Cache Storage cache and the pathnames it holds. */
const cachedPaths = (page: Page) =>
  page.evaluate(async () => {
    const out: Record<string, string[]> = {};
    for (const key of await caches.keys()) out[key] = (await (await caches.open(key)).keys()).map((r) => new URL(r.url).pathname);
    return out;
  });
/** `navigator.serviceWorker.ready` under an explicit bound (`page.evaluate` has none of its own). */
const swReady = (page: Page, timeoutMs: number) =>
  page.evaluate(
    (ms) =>
      Promise.race([
        navigator.serviceWorker.ready.then((r) => r.scope),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error(`serviceWorker.ready did not resolve in ${ms} ms`)), ms)),
      ]),
    timeoutMs,
  );

/** Cut the network for the worker (route abort, survives navigations) and the page (`setOffline`, also `navigator.onLine`). */
async function goOffline(context: BrowserContext): Promise<void> {
  await context.route('**/*', (route) => route.abort('internetdisconnected'));
  await context.setOffline(true);
}

async function goOnline(context: BrowserContext): Promise<void> {
  await context.setOffline(false);
  await context.unroute('**/*');
}

/** Navigate to the title. `page.goto` is bounded by the config's navigationTimeout; the surface poll by its own 10 s. */
async function navigate(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function', undefined, { timeout: 10_000 });
  await expect.poll(() => screen(page)).toBe('title');
}

test.describe('PWA offline (QA-8)', () => {
  test.setTimeout(60_000);

  test('first launch precaches the shell; the game boots and plays level 1 offline; a cold level chunk fails with the offline toast and loads once back online', async ({ page, context }, testInfo) => {
    expect(process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS, 'worker network emulation flag (playwright.config.ts)').toBeTruthy();
    expect(testInfo.project.use.serviceWorkers, 'run this spec in the pwa project').toBe('allow');
    expect(PRECACHE.length, 'PRECACHE parsed from public/sw.js').toBeGreaterThanOrEqual(5);
    expect(PRECACHE).toContain('/index.html');

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, { version: 3 }] as const);

    let cacheName = '';
    await test.step('1. first launch: the worker registers and precaches the shell', async () => {
      await navigate(page);
      expect(await swReady(page, 20_000)).toBe(new URL('/', page.url()).href);
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 20_000 });
      const caches = await cachedPaths(page);
      expect(Object.keys(caches)).toHaveLength(1);
      cacheName = Object.keys(caches)[0]!;
      expect(cacheName).toMatch(/^towerclash-v\d+$/);
      for (const p of PRECACHE) expect(caches[cacheName], `precached ${p}`).toContain(p);
      expect(pageErrors).toEqual([]);
    });

    let entryChunk = '';
    await test.step('2. second launch: the entry chunk and the idle preloads go through the worker into the runtime cache', async () => {
      entryChunk = await page.evaluate(() => new URL(document.querySelector('script[type="module"][src]')!.getAttribute('src')!, location.href).pathname);
      expect(entryChunk).toMatch(ENTRY_CHUNK);
      await navigate(page);
      expect(await controlled(page)).toBe(true);
      await expect
        .poll(async () => (await cachedPaths(page))[cacheName] ?? [], { timeout: 20_000 })
        .toEqual(expect.arrayContaining([entryChunk, expect.stringMatching(LEVEL1_CHUNK), expect.stringMatching(MENU_CHUNK)]));
      expect(pageErrors).toEqual([]);
    });

    await test.step('3. offline: the title and level 1 come from the cache; a cold level chunk fails with the toast', async () => {
      await goOffline(context);
      await navigate(page);
      expect(await onLine(page)).toBe(false);
      expect(await controlled(page)).toBe(true);
      expect(await page.evaluate(() => window.__towerclash.loadLevel(1, 1))).toBe(true);
      await expect.poll(() => screen(page)).toBe('play');
      expect(await levelId(page)).toBe(1);
      await expect.poll(() => simTime(page)).toBeGreaterThan(200);
      expect(pageErrors).toEqual([]);

      // still offline: the shell boots again, and the cold chunk's network attempt fails in the worker
      const failed: string[] = [];
      context.on('requestfailed', (r) => {
        if (COLD_CHUNK.test(r.url()) && r.serviceWorker()) failed.push(r.failure()?.errorText ?? 'unknown');
      });
      await navigate(page);
      expect(await page.evaluate((id) => window.__towerclash.loadLevel(id, 1), COLD_LEVEL)).toBe(false);
      await expect.poll(() => screen(page)).toBe('title');
      expect(await page.evaluate(() => window.__towerclash.getState())).toBeNull();
      expect(await toast(page)).toBe(await text(page, 'common.loadFailed'));
      expect(failed.length, 'the worker tried the network for the cold chunk').toBeGreaterThanOrEqual(1);
      expect(failed.every((e) => e === 'net::ERR_INTERNET_DISCONNECTED'), `refused offline: ${failed.join(', ')}`).toBe(true);
      expect(pageErrors).toEqual([]);
    });

    await test.step('4. back online: the cold level loads on the next tap and its chunk is cached', async () => {
      await goOnline(context);
      expect(await onLine(page)).toBe(true);
      const refetch = page.waitForResponse((r) => COLD_CHUNK.test(r.url()) && r.url().includes('?r='), { timeout: 15_000 });
      expect(await page.evaluate((id) => window.__towerclash.loadLevel(id, 1), COLD_LEVEL)).toBe(true);
      expect((await refetch).ok()).toBe(true);
      await expect.poll(() => screen(page)).toBe('play');
      expect(await levelId(page)).toBe(COLD_LEVEL);
      await expect.poll(() => simTime(page)).toBeGreaterThan(0);
      await expect
        .poll(async () => (await cachedPaths(page))[cacheName] ?? [], { timeout: 15_000 })
        .toEqual(expect.arrayContaining([expect.stringMatching(/^\/assets\/003-[^/]+\.js$/)]));
      expect(pageErrors).toEqual([]);
    });
  });
});
