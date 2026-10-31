/**
 * AUD-Q8 frame-time statistics for the on-screen overlay (src/ui/perfOverlay.ts) and its e2e surface
 * (`window.__towerclash.perf.getStats()`). Pure: the caller hands in the rAF timestamps, so tests drive
 * it with synthetic frame streams. Lazy with the overlay (none of it is in the eager bundle).
 *
 * The number is the wall-clock interval between consecutive frames — what the player sees, vsync
 * included — not the page's own work (e2e/perf.spec.ts gates that on CI). Over the last
 * PERF_STATS.windowMs: frames per second (frames / summed intervals) and the p95 / p50 / max interval;
 * since the last `reset` (the overlay resets on every screen change, so a level's count starts with
 * the level): the frames longer than PERF_STATS.longFrameMs. An interval over PERF_STATS.gapMs is a
 * pause (hidden tab, app in the background, a debugger), not a frame: it is dropped, never counted.
 */

export const PERF_STATS = Object.freeze({
  /** The rolling window of fps and the percentiles, ms. */
  windowMs: 2000,
  /** Ring size: 2 s at 240 Hz fits. */
  capacity: 512,
  /** Bars of the sparkline (the most recent frames). */
  sparkFrames: 60,
  /**
   * A long frame: more than 1.5 frames at 60 Hz, i.e. at least one dropped frame (a 60 Hz frame that
   * misses its vsync shows for 33.3 ms). Low Power Mode's 30 fps cap makes every frame long.
   */
  longFrameMs: 25,
  /** A gap longer than this between two frames is a pause, not a frame. */
  gapMs: 1000,
  /** The 60 Hz frame budget the chip compares against (TF-13: p95 ≤ this on the iPhone 17 Pro Max). */
  budgetMs: 1000 / 60,
});

/** What the overlay shows and the e2e reads. */
export interface FrameStatsSnapshot {
  /** Frames per second over the window (0 before two frames). */
  fps: number;
  /** 95th / 50th percentile and the longest frame interval in the window, ms (nearest rank; 0 when empty). */
  p95Ms: number;
  p50Ms: number;
  maxMs: number;
  /** Intervals inside the window. */
  frames: number;
  /** Intervals longer than PERF_STATS.longFrameMs since the last reset. */
  longFrames: number;
  /** Intervals recorded since the last reset. */
  totalFrames: number;
  /** Wall-clock ms since the last reset. */
  sinceMs: number;
}

/** Nearest-rank percentile of the first `n` values of `sorted` (ascending); 0 when `n` is 0. */
export function nearestRank(sorted: ArrayLike<number>, n: number, p: number): number {
  if (n <= 0) return 0;
  const i = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  return sorted[i]!;
}

/** A ring of frame intervals, allocation-free per frame (the overlay must not perturb what it measures). */
export class FrameStats {
  private readonly at: Float64Array;
  private readonly dt: Float32Array;
  private readonly scratch: Float32Array;
  private head = 0;
  private size = 0;
  private last = -1;
  private resetAt = 0;
  private long = 0;
  private total = 0;

  constructor(readonly capacity: number = PERF_STATS.capacity) {
    this.at = new Float64Array(capacity);
    this.dt = new Float32Array(capacity);
    this.scratch = new Float32Array(capacity);
  }

  /**
   * Start counting afresh at `nowMs` (screen change): empties the window and the long-frame count; the
   * next `frame` only sets the clock (its interval straddles the change and is not recorded).
   */
  reset(nowMs: number): void {
    this.head = 0;
    this.size = 0;
    this.last = -1;
    this.resetAt = nowMs;
    this.long = 0;
    this.total = 0;
  }

  /** One frame at rAF time `nowMs`: records the interval since the previous frame (not after a reset or a gap). */
  frame(nowMs: number): void {
    const prev = this.last;
    this.last = nowMs;
    if (prev < 0) return;
    const d = nowMs - prev;
    if (!(d > 0) || d > PERF_STATS.gapMs) return;
    this.at[this.head] = nowMs;
    this.dt[this.head] = d;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
    this.total++;
    if (d > PERF_STATS.longFrameMs) this.long++;
  }

  /** The statistics at `nowMs` (window: the intervals that ended in the last PERF_STATS.windowMs). */
  stats(nowMs: number): FrameStatsSnapshot {
    const from = nowMs - PERF_STATS.windowMs;
    let n = 0;
    let sum = 0;
    for (let k = 1; k <= this.size; k++) {
      const i = (this.head - k + this.capacity) % this.capacity;
      if (this.at[i]! < from) break;
      const d = this.dt[i]!;
      this.scratch[n++] = d;
      sum += d;
    }
    const s = this.scratch.subarray(0, n).sort();
    return {
      fps: sum > 0 ? (1000 * n) / sum : 0,
      p95Ms: nearestRank(s, n, 95),
      p50Ms: nearestRank(s, n, 50),
      maxMs: n ? s[n - 1]! : 0,
      frames: n,
      longFrames: this.long,
      totalFrames: this.total,
      sinceMs: Math.max(0, nowMs - this.resetAt),
    };
  }

  /** The last `out.length` intervals into `out`, oldest first, 0 where there were none; returns how many are real. */
  spark(out: Float32Array): number {
    const n = Math.min(out.length, this.size);
    out.fill(0);
    for (let k = 0; k < n; k++) out[out.length - 1 - k] = this.dt[(this.head - 1 - k + this.capacity) % this.capacity]!;
    return n;
  }
}
