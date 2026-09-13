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

export interface GameState {
  levelId: number;
  seed: number;
  time: number; // ms, advances by TICK_MS
  towers: Record<string, Tower>;
  roads: Record<string, Road>;
  units: Unit[];
  queues: SendQueue[];
  boosters: Booster[];
  enemies: EnemyDef[];
  nextUnitId: number;
  rngState: number;
  events: SimEvent[]; // emitted during the last tick; renderer/audio consume then clear
}

export type SimEvent =
  | { type: 'capture'; towerId: string; by: Owner; from: Owner }
  | { type: 'upgrade'; towerId: string; level: number }
  | { type: 'unitDied'; x: number; y: number; owner: Owner; cause: 'clash' | 'artillery' | 'mine' | 'barrier' | 'bridge' }
  | { type: 'bridgeCut'; roadId: string }
  | { type: 'won'; timeMs: number }
  | { type: 'lost'; timeMs: number };

/* ---------- Commands (only way to act on the sim) ---------- */

export type Command =
  | { type: 'sendUnits'; owner: Owner; from: string; to: string; ratio?: number } // ratio default 1
  | { type: 'upgrade'; owner: Owner; towerId: string }
  | { type: 'cutBridge'; owner: Owner; roadId: string }
  | { type: 'booster'; owner: Owner; booster: 'overdrive' | 'freeze' | 'airstrike'; towerId?: string };

export type Outcome = 'playing' | 'won' | 'lost';
