/**
 * Wallet (ECONOMY.md §2, Phase A): the only code that changes `save.gold` / `save.crystals`
 * (with ./purchases.ts, its shop half) and pays the earn rules. Every mutation persists through
 * `writeSave` and balances never go negative. Pure over `SaveData` + an explicit `nowMs` so the
 * rules unit-test without a DOM or a clock.
 *
 * PERF-11: the shop-only operations — crystal → gold conversion, the booster crate, store grants and
 * restores — are ./purchases.ts, imported only by the shop, the debug surface and the store
 * providers (all lazy chunks); this file is what the eager play / result / title path needs.
 *
 * Owned by the Frontend Engineer.
 */
import type { LevelDef } from '../sim/types';
import type { SaveData } from '../ui/save';
import { starsFor, writeSave } from '../ui/save';
import { CRYSTAL_SERVICES, EARN_RULES, LEARNING_LEVEL_IDS } from './catalog';

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

/** Index (0..5) of the band a level id belongs to, or -1. */
export function bandOf(levelId: number): number {
  return EARN_RULES.bands.findIndex(([a, b]) => levelId >= a && levelId <= b);
}

/* ---------- level skip (ECONOMY.md §3.4, AUD-B3) ---------- */

/**
 * `save.skips` holds one slot per skip spent: the band index (0..5) for an ordinary level, or
 * `LEARNING_SKIP_SLOT_BASE + levelId` for a learning level (`LEARNING_LEVEL_IDS`). The offset keeps the two
 * apart, so a save written before 2026-10-30 (band indices only) reads the same: an old skip of 27 spent band
 * 25–32's slot, and 32 still has its own.
 */
export const LEARNING_SKIP_SLOT_BASE = 100;

/** The `save.skips` slot a skip of this level spends, or -1 when the level is in no band. */
export function skipSlotOf(levelId: number): number {
  const band = bandOf(levelId);
  if (band < 0) return -1;
  return LEARNING_LEVEL_IDS.includes(levelId) ? LEARNING_SKIP_SLOT_BASE + levelId : band;
}

/** Most skips one campaign can use: one per band plus one per learning level (6 + 3 = 9). */
export function maxSkipsPerCampaign(): number {
  const learning = LEARNING_LEVEL_IDS.filter((id) => bandOf(id) >= 0).length;
  return EARN_RULES.bands.length * CRYSTAL_SERVICES.levelSkip.maxPerBand + learning;
}

/**
 * The level-skip offer, from the save alone: at least `offerAfterDefeats` (3) consecutive defeats on an
 * uncleared level whose slot is unused — one skip per band, and one more on each learning level that neither
 * spends nor needs its band's. The caller adds what the save cannot know (a defeat screen, not a daily / weekly).
 */
export function skipAvailable(save: SaveData, levelId: number): boolean {
  const slot = skipSlotOf(levelId);
  const key = String(levelId);
  return (
    slot >= 0 &&
    (save.defeats[key] ?? 0) >= CRYSTAL_SERVICES.levelSkip.offerAfterDefeats &&
    (save.stars[key] ?? 0) === 0 &&
    !save.skips.includes(slot)
  );
}

/**
 * Buy a level skip: `costCrystals` (30), `starsGranted` (1★, no gold), the slot recorded, the defeat streak
 * cleared and the milestones paid (a skip counts toward "levels cleared", never toward a full-3★ band).
 * Returns the milestone crystals, or null (nothing changes) when the skip is not available or unaffordable.
 * Achievements stay the caller's (`evaluateAchievements`; a skip of 50 never pays `grand_campaign`).
 */
export function buyLevelSkip(save: SaveData, levelId: number): { crystals: number; notes: string[] } | null {
  const svc = CRYSTAL_SERVICES.levelSkip;
  if (!skipAvailable(save, levelId) || save.crystals < svc.costCrystals) return null;
  const key = String(levelId);
  save.crystals -= svc.costCrystals;
  save.stars[key] = Math.max(save.stars[key] ?? 0, svc.starsGranted);
  save.skips.push(skipSlotOf(levelId));
  delete save.defeats[key];
  const paid = payMilestones(save);
  writeSave(save);
  return paid;
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
 * gold, crystal milestones, the defeat streak for the skip offer and the interstitial counter
 * (AUD-B7: wins only — a defeat never brings an interstitial closer).
 */
export function recordResult(save: SaveData, level: LevelDef, outcome: 'won' | 'lost', timeMs: number, nowMs = Date.now()): ResultEarnings {
  const key = String(level.id);
  const out: ResultEarnings = { stars: 0, gold: 0, crystals: 0, notes: [], replayCapped: false };
  if (outcome === 'lost') {
    save.defeats[key] = (save.defeats[key] ?? 0) + 1;
    writeSave(save);
    return out;
  }
  save.adCounters.levelsCompleted += 1;
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
