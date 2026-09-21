import { describe, expect, it, vi } from 'vitest';
import type { Layer, Layers } from '../../src/render/layers';
import { blankLayer, groundKey, paintGround, resizeLayers } from '../../src/render/layers';
import type { View } from '../../src/render/view';
import type { TerrainSpec } from '../../src/render/terrain';
import { DEFAULT_PALETTE, loadThemes, themeFor } from '../../src/render/palette';

// the island painter needs a real canvas; the ground layer's cache key is what is under test
vi.mock('../../src/render/terrain', () => ({ drawTerrain: vi.fn() }));

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
  fills: [number, number, number, number][];
}

function fakeLayer(w: number, h: number, key: string): { layer: Layer; rec: Recorder; canvas: FakeCanvas } {
  const rec: Recorder = { clears: [], transforms: [], fills: [] };
  const canvas: FakeCanvas = { width: w, height: h, style: { width: `${w}px`, height: `${h}px` } };
  const ctx = {
    clearRect: (x: number, y: number, cw: number, ch: number) => void rec.clears.push([x, y, cw, ch]),
    fillRect: (x: number, y: number, cw: number, ch: number) => void rec.fills.push([x, y, cw, ch]),
    setTransform: (...m: number[]) => void rec.transforms.push(m),
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    rect: () => undefined,
    clip: () => undefined,
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

  describe('ground layer and the equipped terrain theme (PERF-5)', () => {
    const view = { dpr: 2, scale: 0.5, offsetX: 0, offsetY: 0, cssW: 360, cssH: 640 } as View;
    const spec: TerrainSpec = { key: 'level:15', seed: 15, biome: 'grass', theme: 'theme.neon', roads: [], towers: [] };

    it('is keyed on the resolved theme: a lazily loaded theme that lands after the first paint repaints the ground', async () => {
      // A fresh worker has not loaded the themes chunk in this file: `themeFor` gives the default until it lands.
      // (Another test file may have loaded it already in this worker — then both keys read the theme id and the
      // test still proves the repaint-on-key-change contract below.)
      const { layer, rec } = fakeLayer(720, 1280, '');
      paintGround(layer, view, DEFAULT_PALETTE, spec, '#123456');
      const first = layer.key;
      expect(first).toBe(groundKey(view, DEFAULT_PALETTE, spec, '#123456'));
      expect(first).toContain(`|${themeFor('theme.neon').id}|`);
      expect(rec.fills, 'letterbox fill covers the rounded-up edge column / row').toEqual([[0, 0, 361, 641]]);
      // same inputs → no repaint
      paintGround(layer, view, DEFAULT_PALETTE, spec, '#123456');
      expect(rec.fills.length).toBe(1);

      await loadThemes();
      expect(themeFor('theme.neon').id).toBe('theme.neon');
      paintGround(layer, view, DEFAULT_PALETTE, spec, '#123456');
      expect(layer.key).toContain('|theme.neon|');
      expect(layer.key).not.toContain('|theme.default|');
      // the chunk landing changed the key (unless it was in before the first paint) → the ground was refilled
      expect(rec.fills.length).toBe(first === layer.key ? 1 : 2);
      // the raw sprite id never was the key: unknown ids resolve to the default look
      expect(groundKey(view, DEFAULT_PALETTE, { ...spec, theme: 'theme.bogus' }, '#123456')).toContain('|theme.default|');
    });

    it('a theme change (shop equip) repaints: the key differs, the old ground is blanked by the refill', async () => {
      await loadThemes();
      const { layer, rec } = fakeLayer(720, 1280, '');
      paintGround(layer, view, DEFAULT_PALETTE, { ...spec, theme: undefined }, '#1f8fc2');
      expect(layer.key).toContain('|theme.default|');
      paintGround(layer, view, DEFAULT_PALETTE, { ...spec, theme: 'theme.dusk' }, '#1f8fc2');
      expect(layer.key).toContain('|theme.dusk|');
      expect(rec.fills.length).toBe(2);
      // and blankLayer after a menu visit really clears it (main.ts blanks the ground on every non-play screen)
      blankLayer(layer);
      expect(layer.key).toBe('');
      expect(rec.clears).toEqual([[0, 0, 720, 1280]]);
    });
  });
});
