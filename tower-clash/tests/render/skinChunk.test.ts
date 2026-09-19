import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE } from '../../src/render/palette';

/*
 * M3-2 silhouette skins live in a lazy chunk (`import('./skinShapes')`). A failed download must
 * leave the game drawable with the default look AND be retried later, like the level chunks and
 * the lazy screens (`main.ts loadLazy`): a player who equips Round keep on a flaky connection
 * should not be stuck with the default towers until the next reload.
 */

const SKIN_SHAPES = '../../src/render/skinShapes';

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

afterEach(() => {
  vi.doUnmock(SKIN_SHAPES);
  vi.resetModules();
});

describe('skinShapes lazy chunk', () => {
  it('a failed chunk download keeps the default look drawable and is retried on the next load', async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock(SKIN_SHAPES, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return vi.importActual(SKIN_SHAPES);
    });
    const sprites = await import('../../src/render/sprites');
    await expect(sprites.loadShapeSkins()).rejects.toThrow(); // vitest wraps the factory error; the message is not the point
    expect(attempts).toBe(1);

    // default look while the chunk is missing: no throw, no await
    const ctx = fakeCtx();
    expect(() => sprites.drawTowerSprite(ctx, DEFAULT_PALETTE, { x: 0, y: 0, owner: 'player', kind: 'barracks', level: 2 }, { nowMs: 0, motion: false, skin: { roof: 'tower.keep' } })).not.toThrow();
    expect(() => sprites.drawUnitSprite(ctx, DEFAULT_PALETTE, 0, 0, 'player', 'infantry', 1, 0, 1, 0, false, 1, 'unit.robots')).not.toThrow();

    // the draw above kicked off a retry; an explicit load now resolves with the real drawers
    const drawers = await sprites.loadShapeSkins();
    expect(typeof drawers.tower).toBe('function');
    expect(typeof drawers.unit).toBe('function');
    expect(attempts).toBe(2);
    expect(await sprites.loadShapeSkins()).toBe(drawers); // and stays cached
    expect(attempts).toBe(2);
  });
});
