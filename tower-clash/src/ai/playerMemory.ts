/**
 * Reference player memory (AUD-A9, GDD §2.5 "Passive towers"). The bot plans its attacks against the
 * shields a defender *could* raise (`anticipatedShield`: a tower with a link to spare streams back on
 * every lane it can match), which is right against an enemy that defends and a deadlock against one
 * that never does: a tutorial enemy below `DEFENCE_MIN_AGGRESSION` raises no shield, the planner never
 * finds a plan that survives the shields it assumes, and a full map freezes (level 4 with the bot
 * starting at 20 s: every tower at L3/100, no ribbon from 95 s). The enemy's aggression is not
 * visible; what a human sees is the tower's behaviour, and this is the one thing the bot carries from
 * tick to tick: per enemy tower, how long our streams have run into it since it last streamed back on
 * one of those lanes.
 *
 * A tower is *passive* when it has been under our streams for `SHIELD_WATCH_MS` in all since its last
 * shield (never shielded: since the match began) — the planner then stops anticipating its shields
 * and attacks it with the plain parity rule (`siegePlan` on what is on the map). A shield seen on it
 * (its stream back on a lane we stream on) starts the count over. A tower we never streamed into is
 * not passive: it never had an occasion to shield (the free probe in `referencePlayer.ts` gives it
 * one). The count survives the end of the stream that earned it: a tower that showed its hand stays
 * read until it shields.
 *
 * Deterministic like the enemies' memory (`memory.ts`): no clock, no randomness, one observation per
 * sim time (a second call on the same snapshot reads the same memory and issues the same commands); a
 * match that rewinds (Continue) is observed as a jump back in time and the memory starts over.
 */
import type { GameState, Owner } from '../sim/index';
import { isEnemyOwner } from './common';

/** A tower under our streams this long since its last shield (or ever) is passive, ms. */
export const SHIELD_WATCH_MS = 20_000;

export interface PlayerMemory {
  /** Sim time of the last observation; the memory starts over when time goes backwards. */
  time: number;
  /** Enemy tower id → ms our streams have run into it since its last shield (or since first seen). */
  watched: Map<string, number>;
}

export function newPlayerMemory(): PlayerMemory {
  return { time: -1, watched: new Map() };
}

const matches = new WeakMap<GameState, PlayerMemory>();

/**
 * The reference player's memory for the match `state` belongs to: one per state object, created on
 * first use (`createState` makes one object per match; a restored snapshot is a new match).
 */
export function playerMemoryFor(state: GameState): PlayerMemory {
  let memory = matches.get(state);
  if (!memory) {
    memory = newPlayerMemory();
    matches.set(state, memory);
  }
  return memory;
}

/**
 * Bring the memory up to `state.time`: every enemy tower our streams run into is credited the time
 * since the last observation (nothing on the first one), a tower streaming back on one of those lanes
 * this tick starts its count over, and a tower that is no longer an enemy's is forgotten. Once per sim
 * time — a repeated call on the same snapshot is a no-op.
 */
export function observePlayer(memory: PlayerMemory, state: GameState, owner: Owner): void {
  if (state.time === memory.time) return;
  if (state.time < memory.time) memory.watched.clear();
  const dt = memory.time < 0 || state.time < memory.time ? 0 : state.time - memory.time;
  const pressed = new Set<string>();
  const shielding = new Set<string>();
  for (const link of state.links) {
    if (link.owner !== owner) continue;
    const target = state.towers[link.to];
    if (!target || !isEnemyOwner(target.owner)) continue;
    pressed.add(link.to);
    if (state.links.some((l) => l.owner === target.owner && l.from === link.to && l.to === link.from)) shielding.add(link.to);
  }
  for (const id of [...memory.watched.keys()]) {
    const t = state.towers[id];
    if (!t || !isEnemyOwner(t.owner)) memory.watched.delete(id);
  }
  for (const id of pressed) memory.watched.set(id, shielding.has(id) ? 0 : (memory.watched.get(id) ?? 0) + dt);
  memory.time = state.time;
}

/** True when the tower has been under our streams for `SHIELD_WATCH_MS` since its last shield: its shields are no longer anticipated. */
export function isPassive(memory: PlayerMemory, towerId: string): boolean {
  return (memory.watched.get(towerId) ?? 0) >= SHIELD_WATCH_MS;
}
