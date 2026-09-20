import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTE, loadThemes, themeFor, themedBiome } from '../../src/render/palette';
import { ParticleSystem, loadEconomyBursts } from '../../src/render/particles';
import { defaultSave } from '../../src/ui/save';
import { initAudio, loadSfxRecipes, playSfx, unlockAudio } from '../../src/audio/index';
import { FakeAudioContext } from '../audio/fakeAudio';

/*
 * PERF: three more lazy chunks next to the silhouette skins — the cosmetic terrain themes
 * (src/render/themes.ts), the purchase / reward particle bursts (src/render/particlesEconomy.ts)
 * and the synth voices + SFX recipes (src/audio/recipes.ts). Each must leave the default look /
 * silence in place until it lands, never throw, and behave exactly as before once loaded.
 */

function fakeCtx(): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = {};
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
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
  vi.doUnmock('../../src/render/themes');
});

describe('themes chunk', () => {
  it('cosmetic ids give the untinted default until the chunk lands, then their own theme', async () => {
    // before the load resolves: default (the call starts the download); unknown ids never load
    expect(themeFor('theme.dusk').id).toBe('theme.default');
    expect(themeFor(undefined).id).toBe('theme.default');
    expect(themeFor('theme.bogus').id).toBe('theme.default');
    const themes = await loadThemes();
    expect(await loadThemes()).toBe(themes); // idempotent
    expect(themeFor('theme.dusk').id).toBe('theme.dusk');
    expect(themeFor('theme.winter_night').id).toBe('theme.winter_night');
    expect(themeFor('theme.neon').id).toBe('theme.neon');
    expect(themeFor('theme.bogus').id).toBe('theme.default');
    // glow specks only for the themes that declare a glow colour
    expect(themeFor('theme.dusk').drawGlow).toBeUndefined();
    expect(typeof themeFor('theme.neon').drawGlow).toBe('function');
    expect(() => themeFor('theme.neon').drawGlow!(fakeCtx(), [{ x: 1, y: 2, len: 2, phase: 0 }], 0.5)).not.toThrow();
  });

  it('re-lights biome colours through the theme; the default theme returns the biome untouched', async () => {
    await loadThemes();
    const grass = DEFAULT_PALETTE.biomes.grass;
    expect(themedBiome(grass, themeFor('theme.default'), 'grass')).toBe(grass);
    const neon = themedBiome(grass, themeFor('theme.neon'), 'grass');
    expect(neon.path).toEqual({ lit: '#3b2a6c', shade: '#ff4fd8' }); // explicit road colours
    expect(neon.dots).toEqual(['#4ffff0', '#ff4fd8', '#ffe14f']);
    expect(neon.grass.mid).not.toBe(grass.grass.mid);
    expect(themedBiome(grass, themeFor('theme.neon'), 'grass')).toBe(neon); // memoised
    const dusk = themedBiome(grass, themeFor('theme.dusk'), 'grass');
    expect(dusk.grass.mid).toMatch(/^#[0-9a-f]{6}$/);
    expect(dusk.grass.mid).not.toBe(neon.grass.mid);
  });
});

describe('particlesEconomy chunk', () => {
  it('coin / crystal bursts spawn once the chunk is in (a burst before that spawns when it lands) and paint', async () => {
    const ps = new ParticleSystem(false);
    ps.coinBurst(100, 100, 6); // may resolve later: the chunk is not awaited here
    const bursts = await loadEconomyBursts();
    expect(await loadEconomyBursts()).toBe(bursts);
    await Promise.resolve(); // the pending spawn runs on the load promise
    expect(ps.count).toBeGreaterThanOrEqual(6);
    const before = ps.count;
    ps.crystalBurst(100, 100, 5, DEFAULT_PALETTE);
    expect(ps.count).toBe(before + 5 + 7); // 5 gems + min(10, n + 2) glints, synchronous now
    const ctx = fakeCtx();
    ps.draw(ctx, 16);
    ps.draw(ctx, 32);
    expect(ps.count).toBe(before + 12); // nothing expired after 32 ms
    for (let ms = 96; ms <= 3000; ms += 64) ps.draw(ctx, ms); // a frame ages at most 64 ms; the longest coin / gem life is 1.5 s
    expect(ps.count).toBe(0);
  });

  it('spawns nothing under reduced motion', async () => {
    await loadEconomyBursts();
    const ps = new ParticleSystem(true);
    ps.coinBurst(0, 0, 10);
    ps.crystalBurst(0, 0, 10);
    expect(ps.count).toBe(0);
  });
});

describe('sfx recipes chunk', () => {
  it('play is silent (false) until the recipes are in, then schedules voices', async () => {
    const ctx = new FakeAudioContext();
    const save = defaultSave();
    initAudio(save, { factory: () => ctx, persist: () => undefined });
    expect(unlockAudio()).toBe(true);
    // the same tick: the chunk started by initAudio / unlockAudio cannot have landed yet
    expect(playSfx('button')).toBe(false);
    expect(ctx.voices()).toEqual([]);
    await loadSfxRecipes();
    expect(playSfx('button')).toBe(true);
    expect(ctx.voices().length).toBe(1);
    expect(playSfx('capture', { capture: 'gain' })).toBe(true);
    expect(ctx.voices().length).toBe(3);
    expect(playSfx('artillery')).toBe(true); // sweep + noise burst
    expect(ctx.voices().length).toBe(5);
  });
});
