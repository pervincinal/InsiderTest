import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { step } from '../../src/sim/step';
import { getOutcome } from '../../src/sim/outcome';
import { C } from '../../src/sim/constants';
import { SnapshotRing, applyContinue, cloneState, deepCopy, strongestPlayerTower } from '../../src/sim/snapshot';
import type { Command, GameState } from '../../src/sim/types';
import { getLevel } from '../../src/levels/index';
import { isAiTick, referencePlayerCommands, rngsFor, runAiTick } from '../../src/ai/index';
import { run } from './util';

/* ---------- fixtures ---------- */

function threeTowers(): GameState {
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 0, y: 0, owner: 'player', units: 10, level: 1 },
        { id: 'q', x: 100, y: 0, owner: 'player', units: 12, level: 1 },
        { id: 'e', x: 200, y: 0, owner: 'enemy1', units: 10, level: 1 },
      ],
      roads: [{ a: 'p', b: 'e' }],
    }),
    1,
  );
}

/** Same synthetic map and command script as determinism.test.ts: exercises mines, barriers, bridges, boosters, upgrades. */
function scenarioLevel() {
  return makeLevel({
    towers: [
      { id: 'p', x: 100, y: 1100, owner: 'player', units: 20, level: 1 },
      { id: 'a', x: 360, y: 700, owner: 'neutral', units: 5, kind: 'artillery' },
      { id: 'e', x: 600, y: 300, owner: 'enemy1', units: 12, kind: 'fortress' },
      { id: 't', x: 100, y: 300, owner: 'enemy1', units: 10, kind: 'tankFactory' },
    ],
    roads: [
      { a: 'p', b: 'a', mine: 2 },
      { a: 'a', b: 'e', barrier: 3, waypoints: [{ x: 500, y: 600 }] },
      { a: 'p', b: 't', kind: 'bridge' },
      { a: 't', b: 'a' },
    ],
  });
}

const SCRIPT: [number, Command][] = [
  [0, { type: 'sendUnits', owner: 'player', from: 'p', to: 'a', ratio: 0.5 }],
  [0, { type: 'sendUnits', owner: 'enemy1', from: 't', to: 'a' }],
  [40, { type: 'sendUnits', owner: 'enemy1', from: 'e', to: 'a', ratio: 0.5 }],
  [60, { type: 'upgrade', owner: 'player', towerId: 'p' }], // rules v2: ignored
  [80, { type: 'link', owner: 'player', from: 'p', to: 'a' }],
  [100, { type: 'link', owner: 'enemy1', from: 'e', to: 'a' }],
  [120, { type: 'booster', owner: 'player', booster: 'overdrive' }],
  [200, { type: 'sendUnits', owner: 'player', from: 'a', to: 'e' }],
  [220, { type: 'cutBridge', owner: 'player', roadId: 'p-t' }],
  [300, { type: 'booster', owner: 'player', booster: 'freeze' }],
  [340, { type: 'unlink', owner: 'player', from: 'p' }],
  [420, { type: 'sendUnits', owner: 'enemy1', from: 't', to: 'a' }],
  [440, { type: 'link', owner: 'player', from: 'p', to: 'a' }],
];

/** Apply the script's commands for `tick` (sim time = tick × 50 ms before the step), then step. */
function scriptedTick(state: GameState, tick: number): void {
  for (const [at, cmd] of SCRIPT) if (at === tick) applyCommand(state, cmd);
  step(state);
}

/* ---------- cloneState ---------- */

describe('cloneState', () => {
  it('is a deep copy: equal to the source, sharing no references', () => {
    const state = threeTowers();
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: 0.5 });
    run(state, 3); // t = 150 ms: 2 of 5 units left, 3 still queued
    const copy = cloneState(state);
    expect(copy).toEqual(state);
    expect(copy).not.toBe(state);
    expect(copy.towers['p']).not.toBe(state.towers['p']);
    expect(copy.units).not.toBe(state.units);
    expect(copy.roads['e-p']!.points).not.toBe(state.roads['e-p']!.points);
    expect(copy.modifiers).not.toBe(state.modifiers);
    copy.towers['p']!.units = 999;
    copy.units[0]!.progress = 0.99;
    copy.queues.length = 0;
    expect(state.towers['p']!.units).toBe(5);
    expect(state.units[0]!.progress).toBeLessThan(0.5);
    expect(state.queues.length).toBe(1);
    expect(state.queues[0]!.remaining).toBe(3);
  });

  it('the manual fallback produces the same result as structuredClone', () => {
    const state = threeTowers();
    run(state, 40);
    expect(deepCopy(state)).toEqual(structuredClone(state));
    expect(JSON.stringify(deepCopy(state))).toBe(JSON.stringify(state));
  });
});

/* ---------- SnapshotRing ---------- */

describe('SnapshotRing', () => {
  it('keeps one snapshot per interval while recording every tick', () => {
    const ring = new SnapshotRing(1000, 20_000);
    const state = threeTowers();
    expect(ring.record(state)).toBe(true);
    let stored = 0;
    for (let i = 0; i < 60; i++) {
      step(state);
      if (ring.record(state)) stored++;
    }
    expect(state.time).toBe(3000);
    expect(stored).toBe(3);
    expect(ring.times()).toEqual([0, 1000, 2000, 3000]);
    expect(ring.size).toBe(4);
  });

  it('drops snapshots older than the capacity but keeps exactly one that is capacity old', () => {
    const ring = new SnapshotRing(1000, 20_000);
    const state = threeTowers();
    ring.record(state);
    for (let i = 0; i < 600; i++) {
      step(state);
      ring.record(state);
    }
    expect(state.time).toBe(30_000);
    expect(ring.size).toBe(21);
    expect(ring.times()[0]).toBe(10_000);
    expect(ring.times()[20]).toBe(30_000);
  });

  it('rewind picks the newest snapshot at least `ms` old, or the oldest', () => {
    const ring = new SnapshotRing(1000, 20_000);
    const state = threeTowers();
    ring.record(state);
    for (let i = 0; i < 600; i++) {
      step(state);
      ring.record(state);
    }
    expect(ring.rewind(20_000)!.time).toBe(10_000);
    expect(ring.rewind(5_000)!.time).toBe(25_000);
    expect(ring.rewind(5_001)!.time).toBe(24_000);
    expect(ring.rewind(0)!.time).toBe(30_000);
    expect(ring.rewind(60_000)!.time).toBe(10_000); // nothing that old: the oldest
  });

  it('rewind is null on an empty ring and returns the oldest when the match is younger than the rewind', () => {
    const ring = new SnapshotRing(1000, 20_000);
    expect(ring.rewind(20_000)).toBeNull();
    const state = threeTowers();
    ring.record(state);
    for (let i = 0; i < 100; i++) {
      step(state);
      ring.record(state);
    }
    expect(state.time).toBe(5000);
    expect(ring.rewind(20_000)!.time).toBe(0);
  });

  it('snapshots are isolated from the live state and from each other', () => {
    const ring = new SnapshotRing(1000, 20_000);
    const state = threeTowers();
    ring.record(state);
    state.towers['p']!.units = 25; // mutate after recording
    const a = ring.rewind(0)!;
    const b = ring.rewind(0)!;
    expect(a.towers['p']!.units).toBe(10);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    a.towers['p']!.units = 1;
    expect(ring.rewind(0)!.towers['p']!.units).toBe(10);
  });

  it('recording at an earlier time discards the abandoned future', () => {
    const ring = new SnapshotRing(1000, 20_000);
    const state = threeTowers();
    ring.record(state);
    for (let i = 0; i < 100; i++) {
      step(state);
      ring.record(state);
    }
    expect(ring.times()).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
    const restored = ring.rewind(3000)!; // t = 2000
    expect(restored.time).toBe(2000);
    ring.record(restored);
    expect(ring.times()).toEqual([0, 1000, 2000]);
    step(restored);
    ring.record(restored);
    expect(ring.times()).toEqual([0, 1000, 2000]); // 2050 is within the interval of 2000
    expect(ring.rewind(0)!.time).toBe(2000);
  });

  it('clear empties the ring', () => {
    const ring = new SnapshotRing();
    expect(ring.intervalMs).toBe(C.SNAPSHOT_INTERVAL_MS);
    expect(ring.capacityMs).toBe(C.SNAPSHOT_CAPACITY_MS);
    ring.record(threeTowers());
    expect(ring.size).toBe(1);
    ring.clear();
    expect(ring.size).toBe(0);
    expect(ring.rewind(0)).toBeNull();
  });

  it('rejects a non-positive interval', () => {
    expect(() => new SnapshotRing(0)).toThrow();
  });
});

/* ---------- applyContinue ---------- */

describe('applyContinue', () => {
  it('adds 15 infantry to the highest-garrison player tower and a 5 s freeze for the player', () => {
    const state = threeTowers();
    run(state, 40); // t = 2000: p 12, q 14, e 12
    expect(state.towers['q']!.units).toBe(14);
    const out = applyContinue(state);
    expect(out).toBe(state);
    expect(state.towers['q']!.units).toBe(25); // 14 + 15 capped at the L1 capacity (25)
    expect(state.towers['p']!.units).toBe(12);
    expect(state.towers['e']!.units).toBe(12);
    expect(state.boosters).toEqual([{ type: 'freeze', owner: 'player', untilMs: 7000 }]);
    expect(state.events).toEqual([]);
    expect(C.CONTINUE_INFANTRY).toBe(15);
    expect(C.CONTINUE_FREEZE_MS).toBe(5000);
    expect(C.CONTINUE_REWIND_MS).toBe(20_000);
  });

  it('the freeze stops enemy generation for exactly 5 s while the player keeps producing', () => {
    const state = threeTowers();
    run(state, 40);
    applyContinue(state, { freezeMs: 5000, infantry: 15 });
    run(state, 100); // t = 7000
    expect(state.towers['e']!.units).toBe(12);
    expect(state.towers['q']!.units).toBe(32); // full at 25 → auto-upgrade to L2 on the first tick, then 7 at 700 ms
    expect(state.towers['q']!.level).toBe(2);
    expect(state.towers['p']!.units).toBe(17);
    expect(state.boosters.length).toBe(1);
    run(state, 1); // t = 7050: booster expired, enemy resumes
    expect(state.boosters).toEqual([]);
    run(state, 19); // t = 8000
    expect(state.towers['e']!.units).toBe(13);
  });

  it('reinforcements are capped at the tower capacity (including the player capacity modifier)', () => {
    const base = createState(makeLevel({ towers: [{ id: 'p', x: 0, y: 0, owner: 'player', units: 20 }], roads: [] }), 1);
    applyContinue(base, { freezeMs: 5000, infantry: 15 });
    expect(base.towers['p']!.units).toBe(25);

    const boosted = createState(makeLevel({ towers: [{ id: 'p', x: 0, y: 0, owner: 'player', units: 20 }], roads: [] }), 1, {
      productionMul: 1,
      capacityMul: 1.25,
      startGarrisonBonus: 0,
      unitSpeedMul: 1,
    });
    applyContinue(boosted, { freezeMs: 5000, infantry: 15 });
    expect(boosted.towers['p']!.units).toBe(31); // floor(25 × 1.25)
    applyContinue(boosted, { freezeMs: 5000, infantry: 15 });
    expect(boosted.towers['p']!.units).toBe(31);
  });

  it('on a tie the first player tower in level order is chosen', () => {
    const state = threeTowers();
    state.towers['q']!.units = 10;
    expect(strongestPlayerTower(state)!.id).toBe('p');
    applyContinue(state);
    expect(state.towers['p']!.units).toBe(25);
    expect(state.towers['q']!.units).toBe(10);
  });

  it('returns null and leaves the state untouched when the player owns no tower', () => {
    const state = threeTowers();
    state.towers['p']!.owner = 'enemy1';
    state.towers['q']!.owner = 'neutral';
    const before = JSON.stringify(state);
    expect(applyContinue(state)).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
    expect(state.boosters).toEqual([]);
  });

  it('a zero freeze adds no booster and negative infantry adds nothing', () => {
    const state = threeTowers();
    applyContinue(state, { freezeMs: 0, infantry: -3 });
    expect(state.boosters).toEqual([]);
    expect(state.towers['q']!.units).toBe(12);
  });
});

/* ---------- determinism ---------- */

describe('rewind determinism', () => {
  it('a rewound snapshot replayed with the same commands reaches the identical final state', () => {
    const ring = new SnapshotRing(1000, 20_000);
    const original = createState(scenarioLevel(), 42);
    ring.record(original);
    for (let tick = 0; tick < 600; tick++) {
      scriptedTick(original, tick);
      ring.record(original);
    }
    expect(original.time).toBe(30_000);

    const restored = ring.rewind(20_000)!;
    expect(restored.time).toBe(10_000);
    expect(restored).not.toEqual(original);
    for (let tick = restored.time / C.TICK_MS; tick < 600; tick++) scriptedTick(restored, tick);
    expect(restored.time).toBe(30_000);
    expect(restored).toEqual(original);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(original));
  });

  it('two continues from the same snapshot with the same commands are identical, and differ from the original', () => {
    const ring = new SnapshotRing(1000, 20_000);
    const original = createState(scenarioLevel(), 42);
    ring.record(original);
    for (let tick = 0; tick < 600; tick++) {
      scriptedTick(original, tick);
      ring.record(original);
    }
    const play = (): GameState => {
      const s = ring.rewind(20_000)!;
      expect(applyContinue(s)).toBe(s);
      for (let tick = s.time / C.TICK_MS; tick < 600; tick++) scriptedTick(s, tick);
      return s;
    };
    const a = play();
    const b = play();
    expect(a.time).toBe(30_000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(original));
  });

  it('level 5 with the AI: snapshot (state + AI rng) at 20 s before the end replays to the same result', () => {
    const level = getLevel(5)!; // 36 s with the reference player on seed 7
    type Frame = { time: number; state: GameState; rng: { player: number; enemies: [string, number][] } };
    const ring = new SnapshotRing<Frame>(1000, 20_000);

    const state = createState(level, 7);
    const rngs = rngsFor(7, level.enemies);
    const frame = (): Frame => ({
      time: state.time,
      state,
      rng: { player: rngs.player.state, enemies: [...rngs.enemies].map(([o, r]) => [o, r.state]) },
    });
    const drive = (s: GameState, r: ReturnType<typeof rngsFor>): void => {
      if (isAiTick(s)) {
        const playerCmds = referencePlayerCommands(s, r.player);
        const enemyCmds = runAiTick(s, r.enemies);
        for (const cmd of playerCmds) applyCommand(s, cmd);
        for (const cmd of enemyCmds) applyCommand(s, cmd);
      }
      step(s, C.TICK_MS);
    };
    ring.record(frame());
    while (getOutcome(state) === 'playing' && state.time < 60_000) {
      drive(state, rngs);
      ring.record(frame());
    }
    expect(state.time).toBeGreaterThan(20_000);

    const snap = ring.rewind(20_000)!;
    expect(state.time - snap.time).toBeGreaterThanOrEqual(20_000);
    const restored = snap.state;
    const restoredRngs = rngsFor(7, level.enemies);
    restoredRngs.player.state = snap.rng.player;
    for (const [o, st] of snap.rng.enemies) restoredRngs.enemies.get(o as never)!.state = st;
    while (restored.time < state.time) drive(restored, restoredRngs);
    expect(restored.time).toBe(state.time);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(state));
  });
});
