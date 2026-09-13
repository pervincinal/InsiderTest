import type { GameState, Owner, SimEvent } from '../sim/types';
import type { Synth } from './synth';

/**
 * Sound-effect recipes on top of the synth, plus the pure mapping from sim events to sounds.
 * Every sound is ≤ 400 ms except `won`/`lost`. Nothing here touches the DOM.
 */

export type SfxName =
  | 'send'
  | 'arrive'
  | 'capture'
  | 'upgrade'
  | 'unitDied'
  | 'artillery'
  | 'bridgeCut'
  | 'won'
  | 'lost'
  | 'button';

/** `gain`: we captured it; `loss`: an enemy took ours; `other`: an enemy took neutral/another enemy's. */
export type CaptureKind = 'gain' | 'loss' | 'other';

export interface SfxOptions {
  /** `send`: number of units leaving (pitch rises with it, capped at SEND_PITCH_CAP). */
  count?: number;
  /** `capture`: which side the capture is for. Default 'other'. */
  capture?: CaptureKind;
}

export interface SfxCall {
  name: SfxName;
  opts?: SfxOptions;
}

/** Units beyond this no longer raise the `send` pitch. */
export const SEND_PITCH_CAP = 20;
/** Minimum spacing between two plays of the same rate-limited sound, in seconds. */
export const RATE_LIMIT_S: Readonly<Partial<Record<SfxName, number>>> = Object.freeze({
  arrive: 0.1, // ≤ 10/s
  unitDied: 0.08,
  artillery: 0.1,
  send: 0.05,
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

/** Plays named sounds through a synth, applying per-sound rate limits. */
export class SfxPlayer {
  private lastPlayed = new Map<SfxName, number>();

  constructor(private readonly synth: Synth) {}

  /** Returns true when the sound was actually scheduled (false: muted, no context, rate-limited). */
  play(name: SfxName, opts: SfxOptions = {}): boolean {
    if (!this.synth.context || this.synth.muted) return false;
    const limit = RATE_LIMIT_S[name];
    const now = this.synth.now();
    if (limit !== undefined) {
      const last = this.lastPlayed.get(name);
      if (last !== undefined && now - last < limit - LIMIT_EPS_S) return false;
      this.lastPlayed.set(name, now);
    }
    this.recipe(name, opts);
    return true;
  }

  private recipe(name: SfxName, opts: SfxOptions): void {
    const s = this.synth;
    switch (name) {
      case 'send':
        s.blip(sendPitchHz(opts.count ?? 1), 60, 'triangle', { gain: 0.22 });
        return;
      case 'arrive':
        s.blip(760, 28, 'sine', { gain: 0.08 });
        return;
      case 'capture':
        playCapture(s, opts.capture ?? 'other');
        return;
      case 'upgrade':
        // Sparkle arpeggio: four quick sine notes stepping up a major chord.
        [880, 1108.7, 1318.5, 1760].forEach((hz, i) => s.blip(hz, 120, 'sine', { gain: 0.16, delayS: i * 0.06 }));
        return;
      case 'unitDied':
        s.noiseBurst(70, 700, { gain: 0.14 });
        return;
      case 'artillery':
        s.sweep(170, 40, 260, 'sine', { gain: 0.5 });
        s.noiseBurst(120, 350, { gain: 0.25 });
        return;
      case 'bridgeCut':
        // Wood crack: bright noise snap then a short low body knock.
        s.noiseBurst(90, 2600, { gain: 0.35, filter: 'bandpass' });
        s.noiseBurst(220, 500, { gain: 0.2, delayS: 0.03 });
        s.blip(95, 150, 'square', { gain: 0.12, delayS: 0.02 });
        return;
      case 'won':
        // 4-note fanfare: C5 E5 G5 C6, the last held.
        [523.3, 659.3, 784, 1046.5].forEach((hz, i) => {
          const last = i === 3;
          s.blip(hz, last ? 520 : 160, 'triangle', { gain: 0.3, delayS: i * 0.15 });
          s.blip(hz / 2, last ? 520 : 160, 'sine', { gain: 0.14, delayS: i * 0.15 });
        });
        return;
      case 'lost':
        // Descending minor: E5 D5 C5 A4, slowing down.
        [659.3, 587.3, 523.3, 440].forEach((hz, i) =>
          s.blip(hz, i === 3 ? 600 : 220, 'sawtooth', { gain: 0.14, delayS: i * 0.22 }),
        );
        return;
      case 'button':
        s.blip(1400, 24, 'square', { gain: 0.08 });
        return;
    }
  }
}

function playCapture(s: Synth, kind: CaptureKind): void {
  switch (kind) {
    case 'gain':
      // Two-note rising major chime.
      s.blip(659.3, 140, 'triangle', { gain: 0.28 });
      s.blip(1046.5, 220, 'triangle', { gain: 0.28, delayS: 0.11 });
      return;
    case 'loss':
      // Low thud.
      s.sweep(140, 45, 240, 'sine', { gain: 0.45 });
      s.noiseBurst(90, 250, { gain: 0.2 });
      return;
    case 'other':
      s.blip(330, 90, 'triangle', { gain: 0.1 });
      return;
  }
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
        out.push({ name: ev.cause === 'artillery' ? 'artillery' : 'unitDied' });
        break;
      case 'bridgeCut':
        out.push({ name: 'bridgeCut' });
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
