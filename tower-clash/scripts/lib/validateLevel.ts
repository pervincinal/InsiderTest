/**
 * Level validation shared by `npm run levels:check` and `tests/levels/levels.test.ts` (rules v3, GDD §2.0b).
 * Pure functions: a level in, a list of human-readable error strings out (empty = valid).
 *
 * A v3 level has towers, obstacles and mines and no roads: the lane graph is derived from the geometry
 * (`src/sim/geometry.ts`, the same code `createState` runs), so the checks here are geometric — every
 * tower must be reachable from the player's first tower through clear lanes, obstacles must not sit on
 * towers, mines must lie on at least one lane.
 */
import type { LevelDef, ObstacleDef, Owner, TowerDef } from '../../src/sim/types';
import type { LevelTextTranslations } from '../../src/ui/i18n';
import { C } from '../../src/sim/constants';
import { distPointSegment, laneClear, mineHitsOn, obstacleFromDef } from '../../src/sim/geometry';
import type { Obstacle } from '../../src/sim/types';

export const MAP_W = 720;
export const MAP_H = 1280;
export const EDGE_MARGIN = 90;
export const MIN_TOWER_DISTANCE = 150;
/** No obstacle may come closer than this to a tower centre (a tower must not stand inside a wall). */
export const OBSTACLE_TOWER_CLEARANCE = MIN_TOWER_DISTANCE / 2;
/** A mine must lie this far from every tower centre (it is a hazard on the lane, not on the tower). */
export const MINE_TOWER_CLEARANCE = 40;
export const MAX_LEVEL_ID = 50;
/** Obstacles appear from this level on (GDD §3: level 5 teaches "walls block the line"). */
export const FIRST_OBSTACLE_LEVEL = 5;
/** Mines appear from this level on (GDD §3: band "Two rivals"). */
export const FIRST_MINE_LEVEL = 17;
/**
 * Rules v3 structural consequence (GDD §2.0b): equal streams on a lane cancel and a shielding tower never
 * comes under fire, so a tower is takeable only with more attack lanes than its defender has links
 * (L1 1, L2 2, L3 3, fortress 2). Every enemy or neutral tower the player must take needs at least this
 * many clear lanes; below it the check *warns* (not an error) from `LANE_WARNING_FROM_LEVEL` on — the
 * tutorial band's enemies (aggression < 0.35) never shield, so band 1 is exempt.
 */
export const MIN_ATTACK_LANES = 4;
export const LANE_WARNING_FROM_LEVEL = 9;

/** Languages a level's `name` / `lesson` are translated into (I18N-2): `name_az`, `lesson_ru`, … */
export const LEVEL_TEXT_LANGS = ['az', 'ru', 'tr'] as const;
export const LEVEL_TEXT_FIELDS = ['name', 'lesson'] as const;
/** A translation may be this much longer than the English text (it must fit the same UI). */
export const TRANSLATION_LENGTH_SLACK = 0.2;

/** A level as authored: `LevelDef` plus the optional translated texts. */
export type AuthoredLevel = LevelDef & LevelTextTranslations;

const OWNERS: readonly string[] = ['neutral', 'player', 'enemy1', 'enemy2', 'enemy3'];
const ENEMY_OWNERS: readonly string[] = ['enemy1', 'enemy2', 'enemy3'];
const TOWER_KINDS: readonly string[] = ['barracks', 'artillery', 'tankFactory', 'fortress'];
const PERSONALITIES: readonly string[] = ['rusher', 'turtle', 'opportunist'];
const OBSTACLE_KINDS: readonly string[] = ['wall', 'water', 'rock'];

export interface BandRules {
  name: string;
  maxEnemies: number;
  kinds: readonly string[];
  obstacles: boolean;
  mines: boolean;
}

/** Progression bands from GDD §3, keyed by level id (1–8, 9–16, 17–24, 25–32, 33–40, 41–50). */
export function bandFor(id: number): BandRules | undefined {
  if (id >= 1 && id <= 8) {
    return { name: '1-8', maxEnemies: 1, kinds: ['barracks'], obstacles: id >= FIRST_OBSTACLE_LEVEL, mines: false };
  }
  if (id >= 9 && id <= 16) {
    return { name: '9-16', maxEnemies: 1, kinds: ['barracks', 'fortress', 'artillery'], obstacles: true, mines: false };
  }
  if (id >= 17 && id <= 24) {
    return { name: '17-24', maxEnemies: 2, kinds: ['barracks', 'fortress', 'artillery'], obstacles: true, mines: true };
  }
  if (id >= 25 && id <= 32) {
    return { name: '25-32', maxEnemies: 2, kinds: TOWER_KINDS, obstacles: true, mines: true };
  }
  if (id >= 33 && id <= 40) {
    return { name: '33-40', maxEnemies: 3, kinds: TOWER_KINDS, obstacles: true, mines: true };
  }
  if (id >= 41 && id <= MAX_LEVEL_ID) {
    // Grand Campaign (LV-9): no new vocabulary, everything from the earlier bands mixed.
    return { name: '41-50', maxEnemies: 3, kinds: TOWER_KINDS, obstacles: true, mines: true };
  }
  return undefined;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInteger = (v: unknown): v is number => Number.isInteger(v);
const isPoint = (p: unknown): p is { x: number; y: number } =>
  typeof p === 'object' && p !== null && isFiniteNumber((p as { x?: unknown }).x) && isFiniteNumber((p as { y?: unknown }).y);

export function laneKey(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Numeric and enum sanity of the scalar fields; a leftover v2 `roads` list is an error. */
export function validateFields(level: LevelDef): string[] {
  const errors: string[] = [];
  if (!isInteger(level.id) || level.id < 1) errors.push(`id must be a positive integer (got ${String(level.id)})`);
  if (typeof level.name !== 'string' || level.name.trim() === '') errors.push('name must be a non-empty string');
  if (typeof level.lesson !== 'string' || level.lesson.trim() === '') errors.push('lesson must be a non-empty string');
  if (!isInteger(level.star3) || level.star3 <= 0) errors.push(`star3 must be a positive integer of ms (got ${String(level.star3)})`);
  if (!isInteger(level.star2) || level.star2 <= 0) errors.push(`star2 must be a positive integer of ms (got ${String(level.star2)})`);
  if (!Array.isArray(level.enemies)) errors.push('enemies must be an array');
  if (!Array.isArray(level.towers)) errors.push('towers must be an array');
  if (level.obstacles !== undefined && !Array.isArray(level.obstacles)) errors.push('obstacles must be an array when present');
  if (level.mines !== undefined && !Array.isArray(level.mines)) errors.push('mines must be an array when present');
  if ('roads' in level) errors.push('roads are gone (rules v3): remove the list — lanes are derived from towers and obstacles');
  return errors;
}

/** Longest translation allowed for an English text of `enLength` characters. */
export function translationMaxLength(enLength: number): number {
  return Math.ceil(enLength * (1 + TRANSLATION_LENGTH_SLACK));
}

/**
 * Translated texts (`name_az`, `lesson_tr`, …): when present they must be non-empty strings no
 * longer than the English text + 20 %. Absence is not an error — see `translationWarnings`.
 */
export function validateTranslations(level: AuthoredLevel): string[] {
  const errors: string[] = [];
  for (const field of LEVEL_TEXT_FIELDS) {
    const en = level[field];
    for (const lang of LEVEL_TEXT_LANGS) {
      const key = `${field}_${lang}` as const;
      const v = level[key];
      if (v === undefined) continue;
      if (typeof v !== 'string' || v.trim() === '') {
        errors.push(`${key} must be a non-empty string when present`);
        continue;
      }
      const max = translationMaxLength(en.length);
      if (v.length > max) errors.push(`${key} is ${v.length} characters, max ${max} (${field} + ${TRANSLATION_LENGTH_SLACK * 100} %)`);
    }
  }
  return errors;
}

/** Non-fatal: every language the level's name or lesson is not translated into. */
export function translationWarnings(level: AuthoredLevel): string[] {
  const warnings: string[] = [];
  for (const field of LEVEL_TEXT_FIELDS) {
    const missing = LEVEL_TEXT_LANGS.filter((lang) => level[`${field}_${lang}`] === undefined);
    if (missing.length > 0) warnings.push(`${field} not translated: ${missing.join(', ')}`);
  }
  return warnings;
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

/** Towers whose coordinates are usable for geometry (the shape errors are reported by `validateTowers`). */
function placedTowers(level: LevelDef): TowerDef[] {
  return level.towers.filter((t) => typeof t.id === 'string' && isFiniteNumber(t.x) && isFiniteNumber(t.y));
}

/** Obstacles that pass `validateObstacles`' shape checks, with defaults applied (what `createState` sees). */
function wellFormedObstacles(level: LevelDef): Obstacle[] {
  return (level.obstacles ?? []).filter((o) => obstacleShapeErrors(o).length === 0).map(obstacleFromDef);
}

/** Distance from a tower centre to the nearest part of an obstacle's centre line (or its rock centre). */
function obstacleDistance(o: Obstacle, p: { x: number; y: number }): number {
  const first = o.points[0];
  if (!first) return Infinity;
  if (o.points.length === 1) return Math.hypot(first.x - p.x, first.y - p.y);
  let best = Infinity;
  for (let i = 1; i < o.points.length; i++) best = Math.min(best, distPointSegment(p, o.points[i - 1]!, o.points[i]!));
  return best;
}

function obstacleShapeErrors(o: ObstacleDef): string[] {
  const errors: string[] = [];
  if (typeof o !== 'object' || o === null) return ['must be an object'];
  if (!OBSTACLE_KINDS.includes(o.kind)) errors.push(`kind "${String(o.kind)}" is not an obstacle kind (${OBSTACLE_KINDS.join(' | ')})`);
  if (!Array.isArray(o.points)) errors.push('points must be an array');
  else {
    const bad = o.points.findIndex((p) => !isPoint(p));
    if (bad >= 0) errors.push(`points[${bad}] must be {x, y} with finite numbers`);
    else if (o.points.length < 2 && !(o.kind === 'rock' && o.points.length === 1)) {
      errors.push(`needs ≥ 2 points (a rock may be a single point), got ${o.points.length}`);
    }
  }
  if (o.width !== undefined && (!isFiniteNumber(o.width) || o.width <= 0)) errors.push(`width must be a positive number (got ${String(o.width)})`);
  return errors;
}

/**
 * Obstacles (rules v3): known kind, a polyline of ≥ 2 points or a single-point rock, positive width,
 * every point inside the map (water may run off-map by up to EDGE_MARGIN so a river can reach the
 * edge), and no obstacle closer than OBSTACLE_TOWER_CLEARANCE to a tower centre.
 */
export function validateObstacles(level: LevelDef): string[] {
  const errors: string[] = [];
  const towers = placedTowers(level);
  for (const [i, o] of (level.obstacles ?? []).entries()) {
    const label = `obstacles[${i}]`;
    const shape = obstacleShapeErrors(o);
    if (shape.length > 0) {
      errors.push(...shape.map((e) => `${label}: ${e}`));
      continue;
    }
    const slack = o.kind === 'water' ? EDGE_MARGIN : 0;
    for (const [k, p] of o.points.entries()) {
      if (p.x < -slack || p.x > MAP_W + slack || p.y < -slack || p.y > MAP_H + slack) {
        errors.push(`${label}.points[${k}] (${p.x}, ${p.y}) is outside the ${MAP_W}×${MAP_H} map${slack > 0 ? ` (+${slack} px tolerance)` : ''}`);
      }
    }
    const obstacle = obstacleFromDef(o);
    for (const t of towers) {
      const d = obstacleDistance(obstacle, t);
      if (d < OBSTACLE_TOWER_CLEARANCE) {
        errors.push(`${label} (${o.kind}) is ${d.toFixed(0)} px from tower ${t.id} (min ${OBSTACLE_TOWER_CLEARANCE})`);
      }
    }
  }
  return errors;
}

/**
 * Mines (rules v3): a point inside the map with a positive integer `charges`, at least
 * MINE_TOWER_CLEARANCE from every tower centre, and on at least one lane (a mine no lane crosses is dead
 * weight — an authoring mistake).
 */
export function validateMines(level: LevelDef): string[] {
  const errors: string[] = [];
  const towers = placedTowers(level);
  const obstacles = wellFormedObstacles(level);
  const mines = level.mines ?? [];
  for (const [i, m] of mines.entries()) {
    const label = `mines[${i}]`;
    if (!isPoint(m)) {
      errors.push(`${label}: x/y must be finite numbers`);
      continue;
    }
    if (m.x < 0 || m.x > MAP_W || m.y < 0 || m.y > MAP_H) errors.push(`${label} (${m.x}, ${m.y}) is outside the ${MAP_W}×${MAP_H} map`);
    if (!isInteger(m.charges) || m.charges <= 0) errors.push(`${label}.charges must be a positive integer (got ${String(m.charges)})`);
    for (const t of towers) {
      const d = Math.hypot(t.x - m.x, t.y - m.y);
      if (d < MINE_TOWER_CLEARANCE) errors.push(`${label} is ${d.toFixed(0)} px from tower ${t.id} (min ${MINE_TOWER_CLEARANCE})`);
    }
  }
  const hit = new Set<number>();
  for (let i = 0; i < towers.length; i++) {
    for (let j = i + 1; j < towers.length; j++) {
      const a = towers[i]!;
      const b = towers[j]!;
      if (!laneClear(towers, obstacles, a, b)) continue;
      for (const h of mineHitsOn(mines.filter(isPoint), a, b)) hit.add(h.mine);
    }
  }
  mines.forEach((m, i) => {
    if (isPoint(m) && !hit.has(i)) errors.push(`mines[${i}] (${m.x}, ${m.y}) lies on no lane (within ${C.MINE_RADIUS} px of none)`);
  });
  return errors;
}

/** Lane adjacency of the towers accepted by `accept` (lanes are still blocked by every tower and obstacle). */
function laneAdjacency(level: LevelDef, accept: (t: TowerDef) => boolean): Map<string, string[]> {
  const all = placedTowers(level);
  const obstacles = wellFormedObstacles(level);
  const nodes = all.filter(accept);
  const adj = new Map<string, string[]>(nodes.map((t) => [t.id, []]));
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      if (!laneClear(all, obstacles, a, b)) continue;
      adj.get(a.id)?.push(b.id);
      adj.get(b.id)?.push(a.id);
    }
  }
  return adj;
}

function reachableFrom(start: string, adj: Map<string, string[]>): Set<string> {
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    for (const next of adj.get(id) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

/** Every lane of the level as `a-b` keys (a < b), i.e. what `createState` will build. */
export function laneKeys(level: LevelDef): string[] {
  const adj = laneAdjacency(level, () => true);
  const keys = new Set<string>();
  for (const [a, list] of adj) for (const b of list) keys.add(laneKey(a, b));
  return [...keys].sort();
}

/**
 * Non-fatal (rules v3, GDD §2.0b "structural consequence"): from `LANE_WARNING_FROM_LEVEL` on, every
 * non-player tower with fewer than `MIN_ATTACK_LANES` clear lanes — a defender that shields every lane
 * to it stands off equal-level streams, so such a keep is takeable only by out-levelling it. Lanes are
 * counted with the same geometry `createState` uses (`laneClear`: obstacles and third towers block).
 */
export function laneWarnings(level: LevelDef): string[] {
  if (!isInteger(level.id) || level.id < LANE_WARNING_FROM_LEVEL) return [];
  const adj = laneAdjacency(level, () => true);
  const warnings: string[] = [];
  for (const t of placedTowers(level)) {
    if (t.owner === 'player') continue;
    const lanes = adj.get(t.id)?.length ?? 0;
    if (lanes < MIN_ATTACK_LANES) {
      warnings.push(`tower ${t.id} (${t.owner}) has ${lanes} clear lane(s), fewer than ${MIN_ATTACK_LANES}: a defender can shield every lane to it`);
    }
  }
  return warnings;
}

/**
 * Connectivity (rules v3): every tower must be reachable from the player's first tower through clear
 * lanes, and no tower may be isolated (a tower with no lane can neither attack nor be attacked).
 */
export function validateConnectivity(level: LevelDef): string[] {
  if (level.towers.length === 0) return ['level has no towers'];
  const errors: string[] = [];
  const adj = laneAdjacency(level, () => true);
  for (const [id, lanes] of adj) if (lanes.length === 0) errors.push(`tower ${id} is isolated: no clear lane to any other tower`);
  const start = level.towers.find((t) => t.owner === 'player');
  if (!start) return errors; // reported by validateOwnership
  const seen = reachableFrom(start.id, adj);
  const missing = level.towers.filter((t) => !seen.has(t.id)).map((t) => t.id);
  if (missing.length > 0) errors.push(`not every tower is reachable from ${start.id} through clear lanes: {${missing.join(',')}}`);
  return errors;
}

export function validateOwnership(level: LevelDef): string[] {
  const errors: string[] = [];
  const playerTowers = level.towers.filter((t) => t.owner === 'player');
  if (playerTowers.length === 0) errors.push('player must own at least one tower at start');
  else {
    const adj = laneAdjacency(level, (t) => t.owner === 'player');
    const seen = reachableFrom(playerTowers[0]!.id, adj);
    const groups = 1 + playerTowers.filter((t) => !seen.has(t.id)).length;
    if (groups > 1) errors.push(`player towers must form one connected group at start (found ${groups})`);
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
  const obstacles = level.obstacles?.length ?? 0;
  const mines = level.mines?.length ?? 0;
  if (obstacles > 0 && !band.obstacles) {
    errors.push(`level ${level.id} may not have obstacles (they start at level ${FIRST_OBSTACLE_LEVEL}; got ${obstacles})`);
  }
  if (mines > 0 && !band.mines) errors.push(`band ${band.name} does not allow mines (they start at level ${FIRST_MINE_LEVEL}; got ${mines})`);
  return errors;
}

/** All checks for one level. Structural errors short-circuit the checks that depend on the arrays. */
export function validateLevel(level: LevelDef): string[] {
  const errors = validateFields(level);
  if (errors.length > 0) return errors;
  return [
    ...validateTranslations(level),
    ...validateStars(level),
    ...validateEnemies(level),
    ...validateTowers(level),
    ...validateObstacles(level),
    ...validateMines(level),
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
  /** Clear tower pairs (what `createState` turns into `state.roads`). */
  lanes: number;
  obstacles: number;
  mines: number;
  enemies: number;
  errors: string[];
  /** Advisory only (missing translations, towers with fewer than `MIN_ATTACK_LANES` lanes); never fails the check. */
  warnings: string[];
}

/** Validate a whole list: per-level checks plus cross-level uniqueness and play order. */
export function validateLevels(levels: LevelDef[]): LevelReport[] {
  const reports = levels.map<LevelReport>((level) => {
    const wellFormed = validateFields(level).length === 0;
    return {
      id: level.id,
      name: level.name,
      band: bandFor(level.id)?.name ?? '?',
      towers: Array.isArray(level.towers) ? level.towers.length : 0,
      lanes: wellFormed ? laneKeys(level).length : 0,
      obstacles: Array.isArray(level.obstacles) ? level.obstacles.length : 0,
      mines: Array.isArray(level.mines) ? level.mines.length : 0,
      enemies: Array.isArray(level.enemies) ? level.enemies.length : 0,
      errors: validateLevel(level),
      warnings: wellFormed ? [...translationWarnings(level), ...laneWarnings(level)] : [],
    };
  });
  const idCount = new Map<number, number>();
  for (const level of levels) idCount.set(level.id, (idCount.get(level.id) ?? 0) + 1);
  const nameCount = new Map<string, number>();
  for (const level of levels) nameCount.set(level.name, (nameCount.get(level.name) ?? 0) + 1);
  // translated names must be unique too (they label the level-select node and the HUD)
  const translatedCount = new Map<string, number>();
  const translatedKey = (lang: string, v: string) => `${lang}:${v}`;
  for (const level of levels as AuthoredLevel[]) {
    for (const lang of LEVEL_TEXT_LANGS) {
      const v = level[`name_${lang}`];
      if (typeof v === 'string') translatedCount.set(translatedKey(lang, v), (translatedCount.get(translatedKey(lang, v)) ?? 0) + 1);
    }
  }
  for (const [i, report] of reports.entries()) {
    if ((idCount.get(report.id) ?? 0) > 1) report.errors.push(`duplicate level id ${report.id}`);
    if ((nameCount.get(report.name) ?? 0) > 1) report.errors.push(`duplicate level name "${report.name}"`);
    const level = levels[i] as AuthoredLevel | undefined;
    for (const lang of LEVEL_TEXT_LANGS) {
      const v = level?.[`name_${lang}`];
      if (typeof v === 'string' && (translatedCount.get(translatedKey(lang, v)) ?? 0) > 1) {
        report.errors.push(`duplicate level name_${lang} "${v}"`);
      }
    }
    const prev = reports[i - 1];
    if (prev && prev.id >= report.id) report.errors.push(`play order: id ${report.id} follows id ${prev.id}`);
  }
  return reports;
}

/** Plain-text table of the reports; error lines follow each failing row. */
export function formatReport(reports: LevelReport[]): string {
  const header = ['id', 'name', 'band', 'towers', 'lanes', 'obstacles', 'mines', 'enemies', 'status'];
  const rows = reports.map((r) => [
    String(r.id),
    r.name,
    r.band,
    String(r.towers),
    String(r.lanes),
    String(r.obstacles),
    String(r.mines),
    String(r.enemies),
    r.errors.length > 0 ? `FAIL (${r.errors.length})` : r.warnings.length > 0 ? `ok (${r.warnings.length} warning(s))` : 'ok',
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]?.length ?? 0)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ');
  const out = [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)];
  for (const r of reports) {
    for (const e of r.errors) out.push(`  ! level ${r.id}: ${e}`);
    for (const w of r.warnings) out.push(`  ? level ${r.id}: ${w}`);
  }
  const failed = reports.filter((r) => r.errors.length > 0).length;
  const warned = reports.filter((r) => r.warnings.length > 0).length;
  const warnNote = warned > 0 ? ` ${warned} with warnings.` : '';
  out.push('', failed === 0 ? `${reports.length} level(s) valid.${warnNote}` : `${failed} of ${reports.length} level(s) FAILED.${warnNote}`);
  return out.join('\n');
}
