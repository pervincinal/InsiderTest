import { describe, expect, it } from 'vitest';
import { makeLevel, wall } from '../helpers';
import type { LevelDef } from '../../src/sim/types';
import { createState, roadIdFor } from '../../src/sim/create';
import { C } from '../../src/sim/constants';

describe('createState', () => {
  it('applies tower defaults (level 1, barracks, 0 units) and starts with empty runtime lists', () => {
    const state = createState(makeLevel({ towers: [{ id: 'p', x: 0, y: 0, owner: 'player' }] }), 1);
    const p = state.towers['p']!;
    expect(p).toEqual({
      id: 'p', x: 0, y: 0, owner: 'player', kind: 'barracks', level: 1, units: 0,
      genAccMs: 0, artilleryCooldownMs: 0, defenceAcc: 0, underFireUntilMs: 0,
    });
    expect(state.time).toBe(0);
    expect(state.seed).toBe(1);
    expect(state.levelId).toBe(999);
    expect(state.roads).toEqual({});
    expect(state.obstacles).toEqual([]);
    expect(state.mines).toEqual([]);
    expect(state.units).toEqual([]);
    expect(state.links).toEqual([]);
    expect(state.boosters).toEqual([]);
  });

  it('builds one straight lane per clear pair: id a-b with a < b, points [a, b], length = distance', () => {
    const state = createState(makeLevel(), 1);
    expect(Object.keys(state.roads)).toEqual(['e-p']);
    expect(state.roads['e-p']).toEqual({
      id: 'e-p', a: 'e', b: 'p', points: [{ x: 360, y: 400 }, { x: 360, y: 1000 }], length: 600, mineHits: [],
    });
    expect(roadIdFor('p', 'e')).toBe('e-p');
    const three = createState(
      makeLevel({
        towers: [
          { id: 'z', x: 0, y: 0, owner: 'player', units: 1 },
          { id: 'a', x: 300, y: 400, owner: 'neutral' },
          { id: 'm', x: 300, y: 0, owner: 'neutral' },
        ],
      }),
      7,
    );
    expect(Object.keys(three.roads).sort()).toEqual(['a-m', 'a-z', 'm-z']);
    expect(three.roads['a-z']!.length).toBe(500);
    expect(three.roads['a-z']!.points).toEqual([{ x: 300, y: 400 }, { x: 0, y: 0 }]);
  });

  it('copies obstacles with defaults applied (wall/water 28, rock 80) and mines with their charges', () => {
    const level = makeLevel({
      obstacles: [
        { kind: 'wall', points: [{ x: 0, y: 700 }, { x: 200, y: 700 }] },
        { kind: 'water', points: [{ x: 0, y: 800 }, { x: 100, y: 820 }, { x: 200, y: 800 }], width: 60 },
        { kind: 'rock', points: [{ x: 100, y: 100 }] },
      ],
      mines: [{ x: 360, y: 700, charges: 3 }],
    });
    const state = createState(level, 1);
    expect(state.obstacles).toEqual([
      { kind: 'wall', points: [{ x: 0, y: 700 }, { x: 200, y: 700 }], width: C.OBSTACLE_WIDTH },
      { kind: 'water', points: [{ x: 0, y: 800 }, { x: 100, y: 820 }, { x: 200, y: 800 }], width: 60 },
      { kind: 'rock', points: [{ x: 100, y: 100 }], width: C.ROCK_RADIUS * 2 },
    ]);
    expect(state.obstacles[0]!.points).not.toBe(level.obstacles![0]!.points);
    expect(state.mines).toEqual([{ x: 360, y: 700, charges: 3 }]);
    expect(state.mines[0]).not.toBe(level.mines![0]);
    expect(state.roads['e-p']!.mineHits).toEqual([{ mine: 0, t: 0.5 }]);
  });

  it('rejects a level that still has a `roads` key (rules v3)', () => {
    const level = { ...makeLevel(), roads: [{ a: 'p', b: 'e' }] } as unknown as LevelDef;
    expect(() => createState(level, 1)).toThrow(/roads are not part of rules v3/);
    const empty = { ...makeLevel(), roads: [] } as unknown as LevelDef;
    expect(() => createState(empty, 1)).toThrow(/roads are not part of rules v3/);
  });

  it('validates obstacles: kind, point count (rock ≥ 1, others ≥ 2), finite coords, positive width', () => {
    const bad = (obstacles: unknown) => () => createState(makeLevel({ obstacles: obstacles as never }), 1);
    expect(bad([{ kind: 'lava', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }])).toThrow(/bad kind/);
    expect(bad([{ kind: 'wall', points: [{ x: 0, y: 0 }] }])).toThrow(/at least 2 point/);
    expect(bad([{ kind: 'water', points: [] }])).toThrow(/at least 2 point/);
    expect(bad([{ kind: 'rock', points: [] }])).toThrow(/at least 1 point/);
    expect(bad([{ kind: 'wall', points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }] }])).toThrow(/bad point/);
    expect(bad([{ kind: 'wall', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], width: 0 }])).toThrow(/bad width/);
    expect(bad([{ kind: 'wall', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], width: -5 }])).toThrow(/bad width/);
    expect(bad('nope')).toThrow(/obstacles must be an array/);
    expect(() => createState(makeLevel({ obstacles: [{ kind: 'rock', points: [{ x: 5, y: 5 }] }] }), 1)).not.toThrow();
  });

  it('validates mines: finite coords, charges a positive integer', () => {
    const bad = (mines: unknown) => () => createState(makeLevel({ mines: mines as never }), 1);
    expect(bad([{ x: 0, y: Number.POSITIVE_INFINITY, charges: 1 }])).toThrow(/bad coordinates/);
    expect(bad([{ x: 0, y: 0, charges: 0 }])).toThrow(/bad charges/);
    expect(bad([{ x: 0, y: 0, charges: 1.5 }])).toThrow(/bad charges/);
    expect(bad([{ x: 0, y: 0, charges: -1 }])).toThrow(/bad charges/);
    expect(bad({})).toThrow(/mines must be an array/);
  });

  it('throws on duplicate tower ids, overlapping towers (< 1 px apart) and ids containing "-"', () => {
    const two = (b: { id: string; x: number; y: number }) =>
      createState(makeLevel({ towers: [{ id: 'p', x: 0, y: 0, owner: 'player' }, { ...b, owner: 'enemy1' }] }), 1);
    expect(() => two({ id: 'p', x: 1, y: 1 })).toThrow(/duplicate tower/);
    expect(() => two({ id: 'q', x: 0.5, y: 0.5 })).toThrow(/overlap/);
    expect(() => two({ id: 'q', x: 1, y: 0 })).not.toThrow();
    expect(() => two({ id: 'a-b', x: 100, y: 0 })).toThrow(/must not contain/);
  });

  it('throws on a fortress above level 2, a bad owner, bad units and bad coordinates', () => {
    expect(() =>
      createState(makeLevel({ towers: [{ id: 'f', x: 0, y: 0, owner: 'player', kind: 'fortress', level: 3 }] }), 1),
    ).toThrow(/fortress/);
    expect(() => createState(makeLevel({ towers: [{ id: 'f', x: 0, y: 0, owner: 'pirate' as 'player' }] }), 1)).toThrow(/owner/);
    expect(() => createState(makeLevel({ towers: [{ id: 'f', x: 0, y: 0, owner: 'player', units: -1 }] }), 1)).toThrow(/bad units/);
    expect(() => createState(makeLevel({ towers: [{ id: 'f', x: Number.NaN, y: 0, owner: 'player' }] }), 1)).toThrow(/coordinates/);
    expect(() => createState(makeLevel({ towers: [] }), 1)).toThrow(/no towers/);
  });

  it('a wall between two towers leaves them without a lane', () => {
    const state = createState(makeLevel({ obstacles: [wall(200, 700, 520, 700)] }), 1);
    expect(state.roads).toEqual({});
  });
});
