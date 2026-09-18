/**
 * Every Commander track at its cap, read from the catalog (ECONOMY.md §3.2). The single source for
 * "max upgrades" in tools: `scripts/playtest.ts --upgrades max` and any future diagnostic read this
 * instead of typing a ladder (QA-3: a scratch tool once hard-coded the pre-retune 1.2 / 1.25 / +5 /
 * 1.15 caps and measured a game that no longer existed). tests/economy/maxUpgrades.test.ts pins the
 * result to the catalog, to `ADVANTAGE_LIMIT` and to the game's own `modifiersFromSave` path.
 *
 * Pure: data in, data out; no DOM, no storage, no sim imports beyond the modifier type.
 */
import type { PlayerModifiers } from '../sim/types';
import { DEFAULT_MODIFIERS } from '../sim/types';
import { COMMANDER_UPGRADES } from './catalog';
import type { UpgradeEffectKind } from './catalog';

/** Track id → its `maxTier`, as `save.upgrades` would hold it with everything bought. */
export function maxedTiers(): Record<string, number> {
  const tiers: Record<string, number> = {};
  for (const def of COMMANDER_UPGRADES) tiers[def.id] = def.maxTier;
  return tiers;
}

/** Sum of a track's per-tier effect at its max tier, from the catalog; 0 when no track has that effect. */
export function maxedEffect(kind: UpgradeEffectKind): number {
  let total = 0;
  for (const def of COMMANDER_UPGRADES) if (def.effect.kind === kind) total += def.effect.perTier * def.maxTier;
  return Math.round(total * 1e4) / 1e4; // 0.02 × 3 and friends: keep the doc's round numbers
}

/**
 * The sim modifiers a save with every track maxed produces (booster discount is a price, not a sim
 * modifier). With the shipped catalog: production +6 %, capacity +25 %, +2 starting garrison, march
 * speed +4 % (`ADVANTAGE_LIMIT` in catalog.ts).
 */
export function maxedModifiers(): PlayerModifiers {
  return {
    productionMul: Math.round((DEFAULT_MODIFIERS.productionMul + maxedEffect('productionMul')) * 1e4) / 1e4,
    capacityMul: Math.round((DEFAULT_MODIFIERS.capacityMul + maxedEffect('capacityMul')) * 1e4) / 1e4,
    startGarrisonBonus: DEFAULT_MODIFIERS.startGarrisonBonus + Math.round(maxedEffect('startingGarrison')),
    unitSpeedMul: Math.round((DEFAULT_MODIFIERS.unitSpeedMul + maxedEffect('marchSpeedMul')) * 1e4) / 1e4,
  };
}
