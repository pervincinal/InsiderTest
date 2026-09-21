import type { TowerSkin } from './sprites';
import { loadShapeSkins, needsShapeSkins, shapeSkinsLoaded } from './sprites';
import { isLazyTheme, loadThemes, themesLoaded } from './palette';

/*
 * Cosmetic chunk preload (PERF-5). The roof / helmet materials and silhouettes (src/render/
 * skinShapes.ts) and the terrain themes (src/render/themes.ts) are lazy chunks: without a preload
 * the first frame or two of a level draw the default look until they land. `main.ts` asks here
 * what the equipped skins still need before a level starts (and warms both when the shop opens);
 * the sprites / palette modules keep their draw-time fallback, so nothing here is load-bearing.
 */

export type CosmeticChunk = 'skinShapes' | 'themes';

export interface CosmeticLoaders {
  shapes(): Promise<unknown>;
  themes(): Promise<unknown>;
}

const REAL_LOADERS: CosmeticLoaders = { shapes: loadShapeSkins, themes: loadThemes };

/** The lazy chunks `skin` draws with that are not in yet (`loaded` overrides the live flags for tests). */
export function pendingCosmeticChunks(skin: TowerSkin | undefined, loaded: { shapes: boolean; themes: boolean } = { shapes: shapeSkinsLoaded(), themes: themesLoaded() }): CosmeticChunk[] {
  const out: CosmeticChunk[] = [];
  if (!loaded.shapes && needsShapeSkins(skin)) out.push('skinShapes');
  if (!loaded.themes && isLazyTheme(skin?.theme)) out.push('themes');
  return out;
}

/**
 * Start every chunk the equipped skins still need. Resolves once they are all in — or have
 * failed: a missing cosmetic must never hold a level back, so this never rejects (the draw-time
 * fallback retries later). Null when nothing is pending, so callers keep their synchronous path.
 */
export function preloadCosmetics(skin: TowerSkin | undefined, loaders: CosmeticLoaders = REAL_LOADERS, loaded?: { shapes: boolean; themes: boolean }): Promise<void> | null {
  const pending = pendingCosmeticChunks(skin, loaded);
  if (pending.length === 0) return null;
  const loads = pending.map((chunk) => (chunk === 'skinShapes' ? loaders.shapes() : loaders.themes()).catch(() => undefined));
  return Promise.all(loads).then(() => undefined);
}

/** Warm both cosmetic chunks in the background (the shop previews every skin); failures are swallowed. */
export function warmCosmetics(loaders: CosmeticLoaders = REAL_LOADERS): void {
  void loaders.shapes().catch(() => undefined);
  void loaders.themes().catch(() => undefined);
}
