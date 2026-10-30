/**
 * Enemy memory (AUD-A11, GDD §2.5 "Standoff shield release"). The enemies' controllers are otherwise
 * pure functions of the visible state; this is the one thing they carry from tick to tick, per owner
 * and per match: the standoff timers of their own lanes and the lanes they gave up.
 *
 * A *standoff* is a lane on which an own stream and another enemy's stream run against each other and
 * cancel so that no unit of any owner lands on either tower of the lane for `STANDOFF_RELEASE_MS`. The
 * timer counts from the later of the link's creation and the last landing on either end; any landing on
 * either tower — friendly or hostile — restarts it. At the limit `maintain` stops treating the link as a
 * shield (rule (d)): the enemy drops the stream, and it may not re-link *that lane* until something has
 * landed on either of its two towers again. The player's towers are not part of the rule (AUD-A11
 * brief, 2026-10-30): a hold against the player's held units is kept — releasing it would hand a human
 * the lane for nothing; a player's standoff is §2.4's stalemate card. (The wider class — the player's
 * stream as a rival too — is one predicate here and passed every gate on 2026-10-30 as well.)
 *
 * The AI only runs every `AI_TICK_MS`, so it cannot read every tick's `landed` events; a landing between
 * two AI ticks is read off the visible state instead, which is exact under rules v3: a linked tower
 * grows nothing and a stream costs its source nothing, so a tower in a standoff changes its garrison or
 * its under-fire marker only when something lands on it (a friendly unit adds its weight, a hostile one
 * takes it and re-arms `underFireUntilMs`; a capture changes the owner). Everything a human sees.
 *
 * Deterministic: no clock, no randomness, one observation per sim time (a second call on the same
 * snapshot reads the same memory and issues the same commands). A match that rewinds (Continue) is
 * observed as a jump back in time and the memory starts over — it only ever makes the enemy hold up to
 * `STANDOFF_RELEASE_MS` longer, never less.
 */
import type { GameState, Link, Owner, Tower } from '../sim/index';
import { C } from '../sim/index';
import { isEnemyOwner } from './common';

/** Mutual cancelling on a lane with no landing on either tower for this long releases the enemy's hold, ms. */
export const STANDOFF_RELEASE_MS = 20_000;

/** Lane key of an own link (direction matters: the rival's hold on the same lane is its own). */
export function laneKey(from: string, to: string): string {
  return `${from}>${to}`;
}

interface Seen {
  owner: Owner;
  units: number;
  underFireUntilMs: number;
}

export interface EnemyMemory {
  /** Sim time of the last observation; the memory starts over when time goes backwards. */
  time: number;
  /** Every tower as last observed, to read landings between two AI ticks. */
  seen: Map<string, Seen>;
  /** Standoff timers of own links, lane key → sim time the count started. */
  holds: Map<string, number>;
  /** Lanes given up at the limit: no re-link until something lands on either of their towers. */
  released: Set<string>;
}

export function newMemory(): EnemyMemory {
  return { time: -1, seen: new Map(), holds: new Map(), released: new Set() };
}

/* ---------- per-match default memories (the game client and the headless runner share them) ---------- */

const matches = new WeakMap<GameState, Map<Owner, EnemyMemory>>();

/**
 * The memory of `owner` for the match `state` belongs to: one per owner per state object, created on
 * first use. `createState` makes one object per match, so a seed replays the same memory in the
 * browser, in the headless runner and in a test; a restored snapshot (`cloneState`) is a new match.
 */
export function memoryFor(state: GameState, owner: Owner): EnemyMemory {
  let byOwner = matches.get(state);
  if (!byOwner) {
    byOwner = new Map();
    matches.set(state, byOwner);
  }
  let memory = byOwner.get(owner);
  if (!memory) {
    memory = newMemory();
    byOwner.set(owner, memory);
  }
  return memory;
}

/* ---------- observation ---------- */

/** True when `tower` changed since the memory last saw it: something landed on it (or it changed hands). */
function landedSince(memory: EnemyMemory, tower: Tower): boolean {
  const s = memory.seen.get(tower.id);
  return s !== undefined && (s.units !== tower.units || s.underFireUntilMs !== tower.underFireUntilMs || s.owner !== tower.owner);
}

/** Sim time of the last hostile landing the visible under-fire marker records (−∞ when none since a capture). */
function lastHostileLandingMs(tower: Tower): number {
  return tower.underFireUntilMs > 0 ? tower.underFireUntilMs - C.UNDER_FIRE_MS : -Infinity;
}

/** The rival stream that cancels `link` on its lane, if any (a stream the other way by another owner). */
export function rivalStream(state: GameState, link: Link): Link | undefined {
  return state.links.find((l) => l.from === link.to && l.to === link.from && l.owner !== link.owner);
}

/**
 * Bring the memory up to `state.time`: read the landings since the last observation, restart or start
 * the standoff timers of the owner's links, lift the bar of released lanes that saw a landing, and
 * forget what no longer exists. Once per sim time — a repeated call on the same snapshot is a no-op.
 */
export function observe(memory: EnemyMemory, state: GameState, owner: Owner): void {
  if (state.time === memory.time) return;
  if (state.time < memory.time) {
    memory.seen.clear();
    memory.holds.clear();
    memory.released.clear();
  }
  const towers = state.towers;
  const landed = (id: string): boolean => {
    const t = towers[id];
    return t === undefined || landedSince(memory, t);
  };
  // Released lanes: the bar lifts when something has landed on either end (or the source is no longer ours).
  for (const key of [...memory.released]) {
    const [from, to] = key.split('>') as [string, string];
    const source = towers[from];
    if (!source || source.owner !== owner || landed(from) || landed(to)) memory.released.delete(key);
  }
  // Standoff timers: one per own link into another enemy's tower whose stream back cancels it.
  const live = new Set<string>();
  for (const link of state.links) {
    if (link.owner !== owner) continue;
    const target = towers[link.to];
    if (!target || target.owner === owner || !isEnemyOwner(target.owner)) continue;
    const rival = rivalStream(state, link);
    if (!rival) continue;
    const key = laneKey(link.from, link.to);
    live.add(key);
    const source = towers[link.from]!;
    const since = memory.holds.get(key);
    if (since === undefined) {
      // Counted from the later of the link's creation and the last landing on either end that the state
      // still shows (hostile ones); a friendly landing before the first observation is not visible.
      memory.holds.set(key, Math.max(link.createdMs, rival.createdMs, lastHostileLandingMs(source), lastHostileLandingMs(target)));
    } else if (landed(link.from) || landed(link.to)) {
      memory.holds.set(key, state.time);
    }
  }
  for (const key of [...memory.holds.keys()]) if (!live.has(key)) memory.holds.delete(key);
  // Record every tower for the next observation.
  memory.seen.clear();
  for (const id in towers) {
    const t = towers[id]!;
    memory.seen.set(id, { owner: t.owner, units: t.units, underFireUntilMs: t.underFireUntilMs });
  }
  memory.time = state.time;
}

/**
 * Lanes the owner must not hold or link this tick: the standoffs whose timer has reached
 * `STANDOFF_RELEASE_MS` (their links are released by `maintain`) and the lanes already given up.
 */
export function barredLanes(memory: EnemyMemory, state: GameState): Set<string> {
  const out = new Set<string>(memory.released);
  for (const [key, since] of memory.holds) if (state.time - since >= STANDOFF_RELEASE_MS) out.add(key);
  return out;
}

/**
 * After the tick: a link dropped at the limit stays barred until a landing on either end. A held link
 * ended for another reason (retreat, the upgrade break) is not barred — its timer simply starts over
 * if the standoff forms again.
 */
export function commit(memory: EnemyMemory, state: GameState, ended: readonly Link[]): void {
  for (const link of ended) {
    const key = laneKey(link.from, link.to);
    const since = memory.holds.get(key);
    if (since === undefined) continue;
    memory.holds.delete(key);
    if (state.time - since >= STANDOFF_RELEASE_MS) memory.released.add(key);
  }
}
