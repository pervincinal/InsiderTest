/** Shared simulation contract. Every layer imports from here; only `sim/` mutates these. */

export type Owner = 'neutral' | 'player' | 'enemy1' | 'enemy2' | 'enemy3';
export type EnemyOwner = 'enemy1' | 'enemy2' | 'enemy3';
export type TowerKind = 'barracks' | 'artillery' | 'tankFactory' | 'fortress';
export type UnitKind = 'infantry' | 'tank';
export type Personality = 'rusher' | 'turtle' | 'opportunist';
export type RoadKind = 'road' | 'bridge';

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

export interface RoadDef {
  a: string;
  b: string;
  kind?: RoadKind; // default 'road'
  waypoints?: { x: number; y: number }[];
  mine?: number; // weight killed before the mine is spent
  barrier?: number; // hp that must be worn down before passage
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
  roads: RoadDef[];
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
  linkCursor: number; // round-robin index into this tower's outgoing links (rules v2 draining)
  drainAccMs: number; // accumulated ms toward the next unit leaving through a link
}

export interface Road {
  id: string; // `${a}-${b}` with a < b lexicographically
  a: string;
  b: string;
  kind: RoadKind;
  points: { x: number; y: number }[]; // a → waypoints → b
  length: number; // px
  mine: number; // remaining mine weight, 0 = none
  barrier: number; // remaining barrier hp, 0 = none
  cut: boolean; // bridge destroyed
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
 * Rules v2 (GDD §2.0): a persistent attack stream from `from` to the road-connected `to`. While a
 * tower has ≥ 1 link it drains one unit every `LEAVE_INTERVAL_MS` into its links round-robin.
 */
export interface Link {
  owner: Owner; // owner of `from` when the link was created; the link dies when `from` changes hands
  from: string; // tower id
  to: string; // tower id
  roadId: string;
  createdMs: number; // sim time of the `link` command
}

export type UnlinkReason = 'manual' | 'sourceLost' | 'roadCut' | 'targetFull';

/** @deprecated Legacy one-shot send (`sendUnits`), kept during the transition to links. */
export interface SendQueue {
  owner: Owner;
  from: string;
  to: string;
  roadId: string;
  remaining: number; // units still to leave
  unitKind: UnitKind;
  nextLeaveMs: number; // sim time when next unit leaves
}

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
  productionMul: number; // generation interval ÷ productionMul (multiplicative with overdrive)
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
  roads: Record<string, Road>;
  units: Unit[];
  links: Link[]; // active attack streams (rules v2)
  queues: SendQueue[]; // legacy `sendUnits` queues
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
  | { type: 'unitDied'; x: number; y: number; owner: Owner; cause: 'clash' | 'artillery' | 'mine' | 'barrier' | 'bridge' }
  | { type: 'bridgeCut'; roadId: string }
  | { type: 'won'; timeMs: number }
  | { type: 'lost'; timeMs: number };

/* ---------- Commands (only way to act on the sim) ---------- */

export type Command =
  | { type: 'link'; owner: Owner; from: string; to: string } // rules v2: start an attack stream
  | { type: 'unlink'; owner: Owner; from: string; to?: string } // remove one (or all) links of `from`
  /** @deprecated legacy one-shot send; prefer `link`. */
  | { type: 'sendUnits'; owner: Owner; from: string; to: string; ratio?: number } // ratio default 1
  /** @deprecated rules v2: upgrades are automatic; validated and ignored (kept for save/replay compatibility). */
  | { type: 'upgrade'; owner: Owner; towerId: string }
  | { type: 'cutBridge'; owner: Owner; roadId: string }
  | { type: 'booster'; owner: Owner; booster: 'overdrive' | 'freeze' | 'airstrike'; towerId?: string };

export type Outcome = 'playing' | 'won' | 'lost';
