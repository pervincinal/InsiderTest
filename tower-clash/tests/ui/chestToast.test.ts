import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import { ACHIEVEMENTS, AD_PLACEMENTS } from '../../src/economy/catalog';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, QueuedToast, Screen } from '../../src/ui/screens';
import { ACHIEVEMENT_TOAST_MS, TitleScreen, handOverToasts } from '../../src/ui/screens';
import { t } from '../../src/ui/i18n';

/*
 * REV-37: the rewarded crystal chest pays out seconds after the tap. When the player has left the
 * title meanwhile (PLAY / SHOP), the reward toast and its achievement follow-up go to the screen
 * that is current now (FE-9 carry), not to the dead title; and the stamp is the clock of now, not
 * the title's last drawn frame.
 */

let resolveAd: ((ok: boolean) => void) | null = null;
vi.mock('../../src/economy/adsFlow', async (orig) => {
  const real = await orig<typeof import('../../src/economy/adsFlow')>();
  return {
    ...real,
    canShowRewarded: () => true,
    showRewarded: () =>
      new Promise<boolean>((res) => {
        resolveAd = res;
      }),
  };
});

const CHEST = AD_PLACEMENTS.find((p) => p.id === 'rv_daily_chest')!;
const STARS_10 = ACHIEVEMENTS.find((a) => a.id === 'stars_10')!;
const chestText = (): string => t('title.crystalChest', { n: CHEST.reward.amount });

interface TestApp extends App {
  current: Screen;
}

function makeApp(save: SaveData): TestApp {
  let carried: QueuedToast[] = [];
  const app: TestApp = {
    view: {} as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel: () => Promise.resolve(true),
    go(s: Screen) {
      app.current = s;
    },
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-11-23',
    weekKey: () => '2026-11-23',
    current: undefined as unknown as Screen,
    carryToasts(queued) {
      carried = handOverToasts([...carried, ...queued], app.current);
    },
  };
  return app;
}

async function openChest(app: TestApp, title: TitleScreen): Promise<void> {
  title.claimChest(); // the daily streak reward
  title.claimChest(); // the rewarded chest: the ad starts
  expect(resolveAd).not.toBeNull();
}

describe('rewarded crystal chest toast (REV-37)', () => {
  let save: SaveData;

  beforeEach(() => {
    setSaveStorageForTests(null);
    save = defaultSave();
    resolveAd = null;
  });

  it('the title was replaced during the ad: the reward and achievement toasts show on the new current screen', async () => {
    const app = makeApp(save);
    const title = new TitleScreen(app);
    app.current = title;
    await openChest(app, title);
    for (let id = 1; id <= 10; id++) save.stars[String(id)] = 3; // the payout's evaluation unlocks "Ten 3★ levels"
    const next = new TitleScreen(app); // e.g. the player went to the shop and back
    app.go(next);
    const crystals = save.crystals;
    resolveAd!(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(save.crystals).toBe(crystals + CHEST.reward.amount + STARS_10.crystals); // the chest, then the achievement it unlocked
    const now = performance.now();
    expect(next.toast.opts(now)?.text).toBe(chestText());
    const achievement = t('achievements.unlocked', {
      names: t('achievement.stars_10'),
      crystals: STARS_10.crystals,
    });
    expect(next.toast.queued()).toEqual([{ text: achievement, kind: 'ok', durationMs: ACHIEVEMENT_TOAST_MS }]);
    expect(title.toast.queued()).toEqual([]);
  });

  it('the title is still current: the toast is stamped now, not with the last drawn frame', async () => {
    const app = makeApp(save);
    const title = new TitleScreen(app);
    app.current = title;
    await openChest(app, title); // never drawn: the title's frame clock is still 0
    const later = vi.spyOn(performance, 'now').mockReturnValue(120_000); // the ad took a while
    try {
      resolveAd!(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(title.toast.opts(120_000)?.text).toBe(chestText());
    } finally {
      later.mockRestore();
    }
  });
});
