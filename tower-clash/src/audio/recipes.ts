/**
 * The synth voices (`blip`, `sweep`, `noiseBurst`) and the sound-effect recipes (which of them make
 * each `SfxName`). Lazy chunk —
 * src/audio/sfx.ts imports this module on the first play (and `initAudio` / `unlockAudio` warm it
 * as soon as sound is on) so the eager bundle stays under its 80 kB budget. A play that arrives
 * before the chunk is in is skipped, never queued: a late click would be worse than none.
 * Every sound is ≤ 400 ms except `won`/`lost`. Nothing here touches the DOM.
 */
import type { CaptureKind, SfxName, SfxOptions } from './sfx';
import { sendPitchHz } from './sfx';
import type { AudioBufferLike, AudioContextLike, BlipOptions, GainNodeLike, NoiseOptions, Synth } from './synth';

const ATTACK_S = 0.004;
const NOISE_BUFFER_S = 1;
/** Envelope floor for exponential ramps (0 is not allowed). */
const FLOOR = 0.0001;

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
