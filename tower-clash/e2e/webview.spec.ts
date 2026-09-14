import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Android WebView emulation (QA-1). Runs only in the `android-webview` Playwright project
 * (playwright.config.ts: Pixel 7 metrics, `; wv)` user agent, isMobile + hasTouch) — `npm run e2e:webview`.
 *
 * What the Capacitor shell needs from the web build, checked here without a device:
 *   1. safe areas — the canvas letterbox must sit inside `env(safe-area-inset-*)`. The insets are
 *      simulated by setting the same CSS custom properties index.html derives from env() on `#app`
 *      before the game boots (addInitScript), because headless Chromium has no notch;
 *   2. touch input — title → level select → level 1 → send units, every tap a real touch
 *      (`page.touchscreen.tap`), and the first touch unlocks WebAudio without a console error;
 *   3. hardware back button — `window.__towerclash.back()` is the hook the native bridge calls:
 *      pause during play, second press to the level map, then title, then unhandled (app exits);
 *   4. background — `visibilitychange` → hidden freezes the sim, and it stays frozen until the
 *      player resumes (never auto-resume into a lost game).
 *
 * Like smoke.spec.ts this file imports nothing from src/ (Node's native TS loader cannot import the
 * JSON-backed level index); hit regions are mirrored with a pointer to their source of truth.
 */

/** Simulated insets: Pixel-class status bar and gesture navigation bar. */
const SAFE = { top: 44, bottom: 34 };
// src/sim/constants.ts — MAP_W / MAP_H (logical canvas)
const MAP = { w: 720, h: 1280 };
// src/render/layout.ts — TITLE.play, LEVEL_MAP + levelNodeRect, PAUSE.resume
const TITLE_PLAY = { x: 180, y: 640, w: 360, h: 96 };
const LEVEL_MAP = { nodeR: 46, top: 260, step: 150, amp: 185, period: 5 };
function levelNodeRect(index: number, scroll = 0): { x: number; y: number; w: number; h: number } {
  const cx = 360 + LEVEL_MAP.amp * Math.sin((index * Math.PI * 2) / LEVEL_MAP.period);
  const cy = LEVEL_MAP.top + index * LEVEL_MAP.step - scroll;
  const r = LEVEL_MAP.nodeR;
  return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
}
const PAUSE_RESUME = { x: 210, y: 566, w: 300, h: 76 };

interface LevelJson {
  id: number;
  towers: { id: string; x: number; y: number; owner: string }[];
}
const LEVELS_DIR = new URL('../src/levels/', import.meta.url);
const LEVEL1_FILE = readdirSync(LEVELS_DIR)
  .filter((f) => /^001-.*\.json$/.test(f))
  .sort()[0]!;
const LEVEL1 = JSON.parse(readFileSync(new URL(LEVEL1_FILE, LEVELS_DIR), 'utf8')) as LevelJson;

const SHOTS = fileURLToPath(new URL('./__screenshots__/', import.meta.url));
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}webview-${name}.png`, scale: 'css' });

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const levelId = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.levelId ?? -1);
const hint = (page: Page) => page.evaluate(() => window.__towerclash.getTutorialHint());
const towerUnits = (page: Page, id: string) =>
  page.evaluate((tid) => window.__towerclash.getState()?.towers[tid]?.units ?? -1, id);
const toClient = (page: Page, lx: number, ly: number) =>
  page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [lx, ly] as const);

/** Touch-tap a logical (720×1280) point — a real touchstart/touchend, not a synthetic mouse click. */
async function touchAt(page: Page, lx: number, ly: number): Promise<void> {
  const c = await toClient(page, lx, ly);
  await page.touchscreen.tap(c.x, c.y);
}
const touchRect = (page: Page, r: { x: number; y: number; w: number; h: number }) => touchAt(page, r.x + r.w / 2, r.y + r.h / 2);

/** Sim time must not move over a short wall-clock window. */
async function expectSimFrozen(page: Page, why: string): Promise<number> {
  const t = await simTime(page);
  await page.waitForTimeout(300);
  expect(await simTime(page), why).toBe(t);
  return t;
}

interface Errors {
  console: string[];
  page: string[];
}

/**
 * Install the simulated safe-area insets on `#app` before src/main.ts boots (the game reads them
 * once in createView → resize), collect errors, open the title screen.
 */
async function boot(page: Page): Promise<Errors> {
  const errors: Errors = { console: [], page: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.console.push(msg.text());
  });
  page.on('pageerror', (err) => errors.page.push(String(err)));
  await page.addInitScript((safe) => {
    const apply = (): boolean => {
      const app = document.getElementById('app');
      if (!app) return false;
      app.style.setProperty('--safe-top', `${safe.top}px`);
      app.style.setProperty('--safe-bottom', `${safe.bottom}px`);
      return true;
    };
    // The init script runs before the document has a body: wait for the parser to insert #app.
    // Module scripts (src/main.ts) execute after parsing, so the vars are in place before boot.
    if (!apply()) {
      new MutationObserver((_, obs) => {
        if (apply()) obs.disconnect();
      }).observe(document, { childList: true, subtree: true });
    }
  }, SAFE);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.getScreen === 'function');
  await expect.poll(() => screen(page)).toBe('title');
  return errors;
}

/** Start level 1 on a fixed seed through the debug surface (no taps) and wait until the sim ticks. */
async function startLevel1(page: Page): Promise<void> {
  expect(await page.evaluate(() => window.__towerclash.loadLevel(1, 1))).toBe(true);
  await expect.poll(() => screen(page)).toBe('play');
  expect(await levelId(page)).toBe(1);
  const t0 = await simTime(page);
  await expect.poll(() => simTime(page), { message: 'sim must tick after loadLevel' }).toBeGreaterThan(t0);
}

test.describe('Tower Clash in an Android WebView', () => {
  test('boots with the WebView UA and lays the map out inside the safe-area insets', async ({ page }) => {
    const errors = await boot(page);

    // the project is wired as intended: WebView UA, touch, mobile viewport
    const env = await page.evaluate(() => ({
      ua: navigator.userAgent,
      touchPoints: navigator.maxTouchPoints,
      w: window.innerWidth,
      h: window.innerHeight,
      safeTop: getComputedStyle(document.getElementById('app')!).getPropertyValue('--safe-top').trim(),
      safeBottom: getComputedStyle(document.getElementById('app')!).getPropertyValue('--safe-bottom').trim(),
    }));
    expect(env.ua, 'Android WebView marker').toContain('; wv)');
    expect(env.ua).toContain('Android');
    expect(env.touchPoints).toBeGreaterThan(0);
    expect(env.safeTop, 'simulated inset must be in place').toBe(`${SAFE.top}px`);
    expect(env.safeBottom).toBe(`${SAFE.bottom}px`);

    // Letterbox expected from the viewport — mirrors src/render/view.ts resize().
    const usableW = Math.max(env.w / 2, env.w);
    const usableH = Math.max(env.h / 2, env.h - SAFE.top - SAFE.bottom);
    const scale = Math.min(usableW / MAP.w, usableH / MAP.h);
    const expectedX = (usableW - MAP.w * scale) / 2;
    const expectedY = Math.min(SAFE.top, env.h - usableH) + (usableH - MAP.h * scale) / 2;

    const topLeft = await toClient(page, 0, 0);
    const bottomRight = await toClient(page, MAP.w, MAP.h);
    // map edges never enter the insets …
    expect(topLeft.y, 'map top must clear the status-bar inset').toBeGreaterThanOrEqual(SAFE.top);
    expect(bottomRight.y, 'map bottom must clear the navigation-bar inset').toBeLessThanOrEqual(env.h - SAFE.bottom);
    expect(topLeft.x).toBeGreaterThanOrEqual(0);
    expect(bottomRight.x).toBeLessThanOrEqual(env.w);
    // … and the map is centred inside the safe box, not the raw viewport (this is what fails when
    // the insets are ignored: the top gap would be SAFE.top - SAFE.bottom smaller than the bottom gap)
    const topGap = topLeft.y - SAFE.top;
    const bottomGap = env.h - SAFE.bottom - bottomRight.y;
    expect(Math.abs(topGap - bottomGap), `top gap ${topGap} vs bottom gap ${bottomGap}`).toBeLessThanOrEqual(1);
    expect(Math.abs(topLeft.x - expectedX)).toBeLessThanOrEqual(1);
    expect(Math.abs(topLeft.y - expectedY)).toBeLessThanOrEqual(1);
    expect(Math.abs(bottomRight.x - topLeft.x - MAP.w * scale)).toBeLessThanOrEqual(1);
    expect(Math.abs(bottomRight.y - topLeft.y - MAP.h * scale)).toBeLessThanOrEqual(1);

    await page.waitForTimeout(250);
    await shot(page, 'title-safe-area');
    expect(errors.page).toEqual([]);
    expect(errors.console).toEqual([]);
  });

  test('touch: title → level select → level 1 → send units; first touch unlocks audio without errors', async ({ page }) => {
    const errors = await boot(page);

    // (1) first touch of the session: PLAY. This is the gesture that creates/resumes the
    //     AudioContext (canvas pointerdown → unlockAudio); a WebView that refuses must not throw.
    await touchRect(page, TITLE_PLAY);
    await expect.poll(() => screen(page), { message: 'PLAY must react to a touch tap' }).toBe('levelSelect');
    expect(errors.page, 'no uncaught exception on the audio-unlocking first touch').toEqual([]);
    expect(errors.console, 'no console error on the audio-unlocking first touch').toEqual([]);

    // (2) level map opens on level 1 on a fresh save; touch the first node.
    expect(await page.evaluate(() => window.__towerclash.getLevelSelectScroll())).toBe(0);
    await touchRect(page, levelNodeRect(0));
    await expect.poll(() => screen(page), { message: 'level node must react to a touch tap' }).toBe('play');
    expect(await levelId(page)).toBe(1);
    const t0 = await simTime(page);
    await expect.poll(() => simTime(page)).toBeGreaterThan(t0);
    expect(await hint(page)).toBe('Tap your tower');

    // (3) level 1's lesson by touch: home → camp sends units.
    const home = LEVEL1.towers.find((t) => t.id === 'home')!;
    const camp = LEVEL1.towers.find((t) => t.id === 'camp')!;
    expect(home.owner).toBe('player');
    const garrisonBefore = await towerUnits(page, 'home');
    expect(garrisonBefore).toBeGreaterThan(0);
    await touchAt(page, home.x, home.y);
    await expect.poll(() => hint(page), { message: 'touching the home tower selects it' }).toBe('Now tap the grey tower');
    await touchAt(page, camp.x, camp.y);
    await expect.poll(() => hint(page), { message: 'touching the target sends' }).toBeNull();
    await expect.poll(() => towerUnits(page, 'home'), { message: 'home garrison drops after the send' }).toBeLessThan(garrisonBefore);
    await expect
      .poll(() => page.evaluate(() => window.__towerclash.getState()?.units.length ?? 0), { message: 'units marching' })
      .toBeGreaterThan(0);
    await shot(page, 'play-touch');

    expect(errors.page).toEqual([]);
    expect(errors.console).toEqual([]);
  });

  test('back button: pauses during play, then level map, then title, then unhandled', async ({ page }) => {
    const errors = await boot(page);
    await startLevel1(page);
    const back = () => page.evaluate(() => window.__towerclash.back());

    // 1st press while playing: handled, sim frozen, tutorial hidden, still on the play screen
    expect(await back(), 'back during play must be handled').toBe(true);
    await expectSimFrozen(page, 'first back press must pause the sim');
    expect(await screen(page)).toBe('play');
    expect(await hint(page), 'tutorial hint is hidden while paused').toBeNull();
    await shot(page, 'back-paused');

    // 2nd press while paused: leave to the level map, play state dropped
    expect(await back(), 'back while paused must be handled').toBe(true);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    expect(await page.evaluate(() => window.__towerclash.getState())).toBeNull();

    // level map → title, title → unhandled (false lets the shell close the app)
    expect(await back()).toBe(true);
    await expect.poll(() => screen(page)).toBe('title');
    expect(await back(), 'back on the title is unhandled so the OS may exit').toBe(false);
    expect(await screen(page)).toBe('title');

    expect(errors.page).toEqual([]);
    expect(errors.console).toEqual([]);
  });

  test('visibilitychange → hidden pauses the sim and it stays paused until the player resumes', async ({ page }) => {
    const errors = await boot(page);
    await startLevel1(page);

    // Go to the background: shadow document.hidden / visibilityState and fire the event (headless
    // Chromium cannot actually hide the page, and the game only looks at `document.hidden`).
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const pausedAt = await expectSimFrozen(page, 'hidden tab must freeze the sim');
    expect(await screen(page)).toBe('play');

    // Come back: still paused (no auto-resume — the player decides when to continue) …
    await page.evaluate(() => {
      Reflect.deleteProperty(document, 'hidden');
      Reflect.deleteProperty(document, 'visibilityState');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await page.evaluate(() => document.hidden)).toBe(false);
    await expectSimFrozen(page, 'returning to the foreground must not auto-resume');

    // … and RESUME on the pause menu continues from where it stopped, by touch.
    await touchRect(page, PAUSE_RESUME);
    await expect.poll(() => simTime(page), { message: 'RESUME continues the sim' }).toBeGreaterThan(pausedAt);
    expect(await screen(page)).toBe('play');

    expect(errors.page).toEqual([]);
    expect(errors.console).toEqual([]);
  });
});
