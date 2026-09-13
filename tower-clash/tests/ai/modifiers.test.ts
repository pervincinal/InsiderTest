import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { DEFAULT_MODIFIERS, Rng, applyCommand, createState } from '../../src/sim/index';
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

const sends = (cmds: Command[]) => cmds.filter((c) => c.type === 'sendUnits');

describe('common helpers read the owner\'s modifiers', () => {
  it('genPerSecond / projectedUnits: player production and capacity are boosted, the enemy\'s are not', () => {
    const state = createState(makeLevel(), 1, mods({ productionMul: 1.2, capacityMul: 1.25 }));
    const p = state.towers['p']!;
    const e = state.towers['e']!;
    expect(genPerSecond(p, state)).toBeCloseTo(1.2, 9);
    expect(genPerSecond(e, state)).toBe(1);
    expect(projectedUnits(p, 10_000, state)).toBe(22); // 10 + floor(12)
    expect(projectedUnits(e, 10_000, state)).toBe(20);
    expect(projectedUnits(p, 60_000, state)).toBe(37); // capped at floor(30 × 1.25)
    expect(projectedUnits(e, 60_000, state)).toBe(30);
    // A neutral never produces, boosted or not.
    const n = { ...p, owner: 'neutral' as const };
    expect(projectedUnits(n, 60_000, state)).toBe(10);
  });

  it('march speed: the player\'s columns are faster, an enemy column on the same road is not', () => {
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

  it('rusher at aggression 1 needs target + 1: 11 beats a 10-garrison, but not a 15-garrison from +5 start bonus', () => {
    expect(sends(enemyCommands(duel(11), rusher, new Rng(1)))).toHaveLength(1);
    const boosted = duel(11, mods({ startGarrisonBonus: 5 }));
    expect(boosted.towers['p']!.units).toBe(15);
    expect(sends(enemyCommands(boosted, rusher, new Rng(1)))).toHaveLength(0);
    expect(sends(enemyCommands(duel(16, mods({ startGarrisonBonus: 5 })), rusher, new Rng(1)))).toHaveLength(1);
  });
});

describe('reference player plans with its own modifiers', () => {
  it('rear tower: L2 at 42 sits at 84 % of base capacity and upgrades; at 47/62 with max upgrades it ships surplus forward instead', () => {
    // r (rear, L2) — p (front) — e (enemy): r has hops 2 to the nearest opponent.
    const level: LevelDef = makeLevel({
      towers: [
        { id: 'r', x: 360, y: 1150, owner: 'player', units: 42, level: 2 },
        { id: 'p', x: 360, y: 850, owner: 'player', units: 10 },
        { id: 'e', x: 360, y: 250, owner: 'enemy1', units: 40, level: 2 },
      ],
      roads: [
        { a: 'r', b: 'p' },
        { a: 'p', b: 'e' },
      ],
    });
    const plain = createState(level, 1);
    expect(referencePlayerCommands(plain, new Rng(1))).toEqual([{ type: 'upgrade', owner: 'player', towerId: 'r' }]);

    const boosted = createState(level, 1, MAX);
    expect(boosted.towers['r']!.units).toBe(47);
    expect(boosted.towers['p']!.units).toBe(15);
    const cmds = referencePlayerCommands(boosted, new Rng(1));
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ type: 'sendUnits', owner: 'player', from: 'r', to: 'p' });
    applyCommand(boosted, cmds[0]!);
    // Room at p is its boosted capacity: 37 − 15 = 22.
    expect(boosted.queues[0]).toMatchObject({ from: 'r', to: 'p', remaining: 22 });
    expect(boosted.towers['r']!.units).toBe(25);
  });

  it('reinforce: a helper 469 px away lands in time only with the march bonus (3.4 s vs 3.9 s against a 3.6 s deadline)', () => {
    const level: LevelDef = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 2 },
        { id: 'q', x: 60, y: 1360, owner: 'player', units: 9 },
        { id: 'e', x: 360, y: 640, owner: 'enemy1', units: 5 },
      ],
      roads: [
        { a: 'p', b: 'e' },
        { a: 'p', b: 'q' },
      ],
    });
    const attacked = (m: PlayerModifiers) => {
      const state = createState(level, 1, m);
      applyCommand(state, { type: 'sendUnits', owner: 'enemy1', from: 'e', to: 'p', ratio: 1 });
      return state;
    };
    expect(sends(referencePlayerCommands(attacked(DEFAULT_MODIFIERS), new Rng(1)))).toHaveLength(0);
    const fast = attacked(mods({ unitSpeedMul: 1.15 }));
    const help = referencePlayerCommands(fast, new Rng(1));
    expect(help).toHaveLength(1);
    expect(help[0]).toMatchObject({ type: 'sendUnits', from: 'q', to: 'p' });
    applyCommand(fast, help[0]!);
    expect(fast.towers['q']!.units).toBe(7);
  });

  it('home reserve times the enemy\'s column at base speed even when our own march is faster', () => {
    // p (30) attacks e (2); f (12) is 600 px away: its column lands in 5.0 s + 1.4 s, p regrows 6 → keep 13 − 6 = 7.
    // Timing f's column at our 138 px/s would land it at 5.8 s (regrow 5) and keep 8 instead.
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
    for (const m of [DEFAULT_MODIFIERS, mods({ unitSpeedMul: 1.15 })]) {
      const state = createState(level, 1, m);
      for (const cmd of referencePlayerCommands(state, new Rng(1))) applyCommand(state, cmd);
      expect(state.queues[0]).toMatchObject({ from: 'p', to: 'e', remaining: 23 });
      expect(state.towers['p']!.units).toBe(7);
    }
    // With the production bonus p regrows 7 in those 6.4 s and may keep one fewer.
    const rich = createState(level, 1, mods({ productionMul: 1.2 }));
    for (const cmd of referencePlayerCommands(rich, new Rng(1))) applyCommand(rich, cmd);
    expect(rich.queues[0]).toMatchObject({ from: 'p', to: 'e', remaining: 24 });
    expect(rich.towers['p']!.units).toBe(6);
  });
});
