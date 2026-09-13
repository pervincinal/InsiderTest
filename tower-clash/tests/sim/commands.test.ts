import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { step } from '../../src/sim/step';
import { run, spawn } from './util';

describe('upgrade', () => {
  it('costs 10 then 20 units and emits an upgrade event', () => {
    const state = createState(makeLevel({ towers: [{ id: 'p', x: 0, y: 0, owner: 'player', units: 30 }], roads: [] }), 1);
    applyCommand(state, { type: 'upgrade', owner: 'player', towerId: 'p' });
    expect(state.towers['p']!.level).toBe(2);
    expect(state.towers['p']!.units).toBe(20);
    expect(state.events).toEqual([{ type: 'upgrade', towerId: 'p', level: 2 }]);
    applyCommand(state, { type: 'upgrade', owner: 'player', towerId: 'p' });
    expect(state.towers['p']!.level).toBe(3);
    expect(state.towers['p']!.units).toBe(0);
  });

  it('is refused when the garrison is below the cost', () => {
    const state = createState(makeLevel({ towers: [{ id: 'p', x: 0, y: 0, owner: 'player', units: 9 }], roads: [] }), 1);
    applyCommand(state, { type: 'upgrade', owner: 'player', towerId: 'p' });
    expect(state.towers['p']!.level).toBe(1);
    expect(state.towers['p']!.units).toBe(9);
    expect(state.events).toEqual([]);
  });

  it('is refused at max level (3) and for a fortress at level 2', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 0, y: 0, owner: 'player', units: 50, level: 3 },
          { id: 'f', x: 0, y: 0, owner: 'player', units: 50, level: 2, kind: 'fortress' },
        ],
        roads: [],
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

  it('ignores upgrades by someone who does not own the tower', () => {
    const state = createState(makeLevel(), 1);
    applyCommand(state, { type: 'upgrade', owner: 'enemy1', towerId: 'p' });
    expect(state.towers['p']!.level).toBe(1);
    expect(state.towers['p']!.units).toBe(10);
  });
});

describe('sendUnits', () => {
  it('sends all units by default: garrison drops immediately and a queue is created', () => {
    const state = createState(makeLevel(), 1);
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e' });
    expect(state.towers['p']!.units).toBe(0);
    expect(state.queues).toEqual([
      { owner: 'player', from: 'p', to: 'e', roadId: 'e-p', remaining: 10, unitKind: 'infantry', nextLeaveMs: 0 },
    ]);
  });

  it('sends floor(units × 0.5) with ratio 0.5', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 7 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 },
    ] }), 1);
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: 0.5 });
    expect(state.towers['p']!.units).toBe(4);
    expect(state.queues[0]!.remaining).toBe(3);
  });

  it('releases one unit every 120 ms at 120 px/s', () => {
    const state = createState(makeLevel(), 1);
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e' });
    step(state); // t=50: first unit leaves
    expect(state.units.length).toBe(1);
    expect(state.units[0]).toMatchObject({ owner: 'player', kind: 'infantry', weight: 1, from: 'p', to: 'e', speed: 120 });
    step(state); // t=100
    expect(state.units.length).toBe(1);
    step(state); // t=150 ≥ 120
    expect(state.units.length).toBe(2);
    run(state, 30);
    expect(state.units.length).toBe(10);
    expect(state.queues).toEqual([]);
  });

  it('tank factories send tanks in weight-5 chunks at 0.7× speed', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 12, kind: 'tankFactory' },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 },
    ] }), 1);
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e' });
    expect(state.towers['p']!.units).toBe(2);
    expect(state.queues[0]).toMatchObject({ remaining: 2, unitKind: 'tank' });
    step(state);
    expect(state.units[0]).toMatchObject({ kind: 'tank', weight: 5, speed: 84 });
  });

  it('ignores sends from towers the owner does not hold, without a road, or with nothing to send', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 },
      { id: 'q', x: 0, y: 0, owner: 'player', units: 0 },
    ] }), 1);
    applyCommand(state, { type: 'sendUnits', owner: 'enemy1', from: 'p', to: 'e' });
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'q' });
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'q', to: 'p' });
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: 0.05 });
    expect(state.queues).toEqual([]);
    expect(state.towers['p']!.units).toBe(10);
  });

  it('is ignored on a cut bridge', () => {
    const state = createState(makeLevel({ roads: [{ a: 'p', b: 'e', kind: 'bridge' }] }), 1);
    applyCommand(state, { type: 'cutBridge', owner: 'player', roadId: 'e-p' });
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e' });
    expect(state.queues).toEqual([]);
    expect(state.towers['p']!.units).toBe(10);
  });
});

describe('cutBridge', () => {
  it('kills units in transit, marks the road cut and emits events', () => {
    const state = createState(makeLevel({ roads: [{ a: 'p', b: 'e', kind: 'bridge' }] }), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.5 });
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.25 });
    applyCommand(state, { type: 'cutBridge', owner: 'player', roadId: 'e-p' });
    expect(state.roads['e-p']!.cut).toBe(true);
    expect(state.units).toEqual([]);
    expect(state.events).toEqual([
      { type: 'unitDied', x: 360, y: 700, owner: 'player', cause: 'bridge' },
      { type: 'unitDied', x: 360, y: 550, owner: 'enemy1', cause: 'bridge' },
      { type: 'bridgeCut', roadId: 'e-p' },
    ]);
  });

  it('is ignored for plain roads, non-endpoint owners and already-cut bridges', () => {
    const plain = createState(makeLevel(), 1);
    applyCommand(plain, { type: 'cutBridge', owner: 'player', roadId: 'e-p' });
    expect(plain.roads['e-p']!.cut).toBe(false);

    const bridge = createState(makeLevel({ roads: [{ a: 'p', b: 'e', kind: 'bridge' }] }), 1);
    applyCommand(bridge, { type: 'cutBridge', owner: 'enemy2', roadId: 'e-p' });
    expect(bridge.roads['e-p']!.cut).toBe(false);
    applyCommand(bridge, { type: 'cutBridge', owner: 'enemy1', roadId: 'e-p' });
    expect(bridge.roads['e-p']!.cut).toBe(true);
    applyCommand(bridge, { type: 'cutBridge', owner: 'player', roadId: 'e-p' });
    expect(bridge.events.filter((e) => e.type === 'bridgeCut').length).toBe(1);
  });
});

describe('boosters', () => {
  it('airstrike removes 10 units from an enemy tower, never below 0, and ignores own/neutral towers', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 0, y: 0, owner: 'player', units: 10 },
      { id: 'e', x: 100, y: 0, owner: 'enemy1', units: 14 },
      { id: 'n', x: 200, y: 0, owner: 'neutral', units: 14 },
    ], roads: [] }), 1);
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
