import { C } from '../sim/constants';
import type { GameState } from '../sim/types';
import type { Palette } from './palette';
import type { View } from './view';
import type { TerrainSpec } from './terrain';
import { drawTerrain } from './terrain';
import type { PlayUi } from './draw';
import { drawHud, hudKey } from './hud';

/*
 * Static layers (PERF-3): two extra `<canvas>` elements stacked with the game canvas, each
 * repainted only when its cache key changes and composited by the browser for free.
 *   ground (below): letterbox colour + the cached island (`getTerrain`), repainted on level /
 *                   palette / theme / viewport change;
 *   hud (above):    `drawHud`, repainted when a HUD input changes (clock once a second, counts,
 *                   toast…); `pointer-events: none` so input still lands on the game canvas.
 * The game canvas in between is cleared (not filled) every frame, so the ground shows through.
 * Menus paint their own opaque background over the ground layer; the HUD layer is blanked
 * whenever the play screen does not use it (pause / result overlays, tutorial, other screens).
 */

export interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Cache key of the current contents; '' = blank. */
  key: string;
}

export interface Layers {
  ground: Layer;
  hud: Layer;
}

function layerFor(id: string, game: HTMLCanvasElement, below: boolean, opaque: boolean): Layer {
  const found = document.getElementById(id);
  let canvas: HTMLCanvasElement;
  if (found instanceof HTMLCanvasElement) canvas = found;
  else {
    canvas = document.createElement('canvas');
    canvas.id = id;
    game.parentElement?.insertBefore(canvas, below ? game : game.nextSibling);
  }
  const ctx = canvas.getContext('2d', opaque ? { alpha: false } : undefined);
  if (!ctx) throw new Error('2D canvas context not available');
  return { canvas, ctx, key: '' };
}

/** Attach the `#ground` / `#hud` canvases around the game canvas (created if index.html lacks them). */
export function createLayers(game: HTMLCanvasElement): Layers {
  return {
    ground: layerFor('ground', game, true, true),
    hud: layerFor('hud', game, false, false),
  };
}

/** Match the game canvas' pixel and CSS size (called from `resize`); a resize blanks both layers. */
export function resizeLayers(layers: Layers, game: HTMLCanvasElement): void {
  for (const layer of [layers.ground, layers.hud]) {
    const c = layer.canvas;
    if (c.width !== game.width) c.width = game.width;
    if (c.height !== game.height) c.height = game.height;
    c.style.width = game.style.width;
    c.style.height = game.style.height;
    layer.key = '';
  }
}

export function blankLayer(layer: Layer | undefined): void {
  if (!layer || layer.key === '') return;
  layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
  layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
  layer.key = '';
}

/** Logical (720×1280) transform + map clip on a layer context (mirrors view.ts for `view.ctx`). */
function logical(ctx: CanvasRenderingContext2D, view: View): void {
  const s = view.dpr * view.scale;
  ctx.setTransform(s, 0, 0, s, view.dpr * view.offsetX, view.dpr * view.offsetY);
  ctx.beginPath();
  ctx.rect(0, 0, C.MAP_W, C.MAP_H);
  ctx.clip();
}

export function paintGround(layer: Layer, view: View, pal: Palette, spec: TerrainSpec, letterbox: string): void {
  const key = `${spec.key}|${spec.biome ?? ''}|${spec.theme ?? ''}|${pal.owners.enemy1}|${letterbox}|${view.dpr}|${view.scale}|${view.offsetX}|${view.offsetY}`;
  if (layer.key === key) return;
  const ctx = layer.ctx;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = letterbox;
  ctx.fillRect(0, 0, view.cssW, view.cssH);
  ctx.save();
  logical(ctx, view);
  drawTerrain(ctx, view, pal, spec);
  ctx.restore();
  layer.key = key;
}

export function paintHud(layer: Layer, view: View, state: GameState, ui: PlayUi, nowMs: number): void {
  const key = `${view.dpr}|${view.scale}|${view.offsetX}|${view.offsetY}|${hudKey(state, ui, nowMs)}`;
  if (layer.key === key) return;
  const ctx = layer.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
  ctx.save();
  logical(ctx, view);
  drawHud(ctx, state, view, ui, nowMs);
  ctx.restore();
  layer.key = key;
}
