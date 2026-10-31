/**
 * AUD-F6 music: a synthesised four-bar loop in A minor at 100 BPM (Am – F – C – G, 9.6 s), three layers
 * into the music bus (src/audio/mixer.ts):
 *   pad    triangle triads, one per bar, 0.35 s swell, crossfading into the next bar;
 *   bass   triangle roots on 1, "and" of 2, the fifth on 3, the octave on the "and" of 4;
 *   pulse  soft square eighth-note arpeggio an octave up: only in play (the intensity layer).
 * A look-ahead scheduler: a 25 ms timer only wakes it; every note time is `t0 + step × 0.3 s` on the
 * AudioContext clock, so the loop never drifts and wraps seamlessly. Lazy chunk (src/audio/index.ts
 * loads it on the first gesture when the Music setting is on). Nothing here touches the DOM.
 */
import type { GainNodeLike, Synth } from './synth';
import type { Mix } from './mixer';
import { mixer } from './mixer';

export const BPM = 100;
/** One step = an eighth note. */
export const STEP_S = 30 / BPM;
export const LOOP_STEPS = 32;
/** How far ahead of the clock each wake-up schedules, and how often it wakes. */
export const LOOKAHEAD_S = 0.15;
export const TICK_MS = 25;
/** The first downbeat sits this far after the start (time for the context to resume). */
const LEAD_S = 0.1;
/** The pulse layer plays while a play-screen frame (`Synth.playAt`) is this recent. */
export const PLAY_GAP_S = 0.5;
/** Pad and bass fade in over this on a start; every layer fades out over STOP_FADE_S on a stop. */
const FADE_IN_S = 1.5;
const STOP_FADE_S = 0.3;
const PAD_RELEASE_S = 0.6;
const FLOOR = 0.0001;

/** 0 pad, 1 bass, 2 pulse. */
export type Layer = 0 | 1 | 2;
export interface Note {
  layer: Layer;
  midi: number;
  /** Seconds. */
  dur: number;
  gain: number;
}

/** Am, F, C, G voiced around C4 (common tones held). */
const CHORDS = [
  [57, 60, 64],
  [57, 60, 65],
  [55, 60, 64],
  [55, 59, 62],
];
const ROOTS = [45, 41, 48, 43];
/** Bass hits: [step in the bar, semitones over the root, seconds]. */
const BASS = [
  [0, 0, 0.5],
  [3, 0, 0.25],
  [4, 7, 0.5],
  [7, 12, 0.25],
];
/** Pulse: which chord tone each eighth plays (an octave up). */
const ARP = [0, 2, 1, 2, 0, 2, 1, 2];
const TYPES: OscillatorType[] = ['triangle', 'triangle', 'square'];
/** Each layer's low-pass (the square pulse is a soft pluck under it). */
const LOWPASS_HZ = [1100, 700, 1500];

export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** The notes that start on `step` (any non-negative integer; the pattern repeats every LOOP_STEPS). */
export function notesAt(step: number): Note[] {
  const bar = Math.floor(step / 8) % 4;
  const i = step % 8;
  const chord = CHORDS[bar]!;
  const out: Note[] = [];
  if (i === 0) for (const midi of chord) out.push({ layer: 0, midi, dur: 9 * STEP_S, gain: 0.07 });
  for (const [at, up, dur] of BASS) if (at === i) out.push({ layer: 1, midi: ROOTS[bar]! + up!, dur: dur!, gain: 0.16 });
  out.push({ layer: 2, midi: chord[ARP[i]!]! + 12, dur: 0.14, gain: i % 2 ? 0.035 : 0.05 });
  return out;
}

const fade = (g: GainNodeLike, now: number, to: number, s: number): void => {
  g.gain.cancelScheduledValues?.(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(to, now + s);
};

export class MusicLoop {
  /** The next step to schedule and the clock time of step 0. */
  step = 0;
  t0 = 0;
  /** The pulse layer is on (in play). */
  pulse = false;
  /** Per layer: the low-pass the notes play into and the layer's level gain behind it. */
  readonly inputs: GainNodeLike[] = [];
  readonly levels: GainNodeLike[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly synth: Synth,
    private readonly mix: Mix,
  ) {
    const ctx = synth.graph()!.ctx;
    LOWPASS_HZ.forEach((hz) => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = hz;
      const input = ctx.createGain();
      const level = ctx.createGain();
      level.gain.value = 0;
      input.connect(f);
      f.connect(level);
      level.connect(mix.music);
      this.inputs.push(input);
      this.levels.push(level);
    });
  }

  /** Begin at the next LEAD_S: pad and bass fade in; the timer wakes the scheduler every TICK_MS. */
  start(): void {
    const now = this.synth.now();
    this.t0 = now + LEAD_S;
    this.step = 0;
    this.levels.slice(0, 2).forEach((g) => fade(g, now, 1, FADE_IN_S));
    this.mix.loop = this;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Schedule every step that starts before now + LOOKAHEAD_S. */
  tick(): void {
    const now = this.synth.now();
    const recent = now - this.synth.playAt < PLAY_GAP_S;
    if (!recent) this.mix.ended = false; // the result screen took over: the next match plays the pulse again
    const want = recent && !this.mix.ended;
    for (let t = this.time(); t < now + LOOKAHEAD_S; t = this.time()) {
      if (t < now) {
        // a late wake-up (throttled timer): skip to the grid's next step rather than a burst of past notes
        this.step = Math.ceil((now - this.t0) / STEP_S);
        continue;
      }
      // the pulse joins on a downbeat and leaves on any step; one-step ramps (never overlapping: a flip waits a step)
      if (want !== this.pulse && (!want || this.step % 8 === 0)) {
        this.pulse = want;
        const p = this.levels[2]!.gain;
        p.setValueAtTime(want ? 0 : 1, t);
        p.linearRampToValueAtTime(want ? 1 : 0, t + STEP_S);
      }
      for (const n of notesAt(this.step)) if (n.layer !== 2 || this.pulse) this.play(n, t);
      this.step++;
    }
  }

  private time(): number {
    return this.t0 + this.step * STEP_S;
  }

  private play(n: Note, t: number): void {
    const ctx = this.synth.graph()!.ctx;
    const end = t + n.dur;
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(n.gain, t + (n.layer ? 0.006 : 0.35));
    if (n.layer) g.gain.exponentialRampToValueAtTime(FLOOR, end);
    else {
      g.gain.setValueAtTime(n.gain, end - PAD_RELEASE_S);
      g.gain.linearRampToValueAtTime(FLOOR, end);
    }
    g.connect(this.inputs[n.layer]!);
    const o = ctx.createOscillator();
    o.type = TYPES[n.layer]!;
    o.frequency.setValueAtTime(midiHz(n.midi), t);
    o.connect(g);
    o.start(t);
    o.stop(end);
  }

  /** Stop scheduling and fade every layer out (what is already scheduled rings out under the fade). */
  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.mix.loop === this) this.mix.loop = null;
    const now = this.synth.now();
    for (const g of this.levels) fade(g, now, 0, STOP_FADE_S);
    setTimeout(() => this.levels.forEach((g) => g.disconnect()), 1000);
  }
}

let loop: MusicLoop | null = null;

/** src/audio/index.ts: play the loop on `s` while `on` (Music setting on, tab visible, unlocked); idempotent. */
export function syncMusic(s: Synth, on: boolean): void {
  if (loop && (!on || loop.synth !== s)) {
    loop.stop();
    loop = null;
  }
  const m = on && !loop ? mixer(s) : null;
  if (m) {
    loop = new MusicLoop(s, m);
    loop.start();
  }
}
