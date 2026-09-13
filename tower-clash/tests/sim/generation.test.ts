import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import type { TowerDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { capacityOf } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import { run } from './util';

function solo(over: Partial<TowerDef>) {
  return createState(
    makeLevel({ towers: [{ id: 'p', x: 100, y: 100, owner: 'player', units: 10, ...over }], roads: [] }),
    1,
  );
}

describe('generation', () => {
  it.each([
    [1, 20],
    [2, 14],
    [3, 10],
  ] as const)('barracks level %i produces one unit every %i ticks', (level, ticks) => {
    const state = solo({ level });
    run(state, ticks - 1);
    expect(state.towers['p']!.units).toBe(10);
    run(state, 1);
    expect(state.towers['p']!.units).toBe(11);
    run(state, ticks);
    expect(state.towers['p']!.units).toBe(12);
  });

  it('produces 10 units in 10 s at level 1', () => {
    const state = solo({ level: 1 });
    run(state, 200);
    expect(state.towers['p']!.units).toBe(20);
  });

  it.each([
    [1, 30],
    [2, 50],
    [3, 80],
  ] as const)('barracks level %i caps at %i', (level, cap) => {
    const state = solo({ level, units: cap - 1 });
    expect(capacityOf(state.towers['p']!)).toBe(cap);
    run(state, 400);
    expect(state.towers['p']!.units).toBe(cap);
  });

  it('neutral towers never generate', () => {
    const state = solo({ owner: 'neutral' });
    run(state, 200);
    expect(state.towers['p']!.units).toBe(10);
  });

  it('artillery generates at half rate and caps at 40', () => {
    const state = solo({ kind: 'artillery' });
    expect(capacityOf(state.towers['p']!)).toBe(C.ARTILLERY_CAPACITY);
    run(state, 39);
    expect(state.towers['p']!.units).toBe(10);
    run(state, 1);
    expect(state.towers['p']!.units).toBe(11);
  });

  it('tank factory produces 5 weight every 4 s, capacity 40', () => {
    const state = solo({ kind: 'tankFactory' });
    expect(capacityOf(state.towers['p']!)).toBe(40);
    run(state, 79);
    expect(state.towers['p']!.units).toBe(10);
    run(state, 1);
    expect(state.towers['p']!.units).toBe(15);
    run(state, 80 * 10);
    expect(state.towers['p']!.units).toBe(40);
  });

  it('fortress has 1.5× capacity and generates like a barracks', () => {
    const state = solo({ kind: 'fortress', level: 2, units: 74 });
    expect(capacityOf(state.towers['p']!)).toBe(75);
    run(state, 14);
    expect(state.towers['p']!.units).toBe(75);
    run(state, 100);
    expect(state.towers['p']!.units).toBe(75);
  });
});
