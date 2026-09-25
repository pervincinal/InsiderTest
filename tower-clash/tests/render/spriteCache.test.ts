import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Owner, TowerKind } from '../../src/sim/types';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE } from '../../src/render/palette';
import { DIRECT, SPRITE_CACHE_MAX, drawSprite, invalidateSprites, setSpriteCanvasFactory, spriteCacheStats } from '../../src/render/spriteCache';
import type { Parts } from '../../src/render/spriteCache';
import { drawTowerSprite, paletteId, towerBox, towerSpriteKey, towerTop } from '../../src/render/sprites';

/*
 * PERF-4 tower sprite cache: fixed parts of a building are baked once per (palette, kind, tier,
 * owner, roof skin, scale, sub-pixel phase) into offscreen layers and blitted; live parts (flag,
 * banner, gems, smoke, barrel) draw every frame. No DOM here: canvases come from a fake factory
 * and every context is a recording proxy.
 */

interface Rec {
  ctx: CanvasRenderingContext2D;
  calls: string[];
  /** Extents of every path / rect coordinate seen (logical units, as passed). */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const PATH_OPS = new Set(['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'fillRect', 'strokeRect']);

function recCtx(transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }): Rec {
  const rec: Rec = { ctx: null as unknown as CanvasRenderingContext2D, calls: [], minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const props: Record<string | symbol, unknown> = {};
  const track = (x: number, y: number, rx = 0, ry = rx): void => {
    rec.minX = Math.min(rec.minX, x - rx);
    rec.maxX = Math.max(rec.maxX, x + rx);
    rec.minY = Math.min(rec.minY, y - ry);
    rec.maxY = Math.max(rec.maxY, y + ry);
  };
  rec.ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'getTransform') return () => ({ ...transform });
      if (key === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (key in props) return props[key];
      return (...args: number[]) => {
        const name = String(key);
        rec.calls.push(name);
        if (!PATH_OPS.has(name)) return undefined;
        switch (name) {
          case 'arc':
            track(args[0]!, args[1]!, args[2]!);
            break;
          case 'ellipse':
            track(args[0]!, args[1]!, args[2]!, args[3]!);
            break;
          case 'rect':
          case 'fillRect':
          case 'strokeRect':
            track(args[0]!, args[1]!);
            track(args[0]! + args[2]!, args[1]! + args[3]!);
            break;
          default:
            for (let i = 0; i + 1 < args.length; i += 2) track(args[i]!, args[i + 1]!);
        }
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

interface FakeCanvas {
  width: number;
  height: number;
  rec: Rec;
}

let canvases: FakeCanvas[] = [];

function installFactory(): void {
  canvases = [];
  setSpriteCanvasFactory((w, h) => {
    const rec = recCtx();
    const c: FakeCanvas = { width: w, height: h, rec };
    canvases.push(c);
    return { width: w, height: h, getContext: () => rec.ctx } as unknown as HTMLCanvasElement;
  });
}

const look = (kind: TowerKind, level: number, owner: Owner = 'player', x = 100, y = 200) => ({ x, y, kind, level, owner });
const opts = { nowMs: 0, motion: true };
const count = (calls: string[], name: string): number => calls.filter((c) => c === name).length;

/** Fake clock for the per-frame bake budget: every test starts a fresh window, `tick()` opens another. */
let clock = 0;
const tick = (): number => (clock += 100);

beforeEach(() => {
  installFactory();
  clock += 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  setSpriteCanvasFactory(null);
  vi.restoreAllMocks();
});

describe('DIRECT parts', () => {
  it('runs fixed and live parts in place, in order', () => {
    const order: string[] = [];
    DIRECT.fixed(() => order.push('a'));
    DIRECT.live(() => order.push('b'));
    DIRECT.fixed(() => order.push('c'));
    expect(order).toEqual(['a', 'b', 'c']);
  });
});

describe('drawSprite', () => {
  it('bakes once and blits afterwards; live parts draw every frame', () => {
    const main = recCtx();
    let fixedRuns = 0;
    let liveRuns = 0;
    const paint = (ctx: CanvasRenderingContext2D, p: Parts): void => {
      p.fixed(() => {
        fixedRuns++;
        ctx.fillRect(0, 0, 10, 10);
      });
      p.live(() => {
        liveRuns++;
        ctx.arc(0, 0, 3, 0, 1);
      });
    };
    const box = { left: 10, right: 10, top: 20, bottom: 5 };
    expect(drawSprite(main.ctx, 'k', 50, 60, box, paint)).toBe(true);
    expect(canvases).toHaveLength(1);
    expect(count(canvases[0]!.rec.calls, 'fillRect')).toBe(1);
    expect(fixedRuns).toBe(1);
    expect(count(main.calls, 'drawImage')).toBe(1);
    expect(count(main.calls, 'fillRect')).toBe(0); // fixed geometry never touches the main context
    expect(count(main.calls, 'arc')).toBe(1);
    expect(drawSprite(main.ctx, 'k', 50, 60, box, paint)).toBe(true);
    expect(canvases).toHaveLength(1);
    expect(fixedRuns).toBe(1);
    expect(liveRuns).toBe(2);
    expect(count(main.calls, 'drawImage')).toBe(2);
    expect(spriteCacheStats()).toEqual({ size: 1, bakes: expect.any(Number) });
    expect(canvases).toHaveLength(1); // no canvas for the empty slot after the last live part
  });

  it('blits at an integer device offset with the identity transform and restores the matrix', () => {
    const main = recCtx({ a: 1.5, b: 0, c: 0, d: 1.5, e: 10.3, f: 20.7 });
    const args: unknown[][] = [];
    const ctx = new Proxy(main.ctx, {
      get(t, key) {
        if (key === 'drawImage' || key === 'setTransform') {
          return (...a: unknown[]) => {
            args.push([key, ...a]);
          };
        }
        return Reflect.get(t, key);
      },
    });
    drawSprite(ctx, 'k', 100, 100, { left: 10, right: 10, top: 10, bottom: 10 }, (c, p) => p.fixed(() => c.fillRect(0, 0, 1, 1)));
    const draw = args.find((a) => a[0] === 'drawImage')!;
    expect(Number.isInteger(draw[2])).toBe(true);
    expect(Number.isInteger(draw[3])).toBe(true);
    // anchor at device (160.3, 170.7) → rounded (160, 171); ox = ceil(15) + 1 = 16, so the blit lands at 144, 155
    expect(draw.slice(2)).toEqual([144, 155]);
    expect(args.map((a) => a[0])).toEqual(['setTransform', 'drawImage', 'setTransform']);
    expect(args[0]!.slice(1)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(args[2]![1]).toMatchObject({ a: 1.5, e: 10.3 });
    // the layer draws with the same scale and the anchor's sub-pixel phase (0.3, 0.7 → 5/16, 11/16)
    expect(canvases).toHaveLength(1);
    expect(canvases[0]!.width).toBe(16 + 15 + 2);
  });

  it('splits layers at live parts and skips slots without fixed geometry', () => {
    const main = recCtx();
    const paint = (ctx: CanvasRenderingContext2D, p: Parts): void => {
      p.fixed(() => ctx.fillRect(0, 0, 1, 1));
      p.live(() => ctx.arc(0, 0, 1, 0, 1));
      p.fixed(() => ctx.fillRect(1, 1, 1, 1));
      p.fixed(() => ctx.fillRect(2, 2, 1, 1));
      p.live(() => ctx.arc(0, 0, 2, 0, 1));
    };
    drawSprite(main.ctx, 'k', 0, 0, { left: 5, right: 5, top: 5, bottom: 5 }, paint);
    // slot 0 → layer, slot 1 (two fixed calls) → one layer, slot 2 (nothing) → no canvas
    expect(canvases.map((c) => count(c.rec.calls, 'fillRect'))).toEqual([1, 2]);
    expect(count(main.calls, 'drawImage')).toBe(2);
    expect(count(main.calls, 'arc')).toBe(2);
    main.calls.length = 0;
    drawSprite(main.ctx, 'k', 0, 0, { left: 5, right: 5, top: 5, bottom: 5 }, paint);
    expect(count(main.calls, 'drawImage')).toBe(2);
    expect(canvases).toHaveLength(2);
  });

  it('keys on the sub-pixel phase of the anchor (1/16 device px)', () => {
    const main = recCtx();
    const paint = (ctx: CanvasRenderingContext2D, p: Parts): void => p.fixed(() => ctx.fillRect(0, 0, 1, 1));
    const box = { left: 5, right: 5, top: 5, bottom: 5 };
    drawSprite(main.ctx, 'k', 10, 10, box, paint);
    tick();
    drawSprite(main.ctx, 'k', 11.02, 10, box, paint); // rounds to the same 1/16 phase
    expect(spriteCacheStats().size).toBe(1);
    tick();
    drawSprite(main.ctx, 'k', 10.5, 10, box, paint);
    expect(spriteCacheStats().size).toBe(2);
  });

  it('falls back to direct drawing under rotation / non-uniform scale or without a canvas factory', () => {
    const skewed = recCtx({ a: 1, b: 0.2, c: 0, d: 1, e: 0, f: 0 });
    const paint = (ctx: CanvasRenderingContext2D, p: Parts): void => p.fixed(() => ctx.fillRect(0, 0, 1, 1));
    expect(drawSprite(skewed.ctx, 'k', 0, 0, { left: 1, right: 1, top: 1, bottom: 1 }, paint)).toBe(false);
    expect(canvases).toHaveLength(0);
    const stretched = recCtx({ a: 1, b: 0, c: 0, d: 0.85, e: 0, f: 0 });
    expect(drawSprite(stretched.ctx, 'k', 0, 0, { left: 1, right: 1, top: 1, bottom: 1 }, paint)).toBe(false);
    setSpriteCanvasFactory(() => null);
    expect(drawSprite(recCtx().ctx, 'k', 0, 0, { left: 1, right: 1, top: 1, bottom: 1 }, paint)).toBe(false);
  });

  it('empties itself when the device scale changes and on invalidateSprites()', () => {
    const paint = (ctx: CanvasRenderingContext2D, p: Parts): void => p.fixed(() => ctx.fillRect(0, 0, 1, 1));
    const box = { left: 1, right: 1, top: 1, bottom: 1 };
    drawSprite(recCtx().ctx, 'a', 0, 0, box, paint);
    drawSprite(recCtx().ctx, 'b', 0, 0, box, paint);
    expect(spriteCacheStats().size).toBe(2);
    drawSprite(recCtx({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }).ctx, 'a', 0, 0, box, paint);
    expect(spriteCacheStats().size).toBe(1);
    invalidateSprites();
    expect(spriteCacheStats().size).toBe(0);
  });

  it(`holds at most ${SPRITE_CACHE_MAX} entries, evicting the least recently used`, () => {
    const main = recCtx();
    const paint = (ctx: CanvasRenderingContext2D, p: Parts): void => p.fixed(() => ctx.fillRect(0, 0, 1, 1));
    const box = { left: 1, right: 1, top: 1, bottom: 1 };
    const draw = (key: string): void => {
      tick(); // a fresh bake window per draw
      drawSprite(main.ctx, key, 0, 0, box, paint);
    };
    for (let i = 0; i < SPRITE_CACHE_MAX; i++) draw(`k${i}`);
    expect(spriteCacheStats().size).toBe(SPRITE_CACHE_MAX);
    draw('k0'); // touch the oldest so it survives
    const before = canvases.length;
    draw('new');
    expect(spriteCacheStats().size).toBe(SPRITE_CACHE_MAX);
    expect(canvases.length).toBe(before + 1);
    draw('k0'); // still cached → no bake
    expect(canvases.length).toBe(before + 1);
    draw('k1'); // evicted (least recently used) → baked again
    expect(canvases.length).toBe(before + 2);
  });

  it('bakes at most four sprites per frame window; the rest of the frame draws direct', () => {
    const main = recCtx();
    const paint = (ctx: CanvasRenderingContext2D, p: Parts): void => p.fixed(() => ctx.fillRect(0, 0, 1, 1));
    const box = { left: 1, right: 1, top: 1, bottom: 1 };
    const results = ['a', 'b', 'c', 'd', 'e'].map((k) => drawSprite(main.ctx, k, 0, 0, box, paint));
    expect(results).toEqual([true, true, true, true, false]);
    tick();
    expect(drawSprite(main.ctx, 'e', 0, 0, box, paint)).toBe(true);
  });
});

describe('tower sprites through the cache', () => {
  it('draws a barracks once into a layer, then only blits + live parts (flag, gems)', () => {
    const main = recCtx();
    drawTowerSprite(main.ctx, DEFAULT_PALETTE, look('barracks', 1), opts);
    expect(canvases).toHaveLength(1);
    const layer = canvases[0]!.rec;
    expect(count(layer.calls, 'fill')).toBeGreaterThan(10); // plinth, body, door, awning, roof
    expect(count(main.calls, 'drawImage')).toBe(1);
    const liveFills = count(main.calls, 'fill');
    expect(liveFills).toBeGreaterThan(0); // gems + flag
    expect(liveFills).toBeLessThan(count(layer.calls, 'fill'));
    const layerFills = count(layer.calls, 'fill');
    drawTowerSprite(main.ctx, DEFAULT_PALETTE, look('barracks', 1), { nowMs: 500, motion: true });
    expect(canvases).toHaveLength(1);
    expect(count(layer.calls, 'fill')).toBe(layerFills);
    expect(count(main.calls, 'drawImage')).toBe(2);
  });

  it('keys on palette, kind, level tier, owner and roof skin — not on position or level ≥ 3', () => {
    const main = recCtx();
    const draw = (kind: TowerKind, level: number, owner: Owner, pal = DEFAULT_PALETTE, roof?: string): void => {
      tick();
      drawTowerSprite(main.ctx, pal, look(kind, level, owner, 100 + spriteCacheStats().bakes * 16, 200), { ...opts, skin: roof ? { roof } : undefined });
    };
    draw('barracks', 1, 'player');
    draw('barracks', 1, 'player');
    expect(spriteCacheStats().size).toBe(1);
    draw('barracks', 1, 'enemy1');
    expect(spriteCacheStats().size).toBe(2);
    draw('barracks', 2, 'enemy1');
    expect(spriteCacheStats().size).toBe(3);
    draw('barracks', 3, 'enemy1');
    draw('barracks', 4, 'enemy1');
    expect(spriteCacheStats().size).toBe(4);
    draw('fortress', 3, 'enemy1');
    expect(spriteCacheStats().size).toBe(5);
    draw('fortress', 3, 'enemy1', COLOR_BLIND_PALETTE);
    expect(spriteCacheStats().size).toBe(6);
    draw('fortress', 3, 'enemy1', COLOR_BLIND_PALETTE, 'roof.default');
    expect(spriteCacheStats().size).toBe(7);
  });

  it('uses two layers where a banner hangs under the roof (L2 barracks / fortress / artillery / factory)', () => {
    const main = recCtx();
    for (const kind of ['barracks', 'fortress', 'artillery', 'tankFactory'] as const) {
      canvases = [];
      installFactory();
      tick();
      drawTowerSprite(main.ctx, DEFAULT_PALETTE, look(kind, 2), opts);
      expect(canvases.length, `${kind} L2 layers`).toBe(2);
      expect(canvases.every((c) => count(c.rec.calls, 'fill') + count(c.rec.calls, 'fillRect') > 0), `${kind} both layers drawn`).toBe(true);
    }
    for (const kind of ['barracks', 'fortress', 'artillery', 'tankFactory'] as const) {
      canvases = [];
      installFactory();
      tick();
      drawTowerSprite(main.ctx, DEFAULT_PALETTE, look(kind, 1), opts);
      expect(canvases.length, `${kind} L1 layers`).toBe(1);
    }
  });

  it('keeps every fixed part inside towerBox for all kinds and tiers', () => {
    const main = recCtx();
    for (const kind of ['barracks', 'fortress', 'artillery', 'tankFactory'] as const) {
      for (const level of [1, 2, 3]) {
        canvases = [];
        installFactory();
        invalidateSprites();
        tick();
        const x = 300;
        const y = 500;
        drawTowerSprite(main.ctx, DEFAULT_PALETTE, look(kind, level, 'enemy2', x, y), opts);
        const box = towerBox(kind, level);
        const pad = 8; // stroke widths (wall ring 14 px / 2) + roundRect radii
        for (const c of canvases) {
          const r = c.rec;
          expect(r.minX, `${kind} L${level} left`).toBeGreaterThanOrEqual(x - box.left + pad);
          expect(r.maxX, `${kind} L${level} right`).toBeLessThanOrEqual(x + box.right - pad);
          expect(r.minY, `${kind} L${level} top`).toBeGreaterThanOrEqual(y - box.top + pad);
          expect(r.maxY, `${kind} L${level} bottom`).toBeLessThanOrEqual(y + box.bottom - pad);
        }
        expect(box.top).toBeGreaterThan(towerTop(kind, level));
      }
    }
  });

  it('bypasses the cache for capture squash / wipe, upgrade pulse and silhouette skins', () => {
    const t = look('barracks', 1);
    const base = `${paletteId(DEFAULT_PALETTE)}|barracks|0|player|`;
    expect(towerSpriteKey(DEFAULT_PALETTE, t, opts)).toBe(base);
    expect(towerSpriteKey(DEFAULT_PALETTE, t, { ...opts, squash: 0.9 })).toBeNull();
    expect(towerSpriteKey(DEFAULT_PALETTE, t, { ...opts, pulse: 0.5 })).toBeNull();
    expect(towerSpriteKey(DEFAULT_PALETTE, t, { ...opts, wipe: { from: 'enemy1', t: 0.3 } })).toBeNull();
    expect(towerSpriteKey(DEFAULT_PALETTE, t, { ...opts, wipe: { from: 'enemy1', t: 1 } })).toBe(base);
    expect(towerSpriteKey(DEFAULT_PALETTE, t, { ...opts, skin: { roof: 'tower.keep' } })).toBeNull();
    // a cosmetic roof material waits for its chunk: default cone meanwhile, never cached as that
    expect(towerSpriteKey(DEFAULT_PALETTE, t, { ...opts, skin: { roof: 'roof.gold' } })).toBeNull();
    // helmets and themes do not touch the building
    expect(towerSpriteKey(DEFAULT_PALETTE, t, { ...opts, skin: { helmet: 'helmet.default', theme: 'theme.dusk' } })).toBe(base);
    const main = recCtx();
    drawTowerSprite(main.ctx, DEFAULT_PALETTE, t, { ...opts, squash: 0.9 });
    expect(canvases).toHaveLength(0);
    expect(count(main.calls, 'fill')).toBeGreaterThan(10);
  });
});
