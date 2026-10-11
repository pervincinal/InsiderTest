import type { Page } from '@playwright/test';

/*
 * Frame-synced taps (QA-20). The shop builds its hit regions while drawing (src/ui/shop.ts `draw()`
 * sets `this.hits`), so between `go(shop)` — when `getScreen()` already answers 'shop' — and the
 * shop's first painted frame a tap hits nothing and is dropped silently. Under load the renderer can
 * go a few hundred ms without a frame while the main thread still answers `evaluate` and input, and
 * the spec's next `expect.poll` then waits its full 15 s for a purchase that never happens
 * (economy.spec.ts "booster crate", 2026-10-10: failed after 17.1 s). Reproduced by stopping the
 * browser's GPU process (no frames) across openShop → poll 'shop' → toClient → click: 3/3 taps
 * dropped, the save never changed after frames resumed.
 *
 * `clientPoint` converts a logical (720×1280) point inside a requestAnimationFrame callback. The app's
 * frame callback for that frame was queued before ours (its loop re-queues itself from the previous
 * frame), so when ours runs the current screen has drawn at least once: its hit regions are live
 * before the click is sent. One frame (~16 ms) per tap, no extra round-trip.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Client coordinates of logical (`lx`, `ly`), read after the current screen has painted a frame. */
export function clientPoint(page: Page, lx: number, ly: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([x, y]) => new Promise<{ x: number; y: number }>((resolve) => requestAnimationFrame(() => resolve(window.__towerclash.toClient(x, y)))),
    [lx, ly] as const,
  );
}

/** Tap a logical (720×1280) point once the current screen has painted. */
export async function tapAt(page: Page, lx: number, ly: number): Promise<void> {
  const c = await clientPoint(page, lx, ly);
  await page.mouse.click(c.x, c.y);
}

/** Tap the centre of a logical rectangle once the current screen has painted. */
export function tapRect(page: Page, r: Rect): Promise<void> {
  return tapAt(page, r.x + r.w / 2, r.y + r.h / 2);
}

/**
 * Client coordinates of a point on a play-HUD rect (src/render/layout.ts `HUD` / `BOOSTERS`), read
 * after the current screen has painted. BUG-34: the HUD bands are anchored to the screen's safe-area
 * edges, so on any screen taller than 9:16 (Pixel 5 included) they sit above / below the layout rect.
 */
export function hudClientPoint(page: Page, lx: number, ly: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([x, y]) => new Promise<{ x: number; y: number }>((resolve) => requestAnimationFrame(() => resolve(window.__towerclash.hudToClient(x, y)))),
    [lx, ly] as const,
  );
}

/** Tap the centre of a play-HUD rect (pause, mute, boosters, MENU, wallet…) where it is drawn. */
export async function tapHud(page: Page, r: Rect): Promise<void> {
  const c = await hudClientPoint(page, r.x + r.w / 2, r.y + r.h / 2);
  await page.mouse.click(c.x, c.y);
}
