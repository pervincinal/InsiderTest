import { describe, expect, it } from 'vitest';
import { makeLevel, wall } from '../helpers';
import { C, applyCommand, createState, step } from '../../src/sim/index';
import type { GameState } from '../../src/sim/index';
import {
  artilleryKillRate,
  emitRate,
  fallsAtMs,
  flipOwner,
  hopsToOpponent,
  laneFlow,
  linkRate,
  reinforcePlan,
  siegeOf,
  siegePlan,
  walkingLandings,
} from '../../src/ai/common';

/*
 * Rules v3 threat model (GDD §2.0b rule 10, §2.5). Every number below is checked against the sim where
 * the sim can be run: the model must predict the flip to the tick, or within one landing when the
 * sim's one-tick-early arrival crosses a recruit.
 */

/** Default fixture: p (player, 10) at (360,1000), e (enemy1, 10) at (360,400): one 600 px lane = 5 s travel. */
function duel(over: Parameters<typeof makeLevel>[0] = {}): GameState {
  return createState(makeLevel(over), 1);
}

function link(state: GameState, owner: 'player' | 'enemy1' | 'enemy2', from: string, to: string): void {
  applyCommand(state, { type: 'link', owner, from, to });
}

/** Run until `towerId` changes owner or `maxMs`; returns the sim time of the flip (or Infinity). */
function flipTime(state: GameState, towerId: string, maxMs = 120_000): number {
  const owner = state.towers[towerId]!.owner;
  while (state.time < maxMs) {
    step(state);
    if (state.towers[towerId]!.owner !== owner) return state.time;
  }
  return Infinity;
}

describe('stream rates (GDD §2.0b rule 4)', () => {
  it('linkRate is the production rate of the kind and level, whatever the garrison', () => {
    const state = duel({
      towers: [
        { id: 'b1', x: 100, y: 100, owner: 'player', units: 1, level: 1 },
        { id: 'b2', x: 300, y: 100, owner: 'player', units: 99, level: 2 },
        { id: 'b3', x: 500, y: 100, owner: 'player', units: 3, level: 3 },
        { id: 'a1', x: 100, y: 300, owner: 'player', units: 5, level: 1, kind: 'artillery' },
        { id: 'f2', x: 300, y: 300, owner: 'player', units: 5, level: 2, kind: 'fortress' },
        { id: 't1', x: 500, y: 300, owner: 'player', units: 5, level: 1, kind: 'tankFactory' },
        { id: 't0', x: 100, y: 500, owner: 'player', units: 4, level: 1, kind: 'tankFactory' },
        { id: 'z', x: 300, y: 500, owner: 'player', units: 0, level: 3 },
        { id: 'n', x: 500, y: 500, owner: 'neutral', units: 10, level: 3 },
      ],
    });
    const rate = (id: string) => linkRate(state, state.towers[id]!);
    expect(rate('b1')).toBe(1);
    expect(rate('b2')).toBeCloseTo(1000 / 700, 9);
    expect(rate('b3')).toBe(2);
    expect(rate('a1')).toBe(0.5);
    expect(rate('f2')).toBeCloseTo(1000 / 700, 9);
    expect(rate('t1')).toBe(1.25); // one tank (5) every 4 s
    expect(emitRate(state, state.towers['t1']!)).toBe(0.25);
    expect(rate('t0')).toBe(0.25); // below a tank's weight it streams infantry every 4 s
    expect(rate('z')).toBe(0); // rule 6: a stream needs soldiers
    expect(rate('n')).toBe(0); // a neutral streams nothing
  });

  it('overdrive triples the owner’s rate, a freeze zeroes it', () => {
    const state = duel();
    expect(linkRate(state, state.towers['p']!)).toBe(1);
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'overdrive' });
    expect(linkRate(state, state.towers['p']!)).toBe(3);
    expect(linkRate(state, state.towers['e']!)).toBe(1);
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'freeze' });
    expect(linkRate(state, state.towers['e']!)).toBe(0);
    expect(linkRate(state, state.towers['p']!)).toBe(3);
  });
});

describe('laneFlow: what a stream lands', () => {
  it('lands its rate after the emit phase + travel time; an opposite hostile stream cancels it 1:1 in weight', () => {
    const state = duel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 2 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
      ],
    });
    const mine = { owner: 'player' as const, from: 'p', to: 'e' };
    const theirs = { owner: 'enemy1' as const, from: 'e', to: 'p' };
    const alone = laneFlow(state, mine, [mine])!;
    expect(alone.startMs).toBe(700 + 5000); // a fresh L2 link emits its first unit after one 700 ms interval
    expect(alone.firstWeight).toBe(1);
    expect(alone.rate).toBeCloseTo(1000 / 700, 9);
    expect(alone.hostile).toBe(true);
    const duelled = laneFlow(state, mine, [mine, theirs])!;
    expect(duelled.rate).toBeCloseTo(1000 / 700 - 1, 9); // the L2 surplus walks on
    const theirFlow = laneFlow(state, theirs, [mine, theirs])!;
    expect(theirFlow.rate).toBe(0); // the L1 stream never lands on the L2
  });

  it('artillery in range of the lane kills 1.25 units/s: an L1 stream into an artillery post never lands', () => {
    const state = duel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'q', x: 60, y: 1000, owner: 'player', units: 10, level: 2 },
        { id: 'g', x: 360, y: 400, owner: 'enemy1', units: 5, level: 1, kind: 'artillery' },
      ],
    });
    const road = state.roads['g-p']!;
    expect(artilleryKillRate(state, road, 'player')).toBe(1000 / C.ARTILLERY_COOLDOWN_MS);
    expect(artilleryKillRate(state, road, 'enemy1')).toBe(0);
    expect(laneFlow(state, { owner: 'player', from: 'p', to: 'g' }, [])!.rate).toBe(0);
    expect(laneFlow(state, { owner: 'player', from: 'q', to: 'g' }, [])!.rate).toBeCloseTo(1000 / 700 - 1.25, 9);
  });

  it('mines delay the first landing by the charges they eat', () => {
    const state = duel({ mines: [{ x: 370, y: 700, charges: 4 }] });
    const flow = laneFlow(state, { owner: 'player', from: 'p', to: 'e' }, [])!;
    expect(flow.startMs).toBe(1000 + 5000 + 4000);
    expect(flow.rate).toBe(1);
    link(state, 'player', 'p', 'e');
    for (let i = 0; i < 12; i++) step(state); // 600 ms into the emit phase
    expect(laneFlow(state, state.links[0]!, state.links)!.startMs).toBeCloseTo(400 + 5000 + 4000, 6);
  });
});

describe('siegeOf: when a tower falls (GDD §2.0b arithmetic)', () => {
  it('a neutral 10 over 600 px falls at 1 s emit + 5 s travel + 10 more landings = 16 s, to the tick', () => {
    const state = duel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'n', x: 360, y: 400, owner: 'neutral', units: 10 },
      ],
    });
    const before = fallsAtMs(state, state.towers['n']!);
    expect(before).toBe(Infinity);
    const planned = siegeOf(state, state.towers['n']!, { planned: [{ owner: 'player', from: 'p', to: 'n' }] });
    expect(planned.fallsAtMs).toBe(16_000);
    expect(planned.hostileRate).toBe(1);
    expect(planned.byOwner.get('player')).toBe(1);
    link(state, 'player', 'p', 'n');
    expect(Math.abs(flipTime(state, 'n') - 16_000)).toBeLessThanOrEqual(C.TICK_MS); // the sim lands a tick early (float progress)
    expect(state.towers['p']!.units).toBe(10); // the source's garrison never changes by sending
  });

  it('an enemy L1 grows until the first landing (6 s), then regenerates nothing (under fire): 10 + 6 grown → falls at 22 s, to the tick', () => {
    const state = duel();
    const s = siegeOf(state, state.towers['e']!, { planned: [{ owner: 'player', from: 'p', to: 'e' }] });
    expect(s.fallsAtMs).toBe(22_000);
    expect(s.firstHitMs).toBe(6000);
    link(state, 'player', 'p', 'e');
    // The sim lands one tick early, just before the 6th recruit: 15 defenders, 16 landings → 20.95 s (one landing off).
    expect(Math.abs(flipTime(state, 'e') - 22_000)).toBeLessThanOrEqual(1000 + C.TICK_MS);
  });

  it('a fortress needs two weight per defender', () => {
    const state = duel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 3 },
        { id: 'f', x: 360, y: 400, owner: 'neutral', units: 10, kind: 'fortress' },
      ],
    });
    const s = siegeOf(state, state.towers['f']!, { planned: [{ owner: 'player', from: 'p', to: 'f' }] });
    expect(s.fallsAtMs).toBe(500 + 5000 + ((2 * 10 + 2 - 1) / 2) * 1000); // 22 weight: one lands at 5.5 s, the rest at 2/s
    link(state, 'player', 'p', 'f');
    expect(Math.abs(flipTime(state, 'f') - s.fallsAtMs)).toBeLessThanOrEqual(500); // one L3 landing
  });

  it('equal streams on one lane cancel exactly: neither falls, net 0 (acceptance d)', () => {
    const state = duel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 25, level: 1 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 25, level: 1 },
      ],
    });
    link(state, 'player', 'p', 'e');
    link(state, 'enemy1', 'e', 'p');
    expect(siegeOf(state, state.towers['p']!).fallsAtMs).toBe(Infinity);
    expect(siegeOf(state, state.towers['e']!).hostileRate).toBe(0);
    while (state.time < 60_000) step(state);
    expect(state.towers['p']!.units).toBe(25);
    expect(state.towers['e']!.units).toBe(25);
  });

  it('a level difference nets rate(high) − rate(low) on the weaker side', () => {
    const state = duel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 25, level: 2 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 25, level: 1 },
      ],
    });
    link(state, 'player', 'p', 'e');
    link(state, 'enemy1', 'e', 'p');
    const s = siegeOf(state, state.towers['e']!);
    expect(s.hostileRate).toBeCloseTo(1000 / 700 - 1, 9);
    expect(s.fallsAtMs).toBeCloseTo(5000 + (26 / (1000 / 700 - 1)) * 1000, 3);
    expect(siegeOf(state, state.towers['p']!).fallsAtMs).toBe(Infinity);
  });

  it('a friendly stream into the target offsets the hostile one: reinforcement at the same rate makes it hold', () => {
    const state = duel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'q', x: 60, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
      ],
    });
    link(state, 'enemy1', 'e', 'p');
    expect(siegeOf(state, state.towers['p']!).fallsAtMs).toBe(22_000);
    const held = siegeOf(state, state.towers['p']!, { planned: [{ owner: 'player', from: 'q', to: 'p' }] });
    expect(held.fallsAtMs).toBe(Infinity);
    expect(held.friendlyRate).toBe(1);
  });

  it('a slow tank stream (one landing per 4 s) lets the target regenerate between landings', () => {
    const state = duel({
      towers: [
        { id: 't', x: 360, y: 1000, owner: 'player', units: 10, level: 1, kind: 'tankFactory' },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
      ],
    });
    const s = siegeOf(state, state.towers['e']!, { planned: [{ owner: 'player', from: 't', to: 'e' }] });
    // Tanks walk at 84 px/s (7.14 s); 1.25 weight/s lands; the gap of 4 s leaves 2.5 s of growth per 4 s.
    expect(s.hostileRate).toBe(1.25);
    expect(s.netRate).toBeCloseTo(1.25 - (1 * (4000 - C.UNDER_FIRE_MS)) / 4000, 9);
    expect(s.fallsAtMs).toBeGreaterThan(21_000);
    expect(s.fallsAtMs).toBeLessThan(60_000);
  });

  it('a linked target does not regenerate at all; a target at capacity is capped', () => {
    const state = duel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
        { id: 'x', x: 660, y: 400, owner: 'neutral', units: 50 },
      ],
    });
    link(state, 'enemy1', 'e', 'x'); // e streams elsewhere: it grows nothing
    const s = siegeOf(state, state.towers['e']!, { planned: [{ owner: 'player', from: 'p', to: 'e' }] });
    expect(s.fallsAtMs).toBe(16_000);
    link(state, 'player', 'p', 'e');
    expect(Math.abs(flipTime(state, 'e') - 16_000)).toBeLessThanOrEqual(C.TICK_MS);
    const full = duel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 24, level: 1 },
      ],
    });
    // 24 grows to the L1 cap of 25 in 1 s; the model caps the hit points there (the sim would upgrade — same cap).
    const c = siegeOf(full, full.towers['e']!, { planned: [{ owner: 'player', from: 'p', to: 'e' }] });
    expect(c.fallsAtMs).toBe(6000 + 25_000);
  });

  it('units already walking count as landings unless the target streams back down their lane', () => {
    const state = duel();
    link(state, 'player', 'p', 'e');
    for (let i = 0; i < 60; i++) step(state); // 3 s: three units on the lane
    expect(state.units.length).toBe(3);
    expect(walkingLandings(state, state.towers['e']!, state.links)).toHaveLength(3);
    const swept = walkingLandings(state, state.towers['e']!, [...state.links, { owner: 'enemy1', from: 'e', to: 'p' }]);
    expect(swept).toHaveLength(0);
  });
});

describe('flipOwner: who lands the flipping unit on a contested neutral', () => {
  it('equal L1 streams, ours 0.5 s ahead: a 5-unit neutral goes to the rival (its 6th landing), a 4-unit one to us', () => {
    const level = (units: number) =>
      duel({
        towers: [
          { id: 'home', x: 200, y: 1100, owner: 'player', units: 12 },
          { id: 'camp', x: 520, y: 760, owner: 'neutral', units },
          { id: 'foe', x: 200, y: 340, owner: 'enemy1', units: 8 },
        ],
      });
    for (const units of [5, 4]) {
      const state = level(units);
      link(state, 'player', 'home', 'camp');
      for (let i = 0; i < 10; i++) step(state); // the rival links half a second later
      link(state, 'enemy1', 'foe', 'camp');
      const predicted = flipOwner(state, state.towers['camp']!);
      flipTime(state, 'camp');
      expect(predicted).toBe(state.towers['camp']!.owner);
    }
    const alone = level(5);
    expect(flipOwner(alone, alone.towers['camp']!)).toBeUndefined();
    expect(flipOwner(alone, alone.towers['camp']!, { planned: [{ owner: 'player', from: 'home', to: 'camp' }] })).toBe('player');
  });
});

describe('plans', () => {
  it('siegePlan stacks the fastest sources until the target falls within the horizon, and gives up when it cannot', () => {
    const state = duel({
      towers: [
        { id: 'a', x: 60, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'b', x: 360, y: 1000, owner: 'player', units: 10, level: 3 },
        { id: 'c', x: 660, y: 1000, owner: 'player', units: 10, level: 2 },
        { id: 'k', x: 360, y: 400, owner: 'enemy1', units: 60, level: 3 },
      ],
    });
    const k = state.towers['k']!;
    const sources = [state.towers['a']!, state.towers['b']!, state.towers['c']!];
    // b alone (2/s): 5 s + (61 + 10 grown) / 2 ≈ 40 s. With c: ≈ 25 s.
    const slow = siegePlan(state, 'player', k, [state.towers['b']!], 30_000);
    expect(slow).toBeUndefined();
    const plan = siegePlan(state, 'player', k, sources, 30_000)!;
    expect(plan.links.map((l) => l.from)).toEqual(['a', 'b']); // in the given order
    expect(plan.siege.fallsAtMs).toBeLessThanOrEqual(30_000);
    expect(siegePlan(state, 'player', k, sources, 5_000)).toBeUndefined();
  });

  it('siegePlan skips a source whose stream would not land (cancelled by a shield)', () => {
    const state = duel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'q', x: 60, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 3, level: 1 },
      ],
    });
    link(state, 'enemy1', 'e', 'p');
    const plan = siegePlan(state, 'player', state.towers['e']!, [state.towers['p']!, state.towers['q']!], 30_000)!;
    expect(plan.links).toEqual([{ owner: 'player', from: 'q', to: 'e' }]);
  });

  it('reinforcePlan adds helpers until the tower holds', () => {
    const state = duel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 5, level: 1 },
        { id: 'q', x: 60, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'r', x: 660, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 2 },
      ],
    });
    link(state, 'enemy1', 'e', 'p');
    const helpers = [state.towers['q']!, state.towers['r']!];
    const plan = reinforcePlan(state, 'player', state.towers['p']!, helpers)!;
    expect(plan.links.map((l) => l.from)).toEqual(['q', 'r']); // one L1 (1/s) does not stop an L2 (1.43/s)
    expect(reinforcePlan(state, 'player', state.towers['p']!, [state.towers['q']!])).toBeUndefined();
  });
});

describe('map reading', () => {
  it('hopsToOpponent counts lane hops to the nearest rival tower; a wall breaks the lane', () => {
    const open = duel({
      towers: [
        { id: 'p', x: 360, y: 1100, owner: 'player', units: 10 },
        { id: 'n', x: 360, y: 700, owner: 'neutral', units: 5 },
        { id: 'e', x: 360, y: 300, owner: 'enemy1', units: 10 },
      ],
    });
    // p-n-e collinear: the middle tower blocks the direct p–e lane (TOWER_BLOCK_RADIUS).
    expect(open.roads['e-p']).toBeUndefined();
    const hops = hopsToOpponent(open, 'player');
    expect(hops.get('e')).toBe(0);
    expect(hops.get('n')).toBe(1);
    expect(hops.get('p')).toBe(2);
    const walled = duel({
      towers: [
        { id: 'p', x: 360, y: 1100, owner: 'player', units: 10 },
        { id: 'e', x: 360, y: 300, owner: 'enemy1', units: 10 },
      ],
      obstacles: [wall(100, 700, 620, 700)],
    });
    expect(hopsToOpponent(walled, 'player').get('p')).toBe(Infinity);
  });
});
