import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { isFrozen, step } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import { SnapshotRing, applyContinue } from '../../src/sim/snapshot';
import type { GameState, Obstacle } from '../../src/sim/types';
import { SCENARIO_SCRIPT, scenarioLevel, scriptedTick } from './util';

/*
 * QA bug hunt 2026-09-22, item 1: links, their `emitAccMs`, mine charges and the static obstacles across a
 * rewind + `applyContinue` (rewind 20 s, free freeze, 15 infantry). The scenario is the shared one of the
 * determinism / snapshot tests (mines on two lanes, links of both owners, a player freeze at 15 s).
 */

/** Play the scenario to `ticks`, recording every tick into a ring. */
function play(ticks: number): { state: GameState; ring: SnapshotRing<GameState> } {
  const ring = new SnapshotRing<GameState>(1000, 20_000);
  const state = createState(scenarioLevel(), 42);
  ring.record(state);
  for (let tick = 0; tick < ticks; tick++) {
    scriptedTick(state, tick);
    ring.record(state);
  }
  return { state, ring };
}

/** An independent run stepped to exactly `ticks` (the reference for what the snapshot must hold). */
function reference(ticks: number): GameState {
  const state = createState(scenarioLevel(), 42);
  for (let tick = 0; tick < ticks; tick++) scriptedTick(state, tick);
  return state;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

describe('rewind restores links with their accumulators and mines with their charges', () => {
  it('the 20 s rewind of a 25 s match equals an independent run stopped at 5 s: links, emitAccMs, mine charges', () => {
    const { state, ring } = play(500);
    const restored = ring.rewind(C.CONTINUE_REWIND_MS)!;
    const ref = reference(100);
    expect(restored.time).toBe(5_000);
    // the snapshot was taken mid-stream: three links, none at a fresh accumulator
    expect(restored.links.map((l) => `${l.owner}:${l.from}>${l.to}`)).toEqual(['player:p>a', 'enemy1:t>a', 'enemy1:e>a']);
    expect(restored.links.map((l) => l.emitAccMs)).toEqual([0, 1000, 0]); // the tank factory is 1 s into its 4 s interval
    expect(restored.links).toEqual(ref.links);
    // the mine on a–p is spent by then, the one on a–e has one hit: the snapshot holds the 5 s values, not the final ones
    expect(restored.mines.map((m) => m.charges)).toEqual([0, 2]);
    expect(restored.mines).toEqual(ref.mines);
    expect(state.mines.map((m) => m.charges)).toEqual([0, 0]);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(ref));
  });

  it('obstacles are shared by reference through the ring and the rewind (static data, never copied)', () => {
    const { state, ring } = play(600);
    const restored = ring.rewind(C.CONTINUE_REWIND_MS)!;
    expect(restored.obstacles).toBe(state.obstacles);
    expect(ring.rewind(0)!.obstacles).toBe(state.obstacles);
    // and never mutated: a frozen obstacle list survives 120 s of scripted play (a write would throw in strict mode)
    const frozen = createState(scenarioLevel(), 42);
    const before = JSON.stringify(frozen.obstacles);
    deepFreeze(frozen.obstacles);
    for (let tick = 0; tick < 2400; tick++) scriptedTick(frozen, tick);
    expect(frozen.time).toBe(120_000);
    expect(JSON.stringify(frozen.obstacles)).toBe(before);
    const lanes: Obstacle[] = frozen.obstacles;
    expect(Object.isFrozen(lanes[0]!.points[0])).toBe(true);
  });

  it('applyContinue leaves every link and accumulator alone, adds the freeze and the reinforcements only', () => {
    const { ring } = play(600);
    const restored = ring.rewind(C.CONTINUE_REWIND_MS)!;
    const linksBefore = JSON.stringify(restored.links);
    const minesBefore = JSON.stringify(restored.mines);
    const unitsBefore = JSON.stringify(restored.units);
    expect(restored.towers['p']!.units).toBe(20); // linked since tick 0: the garrison never moved
    expect(applyContinue(restored)).toBe(restored);
    expect(JSON.stringify(restored.links)).toBe(linksBefore);
    expect(JSON.stringify(restored.mines)).toBe(minesBefore);
    expect(JSON.stringify(restored.units)).toBe(unitsBefore);
    expect(restored.towers['p']!.units).toBe(25); // 20 + 15 capped at the L1 capacity
    expect(restored.towers['p']!.level).toBe(1); // still linked: no auto-upgrade
    expect(restored.boosters).toEqual([
      { type: 'overdrive', owner: 'player', untilMs: 16_000 }, // cast at 6 s, still running at the rewind point
      { type: 'freeze', owner: 'player', untilMs: 15_000 },
    ]);
    expect(restored.events).toEqual([]);
  });

  it('after the continue the enemy streams pause for exactly 5 s (accumulators frozen) while the player stream keeps emitting', () => {
    const { ring } = play(600);
    const restored = applyContinue(ring.rewind(C.CONTINUE_REWIND_MS)!)!;
    const enemyAcc = restored.links.filter((l) => l.owner === 'enemy1').map((l) => l.emitAccMs);
    const enemyUnits = restored.units.filter((u) => u.owner === 'enemy1').length;
    const playerUnits = restored.units.filter((u) => u.owner === 'player').length;
    const nextId = restored.nextUnitId;
    let playerSpawned = 0;
    for (let i = 0; i < 100; i++) {
      step(restored);
      expect(isFrozen(restored, 'enemy1')).toBe(true);
      expect(isFrozen(restored, 'player')).toBe(false);
      playerSpawned += restored.units.filter((u) => u.owner === 'player' && u.id >= nextId).length ? 1 : 0;
      // nothing enemy-owned spawned (ids below the continue's nextUnitId only), accumulators untouched
      expect(restored.units.filter((u) => u.owner === 'enemy1' && u.id >= nextId)).toEqual([]);
      expect(restored.links.filter((l) => l.owner === 'enemy1').map((l) => l.emitAccMs)).toEqual(enemyAcc);
    }
    expect(restored.time).toBe(15_000);
    expect(restored.boosters.filter((b) => b.type === 'freeze')).toHaveLength(1);
    expect(playerSpawned).toBeGreaterThan(0);
    expect(playerUnits + enemyUnits).toBeGreaterThanOrEqual(0);
    step(restored); // 15 050: the freeze is gone, the enemy accumulators move again
    expect(restored.boosters.filter((b) => b.type === 'freeze')).toEqual([]);
    expect(restored.links.filter((l) => l.owner === 'enemy1').map((l) => l.emitAccMs)).toEqual(enemyAcc.map((a) => a + C.TICK_MS));
  });

  it('a linked L1 filled to 25 by the continue stays L1 while linked and upgrades on the tick after the unlink', () => {
    const { ring } = play(600);
    const restored = applyContinue(ring.rewind(C.CONTINUE_REWIND_MS)!)!;
    expect(restored.towers['p']!).toMatchObject({ level: 1, units: 25 });
    for (let i = 0; i < 20; i++) step(restored);
    expect(restored.towers['p']!).toMatchObject({ level: 1, units: 25 }); // linked: no growth, no upgrade
    applyCommand(restored, { type: 'unlink', owner: 'player', from: 'p' });
    step(restored);
    expect(restored.towers['p']!).toMatchObject({ level: 2, units: 25 });
    expect(restored.events).toContainEqual({ type: 'upgrade', towerId: 'p', level: 2 });
  });

  it('the script the tests rely on really casts a freeze after the rewind point and links both owners', () => {
    expect(SCENARIO_SCRIPT.filter(([, c]) => c.type === 'booster' && c.booster === 'freeze').map(([t]) => t)).toEqual([300]);
    expect(new Set(SCENARIO_SCRIPT.filter(([, c]) => c.type === 'link').map(([, c]) => c.owner))).toEqual(new Set(['player', 'enemy1']));
  });
});
