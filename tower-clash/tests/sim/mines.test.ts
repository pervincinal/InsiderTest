import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import type { GameState, MineDef, TowerDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { step } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import { run, spawn } from './util';

/*
 * QA bug hunt 2026-09-22, item 4: mines (GDD §2.0b rule 3) at their edges — one mine shared by two
 * lanes, a crossing that lands exactly on a tick boundary, a mine at a tower's edge (t clamped) met from
 * both directions, and a mine on a lane whose tower changes hands.
 */

/** `a` (player, west) with lanes to `b` (east) and `c` (south-east); the mines are placed by each test. */
function fork(mines: MineDef[], towers: Partial<TowerDef>[] = []): GameState {
  const defaults: TowerDef[] = [
    { id: 'a', x: 100, y: 100, owner: 'player', units: 25, level: 1 },
    { id: 'b', x: 400, y: 100, owner: 'enemy1', units: 10, level: 1 },
    { id: 'c', x: 400, y: 300, owner: 'enemy1', units: 10, level: 1 },
  ];
  return createState(makeLevel({ towers: defaults.map((t) => ({ ...t, ...(towers.find((o) => o.id === t.id) ?? {}) })), mines }), 1);
}

const dead = (s: GameState) => s.events.filter((e) => e.type === 'unitDied');

describe('one mine within 30 px of two lanes', () => {
  it('is recorded on both lanes with its own t, and its charges are one pool: two units, one per lane, spend 2', () => {
    const s = fork([{ x: 160, y: 120, charges: 2 }]); // 20 px off a–b, 16.6 px off a–c
    expect(s.roads['a-b']!.mineHits).toEqual([{ mine: 0, t: 0.2 }]);
    expect(s.roads['a-c']!.mineHits).toHaveLength(1);
    expect(s.roads['b-c']!.mineHits).toEqual([]);
    const tc = s.roads['a-c']!.mineHits[0]!.t;
    spawn(s, { owner: 'player', from: 'a', to: 'b', progress: 0.19 });
    spawn(s, { owner: 'player', from: 'a', to: 'c', progress: tc - 0.001 });
    step(s);
    expect(dead(s).map((e) => e.type === 'unitDied' && e.cause)).toEqual(['mine', 'mine']);
    expect(s.mines[0]!.charges).toBe(0);
    expect(s.units).toEqual([]);
    // spent for every lane: the next unit on either lane walks through
    spawn(s, { owner: 'player', from: 'a', to: 'c', progress: tc - 0.001 });
    spawn(s, { owner: 'player', from: 'b', to: 'a', progress: 0.79 }); // backward on a–b: t = 0.8 from b
    step(s);
    expect(dead(s)).toEqual([]);
    expect(s.units).toHaveLength(2);
  });

  it('a tank on one lane empties the mine (1 < 5) and survives; the unit on the other lane in the same tick is spared', () => {
    const s = fork([{ x: 160, y: 120, charges: 1 }]);
    const tc = s.roads['a-c']!.mineHits[0]!.t;
    spawn(s, { owner: 'player', from: 'a', to: 'b', progress: 0.19, weight: C.TANK_WEIGHT });
    spawn(s, { owner: 'player', from: 'a', to: 'c', progress: tc - 0.001 });
    step(s);
    expect(dead(s)).toEqual([]);
    expect(s.mines[0]!.charges).toBe(0);
    expect(s.units.map((u) => u.weight)).toEqual([5, 1]);
  });
});

describe('crossing exactly on a tick boundary', () => {
  it('a unit whose 20th step lands on t = 0.5 (floating sum) dies once and spends exactly its weight', () => {
    // a–b is 300 px: 120 px/s × 50 ms = 6 px = 0.02 per tick, so t = 0.4 is reached on tick 20 by a 20-fold sum
    const s = fork([{ x: 220, y: 100, charges: 3 }]);
    expect(s.roads['a-b']!.mineHits).toEqual([{ mine: 0, t: 0.4 }]);
    const u = spawn(s, { owner: 'player', from: 'a', to: 'b' });
    expect(u.progress).toBe(0);
    let diedAt = -1;
    for (let i = 1; i <= 25 && diedAt < 0; i++) {
      step(s);
      if (dead(s).length) diedAt = i;
    }
    expect([20, 21]).toContain(diedAt); // 20 × 0.02 sums to 0.4 ± ε: either tick, never neither
    expect(s.mines[0]!.charges).toBe(2);
    expect(s.units.find((x) => x.id === u.id)).toBeUndefined();
  });

  it('a unit sitting exactly on t is not re-hit: `before < t` is strict', () => {
    const s = fork([{ x: 220, y: 100, charges: 3 }]);
    spawn(s, { owner: 'player', from: 'a', to: 'b', progress: 0.4 });
    step(s);
    expect(dead(s)).toEqual([]);
    expect(s.mines[0]!.charges).toBe(3);
    spawn(s, { owner: 'player', from: 'a', to: 'b', progress: 0.39 });
    step(s);
    expect(dead(s)).toHaveLength(1);
    expect(s.mines[0]!.charges).toBe(2);
  });
});

describe('a mine at a tower edge (t clamped to (0, 1))', () => {
  it('a mine on tower a is on every lane of a at t = 1e-6: leaving units die on their first step, arriving units on their last', () => {
    const s = fork([{ x: 100, y: 100, charges: 2 }]);
    expect(s.roads['a-b']!.mineHits).toEqual([{ mine: 0, t: 1e-6 }]);
    expect(s.roads['a-c']!.mineHits).toEqual([{ mine: 0, t: 1e-6 }]);
    // the mine also sits 300 px from b–c: not on that lane
    expect(s.roads['b-c']!.mineHits).toEqual([]);
    applyCommand(s, { type: 'link', owner: 'player', from: 'a', to: 'b' });
    run(s, 19);
    expect(s.units).toEqual([]);
    step(s); // 1000 ms: the first unit spawns, walks 0.02 in the same tick and crosses the mine at 1e-6 at once
    expect(s.units).toEqual([]);
    expect(dead(s).map((e) => e.type === 'unitDied' && e.cause)).toEqual(['mine']);
    expect(s.mines[0]!.charges).toBe(1);
    applyCommand(s, { type: 'unlink', owner: 'player', from: 'a' });
    // arriving from b: crosses 1 − 1e-6 in its arrival tick, dies before landing, a stays untouched
    spawn(s, { owner: 'enemy1', from: 'b', to: 'a', progress: 0.995 });
    step(s);
    expect(dead(s).map((e) => e.type === 'unitDied' && e.cause)).toEqual(['mine']);
    expect(s.mines[0]!.charges).toBe(0);
    expect(s.towers['a']!.units).toBe(25);
    // spent: the next arrival lands
    spawn(s, { owner: 'enemy1', from: 'b', to: 'a', progress: 0.995 });
    step(s);
    expect(s.towers['a']!.units).toBe(24);
  });

  it('a mine just beyond a tower (projection < 0, within 30 px) clamps to the same edge fraction', () => {
    const s = fork([{ x: 80, y: 100, charges: 1 }]);
    expect(s.roads['a-b']!.mineHits).toEqual([{ mine: 0, t: 1e-6 }]);
    spawn(s, { owner: 'player', from: 'a', to: 'b' });
    step(s);
    expect(dead(s)).toHaveLength(1);
  });
});

describe('a mine on a lane whose tower is captured', () => {
  it('stays on the lane with its charges for the new owner; the pool is not reset by the capture', () => {
    const s = fork([{ x: 250, y: 100, charges: 3 }], [{ id: 'b', owner: 'neutral', units: 0 }]);
    spawn(s, { owner: 'player', from: 'a', to: 'b', progress: 0.49 });
    step(s);
    expect(s.mines[0]!.charges).toBe(2);
    spawn(s, { owner: 'player', from: 'a', to: 'b', progress: 0.49, weight: C.TANK_WEIGHT }); // 2 < 5: the mine empties, the tank walks on
    run(s, 37); // 0.49 + 37 × 0.014 ≥ 1 (tanks walk at 84 px/s): the tank lands and captures the empty neutral b
    expect(s.mines[0]!.charges).toBe(0);
    expect(s.towers['b']!).toMatchObject({ owner: 'player', units: 5 });
    // the lane and its hit list are untouched by the capture; the spent mine is harmless both ways
    expect(s.roads['a-b']!.mineHits).toEqual([{ mine: 0, t: 0.5 }]);
    spawn(s, { owner: 'player', from: 'b', to: 'a', progress: 0.49 });
    step(s);
    expect(dead(s)).toEqual([]);
  });

  it('a live mine kills the captured tower’s new streams just the same (charges are neutral)', () => {
    const s = fork([{ x: 250, y: 100, charges: 6 }], [{ id: 'b', units: 0 }]);
    spawn(s, { owner: 'player', from: 'a', to: 'b', progress: 0.995, weight: C.TANK_WEIGHT });
    step(s);
    expect(s.towers['b']!.owner).toBe('player');
    spawn(s, { owner: 'player', from: 'b', to: 'a', progress: 0.49 });
    spawn(s, { owner: 'enemy1', from: 'a', to: 'b', progress: 0.49 }); // an enemy unit on the same lane (spawned for the test)
    step(s);
    expect(dead(s)).toHaveLength(2);
    expect(s.mines[0]!.charges).toBe(4);
  });
});
