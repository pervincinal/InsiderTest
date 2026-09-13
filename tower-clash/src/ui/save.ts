/**
 * Persistence (GDD §4). Schema v2 adds `settings.reducedMotion`; v1 saves (key `towerclash.save.v1`)
 * are read once, migrated and written back under the v2 key so older installs keep their progress.
 */
export const SAVE_KEY = 'towerclash.save.v2';
export const SAVE_KEY_V1 = 'towerclash.save.v1';
export const SAVE_VERSION = 2;

/** Reduced-motion preference: `auto` follows the OS (`prefers-reduced-motion`), `on`/`off` override it. */
export type MotionPref = 'auto' | 'on' | 'off';

export interface Settings {
  sendRatio: number; // 1 or 0.5
  colorBlind: boolean;
  sound: boolean;
  reducedMotion: MotionPref;
}

export interface SaveData {
  version: number;
  stars: Record<string, number>; // levelId → 0..3
  coins: number;
  settings: Settings;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    stars: {},
    coins: 0,
    settings: { sendRatio: 1, colorBlind: false, sound: true, reducedMotion: 'auto' },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Parse untrusted JSON (any schema version) into a well-formed v2 SaveData, filling gaps with
 * defaults. v1 had no `version` and no `reducedMotion`; both simply take the defaults.
 */
export function normalizeSave(raw: unknown): SaveData {
  const out = defaultSave();
  if (!isRecord(raw)) return out;
  if (isRecord(raw.stars)) {
    for (const [k, v] of Object.entries(raw.stars)) {
      if (typeof v === 'number' && Number.isFinite(v)) out.stars[k] = Math.max(0, Math.min(3, Math.floor(v)));
    }
  }
  if (typeof raw.coins === 'number' && Number.isFinite(raw.coins)) out.coins = Math.max(0, Math.floor(raw.coins));
  if (isRecord(raw.settings)) {
    const s = raw.settings;
    if (s.sendRatio === 0.5 || s.sendRatio === 1) out.settings.sendRatio = s.sendRatio;
    if (typeof s.colorBlind === 'boolean') out.settings.colorBlind = s.colorBlind;
    if (typeof s.sound === 'boolean') out.settings.sound = s.sound;
    if (s.reducedMotion === 'auto' || s.reducedMotion === 'on' || s.reducedMotion === 'off') out.settings.reducedMotion = s.reducedMotion;
  }
  return out;
}

/** Minimal storage surface so migration can be unit-tested without a DOM. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): SaveStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Load the v2 save, or migrate a v1 save (written back under the v2 key; the v1 entry is left
 * untouched so a downgrade still finds it). Corrupt JSON falls back to a fresh save.
 */
export function loadSaveFrom(store: SaveStorage | null): SaveData {
  if (!store) return defaultSave();
  try {
    const v2 = store.getItem(SAVE_KEY);
    if (v2) return normalizeSave(JSON.parse(v2));
    const v1 = store.getItem(SAVE_KEY_V1);
    if (!v1) return defaultSave();
    const migrated = normalizeSave(JSON.parse(v1));
    try {
      store.setItem(SAVE_KEY, JSON.stringify(migrated));
    } catch {
      /* quota: play on with the migrated copy in memory */
    }
    return migrated;
  } catch {
    return defaultSave();
  }
}

export function loadSave(): SaveData {
  return loadSaveFrom(storage());
}

export function writeSave(data: SaveData): void {
  try {
    data.version = SAVE_VERSION;
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota: play on without persistence */
  }
}

/** Wipe stars and coins (settings survive) and persist. */
export function resetProgress(data: SaveData): void {
  data.stars = {};
  data.coins = 0;
  writeSave(data);
}

/** Spend coins on a booster. Returns false (and changes nothing) when unaffordable. */
export function spendCoins(data: SaveData, amount: number): boolean {
  if (amount < 0 || data.coins < amount) return false;
  data.coins -= amount;
  writeSave(data);
  return true;
}

/** Stars by clear time (GDD §2.4). */
export function starsFor(level: { star3: number; star2: number }, timeMs: number): number {
  if (timeMs <= level.star3) return 3;
  if (timeMs <= level.star2) return 2;
  return 1;
}

/** Record a win. Returns coins earned (10 per *new* star, first-clear semantics per star). */
export function recordWin(data: SaveData, levelId: number, stars: number, coinsPerStar: number): number {
  const key = String(levelId);
  const before = data.stars[key] ?? 0;
  const after = Math.max(before, stars);
  const earned = Math.max(0, after - before) * coinsPerStar;
  data.stars[key] = after;
  data.coins += earned;
  writeSave(data);
  return earned;
}

/**
 * Level locking (M1-3b): the first level is always open; level N+1 opens once level N has ≥1 star.
 * `levels` is the ordered level list (only `id` is read) and `index` the position in it.
 */
export function isLevelUnlocked(data: SaveData, levels: readonly { id: number }[], index: number): boolean {
  if (index <= 0) return index === 0 && levels.length > 0;
  const prev = levels[index - 1];
  if (!prev) return false;
  return (data.stars[String(prev.id)] ?? 0) >= 1;
}
