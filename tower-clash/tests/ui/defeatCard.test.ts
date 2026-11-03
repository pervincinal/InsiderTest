import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LevelDef, Outcome } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { hitArea, minHit } from '../../src/render/widgets';
import { RESULT } from '../../src/render/layout';
import type { HudPlayUi, ResultExtras } from '../../src/render/hud';
import { drawOverlays, hudOverlaysLoaded } from '../../src/render/hud';
import { HUD_OVERLAYS } from '../../src/render/hudOverlays';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, StartOptions } from '../../src/ui/screens';
import { ResultScreen, resetDefeatStreakForTests } from '../../src/ui/result';
import { makeLevel } from '../helpers';

/*
 * AUD-U14 (ART_DIRECTION §4, GDD §4 "AUD-U14 2026-11-03"): on a defeat the free, expected action leads.
 * RETRY is the primary (blue) button on the top row with MENU beside it — NEXT is not drawn, its slot
 * folded into RETRY; CONTINUE (crystals / video) is a secondary, outlined offer under it (the crystal
 * one alone is RETRY's size); SKIP LEVEL stays where it was; Enter = RETRY. The win card is unchanged.
 * Both the lazy card (hudOverlays.ts) and the plain one hud.ts draws before the chunk lands.
 */

const calls = vi.hoisted(() => ({ buttons: [] as { r: Rect; fill: string | undefined; label: string }[] }));

vi.mock('../../src/render/widgets', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/render/widgets')>();
  return {
    ...m,
    drawButton: (...a: Parameters<typeof m.drawButton>) => {
      calls.buttons.push({ r: a[2], fill: a[4]?.fill, label: a[3] });
      m.drawButton(...a);
    },
  };
});

/** Canvas stand-in that accepts every call (gradients take colour stops). */
function nullCtx(): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = { font: '700 10px sans-serif', globalAlpha: 1 };
  const stub = { addColorStop: () => undefined };
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'measureText') return (s: unknown) => ({ width: String(s).length * 12 });
      if (key in store) return store[key];
      return () => stub;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

const VIEW = { cssW: 360, cssH: 640, scale: 0.5, offsetX: 0, offsetY: 0, dpr: 1, insets: { top: 0, right: 0, bottom: 0, left: 0 } } as unknown as View;

const OFFERS: ResultExtras = { crystalsEarned: 0, notes: [], replayCapped: false, doubleGold: null, doubled: false, continueCrystals: null, continueAd: false, skipCrystals: null, pending: false, tip: null, howto: false, share: true };

function uiFor(lvl: LevelDef, outcome: Outcome, result: Partial<ResultExtras> = {}): HudPlayUi {
  return {
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
    hud: { boosters: [], targeting: false, muted: false, result: { ...OFFERS, ...result } },
  };
}

const drawn = (r: Rect) => calls.buttons.filter((b) => b.r === r);
const blue = getPalette(false).owners.player;

beforeEach(() => {
  calls.buttons.length = 0;
});

describe('AUD-U14: the defeat card draws RETRY first', () => {
  it('plain card (chunk not in yet): RETRY blue on the top row, MENU beside it, no NEXT', () => {
    expect(hudOverlaysLoaded()).toBe(false);
    const lvl = makeLevel({ id: 5 });
    drawOverlays(nullCtx(), createState(lvl, 1), VIEW, uiFor(lvl, 'lost', { continueCrystals: 10 }), 0);
    expect(drawn(RESULT.loss.retry)).toEqual([expect.objectContaining({ fill: blue })]);
    expect(drawn(RESULT.loss.menu)).toHaveLength(1);
    for (const r of [RESULT.next, RESULT.retry, RESULT.menu]) expect(drawn(r)).toEqual([]);
    expect(drawn(RESULT.continueSolo)).toEqual([expect.objectContaining({ fill: undefined })]);
  });

  for (const [name, ex, offers] of [
    ['crystal continue alone + skip', { continueCrystals: 10, skipCrystals: 30 }, [RESULT.continueSolo]],
    ['crystal + video continue', { continueCrystals: 10, continueAd: true }, [RESULT.continueCrystals, RESULT.continueAd]],
    ['no continue (already used)', {}, []],
  ] as const) {
    it(`drawn card, ${name}: RETRY blue, NEXT absent, the offers outlined`, () => {
      const lvl = makeLevel({ id: 5 });
      HUD_OVERLAYS.result(nullCtx(), createState(lvl, 1), uiFor(lvl, 'lost', ex), 5000);
      expect(drawn(RESULT.loss.retry)).toEqual([expect.objectContaining({ fill: blue })]);
      expect(drawn(RESULT.loss.menu)).toEqual([expect.objectContaining({ fill: undefined })]);
      for (const r of [RESULT.next, RESULT.retry, RESULT.menu]) expect(drawn(r)).toEqual([]);
      for (const r of offers) expect(drawn(r)).toEqual([expect.objectContaining({ fill: undefined })]); // outlined (paper)
      // the only blue button on the card is RETRY
      expect(calls.buttons.filter((b) => b.fill === blue).map((b) => b.r)).toEqual([RESULT.loss.retry]);
      if ('skipCrystals' in ex) expect(drawn(RESULT.extra)).toHaveLength(1); // SKIP LEVEL where it was
    });
  }

  it('the win card is unchanged: NEXT blue in the left slot, RETRY / MENU on the 780 row', () => {
    const lvl = makeLevel({ id: 5 });
    HUD_OVERLAYS.result(nullCtx(), createState(lvl, 1), uiFor(lvl, 'won'), 5000);
    expect(drawn(RESULT.next)).toEqual([expect.objectContaining({ fill: blue })]);
    expect(drawn(RESULT.retry)).toEqual([expect.objectContaining({ fill: undefined })]);
    expect(drawn(RESULT.menu)).toHaveLength(1);
    expect(drawn(RESULT.loss.retry)).toEqual([]);
  });
});

describe('AUD-U14 geometry', () => {
  const centreY = (r: Rect) => r.y + r.h / 2;
  it('RETRY sits above CONTINUE, the crystal continue alone is RETRY’s size, the tip ends above RETRY', () => {
    expect(RESULT.loss.retry.y + RESULT.loss.retry.h).toBeLessThan(RESULT.continueSolo.y - 30); // room for the Reinforcements line
    expect([RESULT.continueSolo.w, RESULT.continueSolo.h]).toEqual([RESULT.loss.retry.w, RESULT.loss.retry.h]);
    expect(RESULT.continueSolo.x).toBe(RESULT.loss.retry.x);
    // NEXT's slot is folded into RETRY: it spans the win card's NEXT and RETRY
    expect(RESULT.loss.retry.x).toBe(RESULT.next.x);
    expect(RESULT.loss.retry.x + RESULT.loss.retry.w).toBe(RESULT.retry.x + RESULT.retry.w);
    expect(RESULT.loss.menu.x).toBe(RESULT.menu.x);
    expect(centreY(RESULT.loss.menu)).toBe(centreY(RESULT.loss.retry));
    expect(RESULT.tip.y + RESULT.tip.h).toBeLessThanOrEqual(RESULT.loss.retry.y);
    for (const r of [RESULT.continueCrystals, RESULT.continueAd]) expect(r.y).toBe(RESULT.continueSolo.y);
  });

  it('the rows’ tap areas (RETRY, CONTINUE, SKIP) stack without overlap at 360 and 430 wide', () => {
    for (const scale of [0.5, 430 / 720]) {
      const a = [RESULT.loss.retry, RESULT.continueSolo, RESULT.extra].map((r) => hitArea(r, minHit({ scale })));
      for (let i = 1; i < a.length; i++) expect(a[i]!.y).toBeGreaterThanOrEqual(a[i - 1]!.y + a[i - 1]!.h - 1e-6);
      expect(hitArea(RESULT.loss.retry, minHit({ scale })).y).toBeGreaterThanOrEqual(RESULT.howto.y + RESULT.howto.h);
    }
  });
});

describe('AUD-U14: input', () => {
  let save: SaveData;
  beforeEach(() => {
    setSaveStorageForTests(null);
    resetDefeatStreakForTests();
    save = defaultSave();
  });

  function setup(outcome: Outcome) {
    const starts: { levelId: number; opts?: StartOptions }[] = [];
    const went: string[] = [];
    const app: App = {
      view: VIEW,
      save,
      ads: createAdSession(),
      palette: () => getPalette(false),
      goTitle() {},
      goLevels() {
        went.push('levels');
      },
      goShop() {},
      goAchievements() {},
      startLevel(levelId, _seed, opts) {
        starts.push({ levelId, opts });
        return Promise.resolve(true);
      },
      go() {},
      openSettings() {},
      openHowTo() {},
      setSpeed() {},
      setLanguage() {},
      dayKey: () => '2026-11-03',
      weekKey: () => '2026-11-02',
    };
    const lvl = makeLevel({ id: 5 });
    const screen = new ResultScreen(app, {
      state: createState(lvl, 1),
      level: lvl,
      ui: uiFor(lvl, outcome),
      earnings: { stars: 0, gold: 0, crystals: 0, notes: [], replayCapped: false },
      continued: true, // no continue offer: only RETRY / MENU (and SHARE) are on the card
      achievements: { unlocked: [], crystals: 0 },
    });
    return { screen, starts, went };
  }
  const tap = (s: ResultScreen, r: Rect) => {
    const p = { x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, type: 'touch' as const, timeMs: 0 };
    s.down(p);
    s.up(p);
  };

  it('the top-row RETRY restarts the level; the old NEXT / RETRY spots do nothing', async () => {
    const { screen, starts } = setup('lost');
    tap(screen, RESULT.next);
    tap(screen, RESULT.retry);
    await new Promise((r) => setTimeout(r, 0));
    expect(starts).toEqual([]);
    tap(screen, RESULT.loss.retry);
    await expect.poll(() => starts).toEqual([{ levelId: 5, opts: undefined }]);
  });

  it('the top-row MENU leaves for the map', async () => {
    const { screen, went } = setup('lost');
    tap(screen, RESULT.loss.menu);
    await expect.poll(() => went).toEqual(['levels']);
  });

  it('Enter = RETRY on a defeat', async () => {
    const { screen, starts } = setup('lost');
    screen.key({ key: 'Enter' } as KeyboardEvent);
    await expect.poll(() => starts).toEqual([{ levelId: 5, opts: undefined }]);
  });

  it('a win keeps NEXT / RETRY / MENU on the 780 row (the defeat rects take no tap)', async () => {
    const { screen, starts } = setup('won');
    tap(screen, RESULT.loss.retry);
    await new Promise((r) => setTimeout(r, 0));
    expect(starts).toEqual([]);
    tap(screen, RESULT.retry);
    await expect.poll(() => starts).toEqual([{ levelId: 5, opts: undefined }]);
  });
});
