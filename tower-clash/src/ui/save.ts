export const SAVE_KEY = 'towerclash.save.v1';

export interface Settings {
  sendRatio: number; // 1 or 0.5
  colorBlind: boolean;
  sound: boolean;
}

export interface SaveData {
  stars: Record<string, number>; // levelId → 0..3
  coins: number;
  settings: Settings;
}

export function defaultSave(): SaveData {
  return { stars: {}, coins: 0, settings: { sendRatio: 1, colorBlind: false, sound: true } };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Parse untrusted JSON into a well-formed SaveData, filling gaps with defaults. */
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
  }
  return out;
}

export function loadSave(): SaveData {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (!text) return defaultSave();
    return normalizeSave(JSON.parse(text));
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota: play on without persistence */
  }
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
