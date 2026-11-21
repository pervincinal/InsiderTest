import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState, LevelDef, Outcome } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { HudPlayUi } from '../../src/render/hud';
import { RESULT } from '../../src/render/layout';
import type { Rect } from '../../src/render/widgets';
import { createAdSession } from '../../src/economy/adsFlow';
import { CRYSTAL_SERVICES, LEARNING_LEVEL_IDS } from '../../src/economy/catalog';
import { skipSlotOf } from '../../src/economy/wallet';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import type { ResultInfo } from '../../src/ui/result';
import { ResultScreen, resetDefeatStreakForTests } from '../../src/ui/result';
import { t } from '../../src/ui/i18n';
import { makeLevel } from '../helpers';

/*
 * REV-14: a rewarded video that rejects (or throws before the call) no longer locks the result screen —
 * `pending` is reset on every outcome, the "no video" toast is shown, nothing is granted.
 * REV-15: the level skip is never offered nor buyable on a daily / weekly result; the campaign path is unchanged.
 */

const ads = vi.hoisted(() => ({ show: null as null | (() => Promise<boolean>), can: null as null | (() => boolean) }));
vi.mock('../../src/economy/adsFlow', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/economy/adsFlow')>();
  return {
    ...real,
    canShowRewarded: (...a: Parameters<typeof real.canShowRewarded>) => (ads.can ? ads.can() : real.canShowRewarded(...a)),
    showRewarded: (...a: Parameters<typeof real.showRewarded>) => (ads.show ? ads.show() : real.showRewarded(...a)),
  };
});
vi.mock('../../src/economy/interstitial', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/economy/interstitial')>()),
  maybeShowInterstitial: () => Promise.resolve(false),
}));

const VIEW = { ctx: {} as CanvasRenderingContext2D, cssW: 360, cssH: 640, scale: 0.5, offsetX: 0, offsetY: 0, dpr: 1, insets: { top: 0, right: 0, bottom: 0, left: 0 } } as unknown as View;

const calls = { startLevel: [] as unknown[][], goLevels: 0 };
function fakeApp(save: SaveData): App {
  return {
    view: VIEW,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {
      calls.goLevels += 1;
    },
    goShop() {},
    goAchievements() {},
    startLevel: (...a: unknown[]) => {
      calls.startLevel.push(a);
      return Promise.resolve(true);
    },
    go() {},
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-11-21',
    weekKey: () => '2026-11-16',
  } as unknown as App;
}

function result(outcome: Outcome, id = 7, extra: Partial<ResultInfo> = {}): ResultScreen {
  const lvl: LevelDef = makeLevel({ id });
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
  };
  return new ResultScreen(fakeApp(save), {
    state,
    level: lvl,
    ui,
    earnings: { stars: ui.stars, gold: ui.coinsEarned, crystals: 0, notes: [], replayCapped: false },
    continued: false,
    achievements: { unlocked: [], crystals: 0 },
    ...extra,
  });
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const centre = (r: Rect) => ({ id: 1, x: r.x + r.w / 2, y: r.y + r.h / 2, timeMs: 0 });
function tap(s: ResultScreen, r: Rect): void {
  s.down(centre(r));
  s.up(centre(r));
}
const toastText = (s: ResultScreen) => s.toast.opts(1)?.text ?? null;

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  resetDefeatStreakForTests();
  ads.show = null;
  ads.can = () => true;
  calls.startLevel = [];
  calls.goLevels = 0;
});
afterEach(() => {
  setSaveStorageForTests(null);
  ads.show = null;
  ads.can = null;
});

describe('REV-14: a failed rewarded video leaves the result screen usable', () => {
  it('×2 gold, the video promise rejects: pending reset, the no-video toast, no gold, RETRY works', async () => {
    const s = result('won');
    ads.show = () => Promise.reject(new Error('sdk crashed'));
    const gold = save.gold;
    s.doubleGold();
    expect(s.extras().pending).toBe(true);
    expect(s.focusRects()).toEqual([]);
    await flush();
    expect(s.extras().pending).toBe(false);
    expect(s.extras().doubled).toBe(false);
    expect(save.gold).toBe(gold);
    expect(s.info.ui.coinsEarned).toBe(40);
    expect(toastText(s)).toBe(t('result.noVideo'));
    expect(s.focusRects().length).toBeGreaterThan(0);
    tap(s, RESULT.retry);
    await flush();
    expect(calls.startLevel).toEqual([[7, undefined, undefined]]);
  });

  it('×2 gold, a synchronous throw in the pre-call path (canShowRewarded): same — no lock, toast, no grant', async () => {
    const s = result('won');
    ads.can = () => {
      throw new Error('storage gone');
    };
    const gold = save.gold;
    expect(() => s.doubleGold()).not.toThrow();
    ads.can = () => true;
    await flush();
    expect(s.extras().pending).toBe(false);
    expect(save.gold).toBe(gold);
    expect(toastText(s)).toBe(t('result.noVideo'));
    tap(s, RESULT.retry);
    await flush();
    expect(calls.startLevel).toHaveLength(1);
  });

  it('×2 gold, showRewarded throws synchronously: no lock, toast, no grant', async () => {
    const s = result('won');
    ads.show = () => {
      throw new Error('boom');
    };
    expect(() => s.doubleGold()).not.toThrow();
    await flush();
    expect(s.extras().pending).toBe(false);
    expect(s.extras().doubled).toBe(false);
    expect(toastText(s)).toBe(t('result.noVideo'));
  });

  it('×2 gold, the happy path is unchanged: the gold paid once, the toast, the save written', async () => {
    const s = result('won');
    ads.show = () => Promise.resolve(true);
    const gold = save.gold;
    s.doubleGold();
    s.doubleGold(); // a second tap while pending is ignored
    await flush();
    expect(s.extras().pending).toBe(false);
    expect(s.extras().doubled).toBe(true);
    expect(save.gold).toBe(gold + 40);
    expect(s.info.ui.coinsEarned).toBe(80);
    expect(s.info.ui.coinsTotal).toBe(save.gold);
    expect(toastText(s)).toBe(t('amount.gold', { n: 40 }));
    s.doubleGold(); // already doubled
    await flush();
    expect(save.gold).toBe(gold + 40);
  });

  it('×2 gold, the network gives no reward: the no-video toast (the existing message), no grant', async () => {
    const s = result('won');
    ads.show = () => Promise.resolve(false);
    s.doubleGold();
    await flush();
    expect(s.extras().pending).toBe(false);
    expect(s.extras().doubled).toBe(false);
    expect(toastText(s)).toBe(t('result.noVideo'));
  });

  it('continue by video, the promise rejects: pending reset, toast, no continue, RETRY works', async () => {
    let resumed = 0;
    const s = result('lost', 7, { resume: () => ++resumed > 0 });
    ads.show = () => Promise.reject(new Error('sdk crashed'));
    s.continueWithAd();
    expect(s.extras().pending).toBe(true);
    await flush();
    expect(s.extras().pending).toBe(false);
    expect(resumed).toBe(0);
    expect(toastText(s)).toBe(t('result.noVideo'));
    tap(s, RESULT.loss.retry);
    await flush();
    expect(calls.startLevel).toEqual([[7, undefined, undefined]]);
  });

  it('continue by video, a synchronous throw before the call: no lock, toast, no continue', async () => {
    let resumed = 0;
    const s = result('lost', 7, { resume: () => ++resumed > 0 });
    ads.can = () => {
      throw new Error('storage gone');
    };
    expect(() => s.continueWithAd()).not.toThrow();
    ads.can = () => true;
    await flush();
    expect(s.extras().pending).toBe(false);
    expect(resumed).toBe(0);
    expect(toastText(s)).toBe(t('result.noVideo'));
  });

  it('continue by video, the happy path: the rewind resumes, no toast', async () => {
    let resumed = 0;
    const s = result('lost', 7, { resume: () => ++resumed > 0 });
    ads.show = () => Promise.resolve(true);
    s.continueWithAd();
    await flush();
    expect(s.extras().pending).toBe(false);
    expect(resumed).toBe(1);
    expect(toastText(s)).toBeNull();
  });

  it('continue by video, no video available: nothing happens (no pending, no toast)', () => {
    const s = result('lost');
    ads.can = () => false;
    s.continueWithAd();
    expect(s.extras().pending).toBe(false);
    expect(toastText(s)).toBeNull();
  });
});

describe('REV-15: no level skip on a daily / weekly result', () => {
  const cost = CRYSTAL_SERVICES.levelSkip.costCrystals;
  const armed = (id: number) => {
    save.crystals = cost * 2;
    save.defeats[String(id)] = CRYSTAL_SERVICES.levelSkip.offerAfterDefeats;
  };
  const daily = { challenge: { dayKey: '2026-11-21', levelId: 7, seed: 42 } } as unknown as Partial<ResultInfo>;
  const weekly = { weekly: { weekKey: '2026-11-16', levelId: 7, seed: 42 } } as unknown as Partial<ResultInfo>;

  for (const [name, extra] of [
    ['daily', daily],
    ['weekly', weekly],
  ] as const) {
    it(`${name} defeat: skipOffered() false, no SKIP button, skipLevel() a no-op`, async () => {
      armed(7);
      const s = result('lost', 7, extra);
      expect((s as unknown as { skipOffered(): boolean }).skipOffered()).toBe(false);
      expect(s.extras().skipCrystals).toBeNull();
      s.skipLevel();
      await flush();
      expect(save.crystals).toBe(cost * 2);
      expect(save.stars['7']).toBeUndefined();
      expect(save.skips).toEqual([]);
      expect(save.defeats['7']).toBe(CRYSTAL_SERVICES.levelSkip.offerAfterDefeats);
      expect(calls.startLevel).toEqual([]);
      expect(calls.goLevels).toBe(0);
    });
  }

  it('campaign defeat with ≥ 3 defeats (a band level): still offered and bought', async () => {
    armed(7);
    const s = result('lost', 7);
    expect((s as unknown as { skipOffered(): boolean }).skipOffered()).toBe(true);
    expect(s.extras().skipCrystals).toBe(cost);
    s.skipLevel();
    await flush();
    expect(save.crystals).toBe(cost);
    expect(save.stars['7']).toBe(CRYSTAL_SERVICES.levelSkip.starsGranted);
    expect(save.skips).toEqual([skipSlotOf(7)]);
    expect(calls.startLevel.map((a) => a[0])).toEqual([8]);
  });

  it('campaign defeat on a learning level (AUD-B3): its own slot, even with the band slot spent', async () => {
    const id = LEARNING_LEVEL_IDS[0]!;
    armed(id);
    save.skips = [skipSlotOf(id - 1)]; // the band's slot already used
    const s = result('lost', id);
    expect(s.extras().skipCrystals).toBe(cost);
    s.skipLevel();
    await flush();
    expect(save.skips).toEqual([skipSlotOf(id - 1), skipSlotOf(id)]);
    expect(save.stars[String(id)]).toBe(CRYSTAL_SERVICES.levelSkip.starsGranted);
  });
});
