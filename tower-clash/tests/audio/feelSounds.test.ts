import { beforeEach, describe, expect, it } from 'vitest';
import { initAudio, loadSfxRecipes, playSfx, unlockAudio } from '../../src/audio/index';
import type { SfxOptions } from '../../src/audio/index';
import { RELINK_DB, RELINK_S, SEND_TIMBRES, STRIKE_HIT_S, UNVARIED, variation } from '../../src/audio/recipes';
import { RATE_LIMIT_S, sendPitchHz, sfxForEvents } from '../../src/audio/sfxRules';
import { busFor } from '../../src/audio/mixer';
import { STRIKE_FALL_MS } from '../../src/render/combatFx';
import { defaultSave } from '../../src/ui/save';
import type { SimEvent } from '../../src/sim/types';
import type { FakeGain } from './fakeAudio';
import { FakeAudioContext } from './fakeAudio';

/*
 * FEEL-1-2: the airstrike has its own sound (a whistle over the render chain's fall, then a thud), not the gun's
 * `artillery`. FEEL-1-9: `send` alternates two timbres on its count pitch, and a re-link of the same pair within
 * 2 s is 4 dB softer.
 */

let ctx: FakeAudioContext;

beforeEach(async () => {
  ctx = new FakeAudioContext();
  const save = defaultSave();
  save.settings.music = false; // the loop's voices stay out of the counts
  initAudio(save, { factory: () => ctx, persist: () => undefined });
  await loadSfxRecipes();
  unlockAudio();
});

const peakOf = (node: { connections: unknown[] }): number => ((node.connections[0] as FakeGain).gain.events.find((e) => e.kind === 'linear')?.value ?? 0);
const db = (g: number, ref: number): number => 20 * Math.log10(g / ref);

describe('airstrike (FEEL-1-2)', () => {
  it('is a 150 ms whistle, then a 3-voice thud at the render impact; 4 voices, ≤ 0.7 s, on the SFX bus', () => {
    expect(STRIKE_HIT_S * 1000).toBe(STRIKE_FALL_MS);
    ctx.currentTime = 5;
    expect(playSfx('airstrike')).toBe(true);
    const noise = ctx.sources.filter((v) => v.stopAt !== null); // (the mixer's own always-on source is never stopped)
    const voices = [...ctx.oscillators, ...noise];
    expect(voices).toHaveLength(4);
    const [whistle, thud, sub] = ctx.oscillators;
    expect(whistle!.type).toBe('sine');
    expect(whistle!.startAt).toBe(5);
    expect(whistle!.frequency.events[0]!.value).toBe(1800);
    expect(whistle!.frequency.events[1]!.value).toBe(700); // falling
    expect(whistle!.stopAt).toBeCloseTo(5.15, 9);
    expect(thud!.type).toBe('triangle');
    for (const v of [thud!, sub!, noise[0]!]) expect(v.startAt).toBeCloseTo(5 + STRIKE_HIT_S, 9);
    expect(Math.max(...voices.map((v) => v.stopAt!)) - 5).toBeLessThanOrEqual(0.7);
    expect(busFor('airstrike')).toBe('sfx');
    // the whistle stays under the thud; the limiter (−6 dBFS) catches the sum
    expect(peakOf(whistle!)).toBeLessThan(peakOf(thud!) / 4);
  });

  it('is not the gun: no voice of `artillery`, an identity sound (never varied) and rate-limited to one per 150 ms', () => {
    expect(UNVARIED.has('airstrike')).toBe(true);
    expect(RATE_LIMIT_S.airstrike).toBe(0.15);
    ctx.currentTime = 1;
    playSfx('artillery');
    const gun = ctx.oscillators.map((o) => o.frequency.events[0]!.value);
    ctx.clear();
    ctx.currentTime = 2;
    playSfx('airstrike');
    const a = ctx.oscillators.map((o) => o.frequency.events[0]!.value);
    expect(a.some((hz) => gun.includes(hz))).toBe(false);
    ctx.clear();
    ctx.currentTime = 2.1;
    expect(playSfx('airstrike')).toBe(false);
    ctx.currentTime = 2.15;
    expect(playSfx('airstrike')).toBe(true);
    expect(ctx.oscillators.map((o) => o.frequency.events[0]!.value)).toEqual(a); // unvaried
  });
});

describe('send (FEEL-1-9)', () => {
  const play = (t: number, opts: SfxOptions) => {
    ctx.clear();
    ctx.currentTime = t;
    expect(playSfx('send', opts)).toBe(true);
    return ctx.oscillators[0]!;
  };

  it('is played by the event mapping for the player’s own new streams, with the pair', () => {
    const ev = (owner: 'player' | 'enemy1'): SimEvent => ({ type: 'linked', owner, from: 'home', to: 'camp' });
    expect(sfxForEvents([ev('player'), ev('enemy1')], 'player')).toEqual([{ name: 'send', opts: { pair: 'home>camp' } }]);
  });

  it('alternates a triangle-led and a square-led blip and keeps the count pitch', () => {
    expect(SEND_TIMBRES.map((t) => t[0])).toEqual(['triangle', 'square']);
    const types: string[] = [];
    for (let i = 0; i < 4; i++) {
      const o = play(10 + i * 3, { count: 7, pair: `a${i}>b` });
      types.push(o.type);
      expect(o.frequency.events[0]!.value).toBe(sendPitchHz(7));
      expect(db(peakOf(o), SEND_TIMBRES[i % 2]![2])).toBeCloseTo(variation('send', i).db, 6);
    }
    expect(types).toEqual(['triangle', 'square', 'triangle', 'square']);
  });

  it('a re-link of the same pair within 2 s is 4 dB softer; later, or another pair, is not', () => {
    expect([RELINK_S, RELINK_DB]).toEqual([2, -4]);
    // play i: the timbre's gain × the level variation × the re-link factor → the re-link factor in dB
    const relinkDb = (o: { connections: unknown[] }, i: number) => db(peakOf(o), SEND_TIMBRES[i % 2]![2]) - variation('send', i).db;
    expect(relinkDb(play(10, { pair: 'h>c' }), 0)).toBeCloseTo(0, 6);
    expect(relinkDb(play(11.5, { pair: 'h>c' }), 1)).toBeCloseTo(-4, 6); // 1.5 s later
    expect(relinkDb(play(12, { pair: 'h>x' }), 2)).toBeCloseTo(0, 6); // another pair
    expect(relinkDb(play(13.4, { pair: 'h>c' }), 3)).toBeCloseTo(-4, 6); // 1.9 s after the last re-link
    expect(relinkDb(play(15.5, { pair: 'h>c' }), 4)).toBeCloseTo(0, 6); // 2.1 s: a fresh link
    expect(relinkDb(play(16, {}), 5)).toBeCloseTo(0, 6); // no pair (a direct call): never softened
  });
});
