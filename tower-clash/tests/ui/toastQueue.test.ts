import { beforeEach, describe, expect, it } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import { ACHIEVEMENTS } from '../../src/economy/catalog';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { ACHIEVEMENT_TOAST_MS, TitleScreen, Toast, handOverToasts } from '../../src/ui/screens';
import { t } from '../../src/ui/i18n';

/*
 * FE-9: a daily reward that also unlocks achievements is two toasts one after the other (reward
 * first, then the achievement toast), not one combined pill (it filled all four lines in Russian,
 * ART-16). Queued toasts survive leaving the screen: they move to the next menu screen.
 */

describe('Toast queue', () => {
  it('enqueue on an idle toast shows at once', () => {
    const toast = new Toast();
    toast.enqueue('a', 'ok', 100, 1000);
    expect(toast.opts(100)?.text).toBe('a');
    expect(toast.queued()).toEqual([]);
  });

  it('a queued toast starts when the one on screen ends and gets its full time', () => {
    const toast = new Toast();
    toast.show('reward', 'ok', 0, 2400);
    toast.enqueue('achievement', 'ok', 0, 3500);
    expect(toast.opts(0)?.text).toBe('reward');
    expect(toast.opts(2399)?.text).toBe('reward');
    expect(toast.queued().map((q) => q.text)).toEqual(['achievement']);
    // first frame after the reward ended: the achievement starts there (t = 0), not mid-way
    const first = toast.opts(2410);
    expect(first?.text).toBe('achievement');
    expect(first?.t).toBe(0);
    expect(toast.opts(2410 + 3499)?.text).toBe('achievement');
    expect(toast.opts(2410 + 3500)).toBeNull();
    expect(toast.queued()).toEqual([]);
  });

  it('keeps order and kind across several queued toasts', () => {
    const toast = new Toast();
    toast.show('one', 'ok', 0, 1000);
    toast.enqueue('two', 'error', 0, 1000);
    toast.enqueue('three', 'ok', 0, 1000);
    expect(toast.opts(1000)).toMatchObject({ text: 'two', kind: 'error' });
    expect(toast.opts(2000)).toMatchObject({ text: 'three', kind: 'ok' });
    expect(toast.opts(3000)).toBeNull();
  });

  it('show replaces only the toast on screen; the queue still follows it', () => {
    const toast = new Toast();
    toast.show('reward', 'ok', 0, 2400);
    toast.enqueue('achievement', 'ok', 0, 3500);
    toast.show('come back tomorrow', 'ok', 500, 2400);
    expect(toast.opts(600)?.text).toBe('come back tomorrow');
    expect(toast.opts(2900)?.text).toBe('achievement');
  });

  it('takeQueued empties the queue and leaves the toast on screen; adopt lines toasts up behind the current one', () => {
    const from = new Toast();
    from.show('reward', 'ok', 0, 2400);
    from.enqueue('achievement', 'ok', 0, 3500);
    const taken = from.takeQueued();
    expect(taken).toEqual([{ text: 'achievement', kind: 'ok', durationMs: 3500 }]);
    expect(from.queued()).toEqual([]);
    expect(from.opts(100)?.text).toBe('reward');
    expect(from.opts(2500)).toBeNull(); // nothing follows on the left screen

    const idle = new Toast();
    idle.adopt(taken, 3000);
    expect(idle.opts(3000)?.text).toBe('achievement');

    const busy = new Toast();
    busy.show('New daily challenge is ready', 'ok', 3000, 3500);
    busy.adopt(taken, 3000);
    expect(busy.opts(3100)?.text).toBe('New daily challenge is ready');
    expect(busy.opts(6500)?.text).toBe('achievement');
  });
});

describe('handOverToasts (src/main.ts go)', () => {
  const carried = [{ text: 'achievement', kind: 'ok' as const, durationMs: 3500 }];
  const screen = (name: Screen['name'], toast?: Toast): Pick<Screen, 'name' | 'toast'> => ({ name, toast });

  it('a menu screen with a toast takes them; nothing stays carried', () => {
    for (const name of ['title', 'levelSelect', 'shop', 'settings', 'achievements', 'result'] as const) {
      const toast = new Toast();
      expect(handOverToasts(carried, screen(name, toast), 0), name).toEqual([]);
      expect(toast.opts(0)?.text, name).toBe('achievement');
    }
  });

  it('the spinner keeps them waiting for the screen behind it', () => {
    expect(handOverToasts(carried, screen('loading'), 0)).toEqual(carried);
  });

  it('a match start drops them (no pill over the first seconds of play)', () => {
    const toast = new Toast();
    expect(handOverToasts(carried, screen('play', toast), 0)).toEqual([]);
    expect(toast.opts(0)).toBeNull();
  });

  it('a screen without a toast drops them; nothing carried is a no-op', () => {
    expect(handOverToasts(carried, screen('howto'), 0)).toEqual([]);
    const toast = new Toast();
    expect(handOverToasts([], screen('title', toast), 0)).toEqual([]);
    expect(toast.opts(0)).toBeNull();
  });
});

describe('title daily claim with achievements (FE-9)', () => {
  let save: SaveData;
  const STARS_10 = ACHIEVEMENTS.find((a) => a.id === 'stars_10')!;

  function title(s: SaveData): TitleScreen {
    const app: App = {
      view: {} as View,
      save: s,
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
      dayKey: () => '2026-10-11',
      weekKey: () => '2026-10-05',
    };
    return new TitleScreen(app);
  }

  beforeEach(() => {
    setSaveStorageForTests(null);
    save = defaultSave();
  });

  it('the reward toast names the reward only; the achievement toast follows it for ACHIEVEMENT_TOAST_MS', () => {
    for (let id = 1; id <= 10; id++) save.stars[String(id)] = 3; // the claim's evaluation unlocks "Ten 3★ levels"
    const screen = title(save);
    screen.claimChest();
    expect(save.achievements.unlocked).toEqual(['stars_10']);
    const reward = screen.toast.opts(0)?.text ?? '';
    expect(reward.startsWith(t('title.dailyReward', { day: 1, parts: '' }).trim())).toBe(true);
    const achievement = t('achievements.unlocked', { names: t('achievement.stars_10'), crystals: STARS_10.crystals });
    expect(reward).not.toContain(achievement);
    expect(screen.toast.queued()).toEqual([{ text: achievement, kind: 'ok', durationMs: ACHIEVEMENT_TOAST_MS }]);
    expect(screen.toast.opts(2400)?.text).toBe(achievement);
    expect(screen.toast.opts(2400 + ACHIEVEMENT_TOAST_MS)).toBeNull();
  });

  it('a claim that unlocks nothing queues nothing', () => {
    const screen = title(save);
    screen.claimChest();
    expect(save.achievements.unlocked).toEqual([]);
    expect(screen.toast.opts(0)?.text).toMatch(/^Day 1 reward: /);
    expect(screen.toast.queued()).toEqual([]);
    expect(screen.toast.opts(2400)).toBeNull();
  });
});
