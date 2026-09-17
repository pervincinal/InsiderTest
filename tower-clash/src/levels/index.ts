/**
 * Level access (PERF-2). The eager bundle only carries `LEVEL_META` (id, name, star clocks) for the
 * level select, result screen and lock logic; a level's towers/roads arrive through `loadLevel`,
 * one small chunk per level (see the generated manifest.ts). Loaded levels are cached, so the
 * play screen can be built synchronously from `getLoadedLevel` once a level is in.
 */
import type { LevelDef } from '../sim/types';
import { LEVEL_MANIFEST } from './manifest';
import type { LevelManifestEntry } from './manifest';

export type LevelMeta = Omit<LevelManifestEntry, 'load'>;

/** Every level in play order — metadata only. `npm run levels:manifest` regenerates it from the JSON. */
export const LEVEL_META: readonly LevelMeta[] = LEVEL_MANIFEST.map(({ id, name, star3, star2 }) => ({ id, name, star3, star2 }));

/** Position of a level in play order, -1 when unknown. */
export function levelIndex(id: number): number {
  return LEVEL_META.findIndex((level) => level.id === id);
}

export function getLevelMeta(id: number): LevelMeta | undefined {
  return LEVEL_META[levelIndex(id)];
}

const cache = new Map<number, LevelDef>();
const pending = new Map<number, Promise<LevelDef>>();

/**
 * Fetch a level (once; later calls resolve from the cache). Resolves `undefined` for an unknown
 * id. A failed download is forgotten so the next call retries.
 */
export function loadLevel(id: number): Promise<LevelDef | undefined> {
  const cached = cache.get(id);
  if (cached) return Promise.resolve(cached);
  const entry = LEVEL_MANIFEST.find((level) => level.id === id);
  if (!entry) return Promise.resolve(undefined);
  let inFlight = pending.get(id);
  if (!inFlight) {
    inFlight = entry
      .load()
      .then((level) => {
        cache.set(id, level);
        return level;
      })
      .finally(() => pending.delete(id));
    pending.set(id, inFlight);
  }
  return inFlight;
}

/** The level if `loadLevel(id)` has already resolved, else undefined (never triggers a fetch). */
export function getLoadedLevel(id: number): LevelDef | undefined {
  return cache.get(id);
}

/** Every level in play order, fully loaded — scripts and tests; the game loads one level at a time. */
export function loadAllLevels(): Promise<LevelDef[]> {
  return Promise.all(LEVEL_MANIFEST.map((entry) => loadLevel(entry.id))).then((levels) =>
    levels.filter((level): level is LevelDef => level !== undefined),
  );
}
