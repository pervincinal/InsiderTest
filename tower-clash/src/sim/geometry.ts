import type { Mine, Obstacle, ObstacleDef, Road } from './types';
import { C } from './constants';

/*
 * Rules v3 lane geometry (GDD §2.0b). Pure functions shared by the sim (`createState`), the level
 * validator, the renderer (guide lines) and the AI. No state, no rng.
 */

export interface Point {
  x: number;
  y: number;
}

/** Fraction along `a → b` of the projection of `p` (unclamped; 0 at `a`, 1 at `b`). Degenerate segment → 0. */
export function projectFraction(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
}

/** Distance from point `p` to the closed segment `a–b` (a degenerate segment is a point). */
export function distPointSegment(p: Point, a: Point, b: Point): number {
  const t = Math.min(1, Math.max(0, projectFraction(p, a, b)));
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  return Math.hypot(p.x - x, p.y - y);
}

/** Orientation sign of `c` relative to the directed line `a → b` (> 0 left, < 0 right, 0 collinear). */
function orient(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** True when the closed segments `a1–a2` and `b1–b2` share at least one point (degenerate segments allowed). */
export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = orient(b1, b2, a1);
  const d2 = orient(b1, b2, a2);
  const d3 = orient(a1, a2, b1);
  const d4 = orient(a1, a2, b2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const onSeg = (p: Point, q: Point, r: Point): boolean =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  if (d1 === 0 && onSeg(b1, b2, a1)) return true;
  if (d2 === 0 && onSeg(b1, b2, a2)) return true;
  if (d3 === 0 && onSeg(a1, a2, b1)) return true;
  if (d4 === 0 && onSeg(a1, a2, b2)) return true;
  return false;
}

/** Minimum distance between the closed segments `a1–a2` and `b1–b2` (0 when they cross). */
export function distSegmentSegment(a1: Point, a2: Point, b1: Point, b2: Point): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    distPointSegment(a1, b1, b2),
    distPointSegment(a2, b1, b2),
    distPointSegment(b1, a1, a2),
    distPointSegment(b2, a1, a2),
  );
}

/** Default thickness of an obstacle kind (GDD §2.0b rule 2). */
export function defaultObstacleWidth(kind: Obstacle['kind']): number {
  return kind === 'rock' ? C.ROCK_RADIUS * 2 : C.OBSTACLE_WIDTH;
}

/** Runtime obstacle from a level definition: defaults applied, points copied. Does not validate. */
export function obstacleFromDef(def: ObstacleDef): Obstacle {
  return {
    kind: def.kind,
    points: def.points.map((p) => ({ x: p.x, y: p.y })),
    width: def.width ?? defaultObstacleWidth(def.kind),
  };
}

/**
 * True when the segment `a–b` comes within `width / 2` (inclusive) of the obstacle: of any segment of its
 * polyline, or of its single point (a rock disc).
 */
export function obstacleBlocks(obstacle: Obstacle, a: Point, b: Point): boolean {
  const half = obstacle.width / 2;
  const pts = obstacle.points;
  if (pts.length === 0) return false;
  if (pts.length === 1) return distPointSegment(pts[0]!, a, b) <= half;
  for (let i = 1; i < pts.length; i++) {
    if (distSegmentSegment(a, b, pts[i - 1]!, pts[i]!) <= half) return true;
  }
  return false;
}

export interface LaneEndpoint {
  id: string;
  x: number;
  y: number;
}

/**
 * True when towers `a` and `b` are connected by a lane: no obstacle blocks the segment between their
 * centres and no third tower's centre lies closer than `TOWER_BLOCK_RADIUS` (strictly) to it.
 */
export function laneClear(
  towers: readonly LaneEndpoint[],
  obstacles: readonly Obstacle[],
  a: LaneEndpoint,
  b: LaneEndpoint,
): boolean {
  if (a.id === b.id) return false;
  for (const t of towers) {
    if (t.id === a.id || t.id === b.id) continue;
    if (distPointSegment(t, a, b) < C.TOWER_BLOCK_RADIUS) return false;
  }
  for (const o of obstacles) if (obstacleBlocks(o, a, b)) return false;
  return true;
}

/** Canonical lane id for the pair of tower ids (order independent). */
export function roadIdFor(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Keep a mine's lane fraction strictly inside (0, 1) so that units leaving or reaching either end still cross it. */
const T_MARGIN = 1e-6;

/**
 * Mines within `MINE_RADIUS` (inclusive) of the segment `a–b`, as `(index into mines, fraction from a)`,
 * sorted by fraction (index as tie-break).
 */
export function mineHitsOn(mines: readonly Mine[], a: Point, b: Point): { mine: number; t: number }[] {
  const hits: { mine: number; t: number }[] = [];
  mines.forEach((m, i) => {
    if (distPointSegment(m, a, b) > C.MINE_RADIUS) return;
    const t = Math.min(1 - T_MARGIN, Math.max(T_MARGIN, projectFraction(m, a, b)));
    hits.push({ mine: i, t });
  });
  hits.sort((p, q) => p.t - q.t || p.mine - q.mine);
  return hits;
}

/**
 * Every clear tower pair as a lane (`Road`), keyed by id, in tower-list order (i < j). Lanes are straight
 * (`points = [a, b]`, ids ordered so `a < b`), their length the distance, with the mines they cross.
 */
export function buildLanes(
  towers: readonly LaneEndpoint[],
  obstacles: readonly Obstacle[],
  mines: readonly Mine[],
): Record<string, Road> {
  const roads: Record<string, Road> = {};
  for (let i = 0; i < towers.length; i++) {
    for (let j = i + 1; j < towers.length; j++) {
      const ti = towers[i]!;
      const tj = towers[j]!;
      if (!laneClear(towers, obstacles, ti, tj)) continue;
      const forward = ti.id < tj.id;
      const ta = forward ? ti : tj;
      const tb = forward ? tj : ti;
      const pa = { x: ta.x, y: ta.y };
      const pb = { x: tb.x, y: tb.y };
      const id = roadIdFor(ta.id, tb.id);
      roads[id] = { id, a: ta.id, b: tb.id, points: [pa, pb], length: Math.hypot(pb.x - pa.x, pb.y - pa.y), mineHits: mineHitsOn(mines, pa, pb) };
    }
  }
  return roads;
}
