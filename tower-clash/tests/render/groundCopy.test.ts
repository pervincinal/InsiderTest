import { describe, expect, it, vi } from 'vitest';
import type { PlayUi } from '../../src/render/draw';
import { drawGame } from '../../src/render/draw';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import { ParticleSystem } from '../../src/render/particles';
import type { View } from '../../src/render/view';
import type { Layers } from '../../src/render/layers';
import type { TerrainSpec } from '../../src/render/terrain';
import { copyGround, loadFit } from '../../src/render/camera';
import { copyLayer, fitCamera, groundRect } from '../../src/render/fit';
import { createState } from '../../src/sim/create';
import { makeLevel } from '../helpers';

/*
 * PERF-13: a shaking play frame moves the whole world, so the ground is re-blitted under the shake while the
 * ground layer (PERF-3) stays put. It used to be re-drawn from the terrain cache — a filtered resample of the
 * whole island (1.7 Mpx at DPR 2.75, ≈ 2.5 ms a shaking frame on the level-50 perf sample). The shake is
 * snapped to whole device px, and the ground layer already holds the island at rest at this frame's
 * resolution, so the same pixels are the layer's own, copied 1 : 1 that many device px over inside the
 * island's box (fit.ts `copyLayer`, lazy; reached through camera.ts `copyGround` once the fit chunk is in;
 * until then the old path). Non-shaking frames never touch the ground on the game canvas.
 */

interface Draw {
  src: unknown;
  args: number[];
}

/** A context tracking translate / scale / setTransform / save / restore (no rotation needed here) and recording every drawImage. */
function trackingCtx(draws: Draw[]): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = {};
  let m = { a: 1, d: 1, e: 0, f: 0 };
  const stack: (typeof m)[] = [];
  const api: Record<string, (...a: never[]) => unknown> = {
    setTransform: (a: number, _b: number, _c: number, d: number, e: number, f: number) => void (m = { a, d, e, f }),
    translate: (x: number, y: number) => void (m = { ...m, e: m.e + m.a * x, f: m.f + m.d * y }),
    scale: (x: number, y: number) => void (m = { ...m, a: m.a * x, d: m.d * y }),
    save: () => void stack.push(m),
    restore: () => void (m = stack.pop() ?? m),
    getTransform: () => ({ ...m, b: 0, c: 0, translate: () => m, scale: () => m }),
    drawImage: (src: never, ...args: never[]) => void draws.push({ src, args }),
    measureText: (s: never) => ({ width: String(s).length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createPattern: () => ({}),
  };
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (typeof key === 'string' && key in api) return api[key];
      if (key in store) return store[key];
      return () => undefined;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

// the terrain cache and the sprite caches draw into offscreen canvases: give them tracking ones
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => trackingCtx([]) }) });
const level = makeLevel();
let clock = 0;
vi.spyOn(performance, 'now').mockImplementation(() => clock);
const NOW = 10_000;
/** DPR 2 at a 0.75 fit: 1.5 device px per logical px, the map 10 CSS px down (fractional device rows). */
const DPR = 2;
const SCALE = 0.75;
const OFFSET_Y = 10.3;

function layer(name: string): Layers['ground'] {
  return { canvas: { name, width: 1080, height: 1960 } as unknown as HTMLCanvasElement, ctx: trackingCtx([]), key: '' };
}

/** One layered play frame `since` ms after a capture shake started; the game canvas' drawImage calls. */
function frame(since: number | null): { draws: Draw[]; ground: unknown; raw: { dx: number; dy: number } } {
  clock += 1000; // draw.ts re-reads the motion preference at most every 500 ms
  const draws: Draw[] = [];
  const ctx = trackingCtx(draws);
  const layers: Layers = { ground: layer('ground'), hud: layer('hud') };
  const view = { canvas: { width: 1080, height: 1960 }, ctx, dpr: DPR, cssW: 540, cssH: 980, scale: SCALE, offsetX: 0, offsetY: OFFSET_Y, insets: { top: 0, right: 0, bottom: 0, left: 0 }, layers } as unknown as View;
  const particles = new ParticleSystem();
  particles.shakeAt = since === null ? -Infinity : NOW - since;
  const ui = { level, palette: DEFAULT_PALETTE, alpha: 0, selectedTowerId: null, hoverTowerId: null, paused: false, outcome: 'playing', stars: 0, hasNext: true, speed: 1, coinsEarned: 0, coinsTotal: 0, particles } as unknown as PlayUi;
  drawGame(ctx, createState(level, 1), view, ui, NOW, true);
  return { draws, ground: layers.ground.canvas, raw: particles.shake(NOW) };
}

/** What the copy must be: the island's box at rest, rounded to device px, moved by the snapped shake. */
function expectedCopy(raw: { dx: number; dy: number }): number[] {
  const s = DPR * SCALE;
  const oy = DPR * OFFSET_Y;
  const y0 = Math.round(oy);
  const h = Math.round(oy + s * 1280) - y0;
  return [0, y0, 1080, h, Math.round(raw.dx * s), y0 + Math.round(raw.dy * s), 1080, h];
}

describe('PERF-13 shaking frame: the ground copied from its layer', () => {
  it('before the fit chunk is in: the island re-drawn from the terrain cache as before (5-argument blit onto the map)', () => {
    expect(copyGround).toBeUndefined();
    const { draws, ground } = frame(60);
    const blits = draws.filter((d) => d.args.length === 4 && d.args[2] === 720 && d.args[3] === 1280);
    expect(blits).toHaveLength(1);
    expect(blits[0]!.src).not.toBe(ground);
  });

  it('a still frame never touches the ground on the game canvas (the layer shows through)', async () => {
    await loadFit();
    const { draws, ground } = frame(null);
    expect(draws.filter((d) => d.src === ground)).toHaveLength(0);
    expect(draws.filter((d) => d.args[2] === 720 && d.args[3] === 1280)).toHaveLength(0);
  });

  it('with the chunk in: one 1 : 1 copy of the ground layer, whole device px over, no terrain re-draw', async () => {
    await loadFit();
    expect(copyGround).toBe(copyLayer);
    let tails = 0;
    for (const since of [20, 60, 140, 250, 300]) {
      const { draws, ground, raw } = frame(since);
      expect(raw.dx !== 0 || raw.dy !== 0, `the shake is on ${since} ms in`).toBe(true);
      const copies = draws.filter((d) => d.src === ground);
      if (Math.round(raw.dx * DPR * SCALE) === 0 && Math.round(raw.dy * DPR * SCALE) === 0) {
        // the shake's tail under half a device px snaps to no shake (draw.ts snapToDevice): a still frame
        expect(copies, `${since} ms`).toHaveLength(0);
        tails++;
        continue;
      }
      expect(copies, `${since} ms`).toHaveLength(1);
      expect(copies[0]!.args).toEqual(expectedCopy(raw));
      for (const v of copies[0]!.args) expect(Number.isInteger(v), `${since} ms: ${copies[0]!.args.join(',')}`).toBe(true);
      expect(draws.filter((d) => d.args.length === 4 && d.args[2] === 720 && d.args[3] === 1280)).toHaveLength(0);
    }
    expect(tails).toBeGreaterThan(0);
  });

  it('copyLayer: the box rounded to device px at rest, moved by the transform offset from rest, under the identity', () => {
    const draws: Draw[] = [];
    const ctx = trackingCtx(draws);
    const view = { dpr: 2.75, scale: 0.5458, offsetX: 3.2, offsetY: 7.9 } as View;
    const s = 2.75 * 0.5458;
    const src = {} as HTMLCanvasElement;
    ctx.setTransform(s, 0, 0, s, 2.75 * 3.2 + 4, 2.75 * 7.9 - 3); // the logical transform shaken by (4, −3) device px
    copyLayer(ctx, view, src, 10, 20, 300, 400);
    const x0 = Math.round(2.75 * 3.2 + s * 10);
    const y0 = Math.round(2.75 * 7.9 + s * 20);
    const w = Math.round(2.75 * 3.2 + s * 310) - x0;
    const h = Math.round(2.75 * 7.9 + s * 420) - y0;
    expect(draws).toEqual([{ src, args: [x0, y0, w, h, x0 + 4, y0 - 3, w, h] }]);
    expect(ctx.getTransform().e).toBeCloseTo(2.75 * 3.2 + 4, 9); // restored after the identity copy
  });

  it('a content fit copies the box its ground image covers (groundRect through the fit)', () => {
    const f = { z: 1.3, tx: -100, ty: -150 };
    const cam = fitCamera(f);
    const view = { dpr: 2, scale: 0.75, offsetX: 0, offsetY: OFFSET_Y, cssW: 540, cssH: 980 } as View;
    const draws: Draw[] = [];
    const ctx = trackingCtx(draws);
    ctx.setTransform(1.5, 0, 0, 1.5, 3, 2 * OFFSET_Y);
    const src = {} as HTMLCanvasElement;
    cam.fit!.ground(ctx, view, DEFAULT_PALETTE, { key: 'level:1' } as TerrainSpec, src);
    const r = groundRect(f, view);
    const b = { x: f.tx + f.z * r.x, y: f.ty + f.z * r.y, w: f.z * r.w, h: f.z * r.h };
    const x0 = Math.round(1.5 * b.x);
    const y0 = Math.round(2 * OFFSET_Y + 1.5 * b.y);
    const w = Math.round(1.5 * (b.x + b.w)) - x0;
    const h = Math.round(2 * OFFSET_Y + 1.5 * (b.y + b.h)) - y0;
    expect(draws).toEqual([{ src, args: [x0, y0, w, h, x0 + 3, y0, w, h] }]);
  });
});
