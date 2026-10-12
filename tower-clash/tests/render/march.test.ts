import { beforeAll, describe, expect, it } from 'vitest';
import type { Owner } from '../../src/sim/types';
import { BIOME_DUST, COLOR_BLIND_PALETTE, DEFAULT_PALETTE } from '../../src/render/palette';
import type { Biome } from '../../src/render/palette';
import { ParticleSystem } from '../../src/render/particles';
import { STRIDE_HZ, STRIDE_SWING, drawUnitSprite, loadShapeSkins, pushOffDistance, soldierPose, stridePhase } from '../../src/render/sprites';
import { SOLDIER_DRAW_SCALE } from '../../src/render/layout';
import { C } from '../../src/sim/constants';

/*
 * ART-20 (TestFlight build 12: "the characters look lifeless, you can't tell they are moving"): the
 * soldier walks — two legs on a 6.5 Hz stride, phase from the unit id, a forward lean, a spear on the
 * travel side, two eyes — inside the per-unit budget of ART_DIRECTION §6 (≤ 12 fills / strokes, no
 * gradients, no save/restore), and every biome gets footstep puffs.
 */

interface Rec {
  ctx: CanvasRenderingContext2D;
  calls: string[];
  /** Points passed to moveTo / lineTo, in order. */
  pts: [number, number][];
}

function recCtx(): Rec {
  const rec: Rec = {
    ctx: null as unknown as CanvasRenderingContext2D,
    calls: [],
    pts: [],
  };
  const props: Record<string | symbol, unknown> = {};
  rec.ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key in props) return props[key];
      return (...args: unknown[]) => {
        const name = String(key);
        rec.calls.push(name);
        if (name === 'moveTo' || name === 'lineTo') rec.pts.push([args[0] as number, args[1] as number]);
        return undefined;
      };
    },
    set(_t, key, value) {
      props[key] = value;
      return true;
    },
  });
  return rec;
}

const paints = (r: Rec): number => r.calls.filter((c) => c === 'fill' || c === 'stroke' || c === 'fillRect' || c === 'strokeRect').length;

beforeAll(async () => {
  await loadShapeSkins();
});

describe('ART-20 stride', () => {
  it('a 6.5 Hz cycle whose swing matches the march at play scale (planted feet do not skate)', () => {
    expect(STRIDE_HZ).toBe(6.5);
    // a planted foot travels back 2 × swing per half cycle; the ground goes by UNIT_SPEED / (2 × STRIDE_HZ)
    const groundPerHalfCycle = C.UNIT_SPEED / (2 * STRIDE_HZ);
    expect(2 * STRIDE_SWING * SOLDIER_DRAW_SCALE).toBeCloseTo(groundPerHalfCycle, 0);
  });

  it('phase comes from the id (a column is not in lock-step) and reduced motion holds mid-stride', () => {
    expect(stridePhase(1, 1000, true)).not.toBeCloseTo(stridePhase(2, 1000, true), 2);
    expect(stridePhase(1, 1000, false)).toBe(Math.PI / 2);
    expect(stridePhase(7, 99999, false)).toBe(Math.PI / 2);
    expect(stridePhase(3, 1000 + 1000 / STRIDE_HZ, true)).toBeCloseTo(stridePhase(3, 1000, true) + 2 * Math.PI, 6);
  });

  it('push-off twice per cycle, at phase π/2 (mod π)', () => {
    expect(pushOffDistance(Math.PI / 2)).toBeCloseTo(0, 9);
    expect(pushOffDistance((3 * Math.PI) / 2)).toBeCloseTo(0, 9);
    expect(pushOffDistance(0)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('the body bobs and leans into the travel direction; the head keeps the helmet contract (centre above the body)', () => {
    const up = { ...soldierPose(100, 100, 1, 0, 0, true, 1) }; // phase from id 0 at t 0 = 0: legs passing
    const low = { ...soldierPose(100, 100, 1, 0, 0, false, 1) }; // mid-stride
    expect(up.hop).toBeGreaterThan(low.hop);
    expect(up.xTop).toBeGreaterThan(up.xBottom);
    expect(up.hx).toBeGreaterThan(100);
    const left = soldierPose(100, 100, -1, 0, 0, false, 1);
    expect(left.hx).toBeLessThan(100);
    expect(low.hy).toBeLessThan(low.bodyTop);
  });

  it('the legs alternate: over half a cycle the front foot becomes the back foot', () => {
    const feet = (nowMs: number): [number, number] => {
      const r = recCtx();
      drawUnitSprite(r.ctx, DEFAULT_PALETTE, 100, 100, 'player', 'infantry', 1, 0, 0, nowMs, true);
      // legs are the first path after the shadow: hip, knee, foot, toe per leg → foot = 3rd and 7th point
      return [r.pts[2]![0], r.pts[6]![0]];
    };
    const quarter = 1000 / STRIDE_HZ / 4;
    const [a0, a1] = feet(quarter); // phase π/2: leg 0 forward
    const [b0, b1] = feet(3 * quarter); // phase 3π/2: leg 0 back
    expect(a0).toBeGreaterThan(a1);
    expect(b0).toBeLessThan(b1);
    expect(a0 - a1).toBeGreaterThan(4.5); // ± 3.2 px swing, less the hip spread in profile
  });
});

describe('ART-20 per-unit budget (ART_DIRECTION §6)', () => {
  const owners: readonly Owner[] = ['neutral', 'player', 'enemy1', 'enemy2', 'enemy3'];
  it('clay soldier, shield bearer and robot: ≤ 12 fills / strokes, no gradients, no save / restore, no transforms', () => {
    for (const pal of [DEFAULT_PALETTE, COLOR_BLIND_PALETTE]) {
      for (const owner of owners) {
        for (const skin of [undefined, 'unit.shieldwall', 'unit.robots']) {
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0.7, -0.7],
          ] as const) {
            const r = recCtx();
            drawUnitSprite(r.ctx, pal, 50, 50, owner, 'infantry', dx, dy, 3, 1234, true, 1.45, skin);
            expect(paints(r), `${skin ?? 'clay'} ${owner}`).toBeLessThanOrEqual(12);
            for (const banned of ['save', 'restore', 'createLinearGradient', 'createRadialGradient', 'translate', 'scale', 'rotate', 'setTransform']) {
              expect(r.calls, `${skin ?? 'clay'} ${banned}`).not.toContain(banned);
            }
          }
        }
      }
    }
  });

  it('the clay soldier has two eyes (two dots in one ink fill) under the cap', () => {
    const r = recCtx();
    drawUnitSprite(r.ctx, DEFAULT_PALETTE, 50, 50, 'player', 'infantry', 1, 0, 3, 0, false);
    expect(r.calls.filter((c) => c === 'arc').length).toBeGreaterThanOrEqual(6); // outline head, face, fist, 2 eyes, cap
  });

  it('tanks draw scrolling tread links: the strokes move with time and hold still under reduced motion', () => {
    const at = (nowMs: number, motion: boolean): string => {
      const r = recCtx();
      drawUnitSprite(r.ctx, DEFAULT_PALETTE, 50, 50, 'enemy1', 'tank', 1, 0, 0, nowMs, motion);
      return JSON.stringify(r.pts.slice(0, 4));
    };
    expect(at(0, true)).not.toBe(at(30, true));
    expect(at(0, false)).toBe(at(30, false));
  });
});

describe('ART-20 footstep puffs on every biome', () => {
  it('each biome has a dust colour', () => {
    const biomes: Biome[] = ['grass', 'autumn', 'sand', 'snow', 'volcanic', 'twilight'];
    for (const b of biomes) expect(BIOME_DUST[b]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('footsteps are rate-limited per column and off under reduced motion', () => {
    const fx = new ParticleSystem(false);
    for (let t = 0; t < 1000; t += 10) fx.step('road|a', 10, 10, BIOME_DUST.grass, t);
    expect(fx.count).toBeGreaterThanOrEqual(10);
    expect(fx.count).toBeLessThanOrEqual(12);
    fx.step('road|b', 10, 10, BIOME_DUST.grass, 1000);
    expect(fx.count).toBeLessThanOrEqual(13);
    const still = new ParticleSystem(true);
    still.step('road|a', 10, 10, BIOME_DUST.snow, 0);
    expect(still.count).toBe(0);
  });
});
