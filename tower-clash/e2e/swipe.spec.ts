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
 *   (iii) the level 2 tutorial's "stop the stream" hint disappears after the swipe-cut.
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
}

test.describe('touch drag-to-link and swipe-to-cut (BUG-33)', () => {
  test('level 2: drag home → mid links, a swipe across the stream cuts it live, the tutorial stop hint clears', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__towerclash?.getTutorialHint === 'function');
    expect(await screen(page)).toBe('title');
    const tapThenGrey = await text(page, 'tutorial.tapThenGrey');
    const stopStream = await text(page, 'tutorial.stopStream');
    expect(stopStream).toBe('Swipe across the stream to stop it');

    expect(await page.evaluate((seed) => window.__towerclash.loadLevel(2, seed), SEED)).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await expect.poll(() => simTime(page), { message: 'level 2 sim should tick' }).toBeGreaterThan(0);
    await expect.poll(() => hint(page), { message: 'fresh save: level 2 tutorial on' }).toBe(tapThenGrey);

    const cdp = await page.context().newCDPSession(page);
    const finger = new Finger(page, cdp);
    const home = towerAt('home');
    const mid = towerAt('mid');
    expect(home.x).toBe(mid.x); // the home → mid lane is vertical: the swipe below runs straight across it

    // (i) drag own tower → neutral tower: one player stream home → mid
    await finger.start(home);
    await finger.slide(home, mid, 10);
    await finger.end();
    await expect.poll(() => playerLinks(page), { message: 'the drag home → mid opens a stream' }).toEqual([{ from: 'home', to: 'mid' }]);
    await expect.poll(() => hint(page), { message: 'the link completes step 1; the stop step shows' }).toBe(stopStream);

    // a drag along the stream from the own tower again is still "link" (a no-op on an existing stream), never a cut
    await finger.start(home);
    await finger.slide(home, { x: home.x + 4, y: (home.y + mid.y) / 2 }, 6);
    await finger.end();
    await page.waitForTimeout(200); // two sim ticks: an unlink would have landed
    expect(await playerLinks(page), 'a drag from an own tower never cuts').toEqual([{ from: 'home', to: 'mid' }]);

    // (ii) swipe from empty ground across the stream: cut while the finger is still down
    const y = Math.round((home.y + mid.y) / 2);
    const left = { x: home.x - 160, y };
    const right = { x: home.x + 160, y };
    await finger.start(left);
    await finger.slide(left, right, 8);
    await expect.poll(() => playerLinks(page), { message: 'the swipe cuts the stream live, before the finger lifts' }).toEqual([]);
    // (iii) the tutorial's stop step accepted the cut
    await expect.poll(() => hint(page), { message: 'the swipe-cut completes the stop step (tutorial over)' }).toBeNull();
    await finger.end();
    await page.waitForTimeout(300);
    expect(await playerLinks(page), 'nothing re-linked on touchEnd').toEqual([]);
    expect(await hint(page), 'level 2 has no further step').toBeNull();
    expect(await screen(page)).toBe('play');

    // and the finger can open the stream again right after (the swipe left no half-pressed state)
    await finger.start(home);
    await finger.slide(home, mid, 10);
    await finger.end();
    await expect.poll(() => playerLinks(page), { message: 're-link after the cut' }).toEqual([{ from: 'home', to: 'mid' }]);

    expect(pageErrors).toEqual([]);
  });
});
