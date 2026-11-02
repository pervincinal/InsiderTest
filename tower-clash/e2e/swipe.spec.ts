import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { clientPoint } from './helpers/tap';

/*
 * BUG-33 (TestFlight 1.0.0 (8), iPhone, level 2 "Supply Line"): drag-to-attack and stopping a stream
 * by finger, driven by REAL touch input — raw CDP `Input.dispatchTouchEvent` touchStart / touchMove ×n /
 * touchEnd on the Pixel 5 (hasTouch) context, so the page sees touchstart / touchmove (the canvas
 * swallows them non-passively) and the pointer events the browser derives from them, exactly as on
 * a phone. (`page.touchscreen` only taps.)
 *   (i)   drag own tower (home) → neutral tower (mid): a player stream home → mid appears;
 *   (ii)  swipe from empty ground across that stream: it is cut (live, before the finger lifts);
 *   (iii) the level 2 tutorial's "stop the stream" hint disappears after the swipe-cut;
 *   (iv)  AUD-U6: a double tap on a target keeps the stream the first tap started; a tap after 400 ms stops it;
 *   (v)   AUD-U8: a slash that starts on home's own hit disc, crosses home → side and is released on empty
 *         ground cuts that stream on release (a drag from an own tower released off every tower is a swipe).
 * Coordinates come from the level JSON (never imported from src/, see smoke.spec.ts); hint texts
 * from the running page (`getText`). Every touch point is converted inside a requestAnimationFrame
 * (e2e/helpers/tap.ts `clientPoint`), so the play screen has painted before the finger lands.
 */

const SEED = 1;

interface LevelJson {
  id: number;
  towers: { id: string; x: number; y: number; owner: string }[];
}
const LEVEL2 = JSON.parse(readFileSync(new URL('../src/levels/002-supply-line.json', import.meta.url), 'utf8')) as LevelJson;
function towerAt(id: string): { x: number; y: number } {
  const t = LEVEL2.towers.find((tw) => tw.id === id);
  if (!t) throw new Error(`level 2 has no tower "${id}"`);
  return { x: t.x, y: t.y };
}

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const hint = (page: Page) => page.evaluate(() => window.__towerclash.getTutorialHint());
const text = (page: Page, key: string) => page.evaluate((k) => window.__towerclash.getText(k), key);
const playerLinks = (page: Page) =>
  page.evaluate(() =>
    (window.__towerclash.getState()?.links ?? []).filter((l) => l.owner === 'player').map((l) => ({ from: l.from, to: l.to })),
  );

/** One finger on the touchscreen, moved through logical (720×1280) points with raw CDP touch events. */
class Finger {
  private readonly page: Page;
  private readonly cdp: CDPSession;

  constructor(page: Page, cdp: CDPSession) {
    this.page = page;
    this.cdp = cdp;
  }

  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }): Promise<void> {
    const touchPoints = p ? [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] : [];
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }

  async start(l: { x: number; y: number }): Promise<void> {
    await this.send('touchStart', await clientPoint(this.page, l.x, l.y));
  }

  /** Slide in `steps` touchMoves (one per frame-synced conversion) from `a` to `b`, both logical. */
  async slide(a: { x: number; y: number }, b: { x: number; y: number }, steps = 8): Promise<void> {
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      await this.send('touchMove', await clientPoint(this.page, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k));
    }
  }

  async end(): Promise<void> {
    await this.send('touchEnd');
  }

  /** `n` taps on logical point `l`, `gapMs` apart (the point converted once, so the taps follow fast). */
  async taps(l: { x: number; y: number }, n = 1, gapMs = 0): Promise<void> {
    const c = await clientPoint(this.page, l.x, l.y);
    for (let i = 0; i < n; i++) {
      if (i > 0 && gapMs > 0) await this.page.waitForTimeout(gapMs); // ok: the gap between the taps of a double tap is what is under test
      await this.send('touchStart', c);
      await this.send('touchEnd');
    }
  }
}

test.describe('touch drag-to-link and swipe-to-cut (BUG-33)', () => {
  test('level 2: drag home → side links, a swipe across the stream cuts it live, the tutorial stop hint clears', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__towerclash?.getTutorialHint === 'function');
    expect(await screen(page)).toBe('title');
    const tapThenGrey = await text(page, 'tutorial.tapThenGrey');
    const goAround = await text(page, 'tutorial.goAround');
    const stopStream = await text(page, 'tutorial.stopStream');
    expect(stopStream).toBe('Swipe across the stream so your tower grows');

    expect(await page.evaluate((seed) => window.__towerclash.loadLevel(2, seed), SEED)).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await page.evaluate(() => window.__towerclash.startMatch()); // AUD-B11: the lesson card holds the match until a first input
    await expect.poll(() => simTime(page), { message: 'level 2 sim should tick' }).toBeGreaterThan(0);
    await expect.poll(() => hint(page), { message: 'fresh save: level 2 tutorial on' }).toBe(tapThenGrey);

    const cdp = await page.context().newCDPSession(page);
    const finger = new Finger(page, cdp);
    const home = towerAt('home');
    const side = towerAt('side');
    const foe = towerAt('foe');
    expect(Math.abs(home.y - side.y)).toBeLessThan(40); // the home → side lane is near-horizontal: the swipe below runs straight across it

    // (i) drag own tower → neutral tower: one player stream home → side
    await finger.start(home);
    await finger.slide(home, side, 10);
    await finger.end();
    await expect.poll(() => playerLinks(page), { message: 'the drag home → side opens a stream' }).toEqual([{ from: 'home', to: 'side' }]);
    // GD-5a: the stop step waits for the capture and for side → foe (tutorial step 2)
    await expect.poll(() => hint(page), { message: 'the link completes step 1; step 2 waits for the capture' }).toBeNull();
    await expect.poll(() => page.evaluate(() => window.__towerclash.getState()?.towers['side']?.owner), { message: 'side falls', timeout: 20_000 }).toBe('player');
    await expect.poll(() => hint(page)).toBe(goAround);
    await finger.start(side);
    await finger.slide(side, foe, 10);
    await finger.end();
    await expect.poll(() => playerLinks(page)).toEqual([
      { from: 'home', to: 'side' },
      { from: 'side', to: 'foe' },
    ]);
    await expect.poll(() => hint(page), { message: 'side → foe completes step 2; the stop step shows' }).toBe(stopStream);

    // a drag out of the own tower beside its stream, released on empty ground without crossing it, cuts nothing (AUD-U8)
    await finger.start(home);
    await finger.slide(home, { x: (home.x + side.x) / 2, y: (home.y + side.y) / 2 - 30 }, 6);
    await finger.end();
    await page.waitForTimeout(200); // two sim ticks: an unlink would have landed
    expect(await playerLinks(page), 'a drag from an own tower that crosses no stream never cuts').toEqual([
      { from: 'home', to: 'side' },
      { from: 'side', to: 'foe' },
    ]);

    // (ii) swipe from empty ground across home → side (clear of side → foe): cut while the finger is still down
    const x = Math.round((home.x + side.x) / 2);
    const top = { x, y: Math.round((home.y + side.y) / 2) - 100 };
    const bottom = { x, y: Math.round((home.y + side.y) / 2) + 70 };
    await finger.start(top);
    await finger.slide(top, bottom, 8);
    await expect.poll(() => playerLinks(page), { message: 'the swipe cuts the stream live, before the finger lifts' }).toEqual([{ from: 'side', to: 'foe' }]);
    // (iii) the tutorial's stop step accepted the cut
    await expect.poll(() => hint(page), { message: 'the swipe-cut completes the stop step' }).toBeNull();
    await finger.end();
    await page.waitForTimeout(300);
    expect(await playerLinks(page), 'nothing re-linked on touchEnd').toEqual([{ from: 'side', to: 'foe' }]);
    expect(await hint(page), 'no further step on the side-first line').toBeNull();
    expect(await screen(page)).toBe('play');

    // and the finger can open the stream again right after (the swipe left no half-pressed state)
    await finger.start(home);
    await finger.slide(home, side, 10);
    await finger.end();
    await expect.poll(() => playerLinks(page), { message: 're-link after the cut' }).toContainEqual({ from: 'home', to: 'side' });

    expect(pageErrors).toEqual([]);
  });

  test('AUD-U6: a double tap on a target keeps the stream it started; a tap after 400 ms stops it', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__towerclash?.getTutorialHint === 'function');
    expect(await page.evaluate((seed) => window.__towerclash.loadLevel(2, seed), SEED)).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await page.evaluate(() => window.__towerclash.startMatch());
    await expect.poll(() => simTime(page)).toBeGreaterThan(0);

    const finger = new Finger(page, await page.context().newCDPSession(page));
    const home = towerAt('home');
    const side = towerAt('side');
    await finger.taps(home); // select
    // tap, and a quick second tap on the same target (a bounce / "tap harder" retry): one stream, still on
    await finger.taps(side, 2, 60);
    await page.waitForTimeout(250); // five sim ticks: an unlink would have landed
    expect(await playerLinks(page), 'the second tap of a double tap is ignored').toEqual([{ from: 'home', to: 'side' }]);
    // past LINK_REPEAT_GUARD_MS the same tap stops the stream, as before
    await page.waitForTimeout(300);
    await finger.taps(side);
    await expect.poll(() => playerLinks(page), { message: 'a later tap on the target unlinks' }).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('AUD-U8: a slash that starts on home\'s disc across home → side, released on empty ground, cuts the stream', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__towerclash?.getTutorialHint === 'function');
    expect(await page.evaluate((seed) => window.__towerclash.loadLevel(2, seed), SEED)).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await page.evaluate(() => window.__towerclash.startMatch());
    await expect.poll(() => simTime(page)).toBeGreaterThan(0);

    const finger = new Finger(page, await page.context().newCDPSession(page));
    const home = towerAt('home');
    const side = towerAt('side');
    await finger.start(home);
    await finger.slide(home, side, 10);
    await finger.end();
    await expect.poll(() => playerLinks(page), { message: 'the drag home → side opens a stream' }).toEqual([{ from: 'home', to: 'side' }]);

    // 50 px from home's centre (inside its 57 px hit disc), above the lane; down across it ≈ 50 px out of home; off every disc
    const start = { x: home.x + 40, y: home.y - 30 };
    const end = { x: home.x + 70, y: home.y + 50 };
    await finger.start(start);
    await finger.slide(start, end, 8);
    await expect
      .poll(() => page.evaluate(() => window.__towerclash.getDrag()), { message: 'it starts on home: a drag (band up), not a swipe' })
      .toMatchObject({ fromId: 'home', hoverTowerId: null });
    await page.waitForTimeout(200); // four sim ticks: a live cut would have landed
    expect(await playerLinks(page), 'nothing is cut while the finger is down: the release decides').toEqual([{ from: 'home', to: 'side' }]);
    await finger.end();
    await expect.poll(() => playerLinks(page), { message: 'released on empty ground: the stream it crossed is cut' }).toEqual([]);
    expect(await page.evaluate(() => window.__towerclash.getDrag())).toBeNull();
    expect(await screen(page)).toBe('play');
    expect(pageErrors).toEqual([]);
  });
});
