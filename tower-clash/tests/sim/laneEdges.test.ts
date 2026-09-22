import { describe, expect, it } from 'vitest';
import { makeLevel, wall } from '../helpers';
import type { LevelDef, ObstacleDef, TowerDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { buildLanes, laneClear, obstacleFromDef, roadIdFor } from '../../src/sim/geometry';
import { C } from '../../src/sim/constants';
import { loadAllLevels } from '../../src/levels/index';

/*
 * QA bug hunt 2026-09-22, item 5: lane geometry at its edges (GDD §2.0b rules 1–2) — the 48 px tower
 * block on the boundary, tiny obstacle widths, a two-point rock, obstacles at / beyond the map edge, the
 * symmetry of `buildLanes` and the absence of self-lanes.
 */

const towers = (...list: TowerDef[]) => list;
const at = (id: string, x: number, y: number, owner: TowerDef['owner'] = 'neutral'): TowerDef => ({ id, x, y, owner, units: 0 });

describe('the 48 px tower block on its boundary', () => {
  it('a third tower exactly 48 px from the a–b segment (axis-aligned, exact in binary) does not block; 47.999 does', () => {
    const level = (dy: number): LevelDef => makeLevel({ towers: towers(at('a', 100, 100, 'player'), at('b', 300, 100, 'enemy1'), at('c', 200, 100 + dy)) });
    expect(Object.keys(createState(level(48), 1).roads).sort()).toEqual(['a-b', 'a-c', 'b-c']);
    expect(Object.keys(createState(level(47.999), 1).roads).sort()).toEqual(['a-c', 'b-c']);
    expect(Object.keys(createState(level(-48), 1).roads).sort()).toEqual(['a-b', 'a-c', 'b-c']);
    expect(C.TOWER_BLOCK_RADIUS).toBe(48);
  });

  it('on a diagonal the boundary is decided by floating point, but identically for a–b, b–a and every tower order', () => {
    // (111.6, 228.8) is 48.000000000000014 px from (0,0)–(300,400): not blocked, whichever way it is asked
    const a = at('a', 0, 0, 'player');
    const b = at('b', 300, 400, 'enemy1');
    const c = at('c', 111.6, 228.8);
    const obstacles: never[] = [];
    expect(laneClear([a, b, c], obstacles, a, b)).toBe(laneClear([c, b, a], obstacles, b, a));
    expect(Object.keys(buildLanes([a, b, c], obstacles, [])).includes('a-b')).toBe(Object.keys(buildLanes([c, b, a], obstacles, [])).includes('a-b'));
    expect(laneClear([a, b, c], obstacles, a, b)).toBe(true);
  });

  it('two towers each exactly 48 px from a third: both lanes through it are open, the pair 96 px apart is open too', () => {
    const level = makeLevel({ towers: towers(at('a', 100, 100, 'player'), at('b', 300, 100, 'enemy1'), at('u', 200, 148), at('d', 200, 52)) });
    const roads = Object.keys(createState(level, 1).roads).sort();
    expect(roads).toContain('a-b');
    expect(roads).toContain('d-u'); // d–u passes 100 px from a and b
    expect(roads).toHaveLength(6);
  });
});

describe('obstacle widths and shapes', () => {
  const pair = (obstacles: ObstacleDef[]): string[] => Object.keys(createState(makeLevel({ obstacles }), 1).roads); // p (360,1000) – e (360,400)

  it('a wall of width 0.5 crossing the lane blocks it; a parallel one 0.3 px beside the lane (half width 0.25) does not', () => {
    expect(pair([wall(300, 700, 420, 700, 0.5)])).toEqual([]);
    expect(pair([wall(360.3, 500, 360.3, 900, 0.5)])).toEqual(['e-p']);
    expect(pair([wall(360.26, 500, 360.26, 900, 0.5)])).toEqual(['e-p']);
    expect(pair([wall(360.24, 500, 360.24, 900, 0.5)])).toEqual([]);
  });

  it('inclusive on the boundary: a wall whose half width equals the distance blocks; a hair further it does not', () => {
    expect(pair([wall(200, 700, 300, 700, 120)])).toEqual([]); // ends 60 px from the lane, half width 60 → blocked (≤)
    expect(pair([wall(200, 700, 299, 700, 120)])).toEqual(['e-p']); // 61 px
    expect(pair([wall(200, 700, 300, 700, 119.99)])).toEqual(['e-p']);
  });

  it('a two-point rock is a polyline rock: default width 80 (ROCK_RADIUS × 2, a chain of boulders as the renderer draws it)', () => {
    expect(obstacleFromDef({ kind: 'rock', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }).width).toBe(80);
    expect(obstacleFromDef({ kind: 'rock', points: [{ x: 0, y: 0 }] }).width).toBe(80);
    expect(obstacleFromDef({ kind: 'wall', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }).width).toBe(28);
    // 40 px beside the lane blocks (inclusive), 41 does not
    expect(pair([{ kind: 'rock', points: [{ x: 200, y: 700 }, { x: 320, y: 700 }] }])).toEqual([]);
    expect(pair([{ kind: 'rock', points: [{ x: 200, y: 700 }, { x: 319, y: 700 }] }])).toEqual(['e-p']);
    expect(pair([{ kind: 'rock', points: [{ x: 200, y: 700 }, { x: 320, y: 700 }], width: 28 }])).toEqual(['e-p']);
  });

  it('obstacles touching or crossing the map edge are plain geometry to the sim (the validator owns the bounds)', () => {
    expect(pair([wall(-100, 700, 800, 700)])).toEqual([]);
    expect(pair([wall(0, 700, 360, 700)])).toEqual([]); // ends exactly on the lane
    expect(pair([wall(-500, 700, -1, 700)])).toEqual(['e-p']); // entirely outside: blocks nothing
    expect(pair([{ kind: 'rock', points: [{ x: 720, y: 700 }] }])).toEqual(['e-p']);
    expect(pair([{ kind: 'rock', points: [{ x: 720, y: 700 }], width: 800 }])).toEqual([]);
  });
});

describe('buildLanes symmetry and ids', () => {
  it('roadIdFor is order independent and ids never contain a self pair', () => {
    expect(roadIdFor('keep', 'a')).toBe('a-keep');
    expect(roadIdFor('a', 'keep')).toBe('a-keep');
    expect(roadIdFor('b', 'a')).toBe(roadIdFor('a', 'b'));
  });

  it('the same towers in reverse order build identical lanes (ids, a/b, points, lengths, mine fractions)', () => {
    const list = [at('p', 360, 1000, 'player'), at('e', 360, 400, 'enemy1'), at('n', 100, 700), at('q', 620, 700), at('k', 360, 700)];
    const mines = [{ x: 230, y: 850, charges: 2 }, { x: 490, y: 550, charges: 1 }];
    const obstacles = [obstacleFromDef(wall(0, 250, 200, 250))];
    const forward = buildLanes(list, obstacles, mines);
    const reverse = buildLanes([...list].reverse(), obstacles, mines);
    expect(Object.keys(forward).sort()).toEqual(Object.keys(reverse).sort());
    for (const id of Object.keys(forward)) expect(reverse[id]).toEqual(forward[id]);
    const viaState = createState(makeLevel({ towers: [...list].reverse(), mines, obstacles: [wall(0, 250, 200, 250)] }), 1).roads;
    expect(viaState).toEqual(forward);
  });

  it('no lane joins a tower to itself and every id is the canonical pair, on every shipped level', async () => {
    const levels = await loadAllLevels();
    expect(levels.length).toBe(50);
    for (const level of levels) {
      const state = createState(level, 1);
      for (const [id, road] of Object.entries(state.roads)) {
        expect(road.a).not.toBe(road.b);
        expect(road.a < road.b).toBe(true);
        expect(id).toBe(roadIdFor(road.a, road.b));
        expect(road.points).toHaveLength(2);
        expect(road.length).toBeGreaterThan(0);
        for (const h of road.mineHits) {
          expect(h.t).toBeGreaterThan(0);
          expect(h.t).toBeLessThan(1);
          expect(state.mines[h.mine]).toBeDefined();
        }
      }
    }
  });
});
