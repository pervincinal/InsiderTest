/**
 * Wallet (ECONOMY.md §2, Phase A): the only code that changes `save.gold` / `save.crystals`,
 * applies store grants and pays the earn rules. Every mutation persists through `writeSave` and
 * balances never go negative. Pure over `SaveData` + an explicit `nowMs` so the rules unit-test
 * without a DOM or a clock.
 *
 * Owned by the Frontend Engineer.
 */
import type { LevelDef } from '../sim/types';
import type { SaveData } from '../ui/save';
import { starsFor, writeSave } from '../ui/save';
import type { IapProductDef } from './catalog';
import { EARN_RULES, IAP_PRODUCTS } from './catalog';
import type { StoreProvider } from './store';
import { getStore } from './store';

/* ---------- calendar days ---------- */

/** Local calendar day as `YYYY-MM-DD` (daily caps and the streak use the device's local date). */
export function dayKey(nowMs = Date.now()): string {
  const d = new Date(nowMs);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const DAY_MS = 86_400_000;

/* ---------- balances ---------- */

function clampAmount(amount: number): number {
  return Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
}

/** Add gold (ignores negatives / NaN). Returns the new balance. */
export function earnGold(save: SaveData, amount: number): number {
  const n = clampAmount(amount);
  if (n > 0) {
    save.gold += n;
    writeSave(save);
  }
  return save.gold;
}

/** Add crystals (ignores negatives / NaN). Returns the new balance. */
export function earnCrystals(save: SaveData, amount: number): number {
  const n = clampAmount(amount);
  if (n > 0) {
    save.crystals += n;
    writeSave(save);
  }
  return save.crystals;
}

/** Spend gold. False (and nothing changes) when unaffordable or the amount is invalid. */
export function spendGold(save: SaveData, amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0 || save.gold < amount) return false;
  save.gold -= Math.floor(amount);
  writeSave(save);
  return true;
}

/** Spend crystals. False (and nothing changes) when unaffordable or the amount is invalid. */
export function spendCrystals(save: SaveData, amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0 || save.crystals < amount) return false;
  save.crystals -= Math.floor(amount);
  writeSave(save);
  return true;
}

/* ---------- store grants ---------- */

export function productById(id: string): IapProductDef | undefined {
  return (IAP_PRODUCTS as readonly IapProductDef[]).find((p) => p.id === id);
}

export interface GrantResult {
  productId: string;
  gold: number;
  crystals: number;
  skins: string[];
  noAds: boolean;
  premium: boolean;
}

/**
 * Apply a product's catalog grants exactly once. `transactionId` (from the store) is the dedupe
 * key; without one, non-consumables dedupe on `owned:<productId>` (a restore may report an id
 * many times) and consumables are granted unconditionally (the fake store always sends an id).
 * Returns null when the product is unknown or the transaction was already granted.
 */
export function grantProduct(save: SaveData, productId: string, transactionId?: string): GrantResult | null {
  const product = productById(productId);
  if (!product) return null;
  const marker = product.kind === 'nonConsumable' ? `owned:${productId}` : null;
  if (marker && save.purchases.includes(marker)) return null;
  if (transactionId && save.purchases.includes(transactionId)) return null;
  const g = product.grants;
  const result: GrantResult = {
    productId,
    gold: g.gold ?? 0,
    crystals: g.crystals ?? 0,
    skins: [],
    noAds: g.removeAds === true,
    premium: (g.boosterDiscount ?? 0) > 0,
  };
  save.gold += result.gold;
  save.crystals += result.crystals;
  for (const skin of g.skins ?? []) {
    if (!save.skins.owned.includes(skin)) {
      save.skins.owned.push(skin);
      result.skins.push(skin);
    }
  }
  if (result.noAds) save.entitlements.noAds = true;
  if (result.premium) save.entitlements.premium = true;
  if (productId === 'starter_pack') save.entitlements.starterPack = true;
  if (transactionId) save.purchases.push(transactionId);
  if (marker) save.purchases.push(marker);
  writeSave(save);
  return result;
}

/**
 * Ask the store for the owned non-consumables and grant each one idempotently (consumables the
 * store may report — the fake does — are ignored). Returns the ids granted for the first time.
 */
export async function restorePurchases(save: SaveData, store: StoreProvider = getStore()): Promise<string[]> {
  const ids = await store.restore();
  const granted: string[] = [];
  for (const id of ids) {
    const product = productById(id);
    if (!product || product.kind !== 'nonConsumable') continue;
    if (grantProduct(save, id)) granted.push(id);
  }
  return granted;
}

/* ---------- earn rules on a result ---------- */

export interface ResultEarnings {
  stars: number;
  /** Gold paid for this result (first clear / star improvement / capped replay). */
  gold: number;
  /** Crystals paid for milestones and full-3★ bands reached by this result. */
  crystals: number;
  /** Human-readable reasons for the crystals (`"10 levels cleared"`, `"Band 1 at 3★"`). */
  notes: string[];
  /** Replay gold that was withheld by the daily cap. */
  replayCapped: boolean;
}

/** Number of levels with at least one star. */
export function levelsCleared(save: SaveData): number {
  return Object.values(save.stars).filter((s) => s >= 1).length;
}

/** Index (0..4) of the band a level id belongs to, or -1. */
export function bandOf(levelId: number): number {
  return EARN_RULES.bands.findIndex(([a, b]) => levelId >= a && levelId <= b);
}

/**
 * Pay crystal milestones (levels cleared) and full-3★ bands that are complete and not yet paid.
 * Called after every star change (win, skip). Returns the crystals granted and their reasons.
 */
export function payMilestones(save: SaveData): { crystals: number; notes: string[] } {
  let crystals = 0;
  const notes: string[] = [];
  const cleared = levelsCleared(save);
  for (const [threshold, reward] of Object.entries(EARN_RULES.crystalsPerMilestone)) {
    const n = Number(threshold);
    const id = `levels_${n}`;
    if (cleared >= n && !save.milestones.includes(id)) {
      save.milestones.push(id);
      crystals += reward;
      notes.push(`${n} levels cleared`);
    }
  }
  EARN_RULES.bands.forEach(([a, b], i) => {
    const id = `band_${i}`;
    if (save.milestones.includes(id)) return;
    for (let lv = a; lv <= b; lv++) if ((save.stars[String(lv)] ?? 0) < 3) return;
    save.milestones.push(id);
    crystals += EARN_RULES.crystalsPerFullBand3Star;
    notes.push(`Band ${i + 1} at 3★`);
  });
  if (crystals > 0) save.crystals += crystals;
  return { crystals, notes };
}

/**
 * Record a finished level (EARN_RULES): stars, first-clear / star-improvement gold, capped replay
 * gold, crystal milestones, the defeat streak for the skip offer and the interstitial counter.
 */
export function recordResult(save: SaveData, level: LevelDef, outcome: 'won' | 'lost', timeMs: number, nowMs = Date.now()): ResultEarnings {
  const key = String(level.id);
  const out: ResultEarnings = { stars: 0, gold: 0, crystals: 0, notes: [], replayCapped: false };
  save.adCounters.levelsCompleted += 1;
  if (outcome === 'lost') {
    save.defeats[key] = (save.defeats[key] ?? 0) + 1;
    writeSave(save);
    return out;
  }
  delete save.defeats[key];
  const stars = starsFor(level, timeMs);
  const before = save.stars[key] ?? 0;
  const after = Math.max(before, stars);
  out.stars = stars;
  if (after > before) {
    out.gold = (after - before) * (before === 0 ? EARN_RULES.goldPerStarFirstClear : EARN_RULES.goldPerNewStar);
  } else {
    const today = dayKey(nowMs);
    if (save.replayGold.day !== today) save.replayGold = { day: today, earned: 0 };
    const wanted = stars * EARN_RULES.goldPerStarReplay;
    const room = Math.max(0, EARN_RULES.replayGoldDailyCap - save.replayGold.earned);
    out.gold = Math.min(wanted, room);
    out.replayCapped = out.gold < wanted;
    save.replayGold.earned += out.gold;
  }
  save.stars[key] = after;
  save.gold += out.gold;
  const paid = payMilestones(save);
  out.crystals = paid.crystals;
  out.notes = paid.notes;
  writeSave(save);
  return out;
}

/* ---------- daily streak (7-day table, loops) ---------- */

export interface DailyStatus {
  /** Already claimed today. */
  claimed: boolean;
  /** Day (1..7) the next claim pays — or the day claimed today. */
  day: number;
  gold: number;
  crystals: number;
}

export function dailyStatus(save: SaveData, nowMs = Date.now()): DailyStatus {
  const today = dayKey(nowMs);
  const yesterday = dayKey(nowMs - DAY_MS);
  let day: number;
  let claimed = false;
  if (save.daily.lastClaimDay === today) {
    claimed = true;
    day = Math.max(1, save.daily.streak);
  } else if (save.daily.lastClaimDay === yesterday) {
    day = (save.daily.streak % 7) + 1;
  } else {
    day = 1;
  }
  const reward = EARN_RULES.dailyReward[day - 1] ?? EARN_RULES.dailyReward[0];
  return { claimed, day, gold: reward.gold, crystals: reward.crystals };
}

/** Claim today's streak reward. Returns null when already claimed today. */
export function claimDaily(save: SaveData, nowMs = Date.now()): DailyStatus | null {
  const status = dailyStatus(save, nowMs);
  if (status.claimed) return null;
  save.daily = { lastClaimDay: dayKey(nowMs), streak: status.day };
  save.gold += status.gold;
  save.crystals += status.crystals;
  writeSave(save);
  return { ...status, claimed: true };
}
