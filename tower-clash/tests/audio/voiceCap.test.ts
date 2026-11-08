import { afterEach, describe, expect, it, vi } from 'vitest';
import { audioSynth, initAudio, loadSfxRecipes, onSimEvents, onSimFrame, playSfx, resetAudioLevel, setMuted, unlockAudio } from '../../src/audio/index';
import type { SfxName, SfxOptions } from '../../src/audio/index';
import type { Mix } from '../../src/audio/mixer';
import { VOICES, VOICE_CAP, duckFor } from '../../src/audio/mixer';
import { ResultCuePlayer, resultCues } from '../../src/audio/resultCues';
import { RATE_LIMIT_S } from '../../src/audio/sfxRules';
import { busLevels } from '../../src/audio/inspect';
import { rngsFor, runAiTick } from '../../src/ai/index';
import { isAiTick } from '../../src/ai/common';
import { referencePlayerCommands } from '../../src/ai/referencePlayer';
import { loadLevel } from '../../src/levels/index';
import { createState } from '../../src/sim/create';
import { getOutcome } from '../../src/sim/outcome';
import type { GameState } from '../../src/sim/types';
import { GameLoop } from '../../src/ui/loop';
import { RESULT_BEAT_MS } from '../../src/ui/play';
import { defaultSave } from '../../src/ui/save';
import { FakeMixContext } from './fakeAudio';

/*
 * AUD-M1: the voice cap (src/audio/mixer.ts VOICE_CAP) and the rate rules (src/audio/sfxRules.ts RATE_LIMIT_S) as a
 * system. Every SFX / UI voice counts from its scheduling to its stop; a play that does not fit is skipped whole;
 * the sounds that duck the music may use the last VOICE_CAP.reserve voices. Under the e2e soak-style run — the
 * reference bot on level 25 at 20×, an airstrike tried every frame, every outcome's sting and result card — the
 * cap is never reached.
 */

let ctx: FakeMixContext;

async function audio(): Promise<Mix> {
  ctx = new FakeMixContext();
  const save = defaultSave();
  save.settings.music = false; // the music loop is its own budget (≤ 10 voices)
  initAudio(save, { factory: () => ctx, persist: () => undefined, haptic: () => undefined });
  await loadSfxRecipes();
  unlockAudio();
  setMuted(false);
  expect(playSfx('button')).toBe(true); // builds the mixer
  ctx.currentTime = 10;
  return audioSynth().mix as Mix;
}

afterEach(() => vi.useRealTimers());

/** Every play variant of each sound (the recipes branch on these options). */
const VARIANTS: Record<SfxName, SfxOptions[]> = {
  send: [{ count: 1 }, { count: 20, pair: 'a>b' }],
  arrive: [{}],
  capture: [{ capture: 'gain' }, { capture: 'loss' }, { capture: 'other' }],
  upgrade: [{}],
  unitDied: [{}],
  artillery: [{}],
  won: [{}, { step: 0, count: 1 }, { step: 0, count: 3 }, { step: 2, count: 3 }],
  lost: [{}, { step: 0 }],
  button: [{}],
  refuse: [{}],
  stalemate: [{}],
  hit: [{ weight: 1 }, { weight: 5 }],
  mine: [{}],
  freeze: [{}],
  overdrive: [{}],
  purchase: [{}],
  reward: [{}],
  unlock: [{}],
  achievement: [{}],
  tally: [{ step: 3 }],
  tankArrive: [{}],
  airstrike: [{}],
};

describe('AUD-M1 voice table', () => {
  it('VOICES is each sound\'s largest play, exactly (every variant counted on the fake context)', async () => {
    const m = await audio();
    const names = Object.keys(VARIANTS) as SfxName[];
    expect(names.sort()).toEqual((Object.keys(VOICES) as SfxName[]).sort());
    for (const name of names) {
      const counts = VARIANTS[name].map((opts) => {
        ctx.currentTime += 5; // nothing else ringing, no rate limit in the way
        const before = ctx.voices().length;
        expect(playSfx(name, opts), name).toBe(true);
        return ctx.voices().length - before;
      });
      expect(Math.max(...counts), name).toBe(VOICES[name]);
    }
    expect(m.capped).toBe(0);
  });
});

describe('AUD-M1 voice cap', () => {
  it('ordinary sounds stop at max − reserve; the ducking sounds fill the rest; never past max; whole plays only', async () => {
    const m = await audio();
    const live = () => busLevels(audioSynth())!.voices;
    expect(VOICE_CAP).toEqual({ max: 24, reserve: 8 });
    // upgrades (4 voices, ≤ 300 ms, no rate limit) all at once: 4 fit in 16, the 5th is skipped whole
    let played = 0;
    for (let i = 0; i < 8; i++) if (playSfx('upgrade')) played++;
    expect(live()).toBe(16);
    expect(m.capped).toBe(4);
    expect(played).toBe(8); // the SfxPlayer accepted them (rate rules); the cap skipped 4 inside the chunk
    // the ducking sounds still fit (each checked at its VOICES entry, 3 for a capture or `won`): two own captures
    // and the outcome sting (2 voices each) → 22; a defeat chord (4) would make 26 → skipped; the stalemate hint (2) → 24
    expect(duckFor('capture', { capture: 'gain' })).not.toBeNull();
    playSfx('capture', { capture: 'gain' });
    playSfx('capture', { capture: 'gain' });
    playSfx('won');
    expect(live()).toBe(22);
    playSfx('lost', { step: 0 });
    expect(live()).toBe(22);
    expect(m.capped).toBe(5);
    playSfx('stalemate'); // 2 (the UI bus counts too): exactly 24
    expect(live()).toBe(24);
    expect(playSfx('send', { count: 1 })).toBe(true); // an ordinary tick at the full cap: skipped
    expect(live()).toBe(24);
    expect(m.peak).toBe(24);
    // once the upgrades rang out (≤ 300 ms) there is room again
    ctx.currentTime += 0.5;
    expect(live()).toBe(0);
    expect(playSfx('upgrade')).toBe(true);
    expect(live()).toBe(4);
  });

  it('the rate rules alone bound the airstrike, the stings and the alternating send far under the cap', () => {
    // the most plays of a rate-limited sound ringing at once = ⌈its length ÷ its limit⌉
    const ring = (lenS: number, name: SfxName) => Math.ceil(lenS / RATE_LIMIT_S[name]! - 1e-9) * VOICES[name];
    expect(ring(0.53, 'airstrike')).toBe(16); // a 530 ms strike every 150 ms: 4 plays × 4 voices — the cap's reserve still free
    expect(ring(0.06, 'send')).toBe(2); // a 60 ms tick every 50 ms
    expect(VOICES.won).toBeLessThanOrEqual(VOICE_CAP.reserve); // one outcome per match
    expect(ring(0.53, 'airstrike')).toBeLessThanOrEqual(VOICE_CAP.max - VOICE_CAP.reserve);
  });
});

interface Run {
  matches: number;
  won: number;
  /** Won stings that sounded (their first voice starts on F6, 1396.9 Hz, never varied). */
  stings: number;
  started: number;
  perSecondMax: number;
  sounding: number;
  peak: number;
  capped: number;
}

/**
 * The e2e soak-style run without a browser: level 25, the reference bot (as `__towerclash.autoplay()`), the GameLoop at
 * 20× fed 60 fps frames on the audio clock (`onSimEvents` / `onSimFrame` as the play screen calls them), each outcome's
 * 600 ms beat and result card (3★, 40 gold: three chords and the gold ticks) and the next match. `airstrike`: also
 * try an airstrike every frame (a rich player hammering it; the bot never casts).
 */
async function autoplay(seconds: number, airstrike: boolean): Promise<Run> {
  vi.useFakeTimers({ toFake: ['performance', 'Date'] });
  const m = await audio();
  const level = (await loadLevel(25))!;
  const FRAME_MS = 1000 / 60;
  let state: GameState = createState(level, 1);
  let rngs = rngsFor(1, level.enemies);
  const loop = new GameLoop({
    beforeTick: (s) => (isAiTick(s) ? [...referencePlayerCommands(s, rngs.player), ...runAiTick(s, rngs.enemies, undefined, level.ai)] : undefined),
    onEvents: (ev) => onSimEvents(ev, state),
  });
  loop.speed = 20;
  loop.load(state);
  resetAudioLevel();
  let cues: { at: number; p: ResultCuePlayer } | null = null;
  const outcomes: string[] = [];
  const startsPerS = new Array<number>(seconds).fill(0);
  const t0 = ctx.currentTime;
  for (let f = 0; f < seconds * 60; f++) {
    ctx.currentTime = t0 + (f * FRAME_MS) / 1000;
    vi.advanceTimersByTime(FRAME_MS);
    const before = ctx.voices().length;
    if (!loop.finished) {
      loop.advance(FRAME_MS);
      onSimFrame(state);
      if (airstrike) playSfx('airstrike'); // the rate rule lets one through every 150 ms
      if (loop.finished) {
        const won = getOutcome(state) === 'won';
        outcomes.push(won ? 'won' : 'lost');
        cues = { at: ctx.currentTime + RESULT_BEAT_MS / 1000, p: new ResultCuePlayer(resultCues({ won, stars: 3, coins: 40 })) };
      }
    } else if (cues) {
      cues.p.tick((ctx.currentTime - cues.at) * 1000, (name, opts) => playSfx(name, opts));
      if (ctx.currentTime - cues.at > 2) {
        // the next match, as the soak's `loadLevel` from the result screen
        state = createState(level, 1 + outcomes.length);
        rngs = rngsFor(1 + outcomes.length, level.enemies);
        loop.load(state);
        resetAudioLevel();
        cues = null;
      }
    }
    startsPerS[Math.floor((f * FRAME_MS) / 1000)]! += ctx.voices().length - before;
  }
  // what actually sounds at once ([start, stop) of every SFX voice); the cap counts from scheduling, so it reads ≥ this
  const voices = ctx.voices().filter((v) => v.startAt! >= t0);
  const edges = voices.flatMap((v) => [[v.startAt!, 1] as const, [v.stopAt!, -1] as const]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0;
  let sounding = 0;
  for (const [, d] of edges) sounding = Math.max(sounding, (n += d));
  const stings = ctx.oscillators.filter((o) => o.startAt! >= t0 && o.frequency.events[0]?.value === 1396.9).length;
  return {
    matches: outcomes.length,
    won: outcomes.filter((o) => o === 'won').length,
    stings,
    started: voices.length,
    perSecondMax: Math.max(...startsPerS),
    sounding,
    peak: m.peak,
    capped: m.capped,
  };
}

const line = (r: Run): string =>
  `${r.matches} matches (${r.won} won, ${r.stings} won stings), ${r.started} voices started (max ${r.perSecondMax} / s), most sounding at once ${r.sounding}, ` +
  `most scheduled at once ${r.peak} (cap ${VOICE_CAP.max}, ordinary sounds ${VOICE_CAP.max - VOICE_CAP.reserve}), plays skipped by the cap ${r.capped}`;

describe('AUD-M1 20× autoplay (level 25, the e2e soak-style run)', () => {
  it('60 s of audio clock, the bot alone: under the ordinary limit, nothing skipped, every outcome\'s sting', async () => {
    const r = await autoplay(60, false);
    console.info(`AUD-M1 20× autoplay, level 25, 60 s: ${line(r)}`);
    expect(r.matches).toBeGreaterThanOrEqual(5);
    expect(r.sounding).toBeLessThanOrEqual(r.peak);
    expect(r.peak).toBeLessThanOrEqual(VOICE_CAP.max - VOICE_CAP.reserve);
    expect(r.capped).toBe(0);
    expect(r.stings).toBe(r.won);
  }, 120_000);

  it('and an airstrike tried every frame: never past the cap, and no outcome loses its sting', async () => {
    const r = await autoplay(30, true);
    console.info(`AUD-M1 20× autoplay + airstrike every frame, level 25, 30 s: ${line(r)}`);
    expect(r.peak).toBeLessThanOrEqual(VOICE_CAP.max);
    expect(r.sounding).toBeLessThanOrEqual(VOICE_CAP.max);
    expect(r.stings).toBe(r.won);
    expect(r.won).toBeGreaterThanOrEqual(3);
  }, 120_000);
});
