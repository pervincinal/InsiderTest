import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import type { GameState, MineDef, Owner, TowerDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { isUnderFire, step } from '../../src/sim/step';
import { cloneState, deepCopy } from '../../src/sim/snapshot';
import { C } from '../../src/sim/constants';
import { run, runUntil, spawn } from './util';

/*
 * Rules v2.1 "Under fire" (GDD §2.0): a hostile landing pauses the target's production for
 * UNDER_FIRE_MS = 1500 ms. Maps below use 240 px lanes (2 s of infantry travel, 2.86 s for a tank):
 * `p` (360,1000) — `e` (360,760); `n` (120,1000) is p's neighbour on a second 240 px lane.
 * Rules v3: an L1 stream spawns its first unit at 1000 ms and lands it 1950 ms later (2950 ms).
 */

function duel(p: Partial<TowerDef>, e: Partial<TowerDef>, extra: TowerDef[] = [], mines: MineDef[] = []): GameState {
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1, ...p },
        { id: 'e', x: 360, y: 760, owner: 'enemy1', units: 10, level: 1, ...e },
        ...extra,
      ],
      mines,
    }),
    1,
  );
}

const link = (state: GameState, owner: Owner, from: string, to: string) => applyCommand(state, { type: 'link', owner, from, to });

describe('under fire: rule mechanics', () => {
  it('C.UNDER_FIRE_MS is 1500 (GDD §2.0 v2.1)', () => {
    expect(C.UNDER_FIRE_MS).toBe(1500);
  });

  it('a hostile landing arms underFireUntilMs = time + UNDER_FIRE_MS and pauses production for exactly that window', () => {
    const state = duel({ units: 10 }, { units: 10 });
    expect(state.towers['p']!.underFireUntilMs).toBe(0);
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.995 });
    step(state); // t = 50: lands, 10 → 9
    const p = state.towers['p']!;
    expect(p.units).toBe(9);
    expect(p.underFireUntilMs).toBe(50 + C.UNDER_FIRE_MS);
    expect(isUnderFire(state, p)).toBe(true);
    // Paused while time < 1550: the L1 unit due at t = 1000 does not appear …
    run(state, 29); // t = 1500
    expect(p.units).toBe(9);
    expect(isUnderFire(state, p)).toBe(true);
    step(state); // t = 1550: expired, the accumulator (50 ms from tick 1) resumes
    expect(isUnderFire(state, p)).toBe(false);
    expect(p.units).toBe(9);
    // … and the first recruit appears 900 ms later: 50 (tick 1) + 50 (t = 1550) + 900 = 1000 ms accumulated.
    run(state, 17); // t = 2400
    expect(p.units).toBe(9);
    step(state); // t = 2450
    expect(p.units).toBe(10);
  });

  it('every hostile landing re-arms the window (a 1 s trickle keeps an L3 keep at zero production)', () => {
    const state = duel({ level: 3, units: 60 }, { units: 10 });
    for (let i = 0; i < 5; i++) {
      spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.995 });
      run(state, 20); // one landing per 1000 ms
      expect(state.towers['p']!.underFireUntilMs).toBe(50 + i * 1000 + C.UNDER_FIRE_MS);
    }
    // 5 s at L3 would otherwise be +10; five hits are −5 and nothing was produced.
    expect(state.towers['p']!.units).toBe(55);
  });

  it('overdrive multiplies a paused rate: still nothing while under fire', () => {
    const state = duel({ level: 3, units: 60 }, { units: 10 });
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'overdrive' });
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.995 });
    run(state, 30); // t = 1500, whole window
    expect(state.towers['p']!.units).toBe(59);
    run(state, 20); // t = 2500: overdrive (×3 at L3 = 6/s) is back
    expect(state.towers['p']!.units).toBe(59 + 6);
  });

  it('friendly reinforcements still land (+1 each), do not arm the window and still auto-upgrade the tower', () => {
    const state = duel({ units: 23 }, { units: 10 }, [{ id: 'n', x: 120, y: 1000, owner: 'player', units: 10 }]);
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.995 });
    step(state); // 23 → 22, under fire until 1550
    expect(state.towers['p']!.underFireUntilMs).toBe(1550);
    spawn(state, { owner: 'player', from: 'n', to: 'p', progress: 0.995 });
    spawn(state, { owner: 'player', from: 'n', to: 'p', progress: 0.995 });
    spawn(state, { owner: 'player', from: 'n', to: 'p', progress: 0.995 });
    step(state); // +3 = 25 = L1 capacity → L2 while under fire
    expect(state.towers['p']!.units).toBe(25);
    expect(state.towers['p']!.level).toBe(2);
    expect(state.events).toContainEqual({ type: 'upgrade', towerId: 'p', level: 2 });
    expect(state.towers['p']!.underFireUntilMs).toBe(1550); // friendly landings never touch it
  });

  it('units that die on the lane are not landings (clash, mine, artillery)', () => {
    // clash: enemy and player units meet on p-e and both die
    const clash = duel({ units: 10 }, { units: 10 });
    spawn(clash, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.45 });
    spawn(clash, { owner: 'player', from: 'p', to: 'e', progress: 0.45 });
    run(clash, 3);
    expect(clash.units).toEqual([]);
    expect(clash.towers['p']!.underFireUntilMs).toBe(0);
    expect(clash.towers['e']!.underFireUntilMs).toBe(0);

    // mines at the midpoints of two lanes into p
    const hazard = duel({ units: 10 }, { units: 10 }, [{ id: 'f', x: 120, y: 1000, owner: 'enemy1', units: 10 }], [
      { x: 360, y: 880, charges: 1 },
      { x: 240, y: 1000, charges: 1 },
    ]);
    spawn(hazard, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.48 });
    spawn(hazard, { owner: 'enemy1', from: 'f', to: 'p', progress: 0.48 });
    run(hazard, 12);
    expect(hazard.units).toEqual([]);
    expect(hazard.mines.map((m) => m.charges)).toEqual([0, 0]);
    expect(hazard.towers['p']!.units).toBe(10);
    expect(hazard.towers['p']!.underFireUntilMs).toBe(0);

    // artillery: p's own gun kills the unit in range before it lands
    const gun = duel({ kind: 'artillery', units: 10 }, { units: 10 });
    spawn(gun, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.5 }); // 120 px out, in range
    step(gun);
    expect(gun.events).toContainEqual(expect.objectContaining({ type: 'unitDied', cause: 'artillery' }));
    run(gun, 30);
    expect(gun.towers['p']!.underFireUntilMs).toBe(0);
  });

  it('a fortress half-hit that removes nobody is still a landing (defence accumulator unchanged)', () => {
    const state = duel({ kind: 'fortress', units: 10 }, { units: 10 });
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.995 });
    step(state);
    const p = state.towers['p']!;
    expect(p.units).toBe(10);
    expect(p.defenceAcc).toBeCloseTo(0.5);
    expect(p.underFireUntilMs).toBe(50 + C.UNDER_FIRE_MS);
  });

  it('neutral towers are left unmarked', () => {
    const state = duel({ units: 10 }, { owner: 'neutral', units: 3 });
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.995 });
    step(state);
    expect(state.towers['e']!).toMatchObject({ owner: 'neutral', units: 2, underFireUntilMs: 0 });
  });

  it('a capture clears the window; the old owner\'s units still landing re-arm it for the new owner', () => {
    const state = duel({ units: 2 }, { units: 10 });
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.995 });
    step(state); // 2 → 1, under fire
    expect(state.towers['p']!.underFireUntilMs).toBe(1550);
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.995, weight: 5 });
    step(state); // 5 > 1: captured, remainder 4, fresh start
    expect(state.towers['p']!).toMatchObject({ owner: 'enemy1', units: 4, underFireUntilMs: 0 });
    expect(state.events).toContainEqual({ type: 'capture', towerId: 'p', by: 'enemy1', from: 'player' });
    run(state, 19); // t = 1050: 950 ms since the capture reset the accumulator at t = 100
    expect(state.towers['p']!.units).toBe(4);
    step(state); // t = 1100: the new owner's first recruit (L1, 1000 ms)
    expect(state.towers['p']!.units).toBe(5);
    spawn(state, { owner: 'player', from: 'e', to: 'p', progress: 0.995 }); // a straggler of the old owner
    step(state); // t = 1150
    expect(state.towers['p']!).toMatchObject({ owner: 'enemy1', units: 4, underFireUntilMs: 1150 + C.UNDER_FIRE_MS });
  });
});

describe('under fire: GDD §2.0 v2.1 acceptance, re-measured under rules v3 streams', () => {
  it('1. L3 100 streams into an enemy L3 100 over 240 px: the target flips between 50 s and 54 s (2/s from 2.45 s, never recruiting)', () => {
    const state = duel({ level: 3, units: 100 }, { level: 3, units: 100 });
    link(state, 'player', 'p', 'e');
    let minGarrison = Infinity;
    const flipMs = runUntil(
      state,
      (s) => {
        if (s.towers['e']!.owner === 'enemy1') minGarrison = Math.min(minGarrison, s.towers['e']!.units);
        return s.towers['e']!.owner === 'player';
      },
      60_000,
    );
    expect(flipMs).toBeGreaterThanOrEqual(50_000);
    expect(flipMs).toBeLessThanOrEqual(54_000);
    expect(minGarrison).toBe(0);
    expect(state.towers['p']!.units).toBe(100); // the source never drains
    expect(state.events).toContainEqual({ type: 'capture', towerId: 'e', by: 'player', from: 'enemy1' });
  });

  it('2a. enemy L1 25 streams into a player L3 100 over 240 px, unanswered: the keep falls between 100 s and 106 s', () => {
    const state = duel({ level: 3, units: 100 }, { level: 1, units: 25 });
    link(state, 'enemy1', 'e', 'p'); // linked before the first tick so the full L1 does not auto-upgrade
    const fallMs = runUntil(state, (s) => s.towers['p']!.owner === 'enemy1', 120_000);
    // 1/s from 2.95 s, the keep under fire from the first landing: 101 landings → 102.95 s.
    expect(fallMs).toBeGreaterThanOrEqual(100_000);
    expect(fallMs).toBeLessThanOrEqual(106_000);
    expect(state.towers['e']!).toMatchObject({ level: 1, units: 25 });
  });

  it('2b. … answered by a player L3 100 neighbour linking in at t = 5 s: back at 100 by 25 s, supply line ends with targetFull', () => {
    const state = duel({ level: 3, units: 100 }, { level: 1, units: 25 }, [{ id: 'n', x: 120, y: 1000, owner: 'player', units: 100, level: 3 }]);
    link(state, 'enemy1', 'e', 'p');
    run(state, 100); // t = 5 s: landings at 2.95, 3.95, 4.95
    const dented = state.towers['p']!.units;
    expect(dented).toBe(97);
    expect(isUnderFire(state, state.towers['p']!)).toBe(true);
    link(state, 'player', 'n', 'p');
    let fullAtMs = -1;
    while (state.time < 25_000 && fullAtMs < 0) {
      step(state);
      const ev = state.events.find((e) => e.type === 'unlinked' && e.from === 'n' && e.to === 'p');
      if (ev && ev.type === 'unlinked') {
        expect(ev.reason).toBe('targetFull');
        fullAtMs = state.time;
      }
    }
    // Supply 2/s from 7.45 s against 1/s of hits: +1/s net from ≈ 95 → 100 at ≈ 12.5 s.
    expect(fullAtMs).toBeGreaterThan(10_000);
    expect(fullAtMs).toBeLessThanOrEqual(15_000);
    expect(state.towers['p']!.units).toBe(100);
    expect(state.towers['p']!.owner).toBe('player');
    expect(state.links.some((l) => l.from === 'n')).toBe(false);
    expect(state.towers['n']!.units).toBe(100); // the helper's garrison is untouched by its stream
    // The keep still recruits nothing by itself: the neighbour's stream did the refilling.
    expect(isUnderFire(state, state.towers['p']!)).toBe(true);
  });

  it('3a. a tank factory trickle alone (one tank / 4 s) lets the window expire: the target regenerates between landings', () => {
    const state = duel({ level: 1, units: 10 }, { kind: 'tankFactory', level: 1, units: 5 });
    link(state, 'enemy1', 'e', 'p');
    const p = state.towers['p']!;
    const landings: { atMs: number; unitsAfter: number; unitsBefore: number }[] = [];
    let armed = 0;
    let before = p.units;
    while (state.time < 16_000) {
      step(state);
      if (p.underFireUntilMs !== armed) {
        armed = p.underFireUntilMs;
        landings.push({ atMs: state.time, unitsAfter: p.units, unitsBefore: before });
      }
      before = p.units;
    }
    // Tanks leave at 4000, 8000, 12000 ms (TANK_GEN_MS[1]) and walk 240 / 84 px/s ≈ 2.86 s (58 ticks, the spawn tick included).
    expect(landings.map((l) => l.atMs)).toEqual([6_850, 10_850, 14_850]);
    for (const l of landings) expect(l.unitsAfter).toBe(l.unitsBefore - 5);
    // Between two landings the window (1.5 s) expires and 2.5 s of L1 production lands (the accumulator carries over).
    expect(landings[1]!.unitsBefore - landings[0]!.unitsAfter).toBe(3);
    expect(landings[2]!.unitsBefore - landings[1]!.unitsAfter).toBe(2);
    expect(state.towers['e']!.units).toBe(5); // the factory keeps its tank
    // Explicitly: under fire right after a landing, expired UNDER_FIRE_MS later.
    const s2 = duel({ level: 1, units: 10 }, { kind: 'tankFactory', level: 1, units: 5 });
    link(s2, 'enemy1', 'e', 'p');
    runUntil(s2, (s) => s.towers['p']!.underFireUntilMs > 0, 8_000);
    expect(isUnderFire(s2, s2.towers['p']!)).toBe(true);
    run(s2, C.UNDER_FIRE_MS / C.TICK_MS);
    expect(isUnderFire(s2, s2.towers['p']!)).toBe(false);
  });

  it('3b. snapshots restore underFireUntilMs (cloneState and deepCopy) and the restored state continues identically', () => {
    const state = duel({ level: 3, units: 100 }, { level: 1, units: 25 });
    link(state, 'enemy1', 'e', 'p');
    run(state, 60); // t = 3 s: under fire
    const p = state.towers['p']!;
    expect(p.underFireUntilMs).toBeGreaterThan(state.time);
    const copy = cloneState(state);
    const plain = deepCopy(state);
    expect(copy.towers['p']!.underFireUntilMs).toBe(p.underFireUntilMs);
    expect(plain.towers['p']!.underFireUntilMs).toBe(p.underFireUntilMs);
    expect(copy.towers['p']).not.toBe(p);
    // A restored snapshot replays exactly: the target flips on the same tick in both timelines.
    const origFall = runUntil(state, (s) => s.towers['p']!.owner === 'enemy1', 120_000);
    const copyFall = runUntil(copy, (s) => s.towers['p']!.owner === 'enemy1', 120_000);
    expect(origFall).toBeGreaterThan(0);
    expect(copyFall).toBe(origFall);
    expect(copy).toEqual(state);
    // Restoring a snapshot taken under fire keeps production paused: no unit appears until the window ends.
    const paused = cloneState(plain);
    applyCommand(paused, { type: 'unlink', owner: 'enemy1', from: 'e' });
    const unitsAtRestore = paused.towers['p']!.units;
    runUntil(paused, (s) => s.units.length === 0, 10_000); // the in-flight units land, each a hit
    const afterLandings = paused.towers['p']!.units;
    expect(afterLandings).toBeLessThan(unitsAtRestore);
    const until = paused.towers['p']!.underFireUntilMs;
    while (paused.time < until - C.TICK_MS) step(paused);
    expect(paused.towers['p']!.units).toBe(afterLandings);
    run(paused, 20); // the accumulator (0 at a full keep) restarts at `until`: +2 after 1 s at L3
    expect(paused.towers['p']!.units).toBe(afterLandings + 2);
  });
});
