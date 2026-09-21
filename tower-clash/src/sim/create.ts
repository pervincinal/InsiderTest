import type { GameState, LevelDef, Mine, Obstacle, ObstacleKind, Owner, PlayerModifiers, Tower, TowerKind } from './types';
import { DEFAULT_MODIFIERS } from './types';
import { C } from './constants';
import { capacityOf } from './step';
import { buildLanes, obstacleFromDef, roadIdFor } from './geometry';

export { roadIdFor };

const OWNERS: ReadonlySet<string> = new Set<Owner>(['neutral', 'player', 'enemy1', 'enemy2', 'enemy3']);
const KINDS: ReadonlySet<string> = new Set<TowerKind>(['barracks', 'artillery', 'tankFactory', 'fortress']);
const OBSTACLE_KINDS: ReadonlySet<string> = new Set<ObstacleKind>(['wall', 'water', 'rock']);

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function fail(level: LevelDef, msg: string): never {
  throw new Error(`Invalid level ${level.id} (${level.name}): ${msg}`);
}

/** Copy and validate player modifiers; throws on NaN / non-positive multipliers / negative bonus. */
function normaliseModifiers(m: Readonly<PlayerModifiers>): PlayerModifiers {
  const out: PlayerModifiers = {
    productionMul: m.productionMul,
    capacityMul: m.capacityMul,
    startGarrisonBonus: m.startGarrisonBonus,
    unitSpeedMul: m.unitSpeedMul,
  };
  for (const key of ['productionMul', 'capacityMul', 'unitSpeedMul'] as const) {
    if (!isFiniteNumber(out[key]) || out[key] <= 0) throw new Error(`Invalid modifiers: ${key} must be > 0`);
  }
  if (!Number.isInteger(out.startGarrisonBonus) || out.startGarrisonBonus < 0) {
    throw new Error('Invalid modifiers: startGarrisonBonus must be a non-negative integer');
  }
  return out;
}

/**
 * Build the initial runtime state for a level (rules v3). Throws on a malformed level.
 * Lanes (`state.roads`) are computed here from the towers and obstacles and never change afterwards;
 * mines are copied into `state.mines` and referenced from the lanes they lie on.
 * `modifiers` are the player's permanent bonuses (Commander upgrades); they are copied into the
 * state so a replay reproduces the match, and every `player` tower starts with `startGarrisonBonus`
 * extra units (capped at its — already modified — capacity).
 */
export function createState(level: LevelDef, seed: number, modifiers: Readonly<PlayerModifiers> = DEFAULT_MODIFIERS): GameState {
  const mods = normaliseModifiers(modifiers);
  if (!Array.isArray(level.towers) || level.towers.length === 0) fail(level, 'no towers');
  if ((level as { roads?: unknown }).roads !== undefined) fail(level, 'roads are not part of rules v3');
  if (level.obstacles !== undefined && !Array.isArray(level.obstacles)) fail(level, 'obstacles must be an array');
  if (level.mines !== undefined && !Array.isArray(level.mines)) fail(level, 'mines must be an array');
  if (!Array.isArray(level.enemies)) fail(level, 'enemies must be an array');

  const towers: Record<string, Tower> = {};
  const list: Tower[] = [];
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
    for (const other of list) {
      if (Math.hypot(other.x - def.x, other.y - def.y) < 1) fail(level, `towers "${other.id}" and "${def.id}" overlap`);
    }
    const tower: Tower = {
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
      underFireUntilMs: 0,
    };
    if (tower.owner === 'player' && mods.startGarrisonBonus > 0) {
      tower.units = Math.min(capacityOf(tower, { modifiers: mods }), tower.units + mods.startGarrisonBonus);
    }
    towers[def.id] = tower;
    list.push(tower);
  }

  const obstacles: Obstacle[] = [];
  (level.obstacles ?? []).forEach((def, i) => {
    if (!def || typeof def !== 'object') fail(level, `obstacle #${i} is not an object`);
    if (!OBSTACLE_KINDS.has(def.kind)) fail(level, `obstacle #${i} has bad kind "${String(def.kind)}"`);
    if (!Array.isArray(def.points)) fail(level, `obstacle #${i} has no points`);
    const minPoints = def.kind === 'rock' ? 1 : 2;
    if (def.points.length < minPoints) fail(level, `obstacle #${i} (${def.kind}) needs at least ${minPoints} point(s)`);
    for (const p of def.points) {
      if (!p || !isFiniteNumber(p.x) || !isFiniteNumber(p.y)) fail(level, `obstacle #${i} has a bad point`);
    }
    if (def.width !== undefined && (!isFiniteNumber(def.width) || def.width <= 0)) fail(level, `obstacle #${i} has bad width ${String(def.width)}`);
    obstacles.push(obstacleFromDef(def));
  });

  const mines: Mine[] = [];
  (level.mines ?? []).forEach((def, i) => {
    if (!def || typeof def !== 'object') fail(level, `mine #${i} is not an object`);
    if (!isFiniteNumber(def.x) || !isFiniteNumber(def.y)) fail(level, `mine #${i} has bad coordinates`);
    if (!Number.isInteger(def.charges) || def.charges <= 0) fail(level, `mine #${i} has bad charges ${String(def.charges)}`);
    mines.push({ x: def.x, y: def.y, charges: def.charges });
  });

  for (const e of level.enemies) {
    if (e.owner !== 'enemy1' && e.owner !== 'enemy2' && e.owner !== 'enemy3') {
      fail(level, `bad enemy owner "${String(e.owner)}"`);
    }
  }

  return {
    levelId: level.id,
    seed,
    modifiers: mods,
    time: 0,
    towers,
    roads: buildLanes(list, obstacles, mines),
    obstacles,
    mines,
    units: [],
    links: [],
    boosters: [],
    enemies: level.enemies.map((e) => ({ ...e })),
    nextUnitId: 1,
    rngState: seed | 0,
    events: [],
  };
}
