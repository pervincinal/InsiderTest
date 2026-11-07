import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Synth } from '../../src/audio/synth';
import type { MatchView } from '../../src/audio/synth';
import type { Mix } from '../../src/audio/mixer';
import { mixer } from '../../src/audio/mixer';
import { musicState } from '../../src/audio/inspect';
import {
  HAT,
  KICK,
  LOOKAHEAD_S,
  MusicLoop,
  PAD_UNDER_TENSION,
  STEP_S,
  TENSION,
  intensityOf,
  smoothIntensity,
  tensionAt,
  tensionGate,
} from '../../src/audio/music';
import { audioSynth, initAudio, onSimFrame, setMusicOn, unlockAudio } from '../../src/audio/index';
import { C } from '../../src/sim/constants';
import { createState } from '../../src/sim/create';
import type { Link, Owner, Tower, Unit } from '../../src/sim/types';
import { defaultSave } from '../../src/ui/save';
import { makeLevel } from '../helpers';
import type { Path } from './envelope';
import { paramAt, peakOf } from './envelope';
import type { FakeBufferSource, FakeGain, FakeOscillator } from './fakeAudio';
import { FakeMixContext } from './fakeAudio';

/*
 * FEEL-1-4: the music's tension layer (the 2026-10-29 audit's L2). A low triangle kick on the beats and noise
 * hats on the off-beats fade in over 0.8 s when a smoothed intensity — own towers under fire, hostile streams in,
 * 1 − the player's unit share, read once per AI tick on the UI side — reaches 0.6, and out below 0.4. Only in
 * play; the Music setting gates it; the loop's summed peak does not rise; the AUD-Q19 interruption rules hold
 * (tests/audio/interrupted.test.ts).
 */

const r6 = (t: number): number => Math.round(t * 1e6) / 1e6;

/** A match view: towers `[owner, units, under fire?]`, hostile streams `[from owner, to tower]`, road units. */
function view(towers: [Owner, number, boolean?][], links: [Owner, number][] = [], units: [Owner, number][] = [], time = 10_000): Required<MatchView> {
  const rec: Record<string, Tower> = {};
  towers.forEach(([owner, n, hot], i) => (rec[`t${i}`] = { id: `t${i}`, owner, units: n, underFireUntilMs: hot ? time + 500 : 0 } as Tower));
  return {
    time,
    towers: rec,
    links: links.map(([owner, to]) => ({ owner, from: 'x', to: `t${to}` }) as Link),
    units: units.map(([owner, weight], i) => ({ id: i, owner, weight, to: 't0' }) as Unit),
  };
}

describe('intensity (pure)', () => {
  it('weights 0.4 under fire · 0.35 streams in (÷ 3, capped) · 0.25 (1 − unit share); neutral ignored', () => {
    expect(TENSION).toMatchObject({ on: 0.6, off: 0.4, fadeS: 0.8, rate: 3, streamsFull: 3, weights: [0.4, 0.35, 0.25] });
    // calm and even: only the share term (0.25 × 0.5)
    expect(intensityOf(view([['player', 10], ['enemy1', 10], ['neutral', 50]]))).toBeCloseTo(0.125, 9);
    // the real L-start state of makeLevel() is the same calm 0.125
    expect(intensityOf(createState(makeLevel(), 1))).toBeCloseTo(0.125, 9);
    // one stream on one of three towers, even: 0.4/3 + 0.35/3 + 0.125 = 0.375 → stays off
    const one = view([['player', 10, true], ['player', 10], ['player', 10], ['enemy1', 30]], [['enemy1', 0]]);
    expect(intensityOf(one)).toBeCloseTo(0.375, 9);
    // a siege: 2 of 3 towers hit, 2 streams in, 35 % of the units → 0.267 + 0.233 + 0.1625 = 0.6625 → on
    const siege = view([['player', 10, true], ['player', 10, true], ['player', 15], ['enemy1', 65]], [['enemy1', 0], ['enemy2', 1]]);
    expect(intensityOf(siege)).toBeCloseTo(0.4 * (2 / 3) + 0.35 * (2 / 3) + 0.25 * 0.65, 9);
    // overrun: the last tower hit by 4 streams, 20 % of the units (the roads count: 5 player, 15 enemy weight)
    const overrun = view([['player', 15, true], ['enemy1', 65]], [['enemy1', 0], ['enemy1', 0], ['enemy2', 0], ['enemy3', 0]], [['player', 5], ['enemy1', 15]]);
    expect(intensityOf(overrun)).toBeCloseTo(0.4 + 0.35 + 0.25 * 0.8, 9);
    // dominating: 80 % of the units, one desperate stream into one of five towers → 0.08 + 0.117 + 0.05 < 0.4
    const lead = view([['player', 20, true], ['player', 20], ['player', 20], ['player', 10], ['player', 10], ['enemy1', 20]], [['enemy1', 0]]);
    expect(intensityOf(lead)).toBeLessThan(TENSION.off);
    // own streams into own or enemy towers never count; no towers left reads as fully under fire
    expect(intensityOf(view([['player', 10], ['enemy1', 10]], [['player', 1], ['player', 0]]))).toBeCloseTo(0.125, 9);
    expect(intensityOf(view([['enemy1', 10]]))).toBeCloseTo(0.4 + 0.25, 9);
    expect(intensityOf(view([]))).toBeCloseTo(0.4 + 0.125, 9); // nobody owns anything: share 0.5
  });

  it('smoothing: 1 − e^(−3·dt) per update; hysteresis on at ≥ 0.6, off below 0.4', () => {
    expect(smoothIntensity(0, 1, 0.5)).toBeCloseTo(1 - Math.exp(-1.5), 12);
    expect(smoothIntensity(0.5, 0.5, 2)).toBe(0.5);
    let x = 0;
    for (let i = 0; i < 2; i++) x = smoothIntensity(x, 0.9, C.AI_TICK_MS / 1000);
    expect(x).toBeGreaterThan(0.6); // a sudden siege (raw 0.9) turns it on within two AI ticks (1 s)
    expect(tensionGate(false, 0.59)).toBe(false);
    expect(tensionGate(false, 0.6)).toBe(true);
    expect(tensionGate(true, 0.4)).toBe(true);
    expect(tensionGate(true, 0.399)).toBe(false);
    expect(tensionGate(false, 0.5)).toBe(false);
    expect(tensionGate(true, 0.5)).toBe(true);
  });

  it('the hits: a kick on every beat, a hat on every off-beat — at most 2 voices per beat', () => {
    expect([...Array(8).keys()].map(tensionAt)).toEqual(['kick', 'hat', 'kick', 'hat', 'kick', 'hat', 'kick', 'hat']);
    expect(KICK).toMatchObject({ fromHz: 150, toHz: 45, dur: 0.12 });
    expect(HAT.hz).toBe(7000);
  });
});

describe('the layer on the music clock (fake context)', () => {
  let ctx: FakeMixContext;
  let synth: Synth;
  let m: Mix;
  let loop: MusicLoop;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = new FakeMixContext();
    synth = new Synth(() => ctx);
    synth.unlock();
    m = mixer(synth)!;
    loop = new MusicLoop(synth, m);
  });
  afterEach(() => {
    loop.stop();
    vi.useRealTimers();
  });

  const HOT = (time: number) => view([['player', 10, true], ['enemy1', 60]], [['enemy1', 0], ['enemy1', 0], ['enemy2', 0]], [], time);
  const CALM = (time: number) => view([['player', 40], ['enemy1', 10]], [], [], time);

  /** 25 ms wake-ups from `from` to `until`; `frame(now)` returns the match view of a play frame then (null: no frame). */
  function run(from: number, until: number, frame: (now: number) => Required<MatchView> | null = () => null): void {
    for (let i = Math.round(from / 0.025); i * 0.025 <= until + 1e-9; i++) {
      ctx.currentTime = i * 0.025;
      const v = frame(ctx.currentTime);
      if (v) {
        synth.playAt = ctx.currentTime;
        synth.sim = v;
      }
      const [no, ns] = [ctx.oscillators.length, ctx.sources.length];
      loop.tick();
      for (const o of [...ctx.oscillators.slice(no), ...ctx.sources.slice(ns)]) {
        expect(o.startAt!).toBeGreaterThanOrEqual(ctx.currentTime);
        expect(o.startAt!).toBeLessThan(ctx.currentTime + LOOKAHEAD_S);
      }
    }
  }
  /** Sim time runs 1:1 with the clock in these runs (ms). */
  const simAt = (now: number): number => Math.round(now * 1000 / 50) * 50;

  const kicks = () => ctx.oscillators.filter((o) => (o.connections[0] as FakeGain).connections[0] === loop.inputs[3]);
  const hats = () => ctx.sources.filter((s) => (s.connections[0] as FakeGain).connections[0] === loop.inputs[4]);
  const level = () => (loop.levels[3]!.gain as FakeGain['gain']).events.map((e) => ({ ...e, time: r6(e.time) }));
  const trim = () => (loop.padTrim.gain as FakeGain['gain']).events.map((e) => ({ ...e, time: r6(e.time) }));

  it('a siege fades it in over 0.8 s (pad trimmed to 0.45 with it); calm fades it out; the hits stop once the fade-out ends', () => {
    loop.start();
    run(0, 2.0, (now) => HOT(simAt(now)));
    expect(loop.hot).toBe(true);
    expect(loop.tension).toBe(true);
    expect(musicState(synth)).toMatchObject({ playing: true, tension: true });
    const on = level();
    expect(on).toHaveLength(2);
    const t1 = on[0]!.time;
    expect(on).toEqual([
      { kind: 'set', value: 0, time: t1 },
      { kind: 'linear', value: 1, time: r6(t1 + 0.8) },
    ]);
    expect(trim()).toEqual([
      { kind: 'set', value: 1, time: t1 },
      { kind: 'linear', value: PAD_UNDER_TENSION, time: r6(t1 + 0.8) },
    ]);
    // the gate opened within the first second of the siege (two AI ticks of smoothing), the fade on a step of the grid
    expect(t1).toBeLessThan(1.3);
    expect(Math.abs((t1 - loop.t0) / STEP_S - Math.round((t1 - loop.t0) / STEP_S))).toBeLessThan(1e-9);
    // from then: a kick on every beat, a hat on every off-beat, on the grid
    const steps = (xs: { startAt: number | null }[]) => xs.map((x) => Math.round((x.startAt! - loop.t0) / STEP_S));
    expect(steps(kicks()).every((s) => s % 2 === 0)).toBe(true);
    expect(steps(hats()).every((s) => s % 2 === 1)).toBe(true);
    expect(Math.min(...kicks().map((k) => k.startAt!), ...hats().map((h) => h.startAt!))).toBeCloseTo(t1, 9);
    const k0 = kicks()[0]! as FakeOscillator;
    expect(k0.type).toBe('triangle');
    expect(k0.frequency.events.map((e) => e.value)).toEqual([KICK.fromHz, KICK.toHz]);
    expect(r6(k0.stopAt! - k0.startAt!)).toBe(KICK.dur);
    expect((hats()[0] as FakeBufferSource).buffer).toBe(synth.noise);

    // calm: the smoothed intensity drops below 0.4 → fade out over 0.8 s, the pad back to 1
    run(2.025, 5.0, (now) => CALM(simAt(now)));
    expect(loop.tension).toBe(false);
    const off = level().slice(2);
    const t2 = off[0]!.time;
    expect(off).toEqual([
      { kind: 'set', value: 1, time: t2 },
      { kind: 'linear', value: 0, time: r6(t2 + 0.8) },
    ]);
    expect(trim().slice(2)).toEqual([
      { kind: 'set', value: PAD_UNDER_TENSION, time: t2 },
      { kind: 'linear', value: 1, time: r6(t2 + 0.8) },
    ]);
    const last = Math.max(...kicks().map((k) => k.startAt!), ...hats().map((h) => h.startAt!));
    expect(last).toBeLessThan(t2 + 0.8);
    expect(last).toBeGreaterThan(t2 + 0.8 - 2 * STEP_S); // the hits ring under the whole fade, then stop
  });

  it('hysteresis: an intensity between 0.4 and 0.6 never turns it on, and never turns it off once on', () => {
    // 0.375 + a bit: one tower of two hit, one stream, even units → 0.2 + 0.117 + 0.125 = 0.44
    const MID = (time: number) => view([['player', 10, true], ['player', 10], ['enemy1', 20]], [['enemy1', 0]], [], time);
    loop.start();
    run(0, 3, (now) => MID(simAt(now)));
    expect(loop.intensity).toBeGreaterThan(TENSION.off);
    expect(loop.intensity).toBeLessThan(TENSION.on);
    expect(loop.tension).toBe(false);
    expect(kicks().length + hats().length).toBe(0);
    run(3.025, 5, (now) => HOT(simAt(now)));
    expect(loop.tension).toBe(true);
    run(5.025, 9, (now) => MID(simAt(now)));
    expect(loop.intensity).toBeLessThan(TENSION.on);
    expect(loop.tension).toBe(true);
  });

  it('once per AI tick: the intensity moves only when the sim crosses an AI_TICK_MS boundary', () => {
    loop.start();
    run(0, 0.1, () => HOT(0));
    const x = loop.intensity;
    expect(x).toBeCloseTo(smoothIntensity(0, intensityOf(HOT(0)), C.AI_TICK_MS / 1000), 12);
    run(0.125, 0.6, () => HOT(450)); // same AI tick (0)
    expect(loop.intensity).toBe(x);
    run(0.625, 0.7, () => HOT(500)); // the next one
    expect(loop.intensity).toBeCloseTo(smoothIntensity(x, intensityOf(HOT(500)), C.AI_TICK_MS / 1000), 12);
  });

  it('gating: never on the title / menus (no play frames, even with a hot match left in the synth), off on the outcome', () => {
    loop.start();
    synth.sim = HOT(10_000); // a stale state from the last match
    run(0, 4); // no frames: the title
    expect(loop.tension).toBe(false);
    expect(loop.intensity).toBe(0);
    expect(kicks().length + hats().length).toBe(0);
    run(4.025, 6, (now) => HOT(simAt(now)));
    expect(loop.tension).toBe(true);
    m.ended = true; // the `won` / `lost` tick: frames still come for the 600 ms beat
    run(6.025, 7.5, (now) => HOT(simAt(now)));
    expect(loop.tension).toBe(false);
    run(7.525, 9); // the result screen: no frames → calm, reset
    expect(loop.intensity).toBe(0);
    expect(loop.hot).toBe(false);
  });

  it('a new match (the sim clock went back) starts calm again', () => {
    loop.start();
    run(0, 3, (now) => HOT(simAt(now)));
    expect(loop.intensity).toBeGreaterThan(0.8);
    run(3.025, 3.05, () => CALM(0)); // the retry's first frame
    expect(loop.intensity).toBeCloseTo(smoothIntensity(0, intensityOf(CALM(0)), C.AI_TICK_MS / 1000), 12);
  });

  it('loudness: the loop\'s summed peak with the tension layer on is not above today\'s (pulse on, no tension)', () => {
    /** Every music voice as an envelope path through its layer level (and the pad trim) into the music bus. */
    const pathsOf = (): Path[] =>
      (ctx.voices() as (FakeOscillator | FakeBufferSource)[]).map((v) => {
        const env = v.connections[0] as FakeGain;
        const input = env.connections[0] as FakeGain;
        const li = loop.inputs.indexOf(input);
        const lvl = loop.levels[Math.min(3, li)]!.gain as FakeGain['gain'];
        const after = [{ param: lvl, initial: 0 }];
        if (li === 0) after.push({ param: loop.padTrim.gain as FakeGain['gain'], initial: 1 });
        return { env: env.gain, after, start: v.startAt!, stop: v.stopAt! };
      });
    // today: the loop in play, the pulse on, no tension (the notes are exactly the pre-FEEL-1-4 ones)
    loop.start();
    run(0, 12, (now) => CALM(simAt(now)));
    const before = peakOf(pathsOf(), 2.5, 12);
    loop.stop();
    ctx.clear();
    // tension on from the start of the measured window (well after the 1.5 s pad fade-in and the 0.8 s tension fade)
    ctx.currentTime = 0;
    loop = new MusicLoop(synth, m);
    loop.start();
    run(0, 12, (now) => HOT(simAt(now)));
    expect(loop.tension).toBe(true);
    const after = peakOf(pathsOf(), 2.5, 12);
    console.info(`FEEL-1-4 music envelope peak (pre-bus): before ${before.peak.toFixed(4)} at ${before.at.toFixed(3)} s, with tension ${after.peak.toFixed(4)} at ${after.at.toFixed(3)} s`);
    expect(after.peak).toBeLessThanOrEqual(before.peak + 1e-9);
    // the layer is not inaudible either: the kick sits at ≥ 1/2 of the pad's trimmed level
    expect(KICK.gain).toBeGreaterThanOrEqual(0.5 * 0.21 * PAD_UNDER_TENSION);
    // and the trim is all the pad gives: with tension off the pad plays at 1
    expect(paramAt(loop.padTrim.gain as FakeGain['gain'], 0.05, 1)).toBe(1);
  });
});

describe('the Music setting gates it (facade)', () => {
  afterEach(() => setMusicOn(false));

  it('Music off: no loop, no tension, whatever the match; frames hand the state over for when it is on', async () => {
    const ctx = new FakeMixContext();
    const save = defaultSave();
    save.settings.music = false;
    initAudio(save, { factory: () => ctx, persist: () => undefined });
    unlockAudio();
    const hot = view([['player', 10, true], ['enemy1', 60]], [['enemy1', 0], ['enemy1', 0], ['enemy1', 0]]);
    ctx.currentTime = 1;
    onSimFrame(hot);
    expect(audioSynth().sim).toBe(hot);
    expect(musicState(audioSynth())).toMatchObject({ playing: false, tension: false, intensity: 0 });
    expect(ctx.oscillators.filter((o) => o.type === 'triangle' && o.frequency.events[0]?.value === KICK.fromHz)).toHaveLength(0);
  });
});
