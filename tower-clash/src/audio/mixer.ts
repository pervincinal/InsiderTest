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

/** Taps, menu clicks and toasts: the UI bus. Every other sound (and any recipe added later) is a play sound: SFX. */
const UI_SOUNDS: ReadonlySet<SfxName> = new Set<SfxName>(['button', 'refuse', 'stalemate']);
/** Captures that duck the music (an enemy taking a neutral is a quiet blip: no duck, no pumping late in a match). */
const DUCK_CAPTURES: ReadonlySet<CaptureKind> = new Set<CaptureKind>(['gain', 'loss']);
/** The result stingers hold the duck for their own length (recipes.ts: the fanfare ≈ 0.97 s, the descent ≈ 1.26 s). */
const STINGER_HOLD_S: Readonly<Partial<Record<SfxName, number>>> = Object.freeze({ won: 0.97, lost: 1.26 });

export function busFor(name: SfxName): BusName {
  return UI_SOUNDS.has(name) ? 'ui' : 'sfx';
}

/** Seconds the music ducks for `name` (null: it does not duck): own / lost captures, the result stingers, the stalemate hint / card. */
export function duckFor(name: SfxName, opts: SfxOptions = {}): number | null {
  if (name === 'capture') return DUCK_CAPTURES.has(opts.capture ?? 'other') ? DUCK.holdS : null;
  if (name === 'stalemate') return DUCK.holdS;
  return STINGER_HOLD_S[name] ?? null;
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
  loop: { readonly step: number; readonly pulse: boolean } | null;
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

/** recipes.ts `playRecipe`: the bus `name` plays into (null before unlock), ducking the music first when it should. */
export function routeSfx(s: Synth, name: SfxName, opts: SfxOptions): GainNodeLike | null {
  const hold = duckFor(name, opts);
  if (hold !== null) duck(s, hold, name === 'won' || name === 'lost');
  return mixer(s)?.[busFor(name)] ?? null;
}
