import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { run } from './util';

describe('boosters in step', () => {
  it('overdrive triples generation for 10 s for the caster only', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 0, y: 0, owner: 'player', units: 10, level: 3 },
      { id: 'e', x: 100, y: 0, owner: 'enemy1', units: 10, level: 3 },
    ], roads: [] }), 1);
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'overdrive' });
    run(state, 200);
    expect(state.towers['p']!.units).toBe(70); // 60 produced instead of 20
    expect(state.towers['e']!.units).toBe(30);
    expect(state.boosters.length).toBe(1);
    run(state, 200);
    expect(state.boosters).toEqual([]);
    expect(state.towers['p']!.units).toBe(80); // capped
    expect(state.towers['e']!.units).toBe(50);
  });

  it('freeze stops enemy generation for 5 s, not the caster', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 0, y: 0, owner: 'player', units: 10 },
      { id: 'e', x: 100, y: 0, owner: 'enemy1', units: 10 },
      { id: 'f', x: 200, y: 0, owner: 'enemy2', units: 10 },
    ], roads: [] }), 1);
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'freeze' });
    run(state, 100);
    expect(state.towers['p']!.units).toBe(15);
    expect(state.towers['e']!.units).toBe(10);
    expect(state.towers['f']!.units).toBe(10);
    run(state, 19);
    expect(state.towers['e']!.units).toBe(10);
    run(state, 1);
    expect(state.towers['e']!.units).toBe(11);
    expect(state.towers['f']!.units).toBe(11);
  });
});
