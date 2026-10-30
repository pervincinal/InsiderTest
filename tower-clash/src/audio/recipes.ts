/**
 * The synth voices (`blip`, `sweep`, `noiseBurst`) and the sound-effect recipes (which of them make
 * each `SfxName`). Lazy chunk —
 * src/audio/sfx.ts imports this module on the first play (and `initAudio` / `unlockAudio` warm it
 * as soon as sound is on) so the eager bundle stays under its 80 kB budget. A play that arrives
 * before the chunk is in is skipped, never queued: a late click would be worse than none.
 * Every sound is ≤ 400 ms except `won`/`lost`. Nothing here touches the DOM.
 */
import type { Owner, SimEvent } from '../sim/types';
import type { CaptureKind, HitState, SfxName, SfxOptions } from './sfx';
import { sendPitchHz } from './sfx';
import type { AudioBufferLike, AudioContextLike, BlipOptions, GainNodeLike, NoiseOptions, Synth } from './synth';

const ATTACK_S = 0.004;
const NOISE_BUFFER_S = 1;
/** Envelope floor for exponential ramps (0 is not allowed). */
const FLOOR = 0.0001;

/** AUD-F1: one tower knocks (and taps the phone) at most once per HIT_TOWER_MS… */
export const HIT_TOWER_MS = 250;
/** …and all towers together at most once per HIT_GAP_MS: ≤ 6 in any second (0, 170, … 850 ms; the 7th at 1020). */
export const HIT_GAP_MS = 170;

/**
 * AUD-F1: being attacked. For every foe's landing on a tower `me` still owns after the tick, and every
 * capture that takes one of `me`'s towers (its last landing flipped it, so that landing no longer reads as
 * "on `me`"), call `fire(weight)` — unless the same tower fired within HIT_TOWER_MS or any tower within
 * HIT_GAP_MS (wall clock `nowMs`; a refused hit is not recorded, so the next landing gets the slot).
 */
export function playHits(
  events: readonly SimEvent[],
  me: Owner,
  towers: Readonly<Record<string, { owner: Owner }>>,
  st: HitState,
  nowMs: number,
  fire: (weight: number) => void,
): void {
  for (const ev of events) {
    let id: string | null = null;
    let weight = 1;
    // (a landing of `me`'s own unit that flips a tower also leaves it `me`'s: that is a capture, not a hit)
    if (ev.type === 'landed' && ev.hostile && ev.owner !== me && towers[ev.towerId]?.owner === me) {
      id = ev.towerId;
      weight = ev.weight;
    } else if (ev.type === 'capture' && ev.from === me) id = ev.towerId;
    if (id === null || nowMs - st.last < HIT_GAP_MS || nowMs - (st.at.get(id) ?? -Infinity) < HIT_TOWER_MS) continue;
    st.last = nowMs;
    st.at.set(id, nowMs);
    fire(weight);
  }
}

/** Schedule the voices of `name` on `s` (the caller has checked the context, mute and rate limit). */
export function playRecipe(s: Synth, name: SfxName, opts: SfxOptions): void {
  switch (name) {
    case 'send':
      blip(s, sendPitchHz(opts.count ?? 1), 60, 'triangle', { gain: 0.22 });
      return;
    case 'arrive':
      blip(s, 760, 28, 'sine', { gain: 0.08 });
      return;
    case 'capture':
      playCapture(s, opts.capture ?? 'other');
      return;
    case 'upgrade':
      // Sparkle arpeggio: four quick sine notes stepping up a major chord.
      [880, 1108.7, 1318.5, 1760].forEach((hz, i) => blip(s, hz, 120, 'sine', { gain: 0.16, delayS: i * 0.06 }));
      return;
    case 'unitDied':
      noiseBurst(s, 70, 700, { gain: 0.14 });
      return;
    case 'artillery':
      sweep(s, 170, 40, 260, 'sine', { gain: 0.5 });
      noiseBurst(s, 120, 350, { gain: 0.25 });
      return;
    case 'won':
      // 4-note fanfare: C5 E5 G5 C6, the last held.
      [523.3, 659.3, 784, 1046.5].forEach((hz, i) => {
        const last = i === 3;
        blip(s, hz, last ? 520 : 160, 'triangle', { gain: 0.3, delayS: i * 0.15 });
        blip(s, hz / 2, last ? 520 : 160, 'sine', { gain: 0.14, delayS: i * 0.15 });
      });
      return;
    case 'lost':
      // Descending minor: E5 D5 C5 A4, slowing down.
      [659.3, 587.3, 523.3, 440].forEach((hz, i) =>
        blip(s, hz, i === 3 ? 600 : 220, 'sawtooth', { gain: 0.14, delayS: i * 0.22 }),
      );
      return;
    case 'button':
      blip(s, 1400, 24, 'square', { gain: 0.08 });
      return;
    case 'refuse':
      // Short low "thud" for a refused tap: a falling triangle (harmonics keep it audible on phone
      // speakers that drop everything under ~200 Hz) plus a soft knock of low-passed noise. Quieter
      // than the capture-loss thud (0.45): a refusal is the player's own tap, not an event.
      sweep(s, 200, 70, 110, 'triangle', { gain: 0.2 });
      noiseBurst(s, 45, 420, { gain: 0.1 });
      return;
    case 'stalemate':
      // Soft two-note "hm?": a rising fourth G4 → C5 on sines, a question rather than a reward
      // (capture 'gain' is a fifth on triangles an octave up; send/button are single clicks).
      blip(s, 392, 150, 'sine', { gain: 0.18 });
      blip(s, 523.3, 210, 'sine', { gain: 0.18, delayS: 0.16 });
      return;
    case 'hit': {
      // AUD-F1: a short wooden knock on the gate — a falling triangle above the phone-speaker floor plus
      // a band-passed noise crack. Higher, shorter and brighter than `refuse` (200 → 70 Hz, 110 ms, low-
      // passed knock) so "they hit me" never reads as "you can't do that"; a tank (weight > 1) knocks a
      // fifth lower and longer.
      const k = (opts.weight ?? 1) > 1 ? 0.67 : 1;
      sweep(s, 320 * k, 150 * k, 70 / k, 'triangle', { gain: 0.22 });
      noiseBurst(s, 30, 2200 * k, { gain: 0.14, filter: 'bandpass' });
      return;
    }
    case 'mine':
      // AUD-F2: the trigger's metal click, then a boom (a falling triangle: harmonics a phone speaker can
      // play, unlike artillery's sub-bass sine) and a bright debris rush (wider than the 70 ms clash crackle)
      blip(s, 2400, 16, 'square', { gain: 0.05 });
      sweep(s, 240, 48, 320, 'triangle', { gain: 0.4, delayS: 0.02 });
      noiseBurst(s, 220, 1500, { gain: 0.26, delayS: 0.02 });
      return;
  }
}

function playCapture(s: Synth, kind: CaptureKind): void {
  switch (kind) {
    case 'gain':
      // Two-note rising major chime.
      blip(s, 659.3, 140, 'triangle', { gain: 0.28 });
      blip(s, 1046.5, 220, 'triangle', { gain: 0.28, delayS: 0.11 });
      return;
    case 'loss':
      // Low thud.
      sweep(s, 140, 45, 240, 'sine', { gain: 0.45 });
      noiseBurst(s, 90, 250, { gain: 0.2 });
      return;
    case 'other':
      blip(s, 330, 90, 'triangle', { gain: 0.1 });
      return;
  }
}

/* ---------- voices ---------- */


/** Gain node with a short attack and an exponential release ending at `endS`, wired to master. */
function envelope(ctx: AudioContextLike, master: GainNodeLike, startS: number, endS: number, peak: number): GainNodeLike {
  const g = ctx.createGain();
  g.gain.setValueAtTime(FLOOR, startS);
  g.gain.linearRampToValueAtTime(Math.max(FLOOR, peak), startS + ATTACK_S);
  g.gain.exponentialRampToValueAtTime(FLOOR, endS);
  g.connect(master);
  return g;
}

/** Single oscillator tone of `ms` milliseconds at `freq` Hz. */
export function blip(s: Synth, freq: number, ms: number, type: OscillatorType = 'sine', opts: BlipOptions = {}): void {
  const live = s.live();
  if (!live) return;
  const { ctx, master } = live;
  const t0 = ctx.currentTime + (opts.delayS ?? 0);
  const t1 = t0 + ms / 1000;
  const env = envelope(ctx, master, t0, t1, opts.gain ?? 0.3);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.connect(env);
  osc.start(t0);
  osc.stop(t1);
}

/** Oscillator whose pitch glides exponentially from `from` to `to` Hz over `ms`. */
export function sweep(s: Synth, from: number, to: number, ms: number, type: OscillatorType = 'sine', opts: BlipOptions = {}): void {
  const live = s.live();
  if (!live) return;
  const { ctx, master } = live;
  const t0 = ctx.currentTime + (opts.delayS ?? 0);
  const t1 = t0 + ms / 1000;
  const env = envelope(ctx, master, t0, t1, opts.gain ?? 0.3);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, from), t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t1);
  osc.connect(env);
  osc.start(t0);
  osc.stop(t1);
}

/** Filtered white noise for `ms` milliseconds (`filterHz` = cutoff of the biquad). */
export function noiseBurst(s: Synth, ms: number, filterHz: number, opts: NoiseOptions = {}): void {
  const live = s.live();
  if (!live) return;
  const { ctx, master } = live;
  const t0 = ctx.currentTime + (opts.delayS ?? 0);
  const t1 = t0 + ms / 1000;
  const env = envelope(ctx, master, t0, t1, opts.gain ?? 0.3);
  s.noise ??= makeNoiseBuffer(ctx);
  const src = ctx.createBufferSource();
  src.buffer = s.noise;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filter ?? 'lowpass';
  filter.frequency.setValueAtTime(filterHz, t0);
  filter.Q.setValueAtTime(0.7, t0);
  src.connect(filter);
  filter.connect(env);
  src.start(t0);
  src.stop(t1);
}

/** One second of white noise from a tiny deterministic LCG (no Math.random, no allocation churn). */
function makeNoiseBuffer(ctx: AudioContextLike): AudioBufferLike {
  const length = Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_S));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let s = 0x2545f491;
  for (let i = 0; i < data.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    data[i] = (s / 0xffffffff) * 2 - 1;
  }
  return buffer;
}
