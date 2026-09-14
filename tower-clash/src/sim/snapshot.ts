import type { Booster, GameState, Tower } from './types';
import { C } from './constants';
import { capacityOf } from './step';

/*
 * Continue-after-defeat support (ECONOMY.md §3.5, ECON-6).
 *
 * The game loop records the state into a `SnapshotRing` every tick; on defeat the UI asks the ring
 * for the newest snapshot that is at least `C.CONTINUE_REWIND_MS` old, restores it, and calls
 * `applyContinue` to grant the reinforcements. Because the sim is deterministic and `GameState` is
 * plain data, a snapshot is just a deep copy — no DOM, no Date, no Math.random involved.
 */

/** Deep copy of plain data (objects, arrays, primitives). Fallback when `structuredClone` is missing. */
export function deepCopy<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v: unknown) => deepCopy(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key in value as Record<string, unknown>) {
      out[key] = deepCopy((value as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return value;
}

/** Deep, cheap copy of a sim state (or any plain-data record with a `time`). Never shares references with the source. */
export function cloneState<T = GameState>(state: T): T {
  return typeof structuredClone === 'function' ? structuredClone(state) : deepCopy(state);
}

/**
 * Ring of state snapshots indexed by sim time.
 *
 * - `record(state)` stores a copy at most once per `intervalMs` of sim time and forgets snapshots that
 *   are no longer needed to serve a `rewind(capacityMs)` (the newest snapshot that is at least
 *   `capacityMs` old is always kept, so a full rewind is always exact once enough time has passed).
 * - If `state.time` moved backwards (the loop restarted from a restored snapshot), snapshots from the
 *   abandoned future are discarded first.
 * - `rewind(ms)` returns a fresh copy of the newest snapshot at least `ms` older than the last
 *   recorded time, or the oldest snapshot if none is that old, or `null` when empty.
 *
 * Generic so the loop can snapshot `GameState` together with anything else it needs to replay
 * (e.g. the AI's `Rng` state, which lives outside `GameState`); the item only needs a `time`.
 */
export class SnapshotRing<T extends { time: number } = GameState> {
  private readonly ring: T[] = [];
  private latestTime = -Infinity;

  constructor(
    public readonly intervalMs: number = C.SNAPSHOT_INTERVAL_MS,
    public readonly capacityMs: number = C.SNAPSHOT_CAPACITY_MS,
  ) {
    if (!(intervalMs > 0)) throw new Error('SnapshotRing: intervalMs must be > 0');
    if (!(capacityMs >= 0)) throw new Error('SnapshotRing: capacityMs must be >= 0');
  }

  /** Number of snapshots currently held. */
  get size(): number {
    return this.ring.length;
  }

  /** Sim times of the held snapshots, oldest first (for tests and debugging). */
  times(): number[] {
    return this.ring.map((s) => s.time);
  }

  /** Store a copy of `state` if at least `intervalMs` passed since the previous snapshot. Returns whether it was stored. */
  record(state: T): boolean {
    const now = state.time;
    // Timeline rewritten (loop resumed from an older snapshot): drop the future that no longer exists.
    while (this.ring.length && this.ring[this.ring.length - 1]!.time >= now) this.ring.pop();
    this.latestTime = now;
    const last = this.ring[this.ring.length - 1];
    if (last !== undefined && now - last.time < this.intervalMs) return false;
    this.ring.push(cloneState(state));
    // Forget snapshots that a newer one already covers for the full rewind window.
    while (this.ring.length >= 2 && now - this.ring[1]!.time >= this.capacityMs) this.ring.shift();
    return true;
  }

  /** Newest snapshot at least `ms` older than the last recorded time (or the oldest); `null` when empty. */
  rewind(ms: number): T | null {
    if (this.ring.length === 0) return null;
    let pick = this.ring[0]!;
    for (let i = this.ring.length - 1; i >= 0; i--) {
      const s = this.ring[i]!;
      if (this.latestTime - s.time >= ms) {
        pick = s;
        break;
      }
    }
    return cloneState(pick);
  }

  clear(): void {
    this.ring.length = 0;
    this.latestTime = -Infinity;
  }
}

export interface ContinueOptions {
  freezeMs: number; // duration of the free freeze, from state.time
  infantry: number; // reinforcements (weight) added to the player's strongest tower, capped at capacity
}

/** The player's highest-garrison tower (first in insertion order on ties), or undefined if the player owns none. */
export function strongestPlayerTower(state: GameState): Tower | undefined {
  let best: Tower | undefined;
  for (const id in state.towers) {
    const t = state.towers[id]!;
    if (t.owner !== 'player') continue;
    if (best === undefined || t.units > best.units) best = t;
  }
  return best;
}

/**
 * Grant the "Reinforcements" continue on a (restored) state: `infantry` units to the player's
 * highest-garrison tower (capped at its capacity) and a player `freeze` booster until
 * `state.time + freezeMs`. Mutates and returns the same state; stale tick events are cleared so the
 * renderer does not replay them. Returns `null` (state untouched) if the player owns no tower — the
 * UI then falls back to a restart.
 */
export function applyContinue(
  state: GameState,
  opts: Readonly<ContinueOptions> = { freezeMs: C.CONTINUE_FREEZE_MS, infantry: C.CONTINUE_INFANTRY },
): GameState | null {
  const tower = strongestPlayerTower(state);
  if (!tower) return null;
  const infantry = Math.max(0, Math.floor(opts.infantry));
  tower.units = Math.min(capacityOf(tower, state), tower.units + infantry);
  if (opts.freezeMs > 0) {
    const booster: Booster = { type: 'freeze', owner: 'player', untilMs: state.time + opts.freezeMs };
    state.boosters.push(booster);
  }
  state.events = [];
  return state;
}
