import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { step } from '../../src/sim/step';
import { run, spawn, unitsOf } from './util';

describe('clashes', () => {
  it('equal weights crossing on a road kill both', () => {
    const state = createState(makeLevel(), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.49 });
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.49 });
    step(state);
    expect(state.units).toEqual([]);
    expect(state.events.filter((e) => e.type === 'unitDied' && e.cause === 'clash').length).toBe(2);
  });

  it('the heavier survives and loses the lighter weight', () => {
    const state = createState(makeLevel(), 1);
    const tank = spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.495, weight: 5, kind: 'tank' });
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.49 });
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.495 });
    step(state);
    expect(state.units.map((u) => u.id)).toEqual([tank.id]);
    expect(tank.weight).toBe(3);
    expect(state.events.filter((e) => e.type === 'unitDied' && e.owner === 'enemy1').length).toBe(2);
  });

  it('units that do not cross this tick, or share an owner, do not clash', () => {
    const state = createState(makeLevel(), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.3 });
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.3 });
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.49 });
    spawn(state, { owner: 'player', from: 'e', to: 'p', progress: 0.49 });
    step(state);
    expect(state.units.length).toBe(4);
  });
});

describe('artillery', () => {
  function level(units: { progress: number }[]) {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, kind: 'artillery' },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 },
    ] }), 1);
    for (const u of units) spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: u.progress });
    return state;
  }

  it('kills one hostile within 140 px and leaves units outside alone', () => {
    // progress 0.8 → 120 px away; 0.7 → 180 px away (174 px after moving)
    const state = level([{ progress: 0.7 }, { progress: 0.8 }]);
    step(state);
    expect(unitsOf(state, 'enemy1').map((u) => u.progress)).toEqual([0.71]);
    expect(state.events).toContainEqual({ type: 'unitDied', x: 360, y: 400 + 0.81 * 600, owner: 'enemy1', cause: 'artillery' });
  });

  it('fires again after an 800 ms cooldown, picking the nearest', () => {
    const state = level([{ progress: 0.8 }, { progress: 0.75 }, { progress: 0.79 }]);
    step(state); // kills 0.8 (nearest)
    expect(unitsOf(state, 'enemy1').length).toBe(2);
    run(state, 15);
    expect(unitsOf(state, 'enemy1').length).toBe(2);
    run(state, 1); // tick 17 = 800 ms later
    const left = unitsOf(state, 'enemy1');
    expect(left.length).toBe(1);
    expect(left[0]!.progress).toBeCloseTo(0.75 + 0.17, 9);
  });

  it('does not shoot its own units', () => {
    const state = level([]);
    spawn(state, { owner: 'player', from: 'e', to: 'p', progress: 0.9 });
    step(state);
    expect(state.units.length).toBe(1);
  });
});

describe('hazards', () => {
  it('mine kills infantry until its charges are spent, then a heavier unit survives it', () => {
    const state = createState(makeLevel({ roads: [{ a: 'p', b: 'e', mine: 3 }] }), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.495 });
    step(state);
    expect(state.units).toEqual([]);
    expect(state.roads['e-p']!.mine).toBe(2);
    expect(state.events).toContainEqual({ type: 'unitDied', x: 360, y: 700 - 0.005 * 600, owner: 'player', cause: 'mine' });
    const tank = spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.495, weight: 5, kind: 'tank' });
    step(state);
    expect(state.units).toEqual([tank]);
    expect(tank.weight).toBe(5);
    expect(state.roads['e-p']!.mine).toBe(0);
    state.units = [];
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.495 });
    step(state);
    expect(state.units.length).toBe(1);
  });

  it('barrier absorbs unit weight until hp 0, then lets units pass', () => {
    const state = createState(makeLevel({ roads: [{ a: 'p', b: 'e', barrier: 2 }] }), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.495 });
    step(state);
    expect(state.units).toEqual([]);
    expect(state.roads['e-p']!.barrier).toBe(1);
    expect(state.events).toContainEqual({ type: 'unitDied', x: 360, y: 697, owner: 'player', cause: 'barrier' });
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.495 });
    step(state);
    expect(state.units).toEqual([]);
    expect(state.roads['e-p']!.barrier).toBe(0);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.495 });
    step(state);
    expect(state.units.length).toBe(1);
  });

  it('a heavier unit breaks a weaker barrier and continues with reduced weight', () => {
    const state = createState(makeLevel({ roads: [{ a: 'p', b: 'e', barrier: 2 }] }), 1);
    const tank = spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.495, weight: 5, kind: 'tank' });
    step(state);
    expect(state.units).toEqual([tank]);
    expect(tank.weight).toBe(3);
    expect(state.roads['e-p']!.barrier).toBe(0);
  });

  it('a unit that has not reached the midpoint is unaffected', () => {
    const state = createState(makeLevel({ roads: [{ a: 'p', b: 'e', mine: 1, barrier: 1 }] }), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.2 });
    run(state, 20);
    expect(state.units.length).toBe(1);
    expect(state.roads['e-p']!.mine).toBe(1);
    expect(state.roads['e-p']!.barrier).toBe(1);
  });
});
