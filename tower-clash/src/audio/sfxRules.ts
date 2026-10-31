/**
 * The sound-effect rules: the pure mapping from sim events to sounds, the arrival detector, the
 * per-sound rate limits and the send pitch. Lazy: re-exported by src/audio/recipes.ts, so it rides in
 * the recipes chunk (AUD-F6 moved it out of the eager src/audio/sfx.ts to pay for the mixer and music
 * hooks); before that chunk is in nothing plays anyway. Nothing here touches the DOM.
 */
import type { GameState, Owner, SimEvent } from '../sim/types';
import type { SfxCall, SfxName } from './sfx';

/** Units beyond this no longer raise the `send` pitch. */
export const SEND_PITCH_CAP = 20;
/** Minimum spacing between two plays of the same rate-limited sound, in seconds. */
export const RATE_LIMIT_S: Readonly<Partial<Record<SfxName, number>>> = Object.freeze({
  arrive: 0.1, // ≤ 10/s
  unitDied: 0.08,
  artillery: 0.1,
  send: 0.05,
  refuse: 0.12, // a tap-spam of refusals is one thud per tap, never a rumble
  mine: 0.12, // a column walking over a mine is one blast per kill up to ≈ 8/s (`hit` is limited in recipes.ts `playHits`)
});

/** Tolerance for clock arithmetic so a gap of exactly the limit is accepted. */
const LIMIT_EPS_S = 1e-6;
const SEND_BASE_HZ = 520;
/** One octave across the whole cap range. */
const SEND_OCTAVE_SPAN = 1;

/** Pitch of the `send` tick for `count` units: rises smoothly, capped. Exported for tests. */
export function sendPitchHz(count: number): number {
  const n = Math.max(1, Math.min(SEND_PITCH_CAP, Math.floor(count)));
  return SEND_BASE_HZ * Math.pow(2, (SEND_OCTAVE_SPAN * (n - 1)) / (SEND_PITCH_CAP - 1));
}

/** `SfxPlayer.play`: may `name` play at clock time `now` (seconds)? Records the play in `last` when it may. */
export function rateOk(last: Map<SfxName, number>, name: SfxName, now: number): boolean {
  const limit = RATE_LIMIT_S[name];
  if (limit === undefined) return true;
  const at = last.get(name);
  if (at !== undefined && now - at < limit - LIMIT_EPS_S) return false;
  last.set(name, now);
  return true;
}

/* ---------- sim events → sounds (pure) ---------- */

/** Map a batch of sim events to sound calls. `me` is the local player; `towers` resolves upgrade owners. */
export function sfxForEvents(
  events: readonly SimEvent[],
  me: Owner = 'player',
  towers: Readonly<Record<string, { owner: Owner }>> = {},
): SfxCall[] {
  const out: SfxCall[] = [];
  for (const ev of events) {
    switch (ev.type) {
      case 'capture':
        out.push({ name: 'capture', opts: { capture: ev.by === me ? 'gain' : ev.from === me ? 'loss' : 'other' } });
        break;
      case 'upgrade':
        // Enemy upgrades stay silent: the sparkle is feedback for the player's own tap.
        if (towers[ev.towerId]?.owner === me) out.push({ name: 'upgrade' });
        break;
      case 'unitDied':
        // AUD-F2: a mine kill has its own blast; artillery its shell; a clash the short crackle
        out.push({ name: ev.cause === 'clash' ? 'unitDied' : ev.cause });
        break;
      case 'won':
        out.push({ name: 'won' });
        break;
      case 'lost':
        out.push({ name: 'lost' });
        break;
    }
  }
  return out;
}

/**
 * The sim emits no "arrived" event, so arrivals of the player's own units are detected by diffing
 * `state.units` between frames: a unit that vanished without a matching `unitDied` event arrived.
 */
export class ArrivalTracker {
  private previous = new Map<number, Owner>();
  private pendingDeaths = 0;

  constructor(private readonly me: Owner = 'player') {}

  /** Call with each event batch before `tick` so deaths are not mistaken for arrivals. */
  noteEvents(events: readonly SimEvent[]): void {
    for (const ev of events) if (ev.type === 'unitDied' && ev.owner === this.me) this.pendingDeaths++;
  }

  /** Returns how many of the player's units arrived since the last call. */
  tick(state: Pick<GameState, 'units'>): number {
    const current = new Map<number, Owner>();
    for (const u of state.units) current.set(u.id, u.owner);
    let vanished = 0;
    for (const [id, owner] of this.previous) if (owner === this.me && !current.has(id)) vanished++;
    this.previous = current;
    const arrived = Math.max(0, vanished - this.pendingDeaths);
    this.pendingDeaths = 0;
    return arrived;
  }

  reset(): void {
    this.previous.clear();
    this.pendingDeaths = 0;
  }
}
