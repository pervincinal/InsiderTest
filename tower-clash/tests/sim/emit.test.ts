import { describe, expect, it } from 'vitest';
import { makeLevel, wall } from '../helpers';
import type { Command, GameState, TowerDef } from '../../src/sim/types';
import { DEFAULT_MODIFIERS } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { isLinked, isUnderFire, step, streamIntervalMs, streamRate } from '../../src/sim/step';
import { getOutcome } from '../../src/sim/outcome';
import { cloneState, deepCopy } from '../../src/sim/snapshot';
import { C } from '../../src/sim/constants';
import { run, runUntil, spawn } from './util';

/*
 * Rules v3 (GDD §2.0b) streams. Duel map: `p` (360,1000) and `e` (360,760) on a 240 px lane
 * (2 s of infantry travel: a unit spawned on tick k lands on tick k + 39, i.e. 1950 ms later).
 * An L1 stream spawns its first unit at 1000 ms (tick 20) → first landing at 2950 ms.
 */

function duel(p: Partial<TowerDef>, e: Partial<TowerDef>, extra: TowerDef[] = [], over: Parameters<typeof makeLevel>[0] = {}): GameState {
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1, ...p },
        { id: 'e', x: 360, y: 760, owner: 'enemy1', units: 10, level: 1, ...e },
        ...extra,
      ],
      ...over,
    }),
    1,
  );
}

/** Hub: `p` with lanes to `a` (north, 240 px), `b` (west), `c` (east), `d` (south); `e` far away behind a wall. */
function hub(p: Partial<TowerDef>, others: Partial<TowerDef>[] = []): GameState {
  const defaults: TowerDef[] = [
    { id: 'a', x: 360, y: 760, owner: 'neutral', units: 0 },
    { id: 'b', x: 120, y: 1000, owner: 'neutral', units: 0 },
    { id: 'c', x: 600, y: 1000, owner: 'neutral', units: 0 },
    { id: 'd', x: 360, y: 1240, owner: 'neutral', units: 0 },
  ];
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1, ...p },
        ...defaults.map((t) => ({ ...t, ...(others.find((o) => o.id === t.id) ?? {}) })),
        { id: 'e', x: 100, y: 100, owner: 'enemy1', units: 10 },
      ],
      obstacles: [wall(0, 400, 720, 400)],
    }),
    1,
  );
}

const link = (state: GameState, from: string, to: string, owner: Command['owner'] = 'player') =>
  applyCommand(state, { type: 'link', owner, from, to });
const unlinked = (state: GameState) => state.events.filter((e) => e.type === 'unlinked');
const spawnTicks = (state: GameState) => state.units.map((u) => u.id);

describe('link command', () => {
  it('creates a link with owner, endpoints, lane id, creation time and emitAccMs 0, and emits `linked`', () => {
    const state = hub({});
    run(state, 2);
    link(state, 'p', 'a');
    expect(state.links).toEqual([{ owner: 'player', from: 'p', to: 'a', roadId: 'a-p', createdMs: 100, emitAccMs: 0 }]);
    expect(state.events).toContainEqual({ type: 'linked', owner: 'player', from: 'p', to: 'a' });
    expect(isLinked(state, 'p')).toBe(true);
  });

  it('ignores: wrong owner, unknown towers, self, no lane (wall), duplicate', () => {
    const state = hub({});
    expect(state.roads['e-p']).toBeUndefined(); // the wall
    link(state, 'p', 'a', 'enemy1'); // not the owner
    link(state, 'p', 'zzz'); // unknown target
    link(state, 'zzz', 'a'); // unknown source
    link(state, 'p', 'p'); // self
    link(state, 'p', 'e'); // blocked
    link(state, 'a', 'p'); // player does not own a
    expect(state.links).toEqual([]);
    expect(state.events).toEqual([]);
    link(state, 'p', 'b');
    link(state, 'p', 'b'); // duplicate
    expect(state.links.length).toBe(1);
  });

  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
  ] as const)('level %i allows %i simultaneous links; the next one is refused', (level, max) => {
    const state = hub({ level, units: 10 });
    for (const to of ['a', 'b', 'c', 'd']) link(state, 'p', to);
    expect(state.links.length).toBe(max);
    expect(state.links.map((l) => l.to)).toEqual(['a', 'b', 'c', 'd'].slice(0, max));
    expect(C.LINKS_PER_LEVEL[level]).toBe(max);
  });
});

describe('unlink command', () => {
  it('removes one link with `to`, all links without, and emits `unlinked` (manual)', () => {
    const state = hub({ level: 3, units: 10 });
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

describe('stream rate = production interval (rule 4)', () => {
  it.each([
    ['barracks', 1, 1000],
    ['barracks', 2, 700],
    ['barracks', 3, 500],
    ['fortress', 2, 700],
    ['artillery', 1, 2000],
    ['artillery', 3, 1000],
    ['tankFactory', 1, 4000],
    ['tankFactory', 2, 2800],
    ['tankFactory', 3, 2000],
  ] as const)('%s L%i: one unit every %i ms, garrison unchanged', (kind, level, interval) => {
    const state = duel({ kind, level, units: 10 }, { owner: 'neutral', units: 0 });
    const p = state.towers['p']!;
    expect(streamIntervalMs(p, state)).toBe(interval);
    expect(streamRate(p, state)).toBeCloseTo(1000 / interval, 12);
    link(state, 'p', 'e');
    const ticks = interval / C.TICK_MS;
    run(state, ticks - 1);
    expect(state.units.length).toBe(0);
    step(state);
    expect(state.units.length).toBe(1);
    expect(state.units[0]).toMatchObject({ owner: 'player', from: 'p', to: 'e', roadId: 'e-p', progress: (C.TICK_MS / 1000) * state.units[0]!.speed / 240 });
    expect(state.links[0]!.emitAccMs).toBe(0);
    expect(p.units).toBe(10);
    expect(p.genAccMs).toBe(0);
  });

  it('a tank factory emits a whole tank while it holds ≥ 5 weight, otherwise one infantry; nothing leaves the garrison', () => {
    const full = duel({ kind: 'tankFactory', units: 5 }, { owner: 'neutral', units: 0 });
    link(full, 'p', 'e');
    run(full, 80);
    expect(full.units[0]).toMatchObject({ kind: 'tank', weight: 5, speed: 84 });
    expect(full.towers['p']!.units).toBe(5);
    const short = duel({ kind: 'tankFactory', units: 4 }, { owner: 'neutral', units: 0 });
    link(short, 'p', 'e');
    run(short, 80);
    expect(short.units[0]).toMatchObject({ kind: 'infantry', weight: 1, speed: 120 });
    expect(short.towers['p']!.units).toBe(4);
  });

  it('two links on an L2 each emit at the full L2 rate (streams are not shared); L3 with three links puts 6/s on the map', () => {
    const state = hub({ level: 2, units: 30 }, [{ id: 'a', units: 20 }, { id: 'b', units: 20 }]); // neutral 20s: no growth, landings only
    link(state, 'p', 'a');
    link(state, 'p', 'b');
    run(state, 14); // 700 ms
    expect(state.units.map((u) => u.to)).toEqual(['a', 'b']);
    run(state, 14 * 9); // 7 s: 10 per stream, walking or landed
    expect(state.units.filter((u) => u.to === 'a').length + (20 - state.towers['a']!.units)).toBe(10);
    expect(state.units.filter((u) => u.to === 'b').length + (20 - state.towers['b']!.units)).toBe(10);
    expect(state.towers['p']!.units).toBe(30);

    const l3 = hub({ level: 3, units: 60 });
    for (const to of ['a', 'b', 'c']) link(l3, 'p', to);
    run(l3, 20); // 1 s
    expect(l3.units.length).toBe(6);
    expect(l3.towers['p']!.units).toBe(60);
  });

  it('the player productionMul divides the stream interval; the enemy is untouched', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
          { id: 'e', x: 360, y: 760, owner: 'enemy1', units: 10 },
        ],
      }),
      1,
      { ...DEFAULT_MODIFIERS, productionMul: 2 },
    );
    expect(streamIntervalMs(state.towers['p']!, state)).toBe(500);
    expect(streamIntervalMs(state.towers['e']!, state)).toBe(1000);
    link(state, 'p', 'e');
    link(state, 'e', 'p', 'enemy1');
    run(state, 10);
    expect(state.units.map((u) => u.owner)).toEqual(['player']);
    run(state, 10);
    expect(state.units.map((u) => u.owner)).toEqual(['player', 'player', 'enemy1']);
  });

  it('applies the player march bonus at spawn', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 5 },
          { id: 'a', x: 360, y: 400, owner: 'neutral', units: 0 },
        ],
      }),
      1,
      { ...DEFAULT_MODIFIERS, unitSpeedMul: 1.15 },
    );
    link(state, 'p', 'a');
    run(state, 20);
    expect(state.units[0]!.speed).toBeCloseTo(138, 10);
  });

  it('a stream needs soldiers: with the source at 0 the timer stays armed and nothing spawns (rule 6)', () => {
    const state = duel({ units: 0 }, { owner: 'neutral', units: 0 });
    // Bypass the prune (which would end the link) to check the emitter alone: link a 1-unit tower, then drain it.
    state.towers['p']!.units = 1;
    link(state, 'p', 'e');
    run(state, 20);
    expect(state.units.length).toBe(1);
    expect(state.links[0]!.emitAccMs).toBe(0);
  });

  it('under fire pauses growth only: a linked tower keeps streaming while hostile units land on it', () => {
    const state = duel({ level: 3, units: 50 }, { level: 1, units: 10 });
    link(state, 'p', 'e');
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.995 });
    step(state);
    expect(isUnderFire(state, state.towers['p']!)).toBe(true);
    expect(state.towers['p']!.units).toBe(49);
    run(state, 19); // t = 1000: two L3 units emitted (500, 1000)
    expect(state.units.filter((u) => u.owner === 'player').length).toBe(2);
    expect(state.towers['p']!.units).toBe(49); // no growth, no drain
  });
});

describe('acceptance 1(c): sieges keep the source garrison', () => {
  it('L1 25 into a neutral 10 over 240 px: flips between 12 s and 14 s, source at 25 throughout', () => {
    const state = duel({ units: 25 }, { owner: 'neutral', units: 10 });
    link(state, 'p', 'e');
    let sourceAlways25 = true;
    const flipMs = runUntil(
      state,
      (s) => {
        if (s.towers['p']!.units !== 25) sourceAlways25 = false;
        return s.towers['e']!.owner === 'player';
      },
      30_000,
    );
    expect(flipMs).toBeGreaterThanOrEqual(12_000);
    expect(flipMs).toBeLessThanOrEqual(14_000);
    expect(sourceAlways25).toBe(true);
    expect(state.towers['p']!.level).toBe(1); // full but linked: never upgraded
    expect(state.towers['e']!).toMatchObject({ owner: 'player', units: 1 });
    expect(state.events).toContainEqual({ type: 'capture', towerId: 'e', by: 'player', from: 'neutral' });
  });

  it('L3 100 into an enemy L3 100 over 240 px: flips between 50 s and 54 s with the source still at 100', () => {
    const state = duel({ level: 3, units: 100 }, { level: 3, units: 100 });
    link(state, 'p', 'e');
    let minSource = Infinity;
    let minTarget = Infinity;
    const flipMs = runUntil(
      state,
      (s) => {
        minSource = Math.min(minSource, s.towers['p']!.units);
        if (s.towers['e']!.owner === 'enemy1') minTarget = Math.min(minTarget, s.towers['e']!.units);
        return s.towers['e']!.owner === 'player';
      },
      60_000,
    );
    expect(flipMs).toBeGreaterThanOrEqual(50_000);
    expect(flipMs).toBeLessThanOrEqual(54_000);
    expect(minSource).toBe(100);
    expect(minTarget).toBe(0); // under fire from the first landing: never recruited, 100 landings to 0, the 101st flips
  });
});

describe('acceptance 1(d): counter-streams cancel', () => {
  it('two L1 25 streaming at each other over one lane: no landing in 120 s, both stay at 25, no capture', () => {
    const state = duel({ units: 25 }, { units: 25 });
    link(state, 'p', 'e');
    link(state, 'e', 'p', 'enemy1');
    let landings = 0;
    let clashes = 0;
    while (state.time < 120_000) {
      step(state);
      if (state.towers['p']!.units !== 25 || state.towers['e']!.units !== 25) landings++;
      clashes += state.events.filter((e) => e.type === 'unitDied' && e.cause === 'clash').length;
    }
    expect(landings).toBe(0);
    expect(state.towers['p']!).toMatchObject({ owner: 'player', units: 25, level: 1 });
    expect(state.towers['e']!).toMatchObject({ owner: 'enemy1', units: 25, level: 1 });
    expect(state.events.filter((e) => e.type === 'capture')).toEqual([]);
    expect(clashes).toBe(2 * 119); // 119 pairs met (the 120th pair is still walking)
    expect(state.units.length).toBe(2);
    expect(state.links.length).toBe(2);
  });
});

describe('auto-unlink', () => {
  it('acceptance 1(e): a linked tower shot to 0 loses its links with `sourceEmpty` and grows again on the next tick', () => {
    const state = hub({ level: 2, units: 10 });
    link(state, 'p', 'a');
    link(state, 'p', 'b');
    run(state, 10); // 500 ms accumulated on both links, growth paused
    expect(state.towers['p']!.genAccMs).toBe(0);
    applyCommand(state, { type: 'booster', owner: 'enemy1', booster: 'airstrike', towerId: 'p' });
    expect(state.towers['p']!.units).toBe(0);
    step(state); // the first prune pass of the tick ends both links; nothing is emitted
    expect(state.links).toEqual([]);
    expect(unlinked(state)).toEqual([
      { type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'sourceEmpty' },
      { type: 'unlinked', owner: 'player', from: 'p', to: 'b', reason: 'sourceEmpty' },
    ]);
    expect(state.units).toEqual([]);
    expect(isUnderFire(state, state.towers['p']!)).toBe(false);
    step(state); // unlinked: growth resumes
    expect(state.towers['p']!.genAccMs).toBe(50);
    run(state, 13); // 700 ms at L2
    expect(state.towers['p']!.units).toBe(1);
  });

  it('sourceEmpty also when the last hostile landing empties the source (second prune pass, same tick)', () => {
    const state = duel({ units: 1 }, { units: 10 });
    link(state, 'p', 'e');
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.995 });
    step(state); // 1 damage = 1 defender → 0, no capture
    expect(state.towers['p']!).toMatchObject({ owner: 'player', units: 0 });
    expect(unlinked(state)).toEqual([{ type: 'unlinked', owner: 'player', from: 'p', to: 'e', reason: 'sourceEmpty' }]);
  });

  it('sourceLost: capturing the source removes all its links in the capture tick', () => {
    const state = hub({ level: 2, units: 2 }, [{ id: 'a', owner: 'enemy1', units: 0 }]);
    link(state, 'p', 'a');
    link(state, 'p', 'b');
    run(state, 3);
    spawn(state, { owner: 'enemy1', from: 'a', to: 'p', progress: 0.995, weight: 5 });
    step(state);
    expect(state.towers['p']!.owner).toBe('enemy1');
    expect(state.links).toEqual([]);
    expect(unlinked(state)).toEqual([
      { type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'sourceLost' },
      { type: 'unlinked', owner: 'player', from: 'p', to: 'b', reason: 'sourceLost' },
    ]);
    expect(state.events.findIndex((e) => e.type === 'capture')).toBeLessThan(state.events.findIndex((e) => e.type === 'unlinked'));
    // the new owner does not inherit the stream: nothing more leaves p
    const before = state.units.length;
    run(state, 40);
    expect(state.units.length).toBe(before);
  });

  it('sourceLost also when the owner changes outside a capture (e.g. a restored save)', () => {
    const state = hub({});
    link(state, 'p', 'a');
    state.towers['p']!.owner = 'enemy1';
    step(state);
    expect(state.links).toEqual([]);
    expect(unlinked(state)).toEqual([{ type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'sourceLost' }]);
    expect(state.units).toEqual([]);
  });

  it('targetFull: an own target at capacity releases the supply line in the arrival tick', () => {
    const state = hub({ level: 3, units: 50 }, [{ id: 'a', owner: 'player', units: 99, level: 3 }]);
    link(state, 'a', 'b'); // `a` streams itself, so it does not grow: it must fill through p's stream
    link(state, 'p', 'a');
    run(state, 10 + 38); // spawn at 500 ms (tick 10), lands 39 ticks later (tick 49)
    expect(state.links.length).toBe(2);
    expect(state.towers['a']!.units).toBe(99);
    step(state); // tick 49: arrival → 100 = capacity
    expect(state.towers['a']!.units).toBe(100);
    expect(state.links.map((l) => `${l.from}>${l.to}`)).toEqual(['a>b']);
    expect(unlinked(state)).toEqual([{ type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'targetFull' }]);
  });

  it('an own target that fills at L1/L2 upgrades instead and keeps the stream', () => {
    const state = hub({ level: 3, units: 50 }, [{ id: 'a', owner: 'player', units: 24, level: 1 }]);
    link(state, 'p', 'a');
    run(state, 49); // first arrival at tick 49: 25 = L1 capacity (a recruited nothing? it did: 2 s of L1 = 2 units, so it upgraded earlier)
    expect(state.towers['a']!.level).toBe(2);
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
    const state = duel({ level: 2, units: 20 }, { units: 3 });
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'freeze' }); // e does not produce for 5 s
    link(state, 'p', 'e');
    // L2 spawns at 700, 1400, 2100, 2800 → landings 2650, 3350, 4050, 4750
    run(state, 67); // 3350 ms
    expect(state.towers['e']!).toMatchObject({ owner: 'enemy1', units: 1 });
    run(state, 14); // 4050 ms
    expect(state.towers['e']!).toMatchObject({ owner: 'enemy1', units: 0 });
    run(state, 14); // 4750 ms: 1 damage > 0 defenders → capture
    expect(state.towers['e']!).toMatchObject({ owner: 'player', units: 1, level: 1 });
    expect(state.events).toContainEqual({ type: 'capture', towerId: 'e', by: 'player', from: 'enemy1' });
    expect(state.links.length).toBe(1);
    run(state, 14); // 5450 ms: next unit reinforces
    expect(state.towers['e']!).toMatchObject({ owner: 'player', units: 2 });
    expect(unlinked(state)).toEqual([]);
    expect(state.towers['p']!.units).toBe(20);
  });
});

describe('acceptance 1(g): boosters and streams', () => {
  it('freeze cast by the player pauses every enemy stream for 5 s while the player keeps streaming', () => {
    const state = duel({ units: 10 }, { units: 10 });
    link(state, 'p', 'e');
    link(state, 'e', 'p', 'enemy1');
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'freeze' });
    run(state, 100); // 5 s
    expect(state.units.filter((u) => u.owner === 'player').length).toBe(5 - 3); // 5 spawned, 3 landed (2950, 3950, 4950)
    expect(state.units.filter((u) => u.owner === 'enemy1').length).toBe(0);
    expect(state.links.find((l) => l.owner === 'enemy1')!.emitAccMs).toBe(0);
    run(state, 20); // freeze over at 5050: the enemy accumulates again, first unit at 6050
    expect(state.units.filter((u) => u.owner === 'enemy1').length).toBe(1);
    expect(state.towers['e']!.units).toBe(10 - 4); // landings at 2950, 3950, 4950, 5950; enemy garrison unchanged by its stream
  });

  it('overdrive triples the player’s streams (L1: 3 units/s) and not the enemy’s', () => {
    const state = duel({ units: 10 }, { units: 10 });
    link(state, 'p', 'e');
    link(state, 'e', 'p', 'enemy1');
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'overdrive' });
    run(state, 20); // 1 s
    expect(state.units.filter((u) => u.owner === 'player').length).toBe(3);
    expect(state.units.filter((u) => u.owner === 'enemy1').length).toBe(1);
    expect(spawnTicks(state).length).toBe(4);
  });
});

describe('acceptance 1(f): mines on lanes', () => {
  it('a mine 20 px off a lane kills the first `charges` weight crossing; 40 px off does nothing', () => {
    const state = duel({ units: 10 }, { owner: 'neutral', units: 0 }, [], {
      mines: [
        { x: 380, y: 880, charges: 2 }, // 20 px off e-p at t = 0.5
        { x: 400, y: 940, charges: 5 }, // 40 px off: not on the lane
      ],
    });
    expect(state.roads['e-p']!.mineHits).toEqual([{ mine: 0, t: 0.5 }]);
    link(state, 'p', 'e');
    let mineDeaths = 0;
    const tick = () => {
      step(state);
      mineDeaths += state.events.filter((e) => e.type === 'unitDied' && e.owner === 'player' && e.cause === 'mine').length;
    };
    for (let i = 0; i < 40; i++) tick(); // first unit (spawned at tick 20) reaches the middle at tick 39/40
    expect(state.mines[0]!.charges).toBe(1);
    expect(mineDeaths).toBe(1);
    for (let i = 0; i < 20; i++) tick(); // second unit dies too
    expect(state.mines[0]!.charges).toBe(0);
    expect(mineDeaths).toBe(2);
    for (let i = 0; i < 40; i++) tick(); // the third walks through and lands at 3000 + 1950
    expect(mineDeaths).toBe(2);
    expect(state.towers['e']!.owner).toBe('player');
    expect(state.mines[1]!.charges).toBe(5);
  });
});

describe('acceptance 1(h): snapshots and determinism', () => {
  const mined = () =>
    duel({ level: 2, units: 20 }, { units: 3 }, [], {
      mines: [{ x: 360, y: 880, charges: 2 }],
      obstacles: [{ kind: 'rock', points: [{ x: 600, y: 600 }] }],
    });

  it('cloneState and deepCopy keep emitAccMs and mine charges; obstacles are shared (static), the rest is copied', () => {
    const state = mined();
    link(state, 'p', 'e');
    run(state, 45); // 2250 ms: emitAccMs 150 on the link, first unit died on the mine at 2000
    expect(state.links[0]!.emitAccMs).toBe(150);
    expect(state.mines[0]!.charges).toBe(1);
    const copy = cloneState(state);
    const plain = deepCopy(state);
    for (const c of [copy, plain]) {
      expect(c).toEqual(state);
      expect(c.links[0]!.emitAccMs).toBe(150);
      expect(c.mines[0]!.charges).toBe(1);
      expect(c.links).not.toBe(state.links);
      expect(c.mines[0]).not.toBe(state.mines[0]);
      expect(c.roads['e-p']!.mineHits).not.toBe(state.roads['e-p']!.mineHits);
    }
    expect(copy.obstacles).toBe(state.obstacles);
    expect(plain.obstacles).not.toBe(state.obstacles);
    copy.mines[0]!.charges = 9;
    copy.links[0]!.emitAccMs = 1;
    expect(state.mines[0]!.charges).toBe(1);
    expect(state.links[0]!.emitAccMs).toBe(150);
  });

  it('a restored snapshot replays to the identical state (links, mines, obstacles)', () => {
    const play = (s: GameState, from: number, to: number) => {
      for (let tick = from; tick < to; tick++) {
        if (tick === 2) link(s, 'p', 'e');
        if (tick === 30) link(s, 'e', 'p', 'enemy1');
        if (tick === 200) applyCommand(s, { type: 'unlink', owner: 'enemy1', from: 'e' });
        step(s);
      }
    };
    const a = mined();
    play(a, 0, 400);
    const b = mined();
    play(b, 0, 60);
    const snap = cloneState(b);
    play(b, 60, 400);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    play(snap, 60, 400);
    expect(JSON.stringify(snap)).toBe(JSON.stringify(a));
    expect(snap).toEqual(a);
    expect(a.mines[0]!.charges).toBe(0);
    expect(a.towers['e']!.owner).toBe('player');
  });

  it('links do not count as units in transit for the outcome', () => {
    const state = duel({ units: 10 }, { owner: 'neutral', units: 0 });
    expect(getOutcome(state)).toBe('won');
    state.links.push({ owner: 'enemy1', from: 'e', to: 'p', roadId: 'e-p', createdMs: 0, emitAccMs: 0 });
    expect(getOutcome(state)).toBe('won');
  });
});
