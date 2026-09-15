import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import type { Command, GameState, TowerDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { step } from '../../src/sim/step';
import { getOutcome } from '../../src/sim/outcome';
import { cloneState } from '../../src/sim/snapshot';
import { C } from '../../src/sim/constants';
import { run, spawn } from './util';

/*
 * Rules v2 (GDD §2.0) attack streams. Hub map: player tower `p` at (360,1000) with roads to
 * `a` (360,400 — 600 px north, 5 s of travel), `b` (60,1000), `c` (660,1000) and `d` (360,1240).
 * A unit spawned on tick k reaches the far end of the 600 px road on tick k + 99.
 */

function hub(p: Partial<TowerDef>, others: Partial<TowerDef>[] = [], roadKind: 'road' | 'bridge' = 'road'): GameState {
  const defaults: TowerDef[] = [
    { id: 'a', x: 360, y: 400, owner: 'neutral', units: 0 },
    { id: 'b', x: 60, y: 1000, owner: 'neutral', units: 0 },
    { id: 'c', x: 660, y: 1000, owner: 'neutral', units: 0 },
    { id: 'd', x: 360, y: 1240, owner: 'neutral', units: 0 },
  ];
  const towers: TowerDef[] = [
    { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1, ...p },
    ...defaults.map((t) => ({ ...t, ...(others.find((o) => o.id === t.id) ?? {}) })),
    { id: 'e', x: 100, y: 100, owner: 'enemy1', units: 10 },
  ];
  return createState(
    makeLevel({
      towers,
      roads: [
        { a: 'p', b: 'a', kind: roadKind },
        { a: 'p', b: 'b' },
        { a: 'p', b: 'c' },
        { a: 'p', b: 'd' },
        { a: 'a', b: 'e' },
      ],
    }),
    1,
  );
}

const link = (state: GameState, from: string, to: string, owner: Command['owner'] = 'player') =>
  applyCommand(state, { type: 'link', owner, from, to });
const unlinked = (state: GameState) => state.events.filter((e) => e.type === 'unlinked');
/** Freeze cast by the enemy: stops the player's production for 5 s so drain tests see only the drain. */
const freezePlayer = (state: GameState) => applyCommand(state, { type: 'booster', owner: 'enemy1', booster: 'freeze' });

describe('link command', () => {
  it('creates a link with owner, endpoints, road id and creation time, and emits `linked`', () => {
    const state = hub({});
    run(state, 2);
    link(state, 'p', 'a');
    expect(state.links).toEqual([{ owner: 'player', from: 'p', to: 'a', roadId: 'a-p', createdMs: 100 }]);
    expect(state.events).toContainEqual({ type: 'linked', owner: 'player', from: 'p', to: 'a' });
  });

  it('ignores: wrong owner, unknown towers, self, no road, cut bridge, duplicate', () => {
    const state = hub({}, [], 'bridge');
    link(state, 'p', 'a', 'enemy1'); // not the owner
    link(state, 'p', 'zzz'); // unknown target
    link(state, 'zzz', 'a'); // unknown source
    link(state, 'p', 'p'); // self
    link(state, 'p', 'e'); // no road p-e
    link(state, 'a', 'p'); // player does not own a
    expect(state.links).toEqual([]);
    applyCommand(state, { type: 'cutBridge', owner: 'player', roadId: 'a-p' });
    link(state, 'p', 'a'); // bridge cut
    expect(state.links).toEqual([]);
    link(state, 'p', 'b');
    link(state, 'p', 'b'); // duplicate
    expect(state.links.length).toBe(1);
  });

  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
  ] as const)('level %i allows %i simultaneous links; the next one is refused', (level, max) => {
    const state = hub({ level, units: 0 });
    for (const to of ['a', 'b', 'c', 'd']) link(state, 'p', to);
    expect(state.links.length).toBe(max);
    expect(state.links.map((l) => l.to)).toEqual(['a', 'b', 'c', 'd'].slice(0, max));
    expect(C.LINKS_PER_LEVEL[level]).toBe(max);
  });
});

describe('unlink command', () => {
  it('removes one link with `to`, all links without, and emits `unlinked` (manual)', () => {
    const state = hub({ level: 3, units: 0 });
    for (const to of ['a', 'b', 'c']) link(state, 'p', to);
    state.events = [];
    applyCommand(state, { type: 'unlink', owner: 'player', from: 'p', to: 'b' });
    expect(state.links.map((l) => l.to)).toEqual(['a', 'c']);
    expect(unlinked(state)).toEqual([{ type: 'unlinked', owner: 'player', from: 'p', to: 'b', reason: 'manual' }]);
    applyCommand(state, { type: 'unlink', owner: 'player', from: 'p' });
    expect(state.links).toEqual([]);
    expect(unlinked(state).length).toBe(3);
  });

  it('is ignored for someone else’s links and for unknown towers', () => {
    const state = hub({});
    link(state, 'p', 'a');
    applyCommand(state, { type: 'unlink', owner: 'enemy1', from: 'p' });
    applyCommand(state, { type: 'unlink', owner: 'player', from: 'zzz' });
    expect(state.links.length).toBe(1);
  });
});

describe('draining', () => {
  it('sends one unit every 120 ms round-robin across two links, using the normal spawn path', () => {
    const state = hub({ level: 2, units: 10 });
    freezePlayer(state);
    link(state, 'p', 'a');
    link(state, 'p', 'b');
    run(state, 2); // 100 ms: nothing yet
    expect(state.units).toEqual([]);
    expect(state.towers['p']!.units).toBe(10);
    step(state); // 150 ms ≥ 120: first unit → a
    expect(state.units.length).toBe(1);
    expect(state.units[0]).toMatchObject({ owner: 'player', kind: 'infantry', weight: 1, from: 'p', to: 'a', roadId: 'a-p', speed: 120 });
    expect(state.units[0]!.progress).toBeCloseTo(0.01, 12); // moved in the same tick
    expect(state.towers['p']!.units).toBe(9);
    expect(state.towers['p']!.linkCursor).toBe(1);
    run(state, 2); // 250 ms: second → b
    expect(state.units.map((u) => u.to)).toEqual(['a', 'b']);
    run(state, 5); // 500 ms: 4 units
    expect(state.units.map((u) => u.to)).toEqual(['a', 'b', 'a', 'b']);
    expect(state.towers['p']!.units).toBe(6);
    run(state, 15); // 1250 ms: all 10 gone (leave times 150, 250, 400, 500, 650, 750, 900, 1000, 1150, 1250)
    expect(state.towers['p']!.units).toBe(0);
    expect(state.units.length).toBe(10);
    expect(state.units.filter((u) => u.to === 'a').length).toBe(5);
    expect(state.units.filter((u) => u.to === 'b').length).toBe(5);
    expect(state.units.map((u) => u.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(C.LEAVE_INTERVAL_MS).toBe(120);
  });

  it('round-robin adapts when a link is removed', () => {
    const state = hub({ level: 2, units: 10 });
    freezePlayer(state);
    link(state, 'p', 'a');
    link(state, 'p', 'b');
    run(state, 3); // → a, cursor now points at b
    applyCommand(state, { type: 'unlink', owner: 'player', from: 'p', to: 'b' });
    run(state, 2); // 250 ms
    expect(state.units.map((u) => u.to)).toEqual(['a', 'a']);
  });

  it('a linked tower never grows: every produced unit leaves on the tick it appears', () => {
    const state = hub({ level: 1, units: 0 });
    link(state, 'p', 'a');
    for (let i = 0; i < 400; i++) {
      step(state);
      expect(state.towers['p']!.units).toBeLessThanOrEqual(1);
      expect(state.towers['p']!.units).toBe(0);
    }
    expect(state.towers['p']!.level).toBe(1);
    expect(state.nextUnitId - 1).toBe(20); // 20 s at 1 unit / s, all dispatched
    expect(state.links.length).toBe(1);
  });

  it('applies the player march bonus at spawn', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 5 },
          { id: 'a', x: 360, y: 400, owner: 'neutral', units: 0 },
        ],
        roads: [{ a: 'p', b: 'a' }],
      }),
      1,
      { productionMul: 1, capacityMul: 1, startGarrisonBonus: 0, unitSpeedMul: 1.15 },
    );
    link(state, 'p', 'a');
    run(state, 3);
    expect(state.units[0]!.speed).toBeCloseTo(138, 10);
  });

  it('a tank factory sends 5-weight tanks at 0.7× speed while it holds ≥ 5, then infantry for the remainder', () => {
    const state = hub({ kind: 'tankFactory', level: 1, units: 12 });
    freezePlayer(state);
    link(state, 'p', 'a');
    run(state, 3);
    expect(state.units[0]).toMatchObject({ kind: 'tank', weight: 5, speed: 84 });
    expect(state.towers['p']!.units).toBe(7);
    run(state, 2);
    expect(state.units[1]).toMatchObject({ kind: 'tank', weight: 5 });
    expect(state.towers['p']!.units).toBe(2);
    run(state, 5); // 500 ms: two more leave (400, 500) as infantry
    expect(state.units.map((u) => [u.kind, u.weight])).toEqual([
      ['tank', 5],
      ['tank', 5],
      ['infantry', 1],
      ['infantry', 1],
    ]);
    expect(state.towers['p']!.units).toBe(0);
  });
});

describe('auto-unlink', () => {
  it('sourceLost: capturing the source removes all its links in the capture tick and resets its drain state', () => {
    const state = hub({ level: 2, units: 2 }, [{ id: 'a', owner: 'enemy1', units: 0 }]);
    link(state, 'p', 'a');
    link(state, 'p', 'b');
    run(state, 3); // one unit left, cursor 1, drain timer 30 ms
    expect(state.towers['p']!.linkCursor).toBe(1);
    spawn(state, { owner: 'enemy1', from: 'a', to: 'p', progress: 0.995, weight: 5 });
    step(state);
    expect(state.towers['p']!.owner).toBe('enemy1');
    expect(state.links).toEqual([]);
    expect(unlinked(state)).toEqual([
      { type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'sourceLost' },
      { type: 'unlinked', owner: 'player', from: 'p', to: 'b', reason: 'sourceLost' },
    ]);
    expect(state.events.findIndex((e) => e.type === 'capture')).toBeLessThan(state.events.findIndex((e) => e.type === 'unlinked'));
    expect(state.towers['p']!.drainAccMs).toBe(0);
    expect(state.towers['p']!.linkCursor).toBe(0);
    // the new owner does not inherit the stream: nothing more leaves p
    const before = state.units.length;
    run(state, 10);
    expect(state.units.length).toBe(before);
  });

  it('sourceLost also when the owner changes outside a capture (e.g. a restored save)', () => {
    const state = hub({});
    link(state, 'p', 'a');
    state.towers['p']!.owner = 'enemy1';
    step(state);
    expect(state.links).toEqual([]);
    expect(unlinked(state)).toEqual([{ type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'sourceLost' }]);
  });

  it('roadCut: cutting the bridge removes the link at once (command) and the tick also prunes cut roads', () => {
    const state = hub({ level: 2 }, [], 'bridge');
    link(state, 'p', 'a');
    link(state, 'p', 'b');
    applyCommand(state, { type: 'cutBridge', owner: 'player', roadId: 'a-p' });
    expect(state.links.map((l) => l.to)).toEqual(['b']);
    expect(unlinked(state)).toEqual([{ type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'roadCut' }]);

    const other = hub({});
    link(other, 'p', 'a');
    other.roads['a-p']!.cut = true; // road gone under the link
    step(other);
    expect(other.links).toEqual([]);
    expect(unlinked(other)).toEqual([{ type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'roadCut' }]);
    expect(other.units).toEqual([]); // nothing was dispatched onto the cut road
  });

  it('targetFull: an own target at capacity releases the supply line in the arrival tick', () => {
    const state = hub({ level: 3, units: 50 }, [{ id: 'a', owner: 'player', units: 99, level: 3 }]);
    freezePlayer(state); // a must fill through the stream, not its own production
    link(state, 'p', 'a');
    run(state, 101); // 5050 ms: first unit (left at 150 ms) is one tick from arriving
    expect(state.links.length).toBe(1);
    expect(state.towers['a']!.units).toBe(99);
    step(state); // 5100 ms: arrival → 100 = capacity
    expect(state.towers['a']!.units).toBe(100);
    expect(state.towers['a']!.level).toBe(3);
    expect(state.links).toEqual([]);
    expect(unlinked(state)).toEqual([{ type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'targetFull' }]);
  });

  it('an own target that fills at L1/L2 upgrades instead and keeps the stream', () => {
    const state = hub({ level: 3, units: 50 }, [{ id: 'a', owner: 'player', units: 24, level: 1 }]);
    freezePlayer(state);
    link(state, 'p', 'a');
    run(state, 102); // 5100 ms: first arrival → 25
    expect(state.towers['a']!.level).toBe(2);
    expect(state.towers['a']!.units).toBe(25);
    expect(state.events).toContainEqual({ type: 'upgrade', towerId: 'a', level: 2 });
    expect(state.links.length).toBe(1);
  });

  it('a hostile target at capacity keeps the link (it is an attack, not a supply line)', () => {
    const state = hub({ level: 3, units: 50 }, [{ id: 'a', owner: 'enemy1', units: 100, level: 3 }]);
    link(state, 'p', 'a');
    run(state, 120);
    expect(state.links.length).toBe(1);
    expect(state.towers['a']!.owner).toBe('enemy1');
    expect(state.towers['a']!.units).toBeLessThan(100);
  });
});

describe('capture through a stream', () => {
  it('the link keeps flowing after the capture and reinforces the new tower', () => {
    const state = hub({ level: 2, units: 20 }, [{ id: 'a', owner: 'enemy1', units: 3, level: 1 }]);
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'freeze' }); // a does not produce for 5 s
    link(state, 'p', 'a');
    // leave times 150, 250, 400, 500, 650 → arrivals 5100, 5200, 5350, 5450, 5600
    run(state, 104); // 5200 ms
    expect(state.towers['a']!).toMatchObject({ owner: 'enemy1', units: 1 });
    run(state, 3); // 5350 ms
    expect(state.towers['a']!).toMatchObject({ owner: 'enemy1', units: 0 });
    run(state, 2); // 5450 ms: 1 damage > 0 defenders → capture
    expect(state.towers['a']!).toMatchObject({ owner: 'player', units: 1, level: 1 });
    expect(state.events).toContainEqual({ type: 'capture', towerId: 'a', by: 'player', from: 'enemy1' });
    expect(state.links).toEqual([{ owner: 'player', from: 'p', to: 'a', roadId: 'a-p', createdMs: 0 }]);
    run(state, 3); // 5600 ms: next unit reinforces
    expect(state.towers['a']!).toMatchObject({ owner: 'player', units: 2 });
    expect(state.links.length).toBe(1);
    expect(unlinked(state)).toEqual([]);
  });
});

describe('links, snapshots and outcome', () => {
  it('cloneState copies links and per-tower cursors without sharing references', () => {
    const state = hub({ level: 2, units: 10 });
    link(state, 'p', 'a');
    link(state, 'p', 'b');
    run(state, 3);
    const copy = cloneState(state);
    expect(copy.links).toEqual(state.links);
    expect(copy.links).not.toBe(state.links);
    expect(copy.links[0]).not.toBe(state.links[0]);
    expect(copy.towers['p']!.linkCursor).toBe(1);
    expect(copy.towers['p']!.drainAccMs).toBe(30);
    copy.links.length = 0;
    copy.towers['p']!.linkCursor = 7;
    expect(state.links.length).toBe(2);
    expect(state.towers['p']!.linkCursor).toBe(1);
  });

  it('replaying the same commands on a restored snapshot reproduces the original state', () => {
    const play = (s: GameState, from: number, to: number) => {
      for (let tick = from; tick < to; tick++) {
        if (tick === 2) link(s, 'p', 'a');
        if (tick === 4) link(s, 'p', 'b');
        if (tick === 60) applyCommand(s, { type: 'unlink', owner: 'player', from: 'p', to: 'b' });
        if (tick === 80) link(s, 'p', 'c');
        step(s);
      }
    };
    const a = hub({ level: 2, units: 30 }, [{ id: 'a', owner: 'enemy1', units: 4 }]);
    play(a, 0, 300);
    const b = hub({ level: 2, units: 30 }, [{ id: 'a', owner: 'enemy1', units: 4 }]);
    play(b, 0, 40);
    const snap = cloneState(b);
    play(b, 40, 300);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    play(snap, 40, 300);
    expect(JSON.stringify(snap)).toBe(JSON.stringify(a));
    expect(a.links.map((l) => l.to)).toEqual(['a', 'c']);
    expect(a.towers['a']!.owner).toBe('player');
  });

  it('links do not count as units in transit for the outcome', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
          { id: 'n', x: 360, y: 400, owner: 'neutral', units: 0 },
        ],
        roads: [{ a: 'p', b: 'n' }],
      }),
      1,
    );
    expect(getOutcome(state)).toBe('won');
    state.links.push({ owner: 'enemy1', from: 'n', to: 'p', roadId: 'n-p', createdMs: 0 });
    expect(getOutcome(state)).toBe('won');
  });
});
