/**
 * The synth voices (`blip`, `sweep`, `noiseBurst`) and the sound-effect recipes (which of them make
 * each `SfxName`). Lazy chunk —
 * src/audio/sfx.ts imports this module on the first play (and `initAudio` / `unlockAudio` warm it
 * as soon as sound is on) so the eager bundle stays under its 80 kB budget. A play that arrives
 * before the chunk is in is skipped, never queued: a late click would be worse than none.
 * Every sound is ≤ 400 ms except the AUD-F8 / F9 menu and result sounds (≤ 500 ms). AUD-F7: every play
 * but the identity sounds is detuned / levelled a little (`variation`), `arrive` and `unitDied` rotate
 * over their timbres. Nothing here touches the DOM.
 */
import type { GameState, Owner, SimEvent } from '../sim/types';
import type { CaptureKind, HitState, SfxName, SfxOptions } from './sfx';
import { ArrivalTracker, sendPitchHz, sfxForEvents } from './sfxRules';
import { routeSfx } from './mixer';
import { playSting } from './outcomeCues';

/** AUD-F6: the event mapping, arrival detector and rate limits ride in this chunk (src/audio/sfx.ts loads it). */
export * from './sfxRules';
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
 * "on `me`"; AUD-F15: weight 0 — the capture's own `loss` thud is its sound, the haptic is medium), call `fire(weight)` — unless the same tower fired within HIT_TOWER_MS or any tower within
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
    } else if (ev.type === 'capture' && ev.from === me) {
      id = ev.towerId;
      weight = 0;
    }
    if (id === null || nowMs - st.last < HIT_GAP_MS || nowMs - (st.at.get(id) ?? -Infinity) < HIT_TOWER_MS) continue;
    st.last = nowMs;
    st.at.set(id, nowMs);
    fire(weight);
  }
}

/* ---------- AUD-F7: per-play variation ---------- */

/** Every varied play is detuned within ±VARY_CENTS and levelled within ±VARY_DB of its recipe. */
export const VARY_CENTS = 40;
export const VARY_DB = 2;
/**
 * Never varied: the result stingers, `hit` (its knock is the rate-limited "they hit me" cue with its own tank
 * pitch rule) and the booster casts (identity sounds).
 */
export const UNVARIED: ReadonlySet<SfxName> = new Set<SfxName>(['won', 'lost', 'hit', 'freeze', 'overdrive', 'airstrike']);
/** Level only — the pitch carries information: `send` rises with the unit count, `tally` with the gold count. */
export const PITCH_LOCKED: ReadonlySet<SfxName> = new Set<SfxName>(['send', 'tally']);

/** A 32-bit integer hash of (`i`, `salt`) in [0, 1) (murmur3's finaliser: neighbouring indices land far apart). */
function hash01(i: number, salt: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ salt;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The detune (cents) and level offset (dB) of the `index`-th play (0-based) of `name`: a pure function of the
 * two (the name salts the hash, so two sounds' n-th plays are not detuned alike).
 */
export function variation(name: SfxName, index: number): { cents: number; db: number } {
  if (UNVARIED.has(name)) return { cents: 0, db: 0 };
  let salt = 0;
  for (let k = 0; k < name.length; k++) salt = Math.imul(salt, 31) + name.charCodeAt(k);
  return {
    cents: PITCH_LOCKED.has(name) ? 0 : (hash01(index, salt ^ 0x51ed27) * 2 - 1) * VARY_CENTS,
    db: (hash01(index, salt ^ 0x2f6b4d) * 2 - 1) * VARY_DB,
  };
}

/** Plays so far per sound and synth (a new synth — `initAudio` — counts from 0 again); a tank landing counts as an `arrive`. */
const plays = new WeakMap<Synth, Map<SfxName, number>>();
function nextPlay(s: Synth, name: SfxName): number {
  let m = plays.get(s);
  if (!m) plays.set(s, (m = new Map()));
  const key = name === 'tankArrive' ? 'arrive' : name;
  const i = m.get(key) ?? 0;
  m.set(key, i + 1);
  return i;
}

/** The running play's pitch and gain factors (`playRecipe` sets them; every voice below applies them). */
let pitchK = 1;
let gainK = 1;

/** AUD-F7: `arrive` rotates over three soft taps a pentatonic step apart (re / mi / la over 677 Hz): type, Hz, ms, gain. */
export const ARRIVE_TIMBRES: readonly (readonly [OscillatorType, number, number, number])[] = [
  ['sine', 760, 28, 0.08],
  ['triangle', 677, 30, 0.07],
  ['sine', 1014, 24, 0.065],
];
/** AUD-F7: `unitDied` alternates two noise colours: the warm low-passed crackle and a brighter band-passed one. */
export const DEATH_NOISES: readonly (readonly [BiquadFilterType, number, number])[] = [
  ['lowpass', 700, 0.14],
  ['bandpass', 1600, 0.17],
];
/** AUD-F9: the fanfare over the three star pops — rising dyads of the C major triad (C5 E5, G5 C6, E6 G6). */
/** FEEL-1-9: `send` alternates a triangle-led and a square-led blip (type, ms, gain)… */
export const SEND_TIMBRES: readonly (readonly [OscillatorType, number, number])[] = [
  ['triangle', 60, 0.22],
  ['square', 45, 0.1],
];
/** …and a re-link of the same `from>to` pair within RELINK_S of its last tick plays RELINK_DB softer. */
export const RELINK_S = 2;
export const RELINK_DB = -4;
/** Per synth: the clock time of each pair's last `send`. */
const sendAt = new WeakMap<Synth, Map<string, number>>();
/** The `send` gain factor for `pair` now (1, or RELINK_DB for a quick re-link), recording this play. */
function relinkGain(s: Synth, pair: string | undefined): number {
  if (pair === undefined) return 1;
  let m = sendAt.get(s);
  if (!m) sendAt.set(s, (m = new Map()));
  const now = s.now();
  const last = m.get(pair);
  m.set(pair, now);
  return last !== undefined && now - last < RELINK_S ? Math.pow(10, RELINK_DB / 20) : 1;
}
/** FEEL-1-2: the airstrike's impact, after the whistle (render/combatFx.ts STRIKE_FALL_MS / 1000). */
export const STRIKE_HIT_S = 0.15;
export const STAR_CHORDS: readonly (readonly number[])[] = [
  [523.3, 659.3],
  [784, 1046.5],
  [1318.5, 1568],
];

/** What the eager facade (src/audio/index.ts, its module state) hands the chunk per event batch and per frame. */
export interface AudioHost {
  player: { play(name: SfxName, opts?: SfxOptions): boolean };
  /** Own-unit arrival detector, made here on the first batch / frame the chunk is in. */
  arrivals: ArrivalTracker | null;
  hits: HitState;
  /** `medium`: AUD-F15, a lost tower (a hit is light). */
  haptic: (medium?: boolean) => void;
  /** AUD-U20: the save, for Settings → Vibration (`settings.haptics === false`: no haptic). */
  save: { settings: { haptics?: boolean } } | null;
}

/**
 * `onSimEvents` (moved here from the eager facade, AUD-F10, to pay for the tank landing's render hook): the
 * mapped sounds of one batch of sim events, and AUD-F1's knocks — being attacked knocks (and taps the phone)
 * at most every 250 ms per tower and 6 times a second overall. The haptic needs Effects on (this chunk only
 * runs then) and Settings → Vibration on (AUD-U20).
 */
export function onEvents(m: AudioHost, events: readonly SimEvent[], state: Pick<GameState, 'towers'>): void {
  (m.arrivals ??= new ArrivalTracker('player')).noteEvents(events);
  for (const call of sfxForEvents(events, 'player', state.towers)) m.player.play(call.name, call.opts);
  playHits(events, 'player', state.towers, m.hits, performance.now(), (weight) => {
    if (weight) m.player.play('hit', { weight });
    if (m.save?.settings.haptics !== false) m.haptic(!weight);
  });
}

/** `onSimFrame`: the soft arrival tap for own units that landed since the last frame (one per frame, rate-limited). */
export function onFrame(m: AudioHost, state: Pick<GameState, 'units'>): void {
  if ((m.arrivals ??= new ArrivalTracker('player')).tick(state) > 0) m.player.play('arrive');
}

/** Schedule the voices of `name` on `s` (the caller has checked the context, mute and rate limit). */
export function playRecipe(s: Synth, name: SfxName, opts: SfxOptions): void {
  s.route = routeSfx(s, name, opts); // AUD-F6: every voice below plays into the UI or SFX bus (src/audio/mixer.ts), ducking the music first when it should
  const i = nextPlay(s, name);
  const v = variation(name, i);
  pitchK = Math.pow(2, v.cents / 1200);
  gainK = Math.pow(10, v.db / 20);
  voices(s, name, opts, i);
  pitchK = gainK = 1;
}

/** The voices of the `i`-th play of `name`. */
function voices(s: Synth, name: SfxName, opts: SfxOptions, i: number): void {
  switch (name) {
    case 'send': {
      // FEEL-1-9: the count pitch (level-only variation) on two alternating timbres; a re-link of the same pair
      // within RELINK_S is RELINK_DB softer (it was one fixed blip on every re-link)
      const [type, ms, gain] = SEND_TIMBRES[i % 2]!;
      blip(s, sendPitchHz(opts.count ?? 1), ms, type, { gain: gain * relinkGain(s, opts.pair) });
      return;
    }
    case 'airstrike':
      // FEEL-1-2: the shell's whistle over the render chain's STRIKE_FALL_MS (a quiet sine falling 1.8 → 0.7 kHz),
      // then at 150 ms the impact: a triangle thud 160 → 45 Hz (a phone speaker's harmonics), a sub sine
      // 110 → 38 Hz and a low-passed blast noise — 4 voices, ends at 530 ms; not the gun's `artillery`
      sweep(s, 1800, 700, 150, 'sine', { gain: 0.07 });
      sweep(s, 160, 45, 260, 'triangle', { gain: 0.4, delayS: STRIKE_HIT_S });
      sweep(s, 110, 38, 380, 'sine', { gain: 0.4, delayS: STRIKE_HIT_S });
      noiseBurst(s, 300, 900, { gain: 0.3, delayS: STRIKE_HIT_S });
      return;
    case 'arrive': {
      const [type, hz, ms, gain] = ARRIVE_TIMBRES[i % 3]!;
      blip(s, hz, ms, type, { gain });
      return;
    }
    case 'tankArrive': {
      // AUD-F10: the same rotation a fifth lower and a little firmer, over a 60 ms triangle thud (above the
      // phone-speaker floor, like `hit`'s tank knock) — 2 voices, ends at 60 ms
      const [type, hz, ms, gain] = ARRIVE_TIMBRES[i % 3]!;
      blip(s, hz / 1.5, ms + 12, type, { gain: gain * 1.4 });
      sweep(s, 190, 80, 60, 'triangle', { gain: 0.16 });
      return;
    }
    case 'purchase':
      // AUD-F8: a coin clink — two bright triangles a fourth apart (B6, then E7 ringing) over a 14 ms
      // high-passed metal tick; 3 voices, ends at 230 ms
      blip(s, 1975.5, 50, 'triangle', { gain: 0.12 });
      blip(s, 2637, 180, 'triangle', { gain: 0.12, delayS: 0.05 });
      noiseBurst(s, 14, 5000, { gain: 0.06, filter: 'highpass' });
      return;
    case 'reward':
      // AUD-F8: a short rising sparkle — a sine gliding C6 → C7 over 220 ms, two glints (E7, G7) on top and a
      // breath of high-passed shimmer; 4 voices, ends at 250 ms (not `upgrade`'s stepped arpeggio)
      sweep(s, 1046.5, 2093, 220, 'sine', { gain: 0.1 });
      blip(s, 2637, 90, 'triangle', { gain: 0.06, delayS: 0.08 });
      blip(s, 3136, 90, 'triangle', { gain: 0.06, delayS: 0.16 });
      noiseBurst(s, 200, 7000, { gain: 0.03, filter: 'highpass', delayS: 0.05 });
      return;
    case 'unlock':
      // AUD-F8: a two-note bell, "ding-dong" falling a major third (D6 → B♭5: none of `upgrade`'s A major
      // notes), each a sine with a quiet inharmonic 2.76 × partial that dies first; 4 voices, ends at 460 ms
      // (`stalemate` rises a fourth)
      for (const [hz, d] of [
        [1174.7, 0],
        [932.3, 0.16],
      ] as const) {
        blip(s, hz, 300, 'sine', { gain: 0.16, delayS: d });
        blip(s, hz * 2.76, 120, 'sine', { gain: 0.04, delayS: d });
      }
      return;
    case 'achievement':
      // AUD-F8: a three-note call G5 C6 E6 on triangles, 90 ms apart, the last held over a sine C5; 4 voices, ends at 480 ms
      [784, 1046.5, 1318.5].forEach((hz, k) => blip(s, hz, k === 2 ? 300 : 110, 'triangle', { gain: 0.16, delayS: k * 0.09 }));
      blip(s, 523.3, 300, 'sine', { gain: 0.1, delayS: 0.18 });
      return;
    case 'tally':
      // AUD-F9: a soft tick per gold step of the count-up, climbing a semitone every second step from G6; 1 voice, 30 ms
      blip(s, 1568 * Math.pow(2, Math.min(12, opts.step ?? 0) / 24), 30, 'sine', { gain: 0.06 });
      return;
    case 'capture':
      playCapture(s, opts.capture ?? 'other');
      return;
    case 'upgrade':
      // Sparkle arpeggio: four quick sine notes stepping up a major chord — the player's tower levelling up
      // only (AUD-F8: purchases, rewards, unlocks and achievements have their own sounds below).
      [880, 1108.7, 1318.5, 1760].forEach((hz, i) => blip(s, hz, 120, 'sine', { gain: 0.16, delayS: i * 0.06 }));
      return;
    case 'unitDied': {
      const [filter, hz, gain] = DEATH_NOISES[i % 2]!;
      noiseBurst(s, 70, hz, { gain, filter });
      return;
    }
    case 'artillery':
      // the boom (a sub-bass sine glide) and its blast noise, and (AUD-F11) a 40 ms thump on a triangle under
      // them — its harmonics carry the weight on a phone speaker that drops the sine; 3 voices, ends at 260 ms
      sweep(s, 170, 40, 260, 'sine', { gain: 0.5 });
      sweep(s, 150, 60, 40, 'triangle', { gain: 0.32 });
      noiseBurst(s, 120, 350, { gain: 0.25 });
      return;
    case 'won': {
      // AUD-F9: one chord per earned star, on its pop (src/audio/resultCues.ts); the outcome tick (no `step`)
      // is FEEL-1-3's rising sting (2 sines, 250 ms). The last earned star's chord rings 480 ms over a sine C4 (1★ = that one chord), the
      // others 220 ms; under reduced motion they sound together: a C major spread. ≤ 3 voices each
      if (opts.step === undefined) return playSting(s, 'won'); // FEEL-1-3: the outcome sting over the capture chime (outcomeCues.ts)
      const last = opts.step >= (opts.count ?? 3) - 1;
      for (const hz of STAR_CHORDS[Math.max(0, Math.min(2, opts.step))]!) blip(s, hz, last ? 480 : 220, 'triangle', { gain: 0.24 });
      if (last) blip(s, 261.6, 480, 'sine', { gain: 0.16 });
      return;
    }
    case 'lost':
      // AUD-F9: a single low A minor chord as the defeat card lands — triangles A3 C4 E4 over a sine A2,
      // 480 ms, 4 voices; the outcome tick (no `step`) is FEEL-1-3's falling sting, after the capture-loss thud
      if (opts.step === undefined) return playSting(s, 'lost'); // FEEL-1-3: the falling sting after the loss thud (outcomeCues.ts)
      for (const hz of [220, 261.6, 329.6]) blip(s, hz, 480, 'triangle', { gain: 0.14 });
      blip(s, 110, 480, 'sine', { gain: 0.12 });
      return;
    case 'button':
      blip(s, 1400, 24, 'square', { gain: 0.08 });
      return;
    case 'refuse':
      // Short low "thud" for a refused tap: a falling triangle (harmonics keep it audible on phone
      // speakers that drop everything under ~200 Hz) plus a soft knock of low-passed noise. Quieter
      // than the capture-loss thud (AUD-F15: 0.34 + 0.4): a refusal is the player's own tap, not an event.
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
    case 'freeze':
      // AUD-F3: a glassy descending shimmer — four high sines each gliding down a fifth, 60 ms apart, on a
      // falling diminished chord (E7 C#7 A#6 G6: cold, and none of `upgrade`'s notes), over a 260 ms breath
      // of high-passed "frost" air; ends at 380 ms
      [2637, 2217.5, 1864.7, 1568].forEach((hz, i) => sweep(s, hz, hz / 1.5, 200, 'sine', { gain: 0.1, delayS: i * 0.06 }));
      noiseBurst(s, 260, 6000, { gain: 0.05, filter: 'highpass' });
      return;
    case 'overdrive':
      // AUD-F3: a rising three-note brass-ish swell — G4 B4 D5 on sawtooths whose low-pass opens with a
      // slow attack (`swell`), the last held; the opposite gesture to Freeze's falling glass; ends at 380 ms
      [392, 493.9, 587.3].forEach((hz, i) => swell(s, hz, i === 2 ? 200 : 140, 50, { gain: 0.14, delayS: i * 0.09 }));
      return;
  }
}

/**
 * AUD-F3 brass-ish note of `ms`: a sawtooth through a low-pass that opens 1.5 → 6 × the pitch over a
 * linear `riseMs` swell (the gain rises with it, not the 4 ms click of `blip`) and closes to 2 × on the
 * exponential release.
 */
function swell(s: Synth, freq: number, ms: number, riseMs: number, opts: BlipOptions = {}): void {
  const live = s.live();
  if (!live) return;
  const { ctx, master } = live;
  const t0 = ctx.currentTime + (opts.delayS ?? 0);
  const tr = t0 + riseMs / 1000;
  const t1 = t0 + ms / 1000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(FLOOR, t0);
  g.gain.linearRampToValueAtTime(opts.gain ?? 0.2, tr);
  g.gain.exponentialRampToValueAtTime(FLOOR, t1);
  g.connect(master);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(freq * 1.5, t0);
  filter.frequency.linearRampToValueAtTime(freq * 6, tr);
  filter.frequency.exponentialRampToValueAtTime(freq * 2, t1);
  filter.Q.setValueAtTime(1.2, t0);
  filter.connect(g);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, t0);
  osc.connect(filter);
  osc.start(t0);
  osc.stop(t1);
}

function playCapture(s: Synth, kind: CaptureKind): void {
  switch (kind) {
    case 'gain':
      // Two-note rising major chime.
      blip(s, 659.3, 140, 'triangle', { gain: 0.28 });
      blip(s, 1046.5, 220, 'triangle', { gain: 0.28, delayS: 0.11 });
      return;
    case 'loss':
      // AUD-F15: losing a tower — a short low thud: a falling triangle (harmonics above the phone-speaker floor;
      // under `hit`'s 320 Hz knock, which no longer plays for a loss) over the old sub-sine body, shortened, and
      // a low-passed knock; 3 voices, ends at 180 ms
      sweep(s, 180, 60, 150, 'triangle', { gain: 0.34 });
      sweep(s, 120, 45, 180, 'sine', { gain: 0.4 });
      noiseBurst(s, 60, 300, { gain: 0.2 });
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
  const env = envelope(ctx, master, t0, t1, (opts.gain ?? 0.3) * gainK);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq * pitchK, t0);
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
  const env = envelope(ctx, master, t0, t1, (opts.gain ?? 0.3) * gainK);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, from * pitchK), t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to * pitchK), t1);
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
  const env = envelope(ctx, master, t0, t1, (opts.gain ?? 0.3) * gainK);
  s.noise ??= makeNoiseBuffer(ctx);
  const src = ctx.createBufferSource();
  src.buffer = s.noise;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filter ?? 'lowpass';
  filter.frequency.setValueAtTime(filterHz * pitchK, t0); // AUD-F7: a detuned noise is a shifted cutoff
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
