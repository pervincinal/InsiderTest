/**
 * Shop side of the Commander upgrades (ECONOMY.md §3.2): prices, buying and the card text. Split
 * from upgrades.ts so only the lazily loaded shop screen carries it (scripts/checkBundle.mjs budget).
 */
import type { CommanderUpgradeDef } from '../economy/catalog';
import type { UpgradeKind } from '../render/sprites';
import type { SaveData } from './save';
import { writeSave } from './save';
import { spendGold } from '../economy/wallet';
import { t } from './i18n';
import { pct, upgradeDef, upgradeTier } from './upgrades';

/** Track id → glyph drawn by `drawUpgradeGlyph`. */
export const UPGRADE_GLYPH: Readonly<Record<string, UpgradeKind>> = {
  production: 'production',
  capacity: 'capacity',
  garrison: 'garrison',
  booster_cost: 'booster',
  march_speed: 'speed',
};

/** Gold cost of the next tier, or null when the track is maxed / unknown. */
export function upgradeCost(save: SaveData, id: string): number | null {
  const def = upgradeDef(id);
  if (!def) return null;
  const tier = upgradeTier(save, id);
  return tier >= def.maxTier ? null : (def.costGoldByTier[tier] ?? null);
}

/** Buy the next tier with gold. False when maxed or unaffordable (nothing changes). */
export function buyUpgrade(save: SaveData, id: string): boolean {
  const cost = upgradeCost(save, id);
  if (cost === null) return false;
  const tier = upgradeTier(save, id);
  if (!spendGold(save, cost)) return false;
  save.upgrades[id] = tier + 1;
  writeSave(save);
  return true;
}

/** Effect of a track at `tier` as shown on the card ("+8 % production", "+2 units at start"). */
export function upgradeEffectText(def: CommanderUpgradeDef, tier: number): string {
  const v = def.effect.perTier * tier;
  switch (def.effect.kind) {
    case 'productionMul':
      return t('upgrade.production', { v: pct(v) });
    case 'capacityMul':
      return t('upgrade.capacity', { v: pct(v) });
    case 'startingGarrison':
      return t('upgrade.garrison', { v });
    case 'boosterDiscount':
      return t('upgrade.discount', { v: pct(v) });
    case 'marchSpeedMul':
      return t('upgrade.speed', { v: pct(v) });
  }
}
