import type { Command, GameState, Owner, Tower } from './sim/types';
import { C } from './sim/constants';
import { hasOverdrive, linksFrom, streamIntervalMs } from './sim/step';
import { parseReplay, replayOf, serializeReplay, verifyReplay } from './sim/replay';
import { aiModule } from './ui/ai';
import type { TowerClashApp, TowerClashDebug } from './main';
import type { PlayScreen } from './ui/play';
import { LEVEL_META, levelIndex, loadLevel } from './levels/index';
import { fromHudSpace, hudAnchors, toClient } from './render/view';
import type { SaveStorage } from './ui/save';
import { isLevelUnlocked, isSaveFailing, isSaveReadOnly, saveLoadIssue, setSaveStorageForTests } from './ui/save';
import { ResultScreen, lastShareRecord } from './ui/result';
import { lastReviewResult } from './native/review';
import type { TranslationKey } from './ui/i18n';
import { currentLanguage, hasEnglish, loadEnglishMenus, t } from './ui/i18n';
import { loadTutorialSteps } from './ui/tutorialChunk';
import { configureFakeStore } from './economy/providers/fakeStore';
import { fakeAds, setFakeAds } from './economy/fakeAds';
import { getStore } from './economy/store';
import { grantProduct } from './economy/purchases';
import { challengeFor, weekKeyOf, weeklyFor } from './daily/challenge';
import { challengeDone, challengeUnlocked, previousDayKey, shownStreak, yesterdayOffered } from './ui/daily';
import { shownWeekStreak, weeklyDone, weeklyTargetDone, weeklyUnlocked } from './ui/weekly';
import { getTerrain } from './render/terrain';
import { FLAT, playCamera } from './render/camera';
import { activeToneSet, biomeFor, toneSetsLoaded } from './render/palette';
import { equippedSkin } from './economy/entitlements';
import { audioSynth, effectsOn, musicOn } from './audio/index';
import { busLevels, musicState } from './audio/inspect';
import type { DiagRow } from './ui/diagnostics';
import { clearDiag, currentHints, diagRows, diagText } from './ui/diagnostics';

/*
 * Playwright / QA surface (`window.__towerclash`, PERF-6): a lazy chunk that main.ts installs once
 * the first frame is painted (`whenIdle`), so none of it is in the eager bundle a player downloads
 * before the title. Every spec waits for `window.__towerclash.loadLevel` before using it.
 */

/** QA-23 hooks not (yet) declared on `TowerClashDebug` in main.ts; specs type them loosely. */
export interface QaDebugExtras {
  /**
   * Build the running level's ground image once more, bypassing the terrain cache (a fresh `variant`
   * key, same work), under the play camera (`flat`: the `?tilt=0` map) and return the wall-clock ms —
   * the ART-21 per-row warp is a one-off cost per level. Null when no level is on screen.
   */
  getGroundBuildMs(flat?: boolean): number | null;
  /**
   * AUD-F6 mixer: `getBuses()` the live master / SFX / UI / music / duck gains and the limiter (null
   * before the first gesture built the mixer); `getMusic()` whether the loop runs, its next step and
   * whether the pulse layer is on.
   */
  audio: {
    getBuses(): ReturnType<typeof busLevels>;
    getMusic(): ReturnType<typeof musicState>;
    settings(): { effects: boolean; music: boolean };
  };
  /**
   * AUD-B6 diagnostics log (src/ui/diagnostics.ts): `rows()` as stored, `text()` what COPY LOG puts on
   * the clipboard, `clear()` = CLEAR LOG; `about()` the Settings screen's Diagnostics rects (layout px)
   * and the count it shows, null on any other screen.
   */
  diag: {
    rows(): DiagRow[];
    text(): string;
    clear(): void;
    about(): { toggle: { x: number; y: number; w: number; h: number }; copy: { x: number; y: number; w: number; h: number } | null; clear: { x: number; y: number; w: number; h: number } | null; rows: number; on: boolean } | null;
  };
  /**
   * AUD-U27 keyboard focus (src/ui/focus.ts): whether the ring shows, the ringed item's index, the
   * current screen's item count and the ringed rect (screen logical px); null before the lazy chunk is in.
   */
  getFocus(): { shown: boolean; index: number; count: number; rect: { x: number; y: number; w: number; h: number } | null } | null;
  /**
   * SIM-R1 replay record v1 (`src/sim/replay.ts`) of the running (or just finished) match as JSON —
   * level, seed, modifiers, rules id, every command with its tick, and the outcome + state hash at this
   * moment — for bug reports and `npx tsx scripts/replay.ts <file.json>`. Null when no match exists.
   */
  getReplay(): string | null;
  /**
   * SIM-R1: re-run a replay record (the JSON of `getReplay()`, or a committed fixture) on this engine and
   * compare it with its recorded outcome — `verifyReplay` of `src/sim/replay.ts` minus the state. The
   * level chunk is loaded if needed. Rejects on a malformed record or an unknown level.
   */
  verifyReplay(json: string): Promise<{ hash: string; expected?: string; matches: boolean; rulesMatch: boolean; outcome: string; timeMs: number; reason?: string }>;
}

let groundBuilds = 0;

/**
 * AUD-Q10: `save.failWrites(n)` routes the save's writes through this wrapper of localStorage (the
 * `setSaveStorageForTests` hook) that throws a QuotaExceededError for the next `n` `setItem` calls of
 * the save key — each refused write costs one call and its 100 ms retry another — then passes writes
 * through again. Reads are untouched, so the title still boots from the real save.
 */
const forced = { left: 0, thrown: 0 };

function installFailingStorage(): void {
  const real = (): Storage => localStorage;
  const store: SaveStorage = {
    getItem: (k) => real().getItem(k),
    removeItem: (k) => real().removeItem(k),
    key: (i) => real().key(i),
    get length() {
      return real().length;
    },
    setItem: (k, v) => {
      if (forced.left > 0) {
        forced.left -= 1;
        forced.thrown += 1;
        throw new DOMException('forced by __towerclash.save.failWrites', 'QuotaExceededError');
      }
      real().setItem(k, v);
    },
  };
  setSaveStorageForTests(store);
}

/**
 * Run `fn` on the current play screen, or on the one a pending `startLevel` is about to create
 * (Playwright calls `loadLevel(); autoplay()` back to back without awaiting). False when there is
 * neither. Lives here, not on the app (PERF-12): the debug surface is its only caller.
 */
function withPlay(app: TowerClashApp, fn: (play: PlayScreen) => void): boolean {
  if (app.pendingStart) {
    void app.pendingStart.then((play) => play && fn(play));
    return true;
  }
  if (!app.play) return false;
  fn(app.play);
  return true;
}

export function installDebug(app: TowerClashApp): TowerClashDebug & QaDebugExtras {
  const extras: QaDebugExtras = {
    getFocus: () => app.lazy?.focusState(app) ?? null,
    getReplay: () => (app.play ? serializeReplay(replayOf(app.play.level, app.play.state, app.play.replayLog, app.play.hasContinued)) : null),
    verifyReplay: async (json) => {
      const replay = parseReplay(json);
      const level = await loadLevel(replay.levelId);
      if (!level) throw new Error(`verifyReplay: unknown level ${replay.levelId}`);
      const { hash, expected, matches, rulesMatch, outcome, timeMs, reason } = verifyReplay(level, replay);
      const out: Awaited<ReturnType<QaDebugExtras['verifyReplay']>> = { hash, matches, rulesMatch, outcome, timeMs };
      if (expected !== undefined) out.expected = expected;
      if (reason !== undefined) out.reason = reason;
      return out;
    },
    audio: {
      getBuses: () => busLevels(audioSynth()),
      getMusic: () => musicState(audioSynth()),
      settings: () => ({ effects: effectsOn(), music: musicOn() }),
    },
    diag: {
      rows: () => diagRows(),
      text: () => diagText(diagRows(), currentHints(app.save, currentLanguage())),
      clear: () => clearDiag(),
      about: () => {
        const L = app.lazy;
        return L && app.current instanceof L.SettingsScreen ? app.current.diagInfo : null;
      },
    },
    getGroundBuildMs: (flat = false) => {
      const play = app.current === app.play ? app.play : undefined;
      if (!play) return null;
      const st = play.state;
      const spec = {
        key: `level:${st.levelId}`,
        variant: `qa-build-${++groundBuilds}`,
        seed: st.levelId,
        biome: biomeFor(st.levelId),
        theme: equippedSkin(app.save).theme,
        obstacles: st.obstacles.map((o) => ({ kind: o.kind, points: o.points, width: o.width })),
        mines: st.mines.map((m) => ({ x: m.x, y: m.y, charges: m.charges })),
        towers: Object.values(st.towers).map((t) => ({ x: t.x, y: t.y })),
        zoom: true, // as the play screen builds it (ART-24)
      };
      const t0 = performance.now();
      getTerrain(app.view, app.palette(), spec, flat ? FLAT : playCamera());
      return performance.now() - t0;
    },
  };
  const dbg: TowerClashDebug = {
    getState: () => app.play?.state ?? null,
    getScreen: () => app.current.name,
    transitionDone: () => app.lazy?.slideDone() ?? true,
    loadLevel: (id, seed) => app.startLevel(id, seed),
    // the AI chunk is in whenever a play screen exists (startLevel awaits it); no static import of src/ai, so it stays one chunk (PERF-9)
    autoplay: () => withPlay(app, (play) => play.setPlayerBot(aiModule().referencePlayerCommands)),
    startMatch: () => withPlay(app, (play) => play.startMatch()),
    setSpeed: (n) => app.setSpeed(n),
    getSpeed: () => app.play?.loop.speed ?? app.speed,
    // On the play screen a map point is drawn through the tilted camera (ART-21, `PlayScreen.fromLayout`):
    // tower / lane coordinates land where they are drawn; HUD and pause-card points stay as they are.
    toClient: (x, y) => {
      const p = app.current === app.play && app.play ? app.play.fromLayout(x, y) : { x, y };
      return toClient(app.view, p.x, p.y);
    },
    hudToClient: (x, y) => {
      const p = fromHudSpace(hudAnchors(app.view), x, y);
      return toClient(app.view, p.x, p.y);
    },
    layoutToClient: (x, y) => {
      const p = app.current.fromLayout?.(x, y) ?? { x, y };
      return toClient(app.view, p.x, p.y);
    },
    logicalToLayout: (x, y) => app.current.toLayout?.(x, y) ?? { x, y },
    getAnchors: () => hudAnchors(app.view),
    getTutorialHint: () => (app.current === app.play ? (app.play?.tutorialStep()?.text ?? null) : null),
    getTutorialStep: () => (app.current === app.play ? (app.play?.tutorialStepIndex() ?? null) : null),
    getLimitHint: () => (app.current === app.play && app.play?.gestures.limitHint ? app.play.gestures.limitHintText : null),
    // HowToScreen is in the lazy screens chunk: read its `lines` structurally (no static import of the chunk)
    getHowtoLines: () => (app.current.name === 'howto' ? [...((app.current as unknown as { lines?: readonly number[] }).lines ?? [])] : null),
    getDrag: () => {
      const g = app.current === app.play ? app.play?.gestures : undefined;
      return g?.drag ? { ...g.drag, hoverTowerId: g.hoverTowerId } : null;
    },
    getLanguage: () => currentLanguage(),
    getTones: () => ({
      setting: app.save.settings.tones ?? 'classic',
      active: activeToneSet(app.save.settings.tones),
      loaded: toneSetsLoaded(),
      player: app.palette().owners.player,
    }),
    // English menu strings (PERF-8) and the level 2–4 tutorial hints (PERF-10) are lazy chunks: fetch the
    // one that holds the key first when it is not in yet
    getText: async (key, params) => {
      if (!hasEnglish(key)) await (key.startsWith('tutorial.') ? loadTutorialSteps() : loadEnglishMenus()).catch(() => undefined);
      return t(key as TranslationKey, params);
    },
    getToast: () => app.current.toast?.opts(performance.now())?.text ?? null,
    perf: {
      isOn: () => app.perfOverlayOn,
      getStats: () => app.perf?.stats() ?? null,
      versionRow: () => {
        const L = app.lazy;
        return L && app.current instanceof L.SettingsScreen ? { ...app.current.versionRow } : null;
      },
    },
    get lastShare() {
      return lastShareRecord();
    },
    get lastReview() {
      return lastReviewResult();
    },
    getResult: () => {
      if (!(app.current instanceof ResultScreen)) return null;
      const { outcome, stars, coinsEarned, coinsTotal } = app.current.info.ui;
      const { earnings, achievements } = app.current.info;
      const { tip, howto, daily } = app.current.extras();
      // practice: the result line reads "Yesterday's map — no reward" (DAILY-6)
      return { outcome, stars, coinsEarned, coinsTotal, crystalsEarned: earnings.crystals, achievements: achievements.unlocked.map((a) => a.id), tip, howto, practice: daily?.practice === true };
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
    get storeAvailable() {
      return getStore().isAvailable();
    },
    setDayKey: (key) => {
      app.dayKeyOverride = key;
    },
    daily: {
      get: (dayKey = app.dayKey()) => {
        const challenge = challengeFor(dayKey);
        const c = app.save.challenge;
        const yesterday = yesterdayOffered(app.save, dayKey) ? challengeFor(previousDayKey(dayKey)) : null;
        return { challenge, unlocked: challengeUnlocked(app.save), done: challengeDone(app.save, dayKey), streak: shownStreak(app.save, dayKey), lastWinDay: c.lastWinDay, best: c.best[dayKey] ?? null, yesterday };
      },
      // the picker lives here, not in main.ts: the level map (lazy) and this surface are its only users (PERF-8)
      start: (dayKey = app.dayKey()) => {
        const challenge = challengeFor(dayKey);
        return app.startLevel(challenge.levelId, challenge.seed, { challenge });
      },
      startYesterday: (dayKey = app.dayKey()) => {
        const y = challengeFor(previousDayKey(dayKey));
        return app.startLevel(y.levelId, y.seed, { challenge: y, practice: true });
      },
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
      start: (weekKey = app.weekKey()) => {
        const weekly = weeklyFor(weekKey);
        return app.startLevel(weekly.levelId, weekly.seed, { weekly });
      },
      tab: () => {
        const L = app.lazy;
        return L && app.current instanceof L.LevelSelectScreen ? app.current.getCardTab() : null;
      },
    },
    save: {
      failWrites: (n) => {
        forced.left = Math.max(0, Math.floor(n));
        installFailingStorage();
      },
      status: () => ({ failing: isSaveFailing(), readOnly: isSaveReadOnly(), issue: saveLoadIssue(), forcedLeft: forced.left, thrown: forced.thrown }),
      notice: () => app.lazy?.lastSaveNotice() ?? null,
    },
    economy: {
      getSave: () => app.save,
      grant: (productId) => grantProduct(app.save, productId, `debug-${Date.now()}-${Math.random()}`),
      setAdsAvailable: (on) => setFakeAds(on),
      configureFakeStore: (opts) => configureFakeStore(opts),
      getAdStats: () => ({
        interstitialsShown: app.ads.interstitialsShown,
        rewardedShown: app.ads.rewardedShown,
        fakeInterstitials: fakeAds()?.interstitials ?? 0,
        fakeRewarded: fakeAds()?.rewarded ?? 0,
      }),
      openShop: (tab) => app.openShop(tab, app.backFromShop()),
      autoLose: () => {
        if (!app.pendingStart && app.current !== app.play) return false;
        return withPlay(app, (play) => play.setLoseBot(suicideCommands));
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
  // assign into `dbg` (not a copy): its getters (`lastShare`, `storeAvailable`, …) must stay live
  return Object.assign(dbg, extras);
}

/**
 * Lose bot margin (AUD-F19): a fast tower's real stream (below) is cut once its enemy target holds fewer
 * than this many units beyond what our walking units and our ribbons' next emissions will take, so the
 * bot never flips an enemy tower (a flip at 0 needs one more landing than the garrison).
 */
export const LOSE_BOT_MARGIN = 2;

function isEnemyOwner(owner: Owner): boolean {
  return owner === 'enemy1' || owner === 'enemy2' || owner === 'enemy3';
}

/** Towers `id` has a lane to (rules v3: every clear pair of towers), sorted by id so the bot is deterministic. */
function laneNeighbours(state: GameState, id: string): Tower[] {
  const out: Tower[] = [];
  for (const r of Object.values(state.roads)) {
    const otherId = r.a === id ? r.b : r.b === id ? r.a : null;
    const other = otherId ? state.towers[otherId] : undefined;
    if (other) out.push(other);
  }
  return out.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
}

/** Lane hops from every tower to the nearest enemy tower (absent = unreachable). */
function hopsToEnemy(state: GameState): Map<string, number> {
  const hops = new Map<string, number>();
  const queue: string[] = [];
  for (const t of Object.values(state.towers)) {
    if (!isEnemyOwner(t.owner)) continue;
    hops.set(t.id, 0);
    queue.push(t.id);
  }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    const d = hops.get(id)!;
    for (const n of laneNeighbours(state, id)) {
      if (hops.has(n.id)) continue;
      hops.set(n.id, d + 1);
      queue.push(n.id);
    }
  }
  return hops;
}

/**
 * True when a ribbon of `t` started now would emit before the next AI tick: its stream interval
 * (÷ OVERDRIVE_MUL under the player's overdrive) is at most C.AI_TICK_MS — an L3 barracks (500 ms).
 */
export function emitsWithinAiTick(state: GameState, t: Tower): boolean {
  const interval = streamIntervalMs(t, state) / (hasOverdrive(state, t.owner) ? C.OVERDRIVE_MUL : 1);
  return interval <= C.AI_TICK_MS;
}

/**
 * "Auto lose" (e2e `economy.autoLose()`, the continue / daily / weekly unit tests). AUD-F19 (2026-11-04):
 * the previous line streamed every tower into its strongest hostile neighbour — neutrals included — and
 * under rules v3 a stream never drains its source, so it captured neutrals, pinned the enemy's towers
 * under fire and *won* levels 2, 4, 6, 7, 8, 22, 44, 50 (and froze 5). A player cannot weaken its own
 * towers, so the loss has to come from the enemy: the bot must stop its own growth (a linked tower does
 * not grow, rules v3 rule 5) while landing nothing anywhere. It does that with a **held ribbon**:
 *
 * - Every AI tick (C.AI_TICK_MS) each player tower drops its ribbons and opens one again. A new link starts
 *   with an empty emission timer (`emitAccMs = 0`, sim/commands.ts `link`) and a tower's first unit leaves
 *   one stream interval later — 1000 ms at L1, 700 ms at L2, ≥ 2000 ms for a tank factory, all longer than
 *   the 500 ms the ribbon lives — so the tower stays linked (no growth, no auto-upgrade) and sends nothing:
 *   no neutral is captured, no enemy tower is hurt or put under fire, no enemy stream is shielded.
 * - The held ribbon goes to the strongest enemy neighbour that is not streaming at this tower (on that lane
 *   the enemy AI would read our ribbon as a shield and give the attack up), else to the strongest neutral no
 *   rival is taking (the AI would read a contest there), else to the own neighbour farthest from the enemy;
 *   a tower with none of these keeps growing.
 * - A tower whose ribbon would emit within one AI tick (`emitsWithinAiTick`: L3 barracks, overdrive) cannot be
 *   held for free, so it runs a real stream into the strongest enemy tower on a clear lane (one that does not
 *   stream back), never into a neutral, and cuts it once the target holds < LOSE_BOT_MARGIN beyond our walking
 *   units and ribbons, or turned neutral / ours, or started streaming back; with no such target it is left
 *   unlinked (an L3 is at or near its cap and gains little).
 *
 * Headless (seeds 1–3, ×1 sim, 2026-11-04): every level 1–50 is lost, levels 1–16 within 26–63 s (level 1's
 * turtle comes for the frozen home at ≈ 51 s); tests/ui/autoLose.test.ts pins levels 2–8 under 90 s and that
 * a held tower sends nothing. If the sim ever carries a link's timer over a re-link, that test fails first.
 */
export function suicideCommands(state: GameState): Command[] {
  const cmds: Command[] = [];
  const hops = hopsToEnemy(state);
  const streamsInto = (from: string, to: string): boolean => state.links.some((l) => l.from === from && l.to === to);
  // weight our walking units and our ribbons' next emissions will land on `to`
  const pressure = (to: string): number => {
    let w = 0;
    for (const u of state.units) if (u.owner === 'player' && u.to === to) w += u.weight;
    for (const l of state.links) {
      if (l.owner !== 'player' || l.to !== to) continue;
      const from = state.towers[l.from];
      w += from && from.kind === 'tankFactory' && from.units >= C.TANK_WEIGHT ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT;
    }
    return w;
  };
  const strongest = (towers: Tower[]): Tower | undefined => towers.reduce<Tower | undefined>((best, t) => (!best || t.units > best.units ? t : best), undefined);
  for (const t of Object.values(state.towers)) {
    if (t.owner !== 'player') continue;
    const own = linksFrom(state, t.id).filter((l) => l.owner === 'player');
    const lanes = laneNeighbours(state, t.id);
    if (emitsWithinAiTick(state, t)) {
      const fair = (to: Tower, extra: number): boolean => isEnemyOwner(to.owner) && !streamsInto(to.id, t.id) && to.units - pressure(to.id) - extra >= LOSE_BOT_MARGIN;
      let kept = false;
      for (const l of own) {
        const to = state.towers[l.to];
        if (!kept && to && fair(to, 0)) kept = true;
        else cmds.push({ type: 'unlink', owner: 'player', from: t.id, to: l.to });
      }
      if (kept || t.units < 1) continue;
      const target = strongest(lanes.filter((n) => fair(n, C.INFANTRY_WEIGHT)));
      if (target) cmds.push({ type: 'link', owner: 'player', from: t.id, to: target.id });
      continue;
    }
    for (const l of own) cmds.push({ type: 'unlink', owner: 'player', from: t.id, to: l.to });
    if (t.units < 1) continue; // the sim refuses a link from an empty tower
    const quiet = (n: Tower): boolean => !state.links.some((l) => l.to === n.id && l.owner !== 'player') && !state.units.some((u) => u.to === n.id && u.owner !== 'player');
    const farthest = lanes
      .filter((n) => n.owner === 'player')
      .reduce<Tower | undefined>((best, n) => (!best || (hops.get(n.id) ?? Infinity) > (hops.get(best.id) ?? Infinity) ? n : best), undefined);
    const hold =
      strongest(lanes.filter((n) => isEnemyOwner(n.owner) && !streamsInto(n.id, t.id))) ??
      strongest(lanes.filter((n) => n.owner === 'neutral' && quiet(n))) ??
      farthest;
    if (hold) cmds.push({ type: 'link', owner: 'player', from: t.id, to: hold.id });
  }
  return cmds;
}
