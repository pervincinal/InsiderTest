import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState, LevelDef, Outcome } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import type { View } from '../../src/render/view';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE, getPalette } from '../../src/render/palette';
import type { HudPlayUi } from '../../src/render/hud';
import { RESULT_TIMELINE, TITLE_SETTLE_MS, toastReleaseMs } from '../../src/render/resultTimeline';
import { ACHIEVEMENTS } from '../../src/economy/catalog';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { ACHIEVEMENT_TOAST_MS, achievementToastText, handOverToasts } from '../../src/ui/screens';
import { ResultScreen, resetDefeatStreakForTests } from '../../src/ui/result';
import { makeLevel } from '../helpers';

/*
 * AUD-F16 (docs/reviews/2026-10-29-audit-feel.md): the result screen's toast (an achievement, a daily /
 * weekly milestone) no longer pops at +220 ms over the first star in celebratory blue on a DEFEAT card. It
 * is held until the card's sequence has ended — after the gold count on a win (1 700 ms), once the card
 * and its title have settled on a defeat (500 ms), at once under reduced motion — and on a defeat it is
 * drawn in the neutral paper tone (`note`: ink on paper). Leaving the screen first hands it on (FE-9).
 */

vi.mock('../../src/render/draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/render/draw')>()),
  drawGame: () => undefined, // the world and the card are not under test: only the toast's clock
}));

const VIEW = { ctx: {} as CanvasRenderingContext2D, cssW: 360, cssH: 640, scale: 0.5, offsetX: 0, offsetY: 0, dpr: 1, insets: { top: 0, right: 0, bottom: 0, left: 0 } } as unknown as View;

function fakeApp(save: SaveData): App {
  return {
    view: VIEW,
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
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-11-04',
    weekKey: () => '2026-11-02',
  };
}

const ACH = ACHIEVEMENTS[0]!;

function result(outcome: Outcome, reducedMotion = false): ResultScreen {
  const lvl: LevelDef = makeLevel({ id: 7 });
  const state: GameState = createState(lvl, 1);
  const ui: HudPlayUi = {
    level: lvl,
    palette: getPalette(false),
    alpha: 0,
    selectedTowerId: null,
    hoverTowerId: null,
    paused: false,
    outcome,
    stars: outcome === 'won' ? 3 : 0,
    hasNext: true,
    speed: 1,
    coinsEarned: outcome === 'won' ? 40 : 0,
    coinsTotal: 0,
    hud: { boosters: [], targeting: false, muted: false },
    ...(reducedMotion ? { particles: { reducedMotion: true } as unknown as HudPlayUi['particles'] } : {}),
  };
  return new ResultScreen(fakeApp(save), {
    state,
    level: lvl,
    ui,
    earnings: { stars: ui.stars, gold: ui.coinsEarned, crystals: 0, notes: [], replayCapped: false },
    continued: true,
    achievements: { unlocked: [ACH], crystals: ACH.crystals ?? 0 },
  });
}

/** The toast the HUD draws on the frame at `t` ms after the card's first frame (`t0`). */
function frame(screen: ResultScreen, t0: number, t: number) {
  screen.draw(VIEW, t0 + t);
  return screen.info.ui.hud?.toast ?? null;
}

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  resetDefeatStreakForTests();
});
afterEach(() => setSaveStorageForTests(null));

describe('AUD-F16: result toasts wait for the card sequence', () => {
  const text = () => achievementToastText({ unlocked: [ACH], crystals: ACH.crystals ?? 0 });

  it('release times: after the gold count on a win, after the card and title settle on a defeat', () => {
    expect(toastReleaseMs(true)).toBe(RESULT_TIMELINE.goldMs + RESULT_TIMELINE.goldCountMs);
    expect(toastReleaseMs(true)).toBe(1700);
    expect(toastReleaseMs(true)).toBeGreaterThanOrEqual(RESULT_TIMELINE.goldPopMs); // the last coin has landed
    expect(toastReleaseMs(false)).toBe(Math.max(RESULT_TIMELINE.slideMs, TITLE_SETTLE_MS));
    expect(toastReleaseMs(false)).toBe(500);
  });

  it('a win: the achievement is held over the stars and the count-up, then takes the slot in the blue', () => {
    const s = result('won');
    s.enter();
    expect(s.toast.heldToast()).toEqual({ text: text(), kind: 'ok', durationMs: ACHIEVEMENT_TOAST_MS });
    const t0 = 10_000;
    expect(frame(s, t0, 0)).toBeNull();
    expect(frame(s, t0, 220)).toBeNull(); // the old +220 ms toast, before the first star
    expect(frame(s, t0, RESULT_TIMELINE.starMs + 2 * RESULT_TIMELINE.starGapMs)).toBeNull(); // third star
    expect(frame(s, t0, toastReleaseMs(true) - 1)).toBeNull();
    const shown = frame(s, t0, toastReleaseMs(true));
    expect(shown).toMatchObject({ text: text(), kind: 'ok' });
    expect(s.toast.heldToast()).toBeNull();
    // it then runs its full time from the release
    expect(frame(s, t0, toastReleaseMs(true) + ACHIEVEMENT_TOAST_MS - 50)?.text).toBe(text());
    expect(frame(s, t0, toastReleaseMs(true) + ACHIEVEMENT_TOAST_MS)).toBeNull();
  });

  it('a defeat: held until the card settles, then drawn in the neutral paper tone', () => {
    const s = result('lost');
    s.enter();
    expect(s.toast.heldToast()?.kind).toBe('note');
    const t0 = 5_000;
    expect(frame(s, t0, 0)).toBeNull();
    expect(frame(s, t0, 220)).toBeNull();
    expect(frame(s, t0, toastReleaseMs(false))).toMatchObject({ text: text(), kind: 'note' });
  });

  it('reduced motion: the card is settled on its first frame, so is the toast', () => {
    const s = result('won', true);
    s.enter();
    expect(frame(s, 1000, 0)).toMatchObject({ text: text(), kind: 'ok' });
  });

  it('a toast already up (a share result) is not replaced: the held one queues behind it', () => {
    const s = result('won');
    s.enter();
    const t0 = 2000;
    frame(s, t0, 0);
    s.toast.show('Shared', 'ok', t0 + 1500, 2400);
    expect(frame(s, t0, toastReleaseMs(true))?.text).toBe('Shared');
    expect(s.toast.queued().map((q) => q.text)).toEqual([text()]);
    expect(frame(s, t0, 1500 + 2400)?.text).toBe(text());
  });

  it('leaving before the release hands the held toast on (FE-9), oldest first', () => {
    const s = result('lost');
    s.enter();
    const carried = s.toast.takeQueued();
    expect(carried).toEqual([{ text: text(), kind: 'note', durationMs: ACHIEVEMENT_TOAST_MS }]);
    expect(s.toast.heldToast()).toBeNull();
    const shown: string[] = [];
    handOverToasts(carried, { name: 'levelSelect', toast: { adopt: (items: readonly { text: string }[]) => items.forEach((q) => shown.push(q.text)) } as never });
    expect(shown).toEqual([text()]);
  });

  it('the paper note keeps the toast text floor: ink on paper ≥ 4.5:1 in both palettes', () => {
    const lum = (h: string) => {
      const c = [0, 1, 2].map((i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    for (const pal of [DEFAULT_PALETTE, COLOR_BLIND_PALETTE]) {
      const [a, b] = [lum(pal.ink), lum(pal.paper)].sort((x, y) => y - x);
      expect((a! + 0.05) / (b! + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
