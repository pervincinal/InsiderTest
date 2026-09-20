/**
 * Level select (M1-3b): the winding path map. Opens centred on the current level; locked nodes
 * ignore taps; the header wallet and the commander chip open the shop. Loaded lazily with its
 * drawing (PERF-1, src/ui/lazyScreens.ts) and preloaded right after the first frame.
 */
import { C } from '../sim/constants';
import { LEVEL_META, getLevelMeta } from '../levels/index';
import { levelName, t } from './i18n';
import type { View } from '../render/view';
import { LEVEL_MAP, levelMapMaxScroll, levelNodeCentre, levelNodeRect } from '../render/layout';
import type { Rect } from '../render/widgets';
import { formatTime, inRect } from '../render/widgets';
import type { DailyCardOpts, WeeklyCardOpts } from '../render/menusLevels';
import { drawLevelSelect } from '../render/menusLevels';
import type { PointerPoint } from '../input/pointer';
import { currentLevelIndex, isLevelUnlocked } from './save';
import type { App, Screen } from './screens';
import { Toast } from './screens';
import { commanderSummary } from './upgrades';
import type { DailyChallenge, WeeklyChallenge } from '../daily/challenge';
import { REWARD, STREAK_MILESTONES, UNLOCK_AFTER_LEVEL, WEEKLY_REWARD, WEEKLY_UNLOCK_AFTER_LEVEL, challengeFor, goldReward, weeklyFor } from '../daily/challenge';
import { challengeDone, challengeUnlocked, msToUtcMidnight, shownStreak } from './daily';
import { msToNextMonday, shownWeekStreak, weeklyDone, weeklyTargetDone, weeklyUnlocked } from './weekly';
import type { SaveData } from './save';

/* ---------- Level select: winding path map ---------- */

const BACK = LEVEL_MAP.back;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type CardTab = 'daily' | 'weekly';
/** The challenge card's tab (GDD §8.2): remembered for the session only, never saved. */
let cardTab: CardTab = 'daily';

/**
 * The next streak milestone (`[day, crystals]`, ECONOMY.md §6.2) above the shown streak, or null past
 * the last one. Lives here rather than in daily.ts so the eager bundle does not carry it (only the card reads it).
 */
export function nextStreakMilestone(save: SaveData, dayKey: string): readonly [number, number] | null {
  const s = shownStreak(save, dayKey);
  return STREAK_MILESTONES.find(([day]) => day > s) ?? null;
}

export class LevelSelectScreen implements Screen {
  readonly name = 'levelSelect' as const;
  private scroll = 0;
  private downY = 0;
  private scrollAtDown = 0;
  /** Pointer currently held (mouse hover also produces move events; those must not scroll). */
  private held = false;
  private dragging = false;
  private pressed: Rect | null = null;
  private readonly current: number;
  readonly toast = new Toast();
  private nowMs = 0;
  /** Today's challenge, recomputed only when the day key changes (midnight, debug override). */
  private challenge: DailyChallenge | null = null;
  /** This week's challenge, recomputed only when the week key changes (Monday 00:00 UTC, debug override). */
  private weekly: WeeklyChallenge | null = null;

  constructor(private readonly app: App) {
    this.current = currentLevelIndex(app.save, LEVEL_META);
    // open centred on the current level
    this.setScroll(levelNodeCentre(this.current).y - C.MAP_H * 0.5);
  }

  private maxScroll(): number {
    return levelMapMaxScroll(LEVEL_META.length, C.MAP_H);
  }

  setScroll(y: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll(), y));
  }

  getScroll(): number {
    return this.scroll;
  }

  /** The challenge for the app's current day key. */
  private todaysChallenge(): DailyChallenge {
    const dayKey = this.app.dayKey();
    if (!this.challenge || this.challenge.dayKey !== dayKey) this.challenge = challengeFor(dayKey);
    return this.challenge;
  }

  /** The weekly for the app's current week key. */
  private thisWeeks(): WeeklyChallenge {
    const weekKey = this.app.weekKey();
    if (!this.weekly || this.weekly.weekKey !== weekKey) this.weekly = weeklyFor(weekKey);
    return this.weekly;
  }

  getCardTab(): CardTab {
    return cardTab;
  }

  /** Card state; the only clock read of this screen (once per frame, for the countdowns). */
  private dailyCard(): DailyCardOpts {
    const ch = this.todaysChallenge();
    const save = this.app.save;
    const meta = getLevelMeta(ch.levelId);
    const now = Date.now();
    const remaining = msToUtcMidnight(now);
    const countdown = remaining >= HOUR_MS ? t('daily.newIn', { h: Math.ceil(remaining / HOUR_MS) }) : t('daily.newInTime', { time: formatTime(remaining) });
    return {
      unlocked: challengeUnlocked(save),
      unlockLevel: UNLOCK_AFTER_LEVEL,
      levelName: meta ? levelName(meta) : String(ch.levelId),
      twist: t(`daily.twist.${ch.twist.id}`),
      gold: goldReward(3),
      crystals: REWARD.crystals,
      streak: shownStreak(save, ch.dayKey),
      nextBonus: nextStreakMilestone(save, ch.dayKey),
      done: challengeDone(save, ch.dayKey),
      best: save.challenge.best[ch.dayKey] ?? null,
      countdown,
      tab: cardTab,
      weekly: this.weeklyCard(now),
    };
  }

  /** The weekly face of the card (GDD §8.2): countdown to Monday 00:00 UTC in days, hours, then MM:SS. */
  private weeklyCard(now: number): WeeklyCardOpts {
    const w = this.thisWeeks();
    const save = this.app.save;
    const meta = getLevelMeta(w.levelId);
    const remaining = msToNextMonday(now);
    const days = Math.floor(remaining / DAY_MS);
    const countdown =
      days >= 1
        ? t('weekly.newInDays', { d: days, h: Math.floor((remaining % DAY_MS) / HOUR_MS) })
        : remaining >= HOUR_MS
          ? t('weekly.newIn', { h: Math.ceil(remaining / HOUR_MS) })
          : t('daily.newInTime', { time: formatTime(remaining) });
    return {
      unlocked: weeklyUnlocked(save),
      unlockLevel: WEEKLY_UNLOCK_AFTER_LEVEL,
      levelName: meta ? levelName(meta) : String(w.levelId),
      twist: t(`daily.twist.${w.twist.id}`),
      gold: WEEKLY_REWARD.gold,
      crystals: WEEKLY_REWARD.crystals,
      streak: shownWeekStreak(save, w.weekKey),
      done: weeklyDone(save, w.weekKey),
      target: weeklyTargetDone(save, w.weekKey),
      targetMs: w.targetMs,
      best: save.weekly.best[w.weekKey] ?? null,
      countdown,
    };
  }

  /** Tap on the challenge card: start today's / this week's challenge, or explain the lock. */
  private tapDaily(): void {
    if (cardTab === 'weekly') {
      const w = this.thisWeeks();
      if (!weeklyUnlocked(this.app.save)) {
        this.toast.show(t('weekly.locked', { n: WEEKLY_UNLOCK_AFTER_LEVEL }), 'error', this.nowMs);
        return;
      }
      void this.app.startLevel(w.levelId, w.seed, { weekly: w });
      return;
    }
    const ch = this.todaysChallenge();
    if (!challengeUnlocked(this.app.save)) {
      this.toast.show(t('daily.locked', { n: UNLOCK_AFTER_LEVEL }), 'error', this.nowMs);
      return;
    }
    void this.app.startLevel(ch.levelId, ch.seed, { challenge: ch });
  }

  draw(view: View, nowMs: number): void {
    this.nowMs = nowMs;
    drawLevelSelect(view, this.app.palette(), {
      nodes: LEVEL_META.map((level, i) => ({
        id: level.id,
        name: levelName(level),
        stars: this.app.save.stars[String(level.id)] ?? 0,
        unlocked: isLevelUnlocked(this.app.save, LEVEL_META, i),
      })),
      current: this.current,
      scroll: this.scroll,
      backRect: BACK,
      walletRect: LEVEL_MAP.wallet,
      commanderRect: LEVEL_MAP.commander,
      gold: this.app.save.gold,
      crystals: this.app.save.crystals,
      commander: commanderSummary(this.app.save),
      daily: this.dailyCard(),
      nowMs,
      pressed: this.pressed,
      toast: this.toast.opts(nowMs),
    });
  }

  down(p: PointerPoint): void {
    this.held = true;
    this.downY = p.y;
    this.scrollAtDown = this.scroll;
    this.dragging = false;
    this.pressed = [BACK, LEVEL_MAP.wallet, LEVEL_MAP.commander, LEVEL_MAP.dailyTabDaily, LEVEL_MAP.dailyTabWeekly, LEVEL_MAP.daily].find((r) => inRect(r, p.x, p.y)) ?? null;
  }

  move(p: PointerPoint): void {
    if (!this.held) return;
    if (Math.abs(p.y - this.downY) > 14) {
      this.dragging = true;
      this.pressed = null;
    }
    if (this.dragging) this.setScroll(this.scrollAtDown - (p.y - this.downY));
  }

  up(p: PointerPoint): void {
    this.pressed = null;
    const wasDrag = this.dragging;
    this.held = false;
    this.dragging = false;
    if (wasDrag) return;
    if (inRect(BACK, p.x, p.y)) {
      this.app.goTitle();
      return;
    }
    if (inRect(LEVEL_MAP.wallet, p.x, p.y)) {
      this.app.goShop('crystals', () => this.app.goLevels());
      return;
    }
    if (inRect(LEVEL_MAP.commander, p.x, p.y)) {
      this.app.goShop('upgrades', () => this.app.goLevels());
      return;
    }
    if (inRect(LEVEL_MAP.dailyTabDaily, p.x, p.y) || inRect(LEVEL_MAP.dailyTabWeekly, p.x, p.y)) {
      cardTab = inRect(LEVEL_MAP.dailyTabWeekly, p.x, p.y) ? 'weekly' : 'daily';
      return;
    }
    if (inRect(LEVEL_MAP.daily, p.x, p.y)) {
      this.tapDaily();
      return;
    }
    if (p.y < LEVEL_MAP.headerH || p.y >= LEVEL_MAP.commander.y - 10) return;
    for (let i = 0; i < LEVEL_META.length; i++) {
      const level = LEVEL_META[i];
      if (level && inRect(levelNodeRect(i, this.scroll), p.x, p.y)) {
        if (isLevelUnlocked(this.app.save, LEVEL_META, i)) void this.app.startLevel(level.id);
        return; // locked: the tap does nothing
      }
    }
  }

  wheel(dy: number): void {
    this.setScroll(this.scroll + dy);
  }

  cancel(): void {
    this.held = false;
    this.dragging = false;
    this.pressed = null;
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.app.goTitle();
    else if (e.key === 'ArrowDown') this.setScroll(this.scroll + LEVEL_MAP.step);
    else if (e.key === 'ArrowUp') this.setScroll(this.scroll - LEVEL_MAP.step);
  }
}
