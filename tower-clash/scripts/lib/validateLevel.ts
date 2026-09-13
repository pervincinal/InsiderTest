/**
 * Level validation shared by `npm run levels:check` and `tests/levels/levels.test.ts`.
 * Pure functions: a level in, a list of human-readable error strings out (empty = valid).
 */
import type { LevelDef, Owner, RoadDef, TowerDef } from '../../src/sim/types';

export const MAP_W = 720;
export const MAP_H = 1280;
export const EDGE_MARGIN = 90;
export const MIN_TOWER_DISTANCE = 150;
export const MAX_LEVEL_ID = 40;

const OWNERS: readonly string[] = ['neutral', 'player', 'enemy1', 'enemy2', 'enemy3'];
const ENEMY_OWNERS: readonly string[] = ['enemy1', 'enemy2', 'enemy3'];
const TOWER_KINDS: readonly string[] = ['barracks', 'artillery', 'tankFactory', 'fortress'];
const PERSONALITIES: readonly string[] = ['rusher', 'turtle', 'opportunist'];
const ROAD_KINDS: readonly string[] = ['road', 'bridge'];

export interface BandRules {
  name: string;
  maxEnemies: number;
  kinds: readonly string[];
  mines: boolean;
  barriers: boolean;
  bridges: boolean;
}

/** Progression bands from GDD §3, keyed by level id. */
export function bandFor(id: number): BandRules | undefined {
  if (id >= 1 && id <= 8) {
    return { name: '1-8', maxEnemies: 1, kinds: ['barracks'], mines: false, barriers: false, bridges: false };
  }
  if (id >= 9 && id <= 16) {
    return {
      name: '9-16',
      maxEnemies: 1,
      kinds: ['barracks', 'fortress', 'artillery'],
      mines: false,
      barriers: false,
      bridges: false,
    };
  }
  if (id >= 17 && id <= 24) {
    return {
      name: '17-24',
      maxEnemies: 2,
      kinds: ['barracks', 'fortress', 'artillery'],
      mines: true,
      barriers: true,
      bridges: false,
    };
  }
  if (id >= 25 && id <= 32) {
    return { name: '25-32', maxEnemies: 2, kinds: TOWER_KINDS, mines: true, barriers: true, bridges: true };
  }
  if (id >= 33 && id <= MAX_LEVEL_ID) {
    return { name: '33-40', maxEnemies: 3, kinds: TOWER_KINDS, mines: true, barriers: true, bridges: true };
  }
  return undefined;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInteger = (v: unknown): v is number => Number.isInteger(v);

export function roadKey(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Numeric and enum sanity of the scalar fields. */
export function validateFields(level: LevelDef): string[] {
  const errors: string[] = [];
  if (!isInteger(level.id) || level.id < 1) errors.push(`id must be a positive integer (got ${String(level.id)})`);
  if (typeof level.name !== 'string' || level.name.trim() === '') errors.push('name must be a non-empty string');
  if (typeof level.lesson !== 'string' || level.lesson.trim() === '') errors.push('lesson must be a non-empty string');
  if (!isInteger(level.star3) || level.star3 <= 0) errors.push(`star3 must be a positive integer of ms (got ${String(level.star3)})`);
  if (!isInteger(level.star2) || level.star2 <= 0) errors.push(`star2 must be a positive integer of ms (got ${String(level.star2)})`);
  if (!Array.isArray(level.enemies)) errors.push('enemies must be an array');
  if (!Array.isArray(level.towers)) errors.push('towers must be an array');
  if (!Array.isArray(level.roads)) errors.push('roads must be an array');
  return errors;
}

export function validateStars(level: LevelDef): string[] {
  if (isInteger(level.star3) && isInteger(level.star2) && level.star3 >= level.star2) {
    return [`star3 (${level.star3}) must be < star2 (${level.star2})`];
  }
  return [];
}

export function validateEnemies(level: LevelDef): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [i, enemy] of level.enemies.entries()) {
    const label = `enemies[${i}]`;
    if (!ENEMY_OWNERS.includes(enemy.owner)) errors.push(`${label}.owner "${String(enemy.owner)}" is not an enemy owner`);
    if (seen.has(enemy.owner)) errors.push(`${label}.owner "${enemy.owner}" listed twice`);
    seen.add(enemy.owner);
    if (!PERSONALITIES.includes(enemy.personality)) {
      errors.push(`${label}.personality "${String(enemy.personality)}" is not a personality`);
    }
    if (!isFiniteNumber(enemy.aggression) || enemy.aggression < 0 || enemy.aggression > 1) {
      errors.push(`${label}.aggression must be a number in 0..1 (got ${String(enemy.aggression)})`);
    }
  }
  return errors;
}

export function validateTowers(level: LevelDef): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const [i, tower] of level.towers.entries()) {
    const label = `towers[${i}]${typeof tower.id === 'string' ? ` (${tower.id})` : ''}`;
    if (typeof tower.id !== 'string' || tower.id === '') errors.push(`${label}.id must be a non-empty string`);
    else if (ids.has(tower.id)) errors.push(`${label}: duplicate tower id`);
    ids.add(tower.id);

    if (!OWNERS.includes(tower.owner)) errors.push(`${label}.owner "${String(tower.owner)}" is not an owner`);
    if (!isFiniteNumber(tower.x) || !isFiniteNumber(tower.y)) {
      errors.push(`${label}: x/y must be finite numbers`);
    } else {
      if (tower.x < EDGE_MARGIN || tower.x > MAP_W - EDGE_MARGIN || tower.y < EDGE_MARGIN || tower.y > MAP_H - EDGE_MARGIN) {
        errors.push(`${label}: (${tower.x}, ${tower.y}) must be ≥ ${EDGE_MARGIN} px from the ${MAP_W}×${MAP_H} edges`);
      }
    }
    if (tower.units !== undefined && (!isInteger(tower.units) || tower.units < 0)) {
      errors.push(`${label}.units must be an integer ≥ 0 (got ${String(tower.units)})`);
    }
    if (tower.level !== undefined && ![1, 2, 3].includes(tower.level)) {
      errors.push(`${label}.level must be 1, 2 or 3 (got ${String(tower.level)})`);
    }
    if (tower.kind !== undefined && !TOWER_KINDS.includes(tower.kind)) {
      errors.push(`${label}.kind "${String(tower.kind)}" is not a tower kind`);
    }
  }
  errors.push(...validateSpacing(level.towers));
  return errors;
}

export function validateSpacing(towers: TowerDef[]): string[] {
  const errors: string[] = [];
  for (let i = 0; i < towers.length; i++) {
    for (let j = i + 1; j < towers.length; j++) {
      const a = towers[i];
      const b = towers[j];
      if (!a || !b) continue;
      if (![a.x, a.y, b.x, b.y].every(isFiniteNumber)) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < MIN_TOWER_DISTANCE) {
        errors.push(`towers ${a.id} and ${b.id} are ${d.toFixed(0)} px apart (min ${MIN_TOWER_DISTANCE})`);
      }
    }
  }
  return errors;
}

export function validateRoads(level: LevelDef): string[] {
  const errors: string[] = [];
  const towerIds = new Set(level.towers.map((t) => t.id));
  const seen = new Set<string>();
  for (const [i, road] of level.roads.entries()) {
    const label = `roads[${i}] (${String(road.a)}-${String(road.b)})`;
    if (typeof road.a !== 'string' || typeof road.b !== 'string') {
      errors.push(`${label}: a and b must be tower id strings`);
      continue;
    }
    if (road.a === road.b) errors.push(`${label}: a road cannot loop back to the same tower`);
    if (!towerIds.has(road.a)) errors.push(`${label}: tower "${road.a}" does not exist`);
    if (!towerIds.has(road.b)) errors.push(`${label}: tower "${road.b}" does not exist`);
    const key = roadKey(road.a, road.b);
    if (seen.has(key)) errors.push(`${label}: duplicate road`);
    seen.add(key);

    if (road.kind !== undefined && !ROAD_KINDS.includes(road.kind)) errors.push(`${label}.kind "${String(road.kind)}" is not a road kind`);
    if (road.mine !== undefined && (!isFiniteNumber(road.mine) || road.mine <= 0)) errors.push(`${label}.mine must be a positive number`);
    if (road.barrier !== undefined && (!isFiniteNumber(road.barrier) || road.barrier <= 0)) {
      errors.push(`${label}.barrier must be a positive number`);
    }
    if (road.waypoints !== undefined) {
      if (!Array.isArray(road.waypoints)) errors.push(`${label}.waypoints must be an array`);
      else {
        for (const [w, p] of road.waypoints.entries()) {
          if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y) || p.x < 0 || p.x > MAP_W || p.y < 0 || p.y > MAP_H) {
            errors.push(`${label}.waypoints[${w}] must be inside the ${MAP_W}×${MAP_H} map`);
          }
        }
      }
    }
  }
  return errors;
}

/** Connected components of `towers` using only `roads` whose endpoints both pass `accept`. */
function components(towers: TowerDef[], roads: RoadDef[], accept: (t: TowerDef) => boolean): string[][] {
  const byId = new Map(towers.map((t) => [t.id, t]));
  const nodes = towers.filter(accept).map((t) => t.id);
  const adj = new Map<string, string[]>(nodes.map((id) => [id, []]));
  for (const road of roads) {
    const a = byId.get(road.a);
    const b = byId.get(road.b);
    if (!a || !b || !accept(a) || !accept(b)) continue;
    adj.get(a.id)?.push(b.id);
    adj.get(b.id)?.push(a.id);
  }
  const visited = new Set<string>();
  const out: string[][] = [];
  for (const start of nodes) {
    if (visited.has(start)) continue;
    const comp: string[] = [];
    const stack = [start];
    visited.add(start);
    while (stack.length > 0) {
      const id = stack.pop() as string;
      comp.push(id);
      for (const next of adj.get(id) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    out.push(comp);
  }
  return out;
}

export function validateConnectivity(level: LevelDef): string[] {
  if (level.towers.length === 0) return ['level has no towers'];
  const comps = components(level.towers, level.roads, () => true);
  if (comps.length > 1) {
    return [`tower graph is not connected: ${comps.map((c) => `{${c.join(',')}}`).join(' ')}`];
  }
  return [];
}

export function validateOwnership(level: LevelDef): string[] {
  const errors: string[] = [];
  const playerTowers = level.towers.filter((t) => t.owner === 'player');
  if (playerTowers.length === 0) errors.push('player must own at least one tower at start');
  else {
    const groups = components(level.towers, level.roads, (t) => t.owner === 'player');
    if (groups.length > 1) {
      errors.push(`player towers must form one connected group at start (found ${groups.length})`);
    }
  }

  const listed = new Set<Owner>(level.enemies.map((e) => e.owner));
  const owning = new Set<Owner>(level.towers.map((t) => t.owner).filter((o) => ENEMY_OWNERS.includes(o)));
  for (const owner of listed) {
    if (!owning.has(owner)) errors.push(`enemy "${owner}" is listed in enemies but owns no tower`);
  }
  for (const owner of owning) {
    if (!listed.has(owner)) errors.push(`enemy "${owner}" owns a tower but is not listed in enemies`);
  }
  return errors;
}

export function validateBand(level: LevelDef): string[] {
  const band = bandFor(level.id);
  if (!band) return [`id ${String(level.id)} is outside the 1..${MAX_LEVEL_ID} progression bands`];
  const errors: string[] = [];
  if (level.enemies.length > band.maxEnemies) {
    errors.push(`band ${band.name} allows ≤ ${band.maxEnemies} enemies (got ${level.enemies.length})`);
  }
  for (const tower of level.towers) {
    const kind = tower.kind ?? 'barracks';
    if (TOWER_KINDS.includes(kind) && !band.kinds.includes(kind)) {
      errors.push(`band ${band.name} does not allow tower kind "${kind}" (tower ${tower.id})`);
    }
  }
  for (const road of level.roads) {
    const label = `road ${road.a}-${road.b}`;
    if (road.mine !== undefined && !band.mines) errors.push(`band ${band.name} does not allow mines (${label})`);
    if (road.barrier !== undefined && !band.barriers) errors.push(`band ${band.name} does not allow barriers (${label})`);
    if (road.kind === 'bridge' && !band.bridges) errors.push(`band ${band.name} does not allow bridges (${label})`);
  }
  return errors;
}

/** All checks for one level. Structural errors short-circuit the checks that depend on the arrays. */
export function validateLevel(level: LevelDef): string[] {
  const errors = validateFields(level);
  if (errors.length > 0) return errors;
  return [
    ...validateStars(level),
    ...validateEnemies(level),
    ...validateTowers(level),
    ...validateRoads(level),
    ...validateConnectivity(level),
    ...validateOwnership(level),
    ...validateBand(level),
  ];
}

export interface LevelReport {
  id: number;
  name: string;
  band: string;
  towers: number;
  roads: number;
  enemies: number;
  errors: string[];
}

/** Validate a whole list: per-level checks plus cross-level uniqueness and play order. */
export function validateLevels(levels: LevelDef[]): LevelReport[] {
  const reports = levels.map<LevelReport>((level) => ({
    id: level.id,
    name: level.name,
    band: bandFor(level.id)?.name ?? '?',
    towers: Array.isArray(level.towers) ? level.towers.length : 0,
    roads: Array.isArray(level.roads) ? level.roads.length : 0,
    enemies: Array.isArray(level.enemies) ? level.enemies.length : 0,
    errors: validateLevel(level),
  }));
  const idCount = new Map<number, number>();
  for (const level of levels) idCount.set(level.id, (idCount.get(level.id) ?? 0) + 1);
  const nameCount = new Map<string, number>();
  for (const level of levels) nameCount.set(level.name, (nameCount.get(level.name) ?? 0) + 1);
  for (const [i, report] of reports.entries()) {
    if ((idCount.get(report.id) ?? 0) > 1) report.errors.push(`duplicate level id ${report.id}`);
    if ((nameCount.get(report.name) ?? 0) > 1) report.errors.push(`duplicate level name "${report.name}"`);
    const prev = reports[i - 1];
    if (prev && prev.id >= report.id) report.errors.push(`play order: id ${report.id} follows id ${prev.id}`);
  }
  return reports;
}

/** Plain-text table of the reports; error lines follow each failing row. */
export function formatReport(reports: LevelReport[]): string {
  const header = ['id', 'name', 'band', 'towers', 'roads', 'enemies', 'status'];
  const rows = reports.map((r) => [
    String(r.id),
    r.name,
    r.band,
    String(r.towers),
    String(r.roads),
    String(r.enemies),
    r.errors.length === 0 ? 'ok' : `FAIL (${r.errors.length})`,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ');
  const out = [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)];
  for (const r of reports) {
    for (const e of r.errors) out.push(`  ! level ${r.id}: ${e}`);
  }
  const failed = reports.filter((r) => r.errors.length > 0).length;
  out.push('', failed === 0 ? `${reports.length} level(s) valid.` : `${failed} of ${reports.length} level(s) FAILED.`);
  return out.join('\n');
}
