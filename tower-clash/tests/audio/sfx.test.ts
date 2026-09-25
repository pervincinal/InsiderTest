import { beforeEach, describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import type { SimEvent } from '../../src/sim/types';
import { defaultSave } from '../../src/ui/save';
import type { SaveData } from '../../src/ui/save';
import {
  ArrivalTracker,
  RATE_LIMIT_S,
  SEND_PITCH_CAP,
  initAudio,
  isAudioUnlocked,
  isMuted,
  loadSfxRecipes,
  onSimEvents,
  onSimFrame,
  playSfx,
  sendPitchHz,
  setMuted,
  sfxForEvents,
  toggleMuted,
  unlockAudio,
} from '../../src/audio/index';
import type { SfxName } from '../../src/audio/index';
import { FakeAudioContext } from './fakeAudio';

const ALL: SfxName[] = ['send', 'arrive', 'capture', 'upgrade', 'unitDied', 'artillery', 'won', 'lost', 'button'];

let ctx: FakeAudioContext;
let save: SaveData;
let persisted: SaveData[];

async function setup(sound = true): Promise<void> {
  ctx = new FakeAudioContext();
  save = defaultSave();
  save.settings.sound = sound;
  persisted = [];
  initAudio(save, { factory: () => ctx, persist: (s) => persisted.push(s) });
  // the recipes are a lazy chunk (src/audio/recipes.ts); the tests below play synchronously
  await loadSfxRecipes();
}

/** Longest scheduled voice in seconds, measured from the context clock. */
function longestVoiceS(): number {
  return Math.max(0, ...ctx.voices().map((v) => (v.stopAt ?? 0) - ctx.currentTime));
}

beforeEach(() => setup());

describe('unlock', () => {
  it('is silent before the first gesture and resumes the context on unlock', () => {
    expect(isAudioUnlocked()).toBe(false);
    expect(playSfx('button')).toBe(false);
    expect(ctx.voices()).toEqual([]);

    expect(unlockAudio()).toBe(true);
    expect(isAudioUnlocked()).toBe(true);
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.state).toBe('running');
    // master gain → destination
    expect(ctx.gains[0]!.connections).toContain(ctx.destination);

    expect(playSfx('button')).toBe(true);
    expect(ctx.voices().length).toBe(1);
  });

  it('survives a missing AudioContext (factory returns null)', () => {
    initAudio(defaultSave(), { factory: () => null, persist: () => undefined });
    expect(unlockAudio()).toBe(false);
    expect(playSfx('capture', { capture: 'gain' })).toBe(false);
  });
});

describe('mute', () => {
  it('starts muted when settings.sound is false and plays nothing', async () => {
    await setup(false);
    unlockAudio();
    expect(isMuted()).toBe(true);
    expect(playSfx('capture', { capture: 'gain' })).toBe(false);
    expect(ctx.voices()).toEqual([]);
  });

  it('setMuted persists to save.settings.sound and gates the synth', () => {
    unlockAudio();
    setMuted(true);
    expect(save.settings.sound).toBe(false);
    expect(persisted.length).toBe(1);
    expect(playSfx('won')).toBe(false);
    expect(ctx.voices()).toEqual([]);
    // master gain dropped to 0 at the current time
    const master = ctx.gains[0]!;
    expect(master.gain.events.at(-1)).toEqual({ kind: 'set', value: 0, time: 0 });

    setMuted(true); // no change → no extra write
    expect(persisted.length).toBe(1);

    expect(toggleMuted()).toBe(false);
    expect(save.settings.sound).toBe(true);
    expect(persisted.length).toBe(2);
    expect(playSfx('won')).toBe(true);
    expect(ctx.voices().length).toBeGreaterThan(0);
  });
});

describe('rate limiting', () => {
  beforeEach(() => unlockAudio());

  it('arrive plays at most 10 times per second', () => {
    for (let i = 0; i < 5; i++) playSfx('arrive');
    expect(ctx.voices().length).toBe(1);
    ctx.currentTime = 0.099;
    expect(playSfx('arrive')).toBe(false);
    ctx.currentTime = 0.1;
    expect(playSfx('arrive')).toBe(true);
    expect(ctx.voices().length).toBe(2);
    // one second of spam → 10 plays
    ctx.clear();
    for (let ms = 0; ms < 1000; ms += 10) {
      ctx.currentTime = 1 + ms / 1000;
      playSfx('arrive');
    }
    expect(ctx.voices().length).toBe(10);
  });

  it('unitDied and artillery are rate-limited, capture is not', () => {
    for (let i = 0; i < 4; i++) playSfx('unitDied');
    expect(ctx.voices().length).toBe(1);
    ctx.currentTime = RATE_LIMIT_S.unitDied!;
    expect(playSfx('unitDied')).toBe(true);

    ctx.clear();
    for (let i = 0; i < 3; i++) playSfx('artillery');
    const perArtillery = ctx.voices().length;
    expect(perArtillery).toBeGreaterThan(0);
    ctx.currentTime += RATE_LIMIT_S.artillery!;
    playSfx('artillery');
    expect(ctx.voices().length).toBe(perArtillery * 2);

    ctx.clear();
    for (let i = 0; i < 3; i++) expect(playSfx('capture', { capture: 'gain' })).toBe(true);
    expect(ctx.voices().length).toBe(6); // 2 notes each
  });
});

describe('send pitch', () => {
  it('rises with the unit count and caps', () => {
    expect(sendPitchHz(1)).toBeCloseTo(520);
    expect(sendPitchHz(0)).toBe(sendPitchHz(1));
    for (let n = 2; n <= SEND_PITCH_CAP; n++) expect(sendPitchHz(n)).toBeGreaterThan(sendPitchHz(n - 1));
    expect(sendPitchHz(SEND_PITCH_CAP)).toBeCloseTo(1040);
    expect(sendPitchHz(500)).toBe(sendPitchHz(SEND_PITCH_CAP));
  });

  it('schedules the oscillator at that pitch', () => {
    unlockAudio();
    playSfx('send', { count: 7 });
    const osc = ctx.oscillators[0]!;
    expect(osc.frequency.events[0]).toEqual({ kind: 'set', value: sendPitchHz(7), time: 0 });
    expect(osc.type).toBe('triangle');
  });
});

describe('durations', () => {
  it('every sound except won/lost ends within 400 ms', () => {
    unlockAudio();
    for (const name of ALL) {
      ctx.clear();
      ctx.currentTime += 1; // defeat rate limits
      expect(playSfx(name, { count: 5, capture: 'gain' })).toBe(true);
      const longest = longestVoiceS();
      expect(longest, name).toBeGreaterThan(0);
      if (name === 'won' || name === 'lost') expect(longest, name).toBeGreaterThan(0.4);
      else expect(longest, name).toBeLessThanOrEqual(0.4);
    }
    for (const kind of ['loss', 'other'] as const) {
      ctx.clear();
      ctx.currentTime += 1;
      playSfx('capture', { capture: kind });
      expect(longestVoiceS(), kind).toBeLessThanOrEqual(0.4);
    }
  });

  it('won is a 4-note rising fanfare, lost a descending line', () => {
    unlockAudio();
    playSfx('won');
    const wonNotes = ctx.oscillators.filter((o) => o.type === 'triangle').map((o) => o.frequency.events[0]!.value);
    expect(wonNotes.length).toBe(4);
    for (let i = 1; i < 4; i++) expect(wonNotes[i]).toBeGreaterThan(wonNotes[i - 1]!);
    ctx.clear();
    playSfx('lost');
    const lostNotes = ctx.oscillators.map((o) => o.frequency.events[0]!.value);
    expect(lostNotes.length).toBe(4);
    for (let i = 1; i < 4; i++) expect(lostNotes[i]).toBeLessThan(lostNotes[i - 1]!);
  });
});

describe('event → sfx mapping', () => {
  const towers = { a: { owner: 'player' as const }, b: { owner: 'enemy1' as const } };

  it('maps captures by who gained and who lost', () => {
    const events: SimEvent[] = [
      { type: 'capture', towerId: 'a', by: 'player', from: 'neutral' },
      { type: 'capture', towerId: 'a', by: 'enemy1', from: 'player' },
      { type: 'capture', towerId: 'b', by: 'enemy1', from: 'neutral' },
      { type: 'capture', towerId: 'b', by: 'enemy2', from: 'enemy1' },
    ];
    expect(sfxForEvents(events, 'player', towers)).toEqual([
      { name: 'capture', opts: { capture: 'gain' } },
      { name: 'capture', opts: { capture: 'loss' } },
      { name: 'capture', opts: { capture: 'other' } },
      { name: 'capture', opts: { capture: 'other' } },
    ]);
  });

  it('maps upgrades (own towers only), deaths by cause and outcomes', () => {
    const events: SimEvent[] = [
      { type: 'upgrade', towerId: 'a', level: 2 },
      { type: 'upgrade', towerId: 'b', level: 2 },
      { type: 'unitDied', x: 0, y: 0, owner: 'player', cause: 'artillery', roadId: 'a-b' },
      { type: 'unitDied', x: 0, y: 0, owner: 'enemy1', cause: 'clash', roadId: 'a-b' },
      { type: 'unitDied', x: 0, y: 0, owner: 'enemy1', cause: 'mine', roadId: 'a-b' },
      { type: 'won', timeMs: 1000 },
      { type: 'lost', timeMs: 1000 },
    ];
    expect(sfxForEvents(events, 'player', towers).map((c) => c.name)).toEqual([
      'upgrade',
      'artillery',
      'unitDied',
      'unitDied',
      'won',
      'lost',
    ]);
  });

  it('onSimEvents plays the mapped sounds through the player', () => {
    unlockAudio();
    const state = createState(makeLevel(), 1);
    onSimEvents([{ type: 'capture', towerId: 'e', by: 'player', from: 'enemy1' }], state);
    expect(ctx.oscillators.length).toBe(2);
    expect(ctx.oscillators[1]!.frequency.events[0]!.value).toBeGreaterThan(ctx.oscillators[0]!.frequency.events[0]!.value);
  });
});

describe('arrivals', () => {
  it('counts vanished own units minus reported deaths', () => {
    const tr = new ArrivalTracker('player');
    const unit = (id: number, owner: 'player' | 'enemy1') => ({
      id,
      owner,
      kind: 'infantry' as const,
      weight: 1,
      roadId: 'p-e',
      from: 'p',
      to: 'e',
      progress: 0,
      speed: 100,
    });
    expect(tr.tick({ units: [unit(1, 'player'), unit(2, 'player'), unit(3, 'player'), unit(4, 'enemy1')] })).toBe(0);
    tr.noteEvents([{ type: 'unitDied', x: 0, y: 0, owner: 'player', cause: 'clash', roadId: 'a-b' }]);
    expect(tr.tick({ units: [unit(3, 'player')] })).toBe(1); // 1 and 2 vanished, one of them died
    expect(tr.tick({ units: [] })).toBe(1);
    expect(tr.tick({ units: [] })).toBe(0);
  });

  it('onSimFrame plays a single rate-limited arrive tap', () => {
    unlockAudio();
    const state = createState(makeLevel(), 1);
    state.units.push(
      { id: 1, owner: 'player', kind: 'infantry', weight: 1, roadId: 'e-p', from: 'p', to: 'e', progress: 0.9, speed: 100 },
      { id: 2, owner: 'player', kind: 'infantry', weight: 1, roadId: 'e-p', from: 'p', to: 'e', progress: 0.9, speed: 100 },
    );
    onSimFrame(state);
    expect(ctx.voices().length).toBe(0);
    state.units.length = 0;
    onSimFrame(state);
    expect(ctx.voices().length).toBe(1);
    onSimFrame(state);
    expect(ctx.voices().length).toBe(1);
  });
});
