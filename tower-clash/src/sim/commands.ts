import type { Command, GameState } from './types';
import { C } from './constants';
import { roadIdFor } from './geometry';
import { linksFrom, maxLinksOf, removeLink } from './step';

/**
 * Apply a command to the state. Invalid commands (wrong owner, no lane, unknown tower, …)
 * are ignored silently — the sim never throws on input.
 */
export function applyCommand(state: GameState, cmd: Command): void {
  if (cmd.owner === 'neutral') return;
  switch (cmd.type) {
    case 'link':
      link(state, cmd);
      return;
    case 'unlink':
      unlink(state, cmd);
      return;
    case 'sendUnits':
      // Rules v3: the legacy one-shot send no longer exists; the command is accepted and ignored.
      return;
    case 'upgrade':
      upgrade(state, cmd);
      return;
    case 'booster':
      booster(state, cmd);
      return;
  }
}

/**
 * Rules v3: start a persistent stream `from → to`. Valid when the owner holds `from`, a lane joins the
 * two towers, the link does not already exist and `from` is under its per-level link limit.
 * A source holding < 1 unit may be linked; the next tick ends the link with `sourceEmpty`.
 */
function link(state: GameState, cmd: Extract<Command, { type: 'link' }>): void {
  const from = state.towers[cmd.from];
  const to = state.towers[cmd.to];
  if (!from || !to || from === to || from.owner !== cmd.owner) return;
  if (from.units < 1) return; // rules v3 rule 6: a stream needs soldiers (an empty tower is left to grow)
  const road = state.roads[roadIdFor(from.id, to.id)];
  if (!road) return;
  const existing = linksFrom(state, from.id);
  if (existing.some((l) => l.to === to.id)) return;
  if (existing.length >= maxLinksOf(from)) return;
  state.links.push({ owner: cmd.owner, from: from.id, to: to.id, roadId: road.id, createdMs: state.time, emitAccMs: 0 });
  state.events.push({ type: 'linked', owner: cmd.owner, from: from.id, to: to.id });
}

/** Remove one (`to` given) or every link leaving `from`, if they belong to the owner. */
function unlink(state: GameState, cmd: Extract<Command, { type: 'unlink' }>): void {
  for (const l of linksFrom(state, cmd.from)) {
    if (l.owner !== cmd.owner) continue;
    if (cmd.to !== undefined && l.to !== cmd.to) continue;
    removeLink(state, l, 'manual');
  }
}

/**
 * @deprecated Rules v2: towers upgrade automatically when full (see `tryAutoUpgrade`). The command is
 * still accepted for save/replay compatibility but changes nothing.
 */
function upgrade(state: GameState, cmd: Extract<Command, { type: 'upgrade' }>): void {
  const tower = state.towers[cmd.towerId];
  if (!tower || tower.owner !== cmd.owner) return;
  // intentionally a no-op
}

function booster(state: GameState, cmd: Extract<Command, { type: 'booster' }>): void {
  switch (cmd.booster) {
    case 'overdrive':
      state.boosters.push({ type: 'overdrive', owner: cmd.owner, untilMs: state.time + C.OVERDRIVE_MS });
      return;
    case 'freeze':
      state.boosters.push({ type: 'freeze', owner: cmd.owner, untilMs: state.time + C.FREEZE_MS });
      return;
    case 'airstrike': {
      if (cmd.towerId === undefined) return;
      const tower = state.towers[cmd.towerId];
      if (!tower || tower.owner === cmd.owner || tower.owner === 'neutral') return;
      tower.units = Math.max(0, tower.units - C.AIRSTRIKE_DAMAGE);
      return;
    }
  }
}
