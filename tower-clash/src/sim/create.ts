import type { GameState, LevelDef, Owner, Road, Tower, TowerKind } from './types';
import { C } from './constants';

const OWNERS: ReadonlySet<string> = new Set<Owner>(['neutral', 'player', 'enemy1', 'enemy2', 'enemy3']);
const KINDS: ReadonlySet<string> = new Set<TowerKind>(['barracks', 'artillery', 'tankFactory', 'fortress']);

/** Canonical road id for the pair of tower ids (order independent). */
export function roadIdFor(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function fail(level: LevelDef, msg: string): never {
  throw new Error(`Invalid level ${level.id} (${level.name}): ${msg}`);
}

function polylineLength(points: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1]!;
    const q = points[i]!;
    len += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return len;
}

/** Build the initial runtime state for a level. Throws on a malformed level. */
export function createState(level: LevelDef, seed: number): GameState {
  if (!Array.isArray(level.towers) || level.towers.length === 0) fail(level, 'no towers');
  if (!Array.isArray(level.roads)) fail(level, 'roads must be an array');
  if (!Array.isArray(level.enemies)) fail(level, 'enemies must be an array');

  const towers: Record<string, Tower> = {};
  for (const def of level.towers) {
    if (typeof def.id !== 'string' || def.id.length === 0) fail(level, 'tower without id');
    if (def.id.includes('-')) fail(level, `tower id "${def.id}" must not contain "-"`);
    if (towers[def.id]) fail(level, `duplicate tower id "${def.id}"`);
    if (!isFiniteNumber(def.x) || !isFiniteNumber(def.y)) fail(level, `tower "${def.id}" has bad coordinates`);
    if (!OWNERS.has(def.owner)) fail(level, `tower "${def.id}" has bad owner "${String(def.owner)}"`);
    const kind = def.kind ?? 'barracks';
    if (!KINDS.has(kind)) fail(level, `tower "${def.id}" has bad kind "${String(kind)}"`);
    const lvl = def.level ?? 1;
    if (lvl !== 1 && lvl !== 2 && lvl !== 3) fail(level, `tower "${def.id}" has bad level ${String(lvl)}`);
    if (kind === 'fortress' && lvl > C.FORTRESS_MAX_LEVEL) fail(level, `fortress "${def.id}" exceeds max level`);
    const units = def.units ?? 0;
    if (!Number.isInteger(units) || units < 0) fail(level, `tower "${def.id}" has bad units ${String(units)}`);
    towers[def.id] = {
      id: def.id,
      x: def.x,
      y: def.y,
      owner: def.owner,
      kind,
      level: lvl,
      units,
      genAccMs: 0,
      artilleryCooldownMs: 0,
      defenceAcc: 0,
    };
  }

  const roads: Record<string, Road> = {};
  for (const def of level.roads) {
    if (!towers[def.a]) fail(level, `road references unknown tower "${String(def.a)}"`);
    if (!towers[def.b]) fail(level, `road references unknown tower "${String(def.b)}"`);
    if (def.a === def.b) fail(level, `road "${def.a}" loops onto itself`);
    const id = roadIdFor(def.a, def.b);
    if (roads[id]) fail(level, `duplicate road "${id}"`);
    const kind = def.kind ?? 'road';
    if (kind !== 'road' && kind !== 'bridge') fail(level, `road "${id}" has bad kind "${String(kind)}"`);
    const mine = def.mine ?? 0;
    const barrier = def.barrier ?? 0;
    if (!Number.isInteger(mine) || mine < 0) fail(level, `road "${id}" has bad mine ${String(mine)}`);
    if (!Number.isInteger(barrier) || barrier < 0) fail(level, `road "${id}" has bad barrier ${String(barrier)}`);
    const waypoints = def.waypoints ?? [];
    for (const w of waypoints) {
      if (!isFiniteNumber(w.x) || !isFiniteNumber(w.y)) fail(level, `road "${id}" has a bad waypoint`);
    }
    // Normalise so that road.a < road.b and points run a → b.
    const forward = def.a < def.b;
    const a = forward ? def.a : def.b;
    const b = forward ? def.b : def.a;
    const ta = towers[a]!;
    const tb = towers[b]!;
    const mids = (forward ? waypoints : [...waypoints].reverse()).map((w) => ({ x: w.x, y: w.y }));
    const points = [{ x: ta.x, y: ta.y }, ...mids, { x: tb.x, y: tb.y }];
    const length = polylineLength(points);
    if (!(length > 0)) fail(level, `road "${id}" has zero length`);
    roads[id] = { id, a, b, kind, points, length, mine, barrier, cut: false };
  }

  for (const e of level.enemies) {
    if (e.owner !== 'enemy1' && e.owner !== 'enemy2' && e.owner !== 'enemy3') {
      fail(level, `bad enemy owner "${String(e.owner)}"`);
    }
  }

  return {
    levelId: level.id,
    seed,
    time: 0,
    towers,
    roads,
    units: [],
    queues: [],
    boosters: [],
    enemies: level.enemies.map((e) => ({ ...e })),
    nextUnitId: 1,
    rngState: seed | 0,
    events: [],
  };
}
