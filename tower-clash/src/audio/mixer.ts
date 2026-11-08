/**
 * AUD-F6 mixer: three buses into the master gain, a brick-wall-ish limiter after it, and the music's
 * duck. Lazy: src/audio/recipes.ts (the SFX chunk) and src/audio/music.ts (the music chunk) both import
 * it, so it is built on the first sound effect or the first music start, never in the eager bundle.
 *
 *   SFX bus (play sounds)   ─┐
 *   UI bus  (taps, toasts)  ─┼→ master (0.5) → limiter → trim → destination
 *   Music bus → duck        ─┘
 *
 * The Effects setting (`Synth.muted`) gates SFX + UI, the Music setting (`Synth.musicOff`) the music
 * bus; both are bus gains, so a toggle also silences what is already ringing. Nothing here touches the DOM.
 */
import type { CaptureKind, SfxName, SfxOptions } from './sfx';
import type { AudioNodeLike, AudioParamLike, CompressorNodeLike, GainNodeLike, MixHandle, Synth } from './synth';

export type BusName = 'sfx' | 'ui' | 'music';

/** Decibels → linear gain. */
export const dbToGain = (db: number): number => Math.pow(10, db / 20);

/** Bus levels in dB (the slider positions a future volume setting would move). */
export const BUS_DB: Readonly<Record<BusName, number>> = Object.freeze({ sfx: 0, ui: 0, music: -10 });

/**
 * Limiter: a DynamicsCompressor at its hardest (knee 0, ratio 20, 2 ms attack) catching the sum just
 * under −6 dBFS (a win stacks 11 voices). WebAudio adds an automatic make-up gain of 0.6 × the
 * full-range reduction (+3.4 dB here); `trimDb` takes it back off so nothing under the threshold
 * changes level.
 */
export const LIMITER = Object.freeze({ thresholdDb: -6, knee: 0, ratio: 20, attackS: 0.002, releaseS: 0.12, trimDb: -3.42 });

/** Music duck: −6 dB with a 20 ms attack, held DUCK.holdS (or a stinger's length), released over 250 ms. */
export const DUCK = Object.freeze({ db: -6, attackS: 0.02, holdS: 0.3, releaseS: 0.25 });
const DUCK_GAIN = dbToGain(DUCK.db);

/**
 * AUD-M1 voice cap: SFX + UI voices scheduled or ringing at once (the music loop's ≤ 10 are its own budget). A sound
 * that ducks the music (`duckFor`: own / lost captures, the outcome, the result card, the stalemate hint) may fill
 * the cap; every other sound leaves `reserve` voices free for them. A play that does not fit is skipped whole (never
 * a partial chord); the rate limits (sfxRules.ts) keep this rare — 20× autoplay never reaches it (tests/audio/voiceCap.test.ts).
 */
export const VOICE_CAP = Object.freeze({ max: 24, reserve: 8 });
/** The most voices one play of each sound schedules (recipes.ts `voices`, outcomeCues.ts; pinned by tests/audio/voiceCap.test.ts). */
export const VOICES: Readonly<Record<SfxName, number>> = Object.freeze({
  send: 1,
  arrive: 1,
  capture: 3,
  upgrade: 4,
  unitDied: 1,
  artillery: 3,
  won: 3,
  lost: 4,
  button: 1,
  refuse: 2,
  stalemate: 2,
  hit: 2,
  mine: 3,
  freeze: 5,
  overdrive: 3,
  purchase: 3,
  reward: 4,
  unlock: 4,
  achievement: 4,
  tally: 1,
  tankArrive: 2,
  airstrike: 4,
});

/** Taps, menu clicks and toasts (AUD-F8: the shop / reward / unlock / achievement toasts' sounds): the UI bus. Every other sound (and any recipe added later) is a play sound: SFX. */
const UI_SOUNDS: ReadonlySet<SfxName> = new Set<SfxName>(['button', 'refuse', 'stalemate', 'purchase', 'reward', 'unlock', 'achievement']);
/** Captures that duck the music (an enemy taking a neutral is a quiet blip: no duck, no pumping late in a match). */
const DUCK_CAPTURES: ReadonlySet<CaptureKind> = new Set<CaptureKind>(['gain', 'loss']);
/**
 * AUD-F9: the outcome tick (`won` / `lost` without a `step`) holds the duck over the whole result sequence:
 * the 600 ms result beat (src/ui/play.ts `RESULT_BEAT_MS`) plus the card's last cue (src/audio/resultCues.ts
 * — the gold count ends at 1 700 ms; the defeat chord lands at 170 ms and rings 480 ms).
 */
export const OUTCOME_HOLD_S: Readonly<Partial<Record<SfxName, number>>> = Object.freeze({ won: 2.3, lost: 1.25 });
/** Sounds that play over the result card (a star chord, the defeat chord, a gold tick): a short duck inside the outcome's. */
const CARD_SOUNDS: ReadonlySet<SfxName> = new Set<SfxName>(['won', 'lost', 'tally']);

export function busFor(name: SfxName): BusName {
  return UI_SOUNDS.has(name) ? 'ui' : 'sfx';
}

/** Seconds the music ducks for `name` (null: it does not duck): own / lost captures, the outcome and the result card's cues, the stalemate hint / card. */
export function duckFor(name: SfxName, opts: SfxOptions = {}): number | null {
  if (name === 'capture') return DUCK_CAPTURES.has(opts.capture ?? 'other') ? DUCK.holdS : null;
  if (name === 'stalemate') return DUCK.holdS;
  if (isOutcome(name, opts)) return OUTCOME_HOLD_S[name]!;
  return CARD_SOUNDS.has(name) ? DUCK.holdS : null;
}

/** AUD-F9: the outcome tick — `won` / `lost` from the sim event, before the result card's cues (which carry a `step`). */
export function isOutcome(name: SfxName, opts: SfxOptions): boolean {
  return (name === 'won' || name === 'lost') && opts.step === undefined;
}

/** One planned duck: the gain at `from` when it started at `start`, held at DUCK_GAIN until `until`. */
export interface DuckPlan {
  start: number;
  from: number;
  until: number;
}

/** The duck gain at audio time `t` under `plan` (linear ramps, as scheduled). Pure: the tests' timeline. */
export function duckLevel(plan: DuckPlan | null, t: number): number {
  if (!plan || t >= plan.until + DUCK.releaseS) return 1;
  if (t >= plan.until) return DUCK_GAIN + ((1 - DUCK_GAIN) * (t - plan.until)) / DUCK.releaseS;
  if (t >= plan.start + DUCK.attackS) return DUCK_GAIN;
  return plan.from + ((DUCK_GAIN - plan.from) * Math.max(0, t - plan.start)) / DUCK.attackS;
}

export interface Mix extends MixHandle {
  sfx: GainNodeLike;
  ui: GainNodeLike;
  music: GainNodeLike;
  duck: GainNodeLike;
  limiter: CompressorNodeLike | null;
  plan: DuckPlan | null;
  /** A result stinger played: the music drops its pulse layer until the play screen goes away. */
  ended: boolean;
  /** The running music loop (src/audio/music.ts), read by src/audio/inspect.ts; null while it is stopped. */
  loop: { readonly step: number; readonly pulse: boolean; readonly tension: boolean; readonly intensity: number } | null;
  /** AUD-M1: the stop times of the SFX / UI voices scheduled so far (pruned as they end), the most at once, and the plays the cap skipped. */
  ends: number[];
  peak: number;
  capped: number;
}

const set = (p: AudioParamLike, v: number): void => {
  p.value = v;
};

/** The synth's mixer, built on its first call once a context exists (null before the first gesture). */
export function mixer(s: Synth): Mix | null {
  if (s.mix) return s.mix as Mix;
  const g = s.graph();
  if (!g) return null;
  const { ctx, master } = g;
  const gain = (to: AudioNodeLike): GainNodeLike => {
    const n = ctx.createGain();
    n.connect(to);
    return n;
  };
  const duck = gain(master);
  let limiter: CompressorNodeLike | null = null;
  if (ctx.createDynamicsCompressor) {
    limiter = ctx.createDynamicsCompressor();
    set(limiter.threshold, LIMITER.thresholdDb);
    set(limiter.knee, LIMITER.knee);
    set(limiter.ratio, LIMITER.ratio);
    set(limiter.attack, LIMITER.attackS);
    set(limiter.release, LIMITER.releaseS);
    master.disconnect();
    master.connect(limiter);
    const trim = ctx.createGain();
    set(trim.gain, dbToGain(LIMITER.trimDb));
    limiter.connect(trim);
    trim.connect(ctx.destination);
  }
  const m: Mix = {
    sfx: gain(master),
    ui: gain(master),
    music: gain(duck),
    duck,
    limiter,
    plan: null,
    ended: false,
    loop: null,
    ends: [],
    peak: 0,
    capped: 0,
    apply() {
      const fx = s.muted ? 0 : 1;
      set(m.sfx.gain, fx * dbToGain(BUS_DB.sfx));
      set(m.ui.gain, fx * dbToGain(BUS_DB.ui));
      set(m.music.gain, s.musicOff ? 0 : dbToGain(BUS_DB.music));
    },
  };
  set(duck.gain, 1);
  m.apply();
  s.mix = m;
  return m;
}

/** Duck the music now for `holdS` (an overlapping duck extends the hold, never stacks the depth); `end`: a result stinger. */
export function duck(s: Synth, holdS: number, end = false): void {
  const m = mixer(s);
  if (!m) return;
  const now = s.now();
  const p = m.duck.gain;
  const from = duckLevel(m.plan, now);
  const until = Math.max(now + Math.max(holdS, DUCK.attackS), m.plan && now < m.plan.until ? m.plan.until : -Infinity);
  p.cancelScheduledValues?.(now);
  p.setValueAtTime(from, now);
  p.linearRampToValueAtTime(DUCK_GAIN, now + DUCK.attackS);
  p.setValueAtTime(DUCK_GAIN, until);
  p.linearRampToValueAtTime(1, until + DUCK.releaseS);
  m.plan = { start: now, from, until };
  if (end) m.ended = true;
}

/** AUD-M1: the SFX / UI voices still scheduled or ringing at `now` (drops the finished ones). */
export function liveVoices(m: Mix, now: number): number {
  let n = 0;
  for (const e of m.ends) if (e > now) m.ends[n++] = e;
  m.ends.length = n;
  return n;
}

/** AUD-M1 recipes.ts `playRecipe`: may a play of `name` start now under VOICE_CAP? (Counts a skipped one in `capped`.) */
export function voiceRoom(s: Synth, name: SfxName, opts: SfxOptions): boolean {
  const m = mixer(s);
  if (!m) return true;
  const room = VOICE_CAP.max - (duckFor(name, opts) === null ? VOICE_CAP.reserve : 0);
  if (liveVoices(m, s.now()) + VOICES[name] <= room) return true;
  m.capped++;
  return false;
}

/** AUD-M1: an SFX / UI voice was scheduled to stop at `end` (every voice of recipes.ts and outcomeCues.ts). */
export function trackVoice(s: Synth, end: number): void {
  const m = s.mix as Mix | null;
  if (!m) return;
  m.ends.push(end);
  m.peak = Math.max(m.peak, liveVoices(m, s.now()));
}

/** recipes.ts `playRecipe`: the bus `name` plays into (null before unlock), ducking the music first when it should. */
export function routeSfx(s: Synth, name: SfxName, opts: SfxOptions): GainNodeLike | null {
  const hold = duckFor(name, opts);
  if (hold !== null) duck(s, hold, isOutcome(name, opts));
  return mixer(s)?.[busFor(name)] ?? null;
}
