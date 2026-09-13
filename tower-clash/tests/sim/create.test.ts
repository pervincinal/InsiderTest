import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState, roadIdFor } from '../../src/sim/create';

describe('createState', () => {
  it('applies tower defaults (level 1, barracks, 0 units)', () => {
    const state = createState(makeLevel({ towers: [{ id: 'p', x: 0, y: 0, owner: 'player' }], roads: [] }), 1);
    const p = state.towers['p']!;
    expect(p.level).toBe(1);
    expect(p.kind).toBe('barracks');
    expect(p.units).toBe(0);
    expect(p.genAccMs).toBe(0);
    expect(state.time).toBe(0);
    expect(state.seed).toBe(1);
    expect(state.levelId).toBe(999);
  });

  it('normalises road id, endpoints and points (a < b, a → waypoints → b) and computes length', () => {
    const level = makeLevel({
      towers: [
        { id: 'z', x: 0, y: 0, owner: 'player', units: 1 },
        { id: 'a', x: 300, y: 400, owner: 'neutral' },
      ],
      roads: [{ a: 'z', b: 'a', waypoints: [{ x: 300, y: 0 }] }],
    });
    const state = createState(level, 7);
    expect(Object.keys(state.roads)).toEqual(['a-z']);
    const road = state.roads['a-z']!;
    expect(road.a).toBe('a');
    expect(road.b).toBe('z');
    expect(road.points).toEqual([
      { x: 300, y: 400 },
      { x: 300, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(road.length).toBe(700);
    expect(road.kind).toBe('road');
    expect(road.mine).toBe(0);
    expect(road.barrier).toBe(0);
    expect(road.cut).toBe(false);
    expect(roadIdFor('z', 'a')).toBe('a-z');
  });

  it('straight road length is the euclidean distance', () => {
    const state = createState(makeLevel(), 1);
    expect(state.roads['e-p']!.length).toBe(600);
  });

  it('initialises mine and barrier from the definition', () => {
    const state = createState(makeLevel({ roads: [{ a: 'p', b: 'e', kind: 'bridge', mine: 3, barrier: 4 }] }), 1);
    const road = state.roads['e-p']!;
    expect(road.kind).toBe('bridge');
    expect(road.mine).toBe(3);
    expect(road.barrier).toBe(4);
  });

  it('throws on roads referencing unknown towers', () => {
    expect(() => createState(makeLevel({ roads: [{ a: 'p', b: 'nope' }] }), 1)).toThrow(/unknown tower/);
  });

  it('throws on duplicate tower ids and duplicate roads', () => {
    expect(() =>
      createState(
        makeLevel({
          towers: [
            { id: 'p', x: 0, y: 0, owner: 'player' },
            { id: 'p', x: 1, y: 1, owner: 'enemy1' },
          ],
          roads: [],
        }),
        1,
      ),
    ).toThrow(/duplicate tower/);
    expect(() =>
      createState(
        makeLevel({
          roads: [
            { a: 'p', b: 'e' },
            { a: 'e', b: 'p' },
          ],
        }),
        1,
      ),
    ).toThrow(/duplicate road/);
  });

  it('throws on a fortress above level 2 and on a bad owner', () => {
    expect(() =>
      createState(makeLevel({ towers: [{ id: 'f', x: 0, y: 0, owner: 'player', kind: 'fortress', level: 3 }], roads: [] }), 1),
    ).toThrow(/fortress/);
    expect(() =>
      createState(makeLevel({ towers: [{ id: 'f', x: 0, y: 0, owner: 'pirate' as 'player' }], roads: [] }), 1),
    ).toThrow(/owner/);
  });
});
