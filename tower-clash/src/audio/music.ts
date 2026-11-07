/**
 * AUD-F6 music: a synthesised four-bar loop in A minor at 100 BPM (Am – F – C – G, 9.6 s), three layers
 * into the music bus (src/audio/mixer.ts):
 *   pad    triangle triads, one per bar, 0.35 s swell, crossfading into the next bar;
 *   bass   triangle roots on 1, "and" of 2, the fifth on 3, the octave on the "and" of 4;
 *   pulse  soft square eighth-note arpeggio an octave up: only in play (the intensity layer);
 *   tension FEEL-1-4 (the 2026-10-29 audit's L2): a low triangle kick on every beat and high-passed noise hats
 *          on the off-beats, faded in over 0.8 s when the match turns against the player (`intensityOf`,
 *          smoothed, 0.6 / 0.4 hysteresis) and out again; the pad steps back under it so the loop's peak
 *          never rises (`PAD_UNDER_TENSION`). Only in play, never on the title or a menu.
 * A look-ahead scheduler: a 25 ms timer only wakes it; every note time is `t0 + step × 0.3 s` on the
 * AudioContext clock, so the loop never drifts and wraps seamlessly. Lazy chunk (src/audio/index.ts
 * loads it on the first gesture when the Music setting is on). Nothing here touches the DOM.
 */
import type { AudioBufferLike, AudioContextLike, GainNodeLike, MatchView, Synth } from './synth';
import type { Owner } from '../sim/types';
import type { Mix } from './mixer';
import { mixer } from './mixer';
import { C } from '../sim/constants';

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

/* ---------- FEEL-1-4: the tension layer ---------- */

/**
 * The tension layer's rules. Intensity (0..1) = `weights` · [share of the player's towers under fire (the sim's
 * `underFireUntilMs`: a hostile landing in the last 1.5 s), hostile streams into player towers ÷ `streamsFull`
 * (capped at 1), 1 − the player's share of all owned units (garrisons + on the roads; neutral excluded)],
 * read once per AI tick (`C.AI_TICK_MS` of sim time) and smoothed by 1 − e^(−rate · dt) per update (dt in sim
 * seconds). The layer enters at ≥ `on` and leaves below `off`, fading over `fadeS`.
 */
export const TENSION = Object.freeze({ on: 0.6, off: 0.4, fadeS: 0.8, rate: 3, streamsFull: 3, weights: [0.4, 0.35, 0.25] as const });
/** The pad's level while the tension layer plays: it makes room for the kick so the loop's peak stays where it was. */
export const PAD_UNDER_TENSION = 0.45;
/** Tension hits: the kick (triangle 150 → 45 Hz, 120 ms) and the hat (noise high-passed at HAT_HZ, 35 ms). */
export const KICK = Object.freeze({ fromHz: 150, toHz: 45, dur: 0.12, gain: 0.13 });
export const HAT = Object.freeze({ hz: 7000, dur: 0.035, gain: 0.04 });

/** Raw (unsmoothed) intensity of a match for `me`, 0..1 (see TENSION). Pure: no DOM, no audio. */
export function intensityOf(state: Required<MatchView>, me: Owner = 'player'): number {
  let mine = 0;
  let hot = 0;
  let myUnits = 0;
  let allUnits = 0;
  for (const t of Object.values(state.towers)) {
    if (t.owner === 'neutral') continue;
    allUnits += t.units;
    if (t.owner !== me) continue;
    mine++;
    myUnits += t.units;
    if (t.underFireUntilMs > state.time) hot++;
  }
  for (const u of state.units) {
    if (u.owner === 'neutral') continue;
    allUnits += u.weight;
    if (u.owner === me) myUnits += u.weight;
  }
  let streams = 0;
  for (const l of state.links) if (l.owner !== me && state.towers[l.to]?.owner === me) streams++;
  const [wf, ws, wu] = TENSION.weights;
  const fire = mine ? hot / mine : 1;
  const share = allUnits > 0 ? myUnits / allUnits : 0.5;
  return Math.min(1, wf * fire + ws * Math.min(1, streams / TENSION.streamsFull) + wu * (1 - share));
}

/** One smoothing step: `prev` moves toward `raw` by 1 − e^(−rate · dtS). */
export const smoothIntensity = (prev: number, raw: number, dtS: number): number => prev + (raw - prev) * (1 - Math.exp(-TENSION.rate * dtS));

/** Hysteresis: on at ≥ TENSION.on, off below TENSION.off, else unchanged. */
export const tensionGate = (on: boolean, x: number): boolean => (on ? x >= TENSION.off : x >= TENSION.on);

/** The tension hits on `step`: a kick on every beat (even steps), a hat on every off-beat. */
export const tensionAt = (step: number): 'kick' | 'hat' => (step % 2 ? 'hat' : 'kick');

/** A linear fade planned at `start` from `from` to `to` over TENSION.fadeS; its value at `t`. */
interface Fade {
  start: number;
  from: number;
  to: number;
}
const fadeAt = (f: Fade, t: number): number => f.from + (f.to - f.from) * Math.min(1, Math.max(0, (t - f.start) / TENSION.fadeS));

/** One second of white noise (the LCG of recipes.ts `makeNoiseBuffer`; shared through `Synth.noise`). */
function noiseBuffer(ctx: AudioContextLike): AudioBufferLike {
  const length = Math.max(1, Math.floor(ctx.sampleRate));
  const b = ctx.createBuffer(1, length, ctx.sampleRate);
  const d = b.getChannelData(0);
  let x = 0x2545f491;
  for (let i = 0; i < d.length; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    d[i] = (x / 0xffffffff) * 2 - 1;
  }
  return b;
}

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
  /** FEEL-1-4: the smoothed intensity, the hysteresis gate on it, and whether the tension layer is scheduled on. */
  intensity = 0;
  hot = false;
  tension = false;
  /** The AI tick (`time / AI_TICK_MS`) the intensity was last read on; −1: none this match. */
  private aiTick = -1;
  /** The tension level's and the pad trim's last planned fades; the layer's hits stop once a fade-out ends. */
  private tFade: Fade = { start: -Infinity, from: 0, to: 0 };
  private padFade: Fade = { start: -Infinity, from: 1, to: 1 };
  /**
   * Per layer: the low-pass the notes play into and the layer's level gain behind it. FEEL-1-4 adds the tension
   * layer: `inputs[3]` the kick, `inputs[4]` the hats (through a high-pass), both into `levels[3]`.
   */
  readonly inputs: GainNodeLike[] = [];
  readonly levels: GainNodeLike[] = [];
  /** FEEL-1-4: the pad's trim (levels[0] → padTrim → music bus), PAD_UNDER_TENSION while the tension layer plays. */
  readonly padTrim: GainNodeLike;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly synth: Synth,
    private readonly mix: Mix,
  ) {
    const ctx = synth.graph()!.ctx;
    this.padTrim = ctx.createGain();
    this.padTrim.gain.value = 1;
    this.padTrim.connect(mix.music);
    const layer = (type: BiquadFilterType, hz: number, level?: GainNodeLike): void => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = hz;
      const input = ctx.createGain();
      input.connect(f);
      if (!level) {
        level = ctx.createGain();
        level.gain.value = 0;
        level.connect(this.levels.length ? mix.music : this.padTrim);
        this.levels.push(level);
      }
      f.connect(level);
      this.inputs.push(input);
    };
    LOWPASS_HZ.forEach((hz) => layer('lowpass', hz));
    // FEEL-1-4 tension: the kick (a low-pass well above it: a plain pass) and the hats share one level
    layer('lowpass', 4000);
    layer('highpass', HAT.hz, this.levels[3]);
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

  /**
   * Schedule every step that starts before now + LOOKAHEAD_S. Nothing while the OS holds the context (AUD-Q19,
   * iOS `interrupted`: a call, Siri, an alarm): the clock stands still, and after the resume on the next gesture
   * the late-wake-up rule below re-joins the grid at its next step instead of replaying what the hold skipped.
   */
  tick(): void {
    if (this.synth.context?.state === 'interrupted') return;
    const now = this.synth.now();
    const recent = now - this.synth.playAt < PLAY_GAP_S;
    if (!recent) this.mix.ended = false; // the result screen took over: the next match plays the pulse again
    this.sense(recent);
    const want = recent && !this.mix.ended;
    // FEEL-1-4: the tension layer only in play (frames come, no outcome yet) and while the gate is open
    const wantT = want && this.hot;
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
      // the tension layer fades in / out over TENSION.fadeS from this step, the pad trim with it (both linear, so
      // the loop's summed peak moves monotonically between the two end states and never overshoots); a flip waits
      // for the last fade to end (fades never overlap, so no ramp is ever cut)
      if (wantT !== this.tension && t >= this.tFade.start + TENSION.fadeS) {
        this.tension = wantT;
        this.tFade = this.ramp(this.levels[3]!, this.tFade, wantT ? 1 : 0, t);
        this.padFade = this.ramp(this.padTrim, this.padFade, wantT ? PAD_UNDER_TENSION : 1, t);
      }
      for (const n of notesAt(this.step)) if (n.layer !== 2 || this.pulse) this.play(n, t);
      if (this.tension || fadeAt(this.tFade, t) > 0) this.hit(tensionAt(this.step), t);
      this.step++;
    }
  }

  /**
   * FEEL-1-4: read the match once per AI tick and move the smoothed intensity and its gate. Out of play (no recent
   * frame: the title, a menu, the result screen) everything resets to calm, so a new match starts from 0; a match
   * whose clock went back (a retry, the next level) starts again from 0 too.
   */
  private sense(recent: boolean): void {
    const st = this.synth.sim;
    if (!recent || !st?.towers || !st.links || st.time === undefined) {
      if (!recent) {
        this.intensity = 0;
        this.hot = false;
        this.aiTick = -1;
      }
      return;
    }
    const k = Math.floor(st.time / C.AI_TICK_MS);
    if (k === this.aiTick) return;
    if (k < this.aiTick) this.intensity = 0;
    const dtS = ((this.aiTick < 0 || k < this.aiTick ? 1 : k - this.aiTick) * C.AI_TICK_MS) / 1000;
    this.aiTick = k;
    this.intensity = smoothIntensity(this.intensity, intensityOf(st as Required<MatchView>), dtS);
    this.hot = tensionGate(this.hot, this.intensity);
  }

  /** Plan a linear fade of `g` to `to` over TENSION.fadeS from `t` (≥ the end of `prev`, so it starts at `prev.to`). */
  private ramp(g: GainNodeLike, prev: Fade, to: number, t: number): Fade {
    const from = prev.to;
    g.gain.setValueAtTime(from, t);
    g.gain.linearRampToValueAtTime(to, t + TENSION.fadeS);
    return { start: t, from, to };
  }

  /** One tension hit at `t`: the kick (a triangle falling 150 → 45 Hz) or the hat (high-passed noise). */
  private hit(kind: 'kick' | 'hat', t: number): void {
    const ctx = this.synth.graph()!.ctx;
    const k = kind === 'kick';
    const end = t + (k ? KICK.dur : HAT.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(k ? KICK.gain : HAT.gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(FLOOR, end);
    g.connect(this.inputs[k ? 3 : 4]!);
    let src: { connect(d: GainNodeLike): unknown; start(w: number): void; stop(w: number): void };
    if (k) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(KICK.fromHz, t);
      o.frequency.exponentialRampToValueAtTime(KICK.toHz, end);
      src = o;
    } else {
      const b = ctx.createBufferSource();
      b.buffer = this.synth.noise ??= noiseBuffer(ctx);
      b.loop = true;
      src = b;
    }
    src.connect(g);
    src.start(t);
    src.stop(end);
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
