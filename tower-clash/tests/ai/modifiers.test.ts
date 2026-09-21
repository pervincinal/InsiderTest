import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { DEFAULT_MODIFIERS, Rng, applyCommand, createState } from '../../src/sim/index';
import type { Command, EnemyDef, LevelDef, PlayerModifiers } from '../../src/sim/index';
import { enemyCommands, referencePlayerCommands } from '../../src/ai/index';
import { genPerSecond, laneFlow, linkRate, neighbours, projectedUnits, siegeOf, travelMsFor, unitSpeedFor } from '../../src/ai/common';

/*
 * Commander upgrades are public information: the AI's estimates must use the player's modifiers for
 * player towers and columns (capacityOf / modifiersFor / streamRate through the shared helpers) and base
 * values for everyone else. Each test pins the numbers with and without the modifier.
 */

const mods = (over: Partial<PlayerModifiers>): PlayerModifiers => ({ ...DEFAULT_MODIFIERS, ...over });
/** A deliberately strong fixture (the pre-retune 2026-09-13 caps) so every effect is visible; the shipped ladder is `maxedModifiers()` in src/economy/maxUpgrades.ts (QA-3). */
const MAX: PlayerModifiers = { productionMul: 1.2, capacityMul: 1.25, startGarrisonBonus: 5, unitSpeedMul: 1.15 };

const link = (from: string, to: string): Command => ({ type: 'link', owner: 'player', from, to });

describe("common helpers read the owner's modifiers", () => {
  it("genPerSecond / linkRate / projectedUnits: player production, streams and capacity are boosted, the enemy's are not", () => {
    const state = createState(makeLevel(), 1, mods({ productionMul: 1.2, capacityMul: 1.25 }));
    const p = state.towers['p']!;
    const e = state.towers['e']!;
    expect(genPerSecond(p, state)).toBeCloseTo(1.2, 9);
    expect(genPerSecond(e, state)).toBe(1);
    expect(linkRate(state, p)).toBeCloseTo(1.2, 9); // rules v3: a stream is production
    expect(linkRate(state, e)).toBe(1);
    expect(projectedUnits(p, 10_000, state)).toBe(22); // 10 + floor(12)
    expect(projectedUnits(e, 10_000, state)).toBe(20);
    expect(projectedUnits(p, 60_000, state)).toBe(31); // capped at floor(25 × 1.25) — the L1 ladder step
    expect(projectedUnits(e, 60_000, state)).toBe(25);
    // A neutral never produces, boosted or not.
    const n = { ...p, owner: 'neutral' as const };
    expect(projectedUnits(n, 60_000, state)).toBe(10);
  });

  it("march speed: the player's stream is faster, an enemy stream on the same lane is not", () => {
    const state = createState(makeLevel(), 1, mods({ unitSpeedMul: 1.15 }));
    const road = state.roads['e-p']!;
    expect(road.length).toBe(600);
    expect(unitSpeedFor(state, 'player', 'infantry')).toBeCloseTo(138, 9);
    expect(unitSpeedFor(state, 'player', 'tank')).toBeCloseTo(96.6, 9);
    expect(unitSpeedFor(state, 'enemy1', 'infantry')).toBe(120);
    expect(travelMsFor(state, road, 'player')).toBeCloseTo(600_000 / 138, 6);
    expect(travelMsFor(state, road, 'enemy1')).toBe(5000);
    expect(neighbours(state, 'p')[0]!.travelMs).toBeCloseTo(4347.83, 2);
    expect(neighbours(state, 'e')[0]!.travelMs).toBe(5000);
    expect(laneFlow(state, { owner: 'player', from: 'p', to: 'e' }, [])!.startMs).toBeCloseTo(1000 + 4347.83, 2);
    expect(laneFlow(state, { owner: 'enemy1', from: 'e', to: 'p' }, [])!.startMs).toBe(6000);
  });

  it('a boosted player stream (1.2/s) outrates an enemy L1 shield: the surplus lands', () => {
    const state = createState(makeLevel(), 1, mods({ productionMul: 1.2 }));
    applyCommand(state, link('p', 'e'));
    applyCommand(state, { type: 'link', owner: 'enemy1', from: 'e', to: 'p' });
    const s = siegeOf(state, state.towers['e']!);
    expect(s.hostileRate).toBeCloseTo(0.2, 9);
    expect(s.fallsAtMs).toBeLessThan(Infinity);
    expect(siegeOf(state, state.towers['p']!).hostileRate).toBe(0);
  });
});

describe('enemy planners see the boosted player', () => {
  const rusher: EnemyDef = { owner: 'enemy1', personality: 'rusher', aggression: 1 };
  const duel = (playerUnits: number, m: PlayerModifiers = DEFAULT_MODIFIERS) =>
    createState(
      makeLevel({
        enemies: [rusher],
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: playerUnits },
          { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 8 },
        ],
      }),
      1,
      m,
    );

  it('a rusher links at a player L1 that falls within 30 s (18 units: first landing at 6 s on 24, 24 more = 30 s → yes; 19 → no), and reads the +5 start bonus', () => {
    expect(enemyCommands(duel(18), rusher, new Rng(1))).toEqual([{ type: 'link', owner: 'enemy1', from: 'e', to: 'p' }]);
    expect(enemyCommands(duel(19), rusher, new Rng(1))).toEqual([]);
    const boosted = duel(13, mods({ startGarrisonBonus: 5 }));
    expect(boosted.towers['p']!.units).toBe(18);
    expect(enemyCommands(boosted, rusher, new Rng(1))).toHaveLength(1);
    expect(enemyCommands(duel(14, mods({ startGarrisonBonus: 5 })), rusher, new Rng(1))).toEqual([]);
  });
});

describe('reference player plans with its own modifiers', () => {
  it('a capped rear keep supplies forward: L3 at 100 (plain) and at 125 (boosted) both stream; at 105 of 125 it still grows', () => {
    // r (rear, L3) — p (front) — e (an L3 keep with three links: nothing to attack); r's only lane is to p.
    const level: LevelDef = makeLevel({
      towers: [
        { id: 'r', x: 360, y: 1150, owner: 'player', units: 100, level: 3 },
        { id: 'p', x: 360, y: 850, owner: 'player', units: 10 },
        { id: 'e', x: 360, y: 250, owner: 'enemy1', units: 100, level: 3 },
      ],
    });
    expect(referencePlayerCommands(createState(level, 1), new Rng(1))).toEqual([link('r', 'p')]);
    const boosted = createState(level, 1, MAX);
    expect(boosted.towers['r']!.units).toBe(105);
    expect(boosted.towers['p']!.units).toBe(15);
    expect(referencePlayerCommands(boosted, new Rng(1))).toEqual([]); // 105 < 125: not capped, it grows
    boosted.towers['r']!.units = 125;
    expect(referencePlayerCommands(boosted, new Rng(1))).toEqual([link('r', 'p')]);
  });

  it('counter: the helper’s siege of the attacker’s source is timed with its own march speed and rate', () => {
    // e (L1, 8 units, linked → not growing) streams at p (2 units). q counters e: 780 px lane.
    const level: LevelDef = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 2 },
        { id: 'q', x: 60, y: 1360, owner: 'player', units: 9 },
        { id: 'e', x: 360, y: 640, owner: 'enemy1', units: 8 },
      ],
    });
    const attacked = (m: PlayerModifiers) => {
      const state = createState(level, 1, m);
      applyCommand(state, { type: 'link', owner: 'enemy1', from: 'e', to: 'p' });
      return state;
    };
    const plain = attacked(DEFAULT_MODIFIERS);
    expect(referencePlayerCommands(plain, new Rng(1))).toContainEqual(link('q', 'e'));
    const plainFall = siegeOf(plain, plain.towers['e']!, { planned: [{ owner: 'player', from: 'q', to: 'e' }] }).fallsAtMs;
    expect(plainFall).toBeCloseTo(1000 + 780_000 / 120 + 8000, 0); // 1 s emit + 6.5 s march + 8 more landings
    const fast = attacked(mods({ unitSpeedMul: 1.15, productionMul: 1.2 }));
    expect(referencePlayerCommands(fast, new Rng(1))).toContainEqual(link('q', 'e'));
    const fastFall = siegeOf(fast, fast.towers['e']!, { planned: [{ owner: 'player', from: 'q', to: 'e' }] }).fallsAtMs;
    expect(fastFall).toBeCloseTo(1000 / 1.2 + 780_000 / 138 + 8000 / 1.2, 0);
    expect(fastFall).toBeLessThan(plainFall);
  });
});
