import { describe, expect, it } from 'vitest';
import { ADVANTAGE_LIMIT, COMMANDER_UPGRADES } from '../../src/economy/catalog';
import { maxedEffect, maxedModifiers, maxedTiers } from '../../src/economy/maxUpgrades';
import { DEFAULT_MODIFIERS } from '../../src/sim/index';
import type { PlayerModifiers } from '../../src/sim/index';
import { defaultSave } from '../../src/ui/save';
import { modifiersFromSave } from '../../src/ui/upgrades';

/*
 * QA-3 regression: the "max upgrades" ladder used by `npm run playtest -- --upgrades max` must come
 * from the catalog, not from a typed constant. A scratch diagnostic once carried the pre-retune caps
 * (production ×1.2, capacity ×1.25, +5 garrison, speed ×1.15) after ECONOMY.md §3.2 had been retuned
 * to ×1.06 / ×1.25 / +2 / ×1.04, and measured a game that no longer shipped. These tests pin
 * `maxedModifiers()` to three things that must agree: the catalog's max tiers, the documented
 * `ADVANTAGE_LIMIT`, and the game's own save → modifiers path (`modifiersFromSave`).
 */

/** The ladder the stale tool used; whatever the catalog says, the helper must not return this by accident. */
const PRE_RETUNE_LADDER: PlayerModifiers = { productionMul: 1.2, capacityMul: 1.25, startGarrisonBonus: 5, unitSpeedMul: 1.15 };

describe('maxedModifiers (QA-3)', () => {
  it('is every catalog track at its maxTier, computed from the catalog', () => {
    const expected: PlayerModifiers = { ...DEFAULT_MODIFIERS };
    for (const def of COMMANDER_UPGRADES) {
      const v = def.effect.perTier * def.maxTier;
      switch (def.effect.kind) {
        case 'productionMul':
          expected.productionMul = Math.round((expected.productionMul + v) * 1e4) / 1e4;
          break;
        case 'capacityMul':
          expected.capacityMul = Math.round((expected.capacityMul + v) * 1e4) / 1e4;
          break;
        case 'startingGarrison':
          expected.startGarrisonBonus += Math.round(v);
          break;
        case 'marchSpeedMul':
          expected.unitSpeedMul = Math.round((expected.unitSpeedMul + v) * 1e4) / 1e4;
          break;
        case 'boosterDiscount':
          break; // a price, not a sim modifier
      }
    }
    expect(maxedModifiers()).toEqual(expected);
    // Every sim axis is covered by a track: a catalog without one of these would silently ship a no-op cap.
    expect(maxedModifiers().productionMul).toBeGreaterThan(1);
    expect(maxedModifiers().capacityMul).toBeGreaterThan(1);
    expect(maxedModifiers().startGarrisonBonus).toBeGreaterThan(0);
    expect(maxedModifiers().unitSpeedMul).toBeGreaterThan(1);
  });

  it('matches the documented advantage limit (ECONOMY.md §3.2) exactly', () => {
    const m = maxedModifiers();
    expect(m.productionMul).toBe(Math.round((1 + ADVANTAGE_LIMIT.productionMul) * 1e4) / 1e4);
    expect(m.capacityMul).toBe(Math.round((1 + ADVANTAGE_LIMIT.capacityMul) * 1e4) / 1e4);
    expect(m.startGarrisonBonus).toBe(ADVANTAGE_LIMIT.startingGarrison);
    expect(m.unitSpeedMul).toBe(Math.round((1 + ADVANTAGE_LIMIT.marchSpeedMul) * 1e4) / 1e4);
    // and the shipped numbers, so a retune is a deliberate edit of doc + catalog + this line
    expect(m).toEqual({ productionMul: 1.06, capacityMul: 1.25, startGarrisonBonus: 2, unitSpeedMul: 1.04 });
    expect(m).not.toEqual(PRE_RETUNE_LADDER);
  });

  it('equals what the game builds from a save with every track bought (modifiersFromSave)', () => {
    const save = defaultSave();
    save.upgrades = maxedTiers();
    expect(modifiersFromSave(save)).toEqual(maxedModifiers());
    // maxedTiers covers every track, including the non-sim booster discount, at exactly maxTier
    expect(Object.keys(save.upgrades).sort()).toEqual(COMMANDER_UPGRADES.map((d) => d.id).sort());
    for (const def of COMMANDER_UPGRADES) expect(save.upgrades[def.id]).toBe(def.maxTier);
    // one tier above the cap is clamped by the game, so "max" is really the max
    const over = defaultSave();
    for (const def of COMMANDER_UPGRADES) over.upgrades[def.id] = def.maxTier + 1;
    expect(modifiersFromSave(over)).toEqual(maxedModifiers());
  });

  it('maxedEffect sums per-tier × maxTier per effect kind and is 0 for an effect no track has', () => {
    for (const def of COMMANDER_UPGRADES) {
      expect(maxedEffect(def.effect.kind)).toBe(Math.round(def.effect.perTier * def.maxTier * 1e4) / 1e4);
    }
    const kinds = new Set(COMMANDER_UPGRADES.map((d) => d.effect.kind));
    expect(kinds.size).toBe(COMMANDER_UPGRADES.length); // one track per effect kind: the sum is that track's cap
    expect(maxedEffect('boosterDiscount')).toBe(ADVANTAGE_LIMIT.boosterDiscount);
  });
});
