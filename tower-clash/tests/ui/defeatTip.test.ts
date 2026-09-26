import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameState, LevelDef, Outcome } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { inRect } from '../../src/render/widgets';
import { RESULT } from '../../src/render/layout';
import type { HudPlayUi } from '../../src/render/hud';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { ResultScreen, noteResult, resetDefeatStreakForTests } from '../../src/ui/screens';
import { levelLesson, registerDictionary, setLanguage } from '../../src/ui/i18n';
import { az } from '../../src/ui/locales/az';
import { en } from '../../src/ui/locales/en';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { makeLevel } from '../helpers';

/*
 * FE-4 defeat tip: the result card shows the level's lesson (UI language) on a defeat only, and a
 * HOW TO PLAY link from the second consecutive defeat of the same level in the session — cleared by
 * a win or by a result on another level; nothing is saved. Geometry: the block and the link sit
 * inside the card, under the banner and clear of every other result-card target.
 */

const inside = (inner: Rect, outer: Rect, pad = 0): boolean =>
  inner.x >= outer.x + pad && inner.y >= outer.y + pad && inner.x + inner.w <= outer.x + outer.w - pad && inner.y + inner.h <= outer.y + outer.h - pad;
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, type: 'mouse' as const, timeMs: 0 });

function fakeApp(save: SaveData) {
  const howto: Screen[] = [];
  const app: App = {
    view: {} as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel: () => Promise.resolve(true),
    go() {},
    openSettings() {},
    openHowTo(from) {
      howto.push(from);
    },
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-09-26',
    weekKey: () => '2026-09-21',
  };
  return { app, howto };
}

function level(id: number): LevelDef {
  return { ...makeLevel({ id }), lesson: `Lesson of level ${id}`, lesson_az: `${id} səviyyəsinin dərsi` } as LevelDef;
}

/** A result screen for `lvl` with the given outcome (no play screen: the sim state is the fresh level). */
function result(app: App, lvl: LevelDef, outcome: Outcome): ResultScreen {
  const state: GameState = createState(lvl, 1);
  const ui: HudPlayUi = {
    level: lvl,
    palette: getPalette(false),
    alpha: 0,
    selectedTowerId: null,
    hoverTowerId: null,
    paused: false,
    outcome,
    stars: outcome === 'won' ? 2 : 0,
    hasNext: true,
    speed: 1,
    coinsEarned: 0,
    coinsTotal: 0,
    hud: { boosters: [], targeting: false, muted: false },
  };
  return new ResultScreen(app, {
    state,
    level: lvl,
    ui,
    earnings: { stars: ui.stars, gold: 0, crystals: 0, notes: [], replayCapped: false },
    continued: false,
    achievements: { unlocked: [], crystals: 0 },
  });
}

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  resetDefeatStreakForTests();
  save = defaultSave();
});
afterEach(() => void setLanguage('en'));

describe('defeat tip (FE-4)', () => {
  it('shows the lesson on a defeat and nothing on a win', () => {
    const { app } = fakeApp(save);
    const lost = result(app, level(7), 'lost');
    expect(lost.extras().tip).toBe('Lesson of level 7');
    expect(lost.extras().howto).toBe(false);
    const won = result(app, level(7), 'won');
    expect(won.extras().tip).toBeNull();
    expect(won.extras().howto).toBe(false);
  });

  it('tip text follows the UI language (translated lesson, English fallback)', async () => {
    const { app } = fakeApp(save);
    registerDictionary('az', az);
    await setLanguage('az');
    expect(result(app, level(7), 'lost').extras().tip).toBe('7 səviyyəsinin dərsi');
    expect(result(app, level(7), 'lost').extras().tip).toBe(levelLesson(level(7)));
    registerDictionary('ru', ru);
    await setLanguage('ru'); // no lesson_ru on the fixture → English
    expect(result(app, level(7), 'lost').extras().tip).toBe('Lesson of level 7');
  });

  it('HOW TO PLAY only from the second consecutive defeat of the same level; a win or another level clears it', () => {
    const { app } = fakeApp(save);
    expect(result(app, level(7), 'lost').extras().howto).toBe(false);
    expect(result(app, level(7), 'lost').extras().howto).toBe(true);
    expect(result(app, level(7), 'lost').extras().howto).toBe(true);
    expect(result(app, level(7), 'won').extras().howto).toBe(false);
    expect(result(app, level(7), 'lost').extras().howto).toBe(false); // the win cleared the streak
    expect(result(app, level(8), 'lost').extras().howto).toBe(false); // another level: its own count starts at 1
    expect(result(app, level(7), 'lost').extras().howto).toBe(false);
    expect(result(app, level(7), 'lost').extras().howto).toBe(true);
    expect(noteResult(7, false)).toBe(3);
    expect(noteResult(7, true)).toBe(0);
    expect(noteResult(7, false)).toBe(1);
  });

  it('the link opens the how-to card from the result screen, and only exists on the second defeat', () => {
    const { app, howto } = fakeApp(save);
    const first = result(app, level(3), 'lost');
    first.down(centre(RESULT.howto));
    first.up(centre(RESULT.howto));
    expect(howto).toEqual([]);
    const second = result(app, level(3), 'lost');
    second.down(centre(RESULT.howto));
    second.up(centre(RESULT.howto));
    expect(howto).toEqual([second]); // `openHowTo(this)`: CLOSE returns to this result screen
    const won = result(app, level(3), 'won');
    won.down(centre(RESULT.howto));
    won.up(centre(RESULT.howto));
    expect(howto).toHaveLength(1);
  });

  it('locale keys exist in all four dictionaries with the agreed wording', () => {
    expect(en['result.tip']).toBe('Tip');
    expect(en['result.howto']).toBe('HOW TO PLAY');
    expect(az['result.tip']).toBe('Məsləhət');
    expect(az['result.howto']).toBe('NECƏ OYNAMALI');
    expect(ru['result.howto']).toBe(ru['howto.title']);
    expect(tr['result.howto']).toBe(tr['howto.title']);
    for (const d of [en, az, ru, tr]) {
      expect(d['result.tip'].length).toBeGreaterThan(0);
      expect(d['result.howto'].length).toBeLessThanOrEqual(16); // fits the 220 px link at 16 px
    }
  });
});

describe('defeat tip geometry (layout.ts RESULT.tip / RESULT.howto)', () => {
  const BANNER_H = 158; // hud.ts drawResultCard
  const REINFORCEMENTS_LABEL_TOP = RESULT.continueSolo.y - 18 - 8; // 16 px label centred 18 px over the continue row

  it('sits inside the card under the banner, ends above the Reinforcements label, and the link is inside the block', () => {
    expect(inside(RESULT.tip, RESULT.card, 24)).toBe(true);
    expect(RESULT.tip.y).toBeGreaterThanOrEqual(RESULT.card.y + BANNER_H + 40);
    expect(RESULT.tip.y + RESULT.tip.h).toBeLessThanOrEqual(REINFORCEMENTS_LABEL_TOP);
    expect(inside(RESULT.howto, RESULT.tip)).toBe(true);
    expect(RESULT.howto.h).toBeGreaterThanOrEqual(32); // ≥ 16 CSS px at the 360×640 letterbox scale (0.5)
  });

  it('never overlaps another result-card target', () => {
    for (const r of [RESULT.continueCrystals, RESULT.continueAd, RESULT.continueSolo, RESULT.next, RESULT.retry, RESULT.menu, RESULT.extra]) {
      expect(overlaps(RESULT.tip, r)).toBe(false);
      expect(overlaps(RESULT.howto, r)).toBe(false);
    }
    expect(inRect(RESULT.howto, 360, RESULT.howto.y + RESULT.howto.h / 2)).toBe(true);
  });

  it('is on screen at 360×640 (DPR 1): the letterboxed map keeps every logical rect inside the viewport', () => {
    const scale = Math.min(360 / 720, 640 / 1280);
    for (const r of [RESULT.tip, RESULT.howto]) {
      expect((r.x + r.w) * scale).toBeLessThanOrEqual(360);
      expect((r.y + r.h) * scale).toBeLessThanOrEqual(640);
    }
  });
});
