/**
 * The level map's one-line Commander summary ("+8 % prod · +2 garrison"). Lazy (PERF-8): only the
 * level map (./lazyScreens.ts) draws it, so it and its `upgrade.short.*` English texts
 * (./locales/enMenus.ts) stay out of the eager bundle; the tracks themselves are ./upgrades.ts.
 */
import type { CommanderUpgradeDef } from '../economy/catalog';
import type { SaveData } from './save';
import { t } from './i18n';
import { UPGRADE_DEFS, pct, upgradeTier } from './upgrades';

/** Short per-track label for the level-map summary ("+8 % prod"). */
function shortEffect(def: CommanderUpgradeDef, tier: number): string {
  const v = def.effect.perTier * tier;
  switch (def.effect.kind) {
    case 'productionMul':
      return t('upgrade.short.production', { v: pct(v) });
    case 'capacityMul':
      return t('upgrade.short.capacity', { v: pct(v) });
    case 'startingGarrison':
      return t('upgrade.short.garrison', { v });
    case 'boosterDiscount':
      return t('upgrade.short.discount', { v: pct(v) });
    case 'marchSpeedMul':
      return t('upgrade.short.speed', { v: pct(v) });
  }
}

/** One-line Commander summary for the level map, or null when nothing is bought. */
export function commanderSummary(save: SaveData): string | null {
  const parts = UPGRADE_DEFS.map((d) => [d, upgradeTier(save, d.id)] as const)
    .filter(([, t]) => t > 0)
    .map(([d, t]) => shortEffect(d, t));
  return parts.length ? parts.join(' · ') : null;
}
