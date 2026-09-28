import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Owner, TowerKind } from '../../src/sim/types';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE } from '../../src/render/palette';
import { invalidateSprites, setSpriteCacheEnabled, setSpriteCanvasFactory } from '../../src/render/spriteCache';
import { ROOF_SKINS, drawTowerSprite, loadShapeSkins, needsShapeSkins, towerBox, towerSpriteKey } from '../../src/render/sprites';
import { GLASS, SLATE, STRAW } from '../../src/render/skinShapes';
import { drawSkinPreview } from '../../src/render/spritesShop';
import { SKINS } from '../../src/economy/catalog';
import { spriteSkinId } from '../../src/economy/entitlements';

/*
 * Skin drop #1 (ART-10, 2026-09-28): the thatched cottage roof and the glass observatory dome.
 * GDD §4 / ART_DIRECTION §6 readability: the material never carries ownership (an owner band
 * stays under every eave), the material is a different colour from every owner clay of both
 * palettes and from the shipped roofs (CIE76 ΔE, same helper as tests/render/biome.test.ts), the
 * roof stays inside the sprite's offscreen box (so the badge above it is never covered and the
 * PERF-4 cache never clips it), and a cached sprite issues exactly the canvas calls of the direct
 * draw. Shop preview: the card draws the material.
 */

const NEW_ROOFS = ['roof.thatch', 'roof.glass'] as const;
const KINDS: readonly TowerKind[] = ['barracks', 'artillery', 'tankFactory', 'fortress'];
const PALETTES = [DEFAULT_PALETTE, COLOR_BLIND_PALETTE];
const OWNERS: readonly Owner[] = ['neutral', 'player', 'enemy1', 'enemy2', 'enemy3'];

/* ---------- colour helpers (WCAG luminance → CIE Lab, as in biome.test.ts) ---------- */

const channel = (h: string, i: number): number => {
  const c = parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function lab(hex: string): [number, number, number] {
  const r = channel(hex, 0);
  const g = channel(hex, 1);
  const b = channel(hex, 2);
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76 colour difference; > 30 reads as a different colour at a glance. */
function deltaE(a: string, b: string): number {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** A roof material must sit this far from every owner mid tone (the weakest shipped pair is slate vs neutral at 31). */
const MATERIAL_VS_OWNER_MIN = 30;
/** …and from the shipped materials it could be mistaken for. */
const MATERIAL_VS_MATERIAL_MIN = 30;
/** The three clay tones of one material must stay apart or the facets (and the strands / ribs on them) vanish. */
const TONES_APART_MIN = 15;

/* ---------- recording canvas context ---------- */

interface Rec {
  ctx: CanvasRenderingContext2D;
  /** Every method call (`name(args)`) and property set (`prop=value`), in order; `setTransform` is skipped. */
  calls: string[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const PATH_OPS = new Set(['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'fillRect', 'strokeRect']);
const fmt = (a: unknown): string => (typeof a === 'number' ? a.toFixed(3) : typeof a === 'object' && a !== null ? '[obj]' : String(a));

function recCtx(): Rec {
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
      if (key === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (key === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      if (key in props) return props[key];
      return (...args: unknown[]) => {
        const name = String(key);
        if (name !== 'setTransform') rec.calls.push(`${name}(${args.map(fmt).join(',')})`);
        if (!PATH_OPS.has(name)) return undefined;
        const n = args as number[];
        switch (name) {
          case 'arc':
            track(n[0]!, n[1]!, n[2]!);
            break;
          case 'ellipse':
            track(n[0]!, n[1]!, n[2]!, n[3]!);
            break;
          case 'rect':
          case 'fillRect':
          case 'strokeRect':
            track(n[0]!, n[1]!);
            track(n[0]! + n[2]!, n[1]! + n[3]!);
            break;
          default:
            for (let i = 0; i + 1 < n.length; i += 2) track(n[i]!, n[i + 1]!);
        }
        return undefined;
      };
    },
    set(_t, key, value) {
      props[key] = value;
      rec.calls.push(`${String(key)}=${String(value)}`);
      return true;
    },
  });
  return rec;
}

let layers: Rec[] = [];

function installFactory(): void {
  layers = [];
  setSpriteCanvasFactory((w, h) => {
    const rec = recCtx();
    layers.push(rec);
    return { width: w, height: h, getContext: () => rec.ctx } as unknown as HTMLCanvasElement;
  });
}

/** Fake clock so the per-frame bake budget (4 bakes / 8 ms) never makes a draw fall back to direct. */
let clock = 0;
const tick = (): number => (clock += 100);

beforeEach(async () => {
  await loadShapeSkins();
  installFactory();
  invalidateSprites();
  setSpriteCacheEnabled(true);
  clock += 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  setSpriteCanvasFactory(null);
  setSpriteCacheEnabled(true);
  vi.restoreAllMocks();
});

const look = (kind: TowerKind, level: number, owner: Owner, x = 300, y = 500) => ({ x, y, kind, level, owner });
const opts = { nowMs: 0, motion: true };

describe('skin drop #1 roofs: catalog, sprite ids, owner band', () => {
  it('two towerRoof shop rows priced in the 100–200 band, each with a lazy sprite id', () => {
    const thatch = SKINS.find((s) => s.id === 'roof_thatch');
    const glass = SKINS.find((s) => s.id === 'roof_glass');
    expect(thatch).toMatchObject({ label: 'Thatched roof', category: 'towerRoof', costCrystals: 120, source: 'shop' });
    expect(glass).toMatchObject({ label: 'Observatory dome', category: 'towerRoof', costCrystals: 150, source: 'shop' });
    for (const s of [thatch!, glass!]) {
      expect(s.costCrystals).toBeGreaterThanOrEqual(100);
      expect(s.costCrystals).toBeLessThanOrEqual(200);
      const id = spriteSkinId(s.id);
      expect(ROOF_SKINS).toContain(id);
      expect(needsShapeSkins({ roof: id })).toBe(true); // the drawing lives in the skinShapes chunk
    }
  });

  it('the material never carries ownership: an owner band stays under the eave and the roof tones are not the owner clay', async () => {
    const drawers = await loadShapeSkins();
    for (const pal of PALETTES) {
      for (const owner of OWNERS) {
        const tones = pal.ownerTones[owner];
        const thatch = drawers.roofStyle(pal, tones, 'roof.thatch');
        const glass = drawers.roofStyle(pal, tones, 'roof.glass');
        expect(thatch).toMatchObject({ shape: 'thatch', band: true, tones: STRAW });
        expect(glass).toMatchObject({ shape: 'glass', band: true, tones: GLASS });
        expect(thatch.tones).not.toBe(tones);
        expect(glass.tones).not.toBe(tones);
      }
    }
    // drawing an L2 barracks in either roof still fills owner clay (band, awning, flag, banner) — in both palettes
    for (const pal of PALETTES) {
      for (const roof of NEW_ROOFS) {
        const rec = recCtx();
        setSpriteCacheEnabled(false);
        drawTowerSprite(rec.ctx, pal, look('barracks', 2, 'enemy2'), { ...opts, skin: { roof } });
        setSpriteCacheEnabled(true);
        const owner = pal.ownerTones.enemy2;
        expect(rec.calls.filter((c) => c === `fillStyle=${owner.mid}`).length, `${roof} owner mid fills`).toBeGreaterThanOrEqual(3);
        expect(rec.calls.filter((c) => c === `fillStyle=${owner.shade}`).length, `${roof} owner shade fills`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('skin drop #1 roofs: colour readability (GDD §4, ART_DIRECTION §6)', () => {
  it('straw and glass sit ≥ 30 ΔE from every owner mid tone of both palettes', () => {
    for (const pal of PALETTES) {
      for (const owner of OWNERS) {
        const mid = pal.ownerTones[owner].mid;
        expect(deltaE(STRAW.mid, mid), `straw vs ${owner} ${mid}`).toBeGreaterThanOrEqual(MATERIAL_VS_OWNER_MIN);
        expect(deltaE(GLASS.mid, mid), `glass vs ${owner} ${mid}`).toBeGreaterThanOrEqual(MATERIAL_VS_OWNER_MIN);
      }
    }
  });

  it('straw is not gold, glass is not slate, and the two are far apart', () => {
    const pal = DEFAULT_PALETTE;
    expect(deltaE(STRAW.mid, pal.goldTones.mid)).toBeGreaterThanOrEqual(MATERIAL_VS_MATERIAL_MIN);
    expect(deltaE(STRAW.mid, SLATE.mid)).toBeGreaterThanOrEqual(MATERIAL_VS_MATERIAL_MIN);
    expect(deltaE(STRAW.mid, pal.metal.mid)).toBeGreaterThanOrEqual(MATERIAL_VS_MATERIAL_MIN);
    expect(deltaE(GLASS.mid, SLATE.mid)).toBeGreaterThanOrEqual(MATERIAL_VS_MATERIAL_MIN);
    expect(deltaE(GLASS.mid, pal.goldTones.mid)).toBeGreaterThanOrEqual(MATERIAL_VS_MATERIAL_MIN);
    expect(deltaE(GLASS.mid, pal.metal.mid)).toBeGreaterThanOrEqual(MATERIAL_VS_MATERIAL_MIN);
    expect(deltaE(STRAW.mid, GLASS.mid)).toBeGreaterThanOrEqual(60);
  });

  it('each material keeps its three clay tones apart (facets, strands and ribs stay visible)', () => {
    for (const t of [STRAW, GLASS]) {
      expect(deltaE(t.lit, t.mid)).toBeGreaterThanOrEqual(TONES_APART_MIN);
      expect(deltaE(t.mid, t.shade)).toBeGreaterThanOrEqual(TONES_APART_MIN);
      expect(deltaE(t.lit, t.shade)).toBeGreaterThanOrEqual(2 * TONES_APART_MIN);
      for (const hex of [t.lit, t.mid, t.shade]) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('skin drop #1 roofs: geometry and the PERF-4 sprite cache', () => {
  it('every fixed part of every kind × tier stays inside towerBox (under the badge, never clipped by the cache), including the L3 skirt and the artillery dome', () => {
    for (const roof of NEW_ROOFS) {
      for (const kind of KINDS) {
        for (const level of [1, 2, 3]) {
          installFactory();
          invalidateSprites();
          tick();
          const x = 300;
          const y = 500;
          drawTowerSprite(recCtx().ctx, DEFAULT_PALETTE, look(kind, level, 'player', x, y), { ...opts, skin: { roof } });
          const box = towerBox(kind, level);
          expect(layers.length, `${roof} ${kind} L${level} baked`).toBeGreaterThan(0);
          // the roof (fixed) is what the cache rasterises; live parts (flag, smoke) are drawn direct and may poke out
          for (const r of layers) {
            expect(r.minY, `${roof} ${kind} L${level} top`).toBeGreaterThanOrEqual(y - box.top + 1); // 1 px of stroke margin
            expect(r.minX, `${roof} ${kind} L${level} left`).toBeGreaterThanOrEqual(x - box.left + 1);
            expect(r.maxX, `${roof} ${kind} L${level} right`).toBeLessThanOrEqual(x + box.right - 1);
            expect(r.maxY, `${roof} ${kind} L${level} bottom`).toBeLessThanOrEqual(y + box.bottom - 1);
          }
        }
      }
    }
  });

  it('a cached tower with the new roof issues exactly the canvas calls of the direct draw (layers + live parts, in z-order)', () => {
    for (const roof of NEW_ROOFS) {
      for (const kind of KINDS) {
        for (const level of [1, 2, 3]) {
          for (const owner of ['player', 'enemy1'] as const) {
            const t = look(kind, level, owner);
            const skin = { roof };
            expect(towerSpriteKey(DEFAULT_PALETTE, t, { ...opts, skin }), `${roof} keys once the chunk is in`).toContain(roof);
            // direct
            setSpriteCacheEnabled(false);
            const direct = recCtx();
            drawTowerSprite(direct.ctx, DEFAULT_PALETTE, t, { ...opts, skin });
            // cached: bake (layers) + blit + live parts on the main context
            setSpriteCacheEnabled(true);
            installFactory();
            invalidateSprites();
            tick();
            const main = recCtx();
            drawTowerSprite(main.ctx, DEFAULT_PALETTE, t, { ...opts, skin });
            expect(layers.length, `${roof} ${kind} L${level} baked`).toBeGreaterThan(0);
            // reconstruct: each blit stands for the fixed calls of its layer (the bake's own `lineCap` prelude dropped)
            let k = 0;
            const rebuilt: string[] = [];
            for (const c of main.calls) {
              if (c.startsWith('drawImage(')) rebuilt.push(...layers[k++]!.calls.filter((lc, i) => !(i === 0 && lc === 'lineCap=round')));
              else rebuilt.push(c);
            }
            expect(k, `${roof} ${kind} L${level} every layer blitted`).toBe(layers.length);
            expect(rebuilt, `${roof} ${kind} L${level} ${owner}`).toEqual(direct.calls);
          }
        }
      }
    }
  });
});

describe('skin drop #1 roofs: shop preview', () => {
  it('the skins card draws the material (straw / glass with brass) in both palettes', () => {
    setSpriteCacheEnabled(false);
    for (const pal of PALETTES) {
      const thatch = recCtx();
      drawSkinPreview(thatch.ctx, pal, 50, 50, 110, 'roof.thatch');
      expect(thatch.calls).toContain(`fillStyle=${STRAW.mid}`);
      expect(thatch.calls).toContain(`strokeStyle=${pal.rope}`); // the rope binding
      const glass = recCtx();
      drawSkinPreview(glass.ctx, pal, 50, 50, 110, 'roof.glass');
      expect(glass.calls).toContain(`fillStyle=${GLASS.mid}`);
      expect(glass.calls).toContain('fillStyle=#c98a3e'); // BRONZE.mid: eave ring + finial
    }
  });
});
