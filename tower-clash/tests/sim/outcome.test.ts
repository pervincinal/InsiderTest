import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { getOutcome } from '../../src/sim/outcome';
import { step } from '../../src/sim/step';
import { spawn } from './util';

describe('outcome', () => {
  it('is playing while an enemy tower exists', () => {
    expect(getOutcome(createState(makeLevel(), 1))).toBe('playing');
  });

  it('won once the last enemy tower is captured and no enemy unit or queue remains; event emitted once', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 0 },
    ] }), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.995 });
    step(state);
    expect(getOutcome(state)).toBe('won');
    expect(state.events).toContainEqual({ type: 'won', timeMs: 50 });
    step(state);
    expect(state.events.filter((e) => e.type === 'won')).toEqual([]);
  });

  it('is still playing while enemy units are in transit; links alone do not count', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
      { id: 'e', x: 360, y: 400, owner: 'neutral', units: 0 },
    ] }), 1);
    expect(getOutcome(state)).toBe('won');
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.5 });
    expect(getOutcome(state)).toBe('playing');
    state.units = [];
    expect(getOutcome(state)).toBe('won');
    state.links.push({ owner: 'enemy1', from: 'e', to: 'p', roadId: 'e-p', createdMs: 0, emitAccMs: 0 });
    expect(getOutcome(state)).toBe('won');
  });

  it('lost when the player owns nothing and has nothing in transit; event emitted once', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 0 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 },
    ] }), 1);
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.995 });
    step(state);
    expect(state.towers['p']!.owner).toBe('enemy1');
    expect(getOutcome(state)).toBe('lost');
    expect(state.events).toContainEqual({ type: 'lost', timeMs: 50 });
    step(state);
    expect(state.events.filter((e) => e.type === 'lost')).toEqual([]);
  });

  it('a player with only units in transit has not lost yet', () => {
    const state = createState(makeLevel({ towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 1 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 0 },
    ] }), 1);
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.5 });
    state.towers['p']!.owner = 'enemy1';
    expect(getOutcome(state)).toBe('playing');
  });
});
