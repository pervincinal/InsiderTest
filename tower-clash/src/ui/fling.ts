/**
 * AUD-U18: momentum for the level map and the shop list (lazy — only those two screens import it).
 * The finger's last `windowMs` of samples give the release velocity; the fling then decays
 * exponentially (× `decay16` per 16 ms, frame-rate independent: the step integrates
 * v·e^(−k·t) exactly) and stops under `stopCssPxS` CSS px/s. The screens clamp hard at either end
 * and stop the fling there. A press while it moves stops it, and that press acts on nothing (the
 * screen eats the tap). Reduced motion: no fling at all — the list stops where the finger left it.
 * Times are ms on one clock (`PointerPoint.timeMs` / the frame's `nowMs`); y is layout px.
 */
export const FLING = Object.freeze({ windowMs: 100, decay16: 0.95, stopCssPxS: 20, maxStepMs: 100 });

/** Decay rate per ms. */
const K = -Math.log(FLING.decay16) / 16;

/** How far a fling that starts at `v` (layout px / ms) travels before it stops (no ends; tests, docs). */
export const flingDistance = (v: number): number => v / K;

export class Fling {
  private ys: number[] = [];
  private ts: number[] = [];
  /** Scroll velocity, layout px per ms (positive: the scroll offset grows); 0 = still. */
  v = 0;
  private at = 0;

  /** Finger down at screen y: the samples restart. True when it caught a moving fling (the press must not act). */
  press(y: number, t: number): boolean {
    const caught = this.v !== 0;
    this.v = 0;
    this.ys = [y];
    this.ts = [t];
    return caught;
  }

  /** A finger sample while held (older ones than the window are dropped). */
  track(y: number, t: number): void {
    this.ys.push(y);
    this.ts.push(t);
    // keep one sample older than the window: with sparse events it is the drag's start (see `release`)
    while (this.ts.length > 2 && this.ts[1]! < t - FLING.windowMs) {
      this.ys.shift();
      this.ts.shift();
    }
  }

  /**
   * Lift after a drag at screen y: the velocity over the samples of the last `windowMs` (the finger
   * moves down → the scroll offset shrinks). `scale` = CSS px per layout px. True when a fling started.
   */
  release(y: number, t: number, scale: number, reduced: boolean): boolean {
    // a finger that rested before the lift sends no moves: no move inside the window = no fling
    const lastMove = this.ts[this.ts.length - 1];
    const rested = lastMove === undefined || t - lastMove > FLING.windowMs;
    this.track(y, t);
    let i = 0;
    while (i < this.ts.length - 1 && this.ts[i]! < t - FLING.windowMs) i++;
    // sparse events (a slow frame; the lift repeats the last move's point): reach back one sample
    if (i > 0 && this.ts.length - i < 3) i--;
    const dt = t - this.ts[i]!;
    const v = !rested && dt > 0 ? -(y - this.ys[i]!) / dt : 0;
    this.ys = [];
    this.ts = [];
    this.at = t;
    this.v = reduced || this.slow(v, scale) ? 0 : v;
    return this.v !== 0;
  }

  /** Advance to `now`: the scroll delta for this frame (0 when still). */
  step(now: number, scale: number): number {
    if (this.v === 0) return 0;
    const dt = Math.max(0, Math.min(FLING.maxStepMs, now - this.at));
    this.at = Math.max(this.at, now);
    const e = Math.exp(-K * dt);
    const d = (this.v * (1 - e)) / K;
    this.v *= e;
    if (this.slow(this.v, scale)) this.v = 0;
    return d;
  }

  stop(): void {
    this.v = 0;
  }

  get moving(): boolean {
    return this.v !== 0;
  }

  private slow(v: number, scale: number): boolean {
    return Math.abs(v) * 1000 * (scale > 0 ? scale : 1) < FLING.stopCssPxS;
  }
}

/** Locked-node shake (AUD-U18): x offset at `ms` into its 200 ms — three swings, fading out. */
export const SHAKE_MS = 200;
export function shakeOffset(ms: number): number {
  if (ms < 0 || ms >= SHAKE_MS) return 0;
  const u = ms / SHAKE_MS;
  return Math.sin(u * Math.PI * 6) * 10 * (1 - u);
}
