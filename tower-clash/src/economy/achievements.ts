/**
 * Achievements (ECONOMY.md §2.1, `catalog.ACHIEVEMENTS`): fourteen one-time goals paid in crystals.
 * Three count 3★ levels in the save; three read the challenge counters in the save (`COUNTERS`,
 * ECONOMY.md §6.3: daily streak, distinct daily win days, weekly streak); the rest are facts about a
 * single finished match that the play screen collects into a `MatchSummary` (including which level it
 * was: `grand_campaign`). `evaluateAchievements` grants each id exactly once
 * (the save's `achievements.unlocked` list is the ledger) and persists through `writeSave`.
 * Pure over `SaveData` — no DOM, no clock.
 *
 * Owned by the Frontend Engineer.
 */
import type { SaveData } from '../ui/save';
import { CHALLENGE_BEST_KEEP, writeSave } from '../ui/save';
import { LEVEL_META } from '../levels/index';
import type { AchievementDef } from './catalog';
import { ACHIEVEMENTS } from './catalog';

/** What one finished match tells the achievement rules (collected from sim events by the play screen). */
export interface MatchSummary {
  outcome: 'won' | 'lost';
  /** Campaign level id of the match (0 = unknown; the daily challenge never reaches the rules). */
  levelId: number;
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
  /** Rules v3: one player tower ran three streams at once (an L3 with three links). */
  tripleStream: boolean;
}

export function emptyMatch(): MatchSummary {
  return { outcome: 'lost', levelId: 0, timeMs: 0, lostTower: false, upgradedToL3: false, capturedFortress: false, capturedTankFactory: false, tripleStream: false };
}

/** "Win in under 30 s" (`speedrunner` label in the catalog). */
export const SPEEDRUN_MS = 30_000;

/** Simultaneous streams from one tower that satisfy `first_triple_stream` (an L3's link limit). */
export const TRIPLE_STREAM_LINKS = 3;

/** Tower level that satisfies `first_l3`. */
export const L3_LEVEL = 3;

/**
 * Level whose *win* satisfies `grand_campaign` ("Clear level 50", GDD §3 band 5). A fixed id, not
 * `LEVEL_META.at(-1)`: the label names the level, and a level skip (1★ without a win) must not pay it.
 */
export const GRAND_CAMPAIGN_LEVEL = 50;

/**
 * Achievements that count 3★ levels: id → target. `stars_40` is "every level at 3★": its target is
 * the campaign length (`LEVEL_META.length`, 40 when it was named), so new bands raise the bar
 * without touching the id in the save ledger or the catalog.
 */
const STAR_TARGETS: Readonly<Record<string, number>> = { stars_10: 10, stars_20: 20, stars_40: LEVEL_META.length };

/** `challenge_wins_30`: distinct UTC days with a daily win (`challenge.best` keeps one key per won day). */
export const CHALLENGE_WINS_TARGET = 30;
/** `challenge_streak_7` / `weekly_streak_4`: consecutive daily-win days / weekly-win weeks. */
export const CHALLENGE_STREAK_TARGET = 7;
export const WEEKLY_STREAK_TARGET = 4;

/**
 * Challenge achievements (ECONOMY.md §6.3, ECON-10): id → target and the save counter it reads. Raw
 * `streak` values (not the clock-aware `shownStreak`, the rules stay pure): a broken streak keeps its
 * old value until the next first win resets it to 1, so a stale "5 / 7" can show for a day — accepted.
 * `best` is pruned to the newest `CHALLENGE_BEST_KEEP` keys, so its size is `min(30, win days)` only
 * while `CHALLENGE_BEST_KEEP >= 30` — asserted below so pruning can never hide the 30th key.
 */
const COUNTERS: Readonly<Record<string, { target: number; value: (s: SaveData) => number }>> = {
  challenge_streak_7: { target: CHALLENGE_STREAK_TARGET, value: (s) => s.challenge.streak },
  challenge_wins_30: { target: Math.min(CHALLENGE_WINS_TARGET, CHALLENGE_BEST_KEEP), value: (s) => Object.keys(s.challenge.best).length },
  weekly_streak_4: { target: WEEKLY_STREAK_TARGET, value: (s) => s.weekly.streak },
};
if (CHALLENGE_BEST_KEEP < CHALLENGE_WINS_TARGET) throw new Error(`CHALLENGE_BEST_KEEP (${CHALLENGE_BEST_KEEP}) must be >= ${CHALLENGE_WINS_TARGET} for challenge_wins_30`);

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
    case 'first_triple_stream':
      return m.tripleStream;
    case 'first_tank':
      return m.capturedTankFactory;
    case 'flawless':
      return m.outcome === 'won' && !m.lostTower;
    case 'speedrunner':
      return m.outcome === 'won' && m.timeMs < SPEEDRUN_MS;
    case 'grand_campaign':
      return m.outcome === 'won' && m.levelId === GRAND_CAMPAIGN_LEVEL;
    default:
      return false;
  }
}

/** Whether a not-yet-unlocked achievement is satisfied now (by the save, or by `match` when given). */
function satisfied(save: SaveData, id: string, match?: MatchSummary): boolean {
  const target = STAR_TARGETS[id];
  if (target !== undefined) return threeStarLevels(save) >= target;
  const counter = COUNTERS[id];
  if (counter !== undefined) return counter.value(save) >= counter.target;
  return match !== undefined && matchSatisfies(id, match);
}

/** Every catalog achievement with its progress and unlocked state, in catalog order. */
export function achievementProgress(save: SaveData): AchievementProgress[] {
  const stars = threeStarLevels(save);
  return (ACHIEVEMENTS as readonly AchievementDef[]).map((a) => {
    const unlocked = isUnlocked(save, a.id);
    const counter = COUNTERS[a.id];
    const target = STAR_TARGETS[a.id] ?? counter?.target ?? 1;
    const current = STAR_TARGETS[a.id] !== undefined ? Math.min(target, stars) : counter ? Math.min(target, counter.value(save)) : unlocked ? 1 : 0;
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
 * Call after each campaign result (with the match); after a daily / weekly result, a level skip, the
 * daily claim and on the achievements screen without one (only the save-based rules can fire then).
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
