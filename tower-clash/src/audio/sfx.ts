import type { GameState, Owner, SimEvent } from '../sim/types';
import type { Synth } from './synth';
import { chunkBackoff, loadChunk } from '../lazyChunk';

/**
 * Sound-effect player (rate limits; the recipes are a lazy chunk, src/audio/recipes.ts) plus the pure
 * mapping from sim events to sounds. Nothing here touches the DOM.
 */

export type SfxName =
  | 'send'
  | 'arrive'
  | 'capture'
  | 'upgrade'
  | 'unitDied'
  | 'artillery'
  | 'won'
  | 'lost'
  | 'button'
  /** A refused tap: link limit, blocked lane or empty source (`PlayGestures.limitHint`, ART-9). */
  | 'refuse'
  /** The stalemate hint toast (`hint.stalemate`, ART-9). */
  | 'stalemate'
  /** AUD-F1: a hostile landing on a player tower, or the player losing one (rate-limited per tower and globally, recipes.ts `playHits`). */
  | 'hit'
  /** AUD-F2: a unit killed by a mine (replaces the clash-death noise for that cause). */
  | 'mine';

/** `gain`: we captured it; `loss`: an enemy took ours; `other`: an enemy took neutral/another enemy's. */
export type CaptureKind = 'gain' | 'loss' | 'other';

export interface SfxOptions {
  /** `send`: number of units leaving (pitch rises with it, capped at SEND_PITCH_CAP). */
  count?: number;
  /** `capture`: which side the capture is for. Default 'other'. */
  capture?: CaptureKind;
  /** `hit`: the landing unit's weight (a tank, 5, knocks lower and longer). Default 1. */
  weight?: number;
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

/** Sound-effect recipes; loaded lazily (`loadSfxRecipes`). */
export type SfxRecipe = (synth: Synth, name: SfxName, opts: SfxOptions) => void;

/** AUD-F1 hit limiter state (the logic is recipes.ts `playHits`, lazy): wall-clock ms of the last hit per tower and of the last one overall. */
export interface HitState {
  at: Map<string, number>;
  last: number;
}

/** recipes.ts `playHits`: `fire(weight)` for each hostile landing on, or loss of, a `me` tower that the limits in `st` let through. */
export type HitsFn = (
  events: readonly SimEvent[],
  me: Owner,
  towers: Readonly<Record<string, { owner: Owner }>>,
  st: HitState,
  nowMs: number,
  fire: (weight: number) => void,
) => void;

const RECIPES_CHUNK = 'sfxRecipes';
let recipe: SfxRecipe | null = null;
let hits: HitsFn | null = null;
let recipePromise: Promise<SfxRecipe> | null = null;

/**
 * Load the recipes chunk (idempotent; resolves at once when loaded; a failed download is forgotten
 * so the next call retries — src/lazyChunk.ts re-fetches under a fresh URL).
 */
export function loadSfxRecipes(): Promise<SfxRecipe> {
  recipePromise ??= loadChunk(RECIPES_CHUNK, () => import('./recipes'))
    .then((m) => ((hits = m.playHits), (recipe = m.playRecipe)))
    .catch((err: unknown) => {
      recipePromise = null;
      throw err;
    });
  return recipePromise;
}

/** The recipes if loaded; otherwise starts the load (with a back-off after a failure) and returns null. */
function recipeNow(): SfxRecipe | null {
  if (!recipe && !chunkBackoff(RECIPES_CHUNK)) void loadSfxRecipes().catch(() => undefined);
  return recipe;
}

/** The AUD-F1 hit mapping + limiter from the recipes chunk, or null (and the load started) until it is in. */
export function hitsNow(): HitsFn | null {
  recipeNow();
  return hits;
}

/** Plays named sounds through a synth, applying per-sound rate limits. */
export class SfxPlayer {
  private lastPlayed = new Map<SfxName, number>();

  constructor(private readonly synth: Synth) {}

  /** Returns true when the sound was actually scheduled (false: muted, no context, recipes not loaded yet, rate-limited). */
  play(name: SfxName, opts: SfxOptions = {}): boolean {
    if (!this.synth.context || this.synth.muted) return false;
    const play = recipeNow();
    if (!play) return false;
    const limit = RATE_LIMIT_S[name];
    const now = this.synth.now();
    if (limit !== undefined) {
      const last = this.lastPlayed.get(name);
      if (last !== undefined && now - last < limit - LIMIT_EPS_S) return false;
      this.lastPlayed.set(name, now);
    }
    play(this.synth, name, opts);
    return true;
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
