import { describe, expect, it } from 'vitest';
import type { CosmeticLoaders } from '../../src/render/cosmetics';
import { pendingCosmeticChunks, preloadCosmetics, warmCosmetics } from '../../src/render/cosmetics';
import { shapeSkinsLoaded } from '../../src/render/sprites';
import { themesLoaded } from '../../src/render/palette';
import { equippedSkin } from '../../src/economy/entitlements';
import { defaultSave } from '../../src/ui/save';

/*
 * PERF-5: the roof / helmet materials, silhouettes and cosmetic terrain themes are lazy chunks.
 * `main.ts startLevel` asks `preloadCosmetics(equippedSkin(save))` before the level chunk resolves
 * so the first frame is already skinned; the shop warms both. The decision is pure and tested
 * here with fake loaders; the wiring is covered by e2e/lazy.spec.ts.
 */

const NONE = { shapes: false, themes: false };

function fakeLoaders(fail: Partial<Record<'shapes' | 'themes', boolean>> = {}) {
  const calls: string[] = [];
  const loaders: CosmeticLoaders = {
    shapes: () => {
      calls.push('shapes');
      return fail.shapes ? Promise.reject(new Error('offline')) : Promise.resolve({});
    },
    themes: () => {
      calls.push('themes');
      return fail.themes ? Promise.reject(new Error('offline')) : Promise.resolve({});
    },
  };
  return { calls, loaders };
}

describe('pendingCosmeticChunks', () => {
  it('the default look needs nothing', () => {
    expect(pendingCosmeticChunks(undefined, NONE)).toEqual([]);
    expect(pendingCosmeticChunks({}, NONE)).toEqual([]);
    expect(pendingCosmeticChunks({ roof: 'roof.default', helmet: 'helmet.default', theme: 'theme.default' }, NONE)).toEqual([]);
    expect(pendingCosmeticChunks({ roof: 'roof.bogus', theme: 'theme.bogus' }, NONE)).toEqual([]);
  });

  it('a lazy roof material, a helmet, a silhouette or a cosmetic theme names its chunk', () => {
    expect(pendingCosmeticChunks({ roof: 'roof.slate' }, NONE)).toEqual(['skinShapes']);
    expect(pendingCosmeticChunks({ roof: 'roof.gold' }, NONE)).toEqual(['skinShapes']);
    expect(pendingCosmeticChunks({ helmet: 'helmet.viking' }, NONE)).toEqual(['skinShapes']);
    expect(pendingCosmeticChunks({ roof: 'tower.keep' }, NONE)).toEqual(['skinShapes']);
    expect(pendingCosmeticChunks({ helmet: 'unit.robots' }, NONE)).toEqual(['skinShapes']);
    expect(pendingCosmeticChunks({ theme: 'theme.neon' }, NONE)).toEqual(['themes']);
    expect(pendingCosmeticChunks({ roof: 'roof.slate', theme: 'theme.neon' }, NONE)).toEqual(['skinShapes', 'themes']);
  });

  it('a chunk that is already in is not pending', () => {
    const both = { roof: 'roof.slate', theme: 'theme.neon' };
    expect(pendingCosmeticChunks(both, { shapes: true, themes: false })).toEqual(['themes']);
    expect(pendingCosmeticChunks(both, { shapes: false, themes: true })).toEqual(['skinShapes']);
    expect(pendingCosmeticChunks(both, { shapes: true, themes: true })).toEqual([]);
  });
});

describe('preloadCosmetics (startLevel / shop)', () => {
  it('equipped lazy cosmetics trigger the preload on startLevel: the save with roof_slate + theme_neon asks for both chunks', async () => {
    const save = defaultSave();
    save.skins.owned = ['roof_slate', 'theme_neon'];
    save.skins.equipped = { roof: 'roof_slate', helmet: null, theme: 'theme_neon' };
    const { calls, loaders } = fakeLoaders();
    const p = preloadCosmetics(equippedSkin(save), loaders, NONE);
    expect(p).not.toBeNull();
    expect(calls).toEqual(['shapes', 'themes']); // requested synchronously, before any level chunk resolves
    await expect(p).resolves.toBeUndefined();
  });

  it('a default save (or an unowned equipped id) needs no preload: null keeps the synchronous level start', () => {
    const { calls, loaders } = fakeLoaders();
    expect(preloadCosmetics(equippedSkin(defaultSave()), loaders, NONE)).toBeNull();
    const save = defaultSave();
    save.skins.equipped = { roof: 'roof_slate', helmet: null, theme: 'theme_neon' }; // not owned → default look
    expect(preloadCosmetics(equippedSkin(save), loaders, NONE)).toBeNull();
    expect(calls).toEqual([]);
  });

  it('a failed cosmetic download never rejects (the level still starts; draw time retries later)', async () => {
    const { calls, loaders } = fakeLoaders({ shapes: true, themes: true });
    const p = preloadCosmetics({ roof: 'tower.keep', theme: 'theme.dusk' }, loaders, NONE);
    await expect(p).resolves.toBeUndefined();
    expect(calls).toEqual(['shapes', 'themes']);
  });

  it('only the missing chunk is fetched', async () => {
    const { calls, loaders } = fakeLoaders();
    await preloadCosmetics({ helmet: 'helmet.royal', theme: 'theme.winter_night' }, loaders, { shapes: true, themes: false });
    expect(calls).toEqual(['themes']);
  });

  it('warmCosmetics (shop opened) starts both chunks and swallows failures', async () => {
    const { calls, loaders } = fakeLoaders({ themes: true });
    warmCosmetics(loaders);
    expect(calls).toEqual(['shapes', 'themes']);
    await new Promise((r) => setTimeout(r, 0)); // an unhandled rejection here would fail the run
  });

  it('with the real loaders the chunks land in vitest and the ready flags flip', async () => {
    const p = preloadCosmetics({ roof: 'roof.pagoda', theme: 'theme.neon' });
    if (p) await p; // null when an earlier test file already loaded them in this worker
    expect(shapeSkinsLoaded()).toBe(true);
    expect(themesLoaded()).toBe(true);
    expect(pendingCosmeticChunks({ roof: 'roof.pagoda', theme: 'theme.neon' })).toEqual([]);
    expect(preloadCosmetics({ roof: 'roof.pagoda', theme: 'theme.neon' })).toBeNull();
  });
});
