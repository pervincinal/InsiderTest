import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { step } from '../../src/sim/step';
import { run } from './util';

describe('upgrade (rules v2: validated and ignored)', () => {
  it('does not change level or garrison and emits no event, even when the old cost is affordable', () => {
    const state = createState(makeLevel({ towers: [{ id: 'p', x: 0, y: 0, owner: 'player', units: 20 }]}), 1);
    applyCommand(state, { type: 'upgrade', owner: 'player', towerId: 'p' });
    expect(state.towers['p']!.level).toBe(1);
    expect(state.towers['p']!.units).toBe(20);
    expect(state.events).toEqual([]);
  });

  it('is ignored for a fortress at level 2 and a barracks at level 3', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 0, y: 0, owner: 'player', units: 50, level: 3 },
          { id: 'f', x: 300, y: 0, owner: 'player', units: 50, level: 2, kind: 'fortress' },
        ],
      }),
      1,
    );
    applyCommand(state, { type: 'upgrade', owner: 'player', towerId: 'p' });
    applyCommand(state, { type: 'upgrade', owner: 'player', towerId: 'f' });
    expect(state.towers['p']!.level).toBe(3);
    expect(state.towers['p']!.units).toBe(50);
    expect(state.towers['f']!.level).toBe(2);
    expect(state.towers['f']!.units).toBe(50);
  });

  it('ignores upgrades by someone who does not own the tower or for an unknown tower (never throws)', () => {
    const state = createState(makeLevel(), 1);
    applyCommand(state, { type: 'upgrade', owner: 'enemy1', towerId: 'p' });
    applyCommand(state, { type: 'upgrade', owner: 'player', towerId: 'nope' });
    expect(state.towers['p']!.level).toBe(1);
    expect(state.towers['p']!.units).toBe(10);
    expect(state.events).toEqual([]);
  });
});

describe('legacy commands (rules v3)', () => {
  it('sendUnits is accepted and ignored: nothing leaves, no unit, no event', () => {
    const state = createState(makeLevel(), 1);
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e' });
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: 0.5 });
    expect(state.towers['p']!.units).toBe(10);
    expect(state.units).toEqual([]);
    expect(state.links).toEqual([]);
    expect(state.events).toEqual([]);
    step(state);
    expect(state.units).toEqual([]);
  });

  it('an empty tower cannot open a stream (rules v3 rule 6: a stream needs soldiers)', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 0 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 },
    ]}), 1);
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    expect(state.links).toEqual([]);
    expect(state.events).toEqual([]);
    state.towers['p']!.units = 1;
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    expect(state.links).toHaveLength(1);
  });

  it('a neutral-owner command is ignored', () => {
    const state = createState(makeLevel(), 1);
    applyCommand(state, { type: 'link', owner: 'neutral', from: 'p', to: 'e' });
    applyCommand(state, { type: 'booster', owner: 'neutral', booster: 'airstrike', towerId: 'e' });
    expect(state.links).toEqual([]);
    expect(state.towers['e']!.units).toBe(10);
  });
});

describe('boosters', () => {
  it('airstrike removes 10 units from an enemy tower, never below 0, and ignores own/neutral towers', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 0, y: 0, owner: 'player', units: 10 },
      { id: 'e', x: 100, y: 0, owner: 'enemy1', units: 14 },
      { id: 'n', x: 200, y: 0, owner: 'neutral', units: 14 },
    ]}), 1);
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'airstrike', towerId: 'e' });
    expect(state.towers['e']!.units).toBe(4);
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'airstrike', towerId: 'e' });
    expect(state.towers['e']!.units).toBe(0);
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'airstrike', towerId: 'p' });
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'airstrike', towerId: 'n' });
    expect(state.towers['p']!.units).toBe(10);
    expect(state.towers['n']!.units).toBe(14);
  });

  it('overdrive and freeze push timed boosters', () => {
    const state = createState(makeLevel(), 1);
    run(state, 2);
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'overdrive' });
    applyCommand(state, { type: 'booster', owner: 'player', booster: 'freeze' });
    expect(state.boosters).toEqual([
      { type: 'overdrive', owner: 'player', untilMs: 10_100 },
      { type: 'freeze', owner: 'player', untilMs: 5_100 },
    ]);
  });
});
