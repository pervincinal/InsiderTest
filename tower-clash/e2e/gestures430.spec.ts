import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { clientPoint, hudClientPoint } from './helpers/tap';

/*
 * QA-22: the gesture regression net for the real-device fixes, on the stakeholder's phone class —
 * an iPhone 17 Pro Max-like screen (430 × 932 CSS px, DPR 3, touch, mobile viewport) with its Dynamic
 * Island / home-indicator insets simulated the way e2e/fullBleed.spec.ts does (the `--safe-top` /
 * `--safe-bottom` custom properties index.html derives from env()). Every gesture is REAL touch input:
 * raw CDP `Input.dispatchTouchEvent` touchStart / touchMove / touchEnd / touchCancel, so the page sees
 * touch events (the canvas swallows them non-passively) and the pointer events Chromium derives from
 * them, as on a phone — one or two fingers.
 *
 *   BUG-33  drag own tower → tower links; a swipe from empty ground (or a foreign tower) across an own
 *           stream cuts it live, even as a fast flick of one to three move events; a drag that starts
 *           on an own tower never cuts; a `pointercancel` mid-drag finishes the drag where the finger
 *           last was; the level 2 tutorial's stop step clears on a cut, and a step nobody completes
 *           gives way after 20 s (src/ui/tutorial.ts TUTORIAL_STEP_TIMEOUT_MS).
 *   BUG-34  the pause button and MENU sit on the bands anchored to the safe edges and take taps there.
 *   BUG-35  the gold rubber band runs from the tower to the finger during a drag (getDrag(), and the
 *           pixels on the canvas), snaps on a reachable tower, and is gone on release; a drag onto an
 *           own full tower is refused with `hint.full` and links nothing.
 *   and their interplay: a drag from one own tower across another own tower's stream (band up, nothing
 *   cut, nothing linked on empty ground), a drag released on empty ground, two fingers at once.
 *
 * Coordinates come from the level JSON (never imported from src/, see smoke.spec.ts); texts from the
 * running page (`getText`); every touch point is converted inside a requestAnimationFrame
 * (e2e/helpers/tap.ts), except the flicks, whose points are converted up front so the whole gesture
 * reaches the page back to back, as a real flick does. Seeds are fixed; the only wall-clock part is
 * when a touch lands, and every assertion is an immediate consequence of it.
 */

const SAVE_KEY = 'towerclash.save.v3';
const SEED = 1;
const PHONE = { viewport: { width: 430, height: 932 }, safe: { top: 59, bottom: 34 }, dpr: 3 };
/**
 * src/render/view.ts DPR_CAP.native: the iOS / Android shell backs its canvases at DPR 2 (the browser
 * build at 2.5). `?dprcap=2` gives this browser page the backing store the stakeholder's TestFlight
 * build has on the same DPR-3 phone.
 */
const NATIVE_DPR_CAP = 2;
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
// src/render/layout.ts — HUD (layout coordinates; the bands move, these do not)
const HUD = { pause: { x: 636, y: 18, w: 66, h: 60 }, menu: { x: 586, y: 1196, w: 116, h: 64 }, streams: { x: 18, y: 1196, w: 200, h: 64 } };
// src/render/layout.ts — BOOSTERS.overdrive (bottom band); src/economy — OVERDRIVE costs 30 gold
const OVERDRIVE = { x: 232, y: 1186, w: 66, h: 88 };
/** src/sim/constants.ts CAPACITY[2] × FORTRESS_CAPACITY_MUL: a level-2 fortress (its top level) holds 75. */
const FORTRESS_L2_CAPACITY = 75;

interface LevelJson {
  id: number;
  towers: { id: string; x: number; y: number; owner: string }[];
}
const level = (file: string) => JSON.parse(readFileSync(new URL(`../src/levels/${file}.json`, import.meta.url), 'utf8')) as LevelJson;
const LEVELS = { 2: level('002-supply-line'), 8: level('008-two-bases'), 49: level('049-last-light') } as const;
function towerAt(levelId: keyof typeof LEVELS, id: string): XY {
  const t = LEVELS[levelId].towers.find((tw) => tw.id === id);
  if (!t) throw new Error(`level ${levelId} has no tower "${id}"`);
  return { x: t.x, y: t.y };
}

interface XY {
  x: number;
  y: number;
}
interface LinkRef {
  from: string;
  to: string;
}

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const hint = (page: Page) => page.evaluate(() => window.__towerclash.getTutorialHint());
const drag = (page: Page) => page.evaluate(() => window.__towerclash.getDrag());
const text = (page: Page, key: string) => page.evaluate((k) => window.__towerclash.getText(k), key);
const playerLinks = (page: Page) =>
  page.evaluate(() =>
    (window.__towerclash.getState()?.links ?? [])
      .filter((l) => l.owner === 'player')
      .map((l) => ({ from: l.from, to: l.to }))
      .sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to)),
  );
const sorted = (links: LinkRef[]) => [...links].sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));
const tower = (page: Page, id: string) =>
  page.evaluate((tid) => {
    const t = window.__towerclash.getState()?.towers[tid];
    return t ? { owner: t.owner, level: t.level, units: t.units } : null;
  }, id);
/** Every refusal bubble the page showed (`getLimitHint`), recorded page-side: a bubble lives 900 ms of wall clock. */
const limitHintsSeen = (page: Page) => page.evaluate(() => (window as unknown as { __limitHints?: string[] }).__limitHints ?? null);

/** Log the pointer events the page receives (`down:<id>:<type>`, `up:…`, `cancel:…`), to prove what the touch sequence became. */
const recordPointers = (page: Page) =>
  page.evaluate(() => {
    const log: string[] = [];
    (window as unknown as { __pointerLog: string[] }).__pointerLog = log;
    for (const type of ['pointerdown', 'pointerup', 'pointercancel'] as const) {
      window.addEventListener(type, (e) => log.push(`${type.slice(7)}:${e.pointerId}:${e.pointerType}`), { capture: true });
    }
  });
/** The pointer events logged since the last call. */
const pointerLog = (page: Page) => page.evaluate(() => (window as unknown as { __pointerLog: string[] }).__pointerLog.splice(0));

/**
 * Up to two fingers on the touchscreen, driven with raw CDP touch events. touchStart / touchMove carry
 * every point that is down (a new id is pressed, a known one moves); touchEnd carries the point lifted.
 */
class Fingers {
  private readonly down = new Map<number, XY>();
  private readonly page: Page;
  private readonly cdp: CDPSession;

  constructor(page: Page, cdp: CDPSession) {
    this.page = page;
    this.cdp = cdp;
  }

  private async send(type: 'touchStart' | 'touchMove' | 'touchCancel'): Promise<void> {
    const touchPoints = type === 'touchCancel' ? [] : [...this.down].map(([id, p]) => ({ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 }));
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }

  /** Put finger `id` down on logical `l` (client point read after a painted frame). */
  async start(l: XY, id = 1): Promise<void> {
    this.down.set(id, await clientPoint(this.page, l.x, l.y));
    await this.send('touchStart');
  }

  async moveTo(l: XY, id = 1): Promise<void> {
    this.down.set(id, await clientPoint(this.page, l.x, l.y));
    await this.send('touchMove');
  }

  /** Slide finger `id` from `a` to `b` in `steps` frame-synced touchMoves (logical points). */
  async slide(a: XY, b: XY, steps = 8, id = 1): Promise<void> {
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      await this.moveTo({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, id);
    }
  }

  /**
   * Lift finger `id`. Chromium's CDP handler releases the points a touchEnd LISTS (an empty list
   * releases all of them) — measured: touchEnd listing the finger that stays down lifted that one —
   * so only the lifted finger's point goes in.
   */
  async end(id = 1): Promise<void> {
    const p = this.down.get(id);
    if (!p) throw new Error(`finger ${id} is not down`);
    this.down.delete(id);
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 }] });
  }

  /** The platform takes the whole touch sequence away (iOS: a system gesture / scroll) → `pointercancel`. */
  async cancel(): Promise<void> {
    this.down.clear();
    await this.send('touchCancel');
  }

  /**
   * A fast flick: touchStart on `a`, `moves` touchMoves evenly spaced to `b`, touchEnd — all client
   * points converted first (one painted frame), then dispatched back to back with no frame in between.
   */
  async flick(a: XY, b: XY, moves: number): Promise<void> {
    const pts: XY[] = [];
    for (let i = 0; i <= moves; i++) {
      const k = i / moves;
      pts.push(await clientPoint(this.page, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k));
    }
    const tp = (p: XY) => [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]!) });
    for (const p of pts.slice(1)) await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(p) });
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  /**
   * Slide finger `id` from logical `a` (a point of the world) onto the centre of play-HUD rect `r` where
   * it is drawn (BUG-34: the bands are anchored to the safe edges), in `steps` touchMoves interpolated
   * in client px (BUG-36: a gesture that ends over a HUD button).
   */
  async slideToHud(a: XY, r: { x: number; y: number; w: number; h: number }, steps = 8, id = 1): Promise<void> {
    const from = await clientPoint(this.page, a.x, a.y);
    const to = await hudClientPoint(this.page, r.x + r.w / 2, r.y + r.h / 2);
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      this.down.set(id, { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
      await this.send('touchMove');
    }
  }

  /** Put finger `id` down on the centre of play-HUD rect `r` where it is drawn. */
  async startOnHud(r: { x: number; y: number; w: number; h: number }, id = 1): Promise<void> {
    this.down.set(id, await hudClientPoint(this.page, r.x + r.w / 2, r.y + r.h / 2));
    await this.send('touchStart');
  }

  /** Slide finger `id`, now on a HUD rect, onto logical world point `b` in `steps` client-px touchMoves. */
  async slideFromHudTo(b: XY, steps = 8, id = 1): Promise<void> {
    const from = this.down.get(id);
    if (!from) throw new Error(`finger ${id} is not down`);
    const to = await clientPoint(this.page, b.x, b.y);
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      this.down.set(id, { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
      await this.send('touchMove');
    }
  }

  /** A touch tap on a play-HUD rect where it is drawn (BUG-34: the bands are anchored to the safe edges). */
  async tapHud(r: { x: number; y: number; w: number; h: number }): Promise<void> {
    const c = await hudClientPoint(this.page, r.x + r.w / 2, r.y + r.h / 2);
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 9, radiusX: 4, radiusY: 4, force: 1 }] });
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
}

/**
 * Gold rubber-band pixels on the game canvas along the middle half of the segment a → b (logical):
 * 41 samples, each counted when it reads as the band's gold (palette `gold` #ffcf3f / `goldShade`
 * #e0a300, drawn at 70 % alpha while it follows the finger). The band is dashed (16 on / 14 off) and
 * its dashes crawl, so some samples always fall in a gap; a painted band yields well over a handful.
 */
function goldAlong(page: Page, a: XY, b: XY): Promise<number> {
  return page.evaluate(
    ([ax, ay, bx, by]) =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => {
          const c = document.getElementById('game') as HTMLCanvasElement;
          const ctx = c.getContext('2d')!;
          const r = c.getBoundingClientRect();
          let n = 0;
          for (let i = 0; i <= 40; i++) {
            const k = 0.25 + (0.5 * i) / 40;
            const p = window.__towerclash.toClient(ax + (bx - ax) * k, ay + (by - ay) * k);
            const px = Math.round(((p.x - r.left) * c.width) / r.width);
            const py = Math.round(((p.y - r.top) * c.height) / r.height);
            const [R, G, B, A] = ctx.getImageData(px, py, 1, 1).data;
            if (A! > 100 && R! > 170 && G! > 120 && G! < 225 && B! < 110 && R! - B! > 100) n++;
          }
          resolve(n);
        }),
      ),
    [a.x, a.y, b.x, b.y] as const,
  );
}

/** Seed the save, simulate the insets, record refusal bubbles, boot to the title. Returns the page-error sink. */
async function boot(page: Page, save: Record<string, unknown> | null): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.addInitScript(
    ([key, data, inset]) => {
      if (data) localStorage.setItem(key, JSON.stringify(data));
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
      // refusal bubbles (link limit / blocked / empty / full) live 900 ms: record them page-side
      const seen: string[] = [];
      (window as unknown as { __limitHints: string[] }).__limitHints = seen;
      let prev: string | null = null;
      setInterval(() => {
        const h = (window as { __towerclash?: { getLimitHint?: () => string | null } }).__towerclash?.getLimitHint?.() ?? null;
        if (h !== null && h !== prev) seen.push(h);
        prev = h;
      }, 16);
    },
    [SAVE_KEY, save, PHONE.safe] as const,
  );
  await page.goto(`/?dprcap=${NATIVE_DPR_CAP}`);
  await page.waitForFunction(() => typeof window.__towerclash?.getDrag === 'function');
  await expect.poll(() => screen(page)).toBe('title');
  return errors;
}

async function startLevel(page: Page, id: number): Promise<void> {
  expect(await page.evaluate(([lid, seed]) => window.__towerclash.loadLevel(lid, seed), [id, SEED] as const), `loadLevel(${id})`).toBe(true);
  await expect.poll(() => screen(page)).toBe('play');
  expect(await page.evaluate(() => window.__towerclash.getState()?.levelId)).toBe(id);
  await expect.poll(() => simTime(page), { message: `level ${id} sim should tick` }).toBeGreaterThan(0);
}

/** Levels 1–3 cleared: no tutorial on level 2 (the tutorial test boots a fresh save instead). */
const CLEARED = { version: 3, gold: 0, stars: { '1': 3, '2': 3, '3': 3 } };

test.describe('touch gestures on a 430×932 iPhone-class screen, DPR 3, safe insets (QA-22: BUG-33 / BUG-34 / BUG-35)', () => {
  test.use({ viewport: PHONE.viewport, deviceScaleFactor: PHONE.dpr, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });

  test('the screen really is the phone: 430×932 CSS px at DPR 3, the map letterboxed, the canvas backed like the native shell (DPR 2)', async ({ page }) => {
    const errors = await boot(page, CLEARED);
    expect(await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, touch: navigator.maxTouchPoints > 0 }))).toEqual({
      w: 430,
      h: 932,
      dpr: 3,
      touch: true,
    });
    const top = await page.evaluate(() => window.__towerclash.toClient(0, 0));
    expect(top.x).toBeCloseTo(0, 0);
    expect(top.y, 'the 9:16 map sits below the Dynamic Island inset').toBeGreaterThan(PHONE.safe.top);
    expect(await page.evaluate(() => (document.getElementById('game') as HTMLCanvasElement).width), 'canvas backed at the native DPR cap').toBe(430 * NATIVE_DPR_CAP);
    expect(errors).toEqual([]);
  });

  test('BUG-35 × BUG-33: drag home → mid shows the gold band (state and pixels), snaps on mid, links on release; a drag released on empty ground links nothing', async ({ page }) => {
    const errors = await boot(page, CLEARED);
    await startLevel(page, 2);
    const f = new Fingers(page, await page.context().newCDPSession(page));
    const home = towerAt(2, 'home');
    const mid = towerAt(2, 'mid');
    const empty = { x: home.x + 150, y: (home.y + mid.y) / 2 };

    // (a) drag to empty ground and let go there: the band follows the finger, nothing is linked
    expect(await goldAlong(page, home, empty), 'no band before the drag').toBe(0);
    await f.start(home);
    expect(await drag(page), 'a press alone is not a drag').toBeNull();
    await f.slide(home, empty, 8);
    await expect.poll(() => drag(page), { message: 'over empty ground the band ends at the finger' }).toEqual({
      fromId: 'home',
      x: expect.closeTo(empty.x, 0),
      y: expect.closeTo(empty.y, 0),
      hoverTowerId: null,
    });
    await expect.poll(() => goldAlong(page, home, empty), { message: 'the band is painted gold between home and the finger' }).toBeGreaterThanOrEqual(5);
    await f.end();
    await expect.poll(() => drag(page), { message: 'the band is gone once the finger lifts' }).toBeNull();
    await page.waitForTimeout(200); // four sim ticks: a link would have landed
    expect(await playerLinks(page), 'released on empty ground: no stream').toEqual([]);
    expect(await limitHintsSeen(page), 'released on empty ground: no refusal either').toEqual([]);
    await expect.poll(() => goldAlong(page, home, empty), { message: 'the band is no longer painted' }).toBe(0);

    // (b) drag home → mid: the band snaps on mid while the finger is still down, the release links
    await f.start(home);
    await f.slide(home, empty, 4);
    await expect.poll(() => drag(page)).toMatchObject({ fromId: 'home', hoverTowerId: null });
    await f.slide(empty, mid, 6);
    await expect.poll(() => drag(page), { message: 'over mid the band snaps onto it' }).toMatchObject({ fromId: 'home', hoverTowerId: 'mid' });
    await expect.poll(() => goldAlong(page, home, mid), { message: 'the snapped band is painted from home to mid' }).toBeGreaterThanOrEqual(5);
    expect(await playerLinks(page), 'nothing links before the finger lifts').toEqual([]);
    await f.end();
    await expect.poll(() => playerLinks(page), { message: 'release on mid opens home → mid' }).toEqual([{ from: 'home', to: 'mid' }]);
    expect(await drag(page)).toBeNull();
    expect(await screen(page)).toBe('play');
    expect(errors).toEqual([]);
  });

  test('BUG-33: a touchCancel mid-drag finishes the drag where the finger last was — over mid it links, over empty ground nothing; a cancelled swipe keeps its cut', async ({ page }) => {
    const errors = await boot(page, CLEARED);
    await startLevel(page, 2);
    const f = new Fingers(page, await page.context().newCDPSession(page));
    const home = towerAt(2, 'home');
    const mid = towerAt(2, 'mid');
    const empty = { x: home.x + 150, y: (home.y + mid.y) / 2 };

    await f.start(home);
    await f.slide(home, empty, 6);
    await expect.poll(() => drag(page)).toMatchObject({ fromId: 'home', hoverTowerId: null });
    await f.cancel();
    await expect.poll(() => drag(page), { message: 'the cancel clears the band' }).toBeNull();
    await page.waitForTimeout(200);
    expect(await playerLinks(page), 'cancelled over empty ground: no stream').toEqual([]);

    await recordPointers(page);
    await f.start(home);
    await f.slide(home, mid, 8);
    await expect.poll(() => drag(page)).toMatchObject({ fromId: 'home', hoverTowerId: 'mid' });
    await f.cancel();
    await expect.poll(() => playerLinks(page), { message: 'cancelled over mid: the drag still links home → mid' }).toEqual([{ from: 'home', to: 'mid' }]);
    expect((await pointerLog(page)).map((e) => e.replace(/:\d+:/, ':')), 'the touchCancel reached the page as a pointercancel, not a pointerup').toEqual(['down:touch', 'cancel:touch']);
    expect(await drag(page)).toBeNull();

    // a swipe that the platform cancels after it crossed the stream: the cut already happened, nothing comes back
    const y = Math.round((home.y + mid.y) / 2);
    await f.start({ x: home.x - 160, y });
    await f.slide({ x: home.x - 160, y }, { x: home.x + 160, y }, 6);
    await expect.poll(() => playerLinks(page), { message: 'the swipe cuts live' }).toEqual([]);
    await f.cancel();
    await page.waitForTimeout(200);
    expect(await playerLinks(page), 'the cancel neither re-links nor un-cuts').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('BUG-33: swipes across the stream cut it — slow, and as 1-, 2- and 3-move flicks, from empty ground or a neutral tower; a drag that starts on the own tower never cuts', async ({ page }) => {
    const errors = await boot(page, CLEARED);
    await startLevel(page, 2);
    const f = new Fingers(page, await page.context().newCDPSession(page));
    const home = towerAt(2, 'home');
    const mid = towerAt(2, 'mid');
    const side = towerAt(2, 'side');
    expect(home.x).toBe(mid.x); // the home → mid lane is vertical
    const y = Math.round((home.y + mid.y) / 2);
    const left = { x: home.x - 160, y };
    const right = { x: home.x + 160, y };
    const link = async (why: string) => {
      await f.start(home);
      await f.slide(home, mid, 8);
      await f.end();
      await expect.poll(() => playerLinks(page), { message: why }).toEqual([{ from: 'home', to: 'mid' }]);
    };

    await link('drag home → mid links');
    // a drag that starts on the own tower and runs along / beside its stream and off to the side: a drag, never a cut
    await f.start(home);
    await f.slide(home, { x: home.x + 6, y }, 4);
    await f.slide({ x: home.x + 6, y }, left, 6);
    await expect.poll(() => drag(page), { message: 'from the own tower it is a drag (band up)' }).toMatchObject({ fromId: 'home' });
    await f.end();
    await page.waitForTimeout(200);
    expect(await playerLinks(page), 'a drag from the own tower across its own stream cuts nothing').toEqual([{ from: 'home', to: 'mid' }]);

    // slow swipe from empty ground: cut live, before the finger lifts
    await f.start(left);
    await f.slide(left, right, 8);
    await expect.poll(() => playerLinks(page), { message: 'the slow swipe cuts live' }).toEqual([]);
    await f.end();

    for (const moves of [1, 2, 3]) {
      await link(`re-link before the ${moves}-move flick`);
      await f.flick(right, left, moves);
      await expect.poll(() => playerLinks(page), { message: `a ${moves}-move flick across the stream cuts it` }).toEqual([]);
    }

    // a swipe that starts on a neutral tower (side) is a swipe too
    await link('re-link before the swipe from side');
    const past = { x: 100, y: 900 };
    await f.start(side);
    await f.slide(side, past, 8);
    await expect.poll(() => playerLinks(page), { message: 'a swipe from the neutral tower across the stream cuts it' }).toEqual([]);
    await f.end();
    expect(await drag(page), 'a swipe never shows the band').toBeNull();
    expect(errors).toEqual([]);
  });

  test('BUG-33 × BUG-35 with two own towers (level 8): a drag from homeW across homeE\'s stream shows the band and cuts nothing; released on nE it links; one swipe cuts both streams', async ({ page }) => {
    const errors = await boot(page, CLEARED);
    await startLevel(page, 8);
    const f = new Fingers(page, await page.context().newCDPSession(page));
    const homeW = towerAt(8, 'homeW');
    const homeE = towerAt(8, 'homeE');
    const nE = towerAt(8, 'nE');

    await f.start(homeE);
    await f.slide(homeE, nE, 8);
    await f.end();
    await expect.poll(() => playerLinks(page), { message: 'homeE → nE' }).toEqual([{ from: 'homeE', to: 'nE' }]);

    // homeW → empty ground on the far side of homeE's stream (the path crosses the lane at y ≈ 1026)
    const beyond = { x: 650, y: 1000 };
    await f.start(homeW);
    await f.slide(homeW, beyond, 10);
    await expect.poll(() => drag(page), { message: 'the band follows the finger past the other stream' }).toEqual({
      fromId: 'homeW',
      x: expect.closeTo(beyond.x, 0),
      y: expect.closeTo(beyond.y, 0),
      hoverTowerId: null,
    });
    expect(await playerLinks(page), 'crossing the own stream mid-drag cuts nothing').toEqual([{ from: 'homeE', to: 'nE' }]);
    await f.end();
    await page.waitForTimeout(200);
    expect(await playerLinks(page), 'released on empty ground: no new stream, homeE → nE intact').toEqual([{ from: 'homeE', to: 'nE' }]);
    expect(await drag(page)).toBeNull();

    // homeW → nE: the band snaps on nE (its own tower's target) and the release adds the second stream
    await f.start(homeW);
    await f.slide(homeW, nE, 10);
    await expect.poll(() => drag(page)).toMatchObject({ fromId: 'homeW', hoverTowerId: 'nE' });
    await f.end();
    await expect.poll(() => playerLinks(page), { message: 'homeW → nE added, homeE → nE kept' }).toEqual(sorted([
      { from: 'homeE', to: 'nE' },
      { from: 'homeW', to: 'nE' },
    ]));

    // one swipe from empty ground under both lanes cuts both streams (each once)
    await f.start({ x: 40, y: 1000 });
    await f.slide({ x: 40, y: 1000 }, { x: 700, y: 1000 }, 10);
    await expect.poll(() => playerLinks(page), { message: 'one swipe across both lanes cuts both' }).toEqual([]);
    await f.end();
    expect(errors).toEqual([]);
  });

  test('BUG-35 / BUG-38: a drag onto an own full tower (level 49, the L2 fortress at its top level) is refused with hint.fullTop and links nothing', async ({ page }) => {
    const errors = await boot(page, { ...CLEARED, stars: { ...CLEARED.stars } });
    // BUG-38: at its top level the keep cannot level up, so the bubble says so (not "stop its stream and it levels up")
    const full = await text(page, 'hint.fullTop');
    expect(full).not.toBe('hint.fullTop');
    expect(full).not.toBe(await text(page, 'hint.full'));
    await startLevel(page, 49);
    expect(await tower(page, 'keep')).toMatchObject({ owner: 'player', level: 2 });
    // the keep grows to its capacity on its own (a few seconds at ×10), then the sim runs at ×1 again
    await page.evaluate(() => window.__towerclash.setSpeed(10));
    await expect
      .poll(async () => (await tower(page, 'keep'))?.units ?? 0, { message: 'the keep fills to 75', timeout: 20_000 })
      .toBeGreaterThanOrEqual(FORTRESS_L2_CAPACITY);
    await page.evaluate(() => window.__towerclash.setSpeed(1));
    await expect.poll(() => page.evaluate(() => window.__towerclash.getSpeed())).toBe(1);
    expect(await tower(page, 'keep')).toMatchObject({ owner: 'player', level: 2, units: FORTRESS_L2_CAPACITY });
    expect(await tower(page, 'lamp')).toMatchObject({ owner: 'player' });
    const before = await playerLinks(page);
    expect(before.filter((l) => l.to === 'keep')).toEqual([]);

    const f = new Fingers(page, await page.context().newCDPSession(page));
    const lamp = towerAt(49, 'lamp');
    const keep = towerAt(49, 'keep');
    await f.start(lamp);
    await f.slide(lamp, keep, 8);
    await expect.poll(() => drag(page), { message: 'the band snaps on the full keep (it is reachable)' }).toMatchObject({ fromId: 'lamp', hoverTowerId: 'keep' });
    await f.end();
    await expect.poll(() => limitHintsSeen(page), { message: 'the refusal bubble says the keep is full at its top level' }).toContain(full);
    expect(await limitHintsSeen(page), 'never the "stop its stream" text for a top-level tower').not.toContain(await text(page, 'hint.full'));
    await page.waitForTimeout(200);
    expect((await playerLinks(page)).filter((l) => l.to === 'keep'), 'no stream into the full keep').toEqual([]);
    expect(await drag(page)).toBeNull();
    expect(errors).toEqual([]);
  });

  test('two fingers never make a phantom link or cut: only the first finger acts', async ({ page }) => {
    const errors = await boot(page, CLEARED);
    await startLevel(page, 2);
    const f = new Fingers(page, await page.context().newCDPSession(page));
    const home = towerAt(2, 'home');
    const mid = towerAt(2, 'mid');
    const y = Math.round((home.y + mid.y) / 2);
    // the canvas really sees two pointers at once (not one finger re-targeted)
    await recordPointers(page);

    // (a) finger 1 rests on empty ground; finger 2 drags home → mid and lifts: ignored
    await f.start({ x: 120, y }, 1);
    await f.start(home, 2);
    await f.slide(home, mid, 8, 2);
    expect(await drag(page), 'the second finger draws no band').toBeNull();
    await f.end(2);
    await f.end(1);
    await page.waitForTimeout(200);
    expect(await playerLinks(page), 'the second finger\'s drag linked nothing').toEqual([]);
    const log = await pointerLog(page);
    expect(log.map((e) => e.replace(/:\d+:/, ':#:')), `two touch pointers, the second down while the first is held: ${log.join(' ')}`).toEqual([
      'down:#:touch',
      'down:#:touch',
      'up:#:touch',
      'up:#:touch',
    ]);
    const ids = log.map((e) => e.split(':')[1]);
    expect(ids[0], 'two distinct pointers').not.toBe(ids[1]);
    expect([ids[2], ids[3]], `finger 2 lifts first, then finger 1: ${log.join(' ')}`).toEqual([ids[1], ids[0]]);

    // (b) a pinch: finger 1 on home, finger 2 on mid, both spread to empty ground, lifted in either order
    await f.start(home, 1);
    await f.start(mid, 2);
    await f.slide(mid, { x: mid.x - 200, y: mid.y - 120 }, 6, 2);
    await f.slide(home, { x: home.x + 200, y: home.y - 60 }, 6, 1);
    await f.end(2);
    await f.end(1);
    await page.waitForTimeout(200);
    expect(await playerLinks(page), 'a pinch links nothing').toEqual([]);
    expect(await drag(page)).toBeNull();

    // (c) finger 1 holds home; finger 2 taps mid: no link (it is not a tap-tap on home → mid)
    await f.start(home, 1);
    await f.start(mid, 2);
    await f.end(2);
    await page.waitForTimeout(200);
    expect(await playerLinks(page), 'the second finger\'s tap on mid while home is held links nothing').toEqual([]);
    await f.end(1);

    // (e) finger 1 taps home (selects it) while finger 2 is down on empty ground; finger 2, left over, then
    // slides onto mid and lifts: with home selected a tap on mid would link — a leftover finger must not
    await pointerLog(page);
    await f.start(home, 1);
    await f.start({ x: 600, y: 900 }, 2);
    await f.end(1);
    await f.slide({ x: 600, y: 900 }, mid, 8, 2);
    await f.end(2);
    await page.waitForTimeout(200);
    expect(await playerLinks(page), 'the leftover second finger released on mid linked nothing').toEqual([]);
    expect((await pointerLog(page)).filter((e) => e.startsWith('down')).length, 'both fingers reached the page').toBe(2);

    // with a stream up: (d) finger 1 holds home (still), finger 2 swipes across the lane → no cut
    await f.start(home);
    await f.slide(home, mid, 8);
    await f.end();
    // after (c) home may be selected by finger 1's tap; the drag links either way
    await expect.poll(() => playerLinks(page)).toEqual([{ from: 'home', to: 'mid' }]);
    const still = { x: 600, y: 900 }; // empty ground, off every lane
    await f.start(still, 1);
    await f.start({ x: home.x - 160, y }, 2);
    await f.slide({ x: home.x - 160, y }, { x: home.x + 160, y }, 8, 2);
    await f.end(2);
    await page.waitForTimeout(200);
    expect(await playerLinks(page), 'the second finger\'s swipe cut nothing').toEqual([{ from: 'home', to: 'mid' }]);
    await f.end(1);
    await page.waitForTimeout(200);
    expect(await playerLinks(page), 'finger 1 lifting (a tap on empty ground) changed no stream').toEqual([{ from: 'home', to: 'mid' }]);
    expect(await screen(page)).toBe('play');
    expect(errors).toEqual([]);
  });

  test('BUG-34: pause and MENU sit on the bands anchored to the safe edges and take touch taps there', async ({ page }) => {
    const errors = await boot(page, CLEARED);
    await startLevel(page, 2);
    const f = new Fingers(page, await page.context().newCDPSession(page));
    const scale = (await page.evaluate(() => window.__towerclash.toClient(720, 0))).x / 720;
    const pauseTop = await hudClientPoint(page, HUD.pause.x + HUD.pause.w / 2, HUD.pause.y);
    expect(pauseTop.y, 'pause top edge = safe top + 18 layout px').toBeCloseTo(PHONE.safe.top + HUD.pause.y * scale, 0);
    const menuBottom = await hudClientPoint(page, HUD.menu.x, HUD.menu.y + HUD.menu.h);
    expect(menuBottom.y, 'MENU bottom edge = safe bottom − 20 layout px').toBeCloseTo(PHONE.viewport.height - PHONE.safe.bottom - 20 * scale, 0);

    await f.tapHud(HUD.pause);
    await expect.poll(async () => {
      const a = await simTime(page);
      await page.waitForTimeout(150);
      return (await simTime(page)) - a;
    }, { message: 'the pause button freezes the sim' }).toBe(0);
    expect(await hint(page)).toBeNull();
    const frozen = await simTime(page);
    await f.tapHud(HUD.pause);
    await expect.poll(() => simTime(page), { message: 'tapped again: the sim runs' }).toBeGreaterThan(frozen);

    await f.tapHud(HUD.menu);
    await expect.poll(() => screen(page), { message: 'MENU → level map' }).toBe('levelSelect');
    expect(errors).toEqual([]);
  });

  test('level 2 tutorial at 430: a step left alone gives way after 20 s; the stop step shows on the link and clears on a swipe cut', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await boot(page, null);
    const tapThenGrey = await text(page, 'tutorial.tapThenGrey');
    const stopStream = await text(page, 'tutorial.stopStream');
    await startLevel(page, 2);
    await expect.poll(() => hint(page), { message: 'fresh save: level 2 opens on its first step' }).toBe(tapThenGrey);
    const shownAt = Date.now();
    // nobody touches the screen: the step gives way after TUTORIAL_STEP_TIMEOUT_MS of visible play (20 s)
    await expect.poll(() => hint(page), { message: 'the first step times out', timeout: 35_000, intervals: [500] }).toBeNull();
    const after = Date.now() - shownAt;
    expect(after, `the step stayed ${after} ms`).toBeGreaterThanOrEqual(19_000);
    expect(await playerLinks(page)).toEqual([]);

    const f = new Fingers(page, await page.context().newCDPSession(page));
    const home = towerAt(2, 'home');
    const mid = towerAt(2, 'mid');
    await f.start(home);
    await f.slide(home, mid, 8);
    await f.end();
    await expect.poll(() => playerLinks(page)).toEqual([{ from: 'home', to: 'mid' }]);
    await expect.poll(() => hint(page), { message: 'the (gated) stop step shows once a stream runs into mid' }).toBe(stopStream);
    const y = Math.round((home.y + mid.y) / 2);
    await f.flick({ x: home.x - 160, y }, { x: home.x + 160, y }, 3);
    await expect.poll(() => playerLinks(page), { message: 'the flick cuts' }).toEqual([]);
    await expect.poll(() => hint(page), { message: 'the cut completes the stop step (tutorial over)' }).toBeNull();
    await page.waitForTimeout(300);
    expect(await hint(page), 'level 2 has no further step').toBeNull();
    expect(errors).toEqual([]);
  });
  test('BUG-36: a drag or swipe that starts on the map and ends over a HUD button never presses it (booster, MENU, pause)', async ({ page }) => {
    const errors = await boot(page, { ...CLEARED, gold: 200 });
    await startLevel(page, 2);
    const f = new Fingers(page, await page.context().newCDPSession(page));
    const home = towerAt(2, 'home');
    const side = towerAt(2, 'side');
    const coins = () => page.evaluate(() => window.__towerclash.getCoins());
    const boosters = () => page.evaluate(() => (window.__towerclash.getState()?.boosters ?? []).map((b) => b.type));

    // (a) drag from home onto OVERDRIVE and lift there: no booster, no gold spent
    await f.start(home);
    await f.slideToHud(home, OVERDRIVE, 8);
    await f.end();
    await page.waitForTimeout(200);
    expect(await coins(), '(a) no gold spent').toBe(200);
    expect(await boosters(), '(a) overdrive not fired').toEqual([]);
    expect(await drag(page), '(a) the drag ended through the gestures').toBeNull();
    // (b) drag home → side, overshoot onto MENU, lift: still playing
    await f.start(home);
    await f.slide(home, side, 6);
    await f.slideToHud(side, HUD.menu, 4);
    await f.end();
    await page.waitForTimeout(200);
    expect(await screen(page), '(b) MENU not pressed').toBe('play');
    // (c) swipe from side (a neutral tower) to MENU: still playing
    await f.start(side);
    await f.slideToHud(side, HUD.menu, 8);
    await f.end();
    await page.waitForTimeout(200);
    expect(await screen(page), '(c) MENU not pressed').toBe('play');
    // (d) swipe from empty ground up to pause: the sim keeps running
    const empty = { x: 600, y: 600 };
    await f.start(empty);
    await f.slideToHud(empty, HUD.pause, 8);
    await f.end();
    const t0 = await simTime(page);
    await expect.poll(() => simTime(page), { message: '(d) not paused' }).toBeGreaterThan(t0);
    // control: a real tap on OVERDRIVE still fires it
    await f.tapHud(OVERDRIVE);
    await expect.poll(coins, { message: 'a tap on the booster fires it' }).toBe(170);
    await expect.poll(boosters).toEqual(['overdrive']);
    expect(await screen(page)).toBe('play');
    expect(errors).toEqual([]);
  });

  test('BUG-37: a press that starts on the HUD band and lifts on a tower is not a tap on that tower', async ({ page }) => {
    const errors = await boot(page, CLEARED);
    await startLevel(page, 2);
    const f = new Fingers(page, await page.context().newCDPSession(page));
    const home = towerAt(2, 'home');
    const mid = towerAt(2, 'mid');
    // tap home: selected
    await f.start(home);
    await f.end();
    // press the STREAMS pill, slide onto mid in 8 moves, lift: no home → mid stream
    await f.startOnHud(HUD.streams);
    await f.slideFromHudTo(mid, 8);
    await f.end();
    await page.waitForTimeout(250);
    expect(await playerLinks(page), 'a lift on mid after a press on the HUD links nothing').toEqual([]);
    // control: home is still selected (the HUD press never reached the gestures), so a real tap on mid links
    await f.start(mid);
    await f.end();
    await expect.poll(() => playerLinks(page)).toEqual([{ from: 'home', to: 'mid' }]);
    expect(errors).toEqual([]);
  });
});
