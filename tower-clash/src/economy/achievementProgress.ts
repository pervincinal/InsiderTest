/**
 * The achievements screen's read-outs (progress rows, crystals earned) over the rules in
 * `achievements.ts`. Only that lazy screen (src/ui/achievements.ts) reads them, so they live in its
 * chunk, not in the eager bundle with `evaluateAchievements` (PERF-12). Pure over `SaveData`.
 *
 * Owned by the Frontend Engineer.
 */
import type { SaveData } from '../ui/save';
import type { AchievementDef } from './catalog';
import { ACHIEVEMENTS } from './catalog';
import { COUNTERS, STAR_TARGETS, isUnlocked, threeStarLevels } from './achievements';

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

/** Crystals paid so far by the unlocked achievements. */
export function achievementCrystalsEarned(save: SaveData): number {
  return (ACHIEVEMENTS as readonly AchievementDef[]).filter((a) => isUnlocked(save, a.id)).reduce((n, a) => n + a.crystals, 0);
}
