/**
 * Commander upgrades (ECONOMY.md §3.2): 5 gold-priced tracks × 5 tiers stored as `save.upgrades`,
 * turned into the sim's `PlayerModifiers` at level start. The booster-discount track is not a sim
 * modifier — `entitlements.boosterPrice` applies it to the gold price.
 */
import type { PlayerModifiers } from '../sim/types';
import { DEFAULT_MODIFIERS } from '../sim/types';
import type { CommanderUpgradeDef } from '../economy/catalog';
import { COMMANDER_UPGRADES } from '../economy/catalog';
import type { UpgradeKind } from '../render/sprites';
import type { SaveData } from './save';
import { writeSave } from './save';
import { spendGold } from '../economy/wallet';

export const UPGRADE_DEFS: readonly CommanderUpgradeDef[] = COMMANDER_UPGRADES;

/** Track id → glyph drawn by `drawUpgradeGlyph`. */
export const UPGRADE_GLYPH: Readonly<Record<string, UpgradeKind>> = {
  production: 'production',
  capacity: 'capacity',
  garrison: 'garrison',
  booster_cost: 'booster',
  march_speed: 'speed',
};

export function upgradeDef(id: string): CommanderUpgradeDef | undefined {
  return UPGRADE_DEFS.find((u) => u.id === id);
}

/** Current tier (0..maxTier) of a track. */
export function upgradeTier(save: SaveData, id: string): number {
  const def = upgradeDef(id);
  if (!def) return 0;
  return Math.max(0, Math.min(def.maxTier, Math.floor(save.upgrades[id] ?? 0)));
}

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

function pct(n: number): string {
  return `${Math.round(n * 100)} %`;
}

/** Effect of a track at `tier` as shown on the card ("+8 % production", "+2 units at start"). */
export function upgradeEffectText(def: CommanderUpgradeDef, tier: number): string {
  const v = def.effect.perTier * tier;
  switch (def.effect.kind) {
    case 'productionMul':
      return `+${pct(v)} production`;
    case 'capacityMul':
      return `+${pct(v)} tower capacity`;
    case 'startingGarrison':
      return `+${v} units on every tower at start`;
    case 'boosterDiscount':
      return `−${pct(v)} booster gold price`;
    case 'marchSpeedMul':
      return `+${pct(v)} march speed`;
  }
}

/** Short per-track label for the level-map summary ("+8 % prod"). */
function shortEffect(def: CommanderUpgradeDef, tier: number): string {
  const v = def.effect.perTier * tier;
  switch (def.effect.kind) {
    case 'productionMul':
      return `+${pct(v)} prod`;
    case 'capacityMul':
      return `+${pct(v)} cap`;
    case 'startingGarrison':
      return `+${v} troops`;
    case 'boosterDiscount':
      return `−${pct(v)} boosters`;
    case 'marchSpeedMul':
      return `+${pct(v)} speed`;
  }
}

/** One-line Commander summary for the level map, or null when nothing is bought. */
export function commanderSummary(save: SaveData): string | null {
  const parts = UPGRADE_DEFS.map((d) => [d, upgradeTier(save, d.id)] as const)
    .filter(([, t]) => t > 0)
    .map(([d, t]) => shortEffect(d, t));
  return parts.length ? parts.join(' · ') : null;
}

/** Total tiers bought across all tracks (0..25). */
export function totalTiers(save: SaveData): number {
  return UPGRADE_DEFS.reduce((n, d) => n + upgradeTier(save, d.id), 0);
}

/**
 * Sim modifiers for the player from the bought tiers. Multipliers are rounded to 4 decimals so
 * 1 + 5 × 0.04 is exactly 1.2 (replays compare the stored modifiers). Booster discount is not a
 * sim modifier. `extraGarrison` adds the one-off "Reinforcements" continue bonus.
 */
export function modifiersFromSave(save: SaveData, extraGarrison = 0): PlayerModifiers {
  const m: PlayerModifiers = { ...DEFAULT_MODIFIERS };
  for (const def of UPGRADE_DEFS) {
    const v = def.effect.perTier * upgradeTier(save, def.id);
    switch (def.effect.kind) {
      case 'productionMul':
        m.productionMul = round4(m.productionMul + v);
        break;
      case 'capacityMul':
        m.capacityMul = round4(m.capacityMul + v);
        break;
      case 'startingGarrison':
        m.startGarrisonBonus += Math.round(v);
        break;
      case 'marchSpeedMul':
        m.unitSpeedMul = round4(m.unitSpeedMul + v);
        break;
      case 'boosterDiscount':
        break;
    }
  }
  m.startGarrisonBonus += Math.max(0, Math.floor(extraGarrison));
  return m;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
