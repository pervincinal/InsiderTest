import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioSynth, initAudio, loadSfxRecipes, playSfx, setAudioBackground, unlockAudio } from '../../src/audio/index';
import type { Mix } from '../../src/audio/mixer';
import { DUCK, dbToGain, duckLevel, mixer } from '../../src/audio/mixer';
import { MusicLoop, STEP_S } from '../../src/audio/music';
import { Synth } from '../../src/audio/synth';
import { defaultSave } from '../../src/ui/save';
import type { FakeGain, FakeOscillator } from './fakeAudio';
import { FakeMixContext } from './fakeAudio';

/*
 * AUD-Q19: audio interruptions. On iOS a phone call, Siri, an alarm, AirPods disconnecting or the AdMob
 * video's own audio takes the output away from the WebView: the AudioContext goes `interrupted` and its
 * clock stands still until the game resumes it — which WebKit allows only inside a user gesture, so
 * `unlock()` on the next pointerdown / keydown does it. While it lasts nothing may be scheduled: a voice
 * or a note planned on the frozen clock would play in a burst the moment the context runs again, and the
 * music would replay every step the hold skipped. After the resume the sound effects come back with the
 * next tap and the music re-joins its 0.3 s grid at the next step (never a note in the past).
 */

const SOUNDS = ['button', 'send', 'arrive', 'capture', 'won', 'lost', 'tally', 'stalemate', 'hit', 'mine', 'freeze', 'overdrive', 'purchase', 'achievement'] as const;
const r6 = (t: number): number => Math.round(t * 1e6) / 1e6;

describe('sound effects under an interruption (facade, fake context)', () => {
  let ctx: FakeMixContext;
  let m: Mix;

  beforeEach(async () => {
    ctx = new FakeMixContext();
    const save = defaultSave();
    save.settings.music = true;
    initAudio(save, { factory: () => ctx, persist: () => undefined });
    await loadSfxRecipes();
    unlockAudio();
    ctx.currentTime = 2;
    expect(playSfx('button')).toBe(true); // builds the mixer
    m = audioSynth().mix as Mix;
    ctx.clear();
  });
  afterEach(() => initAudio(defaultSave(), { factory: () => new FakeMixContext(), persist: () => undefined }));

  it('while interrupted every sound is refused: no voice scheduled, no throw, the rate-limit slots untouched', () => {
    ctx.state = 'interrupted';
    ctx.currentTime = 3;
    for (const name of SOUNDS) {
      expect(() => playSfx(name, { capture: 'gain', count: 3, step: 0 }), name).not.toThrow();
      expect(playSfx(name, { capture: 'gain', count: 3, step: 0 }), name).toBe(false);
    }
    expect(ctx.voices()).toEqual([]);
    // the refusal consumed no rate-limit slot: the first `arrive` after the resume plays at once
    ctx.state = 'running';
    expect(playSfx('arrive')).toBe(true);
    expect(ctx.voices()).toHaveLength(1);
  });

  it('the next gesture resumes the context and the sound is back on that tap', () => {
    ctx.state = 'interrupted';
    const resumes = ctx.resumeCalls;
    expect(playSfx('button')).toBe(false);
    expect(unlockAudio()).toBe(true); // pointerdown
    expect(ctx.resumeCalls).toBe(resumes + 1);
    expect(ctx.state).toBe('running');
    expect(playSfx('button')).toBe(true); // pointerup
    expect(ctx.voices()).toHaveLength(1);
  });

  it('a call that also hides the page: no suspend of a held context, no resume on return — the gesture does it', () => {
    ctx.state = 'interrupted';
    const resumes = ctx.resumeCalls;
    setAudioBackground(true);
    expect(ctx.suspendCalls).toBe(0);
    expect(ctx.state).toBe('interrupted');
    setAudioBackground(false); // nothing of ours to undo: iOS refuses a resume outside a gesture anyway
    expect(ctx.resumeCalls).toBe(resumes);
    expect(ctx.state).toBe('interrupted');
    unlockAudio();
    expect(ctx.resumeCalls).toBe(resumes + 1);
    expect(ctx.state).toBe('running');
  });

  it('the duck does not stack: refused sounds plan no duck, a duck that was running simply releases', () => {
    const D = dbToGain(DUCK.db);
    const events = () => (m.duck.gain as FakeGain['gain']).events.map((e) => ({ ...e, time: r6(e.time) }));
    expect(playSfx('capture', { capture: 'gain' })).toBe(true); // at 2: held to 2.3, released by 2.55
    expect(m.plan).toEqual({ start: 2, from: 1, until: 2.3 });
    const planned = events();
    expect(planned).toHaveLength(4);
    ctx.currentTime = 2.1; // the call comes mid-hold; the clock stands still
    ctx.state = 'interrupted';
    for (let i = 0; i < 20; i++) playSfx('capture', { capture: 'loss' });
    playSfx('won');
    expect(m.plan).toEqual({ start: 2, from: 1, until: 2.3 }); // untouched: no deeper, no longer, no `ended`
    expect(m.ended).toBe(false);
    expect(events()).toEqual(planned);
    // the resume: the clock runs on from where it stopped, the planned release lands as scheduled
    ctx.state = 'running';
    unlockAudio();
    expect(duckLevel(m.plan, 2.1)).toBeCloseTo(D, 9);
    expect(duckLevel(m.plan, 2.55)).toBe(1);
    // and the next capture after the resume re-plans from the live level: one plan, −6 dB at most
    ctx.currentTime = 2.4;
    expect(playSfx('capture', { capture: 'gain' })).toBe(true);
    expect(m.plan!.until).toBeCloseTo(2.7, 9);
    expect(Math.min(...events().map((e) => e.value))).toBeCloseTo(D, 9);
  });
});

describe('music loop under an interruption (scheduler on the fake clock)', () => {
  let ctx: FakeMixContext;
  let synth: Synth;
  let loop: MusicLoop;

  beforeEach(() => {
    vi.useFakeTimers(); // the wake-up timer never fires on its own: the tests drive tick()
    ctx = new FakeMixContext();
    synth = new Synth(() => ctx);
    synth.unlock();
    loop = new MusicLoop(synth, mixer(synth)!);
  });
  afterEach(() => {
    loop.stop();
    vi.useRealTimers();
  });

  /** Advance the clock in 25 ms wake-ups up to `until`, ticking at each. */
  function run(from: number, until: number): void {
    for (let i = Math.round(from / 0.025); i * 0.025 <= until + 1e-9; i++) {
      ctx.currentTime = i * 0.025;
      loop.tick();
    }
  }
  const starts = (): number[] => ctx.oscillators.map((o: FakeOscillator) => r6(o.startAt!));
  /** Every start sits on the grid t0 + k × STEP_S. */
  const onGrid = (): boolean => starts().every((t) => Math.abs((t - loop.t0) / STEP_S - Math.round((t - loop.t0) / STEP_S)) < 1e-9);

  it('schedules nothing while interrupted (frozen clock) and carries on at the next step after the resume', () => {
    loop.start();
    run(0, 1.0); // steps 0..3 scheduled (the last at 1.0; 1.3 is past the look-ahead)
    const before = ctx.oscillators.length;
    const step = loop.step;
    ctx.state = 'interrupted';
    for (let i = 0; i < 40; i++) loop.tick(); // a 1 s call: 40 wake-ups on a clock that does not move
    expect(ctx.oscillators.length).toBe(before);
    expect(loop.step).toBe(step);
    ctx.state = 'running'; // the next gesture
    run(1.025, 1.6);
    expect([...new Set(starts().slice(before))]).toEqual([1.3]); // step 4 (the bass on 3), once; step 5 carries only the pulse, which is off
    expect(loop.step).toBe(6);
    expect(onGrid()).toBe(true);
  });

  it('a hold whose clock jumped (a long call, the OS resumed the context later): the next notes are on the grid, none in the past, none replayed', () => {
    loop.start();
    run(0, 1.0);
    const before = ctx.oscillators.length;
    ctx.state = 'interrupted';
    ctx.currentTime = 1.5;
    loop.tick();
    ctx.currentTime = 7.4; // the call ran 6.4 s; the context clock advanced with it
    loop.tick();
    expect(ctx.oscillators.length).toBe(before);
    ctx.state = 'running';
    loop.tick(); // the first wake-up after the resume: the grid's next step (25, at 7.6) is past the look-ahead — nothing yet, nothing in the past
    expect(ctx.oscillators.length).toBe(before);
    expect(loop.step).toBe(25); // re-aligned: steps 4–24, what the hold skipped, are not replayed
    expect(r6(loop.t0 + 25 * STEP_S)).toBe(7.6);
    run(7.425, 8.2);
    const after = starts().slice(before);
    expect(after.length).toBeGreaterThan(0);
    for (const t of after) expect(t).toBeGreaterThanOrEqual(7.4);
    // steps 25 and 26 (bar 4's "and" of 1 and its 2) carry only the pulse, which is off: the first note after the re-join is
    // step 27's bass (the "and" of 2) at 8.2, on the grid
    expect([...new Set(after)]).toEqual([8.2]);
    expect(r6(loop.t0 + 27 * STEP_S)).toBe(8.2);
    expect(loop.step).toBe(28);
    expect(onGrid()).toBe(true);
    // the pulse layer did not sneak in: no play frame came during the hold
    expect(loop.pulse).toBe(false);
  });

  it('a start during the hold (Music switched on mid-call) waits for the resume too', () => {
    ctx.currentTime = 3;
    ctx.state = 'interrupted';
    loop.start(); // the fade-in is planned on the frozen clock; nothing is scheduled
    expect(ctx.oscillators).toHaveLength(0);
    ctx.state = 'running';
    run(3.025, 4.0);
    expect([...new Set(starts())]).toEqual([3.1, 4.0]); // the first downbeat LEAD_S after the start (pad + bass), then step 3's bass
    expect(onGrid()).toBe(true);
  });
});
