import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Synth } from '../../src/audio/synth';
import type { MatchView } from '../../src/audio/synth';
import type { Mix } from '../../src/audio/mixer';
import { DUCK, LIMITER, dbToGain, mixer } from '../../src/audio/mixer';
import { MusicLoop, STEP_S } from '../../src/audio/music';
import type { SfxName, SfxOptions } from '../../src/audio/sfx';
import { SfxPlayer, loadSfxRecipes } from '../../src/audio/sfx';
import { variation } from '../../src/audio/recipes';
import type { Link, Owner, Tower } from '../../src/sim/types';
import { dbfs, limit, paramAt, pathsTo, peakAbs, peakOf, render } from './envelope';
import type { FakeGain, FakeParam } from './fakeAudio';
import { FakeMixContext } from './fakeAudio';

/*
 * AUD-M1: the whole mix as a system — the loudest plausible 2 s, rendered offline sample by sample (48 kHz) through
 * the real bus gains, the duck and a model of the AUD-F6 limiter (tests/audio/envelope.ts `render` / `limit`):
 *   music  pad + bass + pulse + the FEEL-1-4 tension layer, all at full (a siege), from a bar's downbeat;
 *   t = 0  the winning capture's chime + the FEEL-1-3 won sting + an airstrike (its impact at +150 ms, FEEL-1-2)
 *          + the first of three `send` ticks (FEEL-1-9, at the 50 ms rate limit: 0 / 50 / 100 ms, three pairs);
 *   thud   a lost tower's AUD-F15 thud, on the chime (0 ms) or on the impact (+150 ms) — both renders;
 *   +1 177 ms the first star chord (the 1★ one: held over C4, the loudest of the three).
 * Every play goes through the SfxPlayer (its rate rules). Gates: the master after the limiter never above −1 dBFS,
 * and the limiter never pumps the (ducked) music below the duck floor (DUCK.db).
 */

const T_BAR = 16; // bar 3's downbeat (C): pad + bass root + pulse + kick start together
const SR = 48_000;
const r = (x: number): string => x.toFixed(1);

/** A siege the tension layer turns on for (tests/audio/tension.test.ts `HOT`). */
function hot(time: number): Required<MatchView> {
  const towers: Record<string, Tower> = {
    t0: { id: 't0', owner: 'player', units: 10, underFireUntilMs: time + 500 } as Tower,
    t1: { id: 't1', owner: 'enemy1', units: 60, underFireUntilMs: 0 } as Tower,
  };
  const links = (['enemy1', 'enemy1', 'enemy2'] as Owner[]).map((owner) => ({ owner, from: 't1', to: 't0' }) as Link);
  return { time, towers, links, units: [] };
}

interface Stack {
  ctx: FakeMixContext;
  synth: Synth;
  m: Mix;
  loop: MusicLoop;
  t0: number;
}

let st: Stack;

beforeEach(async () => {
  vi.useFakeTimers();
  await loadSfxRecipes();
  const ctx = new FakeMixContext();
  const synth = new Synth(() => ctx);
  synth.unlock();
  const m = mixer(synth)!;
  const loop = new MusicLoop(synth, m);
  st = { ctx, synth, m, loop, t0: 0 };
});
afterEach(() => {
  st.loop.stop();
  vi.useRealTimers();
});

/** Run the music in play under a siege up to `until` (25 ms wake-ups): everything up to until + look-ahead is scheduled. */
function music(until: number): void {
  const { ctx, synth, loop } = st;
  loop.start();
  for (let i = 0; i * 0.025 <= until + 1e-9; i++) {
    ctx.currentTime = i * 0.025;
    synth.playAt = ctx.currentTime;
    synth.sim = hot(Math.round(ctx.currentTime * 20) * 50);
    loop.tick();
  }
}

/**
 * AUD-F7 levels each varied play by ±2 dB from its play index: warm the counters (before T, voices that end long
 * before the window) so the stack's chime + thud and its three sends are the loudest neighbouring plays in the first
 * 64 — the worst case, not whichever index a fresh synth starts on.
 */
function loudest(name: SfxName, n: number, step: number): number {
  let best = 0;
  let at = 0;
  for (let i = 0; i < 64; i += step) {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += variation(name, i + k).db;
    if (sum > best) [best, at] = [sum, i];
  }
  return at;
}

/** The SFX stack from T (audio clock), the lost-tower thud at `thudS`. */
function sfx(T: number, thudS: number): void {
  const player = new SfxPlayer(st.synth);
  // the chime and the thud are consecutive `capture` plays; the first send must be a triangle one (even index, FEEL-1-9)
  const [ci, si] = [loudest('capture', 2, 1), loudest('send', 3, 2)];
  for (let i = 0; i < ci; i++) {
    st.ctx.currentTime = 0.2 + i * 0.1;
    expect(player.play('capture', { capture: 'other' })).toBe(true);
  }
  for (let i = 0; i < si; i++) {
    st.ctx.currentTime = 0.3 + i * 0.05;
    expect(player.play('send', { count: 1 })).toBe(true);
  }
  expect(Math.max(0.2 + ci * 0.1, 0.3 + si * 0.05) + 0.5).toBeLessThan(T);
  const calls: [number, SfxName, SfxOptions][] = [
    [0, 'capture', { capture: 'gain' }],
    [0, 'won', {}],
    [0, 'airstrike', {}],
    [0, 'send', { count: 20, pair: 'a>b' }],
    [0.05, 'send', { count: 20, pair: 'c>d' }],
    [0.1, 'send', { count: 20, pair: 'e>f' }],
    [thudS, 'capture', { capture: 'loss' }],
    [1.177, 'won', { step: 0, count: 1 }],
  ];
  calls.sort((a, b) => a[0] - b[0]);
  for (const [at, name, opts] of calls) {
    st.ctx.currentTime = T + at;
    expect(player.play(name, opts), `${name} at +${at * 1000} ms`).toBe(true);
  }
  expect(st.m.capped, 'the AUD-M1 voice cap skipped nothing').toBe(0);
}

interface Headroom {
  /** Bus outputs (the music's after the duck), linear, before the master gain. */
  sfx: number;
  ui: number;
  music: number;
  masterPre: number;
  masterPost: number;
  envelopeBound: number;
  /** The lowest gain the limiter applied, and the music's lowest level (duck × limiter) relative to its bus level. */
  minLimiterGain: number;
  minMusic: number;
}

function measure(thudS: number): Headroom {
  // schedule the music to T + 2.2 s first (the stack's `won` tick would drop the pulse and tension: "at full" is the
  // hypothetical worst case), then rewind the clock and play the stack
  const T = 0.1 + T_BAR * STEP_S;
  music(T + 2.2);
  expect(st.loop.t0).toBeCloseTo(0.1, 9);
  expect(st.loop.tension && st.loop.pulse).toBe(true);
  expect(paramAt(st.loop.levels[3]!.gain as FakeParam, T, 0)).toBe(1); // the tension layer at full from T
  sfx(T, thudS);
  const master = st.synth.graph()!.master as FakeGain;
  const { m } = st;
  const out = render(st.ctx.voices(), master, T, T + 2, { sr: SR, taps: [m.sfx, m.ui, m.duck] });
  const lim = limit(out.master, SR, LIMITER);
  let minMusic = Infinity;
  for (let i = 0; i < out.master.length; i++) minMusic = Math.min(minMusic, paramAt(m.duck.gain as FakeParam, T + i / SR, 1) * lim.gain[i]!);
  return {
    sfx: peakAbs(out.taps.get(m.sfx)!).peak,
    ui: peakAbs(out.taps.get(m.ui)!).peak,
    music: peakAbs(out.taps.get(m.duck)!).peak,
    masterPre: peakAbs(out.master).peak,
    masterPost: peakAbs(lim.y).peak,
    envelopeBound: peakOf(pathsTo(st.ctx.voices(), master), T, T + 2, 0.0005).peak,
    minLimiterGain: Math.min(...lim.gain),
    minMusic,
  };
}

describe('AUD-M1 worst-case stack headroom (offline, 48 kHz)', () => {
  for (const thudS of [0, 0.15]) {
    it(`thud at +${thudS * 1000} ms: master ≤ −1 dBFS after the limiter; the limiter never touches the ducked music`, () => {
      const h = measure(thudS);
      const half = st.synth.graph()!.master.gain.value;
      const threshold = dbToGain(LIMITER.thresholdDb);
      console.info(
        `AUD-M1 headroom (thud +${thudS * 1000} ms): bus peaks at the master (× ${half}) — sfx ${r(dbfs(h.sfx * half))} dBFS, ui ${h.ui ? r(dbfs(h.ui * half)) : 'silent'}, music after the duck ${r(dbfs(h.music * half))} dBFS; ` +
          `master pre-limiter ${r(dbfs(h.masterPre))} dBFS (summed-envelope bound ${r(dbfs(h.envelopeBound))}), post ${r(dbfs(h.masterPost))} dBFS; ` +
          `limiter reduction max ${(-dbfs(h.minLimiterGain)).toFixed(2)} dB; music lowest ${dbfs(h.minMusic).toFixed(2)} dB (duck floor ${DUCK.db} dB)`,
      );
      expect(dbfs(h.masterPost)).toBeLessThanOrEqual(-1);
      // under the threshold: the limiter never engages, so the music sits exactly on the duck floor and never below
      expect(h.masterPre).toBeLessThan(threshold);
      expect(h.minLimiterGain).toBe(1);
      expect(h.minMusic).toBeGreaterThanOrEqual(dbToGain(DUCK.db) - 1e-9);
      // and whatever the music's phase under the stack: the SFX bus's peak plus the ducked music's peak stays under it
      expect((h.sfx + h.music) * half).toBeLessThan(threshold);
    });
  }
});
