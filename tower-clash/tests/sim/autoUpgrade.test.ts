import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import type { TowerDef } from '../../src/sim/types';
import { DEFAULT_MODIFIERS } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { capacityOf, step } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import { run, spawn } from './util';

/*
 * Rules v2 (GDD §2.0) auto-upgrade: capacity ladder 25 / 50 / 100; a L1/L2 tower whose garrison
 * reaches its capacity gains a level at once and keeps its garrison; L3 clamps at 100; a fortress
 * (×1.5 → 37 / 75) stops at L2; a linked tower never upgrades.
 */

function solo(over: Partial<TowerDef>) {
  return createState(
    makeLevel({ towers: [{ id: 'p', x: 100, y: 100, owner: 'player', units: 10, ...over }], roads: [] }),
    1,
  );
}

const upgrades = (state: ReturnType<typeof solo>) => state.events.filter((e) => e.type === 'upgrade');

describe('constants (GDD §2.0)', () => {
  it('ladder 25 / 50 / 100, auto-upgrade on, links per level 1 / 2 / 3', () => {
    expect(C.CAPACITY).toEqual([0, 25, 50, 100]);
    expect(C.AUTO_UPGRADE).toBe(true);
    expect(C.LINKS_PER_LEVEL).toEqual([0, 1, 2, 3]);
    expect(C.FORTRESS_MAX_LEVEL).toBe(2);
    expect(C.MAX_LEVEL).toBe(3);
  });
});

describe('auto-upgrade', () => {
  it('L1 → L2 the tick the garrison reaches 25: garrison kept, capacity becomes 50, upgrade event', () => {
    const state = solo({ level: 1, units: 24 });
    run(state, 19); // 950 ms: nothing produced yet
    expect(state.towers['p']!.level).toBe(1);
    expect(state.towers['p']!.units).toBe(24);
    step(state); // 1000 ms: 25th unit
    expect(state.towers['p']!.level).toBe(2);
    expect(state.towers['p']!.units).toBe(25);
    expect(capacityOf(state.towers['p']!, state)).toBe(50);
    expect(upgrades(state)).toEqual([{ type: 'upgrade', towerId: 'p', level: 2 }]);
    step(state);
    expect(upgrades(state)).toEqual([]); // emitted once
  });

  it('L2 → L3 at 50 (produced at the L2 rate, 700 ms)', () => {
    const state = solo({ level: 2, units: 49 });
    run(state, 13);
    expect(state.towers['p']!.level).toBe(2);
    step(state); // 700 ms
    expect(state.towers['p']!.level).toBe(3);
    expect(state.towers['p']!.units).toBe(50);
    expect(capacityOf(state.towers['p']!, state)).toBe(100);
    expect(upgrades(state)).toEqual([{ type: 'upgrade', towerId: 'p', level: 3 }]);
  });

  it('L3 is the maximum: clamps at 100, production stops, no event', () => {
    const state = solo({ level: 3, units: 99 });
    step(state);
    run(state, 9); // 500 ms: 100th unit
    expect(state.towers['p']!.units).toBe(100);
    let events = 0;
    for (let i = 0; i < 200; i++) {
      step(state);
      events += upgrades(state).length;
    }
    expect(state.towers['p']!.level).toBe(3);
    expect(state.towers['p']!.units).toBe(100);
    expect(state.towers['p']!.genAccMs).toBe(0);
    expect(events).toBe(0);
  });

  it('a garrison above the max-level capacity is clamped down to it', () => {
    const state = solo({ level: 3, units: 120 });
    step(state);
    expect(state.towers['p']!.units).toBe(100);
  });

  it('fortress: 37 → L2 (cap 75), then clamps at 75 and never reaches L3', () => {
    const f1 = solo({ kind: 'fortress', level: 1, units: 36 });
    expect(capacityOf(f1.towers['p']!, f1)).toBe(37);
    run(f1, 20);
    expect(f1.towers['p']!.level).toBe(2);
    expect(f1.towers['p']!.units).toBe(37);
    expect(capacityOf(f1.towers['p']!, f1)).toBe(75);
    expect(upgrades(f1)).toEqual([{ type: 'upgrade', towerId: 'p', level: 2 }]);

    const f2 = solo({ kind: 'fortress', level: 2, units: 74 });
    run(f2, 14);
    expect(f2.towers['p']!.units).toBe(75);
    run(f2, 200);
    expect(f2.towers['p']!.level).toBe(2);
    expect(f2.towers['p']!.units).toBe(75);
  });

  it.each([
    ['artillery', 25, 50],
    ['tankFactory', 25, 50],
  ] as const)('%s uses the same ladder: L1 cap %i → L2 cap %i', (kind, cap1, cap2) => {
    const state = solo({ kind, level: 1, units: cap1 });
    expect(capacityOf(state.towers['p']!, state)).toBe(cap1);
    step(state);
    expect(state.towers['p']!.level).toBe(2);
    expect(state.towers['p']!.units).toBe(cap1);
    expect(capacityOf(state.towers['p']!, state)).toBe(cap2);
  });

  it('a tank factory reaching 25 weight with a 5-weight tank upgrades too', () => {
    const state = solo({ kind: 'tankFactory', level: 1, units: 20 });
    run(state, 80); // 4000 ms: one tank → 25
    expect(state.towers['p']!.units).toBe(25);
    expect(state.towers['p']!.level).toBe(2);
  });

  it('reinforcements arriving count toward the upgrade (same tick as the arrival)', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 24, level: 1 },
          { id: 'q', x: 360, y: 400, owner: 'player', units: 0, level: 1 },
        ],
        roads: [{ a: 'p', b: 'q' }],
      }),
      1,
    );
    spawn(state, { owner: 'player', from: 'q', to: 'p', progress: 0.995 });
    step(state);
    expect(state.towers['p']!.level).toBe(2);
    expect(state.towers['p']!.units).toBe(25);
    expect(upgrades(state)).toEqual([{ type: 'upgrade', towerId: 'p', level: 2 }]);
  });

  it('the player capacity modifier multiplies the ladder: ×1.25 → upgrade at 31, not 25', () => {
    const state = createState(
      makeLevel({ towers: [{ id: 'p', x: 0, y: 0, owner: 'player', units: 25, level: 1 }], roads: [] }),
      1,
      { ...DEFAULT_MODIFIERS, capacityMul: 1.25 },
    );
    run(state, 100); // 5 s: 30
    expect(state.towers['p']!.level).toBe(1);
    expect(state.towers['p']!.units).toBe(30);
    run(state, 20); // 31
    expect(state.towers['p']!.level).toBe(2);
    expect(state.towers['p']!.units).toBe(31);
    expect(capacityOf(state.towers['p']!, state)).toBe(62);
  });

  it('a start-garrison bonus that fills the tower upgrades it on the first tick, not in createState', () => {
    const state = createState(
      makeLevel({ towers: [{ id: 'p', x: 0, y: 0, owner: 'player', units: 22, level: 1 }], roads: [] }),
      1,
      { ...DEFAULT_MODIFIERS, startGarrisonBonus: 5 },
    );
    expect(state.towers['p']!.units).toBe(25);
    expect(state.towers['p']!.level).toBe(1);
    step(state);
    expect(state.towers['p']!.level).toBe(2);
    expect(state.towers['p']!.units).toBe(25);
  });

  it('neutral towers never upgrade, even when over capacity', () => {
    const state = solo({ owner: 'neutral', level: 1, units: 30 });
    run(state, 100);
    expect(state.towers['p']!.level).toBe(1);
    expect(state.towers['p']!.units).toBe(30);
  });

  it('a linked tower does not upgrade: it drains instead', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 25, level: 1 },
          { id: 'n', x: 360, y: 400, owner: 'neutral', units: 0, level: 1 },
        ],
        roads: [{ a: 'p', b: 'n' }],
      }),
      1,
    );
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'n' });
    step(state);
    expect(state.towers['p']!.level).toBe(1);
    expect(state.towers['p']!.units).toBe(25);
    expect(upgrades(state)).toEqual([]);
    run(state, 2); // 150 ms: first unit leaves
    expect(state.towers['p']!.units).toBe(24);
    expect(state.towers['p']!.level).toBe(1);
  });

  it('the upgrade command does nothing under rules v2', () => {
    const state = solo({ level: 1, units: 20 });
    applyCommand(state, { type: 'upgrade', owner: 'player', towerId: 'p' });
    step(state);
    expect(state.towers['p']!.level).toBe(1);
    expect(state.towers['p']!.units).toBe(20);
  });
});
