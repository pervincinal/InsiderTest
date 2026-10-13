import type { CDPSession, Page } from '@playwright/test';
import { clientPoint, hudClientPoint } from './tap';

/*
 * Real touch input for the phone specs (QA-22 e2e/gestures430.spec.ts, QA-23 e2e/camera.spec.ts): raw
 * CDP `Input.dispatchTouchEvent`, so the page sees touch events and the pointer events Chromium derives
 * from them, as on a phone. Every logical point is converted to client px inside a
 * requestAnimationFrame (e2e/helpers/tap.ts `clientPoint`), i.e. through the play camera (ART-21)
 * while a level is running and not paused.
 */

export interface XY {
  x: number;
  y: number;
}

/**
 * Up to two fingers on the touchscreen, driven with raw CDP touch events. touchStart / touchMove carry
 * every point that is down (a new id is pressed, a known one moves); touchEnd carries the point lifted.
 */
export class Fingers {
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

  /** A one-finger touch tap (touchStart + touchEnd, no move) on logical `l`, converted after a painted frame. */
  async tap(l: XY): Promise<void> {
    await this.tapClient(await clientPoint(this.page, l.x, l.y));
  }

  /** A one-finger touch tap at client point `c` (CSS px). */
  async tapClient(c: XY): Promise<void> {
    const tp = [{ x: c.x, y: c.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp });
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: tp });
  }

  /** A touch tap on a play-HUD rect where it is drawn (BUG-34: the bands are anchored to the safe edges). */
  async tapHud(r: { x: number; y: number; w: number; h: number }): Promise<void> {
    const c = await hudClientPoint(this.page, r.x + r.w / 2, r.y + r.h / 2);
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 9, radiusX: 4, radiusY: 4, force: 1 }] });
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
}
