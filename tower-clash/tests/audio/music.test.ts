import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Synth } from '../../src/audio/synth';
import type { Mix } from '../../src/audio/mixer';
import { dbToGain, BUS_DB, mixer } from '../../src/audio/mixer';
import { busLevels, musicState } from '../../src/audio/inspect';
import { BPM, LOOKAHEAD_S, LOOP_STEPS, MusicLoop, PLAY_GAP_S, STEP_S, midiHz, notesAt } from '../../src/audio/music';
import { audioSynth, initAudio, onSimFrame, playSfx, setAudioBackground, setMusicOn, setMuted, toggleMuted, unlockAudio } from '../../src/audio/index';
import { defaultSave } from '../../src/ui/save';
import type { FakeGain, FakeOscillator } from './fakeAudio';
import { FakeMixContext } from './fakeAudio';

/*
 * AUD-F6 music loop: 100 BPM, A minor (Am – F – C – G), pad / bass / pulse layers; a look-ahead
 * scheduler on the AudioContext clock (the timer only wakes it), the pulse layer only in play, a lazy
 * chunk the eager graph never reaches.
 */

const r6 = (t: number): number => Math.round(t * 1e6) / 1e6;

describe('the pattern', () => {
  it('100 BPM eighths (0.3 s), four bars of 8 steps, one chord per bar', () => {
    expect(BPM).toBe(100);
    expect(STEP_S).toBeCloseTo(0.3, 12);
    expect(LOOP_STEPS).toBe(32);
    const pads = (s: number) => notesAt(s).filter((n) => n.layer === 0).map((n) => n.midi);
    expect([0, 8, 16, 24].map(pads)).toEqual([
      [57, 60, 64], // Am
      [57, 60, 65], // F
      [55, 60, 64], // C
      [55, 59, 62], // G
    ]);
    for (let s = 1; s < 8; s++) expect(pads(s)).toEqual([]);
    expect(midiHz(69)).toBe(440);
  });

  it('repeats exactly every 32 steps (the wrap is just the next bar)', () => {
    for (let s = 0; s < LOOP_STEPS; s++) expect(notesAt(s + LOOP_STEPS)).toEqual(notesAt(s));
  });

  it('every step has one pulse note; the bass plays on 1, the "and" of 2, 3 and the "and" of 4', () => {
    for (let s = 0; s < LOOP_STEPS; s++) expect(notesAt(s).filter((n) => n.layer === 2)).toHaveLength(1);
    const bassSteps = [...Array(8).keys()].filter((i) => notesAt(i).some((n) => n.layer === 1));
    expect(bassSteps).toEqual([0, 3, 4, 7]);
  });
});

describe('look-ahead scheduler (fake clock)', () => {
  let ctx: FakeMixContext;
  let synth: Synth;
  let m: Mix;
  let loop: MusicLoop;

  beforeEach(() => {
    vi.useFakeTimers(); // the wake-up timer never fires on its own: the test drives tick()
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

  /** Advance the context clock in 25 ms wake-ups up to `until`, calling `each(now)` before each tick. */
  function run(from: number, until: number, each: (now: number) => void = () => undefined): void {
    for (let i = Math.round(from / 0.025); i * 0.025 <= until + 1e-9; i++) {
      ctx.currentTime = i * 0.025;
      each(ctx.currentTime);
      const before = ctx.oscillators.length;
      loop.tick();
      // nothing is scheduled in the past or further ahead than the look-ahead
      for (const o of ctx.oscillators.slice(before)) {
        expect(o.startAt!).toBeGreaterThanOrEqual(ctx.currentTime);
        expect(o.startAt!).toBeLessThan(ctx.currentTime + LOOKAHEAD_S);
      }
    }
  }

  /** Start times (and pitches) of the scheduled notes of `layer`. */
  const notes = (layer: number) =>
    ctx.oscillators
      .filter((o) => (o.connections[0] as FakeGain).connections[0] === loop.inputs[layer])
      .map((o: FakeOscillator) => ({ at: r6(o.startAt!), hz: r6(o.frequency.events[0]!.value) }));

  it('two bars: every note on the 0.3 s grid from t0, the right pitches, no duplicates, no pulse outside play', () => {
    loop.start(); // at 0: the first downbeat at 0.1
    run(0, 4.6); // steps 0..15 (the last at 4.6)
    expect(notes(0)).toEqual(
      [
        [0.1, 57],
        [0.1, 60],
        [0.1, 64],
        [2.5, 57],
        [2.5, 60],
        [2.5, 65],
      ].map(([at, midi]) => ({ at: at!, hz: r6(midiHz(midi!)) })),
    );
    expect(notes(1)).toEqual(
      [
        [0.1, 45],
        [1.0, 45],
        [1.3, 52],
        [2.2, 57],
        [2.5, 41],
        [3.4, 41],
        [3.7, 48],
        [4.6, 53],
      ].map(([at, midi]) => ({ at: at!, hz: r6(midiHz(midi!)) })),
    );
    expect(notes(2)).toEqual([]);
    expect(loop.step).toBe(16);
    // the clock, not the timer, decides: every start is exactly t0 + k × STEP_S
    for (const o of ctx.oscillators) {
      const k = (o.startAt! - loop.t0) / STEP_S;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
    }
  });

  it('wraps seamlessly: bar 5 is bar 1 again, 9.6 s after it, on the same grid', () => {
    loop.start();
    run(0, 9.7);
    const pads = notes(0);
    expect([...new Set(pads.map((p) => p.at))]).toEqual([0.1, 2.5, 4.9, 7.3, 9.7]);
    expect(pads.filter((p) => p.at === 9.7).map((p) => p.hz)).toEqual(pads.filter((p) => p.at === 0.1).map((p) => p.hz));
  });

  it('the pulse layer joins on the next downbeat once play frames come, and leaves within PLAY_GAP_S after they stop', () => {
    loop.start();
    run(0, 4.6, (now) => {
      if (now >= 1 && now <= 3) synth.playAt = now; // frames from 1 s to 3 s
    });
    // joins at step 8 (2.5: the first downbeat after 1 s), leaves at the first step scheduled ≥ 0.5 s after the last frame
    expect(notes(2).map((n) => n.at)).toEqual([2.5, 2.8, 3.1, 3.4]);
    expect(PLAY_GAP_S).toBe(0.5);
    const lvl = (loop.levels[2]!.gain as FakeGain['gain']).events.map((e) => ({ ...e, time: r6(e.time) }));
    expect(lvl).toEqual([
      { kind: 'set', value: 0, time: 2.5 },
      { kind: 'linear', value: 1, time: 2.8 },
      { kind: 'set', value: 1, time: 3.7 },
      { kind: 'linear', value: 0, time: 4 },
    ]);
  });

  it('a result stinger (the mixer\'s `ended`) drops the pulse while frames still come; the next match brings it back', () => {
    loop.start();
    run(0, 2.6, (now) => (synth.playAt = now));
    expect(loop.pulse).toBe(true);
    m.ended = true; // `won` played
    run(2.625, 3.2, (now) => (synth.playAt = now)); // the 600 ms result beat: frames continue
    expect(loop.pulse).toBe(false);
    run(3.225, 4.0); // the result screen: no frames → `ended` clears
    expect(m.ended).toBe(false);
    run(4.025, 7.6, (now) => (synth.playAt = now)); // retry
    expect(loop.pulse).toBe(true);
  });

  it('a late wake-up (a throttled timer) skips to the grid instead of a burst of past notes', () => {
    loop.start();
    run(0, 0.2);
    const before = ctx.oscillators.length;
    ctx.currentTime = 2.0;
    loop.tick();
    ctx.currentTime = 2.1;
    loop.tick();
    const late = ctx.oscillators.slice(before);
    expect(late.length).toBeGreaterThan(0);
    for (const o of late) expect(o.startAt!).toBeGreaterThanOrEqual(2.0);
    expect(late.map((o) => r6(o.startAt!))).toEqual(late.map(() => 2.2)); // step 7, the next on the grid
  });

  it('stop fades every layer out over 0.3 s and stops waking', () => {
    loop.start();
    run(0, 1);
    loop.stop();
    for (const g of loop.levels) expect((g.gain as FakeGain['gain']).events.at(-1)).toEqual({ kind: 'linear', value: 0, time: 1.3 });
    const n = ctx.oscillators.length;
    vi.advanceTimersByTime(500);
    ctx.currentTime = 1.5;
    expect(ctx.oscillators.length).toBe(n);
  });
});

describe('the facade starts and stops the loop', () => {
  let ctx: FakeMixContext;
  beforeEach(() => {
    ctx = new FakeMixContext();
  });
  afterEach(() => setMusicOn(false));

  const playing = async (want: boolean): Promise<void> => vi.waitFor(() => expect(musicState(audioSynth()).playing).toBe(want));

  it('on the first gesture with Music on; off / on with the setting and the page\'s visibility; Effects never stop it', async () => {
    const save = defaultSave();
    initAudio(save, { factory: () => ctx, persist: () => undefined });
    expect(musicState(audioSynth()).playing).toBe(false); // no gesture yet
    unlockAudio();
    await playing(true);
    const music = dbToGain(BUS_DB.music);
    expect(busLevels(audioSynth())?.music).toBeCloseTo(music, 9);
    setMuted(true); // Effects off
    expect(musicState(audioSynth()).playing).toBe(true);
    setMusicOn(false);
    expect(musicState(audioSynth()).playing).toBe(false);
    expect(busLevels(audioSynth())?.music).toBe(0);
    expect(save.settings.music).toBe(false);
    setMusicOn(true);
    expect(musicState(audioSynth()).playing).toBe(true);
    setAudioBackground(true);
    expect(musicState(audioSynth()).playing).toBe(false);
    setAudioBackground(false);
    expect(musicState(audioSynth()).playing).toBe(true);
    toggleMuted(); // the speaker: everything off
    expect(musicState(audioSynth()).playing).toBe(false);
  });

  it('a save with Music off never starts it; frames mark play for the pulse layer', async () => {
    const save = defaultSave();
    save.settings.music = false;
    initAudio(save, { factory: () => ctx, persist: () => undefined });
    unlockAudio();
    await new Promise((r) => setTimeout(r, 20));
    expect(musicState(audioSynth()).playing).toBe(false);
    ctx.currentTime = 3;
    onSimFrame({ units: [] });
    expect(audioSynth().playAt).toBe(3);
    expect(playSfx('button')).toBe(true); // effects still on
  });
});

/*
 * 0 eager bytes: the music, the mixer and the SFX rules are reached only through `import()` (the music
 * from src/audio/index.ts on the first gesture, the mixer + rules with the recipes chunk). A value
 * import from anything src/main.ts reaches would fold them back into the entry chunk.
 */
const SRC = resolve(new URL('../../src/', import.meta.url).pathname);
function staticDeps(f: string): string[] {
  const deps: string[] = [];
  for (const mm of readFileSync(f, 'utf8').matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^;'"]*?\s+from\s+)?'([^']+)'/gm)) {
    if (!mm[1]!.startsWith('.')) continue;
    const base = resolve(dirname(f), mm[1]!);
    const hit = [`${base}.ts`, join(base, 'index.ts')].find((c) => existsSync(c));
    if (hit) deps.push(hit);
  }
  return deps;
}

describe('lazy audio chunks (AUD-F6)', () => {
  it('src/main.ts reaches neither the music, the mixer, the SFX rules nor the recipes statically', () => {
    const seen = new Set<string>();
    const stack = [join(SRC, 'main.ts')];
    while (stack.length) {
      const f = stack.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      stack.push(...staticDeps(f));
    }
    expect(seen.size).toBeGreaterThan(50);
    expect(seen.has(join(SRC, 'audio/index.ts'))).toBe(true);
    for (const f of ['audio/music.ts', 'audio/mixer.ts', 'audio/sfxRules.ts', 'audio/recipes.ts']) expect(seen.has(join(SRC, f)), f).toBe(false);
  });

  it('the debug surface (loaded at idle on every page) reaches neither the music nor the mixer statically: it reads them through src/audio/inspect.ts', () => {
    const seen = new Set<string>();
    const stack = [join(SRC, 'debug.ts')];
    while (stack.length) {
      const f = stack.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      stack.push(...staticDeps(f));
    }
    expect(seen.has(join(SRC, 'audio/inspect.ts'))).toBe(true);
    for (const f of ['audio/music.ts', 'audio/mixer.ts', 'audio/recipes.ts']) expect(seen.has(join(SRC, f)), f).toBe(false);
  });

  it('the music chunk has one loader: the audio facade, through loadChunk', () => {
    const files = readdirSync(SRC, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'));
    const loaders = files.filter((f) => /\bimport\(\s*'\.\/(?:audio\/)?music'\s*\)/.test(readFileSync(join(SRC, f), 'utf8')));
    expect(loaders.map((f) => f.split('\\').join('/'))).toEqual(['audio/index.ts']);
    expect(readFileSync(join(SRC, 'audio/index.ts'), 'utf8')).toMatch(/loadChunk\('music', \(\) => import\('\.\/music'\)\)/);
  });

  it('reduced motion has no effect on audio: nothing under src/audio reads the motion preference', () => {
    for (const f of readdirSync(join(SRC, 'audio'))) {
      const code = readFileSync(join(SRC, 'audio', f), 'utf8');
      expect(code, f).not.toMatch(/ui\/motion|reducedMotion|prefers-reduced-motion/);
    }
  });
});
