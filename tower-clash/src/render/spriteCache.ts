/*
 * PERF-4 tower sprite cache. 91 % of a throttled frame is native canvas rasterisation, and every
 * building is re-pathed every frame (≈ 40–80 fills per tower). A building's drawing is split into
 * `fixed` parts (plinth, body, roof, battlements — nothing that moves) and `live` parts (flag,
 * banner, gem glint, smoke, barrel) in their z-order. The fixed parts between two live parts form
 * one layer, baked once into an offscreen canvas at the current device scale and blitted with
 * `drawImage` at an integer device offset; the live parts draw as before. Keys carry the palette,
 * kind, level tier, owner, roof skin, device scale and the sub-pixel phase of the anchor
 * (quantised to 1/16 device px), so a blit lands on the same pixels the direct path would.
 * A scale (DPR / resize) or palette change empties the cache; the rest ages out of a 64-entry LRU.
 */

/** Static-vs-animated split of a sprite's drawing. `DIRECT` runs both immediately. */
export interface Parts {
  /** Geometry that is the same every frame; baked into the current layer. */
  fixed(draw: () => void): void;
  /** Animated geometry, drawn live in its z-order slot; starts the next layer. */
  live(draw: () => void): void;
}

export const DIRECT: Parts = { fixed: (d) => d(), live: (d) => d() };

/** Logical-unit extents of a sprite around its anchor (all positive). */
export interface SpriteBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type Paint = (ctx: CanvasRenderingContext2D, parts: Parts) => void;

interface Entry {
  /** One canvas per layer (null = no fixed geometry in that slot). */
  layers: (HTMLCanvasElement | null)[];
  /** Integer device offset of the anchor inside every layer. */
  ox: number;
  oy: number;
}

export const SPRITE_CACHE_MAX = 64;
/** Bakes allowed inside one ~frame window (the rest of that frame draws direct, so a level start never stalls). */
const BAKES_PER_FRAME = 4;
const PHASE_STEPS = 16;

type CanvasFactory = (w: number, h: number) => HTMLCanvasElement | null;

const defaultFactory: CanvasFactory = (w, h) => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

let factory: CanvasFactory = defaultFactory;
/** `?spritecache=0` in the page URL draws every building direct (on-device A/B, pixel comparisons). */
let enabled = typeof location === 'undefined' || !/[?&]spritecache=0(&|$)/.test(location.search);
const cache = new Map<string, Entry>();
let scaleKey = '';
let bakes = 0;
let bakeWindowAt = -1;
let bakesTotal = 0;

/** Test hook: where offscreen canvases come from (null restores `document.createElement`). */
export function setSpriteCanvasFactory(f: CanvasFactory | null): void {
  factory = f ?? defaultFactory;
  invalidateSprites();
}

/** Switch the cache off (everything draws direct) or back on; off also drops the layers. */
export function setSpriteCacheEnabled(on: boolean): void {
  enabled = on;
  if (!on) invalidateSprites();
}

/** Drop every cached layer (scale / palette / skin change, tests). */
export function invalidateSprites(): void {
  cache.clear();
}

/** Entries held and bakes done so far (tests, debug overlay). */
export function spriteCacheStats(): { size: number; bakes: number } {
  return { size: cache.size, bakes: bakesTotal };
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

/** Reusable play-mode sequencer: blits the layer on the first `fixed` of each slot, runs `live` directly. */
const player = {
  ctx: null as CanvasRenderingContext2D | null,
  entry: null as Entry | null,
  m: null as DOMMatrix | null,
  x: 0,
  y: 0,
  slot: 0,
  blitted: false,
  fixed(): void {
    if (this.blitted) return;
    this.blitted = true;
    const layer = this.entry!.layers[this.slot];
    if (!layer) return;
    const ctx = this.ctx!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, this.x, this.y);
    ctx.setTransform(this.m!);
  },
  live(draw: () => void): void {
    this.slot++;
    this.blitted = false;
    draw();
  },
};

function bake(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, s: number, qx: number, qy: number, box: SpriteBox, paint: Paint): Entry | null {
  const ox = Math.ceil(box.left * s) + 1;
  const oy = Math.ceil(box.top * s) + 1;
  const w = ox + Math.ceil(box.right * s) + 2;
  const h = oy + Math.ceil(box.bottom * s) + 2;
  // dry pass (nothing is drawn): how many slots, and which of them hold fixed geometry
  const has: boolean[] = [];
  let slots = 0;
  paint(ctx, {
    fixed: () => {
      has[slots] = true;
    },
    live: () => {
      slots++;
    },
  });
  const layers: (HTMLCanvasElement | null)[] = [];
  for (let i = 0; i <= slots; i++) {
    if (!has[i]) {
      layers.push(null);
      continue;
    }
    const canvas = factory(w, h);
    const lctx = canvas?.getContext('2d');
    if (!canvas || !lctx) return null;
    lctx.setTransform(s, 0, 0, s, ox + qx - s * x, oy + qy - s * y);
    lctx.lineCap = 'round';
    let slot = 0;
    paint(lctx, {
      fixed: (d) => {
        if (slot === i) d();
      },
      live: () => {
        slot++;
      },
    });
    layers.push(canvas);
  }
  const entry: Entry = { layers, ox, oy };
  if (cache.size >= SPRITE_CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, entry);
  bakesTotal++;
  return entry;
}

/**
 * Draw `paint` at logical (x, y) through the cache. Returns false (nothing drawn) when the current
 * transform is not a uniform axis-aligned scale, no offscreen canvas is available, or this frame's
 * bake budget is spent — the caller then draws direct. `key` must name everything the fixed parts
 * depend on except scale and position.
 */
export function drawSprite(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, box: SpriteBox, paint: Paint): boolean {
  if (!enabled || typeof ctx.getTransform !== 'function') return false;
  const m = ctx.getTransform() as DOMMatrix | undefined; // test stubs return undefined
  if (!m || typeof m.a !== 'number') return false;
  const s = m.a;
  if (m.b !== 0 || m.c !== 0 || m.d !== s || !(s > 0)) return false;
  const sk = s.toFixed(4);
  if (sk !== scaleKey) {
    scaleKey = sk;
    cache.clear();
  }
  const ax = m.e + s * x;
  const ay = m.f + s * y;
  const ix = Math.round(ax);
  const iy = Math.round(ay);
  const qx = Math.round((ax - ix) * PHASE_STEPS) / PHASE_STEPS;
  const qy = Math.round((ay - iy) * PHASE_STEPS) / PHASE_STEPS;
  const full = `${key}|${qx}|${qy}`;
  let entry: Entry | null | undefined = cache.get(full);
  if (entry) {
    // LRU touch: re-insert at the tail
    cache.delete(full);
    cache.set(full, entry);
  } else {
    const t = now();
    if (t - bakeWindowAt > 8) {
      bakeWindowAt = t;
      bakes = 0;
    }
    if (bakes >= BAKES_PER_FRAME) return false;
    bakes++;
    entry = bake(ctx, full, x, y, s, qx, qy, box, paint);
    if (!entry) return false;
  }
  player.ctx = ctx;
  player.entry = entry;
  player.m = m;
  player.x = ix - entry.ox;
  player.y = iy - entry.oy;
  player.slot = 0;
  player.blitted = false;
  paint(ctx, player);
  player.ctx = null;
  player.entry = null;
  player.m = null;
  return true;
}
