import { beforeEach, describe, expect, it } from 'vitest';
import { initAudio, loadSfxRecipes, playSfx, unlockAudio } from '../../src/audio/index';
import type { SfxName } from '../../src/audio/index';
import { ARRIVE_TIMBRES, DEATH_NOISES, PITCH_LOCKED, SEND_TIMBRES, UNVARIED, VARY_CENTS, VARY_DB, variation } from '../../src/audio/recipes';
import { RATE_LIMIT_S, sendPitchHz } from '../../src/audio/sfxRules';
import { defaultSave } from '../../src/ui/save';
import type { FakeGain } from './fakeAudio';
import { FakeAudioContext } from './fakeAudio';

/*
 * AUD-F7: no more machine gun. Every play is detuned within ±40 cents and levelled within ±2 dB by a hash
 * of its per-sound play index (so a test can pin it), `arrive` rotates over three timbres and `unitDied`
 * over two noise colours; the stingers, `hit` and the booster casts keep their exact sound, and the
 * pitch-coded `send` / `tally` vary in level only.
 */

let ctx: FakeAudioContext;

async function setup(): Promise<void> {
  ctx = new FakeAudioContext();
  const save = defaultSave();
  save.settings.music = false; // the loop's voices stay out of the counts
  initAudio(save, { factory: () => ctx, persist: () => undefined });
  await loadSfxRecipes();
  unlockAudio();
}

beforeEach(() => setup());

const cents = (hz: number, ref: number): number => 1200 * Math.log2(hz / ref);
const db = (g: number, ref: number): number => 20 * Math.log10(g / ref);
/** The envelope peak of the voice `osc` / `src` feeds (its gain's attack ramp). */
const peakOf = (node: { connections: unknown[] }): number => ((node.connections[0] as FakeGain).gain.events.find((e) => e.kind === 'linear')?.value ?? 0);

/** Play `name` once on a fresh clock (past every rate limit); its oscillators and noise sources. */
function play(name: SfxName, opts = {}) {
  ctx.clear();
  ctx.currentTime += 1;
  expect(playSfx(name, opts), name).toBe(true);
  return { osc: [...ctx.oscillators], src: [...ctx.sources], filters: [...ctx.filters] };
}

describe('variation()', () => {
  const VARIED: SfxName[] = ['arrive', 'unitDied', 'capture', 'upgrade', 'artillery', 'mine', 'button', 'refuse', 'purchase', 'reward', 'tankArrive'];

  it('stays within ±40 cents / ±2 dB, spreads over the range and centres on 0', () => {
    expect([VARY_CENTS, VARY_DB]).toEqual([40, 2]);
    for (const name of VARIED) {
      const vs = Array.from({ length: 1000 }, (_, i) => variation(name, i));
      const c = vs.map((v) => v.cents);
      const d = vs.map((v) => v.db);
      expect(Math.max(...c.map(Math.abs)), name).toBeLessThanOrEqual(40);
      expect(Math.max(...d.map(Math.abs)), name).toBeLessThanOrEqual(2);
      expect(Math.min(...c), name).toBeLessThan(-36);
      expect(Math.max(...c), name).toBeGreaterThan(36);
      expect(Math.min(...d), name).toBeLessThan(-1.8);
      expect(Math.max(...d), name).toBeGreaterThan(1.8);
      expect(Math.abs(c.reduce((a, b) => a + b, 0) / c.length), name).toBeLessThan(4);
      expect(Math.abs(d.reduce((a, b) => a + b, 0) / d.length), name).toBeLessThan(0.2);
    }
  });

  it('is a pure function of (sound, play index): pinned values, never twice the same in a row', () => {
    expect(variation('arrive', 0)).toEqual(variation('arrive', 0));
    expect(variation('arrive', 0)).not.toEqual(variation('arrive', 1));
    expect(variation('arrive', 3)).not.toEqual(variation('unitDied', 3)); // salted by the name
    // pinned: a change to the hash is a deliberate one
    expect(variation('arrive', 0).cents).toBeCloseTo(-28.265, 3);
    expect(variation('arrive', 0).db).toBeCloseTo(-1.569, 3);
    expect(variation('arrive', 1).cents).toBeCloseTo(25.303, 3);
    expect(variation('unitDied', 1).cents).toBeCloseTo(39.435, 3);
    for (let i = 1; i < 200; i++) {
      const a = variation('arrive', i - 1);
      const b = variation('arrive', i);
      expect(Math.abs(a.cents - b.cents) + Math.abs(a.db - b.db), `play ${i}`).toBeGreaterThan(0.01);
    }
  });

  it('exempts the stingers, hit and the booster casts; send and tally vary in level only', () => {
    expect([...UNVARIED].sort()).toEqual(['airstrike', 'freeze', 'hit', 'lost', 'overdrive', 'won']); // FEEL-1-2: the airstrike is a booster identity sound
    for (const name of UNVARIED) for (let i = 0; i < 50; i++) expect(variation(name, i)).toEqual({ cents: 0, db: 0 });
    expect([...PITCH_LOCKED].sort()).toEqual(['send', 'tally']);
    for (const name of PITCH_LOCKED) {
      const vs = Array.from({ length: 50 }, (_, i) => variation(name, i));
      expect(vs.every((v) => v.cents === 0)).toBe(true);
      expect(Math.max(...vs.map((v) => Math.abs(v.db)))).toBeGreaterThan(1);
    }
  });
});

describe('the played voices', () => {
  it('arrive: rotates over its three timbres, each detuned / levelled by its play index', () => {
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      const { osc } = play('arrive');
      expect(osc).toHaveLength(1);
      const [type, hz, , gain] = ARRIVE_TIMBRES[i % 3]!;
      const v = variation('arrive', i);
      expect(osc[0]!.type).toBe(type);
      expect(cents(osc[0]!.frequency.events[0]!.value, hz)).toBeCloseTo(v.cents, 6);
      expect(db(peakOf(osc[0]!), gain)).toBeCloseTo(v.db, 6);
      seen.push(`${type}@${hz}`);
    }
    expect(new Set(seen).size).toBe(3);
    // ten taps in a second (the rate limit's maximum) never repeat the same pitch twice in a row
    const pitches: number[] = [];
    for (let i = 0; i < 10; i++) pitches.push(play('arrive').osc[0]!.frequency.events[0]!.value);
    for (let i = 1; i < 10; i++) expect(pitches[i]).not.toBeCloseTo(pitches[i - 1]!, 0);
  });

  it('a new synth (initAudio) counts from play 0 again: the same sequence', async () => {
    const run = () => Array.from({ length: 4 }, () => play('arrive').osc[0]!.frequency.events[0]!.value);
    const first = run();
    await setup();
    expect(run()).toEqual(first);
  });

  it('unitDied: alternates its two noise colours (filter type and cutoff), cutoff detuned', () => {
    for (let i = 0; i < 4; i++) {
      const { src, filters } = play('unitDied');
      expect(src).toHaveLength(1);
      const [type, hz] = DEATH_NOISES[i % 2]!;
      expect(filters[0]!.type).toBe(type);
      expect(cents(filters[0]!.frequency.events[0]!.value, hz)).toBeCloseTo(variation('unitDied', i).cents, 6);
    }
    expect(DEATH_NOISES[0]![0]).not.toBe(DEATH_NOISES[1]![0]);
    expect(RATE_LIMIT_S.unitDied).toBe(0.08); // unchanged
  });

  it('every voice of a play shares its offset (a chord stays in tune with itself)', () => {
    play('upgrade'); // play 0
    const { osc } = play('upgrade'); // play 1
    const k = variation('upgrade', 1).cents;
    [880, 1108.7, 1318.5, 1760].forEach((hz, i) => expect(cents(osc[i]!.frequency.events[0]!.value, hz)).toBeCloseTo(k, 6));
  });

  it('the exempt sounds play their exact recipe every time; hit keeps its tank rule', () => {
    for (let i = 0; i < 3; i++) {
      expect(play('won', { step: 2, count: 3 }).osc.map((o) => o.frequency.events[0]!.value)).toEqual([1318.5, 1568, 261.6]);
      expect(play('lost', { step: 0 }).osc.map((o) => o.frequency.events[0]!.value)).toEqual([220, 261.6, 329.6, 110]);
      expect(play('freeze').osc.map((o) => o.frequency.events[0]!.value)).toEqual([2637, 2217.5, 1864.7, 1568]);
      expect(play('overdrive').osc.map((o) => o.frequency.events[0]!.value)).toEqual([392, 493.9, 587.3]);
      const soldier = play('hit', { weight: 1 }).osc[0]!;
      const tank = play('hit', { weight: 5 }).osc[0]!;
      expect(soldier.frequency.events[0]!.value).toBe(320);
      expect(tank.frequency.events[0]!.value).toBeCloseTo(320 * 0.67, 9);
      expect(peakOf(soldier)).toBe(0.22);
    }
  });

  it('send keeps its count pitch exactly and varies its level only', () => {
    const peaks: number[] = [];
    for (let i = 0; i < 6; i++) {
      const { osc } = play('send', { count: 7 });
      expect(osc[0]!.frequency.events[0]!.value).toBe(sendPitchHz(7));
      peaks.push(peakOf(osc[0]!));
      expect(db(peakOf(osc[0]!), SEND_TIMBRES[i % 2]![2])).toBeCloseTo(variation('send', i).db, 6); // FEEL-1-9: two timbres
    }
    expect(new Set(peaks.map((p) => p.toFixed(5))).size).toBeGreaterThan(3);
  });
});
