import { describe, expect, it } from 'vitest';
import { makeLevel, wall } from '../helpers';
import type { LevelDef, PlayerModifiers } from '../../src/sim/types';
import { DEFAULT_MODIFIERS } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { capacityOf, modifiersFor, step } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import { run, spawn } from './util';

/*
 * Commander upgrades: permanent player-only modifiers (see PlayerModifiers in types.ts).
 * Every test also checks that the enemy is untouched by the same modifiers.
 */

const mods = (over: Partial<PlayerModifiers>): PlayerModifiers => ({ ...DEFAULT_MODIFIERS, ...over });

/** One player tower and one enemy tower, no road, so both just generate. */
function duo(units = 10, level: 1 | 2 | 3 = 1): LevelDef {
  return makeLevel({
    towers: [
      { id: 'p', x: 100, y: 100, owner: 'player', units, level },
      { id: 'e', x: 500, y: 100, owner: 'enemy1', units, level },
    ],
  });
}

describe('player modifiers: defaults and state', () => {
  it('createState stores DEFAULT_MODIFIERS when none are given', () => {
    const state = createState(makeLevel(), 1);
    expect(state.modifiers).toEqual({ productionMul: 1, capacityMul: 1, startGarrisonBonus: 0, unitSpeedMul: 1 });
    expect(state.modifiers).toEqual(DEFAULT_MODIFIERS);
  });

  it('stores a copy of the given modifiers (part of the replay input)', () => {
    const m = mods({ productionMul: 1.2 });
    const state = createState(makeLevel(), 1, m);
    expect(state.modifiers).toEqual(m);
    expect(state.modifiers).not.toBe(m);
    m.productionMul = 9;
    expect(state.modifiers.productionMul).toBe(1.2);
  });

  it('rejects NaN / non-positive multipliers and a negative bonus', () => {
    expect(() => createState(makeLevel(), 1, mods({ productionMul: 0 }))).toThrow(/productionMul/);
    expect(() => createState(makeLevel(), 1, mods({ capacityMul: Number.NaN }))).toThrow(/capacityMul/);
    expect(() => createState(makeLevel(), 1, mods({ unitSpeedMul: -1 }))).toThrow(/unitSpeedMul/);
    expect(() => createState(makeLevel(), 1, mods({ startGarrisonBonus: -1 }))).toThrow(/startGarrisonBonus/);
    expect(() => createState(makeLevel(), 1, mods({ startGarrisonBonus: 1.5 }))).toThrow(/startGarrisonBonus/);
  });

  it('modifiersFor returns the state modifiers only for the player', () => {
    const state = createState(duo(), 1, mods({ capacityMul: 1.25 }));
    expect(modifiersFor('player', state).capacityMul).toBe(1.25);
    expect(modifiersFor('enemy1', state)).toBe(DEFAULT_MODIFIERS);
    expect(modifiersFor('neutral', state)).toBe(DEFAULT_MODIFIERS);
    expect(modifiersFor('player')).toBe(DEFAULT_MODIFIERS);
  });
});

describe('productionMul', () => {
  it('1.2 at L1 → one unit every 833 ms (tick 17), 12 units in 10 s; enemy stays at 1 per second', () => {
    const state = createState(duo(), 1, mods({ productionMul: 1.2 }));
    run(state, 16); // 800 ms < 833.3 ms
    expect(state.towers['p']!.units).toBe(10);
    run(state, 1); // 850 ms
    expect(state.towers['p']!.units).toBe(11);
    run(state, 199 - 17); // 9950 ms: 11 produced (12th lands at 10 000 ms)
    expect(state.towers['p']!.units).toBe(21);
    run(state, 2); // 10 050 ms
    expect(state.towers['p']!.units).toBe(22);
    expect(state.towers['e']!.units).toBe(20); // 10 s at 1000 ms → +10
  });

  it('stacks multiplicatively with overdrive (×3 × 1.2 → one unit every ~278 ms)', () => {
    const state = createState(duo(), 1, mods({ productionMul: 1.2 }));
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'overdrive' });
    run(state, 5); // 250 ms × 3 = 750 < 833.3
    expect(state.towers['p']!.units).toBe(10);
    run(state, 1); // 300 ms × 3 = 900 ≥ 833.3
    expect(state.towers['p']!.units).toBe(11);
    run(state, 5); // 550 ms × 3 = 1650 < 1666.7
    expect(state.towers['p']!.units).toBe(11);
    run(state, 1); // 600 ms × 3 = 1800 ≥ 1666.7
    expect(state.towers['p']!.units).toBe(12);
    expect(state.towers['e']!.units).toBe(10);
  });

  it('also speeds up artillery and tank factories owned by the player', () => {
    const level = makeLevel({
      towers: [
        { id: 'a', x: 100, y: 100, owner: 'player', units: 0, kind: 'artillery' },
        { id: 't', x: 100, y: 300, owner: 'player', units: 0, kind: 'tankFactory' },
      ],
    });
    const state = createState(level, 1, mods({ productionMul: 2 }));
    run(state, 19); // artillery: 2000 / 2 = 1000 ms → tick 20; tank: 4000 / 2 = 2000 ms → tick 40
    expect(state.towers['a']!.units).toBe(0);
    run(state, 1);
    expect(state.towers['a']!.units).toBe(1);
    expect(state.towers['t']!.units).toBe(0);
    run(state, 20);
    expect(state.towers['t']!.units).toBe(5);
  });
});

describe('capacityMul', () => {
  it('1.25 at L1 → cap 31 for the player (floor of 31.25), 25 for the enemy', () => {
    const state = createState(duo(0), 1, mods({ capacityMul: 1.25 }));
    expect(capacityOf(state.towers['p']!, state)).toBe(31);
    expect(capacityOf(state.towers['e']!, state)).toBe(25);
    expect(capacityOf(state.towers['p']!)).toBe(25); // no state → base capacity
  });

  it('1.25 at L3 → the player fills to 125 while the enemy clamps at 100', () => {
    const state = createState(duo(90, 3), 1, mods({ capacityMul: 1.25 }));
    run(state, 400); // 20 s at L3: 40 produced, plenty for both to fill
    expect(state.towers['p']!.units).toBe(125);
    expect(state.towers['e']!.units).toBe(100);
  });

  it.each([
    ['barracks', 2, 50, 62],
    ['fortress', 2, 75, 93],
    ['artillery', 1, 25, 31],
    ['tankFactory', 1, 25, 31],
  ] as const)('%s L%i: base %i → 62.5 %% more is %i', (kind, level, base, modified) => {
    const state = createState(
      makeLevel({ towers: [{ id: 'p', x: 0, y: 0, owner: 'player', kind, level }]}),
      1,
      mods({ capacityMul: 1.25 }),
    );
    expect(capacityOf(state.towers['p']!)).toBe(base);
    expect(capacityOf(state.towers['p']!, state)).toBe(modified);
  });

  it('never drops below 1', () => {
    const state = createState(duo(), 1, mods({ capacityMul: 0.01 }));
    expect(capacityOf(state.towers['p']!, state)).toBe(1);
  });

  it('caps friendly arrivals at the modified capacity', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 121, level: 3 },
      { id: 'q', x: 360, y: 400, owner: 'player', units: 5, level: 1 },
    ] }), 1, mods({ capacityMul: 1.25 }));
    spawn(state, { owner: 'player', from: 'q', to: 'p', progress: 1, weight: 5 });
    step(state);
    expect(state.towers['p']!.units).toBe(125); // 121 + 5 → 126 capped at 125 (not 100)
  });
});

describe('startGarrisonBonus', () => {
  it('+3 adds 3 units to every player tower and none to enemies or neutrals', () => {
    const level = makeLevel({
      towers: [
        { id: 'p1', x: 0, y: 0, owner: 'player', units: 10 },
        { id: 'p2', x: 0, y: 100, owner: 'player', units: 0, kind: 'artillery' },
        { id: 'e', x: 0, y: 200, owner: 'enemy1', units: 10 },
        { id: 'n', x: 0, y: 300, owner: 'neutral', units: 10 },
      ],
    });
    const state = createState(level, 1, mods({ startGarrisonBonus: 3 }));
    expect(state.towers['p1']!.units).toBe(13);
    expect(state.towers['p2']!.units).toBe(3);
    expect(state.towers['e']!.units).toBe(10);
    expect(state.towers['n']!.units).toBe(10);
  });

  it('is capped at capacity, including the capacityMul bonus', () => {
    const plain = createState(duo(22), 1, mods({ startGarrisonBonus: 5 }));
    expect(plain.towers['p']!.units).toBe(25);
    const roomy = createState(duo(22), 1, mods({ startGarrisonBonus: 5, capacityMul: 1.25 }));
    expect(roomy.towers['p']!.units).toBe(27);
    const full = createState(duo(30), 1, mods({ startGarrisonBonus: 5, capacityMul: 1.25 }));
    expect(full.towers['p']!.units).toBe(31);
  });
});

describe('unitSpeedMul', () => {
  /** Player (p) and enemy (e) each 600 px from a neutral target; a wall keeps the two halves apart. */
  function marchLevel(): LevelDef {
    return makeLevel({
      towers: [
        { id: 'p', x: 60, y: 1000, owner: 'player', units: 10 },
        { id: 'e', x: 660, y: 1000, owner: 'enemy1', units: 10 },
        { id: 'n', x: 60, y: 400, owner: 'neutral', units: 10 },
        { id: 'm', x: 660, y: 400, owner: 'neutral', units: 10 },
      ],
      obstacles: [wall(360, 0, 360, 1280)],
    });
  }

  it('×1.15 → 138 px/s, 600 px in 87 ticks instead of 100; enemy unchanged', () => {
    const state = createState(marchLevel(), 1, mods({ unitSpeedMul: 1.15 }));
    expect(Object.keys(state.roads).sort()).toEqual(['e-m', 'n-p']);
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'n' });
    applyCommand(state, { type: 'link', owner: 'enemy1', from: 'e', to: 'm' });
    run(state, 20); // 1000 ms: the first unit of each L1 stream leaves
    const pu = state.units.find((u) => u.owner === 'player')!;
    const eu = state.units.find((u) => u.owner === 'enemy1')!;
    expect(pu.speed).toBeCloseTo(138, 10);
    expect(eu.speed).toBe(C.UNIT_SPEED);
    run(state, 85); // tick 106: 4300 ms × 138 = 593 px, not there yet
    expect(state.towers['n']!.units).toBe(10);
    expect(state.towers['m']!.units).toBe(10);
    run(state, 1); // tick 107: 600.3 px
    expect(state.towers['n']!.units).toBe(9);
    expect(state.towers['m']!.units).toBe(10);
    run(state, 12); // tick 119
    expect(state.towers['m']!.units).toBe(10);
    run(state, 1); // tick 120: 5000 ms × 120 = 600 px
    expect(state.towers['m']!.units).toBe(9);
  });

  it('applies to tanks too (84 × 1.15 = 96.6 px/s)', () => {
    const state = createState(
      makeLevel({ towers: [
        { id: 'p', x: 60, y: 1000, owner: 'player', units: 10, kind: 'tankFactory' },
        { id: 'n', x: 60, y: 400, owner: 'neutral', units: 10 },
      ] }),
      1,
      mods({ unitSpeedMul: 1.15 }),
    );
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'n' });
    run(state, 80); // TANK_GEN_MS[1] = 4000
    expect(state.units[0]).toMatchObject({ kind: 'tank', weight: 5 });
    expect(state.units[0]!.speed).toBeCloseTo(C.UNIT_SPEED * C.TANK_SPEED_MUL * 1.15, 10);
  });
});

describe('modifiers follow the current owner', () => {
  const all = mods({ productionMul: 1.2, capacityMul: 1.25 });

  it('a captured enemy tower immediately produces and caps at player rates', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 0 },
    ] }), 1, all);
    expect(capacityOf(state.towers['e']!, state)).toBe(25);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 1 });
    step(state); // capture: e is now the player's with 1 unit
    expect(state.towers['e']!.owner).toBe('player');
    expect(state.towers['e']!.units).toBe(1);
    expect(capacityOf(state.towers['e']!, state)).toBe(31);
    run(state, 16); // 800 ms since capture
    expect(state.towers['e']!.units).toBe(1);
    run(state, 1); // 850 ms ≥ 833.3
    expect(state.towers['e']!.units).toBe(2);
  });

  it('a lost player tower reverts to base rates for the enemy', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 0 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 },
    ] }), 1, all);
    expect(capacityOf(state.towers['p']!, state)).toBe(31);
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 1 });
    step(state);
    expect(state.towers['p']!.owner).toBe('enemy1');
    expect(capacityOf(state.towers['p']!, state)).toBe(25);
    run(state, 19); // 950 ms since capture: 1.2× rate would already have produced
    expect(state.towers['p']!.units).toBe(1);
    run(state, 1); // 1000 ms
    expect(state.towers['p']!.units).toBe(2);
  });
});

describe('determinism with modifiers', () => {
  it('same level + seed + modifiers → identical states; different modifiers → different states', () => {
    const play = (m: PlayerModifiers) => {
      const state = createState(makeLevel(), 3, m);
      applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
      run(state, 200);
      return state;
    };
    const m = mods({ productionMul: 1.08, capacityMul: 1.1, startGarrisonBonus: 2, unitSpeedMul: 1.06 });
    expect(play(m)).toEqual(play({ ...m }));
    expect(play(m)).not.toEqual(play(DEFAULT_MODIFIERS));
    expect(play(DEFAULT_MODIFIERS)).toEqual(play({ ...DEFAULT_MODIFIERS }));
  });
});
