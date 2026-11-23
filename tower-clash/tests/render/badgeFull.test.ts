import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import type { GameState, PlayerModifiers } from '../../src/sim/types';
import { DEFAULT_MODIFIERS } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { isFull } from '../../src/render/draw';

/*
 * REV-29: the tower badge's 'full' look follows the holding cap step.ts uses — with the capacity
 * commander track (AUD-B1) a player's max-level tower holds floor(base × capacityMul), so an L3
 * barracks under ×1.25 is full at 125, not at the base 100. Enemy towers keep the base cap.
 */

const mods = (capacityMul: number): PlayerModifiers => ({ ...DEFAULT_MODIFIERS, capacityMul });

function l3(capacityMul: number): GameState {
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 100, y: 100, owner: 'player', units: 10, level: 3 },
        { id: 'e', x: 400, y: 100, owner: 'enemy1', units: 10, level: 3 },
      ],
    }),
    1,
    mods(capacityMul),
  );
}

describe('badge full (REV-29)', () => {
  it('×1.25: a player L3 barracks at 110 is not full, at 125 it is', () => {
    const state = l3(1.25);
    const p = state.towers['p']!;
    p.units = 110;
    expect(isFull(p, state)).toBe(false);
    p.units = 124;
    expect(isFull(p, state)).toBe(false);
    p.units = 125;
    expect(isFull(p, state)).toBe(true);
  });

  it('×1.25: an enemy L3 barracks keeps the base cap (full at 100)', () => {
    const state = l3(1.25);
    const e = state.towers['e']!;
    e.units = 99;
    expect(isFull(e, state)).toBe(false);
    e.units = 100;
    expect(isFull(e, state)).toBe(true);
  });

  it('×1: a player L3 barracks is full at the base 100', () => {
    const state = l3(1);
    const p = state.towers['p']!;
    p.units = 100;
    expect(isFull(p, state)).toBe(true);
  });
});
