import { beforeEach, describe, expect, it } from 'vitest';
import { audioSynth, initAudio, loadSfxRecipes, playSfx, setMusicOn, setMuted, toggleMuted, unlockAudio } from '../../src/audio/index';
import type { SfxName } from '../../src/audio/index';
import type { Mix } from '../../src/audio/mixer';
import { BUS_DB, DUCK, LIMITER, OUTCOME_HOLD_S, busFor, dbToGain, duckFor, duckLevel } from '../../src/audio/mixer';
import { resultCues } from '../../src/audio/resultCues';
import { RESULT_BEAT_MS } from '../../src/ui/play';
import { busLevels } from '../../src/audio/inspect';
import { RATE_LIMIT_S } from '../../src/audio/sfxRules';
import { defaultSave } from '../../src/ui/save';
import type { SaveData } from '../../src/ui/save';
import type { FakeGain } from './fakeAudio';
import { FakeMixContext } from './fakeAudio';

/*
 * AUD-F6 mixer: master → limiter (DynamicsCompressor) → make-up trim → destination; the SFX and UI
 * buses into master, the music bus through its duck gain; every recipe routed to SFX or UI; the music
 * ducks −6 dB on own / lost captures, the result stingers and the stalemate hint / card.
 */

let ctx: FakeMixContext;
let save: SaveData;

async function setup(music = false): Promise<Mix> {
  ctx = new FakeMixContext();
  save = defaultSave();
  save.settings.music = music;
  initAudio(save, { factory: () => ctx, persist: () => undefined });
  await loadSfxRecipes();
  unlockAudio();
  expect(playSfx('arrive')).toBe(true); // the first sound builds the mixer
  const m = audioSynth().mix as Mix;
  expect(m).not.toBeNull();
  return m;
}

const PLAY: SfxName[] = ['send', 'arrive', 'capture', 'upgrade', 'unitDied', 'artillery', 'won', 'lost', 'hit', 'mine', 'freeze', 'overdrive', 'tally', 'tankArrive'];
const UI: SfxName[] = ['button', 'refuse', 'stalemate', 'purchase', 'reward', 'unlock', 'achievement'];

describe('graph', () => {
  it('master → limiter → trim → destination; SFX / UI into master; music → duck → master', async () => {
    const m = await setup();
    const master = ctx.gains[0]!;
    const limiter = ctx.compressors[0]!;
    expect(master.connections).toEqual([limiter]);
    const trim = limiter.connections[0] as FakeGain;
    expect(trim.connections).toEqual([ctx.destination]);
    expect(trim.gain.value).toBeCloseTo(dbToGain(LIMITER.trimDb), 6);
    expect((m.sfx as FakeGain).connections).toEqual([master]);
    expect((m.ui as FakeGain).connections).toEqual([master]);
    expect((m.music as FakeGain).connections).toEqual([m.duck]);
    expect((m.duck as FakeGain).connections).toEqual([master]);
    expect(master.gain.value).toBe(0.5);
  });

  it('the limiter is brick-wall-ish and the trim cancels WebAudio\'s automatic make-up gain', async () => {
    await setup();
    const l = ctx.compressors[0]!;
    expect([l.threshold.value, l.knee.value, l.ratio.value, l.attack.value, l.release.value]).toEqual([-6, 0, 20, 0.002, 0.12]);
    // spec: make-up = 0.6 × the gain reduction at 0 dBFS (threshold × (1 − 1 / ratio))
    expect(LIMITER.trimDb).toBeCloseTo(0.6 * LIMITER.thresholdDb * (1 - 1 / LIMITER.ratio), 2);
  });

  it('without a DynamicsCompressor (old WebViews) master goes straight out', async () => {
    const bare = new (class extends FakeMixContext {})();
    (bare as { createDynamicsCompressor?: unknown }).createDynamicsCompressor = undefined;
    initAudio(defaultSave(), { factory: () => bare, persist: () => undefined });
    await loadSfxRecipes();
    unlockAudio();
    expect(playSfx('button')).toBe(true);
    expect(bare.gains[0]!.connections).toEqual([bare.destination]);
    expect(busLevels(audioSynth())?.limiter).toBeNull();
  });
});

describe('bus routing', () => {
  beforeEach(async () => {
    await setup();
  });

  it('taps, menu clicks and toasts → UI; every play sound (and any recipe added later) → SFX', () => {
    for (const n of UI) expect(busFor(n), n).toBe('ui');
    for (const n of PLAY) expect(busFor(n), n).toBe('sfx');
  });

  it('each recipe\'s voices connect to its bus, never to master directly', () => {
    const m = audioSynth().mix as Mix;
    const master = ctx.gains[0]!;
    for (const name of [...PLAY, ...UI]) {
      ctx.clear();
      ctx.currentTime += 1;
      expect(playSfx(name, { capture: 'gain', count: 3, step: 0 }), name).toBe(true); // `step`: the result card's chord (AUD-F9)
      // the envelope gains are the ones that feed a bus or master (filters and sources feed envelopes)
      const outs = ctx.gains.filter((g) => g.connections.length > 0).map((g) => g.connections[0]);
      expect(outs.length, name).toBeGreaterThan(0);
      expect(outs.every((o) => o === (busFor(name) === 'ui' ? m.ui : m.sfx)), name).toBe(true);
      expect(outs).not.toContain(master);
    }
  });

  it('Effects off zeroes SFX + UI (what rings is cut too), Music off the music bus; master is untouched', async () => {
    await setup(true);
    const db = (n: keyof typeof BUS_DB): number => dbToGain(BUS_DB[n]);
    expect(busLevels(audioSynth())).toMatchObject({ master: 0.5, sfx: db('sfx'), ui: db('ui'), music: db('music'), duck: 1 });
    setMuted(true);
    expect(busLevels(audioSynth())).toMatchObject({ master: 0.5, sfx: 0, ui: 0, music: db('music') });
    setMusicOn(false);
    expect(busLevels(audioSynth())).toMatchObject({ sfx: 0, ui: 0, music: 0 });
    setMuted(false);
    expect(busLevels(audioSynth())).toMatchObject({ sfx: db('sfx'), ui: db('ui'), music: 0 });
    toggleMuted(); // the speaker: something audible → everything off
    expect(busLevels(audioSynth())).toMatchObject({ sfx: 0, ui: 0, music: 0 });
    toggleMuted();
    expect(busLevels(audioSynth())).toMatchObject({ sfx: db('sfx'), ui: db('ui'), music: db('music') });
  });

  it('the hit / mine / capture rate limits stay as they were (AUD-F1 / F2); AUD-F8–F10 add the tank, the gold tick and the clink', () => {
    expect(RATE_LIMIT_S).toEqual({ arrive: 0.1, unitDied: 0.08, artillery: 0.1, send: 0.05, refuse: 0.12, mine: 0.12, tankArrive: 0.2, tally: 0.125, purchase: 0.08, airstrike: 0.15 }); // FEEL-1-2 adds the airstrike
    expect(RATE_LIMIT_S.capture).toBeUndefined();
  });
});

describe('ducking (fake clock)', () => {
  const D = dbToGain(DUCK.db);
  let m: Mix;
  beforeEach(async () => {
    m = await setup(true);
  });
  /** The duck gain's automation, times rounded to the microsecond (float sums such as 2.2 + 0.3). */
  const duckEvents = () => (m.duck.gain as FakeGain['gain']).events.map((e) => ({ ...e, time: Math.round(e.time * 1e6) / 1e6 }));

  it('which sounds duck, and for how long', () => {
    expect(duckFor('capture', { capture: 'gain' })).toBe(0.3);
    expect(duckFor('capture', { capture: 'loss' })).toBe(0.3);
    expect(duckFor('capture', { capture: 'other' })).toBeNull(); // an enemy taking a neutral: no pumping
    expect(duckFor('stalemate')).toBe(0.3);
    // AUD-F9: the outcome tick holds the duck over the beat and the card's cues; each card cue is a short duck inside it
    expect(duckFor('won')).toBeCloseTo(2.3);
    expect(duckFor('lost')).toBeCloseTo(1.25);
    for (const n of ['won', 'lost', 'tally'] as const) expect(duckFor(n, { step: 0 }), n).toBe(DUCK.holdS);
    for (const n of ['send', 'arrive', 'tankArrive', 'hit', 'mine', 'button', 'refuse', 'upgrade', 'freeze', 'overdrive', 'purchase', 'reward', 'unlock', 'achievement'] as const)
      expect(duckFor(n), n).toBeNull();
    expect(D).toBeCloseTo(0.501, 3); // −6 dB
  });

  it('a capture: −6 dB in 20 ms, held to 300 ms, back to 0 dB 250 ms later', () => {
    ctx.currentTime = 2;
    expect(playSfx('capture', { capture: 'gain' })).toBe(true);
    expect(duckEvents()).toEqual([
      { kind: 'set', value: 1, time: 2 },
      { kind: 'linear', value: D, time: 2.02 },
      { kind: 'set', value: D, time: 2.3 },
      { kind: 'linear', value: 1, time: 2.55 },
    ]);
    expect(duckLevel(m.plan, 2)).toBe(1);
    expect(duckLevel(m.plan, 2.01)).toBeCloseTo((1 + D) / 2, 6);
    expect(duckLevel(m.plan, 2.1)).toBe(D);
    expect(duckLevel(m.plan, 2.3 + DUCK.releaseS / 2)).toBeCloseTo((1 + D) / 2, 6);
    expect(duckLevel(m.plan, 2.6)).toBe(1);
    expect(m.ended).toBe(false);
  });

  it('an overlapping duck re-plans from the current level and extends the hold, never deeper than −6 dB', () => {
    ctx.currentTime = 2;
    playSfx('capture', { capture: 'loss' });
    ctx.currentTime = 2.2; // held
    playSfx('stalemate');
    const ev = duckEvents();
    expect(ev.filter((e) => e.time >= 2.2)).toEqual([
      { kind: 'set', value: D, time: 2.2 },
      { kind: 'linear', value: D, time: 2.22 },
      { kind: 'set', value: D, time: 2.5 },
      { kind: 'linear', value: 1, time: 2.75 },
    ]);
    expect(Math.min(...ev.map((e) => e.value))).toBeCloseTo(D, 9);
    // in the release: starts from the ramp's current level (no jump)
    ctx.currentTime = 2.5 + DUCK.releaseS / 2;
    playSfx('capture', { capture: 'gain' });
    expect(duckEvents().find((e) => e.time === 2.625)?.value).toBeCloseTo((1 + D) / 2, 6);
  });

  it('the outcome tick holds the duck over the result sequence and marks the match ended (the pulse layer drops); the card cues do not', () => {
    ctx.currentTime = 5;
    playSfx('won');
    expect(m.plan?.until).toBeCloseTo(7.3, 9);
    expect(m.ended).toBe(true);
    expect(duckEvents().at(-1)).toEqual({ kind: 'linear', value: 1, time: 7.55 });
    m.ended = false;
    ctx.currentTime = 6.2; // a star chord inside the hold: no new `ended`, the hold is not shortened
    playSfx('won', { step: 1, count: 3 });
    expect(m.ended).toBe(false);
    expect(m.plan?.until).toBeCloseTo(7.3, 9);
  });

  it('the outcome holds cover the 600 ms beat plus the card\'s last cue (+ the defeat chord\'s ring)', () => {
    const lastCue = (won: boolean) => Math.max(...resultCues({ won, stars: 3, coins: 500 }).map((c) => c.atMs));
    expect(OUTCOME_HOLD_S.won! * 1000).toBeGreaterThanOrEqual(RESULT_BEAT_MS + lastCue(true));
    expect(OUTCOME_HOLD_S.won! * 1000).toBeLessThanOrEqual(RESULT_BEAT_MS + 1700 + 50); // the count ends at 1 700 ms
    expect(OUTCOME_HOLD_S.lost! * 1000).toBeGreaterThanOrEqual(RESULT_BEAT_MS + lastCue(false) + 470);
  });

  it('sounds that do not duck leave the duck gain alone', () => {
    for (const n of ['send', 'hit', 'mine', 'button', 'refuse'] as const) {
      ctx.currentTime += 1;
      playSfx(n, { weight: 1 });
    }
    playSfx('capture', { capture: 'other' });
    expect(duckEvents()).toEqual([]);
  });
});
