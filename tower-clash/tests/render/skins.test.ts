import { describe, expect, it } from 'vitest';
import type { TowerKind, UnitKind } from '../../src/sim/types';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE } from '../../src/render/palette';
import { HELMET_SKINS, ROOF_SKINS, THEME_IDS, drawTowerSprite, drawUnitSprite, isShapeSkin, loadShapeSkins } from '../../src/render/sprites';
import { drawSkinPreview } from '../../src/render/spritesShop';
import { SKINS } from '../../src/economy/catalog';
import { spriteSkinId } from '../../src/economy/entitlements';

/** Canvas context stand-in: every method is a no-op, every property is writable. */
function fakeCtx(): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = {};
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      if (key in store) return store[key];
      return () => undefined;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

const KINDS: readonly TowerKind[] = ['barracks', 'artillery', 'tankFactory', 'fortress'];
const UNITS: readonly UnitKind[] = ['infantry', 'tank'];
const PALETTES = [DEFAULT_PALETTE, COLOR_BLIND_PALETTE];

/* Skin smoke (M3-2): every skin id × kind × level draws without throwing under the node canvas stub. */
describe('skin sprites', () => {
  it('silhouette ids are recognised and the rest are not', () => {
    expect(isShapeSkin('tower.keep')).toBe(true);
    expect(isShapeSkin('unit.robots')).toBe(true);
    expect(isShapeSkin('roof.slate')).toBe(false);
    expect(isShapeSkin('helmet.viking')).toBe(false);
    expect(isShapeSkin(undefined)).toBe(false);
    expect(ROOF_SKINS.filter(isShapeSkin)).toEqual(['tower.keep', 'tower.watchtower']);
    expect(HELMET_SKINS.filter(isShapeSkin)).toEqual(['unit.shieldwall', 'unit.robots']);
    // every catalog silhouette has its sprite id in the renderer's lists
    for (const s of SKINS.filter((s) => s.category === 'towerShape')) expect(ROOF_SKINS).toContain(spriteSkinId(s.id));
    for (const s of SKINS.filter((s) => s.category === 'unitShape')) expect(HELMET_SKINS).toContain(spriteSkinId(s.id));
  });

  it('draws the default look for a silhouette skin before its chunk has loaded (no throw, no await)', () => {
    const ctx = fakeCtx();
    for (const kind of KINDS) {
      expect(() => drawTowerSprite(ctx, DEFAULT_PALETTE, { x: 0, y: 0, owner: 'player', kind, level: 2 }, { nowMs: 0, motion: false, skin: { roof: 'tower.keep' } })).not.toThrow();
    }
    expect(() => drawUnitSprite(ctx, DEFAULT_PALETTE, 0, 0, 'player', 'infantry', 1, 0, 1, 0, false, 1, 'unit.robots')).not.toThrow();
  });

  it('every roof / silhouette skin × kind × level × palette draws once the lazy chunk is loaded', async () => {
    const drawers = await loadShapeSkins();
    expect(typeof drawers.tower).toBe('function');
    expect(await loadShapeSkins()).toBe(drawers); // idempotent
    const ctx = fakeCtx();
    for (const pal of PALETTES) {
      for (const roof of ROOF_SKINS) {
        for (const kind of KINDS) {
          for (const level of [1, 2, 3]) {
            for (const owner of ['player', 'enemy1', 'neutral'] as const) {
              const look = { x: 100, y: 100, owner, kind, level };
              expect(() => drawTowerSprite(ctx, pal, look, { nowMs: 1234, motion: true, skin: { roof } })).not.toThrow();
              expect(() => drawTowerSprite(ctx, pal, look, { nowMs: 0, motion: false, skin: { roof }, pulse: 0.5, squash: 0.85, aim: 1.2 })).not.toThrow();
              expect(() => drawTowerSprite(ctx, pal, look, { nowMs: 0, motion: false, skin: { roof }, wipe: { from: 'enemy2', t: 0.4 }, raised: true })).not.toThrow();
            }
          }
        }
      }
    }
  });

  it('every helmet / unit silhouette skin × unit kind × palette draws, marching in any direction', async () => {
    await loadShapeSkins();
    const ctx = fakeCtx();
    for (const pal of PALETTES) {
      for (const helmet of HELMET_SKINS) {
        for (const kind of UNITS) {
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0.7, -0.7],
          ] as const) {
            expect(() => drawUnitSprite(ctx, pal, 10, 10, 'player', kind, dx, dy, 7, 900, true, 1, helmet)).not.toThrow();
            expect(() => drawUnitSprite(ctx, pal, 10, 10, 'enemy3', kind, dx, dy, 7, 0, false, 0.4, helmet)).not.toThrow();
          }
        }
      }
    }
  });

  it('draws a shop preview for every catalog skin id in both palettes', async () => {
    await loadShapeSkins();
    const ctx = fakeCtx();
    const ids = new Set<string>([...ROOF_SKINS, ...HELMET_SKINS, ...THEME_IDS, ...SKINS.map((s) => spriteSkinId(s.id))]);
    for (const pal of PALETTES) for (const id of ids) expect(() => drawSkinPreview(ctx, pal, 50, 50, 110, id)).not.toThrow();
  });
});
