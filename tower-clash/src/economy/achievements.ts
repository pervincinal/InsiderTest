/**
 * Achievements (ECONOMY.md §2.1, `catalog.ACHIEVEMENTS`): ten one-time goals paid in crystals.
 * Three count 3★ levels in the save; the rest are facts about a single finished match that the
 * play screen collects into a `MatchSummary`. `evaluateAchievements` grants each id exactly once
 * (the save's `achievements.unlocked` list is the ledger) and persists through `writeSave`.
 * Pure over `SaveData` — no DOM, no clock.
 *
 * Owned by the Frontend Engineer.
 */
import type { SaveData } from '../ui/save';
import { writeSave } from '../ui/save';
import type { AchievementDef } from './catalog';
import { ACHIEVEMENTS } from './catalog';

/** What one finished match tells the achievement rules (collected from sim events by the play screen). */
export interface MatchSummary {
  outcome: 'won' | 'lost';
  /** Sim time of the result in ms. */
  timeMs: number;
  /** An enemy captured a tower the player owned at some point. */
  lostTower: boolean;
  /**
   * One of the player's towers reached level 3. Rules v2 upgrades are automatic (a full tower gains
   * a level and the sim emits `upgrade`), so this is set from that event — no player command involved.
   */
  upgradedToL3: boolean;
  capturedFortress: boolean;
  capturedTankFactory: boolean;
  /** The player cut a bridge (their own command; enemy cuts do not count). */
  cutBridge: boolean;
}

export function emptyMatch(): MatchSummary {
  return { outcome: 'lost', timeMs: 0, lostTower: false, upgradedToL3: false, capturedFortress: false, capturedTankFactory: false, cutBridge: false };
}

/** "Win in under 30 s" (`speedrunner` label in the catalog). */
export const SPEEDRUN_MS = 30_000;

/** Tower level that satisfies `first_l3`. */
export const L3_LEVEL = 3;

/** Achievements that count 3★ levels: id → target. */
const STAR_TARGETS: Readonly<Record<string, number>> = { stars_10: 10, stars_20: 20, stars_40: 40 };

export interface AchievementProgress {
  id: string;
  label: string;
  crystals: number;
  /** Progress toward `target` (binary goals are 0 or 1). */
  current: number;
  target: number;
  /** Unlocked and paid. */
  unlocked: boolean;
}

/** Number of levels at 3★. */
export function threeStarLevels(save: SaveData): number {
  return Object.values(save.stars).filter((s) => s >= 3).length;
}

export function isUnlocked(save: SaveData, id: string): boolean {
  return save.achievements.unlocked.includes(id);
}

function matchSatisfies(id: string, m: MatchSummary): boolean {
  switch (id) {
    case 'first_win':
      return m.outcome === 'won';
    case 'first_l3':
      return m.upgradedToL3;
    case 'first_fortress':
      return m.capturedFortress;
    case 'first_bridge_cut':
      return m.cutBridge;
    case 'first_tank':
      return m.capturedTankFactory;
    case 'flawless':
      return m.outcome === 'won' && !m.lostTower;
    case 'speedrunner':
      return m.outcome === 'won' && m.timeMs < SPEEDRUN_MS;
    default:
      return false;
  }
}

/** Whether a not-yet-unlocked achievement is satisfied now (by the save, or by `match` when given). */
function satisfied(save: SaveData, id: string, match?: MatchSummary): boolean {
  const target = STAR_TARGETS[id];
  if (target !== undefined) return threeStarLevels(save) >= target;
  return match !== undefined && matchSatisfies(id, match);
}

/** Every catalog achievement with its progress and unlocked state, in catalog order. */
export function achievementProgress(save: SaveData): AchievementProgress[] {
  const stars = threeStarLevels(save);
  return (ACHIEVEMENTS as readonly AchievementDef[]).map((a) => {
    const unlocked = isUnlocked(save, a.id);
    const target = STAR_TARGETS[a.id] ?? 1;
    const current = STAR_TARGETS[a.id] !== undefined ? Math.min(target, stars) : unlocked ? 1 : 0;
    return { id: a.id, label: a.label, crystals: a.crystals, current: unlocked ? target : current, target, unlocked };
  });
}

export interface AchievementGrant {
  /** Newly unlocked achievements, catalog order. */
  unlocked: AchievementDef[];
  /** Crystals granted for them. */
  crystals: number;
}

/**
 * Unlock every achievement that is satisfied and not yet unlocked, pay its crystals and persist.
 * Call after each result (with the match), after a level skip and on the daily claim (without).
 * An id is never granted twice.
 */
export function evaluateAchievements(save: SaveData, match?: MatchSummary): AchievementGrant {
  const out: AchievementGrant = { unlocked: [], crystals: 0 };
  for (const a of ACHIEVEMENTS as readonly AchievementDef[]) {
    if (isUnlocked(save, a.id) || !satisfied(save, a.id, match)) continue;
    save.achievements.unlocked.push(a.id);
    save.crystals += a.crystals;
    out.unlocked.push(a);
    out.crystals += a.crystals;
  }
  if (out.unlocked.length) writeSave(save);
  return out;
}

/** Crystals paid so far by the unlocked achievements. */
export function achievementCrystalsEarned(save: SaveData): number {
  return (ACHIEVEMENTS as readonly AchievementDef[]).filter((a) => isUnlocked(save, a.id)).reduce((n, a) => n + a.crystals, 0);
}

/** Toast line for a grant: "Achievement unlocked: First victory · +5 crystals" (null when nothing). */
export function achievementToast(grant: AchievementGrant): string | null {
  if (!grant.unlocked.length) return null;
  const names = grant.unlocked.length <= 2 ? grant.unlocked.map((a) => a.label).join(', ') : `${grant.unlocked.length} achievements`;
  return `Achievement unlocked: ${names} · +${grant.crystals} crystals`;
}
