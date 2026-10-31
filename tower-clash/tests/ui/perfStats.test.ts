import { describe, expect, it } from 'vitest';
import { FrameStats, PERF_STATS, nearestRank } from '../../src/ui/perfStats';

/*
 * AUD-Q8: the frame-time overlay's statistics ring (src/ui/perfStats.ts) — what TF-13 reads on the phone
 * (fps, p95 of the last 2 s, long frames since the screen opened) and what the e2e reads through
 * `window.__towerclash.perf.getStats()`. Driven with synthetic rAF timestamps.
 */

/** Feed frames at the given intervals starting at `t0`; returns the last timestamp. */
function feed(s: FrameStats, t0: number, intervals: readonly number[]): number {
  let t = t0;
  s.frame(t);
  for (const d of intervals) {
    t += d;
    s.frame(t);
  }
  return t;
}

describe('nearestRank (AUD-Q8)', () => {
  it('is the nearest-rank percentile of the first n sorted values; 0 when empty', () => {
    const xs = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20
    expect(nearestRank(xs, 20, 95)).toBe(19);
    expect(nearestRank(xs, 20, 50)).toBe(10);
    expect(nearestRank(xs, 20, 100)).toBe(20);
    expect(nearestRank(xs, 10, 95)).toBe(10); // only the first 10 count
    expect(nearestRank(xs, 1, 95)).toBe(1);
    expect(nearestRank(xs, 0, 95)).toBe(0);
  });
});

describe('FrameStats (AUD-Q8)', () => {
  it('a steady 60 Hz stream reads 60 fps, p95 = p50 = 16.7 ms and no long frames', () => {
    const s = new FrameStats();
    const end = feed(s, 1000, Array(180).fill(1000 / 60));
    const st = s.stats(end);
    expect(st.fps).toBeCloseTo(60, 3);
    expect(st.p95Ms).toBeCloseTo(16.667, 2);
    expect(st.p50Ms).toBeCloseTo(16.667, 2);
    expect(st.longFrames).toBe(0);
    expect(st.totalFrames).toBe(180);
    // the window holds the last 2 s only: 120 intervals of 16.7 ms (± one at the edge)
    expect(st.frames).toBeGreaterThanOrEqual(119);
    expect(st.frames).toBeLessThanOrEqual(121);
  });

  it('p95 catches a 10 % stutter the median hides; every interval over 25 ms is one long frame', () => {
    const s = new FrameStats();
    // 100 frames: 90 at 16.7 ms, 10 dropped-frame intervals of 33.3 ms (one every tenth)
    const intervals = Array.from({ length: 100 }, (_, i) => (i % 10 === 9 ? 100 / 3 : 50 / 3));
    const end = feed(s, 0, intervals);
    const st = s.stats(end);
    expect(st.frames).toBe(100); // 1.83 s of frames: all inside the 2 s window
    expect(st.p50Ms).toBeCloseTo(16.667, 2);
    expect(st.p95Ms).toBeCloseTo(33.333, 2);
    expect(st.maxMs).toBeCloseTo(33.333, 2);
    expect(st.longFrames).toBe(10);
    expect(st.fps).toBeCloseTo((1000 * 100) / (90 * (50 / 3) + 10 * (100 / 3)), 4); // the ring stores float32 intervals
  });

  it('the threshold: 25 ms is not long, 25.1 ms is', () => {
    expect(PERF_STATS.longFrameMs).toBe(25);
    const s = new FrameStats();
    const end = feed(s, 0, [25, 25.1, 16, 40]);
    expect(s.stats(end).longFrames).toBe(2);
  });

  it('the window keeps the last 2 s for fps / p95, the long count covers everything since the reset', () => {
    const s = new FrameStats();
    // 1 s of 50 ms frames (all long), then 3 s of 16.7 ms frames
    let t = feed(s, 0, Array(20).fill(50));
    t = feed2(s, t, Array(180).fill(1000 / 60));
    const st = s.stats(t);
    expect(st.longFrames).toBe(20);
    expect(st.p95Ms).toBeCloseTo(16.667, 2); // the slow second left the window
    expect(st.maxMs).toBeCloseTo(16.667, 2);
    expect(st.totalFrames).toBe(200);
    expect(st.sinceMs).toBe(t);
  });

  it('a gap over 1 s (hidden tab, background) is a pause, not a frame; a reset drops the interval straddling it', () => {
    const s = new FrameStats();
    let t = feed(s, 0, [16, 16]);
    t += 5000; // the app was in the background
    s.frame(t);
    expect(s.stats(t).totalFrames).toBe(2);
    expect(s.stats(t).longFrames).toBe(0);
    s.reset(t + 100);
    s.frame(t + 400); // straddles the screen change: only sets the clock
    s.frame(t + 416);
    const st = s.stats(t + 416);
    expect(st.totalFrames).toBe(1);
    expect(st.longFrames).toBe(0);
    expect(st.p95Ms).toBe(16);
    expect(st.sinceMs).toBe(316);
  });

  it('empty: zeros, never NaN', () => {
    const st = new FrameStats().stats(123);
    expect(st).toEqual({ fps: 0, p95Ms: 0, p50Ms: 0, maxMs: 0, frames: 0, longFrames: 0, totalFrames: 0, sinceMs: 123 });
  });

  it('the ring wraps without losing the newest frames; the sparkline is the last n intervals, oldest first', () => {
    const s = new FrameStats(8);
    const end = feed(s, 0, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    const st = s.stats(end);
    expect(st.frames).toBe(8); // the ring's capacity
    expect(st.maxMs).toBe(19);
    expect(st.totalFrames).toBe(10);
    const spark = new Float32Array(4);
    expect(s.spark(spark)).toBe(4);
    expect([...spark]).toEqual([16, 17, 18, 19]);
    const wide = new Float32Array(12);
    expect(s.spark(wide)).toBe(8);
    expect([...wide]).toEqual([0, 0, 0, 0, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('stats() and frame() allocate nothing that grows: 10 000 frames keep the ring at its capacity', () => {
    const s = new FrameStats();
    const end = feed(s, 0, Array(10_000).fill(4));
    const st = s.stats(end);
    // 2 s at 4 ms: the window (500 intervals, + the one on its edge) is inside the 512-frame ring
    expect(st.frames).toBeGreaterThanOrEqual(500);
    expect(st.frames).toBeLessThanOrEqual(Math.min(501, PERF_STATS.capacity));
    expect(st.totalFrames).toBe(10_000);
    expect(st.fps).toBeCloseTo(250, 6);
  });
});

/** `feed` continuing from an existing clock (no extra first frame). */
function feed2(s: FrameStats, t0: number, intervals: readonly number[]): number {
  let t = t0;
  for (const d of intervals) {
    t += d;
    s.frame(t);
  }
  return t;
}
