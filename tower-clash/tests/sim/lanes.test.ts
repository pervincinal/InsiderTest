import { describe, expect, it } from 'vitest';
import { makeLevel, wall } from '../helpers';
import type { Obstacle, TowerDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { C } from '../../src/sim/constants';
import {
  buildLanes,
  defaultObstacleWidth,
  distPointSegment,
  distSegmentSegment,
  laneClear,
  mineHitsOn,
  obstacleBlocks,
  obstacleFromDef,
  projectFraction,
  segmentsIntersect,
} from '../../src/sim/geometry';

/*
 * Rules v3 (GDD §2.0b) lane geometry: every clear tower pair is a straight lane; a lane is blocked by an
 * obstacle within width / 2 of the segment or by a third tower closer than TOWER_BLOCK_RADIUS.
 */

const P = (x: number, y: number) => ({ x, y });

describe('constants (GDD §2.0b)', () => {
  it('TOWER_BLOCK_RADIUS 48, OBSTACLE_WIDTH 28, ROCK_RADIUS 40, MINE_RADIUS 30; no LEAVE_INTERVAL_MS', () => {
    expect(C.TOWER_BLOCK_RADIUS).toBe(48);
    expect(C.OBSTACLE_WIDTH).toBe(28);
    expect(C.ROCK_RADIUS).toBe(40);
    expect(C.MINE_RADIUS).toBe(30);
    expect('LEAVE_INTERVAL_MS' in C).toBe(false);
    expect(defaultObstacleWidth('wall')).toBe(28);
    expect(defaultObstacleWidth('water')).toBe(28);
    expect(defaultObstacleWidth('rock')).toBe(80);
  });
});

describe('primitives', () => {
  it('distPointSegment: interior projection, clamped ends, degenerate segment', () => {
    expect(distPointSegment(P(50, 30), P(0, 0), P(100, 0))).toBe(30);
    expect(distPointSegment(P(-40, 30), P(0, 0), P(100, 0))).toBe(50); // beyond a: distance to a
    expect(distPointSegment(P(130, -40), P(0, 0), P(100, 0))).toBe(50); // beyond b
    expect(distPointSegment(P(3, 4), P(0, 0), P(0, 0))).toBe(5); // point segment
    expect(projectFraction(P(25, 99), P(0, 0), P(100, 0))).toBe(0.25);
    expect(projectFraction(P(1, 1), P(5, 5), P(5, 5))).toBe(0);
  });

  it('segmentsIntersect: proper crossing, touching, collinear overlap, disjoint', () => {
    expect(segmentsIntersect(P(0, 0), P(10, 10), P(0, 10), P(10, 0))).toBe(true);
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(5, 0), P(5, 5))).toBe(true); // T-touch
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(5, 0), P(20, 0))).toBe(true); // collinear overlap
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(11, 0), P(20, 0))).toBe(false); // collinear gap
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(0, 1), P(10, 1))).toBe(false); // parallel
    expect(segmentsIntersect(P(0, 0), P(0, 0), P(0, 0), P(5, 5))).toBe(true); // degenerate on segment
  });

  it('distSegmentSegment: 0 when crossing, otherwise the nearest endpoint distance (degenerate ok)', () => {
    expect(distSegmentSegment(P(0, 0), P(10, 10), P(0, 10), P(10, 0))).toBe(0);
    expect(distSegmentSegment(P(0, 0), P(10, 0), P(0, 7), P(10, 7))).toBe(7); // parallel
    expect(distSegmentSegment(P(0, 0), P(10, 0), P(13, 4), P(20, 4))).toBe(5); // endpoint to endpoint
    expect(distSegmentSegment(P(0, 0), P(10, 0), P(5, 3), P(5, 8))).toBe(3); // endpoint to interior
    expect(distSegmentSegment(P(0, 0), P(0, 0), P(3, 4), P(3, 4))).toBe(5); // two points
    expect(distSegmentSegment(P(2, 2), P(2, 2), P(0, 0), P(10, 0))).toBe(2); // point vs segment
  });
});

describe('obstacleBlocks', () => {
  const lane: [{ x: number; y: number }, { x: number; y: number }] = [P(0, 0), P(200, 0)];

  it('a wall polyline blocks when any of its segments comes within width / 2 (inclusive)', () => {
    const w = obstacleFromDef({ kind: 'wall', points: [P(100, -50), P(100, 50)] });
    expect(obstacleBlocks(w, ...lane)).toBe(true); // crosses
    const near = obstacleFromDef({ kind: 'wall', points: [P(0, 14), P(200, 14)] }); // exactly 14 = 28 / 2
    expect(obstacleBlocks(near, ...lane)).toBe(true);
    const far = obstacleFromDef({ kind: 'wall', points: [P(0, 14.01), P(200, 14.01)] });
    expect(obstacleBlocks(far, ...lane)).toBe(false);
    const bent = obstacleFromDef({ kind: 'wall', points: [P(-50, 100), P(50, 100), P(150, 5)] }); // last segment ends 5 px away
    expect(obstacleBlocks(bent, ...lane)).toBe(true);
    const wide = obstacleFromDef({ kind: 'water', points: [P(0, 40), P(200, 40)], width: 80 });
    expect(obstacleBlocks(wide, ...lane)).toBe(true);
  });

  it('a single-point rock is a disc of radius width / 2 (default 40)', () => {
    const rock = obstacleFromDef({ kind: 'rock', points: [P(100, 40)] });
    expect(rock.width).toBe(80);
    expect(obstacleBlocks(rock, ...lane)).toBe(true);
    expect(obstacleBlocks({ ...rock, points: [P(100, 40.5)] }, ...lane)).toBe(false);
    expect(obstacleBlocks({ ...rock, points: [P(240, 0)] }, ...lane)).toBe(true); // 40 beyond the end
    expect(obstacleBlocks({ ...rock, points: [P(241, 0)] }, ...lane)).toBe(false);
    const small = obstacleFromDef({ kind: 'rock', points: [P(100, 20)], width: 30 });
    expect(obstacleBlocks(small, ...lane)).toBe(false);
  });
});

describe('laneClear and buildLanes', () => {
  const towers = (third: { x: number; y: number }) => [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 0, y: 240 },
    { id: 'c', ...third },
  ];
  const a = { id: 'a', x: 0, y: 0 };
  const b = { id: 'b', x: 0, y: 240 };

  it('acceptance 1(b): a third tower within 48 px of the segment blocks; at exactly 48 or 49 px it does not', () => {
    expect(laneClear(towers(P(47.9, 120)), [], a, b)).toBe(false);
    expect(laneClear(towers(P(0, 120)), [], a, b)).toBe(false);
    expect(laneClear(towers(P(48, 120)), [], a, b)).toBe(true);
    expect(laneClear(towers(P(49, 120)), [], a, b)).toBe(true);
    expect(laneClear(towers(P(-47, 230)), [], a, b)).toBe(false); // near the b end
    expect(laneClear(towers(P(0, 287)), [], a, b)).toBe(false); // 47 px past b: the closed segment's end is that close
    expect(laneClear(towers(P(0, 289)), [], a, b)).toBe(true); // 49 px past b
    expect(laneClear(towers(P(0, 289)), [], a, { id: 'c', x: 0, y: 289 })).toBe(false); // b itself in the way of a–c
    expect(laneClear([a, b], [], a, a)).toBe(false);
  });

  it('any obstacle blocks; obstacles far away do not', () => {
    const across: Obstacle = { kind: 'wall', points: [P(-50, 120), P(50, 120)], width: 28 };
    const beside: Obstacle = { kind: 'wall', points: [P(30, 0), P(30, 240)], width: 28 };
    expect(laneClear([a, b], [across], a, b)).toBe(false);
    expect(laneClear([a, b], [beside], a, b)).toBe(true);
    expect(laneClear([a, b], [beside, across], a, b)).toBe(false);
  });

  it('buildLanes: one Road per clear pair, a < b, straight points, length, sorted mine hits', () => {
    const list = [
      { id: 'p', x: 0, y: 0 },
      { id: 'e', x: 0, y: 240 },
      { id: 'n', x: 300, y: 0 },
    ];
    const rock: Obstacle = { kind: 'rock', points: [P(150, 0)], width: 80 }; // blocks p–n
    const mines = [
      { x: 0, y: 60, charges: 1 }, // on e-p, 180 px from e: t = 0.75
      { x: 40, y: 60, charges: 2 }, // 40 px off: not on e-p
      { x: 20, y: 180, charges: 1 }, // 20 px off e-p, 60 px from e: t = 0.25
    ];
    const roads = buildLanes(list, [rock], mines);
    expect(Object.keys(roads)).toEqual(['e-p', 'e-n']);
    expect(roads['e-p']).toMatchObject({ a: 'e', b: 'p', points: [P(0, 240), P(0, 0)], length: 240 });
    expect(roads['e-p']!.mineHits).toEqual([
      { mine: 2, t: 0.25 },
      { mine: 0, t: 0.75 },
    ]);
    expect(roads['e-n']!.length).toBeCloseTo(Math.hypot(300, 240), 9);
    expect(roads['e-n']!.mineHits).toEqual([]);
    expect(buildLanes(list, [], [])['n-p']).toMatchObject({ a: 'n', b: 'p', length: 300, mineHits: [] });
  });

  it('mineHitsOn: within 30 px inclusive, t clamped strictly inside (0, 1), sorted by t then index', () => {
    const hits = mineHitsOn(
      [
        { x: 100, y: 30, charges: 1 },
        { x: 100, y: 30.01, charges: 1 },
        { x: -10, y: 0, charges: 1 }, // before a: t clamps just above 0
        { x: 250, y: 0, charges: 1 }, // 50 beyond b: too far
        { x: 210, y: 0, charges: 1 }, // 10 beyond b: t clamps just below 1
      ],
      P(0, 0),
      P(200, 0),
    );
    expect(hits.map((h) => h.mine)).toEqual([2, 0, 4]);
    expect(hits[0]!.t).toBeGreaterThan(0);
    expect(hits[0]!.t).toBeLessThan(0.001);
    expect(hits[1]!.t).toBe(0.5);
    expect(hits[2]!.t).toBeLessThan(1);
    expect(hits[2]!.t).toBeGreaterThan(0.999);
  });
});

describe('createState lanes (acceptance 1(a))', () => {
  const two: TowerDef[] = [
    { id: 'p', x: 360, y: 1000, owner: 'player', units: 25 },
    { id: 'n', x: 360, y: 760, owner: 'neutral', units: 10 },
  ];

  it('two towers with a wall between: no lane, `link` ignored; wall removed: a straight lane of length = distance', () => {
    const walled = createState(makeLevel({ towers: two, obstacles: [wall(200, 880, 520, 880)] }), 1);
    expect(walled.roads).toEqual({});
    applyCommand(walled, { type: 'link', owner: 'player', from: 'p', to: 'n' });
    expect(walled.links).toEqual([]);
    expect(walled.events).toEqual([]);

    const open = createState(makeLevel({ towers: two }), 1);
    expect(open.roads['n-p']).toEqual({
      id: 'n-p', a: 'n', b: 'p', points: [P(360, 760), P(360, 1000)], length: 240, mineHits: [],
    });
    applyCommand(open, { type: 'link', owner: 'player', from: 'p', to: 'n' });
    expect(open.links).toEqual([{ owner: 'player', from: 'p', to: 'n', roadId: 'n-p', createdMs: 0, emitAccMs: 0 }]);
  });

  it('a third tower on the segment blocks that pair but joins both ends; the lane graph is otherwise complete', () => {
    const state = createState(
      makeLevel({
        towers: [...two, { id: 'm', x: 380, y: 880, owner: 'neutral' }], // 20 px off the p–n line
      }),
      1,
    );
    expect(Object.keys(state.roads).sort()).toEqual(['m-n', 'm-p']);
    const wide = createState(
      makeLevel({
        towers: [...two, { id: 'm', x: 409, y: 880, owner: 'neutral' }], // 49 px off
      }),
      1,
    );
    expect(Object.keys(wide.roads).sort()).toEqual(['m-n', 'm-p', 'n-p']);
  });

  it('lanes are static: mines and obstacles on the state are the ones the lanes reference', () => {
    const state = createState(
      makeLevel({
        towers: two,
        mines: [{ x: 340, y: 880, charges: 2 }],
        obstacles: [{ kind: 'rock', points: [P(600, 600)] }],
      }),
      1,
    );
    expect(state.roads['n-p']!.mineHits).toEqual([{ mine: 0, t: 0.5 }]);
    expect(state.obstacles).toEqual([{ kind: 'rock', points: [P(600, 600)], width: 80 }]);
  });
});
