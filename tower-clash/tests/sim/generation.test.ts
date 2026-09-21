import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import type { TowerDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { capacityOf } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import { run } from './util';

function solo(over: Partial<TowerDef>) {
  return createState(
    makeLevel({ towers: [{ id: 'p', x: 100, y: 100, owner: 'player', units: 10, ...over }]}),
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
    [1, 25],
    [2, 50],
    [3, 100],
  ] as const)('barracks level %i has capacity %i (rules v2 ladder)', (level, cap) => {
    const state = solo({ level, units: 0 });
    expect(capacityOf(state.towers['p']!)).toBe(cap);
    expect(C.CAPACITY[level]).toBe(cap);
  });

  it('level 3 clamps at 100 and stops producing (auto-upgrade tests live in autoUpgrade.test.ts)', () => {
    const state = solo({ level: 3, units: 99 });
    run(state, 400);
    expect(state.towers['p']!.units).toBe(100);
    expect(state.towers['p']!.level).toBe(3);
    expect(state.towers['p']!.genAccMs).toBe(0);
  });

  it('neutral towers never generate', () => {
    const state = solo({ owner: 'neutral' });
    run(state, 200);
    expect(state.towers['p']!.units).toBe(10);
  });

  it('artillery generates at half rate and uses the 25 / 50 / 100 ladder', () => {
    const state = solo({ kind: 'artillery' });
    expect(capacityOf(state.towers['p']!)).toBe(25);
    expect(capacityOf({ ...state.towers['p']!, level: 3 })).toBe(100);
    run(state, 39);
    expect(state.towers['p']!.units).toBe(10);
    run(state, 1);
    expect(state.towers['p']!.units).toBe(11);
  });

  it.each([
    [1, 80],
    [2, 56],
    [3, 40],
  ] as const)('tank factory L%i produces 5 weight every %i ticks (TANK_GEN_MS 4000 / 2800 / 2000, rules v3)', (level, ticks) => {
    const state = solo({ kind: 'tankFactory', level });
    run(state, ticks - 1);
    expect(state.towers['p']!.units).toBe(10);
    run(state, 1);
    expect(state.towers['p']!.units).toBe(15);
    expect(C.TANK_GEN_MS).toEqual([0, 4000, 2800, 2000]);
  });

  it('tank factory uses the ladder (L1 cap 25; L3 clamps at 100 weight)', () => {
    const state = solo({ kind: 'tankFactory' });
    expect(capacityOf(state.towers['p']!)).toBe(25);
    const l3 = solo({ kind: 'tankFactory', level: 3, units: 95 });
    expect(capacityOf(l3.towers['p']!)).toBe(100);
    run(l3, 40 * 3);
    expect(l3.towers['p']!.units).toBe(100);
    expect(l3.towers['p']!.level).toBe(3);
  });

  it('a linked tower does not accumulate production (rules v3 rule 5); it resumes where it paused once unlinked', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
          { id: 'n', x: 360, y: 760, owner: 'neutral', units: 0 },
        ],
      }),
      1,
    );
    run(state, 10); // 500 ms accumulated
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'n' });
    run(state, 100); // 5 s linked: nothing produced, garrison untouched by the stream
    expect(state.towers['p']!.units).toBe(10);
    expect(state.towers['p']!.genAccMs).toBe(500);
    applyCommand(state, { type: 'unlink', owner: 'player', from: 'p' });
    run(state, 9); // 950 ms
    expect(state.towers['p']!.units).toBe(10);
    run(state, 1); // 1000 ms
    expect(state.towers['p']!.units).toBe(11);
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
