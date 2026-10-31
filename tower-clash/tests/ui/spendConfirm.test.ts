import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LevelDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { CONFIRM, RESULT } from '../../src/render/layout';
import { SHOP, shopRowRect, shopSkinRect } from '../../src/render/menuLayout';
import type { HudPlayUi } from '../../src/render/hud';
import { hudOverlaysLoaded, loadHudOverlays } from '../../src/render/hud';
import { createAdSession } from '../../src/economy/adsFlow';
import { getStore } from '../../src/economy/store';
import { skipSlotOf } from '../../src/economy/wallet';
import { CRYSTAL_SERVICES } from '../../src/economy/catalog';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, StartOptions } from '../../src/ui/screens';
import { ResultScreen, resetDefeatStreakForTests } from '../../src/ui/result';
import { ShopScreen } from '../../src/ui/shop';
import { en } from '../../src/ui/locales/en';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { makeLevel } from '../helpers';

/*
 * AUD-U5: crystals are bought with real money, so no crystal spend happens in one tap. Skins, the
 * booster crate, the defeat CONTINUE and SKIP LEVEL open the Convert flow's confirm card
 * (`CONFIRM` = SHOP.convertConfirm): "Spend N crystals?", what they buy, how many are left, SPEND /
 * CANCEL. CANCEL (or Esc) spends nothing; an unaffordable spend toasts without the card.
 */

vi.mock('../../src/render/menusShop', () => ({ drawShop: () => undefined }));

function fakeApp(save: SaveData) {
  const starts: { levelId: number; opts?: StartOptions }[] = [];
  const app: App = {
    view: { scale: 0.5 } as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
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
    dayKey: () => '2026-10-30',
    weekKey: () => '2026-10-27',
  };
  return { app, starts };
}

const tap = (s: { down(p: never): void; up(p: never): void }, r: Rect): void => {
  const p = { x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, type: 'touch' as const, timeMs: 0 } as never;
  s.down(p);
  s.up(p);
};

function defeat(app: App, lvl: LevelDef): ResultScreen {
  const ui: HudPlayUi = {
    level: lvl,
    palette: getPalette(false),
    alpha: 0,
    selectedTowerId: null,
    hoverTowerId: null,
    paused: false,
    outcome: 'lost',
    stars: 0,
    hasNext: true,
    speed: 1,
    coinsEarned: 0,
    coinsTotal: 0,
    hud: { boosters: [], targeting: false, muted: false },
  };
  return new ResultScreen(app, {
    state: createState(lvl, 1),
    level: lvl,
    ui,
    earnings: { stars: 0, gold: 0, crystals: 0, notes: [], replayCapped: false },
    continued: false,
    achievements: { unlocked: [], crystals: 0 },
  });
}

/** A key press as the screens read it (no DOM in this environment). */
const key = (k: string): KeyboardEvent => ({ key: k }) as KeyboardEvent;

/** CONTINUE · 10 on the defeat card (solo, or the left half when the video offer is up). */
const continueRect = (r: ResultScreen): Rect => (r.extras().continueAd ? RESULT.continueCrystals : RESULT.continueSolo);

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  resetDefeatStreakForTests();
  save = defaultSave();
  vi.spyOn(getStore(), 'isAvailable').mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('strings', () => {
  it('spend.* exist in all four languages', () => {
    for (const dict of [en, az, ru, tr]) for (const k of ['spend.title', 'spend.left', 'spend.yes', 'spend.skip'] as const) expect(dict[k].length).toBeGreaterThan(0);
  });
});

describe('result: CONTINUE and SKIP LEVEL confirm first (AUD-U5)', () => {
  it('before the card chunk is in, a crystal continue toasts and spends nothing (the card could not be drawn)', () => {
    expect(hudOverlaysLoaded()).toBe(false);
    save.crystals = 50;
    const { app, starts } = fakeApp(save);
    const r = defeat(app, makeLevel({ id: 5 }));
    tap(r, continueRect(r));
    expect(r.extras().confirm ?? null).toBeNull();
    expect(save.crystals).toBe(50);
    expect(starts).toEqual([]);
  });

  it('CONTINUE opens the card; CANCEL spends nothing; SPEND pays 10 and continues', async () => {
    await loadHudOverlays();
    save.crystals = 50;
    const { app, starts } = fakeApp(save);
    const r = defeat(app, makeLevel({ id: 5 }));
    tap(r, continueRect(r));
    expect(r.extras().confirm).toEqual({ kind: 'continue', crystals: CRYSTAL_SERVICES.continue.costCrystals, have: 50 });
    expect(save.crystals).toBe(50);
    // while the card is up only its two buttons take taps
    tap(r, RESULT.retry);
    expect(starts).toEqual([]);
    tap(r, CONFIRM.no);
    expect(r.extras().confirm).toBeNull();
    expect(save.crystals).toBe(50);
    tap(r, continueRect(r));
    tap(r, CONFIRM.yes);
    expect(save.crystals).toBe(50 - CRYSTAL_SERVICES.continue.costCrystals);
    expect(starts).toEqual([{ levelId: 5, opts: { reinforcements: true } }]);
  });

  it('Esc closes the card without spending; Enter confirms', () => {
    save.crystals = 50;
    const { app, starts } = fakeApp(save);
    const r = defeat(app, makeLevel({ id: 5 }));
    tap(r, continueRect(r));
    r.key(key('Escape'));
    expect(r.extras().confirm).toBeNull();
    expect(save.crystals).toBe(50);
    tap(r, continueRect(r));
    r.key(key('Enter'));
    expect(save.crystals).toBe(40);
    expect(starts).toHaveLength(1);
  });

  it('not enough crystals: the toast, no card', () => {
    save.crystals = 3;
    const { app } = fakeApp(save);
    const r = defeat(app, makeLevel({ id: 5 }));
    tap(r, continueRect(r));
    expect(r.extras().confirm).toBeNull();
    expect(save.crystals).toBe(3);
  });

  it('SKIP LEVEL opens the card; SPEND pays 30 and books the skip', () => {
    save.crystals = 100;
    save.defeats['5'] = CRYSTAL_SERVICES.levelSkip.offerAfterDefeats;
    const { app } = fakeApp(save);
    const r = defeat(app, makeLevel({ id: 5 }));
    expect(r.extras().skipCrystals).toBe(CRYSTAL_SERVICES.levelSkip.costCrystals);
    tap(r, RESULT.extra);
    expect(r.extras().confirm).toEqual({ kind: 'skip', crystals: CRYSTAL_SERVICES.levelSkip.costCrystals, have: 100 });
    expect(save.stars['5']).toBeUndefined();
    tap(r, CONFIRM.yes);
    expect(save.crystals).toBe(100 - CRYSTAL_SERVICES.levelSkip.costCrystals);
    expect(save.stars['5']).toBe(CRYSTAL_SERVICES.levelSkip.starsGranted);
  });

  it("AUD-B3: learning level 27 keeps its own skip after three defeats though its band's skip is used", () => {
    save.crystals = 100;
    save.defeats['27'] = CRYSTAL_SERVICES.levelSkip.offerAfterDefeats;
    save.skips = [skipSlotOf(26)]; // band 25–32's ordinary slot, spent on level 26
    const { app } = fakeApp(save);
    const r = defeat(app, makeLevel({ id: 27 }));
    expect(r.extras().skipCrystals).toBe(CRYSTAL_SERVICES.levelSkip.costCrystals);
    tap(r, RESULT.extra);
    tap(r, CONFIRM.yes);
    expect(save.crystals).toBe(100 - CRYSTAL_SERVICES.levelSkip.costCrystals);
    expect(save.stars['27']).toBe(CRYSTAL_SERVICES.levelSkip.starsGranted);
    expect(save.skips).toEqual([skipSlotOf(26), skipSlotOf(27)]);
    expect(save.defeats['27']).toBeUndefined();
  });
});

describe('shop: skins and the booster crate confirm first (AUD-U5)', () => {
  it('a skin: the card names it and its price; CANCEL keeps the crystals, SPEND buys and equips', () => {
    save.crystals = 500;
    const { app } = fakeApp(save);
    const shop = new ShopScreen(app, 'skins');
    shop.enter();
    tap(shop, shopSkinRect(SHOP.row.y0 - 6, 0));
    const ask = shop.pendingSpend;
    expect(ask?.crystals).toBeGreaterThan(0);
    expect(ask?.line).toBeTruthy();
    expect(ask?.gold).toBeUndefined();
    expect(shop.pendingConversion).toBeNull(); // not a conversion
    tap(shop, SHOP.convertConfirm.no);
    expect(shop.pendingSpend).toBeNull();
    expect(save.crystals).toBe(500);
    expect(save.skins.owned).toEqual([]);
    tap(shop, shopSkinRect(SHOP.row.y0 - 6, 0));
    tap(shop, SHOP.convertConfirm.yes);
    expect(save.crystals).toBe(500 - ask!.crystals);
    expect(save.skins.owned).toHaveLength(1);
    expect(save.skins.equipped.roof).toBe(save.skins.owned[0]);
  });

  it('the crate: Esc cancels, Enter buys; unaffordable toasts without the card', () => {
    const crate = CRYSTAL_SERVICES.boosterCrate;
    save.crystals = crate.costCrystals;
    const { app } = fakeApp(save);
    const shop = new ShopScreen(app, 'bundles');
    shop.enter();
    tap(shop, shopRowRect(0));
    expect(shop.pendingSpend?.crystals).toBe(crate.costCrystals);
    shop.key(key('Escape'));
    expect(shop.pendingSpend).toBeNull();
    expect(save.crystals).toBe(crate.costCrystals);
    tap(shop, shopRowRect(0));
    shop.key(key('Enter'));
    expect(save.crystals).toBe(0);
    expect(save.charges).toEqual(crate.charges);
    tap(shop, shopRowRect(0));
    expect(shop.pendingSpend).toBeNull();
  });

  it('owned skins equip in one tap (no crystals change hands)', () => {
    save.crystals = 500;
    const { app } = fakeApp(save);
    const shop = new ShopScreen(app, 'skins');
    shop.enter();
    tap(shop, shopSkinRect(SHOP.row.y0 - 6, 0));
    tap(shop, SHOP.convertConfirm.yes);
    const id = save.skins.owned[0];
    tap(shop, shopSkinRect(SHOP.row.y0 - 6, 0));
    expect(shop.pendingSpend).toBeNull();
    expect(save.skins.equipped.roof).toBeNull();
    tap(shop, shopSkinRect(SHOP.row.y0 - 6, 0));
    expect(save.skins.equipped.roof).toBe(id);
  });
});
