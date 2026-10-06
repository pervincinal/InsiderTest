import { beforeEach, describe, expect, it } from 'vitest';
import type { Owner } from '../../src/sim/types';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE } from '../../src/render/palette';
import { setSpriteCacheEnabled } from '../../src/render/spriteCache';
import { HELMET_SKINS, drawUnitSprite, isShapeSkin, loadShapeSkins, needsShapeSkins, towerSpriteKey, unitStyle } from '../../src/render/sprites';
import { BRONZE, ENAMEL, HOPLITE, STRIPE } from '../../src/render/skinShapes';
import { drawSkinPreview } from '../../src/render/spritesShop';
import { SKINS } from '../../src/economy/catalog';
import { spriteSkinId } from '../../src/economy/entitlements';

/*
 * Skin drop #2 (ART-11, 2026-10-06): the crusader great helm and the spartan (Corinthian) helmet.
 * Same readability rules as skin drop #1 (tests/render/roofSkins.test.ts): the material never
 * carries ownership (each helmet keeps an owner-coloured part, and the body stays owner clay), the
 * material is ≥ 30 ΔE from every owner clay of both palettes, and the new helmets differ from the
 * five launch helmets by silhouette, not only by hue (flat-topped box with a cross slit; round
 * bowl under a tall crest). Units are not sprite-cached (only buildings are), so a helmet never
 * enters a tower key.
 */

const NEW_HELMETS = ['helmet.crusader', 'helmet.spartan'] as const;
const LAUNCH_HELMETS = ['helmet.bronze', 'helmet.viking', 'helmet.knight', 'helmet.samurai', 'helmet.royal'] as const;
const PALETTES = [DEFAULT_PALETTE, COLOR_BLIND_PALETTE];
const OWNERS: readonly Owner[] = ['neutral', 'player', 'enemy1', 'enemy2', 'enemy3'];

/* ---------- colour helpers (WCAG luminance → CIE Lab, as in roofSkins.test.ts / biome.test.ts) ---------- */

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

const MATERIAL_VS_OWNER_MIN = 30;
const MATERIAL_VS_MATERIAL_MIN = 30;
const TONES_APART_MIN = 15;

/* ---------- recording canvas context ---------- */

interface Rec {
  ctx: CanvasRenderingContext2D;
  calls: string[];
  /** fillRect calls with the fill style active at the time: [style, x, y, w, h]. */
  rects: [string, number, number, number, number][];
  /** ellipse calls with the fill style active at the time: [style, x, y, rx, ry]. */
  ellipses: [string, number, number, number, number][];
  minY: number;
}

const fmt = (a: unknown): string => (typeof a === 'number' ? a.toFixed(3) : typeof a === 'object' && a !== null ? '[obj]' : String(a));

function recCtx(): Rec {
  const rec: Rec = { ctx: null as unknown as CanvasRenderingContext2D, calls: [], rects: [], ellipses: [], minY: Infinity };
  const props: Record<string | symbol, unknown> = {};
  rec.ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      if (key in props) return props[key];
      return (...args: unknown[]) => {
        const name = String(key);
        rec.calls.push(`${name}(${args.map(fmt).join(',')})`);
        const n = args as number[];
        const fill = String(props.fillStyle);
        if (name === 'fillRect') {
          rec.rects.push([fill, n[0]!, n[1]!, n[2]!, n[3]!]);
          rec.minY = Math.min(rec.minY, n[1]!);
        } else if (name === 'ellipse') {
          rec.ellipses.push([fill, n[0]!, n[1]!, n[2]!, n[3]!]);
          rec.minY = Math.min(rec.minY, n[1]! - n[3]!);
        } else if (name === 'arc') rec.minY = Math.min(rec.minY, n[1]! - n[2]!);
        else if (name === 'moveTo' || name === 'lineTo' || name === 'quadraticCurveTo') for (let i = 1; i < n.length; i += 2) rec.minY = Math.min(rec.minY, n[i]!);
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

beforeEach(async () => {
  await loadShapeSkins();
  setSpriteCacheEnabled(false);
});

/** One helmet drawn alone at soldier scale (s = 1), head centre (100, 100), facing right. */
async function helmetAlone(id: string, owner: Owner = 'player', pal = DEFAULT_PALETTE): Promise<Rec> {
  const drawers = await loadShapeSkins();
  const rec = recCtx();
  drawers.helmet(rec.ctx, pal, unitStyle(pal, owner), id, 100, 100, 1, 1);
  return rec;
}

describe('skin drop #2 helmets: catalog, sprite ids, lazy chunk', () => {
  it('two unitHelmet shop rows on the 100 / 120 / 150 helmet ladder, each with a lazy sprite id', () => {
    const crusader = SKINS.find((s) => s.id === 'helmet_crusader');
    const spartan = SKINS.find((s) => s.id === 'helmet_spartan');
    expect(crusader).toMatchObject({ label: 'Crusader helmet', category: 'unitHelmet', costCrystals: 120, source: 'shop' });
    expect(spartan).toMatchObject({ label: 'Spartan helmet', category: 'unitHelmet', costCrystals: 150, source: 'shop' });
    const ladder = new Set(SKINS.filter((s) => s.category === 'unitHelmet' && s.source === 'shop' && !s.id.match(/crusader|spartan/)).map((s) => s.costCrystals));
    for (const s of [crusader!, spartan!]) {
      expect(ladder.has(s.costCrystals), `${s.id} adds no new helmet price point`).toBe(true);
      const id = spriteSkinId(s.id);
      expect(HELMET_SKINS).toContain(id);
      expect(isShapeSkin(id)).toBe(false); // a helmet, not a silhouette: the soldier keeps its body
      expect(needsShapeSkins({ helmet: id })).toBe(true); // drawn by the skinShapes chunk
    }
  });

  it('a helmet never enters the building cache key (units are drawn direct)', () => {
    const t = { x: 0, y: 0, owner: 'player' as const, kind: 'barracks' as const, level: 2 };
    const opts = { nowMs: 0, motion: true };
    const base = towerSpriteKey(DEFAULT_PALETTE, t, opts);
    expect(base).not.toBeNull();
    for (const helmet of NEW_HELMETS) expect(towerSpriteKey(DEFAULT_PALETTE, t, { ...opts, skin: { helmet } })).toBe(base);
  });
});

describe('skin drop #2 helmets: ownership and colour (GDD §4, ART_DIRECTION §6)', () => {
  it('each helmet keeps an owner-coloured part (crusader lid band, spartan crest) in every owner of both palettes', async () => {
    for (const pal of PALETTES) {
      for (const owner of OWNERS) {
        const tones = pal.ownerTones[owner];
        const crusader = await helmetAlone('helmet.crusader', owner, pal);
        expect(crusader.calls, `crusader ${owner}`).toContain(`fillStyle=${tones.mid}`);
        expect(crusader.calls).toContain(`fillStyle=${ENAMEL.mid}`);
        const spartan = await helmetAlone('helmet.spartan', owner, pal);
        expect(spartan.calls, `spartan ${owner}`).toContain(`fillStyle=${tones.mid}`);
        expect(spartan.calls).toContain(`fillStyle=${HOPLITE.mid}`);
      }
    }
    // on a whole soldier the body is still owner clay
    for (const pal of PALETTES) {
      for (const helmet of NEW_HELMETS) {
        const rec = recCtx();
        drawUnitSprite(rec.ctx, pal, 100, 100, 'enemy2', 'infantry', 1, 0, 3, 0, false, 1, helmet);
        expect(rec.calls.filter((c) => c === `fillStyle=${pal.ownerTones.enemy2.mid}`).length, helmet).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('enamel and hoplite bronze sit ≥ 30 ΔE from every owner mid tone of both palettes', () => {
    for (const pal of PALETTES) {
      for (const owner of OWNERS) {
        const mid = pal.ownerTones[owner].mid;
        expect(deltaE(ENAMEL.mid, mid), `enamel vs ${owner} ${mid}`).toBeGreaterThanOrEqual(MATERIAL_VS_OWNER_MIN);
        expect(deltaE(HOPLITE.mid, mid), `hoplite vs ${owner} ${mid}`).toBeGreaterThanOrEqual(MATERIAL_VS_OWNER_MIN);
      }
    }
  });

  it('the crusader is not the knight (white, not dark steel); the spartan is a deeper bronze than the Bronze helmet; the two are far apart', () => {
    const pal = DEFAULT_PALETTE;
    expect(deltaE(ENAMEL.mid, pal.metal.mid)).toBeGreaterThanOrEqual(MATERIAL_VS_MATERIAL_MIN); // knight helm
    expect(deltaE(ENAMEL.mid, BRONZE.mid)).toBeGreaterThanOrEqual(MATERIAL_VS_MATERIAL_MIN);
    expect(deltaE(ENAMEL.mid, pal.gold)).toBeGreaterThanOrEqual(MATERIAL_VS_MATERIAL_MIN); // samurai crest, royal rim
    expect(deltaE(HOPLITE.mid, pal.metal.mid)).toBeGreaterThanOrEqual(MATERIAL_VS_MATERIAL_MIN);
    expect(deltaE(HOPLITE.mid, pal.gold)).toBeGreaterThanOrEqual(MATERIAL_VS_MATERIAL_MIN);
    expect(deltaE(HOPLITE.mid, STRIPE.lit)).toBeGreaterThanOrEqual(MATERIAL_VS_MATERIAL_MIN); // viking horns, royal plume
    // same metal family as the Bronze helmet, so the silhouette (crest + full bowl) carries the difference; the tone still steps
    expect(deltaE(HOPLITE.mid, BRONZE.mid)).toBeGreaterThanOrEqual(TONES_APART_MIN);
    expect(deltaE(ENAMEL.mid, HOPLITE.mid)).toBeGreaterThanOrEqual(1.5 * MATERIAL_VS_MATERIAL_MIN);
  });

  it('each material keeps its three clay tones apart', () => {
    for (const t of [ENAMEL, HOPLITE]) {
      expect(deltaE(t.lit, t.mid)).toBeGreaterThanOrEqual(TONES_APART_MIN);
      expect(deltaE(t.mid, t.shade)).toBeGreaterThanOrEqual(TONES_APART_MIN);
      expect(deltaE(t.lit, t.shade)).toBeGreaterThanOrEqual(2 * TONES_APART_MIN);
      for (const hex of [t.lit, t.mid, t.shade]) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('skin drop #2 helmets: silhouettes differ from the launch helmets (colour-blind safe)', () => {
  it('crusader: a flat top as wide as the head and a dark cross slit (tall bar through a wide bar)', async () => {
    const rec = await helmetAlone('helmet.crusader');
    const st = unitStyle(DEFAULT_PALETTE, 'player');
    // the owner lid band is the topmost thing drawn and spans the head: a straight, flat top
    const lid = rec.rects.find((r) => r[0] === st.mid)!;
    expect(lid).toBeDefined();
    expect(lid[2]).toBeCloseTo(rec.minY, 5);
    expect(lid[3]).toBeGreaterThanOrEqual(9);
    // no dome: nothing round on the crusader (the knight / bronze / samurai / royal / viking all start from a round cap)
    expect(rec.calls.some((c) => c.startsWith('arc('))).toBe(false);
    const slits = rec.rects.filter((r) => r[0] === DEFAULT_PALETTE.metal.shade);
    expect(slits).toHaveLength(2);
    const [across, down] = slits as [[string, number, number, number, number], [string, number, number, number, number]];
    expect(across[3]).toBeGreaterThan(across[4] * 3); // wide eye slit
    expect(down[4]).toBeGreaterThan(down[3] * 3); // tall breath slit
    // they cross: the tall bar passes through the wide bar's middle
    expect(down[1]).toBeGreaterThan(across[1]);
    expect(down[1] + down[3]).toBeLessThan(across[1] + across[3]);
    expect(down[2]).toBeLessThan(across[2]);
    expect(down[2] + down[4]).toBeGreaterThan(across[2] + across[4]);
    // a long-footed cross (not a medical plus): the foot under the eye slit is at least twice the head above it
    expect(down[2] + down[4] - (across[2] + across[4])).toBeGreaterThanOrEqual(2 * (across[2] - down[2]));
  });

  it('spartan: a tall owner-coloured crest rising ≥ 5 px over the bowl, higher than every launch helmet but the royal plume', async () => {
    const rec = await helmetAlone('helmet.spartan');
    const st = unitStyle(DEFAULT_PALETTE, 'player');
    const crest = rec.ellipses.find((e) => e[0] === st.mid)!;
    expect(crest).toBeDefined();
    expect(crest[4]).toBeGreaterThan(crest[3]); // taller than wide
    const crestTop = crest[2] - crest[4];
    const bowlTop = 100 - 0.4 - 4.8; // bowl arc: centre hy - 0.4, radius 4.8
    expect(bowlTop - crestTop).toBeGreaterThanOrEqual(5);
    for (const id of LAUNCH_HELMETS) {
      if (id === 'helmet.royal') continue; // the plume is a thin stroke, not a filled crest
      const other = await helmetAlone(id);
      expect(crestTop, `spartan crest vs ${id}`).toBeLessThan(other.minY - 2);
    }
  });
});

describe('skin drop #2 helmets: every unit kind and the shop preview', () => {
  it('infantry wear them, tanks are untouched (a tank has no helmet)', () => {
    for (const pal of PALETTES) {
      for (const helmet of NEW_HELMETS) {
        const material = helmet === 'helmet.crusader' ? ENAMEL.mid : HOPLITE.mid;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0.7, -0.7],
        ] as const) {
          const soldier = recCtx();
          drawUnitSprite(soldier.ctx, pal, 50, 50, 'player', 'infantry', dx, dy, 4, 900, true, 1, helmet);
          expect(soldier.calls, `${helmet} soldier`).toContain(`fillStyle=${material}`);
          const tank = recCtx();
          drawUnitSprite(tank.ctx, pal, 50, 50, 'player', 'tank', dx, dy, 4, 900, true, 1, helmet);
          const plain = recCtx();
          drawUnitSprite(plain.ctx, pal, 50, 50, 'player', 'tank', dx, dy, 4, 900, true, 1);
          expect(tank.calls, `${helmet} tank`).toEqual(plain.calls);
        }
      }
    }
  });

  it('the skins card draws the helmet material on the preview soldier in both palettes', () => {
    for (const pal of PALETTES) {
      const crusader = recCtx();
      drawSkinPreview(crusader.ctx, pal, 50, 50, 110, 'helmet.crusader');
      expect(crusader.calls).toContain(`fillStyle=${ENAMEL.mid}`);
      expect(crusader.calls).toContain(`fillStyle=${pal.metal.shade}`); // the cross slit
      const spartan = recCtx();
      drawSkinPreview(spartan.ctx, pal, 50, 50, 110, 'helmet.spartan');
      expect(spartan.calls).toContain(`fillStyle=${HOPLITE.mid}`);
      expect(spartan.calls).toContain(`fillStyle=${pal.metal.shade}`); // the T opening
    }
  });
});
