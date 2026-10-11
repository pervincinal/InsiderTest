import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { clientPoint } from './helpers/tap';

/*
 * BUG-35 (TestFlight 1.0.0 (8), iPhone, level 2): "when I hold my own tower and drag, a line should
 * come with my finger and the stream should go to whichever tower I let go on". With a real CDP touch
 * sequence (touchStart on home, touchMove ×n, touchEnd on mid) the play screen must (a) expose a drag
 * preview from `home` that follows the finger while it is over empty ground, (b) snap it onto `mid`
 * once the finger reaches it, and (c) open the stream home → mid on release — with the band gone.
 * Mid-drag the canvas is screenshotted so the band is seen painted (gold, between home and the finger).
 */

const SEED = 1;

interface LevelJson {
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
const drag = (page: Page) => page.evaluate(() => window.__towerclash.getDrag());
const playerLinks = (page: Page) =>
  page.evaluate(() =>
    (window.__towerclash.getState()?.links ?? []).filter((l) => l.owner === 'player').map((l) => ({ from: l.from, to: l.to })),
  );

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
  async moveTo(l: { x: number; y: number }): Promise<void> {
    await this.send('touchMove', await clientPoint(this.page, l.x, l.y));
  }
  async end(): Promise<void> {
    await this.send('touchEnd');
  }
}

test.describe('drag rubber band (BUG-35)', () => {
  test('level 2: the band follows the finger from home, snaps onto mid, and the release opens the stream', async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__towerclash?.getDrag === 'function');
    expect(await page.evaluate((seed) => window.__towerclash.loadLevel(2, seed), SEED)).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    await expect.poll(() => simTime(page)).toBeGreaterThan(0);

    const finger = new Finger(page, await page.context().newCDPSession(page));
    const home = towerAt('home');
    const mid = towerAt('mid');
    const midway = { x: home.x + 90, y: (home.y + mid.y) / 2 };

    await finger.start(home);
    expect(await drag(page), 'a press alone is not a drag').toBeNull();
    await finger.moveTo({ x: home.x + 30, y: home.y - 30 });
    await finger.moveTo(midway);
    await expect.poll(() => drag(page), { message: 'over empty ground the band ends at the finger' }).toEqual({
      fromId: 'home',
      x: expect.closeTo(midway.x, 0),
      y: expect.closeTo(midway.y, 0),
      hoverTowerId: null,
    });
    await page.waitForTimeout(80); // a couple of frames so the band is painted
    await testInfo.attach('mid-drag', { body: await page.screenshot(), contentType: 'image/png' });

    await finger.moveTo(mid);
    await expect.poll(() => drag(page), { message: 'over mid the band snaps onto it' }).toMatchObject({ fromId: 'home', hoverTowerId: 'mid' });
    await finger.end();
    await expect.poll(() => playerLinks(page), { message: 'release on mid opens home → mid' }).toEqual([{ from: 'home', to: 'mid' }]);
    expect(await drag(page), 'the band is gone once the finger lifts').toBeNull();
    expect(pageErrors).toEqual([]);
  });
});
