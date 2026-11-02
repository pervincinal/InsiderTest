import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initAudio, loadSfxRecipes, onSimEvents, playSfx, unlockAudio } from '../../src/audio/index';
import type { SfxName, SfxOptions } from '../../src/audio/index';
import { ResultCuePlayer, TALLY_GAP_MS, TALLY_LATE_MS, resultCues } from '../../src/audio/resultCues';
import { RATE_LIMIT_S } from '../../src/audio/sfxRules';
import { BACK_REACH, CARD_LAND_MS, RESULT_TIMELINE as T, easeOutBack, goldShown, starLandMs, starPopT } from '../../src/render/resultTimeline';
import { createState } from '../../src/sim/create';
import { defaultSave } from '../../src/ui/save';
import { makeLevel } from '../helpers';
import { FakeAudioContext } from './fakeAudio';

/*
 * AUD-F9: the win audio follows the card. The fanfare and the capture chime all used to start on the `won`
 * tick, while the stars pop ≈ 0.5 / 0.8 / 1.1 s into the card (after the 600 ms result beat) and the gold
 * counts 900–1 700 ms in silence. Now: one chord per earned star as it lands, a soft tick per gold step
 * (≤ 8/s), a single low chord as the defeat card lands; the capture chime stays at the outcome.
 */

const won = (stars: number, coins = 0) => resultCues({ won: true, stars, coins });
const chords = (stars: number, coins = 0) => won(stars, coins).filter((c) => c.name === 'won');
const ticks = (coins: number) => won(3, coins).filter((c) => c.name === 'tally');

describe('the result timeline (src/render/resultTimeline.ts)', () => {
  it('is the card\'s: hudOverlays.ts draws the stars and the count from it', () => {
    const src = readFileSync(new URL('../../src/render/hudOverlays.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/drawStarPop\(.*starPopT\(since, i\)\)/);
    expect(src).toMatch(/goldCountT\(since\)/);
    expect(src).not.toMatch(/since - 420|since - 900/);
    expect(T).toMatchObject({ slideMs: 460, starMs: 420, starGapMs: 260, starPopMs: 380, goldMs: 900, goldCountMs: 800, goldPopMs: 1700 });
  });

  it('a star lands (first reaches full size) at starLandMs: ≈ 561 / 821 / 1 081 ms', () => {
    expect(BACK_REACH).toBeCloseTo(0.3702, 4);
    expect([0, 1, 2].map((i) => Math.round(starLandMs(i)))).toEqual([561, 821, 1081]);
    for (let i = 0; i < 3; i++) {
      expect(easeOutBack(starPopT(starLandMs(i), i))).toBeCloseTo(1, 9);
      expect(easeOutBack(starPopT(starLandMs(i) - 10, i))).toBeLessThan(1); // still growing just before
      expect(starPopT(starLandMs(i), i)).toBeGreaterThan(0);
    }
    expect(CARD_LAND_MS).toBeCloseTo(170.3, 1);
    expect(easeOutBack(CARD_LAND_MS / T.slideMs)).toBeCloseTo(1, 9);
  });
});

describe('resultCues', () => {
  it('chord times = the star land times; an unearned star gets no chord (1★ = one chord)', () => {
    for (const stars of [1, 2, 3]) {
      const c = chords(stars);
      expect(c.map((x) => x.atMs)).toEqual([0, 1, 2].slice(0, stars).map(starLandMs));
      expect(c.map((x) => x.opts)).toEqual([0, 1, 2].slice(0, stars).map((step) => ({ step, count: stars })));
    }
    expect(chords(0)).toEqual([]);
  });

  it('gold: one tick per count step that shows, ≥ 125 ms apart (≤ 8 a second), inside the count-up', () => {
    expect(TALLY_GAP_MS).toBe(125);
    expect(RATE_LIMIT_S.tally).toBe(0.125); // the player limits it again
    expect(ticks(0)).toEqual([]);
    expect(ticks(1)).toHaveLength(1);
    for (const coins of [1, 3, 10, 30, 120, 5000]) {
      const t = ticks(coins);
      expect(t.length, `${coins}`).toBeGreaterThan(0);
      expect(t.length, `${coins}`).toBeLessThanOrEqual(Math.min(coins, 7));
      t.forEach((x, i) => {
        expect(x.opts.step).toBe(i);
        expect(x.atMs).toBeGreaterThanOrEqual(T.goldMs);
        expect(x.atMs).toBeLessThanOrEqual(T.goldMs + T.goldCountMs);
        // the label changes right there
        expect(goldShown(x.atMs + 0.01, coins)).toBeGreaterThan(goldShown(x.atMs - 0.01, coins));
        if (i > 0) expect(x.atMs - t[i - 1]!.atMs).toBeGreaterThanOrEqual(TALLY_GAP_MS);
      });
      // ≤ 8 in any second
      for (const a of t) expect(t.filter((b) => b.atMs >= a.atMs && b.atMs < a.atMs + 1000).length).toBeLessThanOrEqual(8);
    }
  });

  it('defeat: a single low chord as the card lands', () => {
    expect(resultCues({ won: false, stars: 0, coins: 40 })).toEqual([{ atMs: CARD_LAND_MS, name: 'lost', opts: { step: 0 } }]);
  });

  it('in time order: chords and ticks interleave by their times', () => {
    const c = won(3, 50);
    for (let i = 1; i < c.length; i++) expect(c[i]!.atMs).toBeGreaterThanOrEqual(c[i - 1]!.atMs);
    expect(c.map((x) => x.name).slice(0, 3)).toEqual(['won', 'won', 'tally']); // 561, 821, ≈ 900+ before the third star
    expect(c.some((x, i) => x.name === 'won' && c.slice(0, i).some((y) => y.name === 'tally'))).toBe(true);
  });
});

describe('ResultCuePlayer', () => {
  /** Drive the player like the result screen: a frame every `dt` ms from the card's first frame; what played when. */
  function run(cues: ReturnType<typeof resultCues>, dt = 16.7, until = 2500) {
    const p = new ResultCuePlayer(cues);
    const out: { at: number; name: SfxName; opts: SfxOptions }[] = [];
    for (let t = 0; t <= until; t += dt) p.tick(t, (name, opts) => out.push({ at: t, name, opts }));
    return out;
  }

  it('each chord sounds on the first frame its star has landed (≤ one frame late), each once', () => {
    for (const stars of [1, 2, 3]) {
      const out = run(won(stars, 30)).filter((x) => x.name === 'won');
      expect(out).toHaveLength(stars);
      out.forEach((x, i) => {
        expect(x.at).toBeGreaterThanOrEqual(starLandMs(i));
        expect(x.at - starLandMs(i)).toBeLessThan(16.7);
      });
    }
  });

  it('every gold tick plays at 60 fps; the defeat chord plays once', () => {
    expect(run(won(3, 30)).filter((x) => x.name === 'tally')).toHaveLength(ticks(30).length);
    expect(run(resultCues({ won: false, stars: 0, coins: 0 })).map((x) => x.name)).toEqual(['lost']);
  });

  it('reduced motion (the card is settled on its first frame: `Infinity`): every chord at once, no gold ticks', () => {
    const p = new ResultCuePlayer(won(3, 80));
    const out: string[] = [];
    expect(p.tick(Infinity, (name, opts) => out.push(`${name}:${opts.step}`))).toBe(3);
    expect(out).toEqual(['won:0', 'won:1', 'won:2']);
    expect(p.tick(Infinity, () => out.push('again'))).toBe(0);
    const lost = new ResultCuePlayer(resultCues({ won: false, stars: 0, coins: 0 }));
    expect(lost.tick(Infinity, () => undefined)).toBe(1);
  });

  it('a stalled frame never bunches the gold ticks: a late one is dropped, a late chord still sounds', () => {
    const p = new ResultCuePlayer(won(3, 30));
    const out: string[] = [];
    p.tick(0, () => undefined);
    p.tick(1300, (name) => out.push(name)); // a 1.3 s hitch over every star and most of the count
    expect(out.filter((n) => n === 'won')).toHaveLength(3);
    expect(out.filter((n) => n === 'tally').length).toBeLessThanOrEqual(1);
    expect(TALLY_LATE_MS).toBeLessThan(TALLY_GAP_MS);
  });
});

describe('through the audio facade', () => {
  async function audio(): Promise<FakeAudioContext> {
    const ctx = new FakeAudioContext();
    const save = defaultSave();
    save.settings.music = false;
    initAudio(save, { factory: () => ctx, persist: () => undefined });
    await loadSfxRecipes();
    unlockAudio();
    return ctx;
  }

  it('the outcome tick plays the capture chime only; the card then plays a chord per star and the ticks', async () => {
    const ctx = await audio();
    const state = createState(makeLevel(), 1);
    onSimEvents([{ type: 'capture', towerId: 'e', by: 'player', from: 'enemy1' }, { type: 'won', timeMs: 30_000 }], state);
    expect(ctx.oscillators.map((o) => o.frequency.events[0]!.value)).toHaveLength(2); // the gain chime's two notes, no fanfare
    ctx.clear();
    const p = new ResultCuePlayer(won(2, 12));
    for (let t = 0; t <= 2000; t += 16.7) {
      ctx.currentTime = 1 + t / 1000;
      p.tick(t, playSfx);
    }
    const tri = ctx.oscillators.filter((o) => o.type === 'triangle');
    expect(tri).toHaveLength(4); // two dyads
    expect(ctx.oscillators.filter((o) => o.type === 'sine' && o.frequency.events[0]!.value === 261.6)).toHaveLength(1); // the 2nd (last earned) is held
    const tallies = ctx.oscillators.filter((o) => o.type === 'sine' && o.frequency.events[0]!.value > 1500);
    expect(tallies).toHaveLength(ticks(12).length);
    // the gold ticks climb
    for (let i = 1; i < tallies.length; i++) expect(tallies[i]!.frequency.events[0]!.value).toBeGreaterThanOrEqual(tallies[i - 1]!.frequency.events[0]!.value);
  });
});
