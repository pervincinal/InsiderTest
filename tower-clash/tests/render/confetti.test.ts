import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import { ParticleSystem } from '../../src/render/particles';

/*
 * AUD-F4 (tech-artist half): the victory confetti is spawned at the outcome and the result card waits a
 * 600 ms beat (play.ts RESULT_BEAT_MS), so the band must already be on screen during that beat — it used
 * to start above the map (y −320…−20) and only 1–2 of 90 pieces were visible by +600 ms.
 */

/** Canvas stand-in that records `moveTo` (the first corner of each confetti piece). */
function moveCtx(): { ctx: CanvasRenderingContext2D; ys: number[] } {
  const ys: number[] = [];
  const store: Record<string | symbol, unknown> = {};
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key in store) return store[key];
      if (key === 'moveTo') return (_x: number, y: number) => void ys.push(y);
      return () => undefined;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
  return { ctx, ys };
}

describe('victory confetti (AUD-F4)', () => {
  it('all 90 pieces are on screen from the first frame and through the 600 ms beat', () => {
    const fx = new ParticleSystem(false);
    fx.onEvents([{ type: 'won', timeMs: 60_000 }], createState(makeLevel(), 1), DEFAULT_PALETTE, 1000);
    expect(fx.count).toBe(90);
    for (const t of [1016, 1304, 1600]) {
      let frame = moveCtx();
      for (let u = t === 1016 ? 1016 : t - 288; u <= t; u += 16) {
        frame = moveCtx();
        fx.draw(frame.ctx, u);
      }
      expect(frame.ys).toHaveLength(90);
      // a piece's corner sits ≤ 5 px off its centre
      expect(Math.min(...frame.ys)).toBeGreaterThanOrEqual(-6);
      expect(Math.max(...frame.ys)).toBeLessThan(700);
    }
  });

  it('reduced motion: no confetti', () => {
    const fx = new ParticleSystem(true);
    fx.onEvents([{ type: 'won', timeMs: 60_000 }], createState(makeLevel(), 1), DEFAULT_PALETTE, 1000);
    expect(fx.count).toBe(0);
  });
});
