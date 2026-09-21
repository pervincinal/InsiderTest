/**
 * Persistence (GDD §4). Schema v3 (ECONOMY.md §8, Phase A) adds the economy: `gold` (the v2
 * `coins`), `crystals`, entitlements, commander upgrades, skins, booster charges, the daily streak,
 * ad counters and the list of granted store transactions. v1 (`towerclash.save.v1`) and v2
 * (`towerclash.save.v2`) saves are read once, migrated and written back under the v3 key; the old
 * entries are left in place so a downgrade still finds them.
 */
export const SAVE_KEY = 'towerclash.save.v3';
export const SAVE_KEY_V2 = 'towerclash.save.v2';
export const SAVE_KEY_V1 = 'towerclash.save.v1';
export const SAVE_VERSION = 3;

import type { Language } from './i18n';
import { isLanguage } from './i18n';

/** Reduced-motion preference: `auto` follows the OS (`prefers-reduced-motion`), `on`/`off` override it. */
export type MotionPref = 'auto' | 'on' | 'off';

/** Rules v2 removed the send ratio; a `sendRatio` field in an older save is ignored (schema stays v3). */
export interface Settings {
  colorBlind: boolean;
  sound: boolean;
  reducedMotion: MotionPref;
  /** UI language (src/ui/i18n.ts). Absent until the first run detects it from the browser or the player picks one. */
  language?: Language;
}

/** One-time purchases the player owns (ECONOMY.md §4). */
export interface Entitlements {
  /** `remove_ads` or `premium_bundle`: no interstitials. */
  noAds: boolean;
  /** `premium_bundle` or `premium_upgrade`: exclusive skins + −10 % booster gold price. */
  premium: boolean;
  starterPack: boolean;
}

/** Cosmetic families: one skin of each can be equipped (`SKINS[].category` towerRoof / unitHelmet / terrainTheme). */
export type SkinFamily = 'roof' | 'helmet' | 'theme';

export interface SkinState {
  /** Catalog skin ids (`SKINS[].id`). */
  owned: string[];
  /** Equipped catalog skin id per family, or null for the default look. `theme` is additive to v3 (missing = none). */
  equipped: Record<SkinFamily, string | null>;
}

export interface DailyState {
  /** Local calendar day (`YYYY-MM-DD`) of the last streak claim, or null. */
  lastClaimDay: string | null;
  /** 1..7 day reached by the last claim (0 before the first claim). */
  streak: number;
}

/**
 * Daily Challenge progress (GDD §7): the last UTC day won, the consecutive-day streak and the best
 * result per day key (only the most recent `CHALLENGE_BEST_KEEP` days are kept).
 */
export interface ChallengeState {
  /** UTC day key (`YYYY-MM-DD`) of the last challenge win, or null. */
  lastWinDay: string | null;
  /** Consecutive UTC days with a win (0 before the first). */
  streak: number;
  /** Best result per day key: most stars, then the fastest clock. */
  best: Record<string, ChallengeBest>;
  /** Streak-milestone days (`STREAK_MILESTONES`) already paid in the current run; cleared when the streak restarts. */
  milestones: number[];
}

export interface ChallengeBest {
  stars: number;
  timeMs: number;
}

/** How many day keys `challenge.best` keeps (the most recent ones). */
export const CHALLENGE_BEST_KEEP = 30;

/**
 * Weekly Challenge progress (GDD §8): the last week (Monday UTC key) won, the consecutive-week
 * streak and the best result per week key (the newest `WEEKLY_BEST_KEEP` weeks, src/daily/challenge.ts).
 */
export interface WeeklyState {
  /** Monday UTC day key (`YYYY-MM-DD`) of the last weekly win, or null. */
  lastWinWeek: string | null;
  /** Consecutive weeks with a win (0 before the first). */
  streak: number;
  /** Best result per week key: most stars, then the fastest clock; `target` = the 3★ crystals were paid. */
  best: Record<string, WeeklyBest>;
}

export interface WeeklyBest extends ChallengeBest {
  target: boolean;
}

export interface AdCounters {
  /** Calendar day the rewarded counters belong to; a new day resets them. */
  day: string;
  /** Rewarded videos watched today per placement id. */
  rewardedByPlacement: Record<string, number>;
  /** Results seen (won or lost) — the interstitial gate (INTERSTITIAL_RULES.minLevelsCompleted). */
  levelsCompleted: number;
}

/** Pre-paid booster uses, consumed before gold (ECONOMY.md §3.1). */
export type BoosterCharges = { overdrive: number; freeze: number; airstrike: number };

/** Achievements (ECONOMY.md §2.1, `catalog.ACHIEVEMENTS`): ids already unlocked and paid. */
export interface AchievementState {
  unlocked: string[];
}

export interface SaveData {
  version: number;
  stars: Record<string, number>; // levelId → 0..3
  /** Soft currency (v2 `coins`). */
  gold: number;
  /** Hard currency. */
  crystals: number;
  entitlements: Entitlements;
  /** Commander upgrade tier per track id (0..5). */
  upgrades: Record<string, number>;
  skins: SkinState;
  charges: BoosterCharges;
  daily: DailyState;
  /** Daily Challenge progress (GDD §7). Added without a schema bump: missing = never played. */
  challenge: ChallengeState;
  /** Weekly Challenge progress (GDD §8). Added without a schema bump: missing = never played. */
  weekly: WeeklyState;
  adCounters: AdCounters;
  /** Store transaction ids (and `owned:<productId>` markers) already granted — never grant twice. */
  purchases: string[];
  /** Crystal milestones already paid (`levels_10`, `band_0` …). */
  milestones: string[];
  /** Replay "drill pay" earned today (daily cap). */
  replayGold: { day: string; earned: number };
  /** Consecutive defeats per level id (reset by a win); unlocks the level-skip offer. */
  defeats: Record<string, number>;
  /** Band indices (0..4) where the level skip was already used. */
  skips: number[];
  /** Unlocked achievement ids (crystals are granted once, at unlock). Added without a schema bump. */
  achievements: AchievementState;
  settings: Settings;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    stars: {},
    gold: 0,
    crystals: 0,
    entitlements: { noAds: false, premium: false, starterPack: false },
    upgrades: {},
    skins: { owned: [], equipped: { roof: null, helmet: null, theme: null } },
    charges: { overdrive: 0, freeze: 0, airstrike: 0 },
    daily: { lastClaimDay: null, streak: 0 },
    challenge: { lastWinDay: null, streak: 0, best: {}, milestones: [] },
    weekly: { lastWinWeek: null, streak: 0, best: {} },
    adCounters: { day: '', rewardedByPlacement: {}, levelsCompleted: 0 },
    purchases: [],
    milestones: [],
    replayGold: { day: '', earned: 0 },
    defeats: {},
    skips: [],
    achievements: { unlocked: [] },
    settings: { colorBlind: false, sound: true, reducedMotion: 'auto' },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function nonNegInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null;
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];
}

function countMap(v: unknown, max = Infinity): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(v)) return out;
  for (const [k, raw] of Object.entries(v)) {
    const n = nonNegInt(raw);
    if (n !== null) out[k] = Math.min(max, n);
  }
  return out;
}

/** Distinct non-negative integers, order kept (`skips`, `challenge.milestones`). */
function intList(v: unknown): number[] {
  return Array.isArray(v) ? [...new Set(v.map(nonNegInt).filter((n): n is number => n !== null))] : [];
}

function dayString(v: unknown): string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

/** A well-formed day key that is a Monday (UTC) — the only keys `weekly` may carry. */
function mondayString(v: unknown): string {
  const day = dayString(v);
  if (!day) return '';
  const d = new Date(`${day}T00:00:00Z`);
  // a real calendar date (V8 rolls `2026-02-30` over to Monday March 2) that is a Monday, as `isMondayKey`
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day && d.getUTCDay() === 1 ? day : '';
}

/** Well-formed `challenge.best` entries only (valid day key, stars 0..3, finite time), pruned to the newest keys. */
function challengeBestMap(v: unknown): Record<string, ChallengeBest> {
  const out: Record<string, ChallengeBest> = {};
  if (!isRecord(v)) return out;
  for (const [k, raw] of Object.entries(v)) {
    if (!dayString(k) || !isRecord(raw)) continue;
    const stars = nonNegInt(raw.stars);
    const timeMs = nonNegInt(raw.timeMs);
    if (stars === null || timeMs === null) continue;
    out[k] = { stars: Math.min(3, stars), timeMs };
  }
  return pruneChallengeBest(out);
}

/** `weekly.best`: Monday keys only, `target` a strict boolean, the newest `WEEKLY_BEST_KEEP` (12) kept. */
function weeklyBestMap(v: unknown): Record<string, WeeklyBest> {
  const out: Record<string, WeeklyBest> = {};
  if (!isRecord(v)) return out;
  for (const [k, raw] of Object.entries(v)) {
    if (!mondayString(k) || !isRecord(raw)) continue;
    const stars = nonNegInt(raw.stars);
    const timeMs = nonNegInt(raw.timeMs);
    if (stars === null || timeMs === null) continue;
    out[k] = { stars: Math.min(3, stars), timeMs, target: raw.target === true };
  }
  return pruneChallengeBest(out, WEEKLY_BEST_KEEP_KEYS);
}

/** `WEEKLY_BEST_KEEP` (src/daily/challenge.ts) restated here so the save layer imports nothing above it. */
const WEEKLY_BEST_KEEP_KEYS = 12;

/** Keep only the `keep` most recent day keys (keys sort chronologically as strings); default `CHALLENGE_BEST_KEEP`. */
export function pruneChallengeBest<T>(best: Record<string, T>, keep = CHALLENGE_BEST_KEEP): Record<string, T> {
  const keys = Object.keys(best).sort();
  if (keys.length <= keep) return best;
  const out: Record<string, T> = {};
  for (const k of keys.slice(keys.length - keep)) out[k] = best[k]!;
  return out;
}

/**
 * Parse untrusted JSON (any schema version) into a well-formed v3 SaveData, filling gaps with
 * defaults. v1 had no `version` and no `reducedMotion`; v2 stored gold as `coins`; every economy
 * field simply takes its default when missing.
 */
export function normalizeSave(raw: unknown): SaveData {
  const out = defaultSave();
  if (!isRecord(raw)) return out;
  out.stars = countMap(raw.stars, 3);
  out.gold = nonNegInt(raw.gold) ?? nonNegInt(raw.coins) ?? 0;
  out.crystals = nonNegInt(raw.crystals) ?? 0;
  if (isRecord(raw.entitlements)) {
    const e = raw.entitlements;
    out.entitlements = { noAds: e.noAds === true, premium: e.premium === true, starterPack: e.starterPack === true };
  }
  out.upgrades = countMap(raw.upgrades, 5);
  if (isRecord(raw.skins)) {
    out.skins.owned = stringList(raw.skins.owned);
    if (isRecord(raw.skins.equipped)) {
      const eq = raw.skins.equipped;
      for (const family of ['roof', 'helmet', 'theme'] as const) {
        const id = eq[family];
        out.skins.equipped[family] = typeof id === 'string' && out.skins.owned.includes(id) ? id : null;
      }
    }
  }
  if (isRecord(raw.charges)) {
    const c = raw.charges;
    out.charges = { overdrive: nonNegInt(c.overdrive) ?? 0, freeze: nonNegInt(c.freeze) ?? 0, airstrike: nonNegInt(c.airstrike) ?? 0 };
  }
  if (isRecord(raw.daily)) {
    const d = raw.daily;
    const day = dayString(d.lastClaimDay);
    out.daily = { lastClaimDay: day || null, streak: Math.min(7, nonNegInt(d.streak) ?? 0) };
  }
  if (isRecord(raw.challenge)) {
    const c = raw.challenge;
    const day = dayString(c.lastWinDay);
    out.challenge = { lastWinDay: day || null, streak: nonNegInt(c.streak) ?? 0, best: challengeBestMap(c.best), milestones: intList(c.milestones) };
  }
  if (isRecord(raw.weekly)) {
    const w = raw.weekly;
    out.weekly = { lastWinWeek: mondayString(w.lastWinWeek) || null, streak: nonNegInt(w.streak) ?? 0, best: weeklyBestMap(w.best) };
  }
  if (isRecord(raw.adCounters)) {
    const a = raw.adCounters;
    out.adCounters = { day: dayString(a.day), rewardedByPlacement: countMap(a.rewardedByPlacement), levelsCompleted: nonNegInt(a.levelsCompleted) ?? 0 };
  }
  out.purchases = stringList(raw.purchases);
  out.milestones = stringList(raw.milestones);
  if (isRecord(raw.replayGold)) out.replayGold = { day: dayString(raw.replayGold.day), earned: nonNegInt(raw.replayGold.earned) ?? 0 };
  out.defeats = countMap(raw.defeats);
  out.skips = intList(raw.skips);
  if (isRecord(raw.achievements)) out.achievements = { unlocked: stringList(raw.achievements.unlocked) };
  if (isRecord(raw.settings)) {
    const s = raw.settings;
    if (typeof s.colorBlind === 'boolean') out.settings.colorBlind = s.colorBlind;
    if (typeof s.sound === 'boolean') out.settings.sound = s.sound;
    if (s.reducedMotion === 'auto' || s.reducedMotion === 'on' || s.reducedMotion === 'off') out.settings.reducedMotion = s.reducedMotion;
    if (isLanguage(s.language)) out.settings.language = s.language;
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

/** The storage every `writeSave` goes to (tests inject a memory store). */
let activeStorage: SaveStorage | null | undefined;

/** Test hook: route `writeSave` to a memory store (`null` = no persistence, `undefined` = localStorage). */
export function setSaveStorageForTests(store: SaveStorage | null | undefined): void {
  activeStorage = store;
}

/**
 * Load the v3 save, or migrate a v2 / v1 save (written back under the v3 key; the older entry is
 * left untouched so a downgrade still finds it). Corrupt JSON falls back to a fresh save.
 */
export function loadSaveFrom(store: SaveStorage | null): SaveData {
  if (!store) return defaultSave();
  try {
    const v3 = store.getItem(SAVE_KEY);
    if (v3) return normalizeSave(JSON.parse(v3));
    const older = store.getItem(SAVE_KEY_V2) ?? store.getItem(SAVE_KEY_V1);
    if (!older) return defaultSave();
    const migrated = normalizeSave(JSON.parse(older));
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
  return loadSaveFrom(activeStorage === undefined ? storage() : activeStorage);
}

export function writeSave(data: SaveData): void {
  try {
    data.version = SAVE_VERSION;
    const store = activeStorage === undefined ? storage() : activeStorage;
    store?.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota: play on without persistence */
  }
}

/** Wipe progress and the economy (settings and purchases survive) and persist. */
export function resetProgress(data: SaveData): void {
  const fresh = defaultSave();
  fresh.settings = data.settings;
  fresh.purchases = data.purchases;
  fresh.entitlements = data.entitlements;
  // pack-exclusive skins come from store purchases (not progress) and stay owned; crystal skins are wiped
  fresh.skins.owned = data.skins.owned.filter(isExclusiveSkin);
  Object.assign(data, fresh);
  writeSave(data);
}

function isExclusiveSkin(id: string): boolean {
  return id === 'roof_gold' || id === 'helmet_royal' || id === 'helmet_bronze';
}

/** Spend gold on a booster. Returns false (and changes nothing) when unaffordable. */
export function spendCoins(data: SaveData, amount: number): boolean {
  if (amount < 0 || data.gold < amount) return false;
  data.gold -= amount;
  writeSave(data);
  return true;
}

/** Stars by clear time (GDD §2.4). */
export function starsFor(level: { star3: number; star2: number }, timeMs: number): number {
  if (timeMs <= level.star3) return 3;
  if (timeMs <= level.star2) return 2;
  return 1;
}

/** Record a win. Returns gold earned (10 per *new* star, first-clear semantics per star). */
export function recordWin(data: SaveData, levelId: number, stars: number, coinsPerStar: number): number {
  const key = String(levelId);
  const before = data.stars[key] ?? 0;
  const after = Math.max(before, stars);
  const earned = Math.max(0, after - before) * coinsPerStar;
  data.stars[key] = after;
  data.gold += earned;
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

/** Index of the level the player is "on": first unlocked level without a clear, else the last. */
export function currentLevelIndex(data: SaveData, levels: readonly { id: number }[]): number {
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]!;
    if (isLevelUnlocked(data, levels, i) && (data.stars[String(level.id)] ?? 0) === 0) return i;
  }
  return Math.max(0, levels.length - 1);
}
