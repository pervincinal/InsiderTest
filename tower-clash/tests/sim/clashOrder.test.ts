import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { step } from '../../src/sim/step';
import type { GameState, Unit } from '../../src/sim/types';
import { spawn } from './util';

/*
 * REV-28 (2026-11-23): when one unit crosses several opposing units in the same tick, the clashes are
 * resolved in the order the units actually meet on the lane (GDD §2.3 "when they cross, the lighter
 * dies and the heavier loses that weight"), not in `state.units` array order. Before the fix the inner
 * loop ran in list order, so a unit physically between the two could be skipped and the wrong units
 * survived.
 *
 * Geometry: the default `makeLevel()` lane `e-p` is 600 px; infantry walks 120 px/s = 6 px = 0.01 of
 * the lane per 50 ms tick, a tank 0.7× = 0.007. A unit at own progress `q` on the other side sits at
 * `1 - q` in the opposing unit's frame.
 */

function clashDeaths(state: GameState): string[] {
  return state.events.filter((e) => e.type === 'unitDied' && e.cause === 'clash').map((e) => (e.type === 'unitDied' ? e.owner : ''));
}

function alive(state: GameState): { id: number; owner: string; weight: number }[] {
  return state.units.map((u) => ({ id: u.id, owner: u.owner, weight: u.weight }));
}

describe('REV-28: clashes resolve in meeting order along the lane', () => {
  /**
   * The producer's probe: f (player, weight 2) at 0.50 walks toward two enemies spawned in the "wrong"
   * list order — b2 (weight 2, spawned first) at 0.507 in f's frame, b1 (weight 1, spawned second) at
   * 0.503. f meets b1 first (kills it, weight → 1), then dies to b2 (b2 → 1).
   */
  function probe(order: 'b2 first' | 'b1 first'): { state: GameState; f: Unit; b1: Unit; b2: Unit } {
    const state = createState(makeLevel(), 1);
    const f = spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.5, weight: 2 });
    let b1: Unit;
    let b2: Unit;
    if (order === 'b2 first') {
      b2 = spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.493, weight: 2 }); // 0.507 in f's frame
      b1 = spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.497, weight: 1 }); // 0.503 in f's frame
    } else {
      b1 = spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.497, weight: 1 });
      b2 = spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.493, weight: 2 });
    }
    return { state, f, b1, b2 };
  }

  it('the probe: the unit physically between the two is met first, the far one survives worn down', () => {
    const { state, f, b1, b2 } = probe('b2 first');
    step(state);
    expect(alive(state)).toEqual([{ id: b2.id, owner: 'enemy1', weight: 1 }]);
    expect(b2.progress).toBeCloseTo(0.503, 9);
    expect(state.units.map((u) => u.id)).not.toContain(f.id);
    expect(state.units.map((u) => u.id)).not.toContain(b1.id);
    expect(clashDeaths(state).sort()).toEqual(['enemy1', 'player']);
  });

  it('the spawn order of the two opponents does not change who survives', () => {
    const a = probe('b2 first');
    const b = probe('b1 first');
    step(a.state);
    step(b.state);
    expect(alive(a.state).map((u) => ({ owner: u.owner, weight: u.weight }))).toEqual([{ owner: 'enemy1', weight: 1 }]);
    expect(alive(b.state).map((u) => ({ owner: u.owner, weight: u.weight }))).toEqual([{ owner: 'enemy1', weight: 1 }]);
    expect(a.state.units[0]!.id).toBe(a.b2.id);
    expect(b.state.units[0]!.id).toBe(b.b2.id);
  });

  it('mirrored: the lone unit walks the other way (it is the lane’s `forward` side) — same rule', () => {
    const state = createState(makeLevel(), 1);
    const f = spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.5, weight: 2 });
    const p2 = spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.493, weight: 2 }); // far, spawned first
    const p1 = spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.497, weight: 1 }); // near, spawned second
    step(state);
    expect(alive(state)).toEqual([{ id: p2.id, owner: 'player', weight: 1 }]);
    expect(state.units.map((u) => u.id)).not.toContain(f.id);
    expect(state.units.map((u) => u.id)).not.toContain(p1.id);
  });

  it('two units on one side: the heavier opponent meets the front unit first, the rear unit walks on', () => {
    const state = createState(makeLevel(), 1);
    // rear (weight 1) spawned first, front (weight 2) second; the enemy (weight 2) crosses both this tick
    const rear = spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.49, weight: 1 });
    const front = spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.5, weight: 2 });
    const b = spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.495, weight: 2 }); // 0.505 in the player's frame
    step(state);
    // front (2) and b (2) annihilate at the first meeting; rear never meets anyone
    expect(alive(state)).toEqual([{ id: rear.id, owner: 'player', weight: 1 }]);
    expect(state.units.map((u) => u.id)).not.toContain(front.id);
    expect(state.units.map((u) => u.id)).not.toContain(b.id);
    expect(clashDeaths(state).sort()).toEqual(['enemy1', 'player']);
  });

  it('a faster unit that overtook a friend meets the opponent first (meetings are ordered in time, friends do not block)', () => {
    const state = createState(makeLevel(), 1);
    const f = spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.5, weight: 1 });
    // the tank is nearer (0.506 in f's frame) but slower (0.007 / tick): f meets it at 0.353 of the tick;
    // the infantry behind it (0.507) walks 0.01 / tick and meets f at 0.35 — first.
    const tank = spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.494, weight: 5, kind: 'tank' });
    const inf = spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.493, weight: 1 });
    step(state);
    expect(alive(state)).toEqual([{ id: tank.id, owner: 'enemy1', weight: 5 }]);
    expect(state.units.map((u) => u.id)).not.toContain(f.id);
    expect(state.units.map((u) => u.id)).not.toContain(inf.id);
  });

  it('an exact tie (same position, same speed, same side) is broken by unit id, the earlier spawn first', () => {
    const state = createState(makeLevel(), 1);
    const a = spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.5, weight: 1 });
    const b = spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.5, weight: 1 });
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.495, weight: 1 });
    step(state);
    expect(alive(state)).toEqual([{ id: b.id, owner: 'player', weight: 1 }]);
    expect(state.units.map((u) => u.id)).not.toContain(a.id);
  });

  it('is deterministic: the same scenario twice gives byte-identical states', () => {
    const a = probe('b2 first');
    const b = probe('b2 first');
    step(a.state);
    step(b.state);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
