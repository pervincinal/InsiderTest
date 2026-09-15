import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { DEFAULT_MODIFIERS, Rng, applyCommand, createState, step } from '../../src/sim/index';
import type { Command, EnemyDef, LevelDef, PlayerModifiers } from '../../src/sim/index';
import { enemyCommands, referencePlayerCommands } from '../../src/ai/index';
import { genPerSecond, neighbours, projectedUnits, travelMsFor, unitSpeedFor } from '../../src/ai/common';

/*
 * Commander upgrades are public information: the AI's estimates must use the player's modifiers for
 * player towers and columns (capacityOf / modifiersFor through the shared helpers) and base values for
 * everyone else. Each test pins the numbers with and without the modifier.
 */

const mods = (over: Partial<PlayerModifiers>): PlayerModifiers => ({ ...DEFAULT_MODIFIERS, ...over });
/** Every Commander track at its cap (ECONOMY.md §3.2). */
const MAX: PlayerModifiers = { productionMul: 1.2, capacityMul: 1.25, startGarrisonBonus: 5, unitSpeedMul: 1.15 };

const links = (cmds: Command[]) => cmds.filter((c) => c.type === 'link');
const link = (from: string, to: string): Command => ({ type: 'link', owner: 'player', from, to });

describe("common helpers read the owner's modifiers", () => {
  it("genPerSecond / projectedUnits: player production and capacity are boosted, the enemy's are not", () => {
    const state = createState(makeLevel(), 1, mods({ productionMul: 1.2, capacityMul: 1.25 }));
    const p = state.towers['p']!;
    const e = state.towers['e']!;
    expect(genPerSecond(p, state)).toBeCloseTo(1.2, 9);
    expect(genPerSecond(e, state)).toBe(1);
    expect(projectedUnits(p, 10_000, state)).toBe(22); // 10 + floor(12)
    expect(projectedUnits(e, 10_000, state)).toBe(20);
    expect(projectedUnits(p, 60_000, state)).toBe(31); // capped at floor(25 × 1.25) — the L1 ladder step
    expect(projectedUnits(e, 60_000, state)).toBe(25);
    // A neutral never produces, boosted or not.
    const n = { ...p, owner: 'neutral' as const };
    expect(projectedUnits(n, 60_000, state)).toBe(10);
  });

  it("march speed: the player's columns are faster, an enemy column on the same road is not", () => {
    const state = createState(makeLevel(), 1, mods({ unitSpeedMul: 1.15 }));
    const road = state.roads['e-p']!;
    expect(road.length).toBe(600);
    expect(unitSpeedFor(state, 'player', 'infantry')).toBeCloseTo(138, 9);
    expect(unitSpeedFor(state, 'player', 'tank')).toBeCloseTo(96.6, 9);
    expect(unitSpeedFor(state, 'enemy1', 'infantry')).toBe(120);
    expect(travelMsFor(state, road, 'player')).toBeCloseTo(600_000 / 138, 6);
    expect(travelMsFor(state, road, 'enemy1')).toBe(5000);
    // From the player's tower: our walk is the fast one, theirs back to us is the base one.
    const fromP = neighbours(state, 'p')[0]!;
    expect(fromP.travelMs).toBeCloseTo(4347.83, 2);
    expect(fromP.theirTravelMs).toBe(5000);
    const fromE = neighbours(state, 'e')[0]!;
    expect(fromE.travelMs).toBe(5000);
    expect(fromE.theirTravelMs).toBeCloseTo(4347.83, 2);
  });
});

describe('enemy planners see the boosted player', () => {
  const rusher: EnemyDef = { owner: 'enemy1', personality: 'rusher', aggression: 1 };
  const duel = (enemyUnits: number, m: PlayerModifiers = DEFAULT_MODIFIERS) =>
    createState(
      makeLevel({
        enemies: [rusher],
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
          { id: 'e', x: 360, y: 400, owner: 'enemy1', units: enemyUnits },
        ],
      }),
      1,
      m,
    );

  it('rusher at aggression 1 needs target + 1: 11 links at a 10-garrison, but not at a 15-garrison from +5 start bonus', () => {
    expect(links(enemyCommands(duel(11), rusher, new Rng(1)))).toHaveLength(1);
    const boosted = duel(11, mods({ startGarrisonBonus: 5 }));
    expect(boosted.towers['p']!.units).toBe(15);
    expect(enemyCommands(boosted, rusher, new Rng(1))).toEqual([]);
    expect(links(enemyCommands(duel(16, mods({ startGarrisonBonus: 5 })), rusher, new Rng(1)))).toHaveLength(1);
  });
});

describe('reference player plans with its own modifiers', () => {
  it('a finished rear keep supplies forward: L3 at 100 (full, plain) and at 105 of 125 (boosted, 84 % full) both stream', () => {
    // r (rear, L3) — p (front) — e (an untouchable L3 keep): r has hops 2 to the nearest opponent and
    // nothing to grow into, and no attack is on.
    const level: LevelDef = makeLevel({
      towers: [
        { id: 'r', x: 360, y: 1150, owner: 'player', units: 100, level: 3 },
        { id: 'p', x: 360, y: 850, owner: 'player', units: 10 },
        { id: 'e', x: 360, y: 250, owner: 'enemy1', units: 100, level: 3 },
      ],
      roads: [
        { a: 'r', b: 'p' },
        { a: 'p', b: 'e' },
      ],
    });
    expect(referencePlayerCommands(createState(level, 1), new Rng(1))).toEqual([link('r', 'p')]);
    const boosted = createState(level, 1, MAX);
    expect(boosted.towers['r']!.units).toBe(105);
    expect(boosted.towers['p']!.units).toBe(15);
    expect(referencePlayerCommands(boosted, new Rng(1))).toEqual([link('r', 'p')]);
    // Below 60 % of its (boosted) capacity it keeps growing instead.
    const growing = createState(level, 1, MAX);
    growing.towers['r']!.units = 70; // 56 % of 125
    expect(referencePlayerCommands(growing, new Rng(1))).toEqual([]);
  });

  it('reinforce: a helper 469 px away lands in time only with the march bonus (3.4 s vs 3.9 s)', () => {
    const level: LevelDef = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 2 },
        { id: 'q', x: 60, y: 1360, owner: 'player', units: 9 },
        { id: 'e', x: 360, y: 640, owner: 'enemy1', units: 8 },
      ],
      roads: [
        { a: 'p', b: 'e' },
        { a: 'p', b: 'q' },
      ],
    });
    const attacked = (m: PlayerModifiers) => {
      const state = createState(level, 1, m);
      applyCommand(state, { type: 'link', owner: 'enemy1', from: 'e', to: 'p' });
      return state;
    };
    expect(referencePlayerCommands(attacked(DEFAULT_MODIFIERS), new Rng(1))).toEqual([]);
    expect(referencePlayerCommands(attacked(mods({ unitSpeedMul: 1.15 })), new Rng(1))).toEqual([link('q', 'p')]);
  });

  it("home reserve times the enemy's column at base speed even when our own march is faster", () => {
    // p (30) streams at e (2); f (12) is 600 px away: its column lands in 5.0 s + 1.4 s, p regrows 6 → keep 7.
    // The stream drains 4 per AI tick, so it ends on the tick p is down to 7.
    const level: LevelDef = makeLevel({
      towers: [
        { id: 'p', x: 660, y: 1000, owner: 'player', units: 30 },
        { id: 'e', x: 660, y: 700, owner: 'enemy1', units: 2 },
        { id: 'f', x: 60, y: 1000, owner: 'enemy1', units: 12 },
      ],
      roads: [
        { a: 'p', b: 'e' },
        { a: 'p', b: 'f' },
      ],
    });
    for (const m of [DEFAULT_MODIFIERS, mods({ unitSpeedMul: 1.15 }), mods({ productionMul: 1.2 })]) {
      const state = createState(level, 1, m);
      expect(referencePlayerCommands(state, new Rng(1))).toEqual([link('p', 'e')]);
      applyCommand(state, link('p', 'e'));
      let ended = 0;
      while (state.time < 6000 && !ended) {
        step(state);
        if (state.time % 500 !== 0) continue;
        const cmds = referencePlayerCommands(state, new Rng(1));
        if (cmds.length) {
          expect(cmds).toEqual([{ type: 'unlink', owner: 'player', from: 'p', to: 'e' }]);
          ended = state.time;
        }
        for (const cmd of cmds) applyCommand(state, cmd);
      }
      expect(ended).toBe(3000);
      expect(state.towers['p']!.units).toBe(7);
    }
  });
});
