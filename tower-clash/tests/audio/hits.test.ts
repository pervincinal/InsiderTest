import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import type { Owner, SimEvent } from '../../src/sim/types';
import { defaultSave } from '../../src/ui/save';
import type { HitState } from '../../src/audio/index';
import { initAudio, loadSfxRecipes, onSimEvents, playSfx, resetAudioLevel, setMuted, unlockAudio } from '../../src/audio/index';
import { HIT_GAP_MS, HIT_TOWER_MS, playHits } from '../../src/audio/recipes';
import { FakeAudioContext } from './fakeAudio';

/*
 * AUD-F1: being attacked knocks and taps the phone — per tower at most every HIT_TOWER_MS, overall at
 * most 6 a second — and AUD-F2: a mine blast has its own sound. The limiter is pure (recipes.ts
 * `playHits`, wall-clock ms in, `fire(weight)` out); onSimEvents wires it to the synth and the haptic.
 */

const towers: Record<string, { owner: Owner }> = {
  a: { owner: 'player' },
  b: { owner: 'player' },
  c: { owner: 'player' },
  e: { owner: 'enemy1' },
  n: { owner: 'neutral' },
};
const land = (towerId: string, weight = 1, owner: Owner = 'enemy1', hostile = true): SimEvent => ({ type: 'landed', towerId, owner, weight, hostile });
const fresh = (): HitState => ({ at: new Map(), last: -Infinity });

function run(st: HitState, events: SimEvent[], nowMs: number): number[] {
  const fired: number[] = [];
  playHits(events, 'player', towers, st, nowMs, (w) => fired.push(w));
  return fired;
}

describe('playHits (AUD-F1 limiter)', () => {
  it('fires for a hostile landing on a player tower and for a lost player tower, with the landing weight', () => {
    expect(run(fresh(), [land('a', 5)], 0)).toEqual([5]);
    expect(run(fresh(), [{ type: 'capture', towerId: 'e', by: 'enemy1', from: 'player' }], 0)).toEqual([1]);
  });

  it('ignores reinforcements, landings on enemy / neutral towers and captures the player did not lose', () => {
    const events: SimEvent[] = [
      land('a', 1, 'player', false),
      // the player's own unit flipping a tower: after the tick the tower is the player's (a capture, not a hit)
      land('b', 1, 'player', true),
      { type: 'capture', towerId: 'b', by: 'player', from: 'neutral' },
      land('e', 1, 'player'),
      land('n', 1, 'enemy1'),
      { type: 'capture', towerId: 'e', by: 'player', from: 'enemy1' },
      { type: 'capture', towerId: 'n', by: 'enemy1', from: 'neutral' },
      { type: 'unitDied', x: 0, y: 0, owner: 'player', cause: 'clash', roadId: 'a-e' },
    ];
    expect(run(fresh(), events, 0)).toEqual([]);
  });

  it('one tower fires at most once per HIT_TOWER_MS (250 ms)', () => {
    expect(HIT_TOWER_MS).toBe(250);
    const st = fresh();
    expect(run(st, [land('a'), land('a')], 1000)).toHaveLength(1); // same batch
    expect(run(st, [land('a')], 1000 + HIT_TOWER_MS - 1)).toHaveLength(0);
    expect(run(st, [land('a')], 1000 + HIT_TOWER_MS)).toHaveLength(1);
  });

  it('all towers together fire at most once per HIT_GAP_MS, i.e. ≤ 6 in any second', () => {
    expect(HIT_GAP_MS).toBe(170);
    const st = fresh();
    expect(run(st, [land('a'), land('b'), land('c')], 0)).toHaveLength(1);
    expect(run(st, [land('b')], HIT_GAP_MS - 1)).toHaveLength(0);
    expect(run(st, [land('b')], HIT_GAP_MS)).toHaveLength(1);
  });

  it('a refused hit is not recorded: the tower gets the next free slot', () => {
    const st = fresh();
    run(st, [land('a')], 0);
    expect(run(st, [land('b')], 100)).toHaveLength(0); // global gap
    expect(run(st, [land('b')], 170)).toHaveLength(1); // b was not marked at 100 ms
  });

  it('a 3 s barrage on three towers (a landing on each every 10 ms) stays within both limits', () => {
    const st = fresh();
    const fires: { t: number; id: string }[] = [];
    for (let t = 0; t < 3000; t += 10)
      for (const id of ['a', 'b', 'c']) playHits([land(id)], 'player', towers, st, t, () => fires.push({ t, id }));
    expect(fires.length).toBeGreaterThan(10);
    for (const f of fires) expect(fires.filter((g) => g.t >= f.t && g.t < f.t + 1000).length).toBeLessThanOrEqual(6);
    for (const id of ['a', 'b', 'c']) {
      const ts = fires.filter((f) => f.id === id).map((f) => f.t);
      for (let i = 1; i < ts.length; i++) expect(ts[i]! - ts[i - 1]!).toBeGreaterThanOrEqual(HIT_TOWER_MS);
    }
  });
});

describe('onSimEvents → hit sound + haptic', () => {
  let ctx: FakeAudioContext;
  let haptics: number;
  let now: number;

  async function setup(sound: boolean, unlock = true): Promise<void> {
    ctx = new FakeAudioContext();
    haptics = 0;
    const save = defaultSave();
    save.settings.sound = sound;
    save.settings.music = false; // AUD-F6: the loop's voices stay out of the counts
    initAudio(save, { factory: () => ctx, persist: () => undefined, haptic: () => haptics++ });
    await loadSfxRecipes();
    if (unlock) unlockAudio();
  }

  beforeEach(() => {
    now = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => vi.restoreAllMocks());

  const state = () => createState(makeLevel(), 1); // towers p (player) and e (enemy1)

  it('a hostile landing on a player tower plays a 2-voice knock (≤ 400 ms) and one haptic, rate-limited per tower', async () => {
    await setup(true);
    const s = state();
    onSimEvents([land('p')], s);
    expect(ctx.voices()).toHaveLength(2);
    expect(ctx.oscillators.map((o) => o.type)).toEqual(['triangle']); // + one noise crack
    expect(ctx.filters.map((f) => f.type)).toEqual(['bandpass']);
    expect(Math.max(...ctx.voices().map((v) => v.stopAt! - ctx.currentTime))).toBeLessThanOrEqual(0.4);
    expect(haptics).toBe(1);
    now += 100;
    onSimEvents([land('p')], s);
    expect(ctx.voices()).toHaveLength(2);
    expect(haptics).toBe(1);
    now += HIT_TOWER_MS;
    onSimEvents([land('p')], s);
    expect(ctx.voices()).toHaveLength(4);
    expect(haptics).toBe(2);
  });

  it('a tank knocks lower than a soldier', async () => {
    await setup(true);
    const s = state();
    onSimEvents([land('p', 1)], s);
    now += 1000;
    onSimEvents([land('p', 5)], s);
    const [soldier, tank] = ctx.oscillators.map((o) => o.frequency.events[0]!.value);
    expect(tank!).toBeLessThan(soldier!);
  });

  it('the knock is not the refusal thud: higher start, shorter', async () => {
    await setup(true);
    onSimEvents([land('p')], state());
    const hit = ctx.oscillators[0]!;
    ctx.clear();
    ctx.currentTime += 1;
    playSfx('refuse');
    const refuse = ctx.oscillators[0]!;
    expect(hit.frequency.events[0]!.value).toBeGreaterThan(refuse.frequency.events[0]!.value * 1.3);
    expect(hit.stopAt! - hit.startAt!).toBeLessThan(refuse.stopAt! - refuse.startAt!);
  });

  it('muted (sound off): no knock and — no vibration setting exists — no haptic either', async () => {
    await setup(false);
    onSimEvents([land('p')], state());
    expect(ctx.voices()).toHaveLength(0);
    expect(haptics).toBe(0);
    setMuted(false);
    now += 1000;
    onSimEvents([land('p')], state());
    expect(haptics).toBe(1);
  });

  it('the haptic does not wait for the AudioContext: sound on but not unlocked still taps', async () => {
    await setup(true, false);
    onSimEvents([land('p')], state());
    expect(ctx.voices()).toHaveLength(0);
    expect(haptics).toBe(1);
  });

  it('resetAudioLevel forgets the per-tower limit (a new level starts clean)', async () => {
    await setup(true);
    const s = state();
    onSimEvents([land('p')], s);
    now += HIT_GAP_MS; // past the global gap, inside the per-tower limit
    resetAudioLevel();
    onSimEvents([land('p')], s);
    expect(haptics).toBe(2);
  });
});

describe('mine sound (AUD-F2)', () => {
  let ctx: FakeAudioContext;
  beforeEach(async () => {
    ctx = new FakeAudioContext();
    initAudio({ ...defaultSave(), settings: { ...defaultSave().settings, music: false } }, { factory: () => ctx, persist: () => undefined, haptic: () => undefined });
    await loadSfxRecipes();
    unlockAudio();
  });

  const died = (cause: 'clash' | 'mine'): SimEvent => ({ type: 'unitDied', x: 0, y: 0, owner: 'player', cause, roadId: 'p-e' });

  it('a mine kill plays click + boom + debris (3 voices, ≤ 400 ms) instead of the 1-voice clash crackle', () => {
    const s = createState(makeLevel(), 1);
    onSimEvents([died('clash')], s);
    expect(ctx.voices()).toHaveLength(1);
    ctx.clear();
    ctx.currentTime += 1;
    onSimEvents([died('mine')], s);
    const voices = ctx.voices();
    expect(voices).toHaveLength(3);
    expect(ctx.oscillators.map((o) => o.type)).toEqual(['square', 'triangle']);
    expect(Math.max(...voices.map((v) => v.stopAt! - ctx.currentTime))).toBeLessThanOrEqual(0.4);
    const boom = ctx.oscillators[1]!.frequency.events;
    expect(boom[1]!.value).toBeLessThan(boom[0]!.value); // the boom falls
  });

  it('is rate-limited: a column over one mine is one blast per kill, never a roar', () => {
    const s = createState(makeLevel(), 1);
    onSimEvents([died('mine'), died('mine'), died('mine')], s);
    expect(ctx.voices()).toHaveLength(3);
    ctx.currentTime += 0.12;
    onSimEvents([died('mine')], s);
    expect(ctx.voices()).toHaveLength(6);
  });
});
