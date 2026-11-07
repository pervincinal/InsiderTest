import type { Owner, SimEvent } from '../sim/types';
import type { Synth } from './synth';
import { chunkBackoff, loadChunk } from '../lazyChunk';

/**
 * Sound-effect names and the player's eager half: the recipes chunk (src/audio/recipes.ts) brings the
 * voices, the rate limits, the event mapping and the arrival detector (src/audio/sfxRules.ts, moved
 * out of this eager module by AUD-F6). Nothing here touches the DOM.
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
  | 'mine'
  /** AUD-F3: the player casts Freeze (play.ts `useBooster`; was the `upgrade` arpeggio). */
  | 'freeze'
  /** AUD-F3: the player casts Overdrive (play.ts `useBooster`; was the `upgrade` arpeggio). */
  | 'overdrive'
  /** AUD-F8: a shop purchase (product, crystal → gold, booster crate, skin, permanent upgrade): a coin clink. */
  | 'purchase'
  /** AUD-F8: something granted for free (rewarded video charge / gold, a Continue, the daily reward / chest): a rising sparkle. */
  | 'reward'
  /** AUD-F8: a level unlocked (the result's level skip): a two-note bell. */
  | 'unlock'
  /** AUD-F8: achievements unlocked (the achievements screen): a three-note call. */
  | 'achievement'
  /** AUD-F9: one step of the result card's gold count-up (src/audio/resultCues.ts; ≤ 8 a second). */
  | 'tally'
  /** AUD-F10: one of the player's tanks lands (sfxRules.ts `sfxForEvents`): `arrive` a fifth lower over a thud; it takes two `arrive` slots. */
  | 'tankArrive'
  /** FEEL-1-2: the player's airstrike lands (play.ts `airstrike`; was the gun's `artillery`): a 150 ms whistle, then a thud. */
  | 'airstrike';

/** `gain`: we captured it; `loss`: an enemy took ours; `other`: an enemy took neutral/another enemy's. */
export type CaptureKind = 'gain' | 'loss' | 'other';

export interface SfxOptions {
  /** `send`: number of units leaving (pitch rises with it, capped at SEND_PITCH_CAP). */
  count?: number;
  /** FEEL-1-9 `send`: the stream's `from>to`; a re-link of the same pair within 2 s plays 4 dB softer. */
  pair?: string;
  /** `capture`: which side the capture is for. Default 'other'. */
  capture?: CaptureKind;
  /** `hit`: the landing unit's weight (a tank, 5, knocks lower and longer). Default 1. */
  weight?: number;
  /**
   * AUD-F9 — `won` / `lost`: the result card's cue (src/audio/resultCues.ts): `won` = the chord of star
   * `step` (0–2; `count` = the stars earned, the last one's chord is held over a low C); `lost` = 0, the
   * low chord. Absent: the outcome tick itself (sfxRules.ts) — the FEEL-1-3 sting (src/audio/outcomeCues.ts),
   * the music ducks for the result sequence and drops its pulse and tension layers. `tally`: the gold count's tick index (its pitch climbs with it).
   */
  step?: number;
}

export interface SfxCall {
  name: SfxName;
  opts?: SfxOptions;
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

/** The recipes chunk: voices + recipes (recipes.ts) and the rules it re-exports (sfxRules.ts). */
export type SfxChunk = typeof import('./recipes');
let chunk: SfxChunk | null = null;
let chunkPromise: Promise<SfxChunk> | null = null;

/**
 * Load the recipes chunk (idempotent; resolves at once when loaded; a failed download is forgotten
 * so the next call retries — src/lazyChunk.ts re-fetches under a fresh URL).
 */
export function loadSfxRecipes(): Promise<SfxChunk> {
  chunkPromise ??= loadChunk(RECIPES_CHUNK, () => import('./recipes'))
    .then((m) => (chunk = m))
    .catch((err: unknown) => {
      chunkPromise = null;
      throw err;
    });
  return chunkPromise;
}

/** The recipes chunk if loaded; otherwise starts the load (with a back-off after a failure) and returns null. */
export function sfxNow(): SfxChunk | null {
  if (!chunk && !chunkBackoff(RECIPES_CHUNK)) void loadSfxRecipes().catch(() => undefined);
  return chunk;
}

/** Plays named sounds through a synth, applying per-sound rate limits (sfxRules.ts `rateOk`). */
export class SfxPlayer {
  private readonly last = new Map<SfxName, number>();

  constructor(private readonly synth: Synth) {}

  /** Returns true when the sound was actually scheduled (false: muted, no context, the OS holds the context (AUD-Q19), recipes not loaded yet, rate-limited). */
  play(name: SfxName, opts: SfxOptions = {}): boolean {
    const v = this.synth.live(); // a context, Effects on
    const c = v && v.ctx.state !== 'interrupted' ? sfxNow() : null;
    if (!c || !c.rateOk(this.last, name, this.synth.now())) return false;
    c.playRecipe(this.synth, name, opts);
    return true;
  }
}
