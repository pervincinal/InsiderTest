import type { Command, GameState, Tower } from './sim/types';
import { linksFrom, maxLinksOf } from './sim/step';
import { referencePlayerCommands } from './ai/index';
import type { TowerClashApp, TowerClashDebug } from './main';
import { LEVEL_META, levelIndex } from './levels/index';
import { toClient } from './render/view';
import { isLevelUnlocked } from './ui/save';
import { ResultScreen } from './ui/screens';
import type { TranslationKey } from './ui/i18n';
import { currentLanguage, t } from './ui/i18n';
import { configureFakeStore } from './economy/providers/fakeStore';
import { grantProduct } from './economy/wallet';
import { challengeFor, weekKeyOf, weeklyFor } from './daily/challenge';
import { challengeDone, challengeUnlocked, shownStreak } from './ui/daily';
import { shownWeekStreak, weeklyDone, weeklyTargetDone, weeklyUnlocked } from './ui/weekly';

/*
 * Playwright / QA surface (`window.__towerclash`, PERF-6): a lazy chunk that main.ts installs once
 * the first frame is painted (`whenIdle`), so none of it is in the eager bundle a player downloads
 * before the title. Every spec waits for `window.__towerclash.loadLevel` before using it.
 */

export function installDebug(app: TowerClashApp): TowerClashDebug {
  return {
    getState: () => app.play?.state ?? null,
    getScreen: () => app.current.name,
    loadLevel: (id, seed) => app.startLevel(id, seed),
    autoplay: () => app.withPlay((play) => play.setPlayerBot(referencePlayerCommands)),
    setSpeed: (n) => app.setSpeed(n),
    getSpeed: () => app.play?.loop.speed ?? app.speed,
    toClient: (x, y) => toClient(app.view, x, y),
    getTutorialHint: () => (app.current === app.play ? (app.play?.tutorialStep()?.text ?? null) : null),
    getLimitHint: () => (app.current === app.play && app.play?.gestures.limitHint ? app.play.gestures.limitHintText : null),
    getLanguage: () => currentLanguage(),
    getText: (key) => t(key as TranslationKey),
    getToast: () => app.current.toast?.opts(performance.now())?.text ?? null,
    getResult: () => {
      if (!(app.current instanceof ResultScreen)) return null;
      const { outcome, stars, coinsEarned, coinsTotal } = app.current.info.ui;
      const { earnings, achievements } = app.current.info;
      const { tip, howto } = app.current.extras();
      return { outcome, stars, coinsEarned, coinsTotal, crystalsEarned: earnings.crystals, achievements: achievements.unlocked.map((a) => a.id), tip, howto };
    },
    isLevelUnlocked: (id) => isLevelUnlocked(app.save, LEVEL_META, levelIndex(id)),
    setLevelSelectScroll: (y) => {
      const L = app.lazy;
      if (L && app.current instanceof L.LevelSelectScreen) app.current.setScroll(y);
    },
    getLevelSelectScroll: () => {
      const L = app.lazy;
      return L && app.current instanceof L.LevelSelectScreen ? app.current.getScroll() : 0;
    },
    getCoins: () => app.save.gold,
    back: () => app.onBack(),
    openShop: (tab = 'crystals') => app.openShop(tab, app.backFromShop()),
    aiAvailable: true,
    setDayKey: (key) => {
      app.dayKeyOverride = key;
    },
    daily: {
      get: (dayKey = app.dayKey()) => {
        const challenge = challengeFor(dayKey);
        const c = app.save.challenge;
        return { challenge, unlocked: challengeUnlocked(app.save), done: challengeDone(app.save, dayKey), streak: shownStreak(app.save, dayKey), lastWinDay: c.lastWinDay, best: c.best[dayKey] ?? null };
      },
      start: (dayKey) => app.startChallenge(dayKey),
    },
    setWeekKey: (key) => {
      app.weekKeyOverride = key === null ? null : weekKeyOf(new Date(`${key}T12:00:00Z`));
    },
    weekly: {
      get: (weekKey = app.weekKey()) => {
        const challenge = weeklyFor(weekKey);
        const w = app.save.weekly;
        return { challenge, unlocked: weeklyUnlocked(app.save), done: weeklyDone(app.save, weekKey), target: weeklyTargetDone(app.save, weekKey), streak: shownWeekStreak(app.save, weekKey), lastWinWeek: w.lastWinWeek, best: w.best[weekKey] ?? null };
      },
      start: (weekKey) => app.startWeekly(weekKey),
      tab: () => {
        const L = app.lazy;
        return L && app.current instanceof L.LevelSelectScreen ? app.current.getCardTab() : null;
      },
    },
    economy: {
      getSave: () => app.save,
      grant: (productId) => grantProduct(app.save, productId, `debug-${Date.now()}-${Math.random()}`),
      setAdsAvailable: (on) => app.setFakeAds(on),
      configureFakeStore: (opts) => configureFakeStore(opts),
      getAdStats: () => ({
        interstitialsShown: app.ads.interstitialsShown,
        rewardedShown: app.ads.rewardedShown,
        fakeInterstitials: app.fakeAds?.interstitials ?? 0,
        fakeRewarded: app.fakeAds?.rewarded ?? 0,
      }),
      openShop: (tab) => app.openShop(tab, app.backFromShop()),
      autoLose: () => {
        if (!app.pendingStart && app.current !== app.play) return false;
        return app.withPlay((play) => play.setLoseBot(suicideCommands));
      },
      resultAction: (action) => {
        const cur = app.current;
        if (!(cur instanceof ResultScreen)) return false;
        if (action === 'doubleGold') cur.doubleGold();
        else if (action === 'continueCrystals') cur.continueWithCrystals();
        else if (action === 'continueAd') cur.continueWithAd();
        else cur.skipLevel();
        return true;
      },
      getClock: () => (app.play ? { timeMs: app.play.state.time, elapsedMs: app.play.elapsedMs(), continued: app.play.hasContinued } : null),
      shopScroll: (y) => {
        const L = app.lazy;
        if (!L || !(app.current instanceof L.ShopScreen)) return -1;
        if (y !== undefined) app.current.setScroll(y);
        return app.current.scrollY;
      },
      openAchievements: () => app.openAchievements(app.backFromShop()),
      setNativeInfo: (info) => {
        app.nativeInfo = info ?? undefined;
      },
      getAboutInfo: () => {
        const L = app.lazy;
        return L && app.current instanceof L.SettingsScreen ? app.current.aboutInfo : null;
      },
    },
  };
}

/**
 * "Auto lose" (e2e, was PlayScreen.suicideCommands): a stream never drains its source under rules v3 and nothing
 * the player does can weaken an own tower, so the fastest defeat is to stop growing and let the
 * enemy come: every player tower with a free link streams into the strongest hostile tower it
 * has a clear lane to that is not already streaming back on that lane (a counter-stream would
 * cancel the attack 1:1 and protect us), else into a player neighbour. Growth pauses either way.
 */
export function suicideCommands(state: GameState): Command[] {
  const cmds: Command[] = [];
  const neighbours = (id: string): Tower[] => {
    const out: Tower[] = [];
    for (const r of Object.values(state.roads)) {
      const otherId = r.a === id ? r.b : r.b === id ? r.a : null;
      const other = otherId ? state.towers[otherId] : undefined;
      if (other) out.push(other);
    }
    return out;
  };
  const streamsInto = (from: string, to: string): boolean => state.links.some((l) => l.from === from && l.to === to);
  for (const t of Object.values(state.towers)) {
    if (t.owner !== 'player' || t.units <= 0 || linksFrom(state, t.id).length >= maxLinksOf(t)) continue;
    let best: { to: string; score: number } | null = null;
    for (const other of neighbours(t.id)) {
      if (streamsInto(t.id, other.id) || streamsInto(other.id, t.id)) continue;
      // a hostile target first (the strongest, so our trickle matters least); a player neighbour only pauses growth
      const score = other.owner === 'player' ? -1 : (other.owner === 'neutral' ? 0 : 1000) + other.units;
      if (!best || score > best.score) best = { to: other.id, score };
    }
    if (best) cmds.push({ type: 'link', owner: 'player', from: t.id, to: best.to });
  }
  return cmds;
}
