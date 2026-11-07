import { describe, expect, it } from 'vitest';
import { audioSynth, initAudio, loadSfxRecipes, onSimEvents, playSfx, setMuted, unlockAudio } from '../../src/audio/index';
import type { Mix } from '../../src/audio/mixer';
import { LIMITER, OUTCOME_HOLD_S, dbToGain } from '../../src/audio/mixer';
import { OUTCOME_STING } from '../../src/audio/outcomeCues';
import { STAR_CHORDS } from '../../src/audio/recipes';
import { CARD_LAND_MS, starLandMs } from '../../src/render/resultTimeline';
import { createState } from '../../src/sim/create';
import type { SimEvent } from '../../src/sim/types';
import { RESULT_BEAT_MS } from '../../src/ui/play';
import { defaultSave } from '../../src/ui/save';
import { makeLevel } from '../helpers';
import type { Path } from './envelope';
import { peakOf } from './envelope';
import type { FakeGain, FakeOscillator } from './fakeAudio';
import { FakeMixContext } from './fakeAudio';

/*
 * FEEL-1-3: the outcome sting. The winning capture used to sound like any capture (the first win-specific sound
 * was the first star chord, ≈ +1 177 ms); now the `won` tick layers a rising two-sine dyad over the capture chime
 * and the `lost` tick its falling mirror after the loss thud — 250 ms, 2 voices, the SFX bus under the limiter.
 */

const T0 = 2;
const r6 = (t: number): number => Math.round(t * 1e6) / 1e6;

async function audio(effects = true): Promise<{ ctx: FakeMixContext; m: Mix }> {
  const ctx = new FakeMixContext();
  const save = defaultSave();
  save.settings.music = false;
  save.settings.sound = effects;
  initAudio(save, { factory: () => ctx, persist: () => undefined, haptic: () => undefined });
  await loadSfxRecipes();
  unlockAudio();
  setMuted(false);
  expect(playSfx('arrive')).toBe(true); // builds the mixer
  const m = audioSynth().mix as Mix;
  setMuted(!effects);
  ctx.clear();
  ctx.currentTime = T0;
  return { ctx, m };
}

/** The voices scheduled since the last clear: start / stop relative to T0, the first and last pitch, the wave. */
const voices = (ctx: FakeMixContext) =>
  ctx.oscillators.map((o: FakeOscillator) => ({
    type: o.type,
    at: r6(o.startAt! - T0),
    end: r6(o.stopAt! - T0),
    from: o.frequency.events[0]!.value,
    to: o.frequency.events.at(-1)!.value,
    gain: Math.max(...(o.connections[0] as FakeGain).gain.events.map((e) => e.value)),
  }));

/** Every started voice (oscillators and noise) as an envelope path into the bus and the master. */
function paths(ctx: FakeMixContext): Path[] {
  const master = audioSynth().graph()!.master as FakeGain;
  return ctx.voices().map((v) => {
    const node = v as FakeOscillator;
    const env = node.connections[0] as FakeGain;
    // noise: source → filter → env
    const g = env.gain ? env : ((node.connections[0] as unknown as { connections: FakeGain[] }).connections[0] as FakeGain);
    const bus = g.connections[0] as FakeGain;
    return { env: g.gain, after: [{ param: bus.gain }, { param: master.gain }], start: v.startAt!, stop: v.stopAt! };
  });
}

const LOSS: SimEvent[] = [
  { type: 'capture', towerId: 'p', by: 'enemy1', from: 'player' },
  { type: 'lost', timeMs: 30_000 },
];
const WIN: SimEvent[] = [
  { type: 'capture', towerId: 'e', by: 'player', from: 'enemy1' },
  { type: 'won', timeMs: 30_000 },
];

describe('the sting voices', () => {
  it('won: two sines a fifth apart glide up a fifth (F6 + C7 → C7 + G7) in 90 ms and ring to 250 ms, on the tick', async () => {
    const { ctx } = await audio();
    expect(playSfx('won')).toBe(true);
    const v = voices(ctx);
    expect(v).toEqual([
      { type: 'sine', at: 0, end: 0.25, from: 1396.9, to: 2093, gain: 0.14 },
      { type: 'sine', at: 0, end: 0.25, from: 2093, to: 3136, gain: 0.14 },
    ]);
    for (const x of v) expect(x.to / x.from).toBeCloseTo(1.5, 2); // a fifth up
    expect(v[1]!.from / v[0]!.from).toBeCloseTo(1.5, 2); // a fifth apart
    expect(OUTCOME_STING.won.glideS).toBe(0.09);
    // not a star chord: different notes, and gliding sines, not static triangles
    const starHz = STAR_CHORDS.flat();
    for (const x of v) {
      expect(starHz).not.toContain(x.from);
      expect(starHz).not.toContain(x.to);
    }
    // it lands an octave over the capture chime's C6
    expect(v[0]!.to / 1046.5).toBeCloseTo(2, 2);
  });

  it('lost: the falling mirror — two triangles a fifth apart sigh down a minor second (F5 + C6 → E5 + B5), 250 ms from +150 ms', async () => {
    const { ctx } = await audio();
    expect(playSfx('lost')).toBe(true);
    const v = voices(ctx);
    expect(v).toEqual([
      { type: 'triangle', at: 0.15, end: 0.4, from: 698.5, to: 659.3, gain: 0.14 },
      { type: 'triangle', at: 0.15, end: 0.4, from: 1046.5, to: 987.8, gain: 0.14 },
    ]);
    for (const x of v) expect(x.from / x.to).toBeCloseTo(Math.pow(2, 1 / 12), 3);
  });

  it('the Effects setting gates it (and a refused sting plans no duck)', async () => {
    const { ctx, m } = await audio(false);
    expect(playSfx('won')).toBe(false);
    expect(playSfx('lost')).toBe(false);
    onSimEvents(WIN, createState(makeLevel(), 1));
    expect(ctx.voices()).toEqual([]);
    expect(m.plan).toBeNull();
  });

  it('plays into the SFX bus and keeps the outcome duck (win 2.3 s, loss 1.25 s)', async () => {
    const { ctx, m } = await audio();
    playSfx('won');
    for (const o of ctx.oscillators) expect((o.connections[0] as FakeGain).connections[0]).toBe(m.sfx);
    expect(r6(m.plan!.until - T0)).toBe(OUTCOME_HOLD_S.won);
  });
});

describe('order and headroom on the outcome tick', () => {
  it('won: chime + sting start together; the sting ends (250 ms) long before the first star chord (beat + card ≈ 1 161 ms)', async () => {
    const { ctx } = await audio();
    onSimEvents(WIN, createState(makeLevel(), 1));
    const v = voices(ctx);
    expect(v.map((x) => x.type)).toEqual(['triangle', 'triangle', 'sine', 'sine']); // chime E5 at 0, C6 at 110 ms; the sting at 0
    expect(v.slice(2).every((x) => x.at === 0)).toBe(true);
    const stingEnd = Math.max(...v.slice(2).map((x) => x.end));
    expect(stingEnd).toBeCloseTo(0.25, 9);
    // the earliest any star chord can sound: the beat + the first star landing (reduced motion: the beat + 0)
    expect((RESULT_BEAT_MS + starLandMs(0)) / 1000).toBeGreaterThan(1.1);
    expect(RESULT_BEAT_MS / 1000).toBeGreaterThan(stingEnd);
  });

  it('lost: the loss thud first (0–180 ms), the sting after its triangle (150 ms), done before the defeat chord (beat + 170 ms)', async () => {
    const { ctx } = await audio();
    const state = createState(makeLevel(), 1);
    onSimEvents(LOSS, state);
    const v = voices(ctx);
    const thud = v.filter((x) => x.at === 0);
    const sting = v.filter((x) => x.at > 0);
    expect(thud.map((x) => x.type)).toEqual(['triangle', 'sine']); // + its noise knock (a buffer source)
    expect(sting).toHaveLength(2);
    const thudTriangleEnd = thud.find((x) => x.type === 'triangle')!.end;
    expect(sting[0]!.at).toBeGreaterThanOrEqual(thudTriangleEnd);
    // the sting sits ≥ 3.5 octaves over the thud's falling triangle (180 → 60 Hz): no masking
    expect(Math.min(...sting.map((x) => x.to)) / thud[0]!.from).toBeGreaterThan(3.5);
    expect(Math.max(...sting.map((x) => x.end))).toBeLessThan((RESULT_BEAT_MS + CARD_LAND_MS) / 1000);
  });

  it('headroom: the won tick stays > 4 dB under the limiter threshold; the lost sting adds nothing to the thud\'s peak', async () => {
    const limit = dbToGain(LIMITER.thresholdDb);
    const db = (g: number): string => (20 * Math.log10(g)).toFixed(1);
    const win = await audio();
    onSimEvents(WIN, createState(makeLevel(), 1));
    const w = peakOf(paths(win.ctx), T0, T0 + 0.5).peak;
    expect(20 * Math.log10(w)).toBeLessThan(LIMITER.thresholdDb - 4);
    const loss = await audio();
    onSimEvents(LOSS, createState(makeLevel(), 1));
    const all = paths(loss.ctx);
    const thud = peakOf(all, T0, T0 + 0.15).peak; // the AUD-F15 thud alone (its 0.94 summed gain was already limited before FEEL-1-3)
    const tail = peakOf(all, T0 + 0.15, T0 + 0.5).peak; // the sting over the thud's tail
    expect(tail).toBeLessThan(limit);
    expect(peakOf(all, T0, T0 + 0.5).peak).toBe(thud);
    // documented in docs/ART_DIRECTION.md (the chime's and the thud's first plays are levelled by AUD-F7)
    console.info(`FEEL-1-3 master peak: won tick ${w.toFixed(3)} (${db(w)} dBFS); lost: thud ${thud.toFixed(3)} (${db(thud)} dBFS), sting ${tail.toFixed(3)} (${db(tail)} dBFS); limiter ${LIMITER.thresholdDb} dBFS`);
  });

  it('even a hypothetical overlap with the first (held) star chord only reaches the limiter, which is what it is for', async () => {
    const { ctx } = await audio();
    onSimEvents(WIN, createState(makeLevel(), 1));
    playSfx('won', { step: 0, count: 1 }); // the 1★ chord, held over C4, forced onto the tick
    const { peak } = peakOf(paths(ctx), T0, T0 + 0.5);
    expect(peak).toBeGreaterThan(dbToGain(LIMITER.thresholdDb)); // the limiter would catch it (F6 sized for 11 voices)…
    expect(peak).toBeLessThan(1); // …and the sum never reaches full scale even before it
  });
});
