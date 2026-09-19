import { describe, expect, it } from 'vitest';
import type { Layer, Layers } from '../../src/render/layers';
import { blankLayer, resizeLayers } from '../../src/render/layers';

/*
 * PERF-3 static layers. The invariant every caller relies on: `layer.key === ''` means the layer's
 * pixels are transparent. `main.ts` / `drawGame` blank the HUD layer through `blankLayer`, which
 * short-circuits on an empty key — so whoever resets the key must also clear the pixels.
 */

interface FakeCanvas {
  width: number;
  height: number;
  style: { width: string; height: string };
}

interface Recorder {
  clears: [number, number, number, number][];
  transforms: number[][];
}

function fakeLayer(w: number, h: number, key: string): { layer: Layer; rec: Recorder; canvas: FakeCanvas } {
  const rec: Recorder = { clears: [], transforms: [] };
  const canvas: FakeCanvas = { width: w, height: h, style: { width: `${w}px`, height: `${h}px` } };
  const ctx = {
    clearRect: (x: number, y: number, cw: number, ch: number) => void rec.clears.push([x, y, cw, ch]),
    setTransform: (...m: number[]) => void rec.transforms.push(m),
  } as unknown as CanvasRenderingContext2D;
  return { layer: { canvas: canvas as unknown as HTMLCanvasElement, ctx, key }, rec, canvas };
}

function game(w: number, h: number): HTMLCanvasElement {
  return { width: w, height: h, style: { width: `${w / 2}px`, height: `${h / 2}px` } } as unknown as HTMLCanvasElement;
}

describe('layers (PERF-3)', () => {
  it('blankLayer clears the pixels and the key; a blank layer is not cleared again', () => {
    const { layer, rec } = fakeLayer(720, 1280, 'hud|1');
    blankLayer(layer);
    expect(rec.clears).toEqual([[0, 0, 720, 1280]]);
    expect(rec.transforms).toEqual([[1, 0, 0, 1, 0, 0]]); // device space, not the logical transform
    expect(layer.key).toBe('');
    blankLayer(layer);
    blankLayer(undefined);
    expect(rec.clears.length).toBe(1);
  });

  it('resizeLayers follows the game canvas pixel and CSS size and forgets the cache keys', () => {
    const ground = fakeLayer(10, 10, 'ground|old');
    const hud = fakeLayer(10, 10, 'hud|old');
    const layers: Layers = { ground: ground.layer, hud: hud.layer };
    resizeLayers(layers, game(1080, 1920));
    for (const l of [ground, hud]) {
      expect([l.canvas.width, l.canvas.height]).toEqual([1080, 1920]);
      expect([l.canvas.style.width, l.canvas.style.height]).toEqual(['540px', '960px']);
      expect(l.layer.key).toBe('');
    }
  });

  it('a resize that keeps the pixel size (orientationchange before the metrics change, visualViewport echo) still leaves the layer blank', () => {
    // The HUD layer holds a painted frame (key set). A same-size resize resets the key; if the pixels
    // stayed, the next blankLayer (pause / result / level map) would skip the clear and the stale HUD
    // would sit above the menu on the top canvas.
    const hud = fakeLayer(1080, 1920, 'hud|painted');
    const ground = fakeLayer(1080, 1920, 'ground|painted');
    const layers: Layers = { ground: ground.layer, hud: hud.layer };
    resizeLayers(layers, game(1080, 1920));
    expect(hud.layer.key).toBe('');
    expect(hud.rec.clears, 'key reset without clearing the pixels').toContainEqual([0, 0, 1080, 1920]);
    expect(ground.rec.clears).toContainEqual([0, 0, 1080, 1920]);
    // and the top layer is really blank afterwards: blankLayer has nothing left to do
    const before = hud.rec.clears.length;
    blankLayer(hud.layer);
    expect(hud.rec.clears.length).toBe(before);
  });
});
