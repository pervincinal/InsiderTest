import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { tapRect } from './helpers/tap';

/*
 * QA-20 regression (economy.spec.ts "booster crate …" failed after 17.1 s on 2026-10-10 under load).
 * The shop builds its hit regions while drawing (src/ui/shop.ts `draw()` → `this.hits`), so a tap
 * that reaches the page after `go(shop)` but before the shop's first painted frame hits nothing and
 * is dropped silently; `getScreen()` already answers 'shop' in that window. Under load the renderer
 * can go a few hundred ms without a frame while `evaluate` and input are still served, and the
 * spec's next poll then waited out its 15 s.
 *
 * This spec makes that window deterministic: an init script gates `requestAnimationFrame` so the
 * app's frame loop can be held (no frames at all) and released. With frames held it opens the shop,
 * sees 'shop' current with zero shop frames painted, taps the crate through e2e/helpers/tap.ts
 * (`clientPoint` waits inside a requestAnimationFrame callback) and releases the frames 400 ms later:
 * the tap must reach the shop only after it painted, and the crate must be bought. Before the helper,
 * the same steps with a plain `toClient` + click were dropped 3/3 (GPU process stopped, 2026-10-11).
 */

const SAVE_KEY = 'towerclash.save.v3';
// src/render/layout.ts — SHOP row 0 (the booster crate on the Bundles tab); src/economy/catalog.ts boosterCrate
const CRATE_ROW = { x: 34, y: 200, w: 652, h: 168 };
const CRATE = { cost: 60, charges: { overdrive: 5, freeze: 3, airstrike: 2 } };
// src/render/layout.ts CONFIRM.yes (AUD-U5: a crystal spend confirms first)
const SPEND_CONFIRM_YES = { x: 130, y: 676, w: 210, h: 72 };

type GateWindow = Window & {
  __qaFrames: { hold: boolean; held: number; shopFrames: number; release(): void };
  __qaDowns: number[];
};

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript(
    ([key, data]) => localStorage.setItem(key, JSON.stringify(data)),
    [SAVE_KEY, { version: 3, gold: 0, crystals: CRATE.cost, charges: { overdrive: 0, freeze: 0, airstrike: 0 } }] as const,
  );
  await page.addInitScript(() => {
    const w = window as unknown as GateWindow;
    const raf = window.requestAnimationFrame.bind(window);
    let queue: FrameRequestCallback[] = [];
    let lastShopFrame = -1;
    const screenNow = () => (window as { __towerclash?: { getScreen?: () => string } }).__towerclash?.getScreen?.();
    const wrap =
      (cb: FrameRequestCallback): FrameRequestCallback =>
      (t) => {
        if (t !== lastShopFrame && screenNow() === 'shop') {
          lastShopFrame = t;
          w.__qaFrames.shopFrames++;
        }
        cb(t);
      };
    w.__qaFrames = {
      hold: false,
      held: 0,
      shopFrames: 0,
      release() {
        const q = queue;
        queue = [];
        this.hold = false;
        this.held = 0;
        for (const cb of q) raf(wrap(cb)); // same order as requested: the app's frame first, then the helper's
      },
    };
    w.__qaDowns = [];
    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      if (w.__qaFrames.hold) {
        queue.push(cb);
        w.__qaFrames.held++;
        return 0;
      }
      return raf(wrap(cb));
    };
    // shop frames painted when each pointerdown reached the page
    window.addEventListener('pointerdown', () => w.__qaDowns.push(w.__qaFrames.shopFrames), true);
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.economy?.openShop === 'function');
  return errors;
}

const frames = (page: Page) => page.evaluate(() => ({ ...(window as unknown as GateWindow).__qaFrames }));
const charges = (page: Page) => page.evaluate(() => ({ ...window.__towerclash.economy.getSave().charges }));

test('a tap sent while the just-opened shop has not painted yet waits for its first frame and buys the crate (QA-20)', async ({ page }) => {
  const errors = await boot(page);
  // the lazy screens chunk is in before the frames stop (openShop must not wait on the network here)
  await page.evaluate(() => window.__towerclash.economy.openShop('bundles'));
  await expect.poll(() => page.evaluate(() => window.__towerclash.getScreen())).toBe('shop');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__towerclash.getScreen())).toBe('title');

  // hold every frame: the app's loop parks its next frame request in the gate
  await page.evaluate(() => {
    (window as unknown as GateWindow).__qaFrames.hold = true;
  });
  await expect.poll(async () => (await frames(page)).held, { message: "the app's frame loop is parked" }).toBeGreaterThanOrEqual(1);
  const shopFramesBefore = (await frames(page)).shopFrames;
  await page.evaluate(() => window.__towerclash.economy.openShop('bundles'));
  await expect.poll(() => page.evaluate(() => window.__towerclash.getScreen())).toBe('shop');
  expect((await frames(page)).shopFrames, 'the shop is current and has not painted a single frame').toBe(shopFramesBefore);

  // release the frames 400 ms from now, from the page's own clock; the tap is issued at once
  await page.evaluate(() => {
    setTimeout(() => (window as unknown as GateWindow).__qaFrames.release(), 400);
  });
  await tapRect(page, CRATE_ROW);
  const downs = await page.evaluate(() => (window as unknown as GateWindow).__qaDowns);
  expect(downs, 'one pointerdown, sent after the shop painted').toHaveLength(1);
  expect(downs[0]!).toBeGreaterThan(shopFramesBefore);
  await tapRect(page, SPEND_CONFIRM_YES); // AUD-U5: the crate asks on the confirm card first
  await expect.poll(() => charges(page), { message: 'the crate was bought: the tap reached the shop' }).toEqual(CRATE.charges);
  expect((await page.evaluate(() => window.__towerclash.economy.getSave().crystals))).toBe(0);
  expect(errors).toEqual([]);
});
