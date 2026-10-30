import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import type { GameState, PlayerModifiers, SimEvent, TowerDef } from '../../src/sim/types';
import { DEFAULT_MODIFIERS } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { capacityOf, isLinked, step } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import { run, spawn } from './util';

/*
 * AUD-B1 (2026-10-30, P0): the capacity commander track used to scale the L1 / L2 auto-upgrade
 * thresholds, so with ×1.05 an L1 levelled at 26 instead of 25 and the first-time line (taps at 3 s
 * with ~21 units, never lets a tower fill) never reached L2 — level 4 went 20/20 → 4/20. Rule now:
 * the thresholds are the base ladder `C.CAPACITY` (25 / 50, fortress 37) for every owner; `capacityMul`
 * scales only the holding cap at the kind's max level (L3 100 → floor(100 × mul), fortress L2 75 →
 * floor(75 × mul)).
 */

const MULS = [1.05, 1.25] as const;
const mods = (capacityMul: number): PlayerModifiers => ({ ...DEFAULT_MODIFIERS, capacityMul });

function solo(over: Partial<TowerDef>, capacityMul: number): GameState {
  return createState(makeLevel({ towers: [{ id: 'p', x: 100, y: 100, owner: 'player', units: 10, ...over }] }), 1, mods(capacityMul));
}

/** Step `n` ticks and collect every upgrade event as [towerId, level, garrison at that tick]. */
function upgradesOver(state: GameState, n: number): [string, number, number][] {
  const out: [string, number, number][] = [];
  for (let i = 0; i < n; i++) {
    step(state);
    for (const e of state.events) if (e.type === 'upgrade') out.push([e.towerId, e.level, state.towers[e.towerId]!.units]);
  }
  return out;
}

describe('AUD-B1: the capacity track never moves the L1 / L2 auto-upgrade thresholds', () => {
  it.each(MULS)('×%s: an L1 at 24 stays L1, then upgrades at exactly 25 (the 25th unit, 1000 ms)', (mul) => {
    const state = solo({ level: 1, units: 24 }, mul);
    expect(capacityOf(state.towers['p']!, state)).toBe(C.CAPACITY[1]);
    run(state, 19);
    expect(state.towers['p']!).toMatchObject({ level: 1, units: 24 });
    step(state);
    expect(state.towers['p']!).toMatchObject({ level: 2, units: 25 });
  });

  it.each(MULS)('×%s: an L2 at 49 upgrades at exactly 50 (700 ms at the L2 rate)', (mul) => {
    const state = solo({ level: 2, units: 49 }, mul);
    expect(capacityOf(state.towers['p']!, state)).toBe(C.CAPACITY[2]);
    run(state, 13);
    expect(state.towers['p']!).toMatchObject({ level: 2, units: 49 });
    step(state);
    expect(state.towers['p']!).toMatchObject({ level: 3, units: 50 });
  });

  it.each(MULS)('×%s: the whole ladder from 10 units — L2 at 25, L3 at 50, then holds floor(100 × mul)', (mul) => {
    const state = solo({ level: 1, units: 10 }, mul);
    // 15 s at L1 (25), 25 × 0.7 s at L2 (50), then L3 at 500 ms per unit up to the modified cap.
    expect(upgradesOver(state, 2000)).toEqual([
      ['p', 2, 25],
      ['p', 3, 50],
    ]);
    expect(state.towers['p']!.units).toBe(Math.floor(100 * mul));
  });
});

describe('AUD-B1: capacityMul is the max-level holding cap', () => {
  it.each(MULS)('×%s: an L3 holds floor(100 × mul), production stops there, no level is gained', (mul) => {
    const cap = Math.floor(100 * mul);
    const state = solo({ level: 3, units: 100 }, mul);
    expect(capacityOf(state.towers['p']!, state)).toBe(cap);
    expect(upgradesOver(state, 400)).toEqual([]); // 20 s at 500 ms per unit: enough to overfill
    expect(state.towers['p']!).toMatchObject({ level: 3, units: cap, genAccMs: 0 });
  });

  it.each(MULS)('×%s: a fortress upgrades at its base 37, holds floor(75 × mul) at L2 and never upgrades', (mul) => {
    const f1 = solo({ kind: 'fortress', level: 1, units: 36 }, mul);
    expect(capacityOf(f1.towers['p']!, f1)).toBe(37);
    expect(upgradesOver(f1, 20)).toEqual([['p', 2, 37]]);

    const cap = Math.floor(75 * mul);
    const f2 = solo({ kind: 'fortress', level: 2, units: 74 }, mul);
    expect(capacityOf(f2.towers['p']!, f2)).toBe(cap);
    expect(upgradesOver(f2, 600)).toEqual([]); // 30 s at 700 ms per unit
    expect(f2.towers['p']!).toMatchObject({ level: 2, units: cap });
    expect(C.FORTRESS_MAX_LEVEL).toBe(2);
  });
});

describe('AUD-B1: arrivals and supply lines see the base threshold', () => {
  it.each(MULS)('×%s: a reinforcement landing on an L1 at 24 upgrades it at 25 in the arrival tick', (mul) => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 24, level: 1 },
          { id: 'q', x: 360, y: 400, owner: 'player', units: 0, level: 1 },
        ],
      }),
      1,
      mods(mul),
    );
    spawn(state, { owner: 'player', from: 'q', to: 'p', progress: 0.995 });
    expect(upgradesOver(state, 1)).toEqual([['p', 2, 25]]);
  });

  it.each(MULS)('×%s: a supply line into a streaming L1 ends with targetFull at 25, not floor(25 × mul)', (mul) => {
    // `p` streams into a neutral (so it cannot upgrade); `q` reinforces it; one more unit fills it.
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 24, level: 1 },
          { id: 'q', x: 360, y: 600, owner: 'player', units: 10, level: 1 },
          { id: 'n', x: 60, y: 1000, owner: 'neutral', units: 50, level: 1 },
        ],
      }),
      1,
      mods(mul),
    );
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'n' });
    applyCommand(state, { type: 'link', owner: 'player', from: 'q', to: 'p' });
    expect(isLinked(state, 'q')).toBe(true);
    spawn(state, { owner: 'player', from: 'q', to: 'p', progress: 0.995 });
    const events: SimEvent[] = [];
    for (let i = 0; i < 2; i++) {
      step(state);
      events.push(...state.events);
    }
    expect(state.towers['p']!).toMatchObject({ level: 1, units: 25 });
    expect(events).toContainEqual({ type: 'unlinked', owner: 'player', from: 'q', to: 'p', reason: 'targetFull' });
    expect(isLinked(state, 'q')).toBe(false);
  });
});

describe('AUD-B1: enemy towers are unaffected by the player capacity track', () => {
  it.each(MULS)('×%s: an enemy L1 upgrades at 25 and 50, an enemy L3 clamps at 100, an enemy fortress at 75', (mul) => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'a', x: 100, y: 100, owner: 'enemy1', units: 24, level: 1 },
          { id: 'b', x: 600, y: 100, owner: 'enemy1', units: 99, level: 3 },
          { id: 'f', x: 100, y: 1100, owner: 'enemy1', units: 74, level: 2, kind: 'fortress' },
        ],
      }),
      1,
      mods(mul),
    );
    expect(capacityOf(state.towers['b']!, state)).toBe(100);
    expect(capacityOf(state.towers['f']!, state)).toBe(75);
    // 20 s: 1 s to 25 at L1, then 25 × 0.7 s = 17.5 s to 50 at L2.
    expect(upgradesOver(state, 400)).toEqual([
      ['a', 2, 25],
      ['a', 3, 50],
    ]);
    expect(state.towers['b']!).toMatchObject({ level: 3, units: 100 });
    expect(state.towers['f']!).toMatchObject({ level: 2, units: 75 });
  });
});
