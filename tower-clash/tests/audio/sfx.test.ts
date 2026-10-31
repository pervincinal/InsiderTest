import { beforeEach, describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import type { SimEvent } from '../../src/sim/types';
import { defaultSave } from '../../src/ui/save';
import type { SaveData } from '../../src/ui/save';
import { effectsOn, initAudio, isAudioUnlocked, isMuted, loadSfxRecipes, musicOn, onSimEvents, onSimFrame, playSfx, setMuted, toggleMuted, unlockAudio } from '../../src/audio/index';
// AUD-F6: the rules are the lazy recipes chunk's (src/audio/sfxRules.ts)
import { ArrivalTracker, RATE_LIMIT_S, SEND_PITCH_CAP, sendPitchHz, sfxForEvents } from '../../src/audio/sfxRules';
import type { SfxName } from '../../src/audio/index';
import { FakeAudioContext } from './fakeAudio';

const ALL: SfxName[] = ['send', 'arrive', 'capture', 'upgrade', 'unitDied', 'artillery', 'won', 'lost', 'button', 'refuse', 'stalemate', 'hit', 'mine', 'freeze', 'overdrive'];

let ctx: FakeAudioContext;
let save: SaveData;
let persisted: SaveData[];

/** `music`: the Music setting (AUD-F6) — off by default so the loop's voices stay out of these counts; null = absent (a pre-split save). */
async function setup(sound = true, music: boolean | null = false): Promise<void> {
  ctx = new FakeAudioContext();
  save = defaultSave();
  save.settings.sound = sound;
  if (music === null) delete save.settings.music;
  else save.settings.music = music;
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
    await setup(false, null);
    unlockAudio();
    expect(isMuted()).toBe(true); // a save from before AUD-F6 (no `music`): Sound off → Music off too
    expect(musicOn()).toBe(false);
    expect(playSfx('capture', { capture: 'gain' })).toBe(false);
    expect(ctx.voices()).toEqual([]);
  });

  it('setMuted (Effects) persists to save.settings.sound and gates the synth', async () => {
    await setup(true, null); // Music absent = follows Sound (on)
    unlockAudio();
    setMuted(true);
    expect(save.settings.sound).toBe(false);
    expect(save.settings.music).toBe(true); // AUD-F6: the first change pins both flags
    expect(persisted.length).toBe(1);
    expect(effectsOn()).toBe(false);
    expect(musicOn()).toBe(true);
    expect(isMuted()).toBe(false); // the music still plays: the speaker is not "muted"
    expect(playSfx('won')).toBe(false);
    expect(ctx.voices()).toEqual([]);

    setMuted(true); // no change → no extra write
    expect(persisted.length).toBe(1);

    setMuted(false);
    expect(save.settings.sound).toBe(true);
    expect(persisted.length).toBe(2);
    expect(playSfx('won')).toBe(true);
    expect(ctx.voices().length).toBeGreaterThan(0);
  });

  it('toggleMuted (the title / HUD / pause speaker) silences both, then turns both on (AUD-F6)', async () => {
    await setup(true, true);
    unlockAudio();
    expect(toggleMuted()).toBe(true);
    expect(save.settings).toMatchObject({ sound: false, music: false });
    expect(effectsOn() || musicOn()).toBe(false);
    expect(toggleMuted()).toBe(false);
    expect(save.settings).toMatchObject({ sound: true, music: true });
    // anything audible counts as "on": Effects off with Music on → the speaker silences both
    setMuted(true);
    expect(isMuted()).toBe(false);
    expect(toggleMuted()).toBe(true);
    expect(save.settings).toMatchObject({ sound: false, music: false });
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
      'mine', // AUD-F2: no longer the clash crackle
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

/*
 * ART-9 (rules v3): the refused tap (link limit / blocked lane / empty source share one thud) and the
 * stalemate hint chime. Both are short, no louder than `send`, and the chime is a rising two-note
 * question distinct from the capture jingle.
 */
describe('v3 sounds (ART-9)', () => {
  beforeEach(() => unlockAudio());

  /** Loudest envelope peak (the linear attack ramp) scheduled since the last `clear`. */
  const peakGain = (): number => Math.max(0, ...ctx.gains.map((g) => g.gain.events.find((e) => e.kind === 'linear')?.value ?? 0));

  /** Peak gain of the `send` tick, the loudness ceiling for both new sounds. */
  function sendPeak(): number {
    ctx.clear();
    ctx.currentTime += 1;
    expect(playSfx('send', { count: 1 })).toBe(true);
    return peakGain();
  }

  it('refuse: a ≤ 400 ms low thud (falling tone + soft noise knock), no louder than send', () => {
    const ceiling = sendPeak();
    ctx.clear();
    ctx.currentTime += 1;
    expect(playSfx('refuse')).toBe(true);
    expect(longestVoiceS()).toBeGreaterThan(0);
    expect(longestVoiceS()).toBeLessThanOrEqual(0.4);
    expect(peakGain()).toBeLessThanOrEqual(ceiling);
    expect(ctx.oscillators.length).toBe(1);
    expect(ctx.sources.length).toBe(1); // the noise knock
    const tone = ctx.oscillators[0]!.frequency.events;
    expect(tone[0]!.value).toBeLessThan(sendPitchHz(1)); // starts under the lowest send pitch
    expect(tone[1]!.value).toBeLessThan(tone[0]!.value); // ... and falls
  });

  it('refuse is rate-limited so a tap-spam stays one thud per tap', () => {
    expect(RATE_LIMIT_S.refuse).toBeGreaterThan(0);
    ctx.clear();
    ctx.currentTime += 1;
    expect(playSfx('refuse')).toBe(true);
    expect(playSfx('refuse')).toBe(false);
    ctx.currentTime += RATE_LIMIT_S.refuse!;
    expect(playSfx('refuse')).toBe(true);
  });

  it('stalemate: a ≤ 400 ms two-note rising "hm?" on sines, no louder than send, unlike the capture jingle', () => {
    const ceiling = sendPeak();
    ctx.clear();
    ctx.currentTime += 1;
    expect(playSfx('stalemate')).toBe(true);
    expect(longestVoiceS()).toBeLessThanOrEqual(0.4);
    expect(peakGain()).toBeLessThanOrEqual(ceiling);
    expect(ctx.sources.length).toBe(0); // pure tones, no noise
    const notes = ctx.oscillators.map((o) => ({ hz: o.frequency.events[0]!.value, at: o.startAt!, type: o.type }));
    expect(notes.length).toBe(2);
    expect(notes.every((n) => n.type === 'sine')).toBe(true);
    expect(notes[1]!.hz).toBeGreaterThan(notes[0]!.hz);
    expect(notes[1]!.at).toBeGreaterThan(notes[0]!.at);
    // distinct from the capture 'gain' chime (two triangles) and the send/button clicks
    ctx.clear();
    ctx.currentTime += 1;
    playSfx('capture', { capture: 'gain' });
    const capture = ctx.oscillators.map((o) => o.frequency.events[0]!.value);
    for (const n of notes) expect(capture).not.toContain(n.hz);
    expect(notes.map((n) => n.hz)).not.toContain(sendPitchHz(1));
    expect(RATE_LIMIT_S.stalemate).toBeUndefined(); // fires once per link anyway (StalemateWatch)
  });
});

describe('booster casts (AUD-F3)', () => {
  beforeEach(() => unlockAudio());

  /** Every voice of `name` played on a fresh clock: oscillators (start pitch, end pitch, type, start), noise sources, filters. */
  function cast(name: SfxName) {
    ctx.clear();
    ctx.currentTime += 1;
    const filters = ctx.filters.length;
    expect(playSfx(name)).toBe(true);
    const notes = ctx.oscillators.map((o) => ({ from: o.frequency.events[0]!.value, to: o.frequency.events.at(-1)!.value, type: o.type, at: o.startAt! }));
    return { notes, noise: ctx.sources.length, filters: ctx.filters.slice(filters), longest: longestVoiceS() };
  }

  /** The `upgrade` arpeggio's notes: neither booster may sound like it any more. */
  const upgradeHz = (): number[] => cast('upgrade').notes.map((n) => n.from);

  it('freeze: a glassy descending shimmer — 4 high sines each gliding down, later ones lower, plus a high-passed air; ≤ 400 ms', () => {
    const up = upgradeHz();
    const { notes, noise, filters, longest } = cast('freeze');
    expect(notes).toHaveLength(4);
    expect(noise).toBe(1);
    expect(notes.every((n) => n.type === 'sine' && n.to < n.from && n.from >= 1500)).toBe(true);
    for (let i = 1; i < 4; i++) {
      expect(notes[i]!.from).toBeLessThan(notes[i - 1]!.from);
      expect(notes[i]!.at).toBeGreaterThan(notes[i - 1]!.at);
    }
    expect(filters.map((f) => f.type)).toEqual(['highpass']);
    expect(longest).toBeGreaterThan(0.3);
    expect(longest).toBeLessThanOrEqual(0.4);
    for (const n of notes) expect(up).not.toContain(n.from);
  });

  it('overdrive: a rising three-note brass-ish swell — sawtooths through opening low-passes, slow attack; ≤ 400 ms', () => {
    const up = upgradeHz();
    const gains = ctx.gains.length;
    const { notes, noise, filters, longest } = cast('overdrive');
    expect(notes).toHaveLength(3);
    expect(noise).toBe(0);
    expect(notes.every((n) => n.type === 'sawtooth')).toBe(true);
    for (let i = 1; i < 3; i++) {
      expect(notes[i]!.from).toBeGreaterThan(notes[i - 1]!.from);
      expect(notes[i]!.at).toBeGreaterThan(notes[i - 1]!.at);
    }
    expect(filters).toHaveLength(3);
    for (const f of filters) {
      expect(f.type).toBe('lowpass');
      const hz = f.frequency.events.map((e) => e.value);
      expect(hz[1]).toBeGreaterThan(hz[0]!); // opens…
      expect(hz[2]).toBeLessThan(hz[1]!); // …and closes
    }
    // a swell, not a click: the attack ramp takes ≥ 40 ms (blip's is 4 ms)
    for (const g of ctx.gains.slice(gains)) {
      const set = g.gain.events.find((e) => e.kind === 'set')!;
      const rise = g.gain.events.find((e) => e.kind === 'linear')!;
      expect(rise.time - set.time).toBeGreaterThanOrEqual(0.04);
    }
    expect(longest).toBeGreaterThan(0.3);
    expect(longest).toBeLessThanOrEqual(0.4);
    for (const n of notes) expect(up).not.toContain(n.from);
  });

  it('neither is rate-limited (one cast per booster run; the bar refuses a second while active)', () => {
    expect(RATE_LIMIT_S.freeze).toBeUndefined();
    expect(RATE_LIMIT_S.overdrive).toBeUndefined();
  });
});
