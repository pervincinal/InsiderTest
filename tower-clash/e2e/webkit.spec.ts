import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clientPoint, tapRect } from './helpers/tap';
import type { Rect } from './helpers/tap';
import { recordToasts, toastsSeen } from './helpers/toasts';
import { IPHONE_UA, WEBKIT_RUNS, WEBKIT_SKIP_REASON } from './tools/webkit';

/*
 * AUD-Q5 (2026-10-31): the WebKit subset. The game ships first inside iOS WKWebView, and until this file
 * every automated run was Chromium. Runs only in the `webkit-iphone` Playwright project
 * (playwright.config.ts: Playwright's WebKit, 430 × 932 CSS px, DPR 3, touch, mobile viewport, the iOS
 * Safari UA of e2e/gestures430.spec.ts) — CI job `e2e (webkit)` with `PW_WEBKIT=1`. In this container
 * WebKit is not installed, so the tests are listed and skipped (e2e/tools/webkit.ts); `PW_WEBKIT=1`
 * forbids the skip.
 *
 * Five fast tests, each a path the Chromium projects already cover, re-run on the shipping engine:
 *   1. boot: the project really is the phone, the map lies inside the simulated safe-area insets
 *      (e2e/webview.spec.ts math), the PWA manifest / icons / sw.js / iOS meta tags are served;
 *   2. level 1 by touch (real `touchscreen.tap`s, which must reach the game as Pointer Events of type
 *      touch — src/input/pointer.ts listens to nothing else): title → level map → level 1; the lesson card
 *      holds the match until the first touch (AUD-B11); home → camp streams and the garrison holds; then
 *      the reference player wins (seed 1) → result screen, stars saved;
 *   3. the lesson-card hold through the debug surface (`startMatch` semantics, AUD-B11);
 *   4. Settings → Text size 150 % (AUD-U2): persisted, redrawn bigger, kept across a reload;
 *   5. the share card (SHARE-1): win level 1 → SHARE → one 1080 × 1350 PNG handed to `navigator.share`.
 * Tests 3–5 tap with the suite's shared helpers (e2e/helpers/tap.ts, mouse pointer), so a gap in WebKit's
 * touch emulation shows up in test 2 alone and does not hide the rest.
 *
 * Audio: WebKit on Linux plays through GStreamer, not iOS's audio stack. The game guards its AudioContext
 * (src/audio/synth.ts: creation and resume() in try / catch, a missing constructor is "no audio"), so an
 * uncaught exception is a game bug and fails the test; console errors from the Linux media backend are
 * recorded as annotations instead (AUDIO_BACKEND below), every other console error fails.
 *
 * Like smoke.spec.ts this file imports nothing from src/ (Node's native TS loader cannot import the
 * JSON-backed level index); hit regions are mirrored with a pointer to their source of truth.
 */

const SAVE_KEY = 'towerclash.save.v3';
/** The stakeholder's phone class (e2e/gestures430.spec.ts PHONE): Dynamic Island / home-indicator insets. */
const PHONE = { w: 430, h: 932, dpr: 3, safe: { top: 59, bottom: 34 } };
// src/sim/constants.ts — MAP_W / MAP_H (logical canvas)
const MAP = { w: 720, h: 1280 };
// src/render/layout.ts — TITLE.play / TITLE.settings, LEVEL_MAP + levelNodeRect, RESULT.shareInline
const TITLE_PLAY = { x: 180, y: 640, w: 360, h: 96 };
const TITLE_SETTINGS = { x: 180, y: 776, w: 172, h: 64 };
const LEVEL_MAP = { nodeR: 46, top: 260, step: 150, amp: 185, period: 5 };
function levelNodeRect(index: number): Rect {
  const cx = 360 + LEVEL_MAP.amp * Math.sin((index * Math.PI * 2) / LEVEL_MAP.period);
  const cy = LEVEL_MAP.top + index * LEVEL_MAP.step;
  const r = LEVEL_MAP.nodeR;
  return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
}
const RESULT_SHARE = { x: 230, y: 874, w: 260, h: 62 };
/**
 * src/render/menuLayout.ts SETTINGS.labelX / SETTINGS.textSize (the 100 / 125 / 150 % control,
 * render/widgets.ts TEXT_SCALES), read from the source text: the settings rows move whenever a row is
 * added above them (FE-14, AUD-U2, AUD-F6), and the build under test is built from the same tree.
 */
const SETTINGS = (() => {
  const src = readFileSync(new URL('../src/render/menuLayout.ts', import.meta.url), 'utf8');
  const block = /export const SETTINGS = Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(src)?.[1] ?? '';
  const labelX = /\n {2}labelX: (\d+),/.exec(block);
  const r = /\n {2}textSize: \{ x: (\d+), y: (\d+), w: (\d+), h: (\d+) \}/.exec(block);
  if (!labelX || !r) throw new Error('src/render/menuLayout.ts: SETTINGS.labelX / SETTINGS.textSize not found — update webkit.spec.ts');
  return { labelX: Number(labelX[1]), textSize: { x: Number(r[1]), y: Number(r[2]), w: Number(r[3]), h: Number(r[4]) } };
})();
const TEXT_SIZES = [1, 1.25, 1.5] as const;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

interface LevelJson {
  id: number;
  name: string;
  towers: { id: string; x: number; y: number; owner: string }[];
}
const LEVELS_DIR = new URL('../src/levels/', import.meta.url);
const LEVEL1_FILE = readdirSync(LEVELS_DIR)
  .filter((f) => /^001-.*\.json$/.test(f))
  .sort()[0]!;
const LEVEL1 = JSON.parse(readFileSync(new URL(LEVEL1_FILE, LEVELS_DIR), 'utf8')) as LevelJson;

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const levelId = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.levelId ?? -1);
const hint = (page: Page) => page.evaluate(() => window.__towerclash.getTutorialHint());
const towerUnits = (page: Page, id: string) => page.evaluate((tid) => window.__towerclash.getState()?.towers[tid]?.units ?? -1, id);
const playerLinks = (page: Page) =>
  page.evaluate(() =>
    (window.__towerclash.getState()?.links ?? []).filter((l) => l.owner === 'player').map((l) => ({ from: l.from, to: l.to })),
  );
const savedSettings = (page: Page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? ((JSON.parse(raw) as { settings?: { textScale?: number } }).settings ?? null) : null;
  }, SAVE_KEY);
/** The pointer events the canvas saw since the last call, `down:<pointerType>` / `up:<pointerType>`. */
const pointerLog = (page: Page) => page.evaluate(() => (window as unknown as { __pointerLog?: string[] }).__pointerLog?.splice(0) ?? null);

/** Touch-tap a layout point of the current screen once it has painted — a real touchstart / touchend. */
async function touchAt(page: Page, lx: number, ly: number): Promise<void> {
  const c = await clientPoint(page, lx, ly);
  await page.touchscreen.tap(c.x, c.y);
}
const touchRect = (page: Page, r: Rect) => touchAt(page, r.x + r.w / 2, r.y + r.h / 2);

/** Segment `i` of a `drawSegmented` control (4 px inset, equal widths), as smoke.spec.ts taps it. */
function segment(r: Rect, count: number, i: number): Rect {
  const segW = (r.w - 8) / count;
  return { x: r.x + 4 + i * segW, y: r.y, w: segW, h: r.h };
}

/**
 * Linux WebKit's media backend (GStreamer) may complain on the console where iOS would not; none of it is
 * game code. Anything else on the console is an error of the game.
 */
const AUDIO_BACKEND = /gstreamer|audiocontext|audio ?(sink|device|output)|pulseaudio|alsa/i;

interface Errors {
  page: string[];
  console: string[];
}

/** Errors the game produced, after moving media-backend console lines into annotations. */
function gameErrors(errors: Errors): Errors {
  const backend = errors.console.filter((m) => AUDIO_BACKEND.test(m));
  for (const m of backend) test.info().annotations.push({ type: 'webkit-audio-backend', description: m });
  return { page: errors.page, console: errors.console.filter((m) => !AUDIO_BACKEND.test(m)) };
}

/**
 * Seed the save (or not), simulate the safe-area insets on `#app` before src/main.ts boots (the same
 * custom properties index.html derives from env(); headless WebKit has no notch), log the canvas's
 * pointer events, record toasts, boot to the title.
 */
async function boot(page: Page, save: Record<string, unknown> | null = null): Promise<Errors> {
  const errors: Errors = { page: [], console: [] };
  page.on('pageerror', (err) => errors.page.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.console.push(msg.text());
  });
  await page.addInitScript(
    ([key, data, safe]) => {
      if (data) localStorage.setItem(key, JSON.stringify(data));
      const log: string[] = [];
      (window as unknown as { __pointerLog: string[] }).__pointerLog = log;
      for (const type of ['pointerdown', 'pointerup'] as const) {
        window.addEventListener(type, (e) => log.push(`${type.slice(7)}:${e.pointerType}`), { capture: true });
      }
      const apply = (): boolean => {
        const app = document.getElementById('app');
        if (!app) return false;
        app.style.setProperty('--safe-top', `${safe.top}px`);
        app.style.setProperty('--safe-bottom', `${safe.bottom}px`);
        return true;
      };
      // The init script runs before the parser has inserted #app; module scripts run after parsing.
      if (!apply()) {
        new MutationObserver((_, obs) => {
          if (apply()) obs.disconnect();
        }).observe(document, { childList: true, subtree: true });
      }
    },
    [SAVE_KEY, save, PHONE.safe] as const,
  );
  await recordToasts(page);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.getScreen === 'function');
  await expect.poll(() => screen(page)).toBe('title');
  return errors;
}

/** Reference player at ×10 on level 1, seed 1 (`npm run playtest` verifies the win) → the result screen. */
async function winLevel1(page: Page): Promise<void> {
  await page.evaluate(() => {
    void window.__towerclash.loadLevel(1, 1);
    window.__towerclash.setSpeed(10);
    window.__towerclash.autoplay();
  });
  await expect.poll(() => screen(page), { timeout: 75_000, intervals: [250] }).toBe('result');
  expect((await page.evaluate(() => window.__towerclash.getResult()))?.outcome).toBe('won');
}

/** Web Share stubs (as share.spec.ts): canShare accepts files, share() records the payload and decodes the PNG. */
function stubWebShare(page: Page): Promise<void> {
  return page.addInitScript(() => {
    const w = window as unknown as { __share: unknown; __shareCalls: number };
    w.__share = null;
    w.__shareCalls = 0;
    const canShare = (d?: ShareData) => !!d && (d.files === undefined || d.files.length > 0);
    const share = async (d?: ShareData) => {
      w.__shareCalls += 1;
      const f = d?.files?.[0] ?? null;
      let head: number[] | null = null;
      let dims: { w: number; h: number } | null = null;
      if (f) {
        head = Array.from(new Uint8Array(await f.arrayBuffer()).slice(0, 8));
        const bmp = await createImageBitmap(f);
        dims = { w: bmp.width, h: bmp.height };
      }
      w.__share = { title: d?.title, text: d?.text, files: d?.files?.length ?? 0, type: f?.type ?? null, name: f?.name ?? null, head, dims };
    };
    Object.defineProperty(Navigator.prototype, 'canShare', { value: canShare, configurable: true, writable: true });
    Object.defineProperty(Navigator.prototype, 'share', { value: share, configurable: true, writable: true });
  });
}

/**
 * The game canvas's device pixels over a layout rect of the current screen, read inside a frame, kept
 * page-side under `slot`; returns the mean absolute channel difference to the capture already in
 * `against` (or 0 when `against` is omitted).
 */
function captureRect(page: Page, r: Rect, slot: string, against?: string): Promise<number> {
  return page.evaluate(
    ([x, y, w, h, s, a]) =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => {
          const c = document.getElementById('game') as HTMLCanvasElement;
          const box = c.getBoundingClientRect();
          const p0 = window.__towerclash.layoutToClient(x, y);
          const p1 = window.__towerclash.layoutToClient(x + w, y + h);
          const sx = c.width / box.width;
          const px = Math.round((p0.x - box.left) * sx);
          const py = Math.round((p0.y - box.top) * sx);
          const pw = Math.max(1, Math.round((p1.x - p0.x) * sx));
          const ph = Math.max(1, Math.round((p1.y - p0.y) * sx));
          const data = c.getContext('2d')!.getImageData(px, py, pw, ph).data;
          const store = window as unknown as Record<string, Uint8ClampedArray | undefined>;
          store[`__px_${s}`] = data;
          const ref = a ? store[`__px_${a}`] : undefined;
          if (!ref || ref.length !== data.length) return resolve(0);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += Math.abs(data[i]! - ref[i]!);
          resolve(sum / data.length);
        }),
      ),
    [r.x, r.y, r.w, r.h, slot, against ?? ''] as const,
  );
}

test.describe('Tower Clash on WebKit, iPhone-class screen (AUD-Q5)', () => {
  test.skip(!WEBKIT_RUNS, WEBKIT_SKIP_REASON);

  test('boots as the phone: WebKit, iPhone UA, 430×932 at DPR 3, touch; the map inside the safe-area insets; the PWA manifest, icons, sw.js and iOS meta tags are served', async ({ page, browserName }) => {
    expect(browserName, 'the webkit-iphone project must run Playwright WebKit').toBe('webkit');
    const errors = await boot(page);

    const env = await page.evaluate(() => ({
      ua: navigator.userAgent,
      w: innerWidth,
      h: innerHeight,
      dpr: devicePixelRatio,
      touch: navigator.maxTouchPoints > 0 || 'ontouchstart' in window,
      safeTop: getComputedStyle(document.getElementById('app')!).getPropertyValue('--safe-top').trim(),
      safeBottom: getComputedStyle(document.getElementById('app')!).getPropertyValue('--safe-bottom').trim(),
    }));
    expect(env.ua).toBe(IPHONE_UA);
    expect({ w: env.w, h: env.h, dpr: env.dpr, touch: env.touch }).toEqual({ w: PHONE.w, h: PHONE.h, dpr: PHONE.dpr, touch: true });
    expect([env.safeTop, env.safeBottom], 'simulated insets in place').toEqual([`${PHONE.safe.top}px`, `${PHONE.safe.bottom}px`]);

    // Letterbox expected from the viewport — mirrors src/render/view.ts resize() (as e2e/webview.spec.ts).
    const usableW = Math.max(env.w / 2, env.w);
    const usableH = Math.max(env.h / 2, env.h - PHONE.safe.top - PHONE.safe.bottom);
    const scale = Math.min(usableW / MAP.w, usableH / MAP.h);
    const topLeft = await page.evaluate(() => window.__towerclash.toClient(0, 0));
    const bottomRight = await page.evaluate(([w, h]) => window.__towerclash.toClient(w, h), [MAP.w, MAP.h] as const);
    expect(topLeft.y, 'map top clears the Dynamic Island inset').toBeGreaterThanOrEqual(PHONE.safe.top);
    expect(bottomRight.y, 'map bottom clears the home-indicator inset').toBeLessThanOrEqual(env.h - PHONE.safe.bottom);
    expect(Math.abs(topLeft.x - (usableW - MAP.w * scale) / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(topLeft.y - (Math.min(PHONE.safe.top, env.h - usableH) + (usableH - MAP.h * scale) / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(bottomRight.x - topLeft.x - MAP.w * scale)).toBeLessThanOrEqual(1);
    expect(Math.abs(bottomRight.y - topLeft.y - MAP.h * scale)).toBeLessThanOrEqual(1);
    const box = await page.locator('canvas#game').boundingBox();
    expect(box?.width).toBe(PHONE.w);

    // PWA / home-screen plumbing, as Safari reads it (smoke.spec.ts (a2)).
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();
    const manifestRes = await page.request.get(new URL(manifestHref!, page.url()).href);
    expect(manifestRes.status()).toBe(200);
    const manifest = (await manifestRes.json()) as { name: string; display: string; icons: { src: string }[] };
    expect(manifest.name).toBe('Tower Clash');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      const res = await page.request.get(new URL(icon.src, manifestRes.url()).href);
      expect(res.status(), `icon ${icon.src}`).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    }
    const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect((await page.request.get(new URL(touchIcon!, page.url()).href)).status(), 'apple-touch-icon').toBe(200);
    expect((await page.request.get('/sw.js')).status()).toBe(200);
    expect(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content')).toBe('yes');
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');

    const own = gameErrors(errors);
    expect(own.page).toEqual([]);
    expect(own.console).toEqual([]);
  });

  test('touch: title → level map → level 1; the lesson card holds until the first touch; home → camp streams; the reference player wins → result', async ({ page }) => {
    const errors = await boot(page);

    // (1) first touch of the session: PLAY. It must arrive as a Pointer Event of type touch (the only
    //     input src/input/pointer.ts reads), and it is the gesture that unlocks WebAudio (main.ts).
    expect(await pointerLog(page)).toEqual([]);
    await touchRect(page, TITLE_PLAY);
    await expect
      .poll(() => pointerLog(page).then((l) => l?.filter((e) => e.startsWith('down:'))), {
        message: 'WebKit must turn a touchscreen tap into pointerdown (pointerType touch)',
      })
      .toEqual(['down:touch']);
    await expect.poll(() => screen(page), { message: 'PLAY must react to a touch tap' }).toBe('levelSelect');
    expect(gameErrors(errors).page, 'no uncaught exception on the audio-unlocking first touch').toEqual([]);

    // (2) the level map opens on level 1 on a fresh save; touch the first node.
    expect(await page.evaluate(() => window.__towerclash.getLevelSelectScroll())).toBe(0);
    await touchRect(page, levelNodeRect(0));
    await expect.poll(() => screen(page), { message: 'the level node must react to a touch tap' }).toBe('play');
    expect(await levelId(page)).toBe(1);

    // (3) AUD-B11: the lesson card holds the match — sim time 0, no tutorial bubble — until the first touch.
    await page.waitForTimeout(800);
    expect(await simTime(page), 'held by the lesson card').toBe(0);
    expect(await hint(page), 'no tutorial bubble while the lesson card is up').toBeNull();

    // (4) level 1's lesson by touch: home (starts the held match and selects) → camp (stream).
    const home = LEVEL1.towers.find((t) => t.id === 'home')!;
    const camp = LEVEL1.towers.find((t) => t.id === 'camp')!;
    expect(home.owner).toBe('player');
    await touchAt(page, home.x, home.y);
    await expect.poll(() => simTime(page), { message: 'the first touch on the map starts the held match' }).toBeGreaterThan(0);
    await expect.poll(() => hint(page), { message: 'touching home selects it' }).toBe('Now tap the grey tower — the stream keeps flowing');
    await touchAt(page, camp.x, camp.y);
    await expect.poll(() => playerLinks(page), { message: 'touching camp starts one stream' }).toEqual([{ from: 'home', to: 'camp' }]);
    await expect.poll(() => page.evaluate(() => window.__towerclash.getState()?.units.length ?? 0), { message: 'units marching' }).toBeGreaterThan(0);
    // rules v3 (GDD §2.0b item 4): a streaming tower keeps its garrison over 2 s of sim time
    const held = await page.evaluate(() => {
      const s = window.__towerclash.getState()!;
      return { units: s.towers['home']!.units, time: s.time };
    });
    await expect.poll(() => simTime(page)).toBeGreaterThanOrEqual(held.time + 2000);
    expect(await towerUnits(page, 'home'), 'a streaming tower keeps its garrison: no drain, no growth').toBe(held.units);

    // (5) the reference player wins level 1 from the authored opening (seed 1) → result, stars saved.
    await winLevel1(page);
    const result = await page.evaluate(() => window.__towerclash.getResult());
    expect(result?.stars).toBeGreaterThanOrEqual(1);
    const stars = await page.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? '{}') as { stars?: Record<string, number> }).stars?.['1'], SAVE_KEY);
    expect(stars).toBe(result!.stars);
    const enemyOwned = await page.evaluate(() => Object.values(window.__towerclash.getState()!.towers).filter((t) => t.owner.startsWith('enemy')).length);
    expect(enemyOwned, 'no enemy tower left').toBe(0);

    const own = gameErrors(errors);
    expect(own.page).toEqual([]);
    expect(own.console).toEqual([]);
  });

  test('lesson-card hold (AUD-B11): loadLevel holds the match at sim time 0, startMatch() releases it; false with no level up', async ({ page }) => {
    const errors = await boot(page);
    expect(await page.evaluate(() => window.__towerclash.startMatch()), 'no level up on the title').toBe(false);
    expect(await page.evaluate(() => window.__towerclash.loadLevel(1, 1))).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await page.waitForTimeout(600);
    expect(await simTime(page), 'held: no tick before the first input').toBe(0);
    expect(await hint(page)).toBeNull();
    expect(await page.evaluate(() => window.__towerclash.startMatch())).toBe(true);
    await expect.poll(() => simTime(page), { message: 'startMatch() releases the hold' }).toBeGreaterThan(0);
    await expect.poll(() => hint(page), { message: 'level 1 tutorial after the card' }).toBe('Tap your tower');
    const own = gameErrors(errors);
    expect(own.page).toEqual([]);
    expect(own.console).toEqual([]);
  });

  test('Settings → Text size 150 % (AUD-U2): saved, the row redrawn bigger, kept across a reload; 100 % restores it', async ({ page }) => {
    const errors = await boot(page);
    await tapRect(page, TITLE_SETTINGS);
    await expect.poll(() => screen(page)).toBe('settings');
    const label: Rect = { x: SETTINGS.labelX, y: SETTINGS.textSize.y - 8, w: SETTINGS.textSize.x - SETTINGS.labelX - 8, h: SETTINGS.textSize.h + 16 };
    await page.waitForTimeout(300); // ok: let the screen's entry frame settle before the reference capture
    await captureRect(page, label, 'at100');
    expect(await captureRect(page, label, 'still', 'at100'), 'the settings card is a still frame').toBeLessThan(0.5);

    await tapRect(page, segment(SETTINGS.textSize, TEXT_SIZES.length, 2));
    await expect.poll(async () => (await savedSettings(page))?.textScale, { message: 'Text size 150 % is saved' }).toBe(1.5);
    await expect
      .poll(() => captureRect(page, label, 'at150', 'at100'), { message: 'the "Text size" label is redrawn at 150 %' })
      .toBeGreaterThan(2);

    await page.reload();
    await page.waitForFunction(() => typeof window.__towerclash?.getScreen === 'function');
    await expect.poll(() => screen(page)).toBe('title');
    expect((await savedSettings(page))?.textScale, 'kept across a reload').toBe(1.5);
    await tapRect(page, TITLE_SETTINGS);
    await expect.poll(() => screen(page)).toBe('settings');
    await tapRect(page, segment(SETTINGS.textSize, TEXT_SIZES.length, 0));
    await expect.poll(async () => (await savedSettings(page))?.textScale).toBe(1);

    const own = gameErrors(errors);
    expect(own.page).toEqual([]);
    expect(own.console).toEqual([]);
  });

  test('share card (SHARE-1): win level 1 → SHARE → navigator.share gets one 1080×1350 PNG named for the level; toast "Shared"', async ({ page }) => {
    await stubWebShare(page);
    const errors = await boot(page, { version: 3 });
    await winLevel1(page);
    await page.waitForTimeout(900); // ok: the result card's slide-in (wall clock) before the tap, as share.spec.ts
    await tapRect(page, RESULT_SHARE);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __share: unknown }).__share != null), { timeout: 15_000 }).toBe(true);
    const cap = await page.evaluate(
      () =>
        (window as unknown as { __share: { title?: string; text?: string; files: number; type: string | null; name: string | null; head: number[] | null; dims: { w: number; h: number } | null } })
          .__share,
    );
    expect(cap.files).toBe(1);
    expect(cap.type).toBe('image/png');
    expect(cap.name).toBe('towerclash-level-01.png');
    expect(cap.head).toEqual(PNG_SIGNATURE);
    expect(cap.dims, 'the share card is drawn at full size on WebKit').toEqual({ w: 1080, h: 1350 });
    expect(cap.title).toBe('Tower Clash');
    expect(cap.text).toContain(LEVEL1.name);
    expect(await page.evaluate(() => (window as unknown as { __shareCalls: number }).__shareCalls)).toBe(1);
    const last = await page.evaluate(() => window.__towerclash.lastShare);
    expect(last).toMatchObject({ result: 'shared', name: 'towerclash-level-01.png', type: 'image/png', width: 1080, height: 1350 });
    expect(last!.bytes).toBeGreaterThan(20_000);
    await expect.poll(() => toastsSeen(page), { message: 'the "Shared" toast went up' }).toContain('Shared');
    expect(await screen(page)).toBe('result');

    const own = gameErrors(errors);
    expect(own.page).toEqual([]);
    expect(own.console).toEqual([]);
  });
});
