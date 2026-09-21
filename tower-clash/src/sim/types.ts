/** Shared simulation contract (rules v3, GDD §2.0b). Every layer imports from here; only `sim/` mutates these. */

export type Owner = 'neutral' | 'player' | 'enemy1' | 'enemy2' | 'enemy3';
export type EnemyOwner = 'enemy1' | 'enemy2' | 'enemy3';
export type TowerKind = 'barracks' | 'artillery' | 'tankFactory' | 'fortress';
export type UnitKind = 'infantry' | 'tank';
export type Personality = 'rusher' | 'turtle' | 'opportunist';
export type ObstacleKind = 'wall' | 'water' | 'rock';

/* ---------- Level definition (JSON) ---------- */

export interface TowerDef {
  id: string;
  x: number;
  y: number;
  owner: Owner;
  units?: number; // default 0
  level?: 1 | 2 | 3; // default 1
  kind?: TowerKind; // default 'barracks'
}

/**
 * Rules v3: a static obstacle. A polyline of ≥ 2 points with a thickness (`width`, default
 * `OBSTACLE_WIDTH`); a `rock` may be a single point (a disc of diameter `width`, default `ROCK_RADIUS × 2`).
 * A lane is blocked when the tower-to-tower segment comes within `width / 2` of the polyline (or the point).
 */
export interface ObstacleDef {
  kind: ObstacleKind;
  points: { x: number; y: number }[];
  width?: number;
}

/** Rules v3: a mine at a point; every lane passing within `MINE_RADIUS` of it records a hit. */
export interface MineDef {
  x: number;
  y: number;
  charges: number; // weight killed before the mine is spent (positive integer)
}

export interface EnemyDef {
  owner: EnemyOwner;
  personality: Personality;
  aggression: number; // 0..1
}

export interface LevelDef {
  id: number;
  name: string;
  lesson: string;
  star3: number; // ms
  star2: number; // ms
  enemies: EnemyDef[];
  towers: TowerDef[];
  obstacles?: ObstacleDef[];
  mines?: MineDef[];
}

/* ---------- Runtime state ---------- */

export interface Tower {
  id: string;
  x: number;
  y: number;
  owner: Owner;
  kind: TowerKind;
  level: 1 | 2 | 3;
  units: number; // garrison in weight units
  genAccMs: number; // accumulated ms toward next produced unit
  artilleryCooldownMs: number;
  defenceAcc: number; // fortress only: fractional hostile damage carried between arrivals
  /**
   * Rules v2.1 "Under fire": sim time until which the tower generates nothing, re-armed to
   * `time + UNDER_FIRE_MS` by every hostile landing, cleared (0) by a capture. The tower is under fire
   * while `time < underFireUntilMs` (`isUnderFire`); renderer and AI read it, only `sim/` writes it.
   * Under fire pauses growth only: a linked tower keeps streaming.
   */
  underFireUntilMs: number;
}

/** Runtime copy of an `ObstacleDef` with defaults applied. Static for the whole match. */
export interface Obstacle {
  kind: ObstacleKind;
  points: { x: number; y: number }[];
  width: number;
}

/** Runtime mine: `charges` decrease as units cross it; 0 = spent (gone for every lane). */
export interface Mine {
  x: number;
  y: number;
  charges: number;
}

/**
 * Rules v3 lane: the straight segment between two towers whose line is clear (no obstacle, no third
 * tower within `TOWER_BLOCK_RADIUS`). Computed once in `createState`; never changes during a match.
 */
export interface Road {
  id: string; // `${a}-${b}` with a < b lexicographically
  a: string;
  b: string;
  points: { x: number; y: number }[]; // always [centre of a, centre of b]
  length: number; // px
  /** Mines within `MINE_RADIUS` of the lane: index into `state.mines` and the fraction along the lane from `a`, sorted by `t`. */
  mineHits: { mine: number; t: number }[];
}

export interface Unit {
  id: number;
  owner: Owner;
  kind: UnitKind;
  weight: number;
  roadId: string;
  from: string; // tower id
  to: string; // tower id
  progress: number; // 0..1 along road from `from` to `to`
  speed: number; // px per second
}

/**
 * Rules v3 (GDD §2.0b): a persistent attack stream from `from` to the lane-connected `to`. Each link
 * emits its own stream: one unit every `streamIntervalMs(from)` (the tower's production interval) while
 * the garrison holds ≥ 1; the garrison itself does not change by sending.
 */
export interface Link {
  owner: Owner; // owner of `from` when the link was created; the link dies when `from` changes hands
  from: string; // tower id
  to: string; // tower id
  roadId: string;
  createdMs: number; // sim time of the `link` command
  emitAccMs: number; // accumulated ms toward the next emitted unit
}

export type UnlinkReason = 'manual' | 'sourceLost' | 'targetFull' | 'sourceEmpty';

export interface Booster {
  type: 'overdrive' | 'freeze';
  owner: Owner;
  untilMs: number;
}

/**
 * Permanent, out-of-match bonuses for the `player` owner (Commander upgrades bought with gold).
 * Stored on the state so that a replay (level + seed + modifiers + commands) is fully reproducible.
 * Modifiers are looked up by the *current* owner of a tower / unit, so a tower changes behaviour the
 * moment it changes hands: a captured enemy barracks immediately produces and caps at player rates,
 * and a lost player tower reverts to base rates for its new owner.
 */
export interface PlayerModifiers {
  productionMul: number; // generation (and stream) interval ÷ productionMul (multiplicative with overdrive)
  capacityMul: number; // capacity × capacityMul, floored, min 1
  startGarrisonBonus: number; // extra units on every player tower at createState (capped at capacity)
  unitSpeedMul: number; // unit speed × unitSpeedMul, applied at spawn
}

export const DEFAULT_MODIFIERS: Readonly<PlayerModifiers> = Object.freeze({
  productionMul: 1,
  capacityMul: 1,
  startGarrisonBonus: 0,
  unitSpeedMul: 1,
});

export interface GameState {
  levelId: number;
  seed: number;
  modifiers: PlayerModifiers; // player-only bonuses, fixed for the whole match
  time: number; // ms, advances by TICK_MS
  towers: Record<string, Tower>;
  roads: Record<string, Road>; // lanes (static)
  obstacles: Obstacle[]; // static
  mines: Mine[]; // charges decrease
  units: Unit[];
  links: Link[]; // active attack streams
  boosters: Booster[];
  enemies: EnemyDef[];
  nextUnitId: number;
  rngState: number;
  events: SimEvent[]; // emitted during the last tick; renderer/audio consume then clear
}

export type SimEvent =
  | { type: 'capture'; towerId: string; by: Owner; from: Owner }
  | { type: 'upgrade'; towerId: string; level: number } // auto-upgrade (rules v2)
  | { type: 'linked'; owner: Owner; from: string; to: string }
  | { type: 'unlinked'; owner: Owner; from: string; to: string; reason: UnlinkReason }
  | { type: 'unitDied'; x: number; y: number; owner: Owner; cause: 'clash' | 'artillery' | 'mine' }
  | { type: 'won'; timeMs: number }
  | { type: 'lost'; timeMs: number };

/* ---------- Commands (only way to act on the sim) ---------- */

export type Command =
  | { type: 'link'; owner: Owner; from: string; to: string } // start an attack stream
  | { type: 'unlink'; owner: Owner; from: string; to?: string } // remove one (or all) links of `from`
  /** @deprecated rules v3: the one-shot send is gone; validated and ignored (kept only so old callers compile). */
  | { type: 'sendUnits'; owner: Owner; from: string; to: string; ratio?: number }
  /** @deprecated rules v2: upgrades are automatic; validated and ignored (kept for save/replay compatibility). */
  | { type: 'upgrade'; owner: Owner; towerId: string }
  | { type: 'booster'; owner: Owner; booster: 'overdrive' | 'freeze' | 'airstrike'; towerId?: string };

export type Outcome = 'playing' | 'won' | 'lost';
