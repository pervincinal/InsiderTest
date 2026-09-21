import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { step, unitPosition, roadPointAt } from '../../src/sim/step';
import { run, spawn } from './util';

describe('marching', () => {
  it('takes length / speed to cross a lane (600 px at 120 px/s = 100 ticks)', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 1 },
      { id: 'e', x: 360, y: 400, owner: 'neutral', units: 5 },
    ] }), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e' });
    run(state, 99);
    expect(state.units.length).toBe(1);
    expect(state.units[0]!.progress).toBeCloseTo(0.99, 9);
    expect(state.towers['e']!.units).toBe(5);
    run(state, 1);
    expect(state.units.length).toBe(0);
    expect(state.towers['e']!.units).toBe(4);
    expect(state.time).toBe(5000);
  });

  it('tanks take 1 / 0.7 as long (84 px in 20 ticks at 84 px/s)', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 0, y: 0, owner: 'player', units: 5, kind: 'tankFactory' },
      { id: 'e', x: 84, y: 0, owner: 'neutral', units: 0 },
    ] }), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', kind: 'tank' });
    run(state, 19);
    expect(state.units.length).toBe(1);
    run(state, 1);
    expect(state.units.length).toBe(0);
    expect(state.towers['e']!.owner).toBe('player');
  });

  it('a streamed unit walks the straight lane between the tower centres', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'a', x: 0, y: 0, owner: 'player', units: 10 },
      { id: 'b', x: 300, y: 400, owner: 'neutral' },
    ] }), 1);
    applyCommand(state, { type: 'link', owner: 'player', from: 'a', to: 'b' });
    run(state, 20); // first unit at 1000 ms, moved 6 px of 500
    expect(state.units.length).toBe(1);
    expect(unitPosition(state, state.units[0]!)).toEqual({ x: 300 * 0.012, y: 400 * 0.012 });
    run(state, 82); // tick 102: 83 moves × 6 px = 498 px, one short
    expect(state.units.length).toBe(5); // spawned at 1, 2, 3, 4, 5 s
    expect(state.towers['b']!.owner).toBe('neutral');
    step(state); // tick 103: 504 px → arrived and captured
    expect(state.units.length).toBe(4);
    expect(state.towers['b']!).toMatchObject({ owner: 'player', units: 1 });
  });

  it('unitPosition interpolates in the travel direction; roadPointAt clamps to the ends', () => {
    const state = createState(makeLevel({
      towers: [
        { id: 'a', x: 0, y: 0, owner: 'player', units: 1 },
        { id: 'b', x: 100, y: 100, owner: 'neutral' },
      ],
    }), 1);
    const fwd = spawn(state, { owner: 'player', from: 'a', to: 'b', progress: 0.25 });
    const back = spawn(state, { owner: 'player', from: 'b', to: 'a', progress: 0.25 });
    expect(unitPosition(state, fwd)).toEqual({ x: 25, y: 25 });
    expect(unitPosition(state, back)).toEqual({ x: 75, y: 75 });
    const road = state.roads['a-b']!;
    expect(roadPointAt(road, -1)).toEqual({ x: 0, y: 0 });
    expect(roadPointAt(road, 2)).toEqual({ x: 100, y: 100 });
  });
});

describe('arrival', () => {
  it('friendly arrivals reinforce, capped at capacity', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 98, level: 3 },
      { id: 'q', x: 360, y: 400, owner: 'player', units: 0 },
    ] }), 1);
    spawn(state, { owner: 'player', from: 'q', to: 'p', progress: 0.995 });
    spawn(state, { owner: 'player', from: 'q', to: 'p', progress: 0.995, weight: 5, kind: 'tank' });
    step(state);
    expect(state.units).toEqual([]);
    expect(state.towers['p']!.units).toBe(100);
    expect(state.towers['p']!.level).toBe(3);
  });

  it('hostile arrivals remove weight; equal weight leaves 0 without a capture', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
      { id: 'e', x: 360, y: 400, owner: 'neutral', units: 3 },
    ] }), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.995 });
    step(state);
    expect(state.towers['e']!.units).toBe(2);
    expect(state.towers['e']!.owner).toBe('neutral');
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.995, weight: 2 });
    step(state);
    expect(state.towers['e']!.units).toBe(0);
    expect(state.towers['e']!.owner).toBe('neutral');
    expect(state.events.filter((e) => e.type === 'capture')).toEqual([]);
  });

  it('captures when damage exceeds the garrison, keeps level, sets remaining weight and emits capture', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 2, level: 3 },
    ] }), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.995, weight: 5, kind: 'tank' });
    step(state);
    const e = state.towers['e']!;
    expect(e.owner).toBe('player');
    expect(e.units).toBe(3);
    expect(e.level).toBe(3);
    expect(state.events).toContainEqual({ type: 'capture', towerId: 'e', by: 'player', from: 'enemy1' });
  });

  it('fortress: 1 defender falls per 2 attacker weight', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
      { id: 'e', x: 360, y: 400, owner: 'neutral', units: 10, kind: 'fortress' },
    ] }), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.995 });
    step(state);
    expect(state.towers['e']!.units).toBe(10);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.995 });
    step(state);
    expect(state.towers['e']!.units).toBe(9);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.995, weight: 5, kind: 'tank' });
    step(state);
    expect(state.towers['e']!.units).toBe(7); // 2.5 → 2, half banked
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.995 });
    step(state);
    expect(state.towers['e']!.units).toBe(6);
  });

  it('fortress capture leaves weight − 2 × defenders attackers', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 1, kind: 'fortress', level: 2 },
    ] }), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.995, weight: 5, kind: 'tank' });
    step(state);
    expect(state.towers['e']!.owner).toBe('player');
    expect(state.towers['e']!.units).toBe(3);
    expect(state.towers['e']!.level).toBe(2);
  });

  it('a tank arriving at an empty hostile fortress keeps its full weight', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
      { id: 'e', x: 360, y: 400, owner: 'neutral', units: 0, kind: 'fortress' },
    ] }), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.995, weight: 5, kind: 'tank' });
    step(state);
    expect(state.towers['e']!.owner).toBe('player');
    expect(state.towers['e']!.units).toBe(5);
  });
});
