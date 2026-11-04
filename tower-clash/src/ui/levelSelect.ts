/**
 * Level select (M1-3b): the winding path map. Opens centred on the current level; a locked node
 * shakes and toasts what opens it, a drag flings on (AUD-U18, ./fling.ts); the header wallet and the commander chip open the shop. Loaded lazily with its
 * drawing (PERF-1, src/ui/lazyScreens.ts) and preloaded right after the first frame.
 */
import { C } from '../sim/constants';
import { LEVEL_META, getLevelMeta } from '../levels/index';
import type { LevelMeta } from '../levels/index';
import { LEVEL_NAMES } from '../levels/names';
import { levelName, t } from './i18n';
import type { View } from '../render/view';
import { hudAnchors } from '../render/view';
import { LEVEL_MAP, bandAt, bandToScreen, levelMapBands, levelMapMaxScroll, levelMapMinScroll, levelNodeCentre, levelNodeRect, screenToBand } from '../render/menuLayout';
import type { Rect } from '../render/widgets';
import { formatTime, hitRect } from '../render/widgets';
import { dragThreshold } from '../input/pointer';
import type { DailyCardOpts, WeeklyCardOpts } from '../render/menusLevels';
import { CHALLENGE_PLAY_HIT, drawLevelSelect } from '../render/menusLevels';
import type { PointerPoint } from '../input/pointer';
import { currentLevelIndex, isLevelUnlocked } from './save';
import type { App, Screen } from './screens';
import { Toast } from './screens';
import { commanderSummary } from './upgradesSummary';
import type { DailyChallenge, WeeklyChallenge } from '../daily/challenge';
import { REWARD, STREAK_MILESTONES, UNLOCK_AFTER_LEVEL, WEEKLY_REWARD, WEEKLY_UNLOCK_AFTER_LEVEL, challengeFor, goldReward, weeklyFor } from '../daily/challenge';
import { challengeDone, challengeUnlocked, msToUtcMidnight, previousDayKey, shownStreak, yesterdayOffered } from './daily';
import { msToNextMonday, shownWeekStreak, weeklyDone, weeklyTargetDone, weeklyUnlocked } from './weekly';
import type { SaveData } from './save';
import { Fling, SHAKE_MS, shakeOffset } from './fling';
import { prefersReducedMotion } from '../render/particles';

/* ---------- Level select: winding path map ---------- */

const BACK = LEVEL_MAP.back;

/** Drawn rect → its own tap rect where the padded one would reach into a neighbour (AUD-U1, menuLayout.ts). */
const OWN_HIT = new Map<Rect, Rect>([
  [LEVEL_MAP.dailyTabDaily, LEVEL_MAP.dailyTabDailyHit],
  [LEVEL_MAP.dailyTabWeekly, LEVEL_MAP.dailyTabWeeklyHit],
  [LEVEL_MAP.yesterday, LEVEL_MAP.yesterdayHit],
]);
/** A level's name in the UI language: the metadata carries English only, the translations are ../levels/names.ts (PERF-10). */
const metaName = (meta: LevelMeta): string => levelName({ ...meta, ...LEVEL_NAMES[meta.id] });
const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * The challenge card's countdown in local terms (AUD-U23). The rollover stays UTC midnight / Monday
 * 00:00 UTC (GDD §7.2 / §8.1); only the display converts: the time left ("10h 24m", "3d 4h" on the
 * weekly, "12:34" under an hour) and, where the device clock is more than an hour off UTC
 * (`offsetMin` = local − UTC at the rollover, minutes), the local clock time of the rollover
 * ("at 04:00", the weekly "at Mon 04:00" / "at Sun 19:00" west of UTC). Pure: the screen passes the offset.
 */
export function challengeCountdown(remainingMs: number, offsetMin: number, weekly: boolean): { full: string; time: string } {
  const mins = Math.floor(remainingMs / MIN_MS);
  const time =
    weekly && remainingMs >= DAY_MS
      ? t('weekly.dh', { d: Math.floor(remainingMs / DAY_MS), h: Math.floor((remainingMs % DAY_MS) / HOUR_MS) })
      : remainingMs >= HOUR_MS
        ? t('daily.hm', { h: Math.floor(mins / 60), m: mins % 60 })
        : formatTime(remainingMs);
  let note = '';
  if (Math.abs(offsetMin) > 60) {
    const local = ((Math.round(offsetMin) % 1440) + 1440) % 1440;
    const clock = `${String(Math.floor(local / 60)).padStart(2, '0')}:${String(local % 60).padStart(2, '0')}`;
    // Monday 00:00 UTC is still Monday east of UTC (up to +14 h) and Sunday west of it (down to −12 h)
    note = weekly ? t('weekly.at', { day: t(offsetMin < 0 ? 'weekly.sun' : 'weekly.mon'), time: clock }) : t('daily.at', { time: clock });
  }
  return { full: t('daily.newIn', { time }) + note, time };
}

/** Local − UTC in minutes at epoch `ms` (the device's zone, DST included). */
const localOffsetMin = (ms: number): number => -new Date(ms).getTimezoneOffset();

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
  /** AUD-U18: momentum after a drag; `caught` = this press stopped a fling, so its tap does nothing. */
  private readonly fling = new Fling();
  private caught = false;
  /** AUD-U18: the locked node tapped last and when (its 200 ms shake). */
  private shake: { index: number; at: number } | null = null;
  private readonly current: number;
  readonly toast = new Toast();
  private nowMs = 0;
  /** Today's challenge, recomputed only when the day key changes (midnight, debug override). */
  private challenge: DailyChallenge | null = null;
  /** This week's challenge, recomputed only when the week key changes (Monday 00:00 UTC, debug override). */
  private weekly: WeeklyChallenge | null = null;
  /** Yesterday's challenge (DAILY-6), recomputed only when the day key changes. */
  private yesterdayCh: DailyChallenge | null = null;

  constructor(private readonly app: App) {
    this.current = currentLevelIndex(app.save, LEVEL_META);
    // open centred on the current level
    this.setScroll(levelNodeCentre(this.current).y - C.MAP_H * 0.5);
  }

  /** The path may scroll on until the last node clears the commander chip where it is drawn (FE-11: the bottom safe edge). */
  private maxScroll(): number {
    return levelMapMaxScroll(LEVEL_META.length, C.MAP_H + hudAnchors(this.app.view).bottom);
  }

  /**
   * FE-11: screen logical point → this screen's layout point (header + challenge card moved to the top
   * safe edge, the commander chip to the bottom one; the path as it is). Hit tests use this.
   */
  toLayout(x: number, y: number): { x: number; y: number } {
    return screenToBand(hudAnchors(this.app.view), levelMapBands(this.yesterday() !== null), x, y);
  }

  /** Where layout point (x, y) is drawn (e2e: `layoutToClient`). */
  fromLayout(x: number, y: number): { x: number; y: number } {
    return bandToScreen(hudAnchors(this.app.view), levelMapBands(this.yesterday() !== null), x, y);
  }

  /**
   * The header / card / chip rect under screen point `p`, each tested only in its own band (FE-11: on a
   * tall screen the path's layout range overlaps both), or null — then `p` is on the path.
   */
  private chromeAt(p: { x: number; y: number }): Rect | null {
    const bands = levelMapBands(this.yesterday() !== null);
    const band = bandAt(hudAnchors(this.app.view), bands, p.y);
    if (band === 'content') return null;
    const l = this.toLayout(p.x, p.y);
    // AUD-U23: the card's ▶ PLAY / ✓ DONE / LOCKED pill before the card it is drawn on (same action, its own press)
    const rects = band === 'bottom' ? [LEVEL_MAP.commander] : [BACK, LEVEL_MAP.wallet, LEVEL_MAP.dailyTabDaily, LEVEL_MAP.dailyTabWeekly, CHALLENGE_PLAY_HIT, LEVEL_MAP.daily];
    if (band === 'top' && this.yesterday()) rects.push(LEVEL_MAP.yesterday);
    // AUD-U1: padded tap areas; the tabs' and the "Yesterday's map" row's are their own rects (`…Hit`)
    return rects.find((r) => hitRect(this.app.view, OWN_HIT.get(r) ?? r, l.x, l.y)) ?? null;
  }

  setScroll(y: number): void {
    this.scroll = Math.max(levelMapMinScroll(this.yesterday() !== null), Math.min(this.maxScroll(), y));
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

  /**
   * Yesterday's challenge when its "Yesterday's map" row is up (DAILY-6, GDD §7.3): DAILY tab, the
   * daily unlocked and yesterday's key unwon (`yesterdayOffered`); else null.
   */
  yesterday(): DailyChallenge | null {
    const dayKey = this.app.dayKey();
    if (cardTab !== 'daily' || !yesterdayOffered(this.app.save, dayKey)) return null;
    const key = previousDayKey(dayKey);
    if (!this.yesterdayCh || this.yesterdayCh.dayKey !== key) this.yesterdayCh = challengeFor(key);
    return this.yesterdayCh;
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
    const countdown = challengeCountdown(remaining, localOffsetMin(now + remaining), false);
    const y = this.yesterday();
    const yMeta = y ? getLevelMeta(y.levelId) : undefined;
    return {
      unlocked: challengeUnlocked(save),
      unlockLevel: UNLOCK_AFTER_LEVEL,
      levelName: meta ? metaName(meta) : String(ch.levelId),
      twist: t(`daily.twist.${ch.twist.id}`),
      gold: goldReward(3),
      crystals: REWARD.crystals,
      streak: shownStreak(save, ch.dayKey),
      nextBonus: nextStreakMilestone(save, ch.dayKey),
      done: challengeDone(save, ch.dayKey),
      best: save.challenge.best[ch.dayKey] ?? null,
      countdown: countdown.full,
      countdownTime: countdown.time,
      tab: cardTab,
      weekly: this.weeklyCard(now),
      yesterday: y ? { levelName: yMeta ? metaName(yMeta) : String(y.levelId), twist: t(`daily.twist.${y.twist.id}`) } : null,
    };
  }

  /** The weekly face of the card (GDD §8.2): countdown to Monday 00:00 UTC in days + hours, hours + minutes, then MM:SS (shown local, AUD-U23). */
  private weeklyCard(now: number): WeeklyCardOpts {
    const w = this.thisWeeks();
    const save = this.app.save;
    const meta = getLevelMeta(w.levelId);
    const remaining = msToNextMonday(now);
    const countdown = challengeCountdown(remaining, localOffsetMin(now + remaining), true);
    return {
      unlocked: weeklyUnlocked(save),
      unlockLevel: WEEKLY_UNLOCK_AFTER_LEVEL,
      levelName: meta ? metaName(meta) : String(w.levelId),
      twist: t(`daily.twist.${w.twist.id}`),
      gold: WEEKLY_REWARD.gold,
      crystals: WEEKLY_REWARD.crystals,
      streak: shownWeekStreak(save, w.weekKey),
      done: weeklyDone(save, w.weekKey),
      target: weeklyTargetDone(save, w.weekKey),
      targetMs: w.targetMs,
      best: save.weekly.best[w.weekKey] ?? null,
      countdown: countdown.full,
      countdownTime: countdown.time,
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

  /** Tap on the "Yesterday's map" row: yesterday's level, seed and twist as practice (DAILY-6). */
  private tapYesterday(y: DailyChallenge): void {
    void this.app.startLevel(y.levelId, y.seed, { challenge: y, practice: true });
  }

  /** Momentum scroll for this frame (AUD-U18); either end stops it (hard clamp). */
  private stepFling(nowMs: number): void {
    const d = this.fling.step(nowMs, this.app.view.scale);
    if (d === 0) return;
    const want = this.scroll + d;
    this.setScroll(want);
    if (this.scroll !== want) this.fling.stop();
  }

  /** The fling is moving (debug / e2e). */
  get flinging(): boolean {
    return this.fling.moving;
  }

  draw(view: View, nowMs: number): void {
    this.nowMs = nowMs;
    if (!this.held) this.stepFling(nowMs);
    this.setScroll(this.scroll); // the "Yesterday's map" row may have gone (rollover, a win): re-clamp
    const sh = this.shake && nowMs - this.shake.at < SHAKE_MS ? this.shake : null;
    drawLevelSelect(view, this.app.palette(), {
      nodes: LEVEL_META.map((level, i) => ({
        id: level.id,
        name: metaName(level),
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
      shake: sh && { index: sh.index, dx: shakeOffset(nowMs - sh.at) },
    });
  }

  down(p: PointerPoint): void {
    this.held = true;
    this.downY = p.y;
    this.scrollAtDown = this.scroll;
    this.dragging = false;
    this.pressed = this.chromeAt(p);
    // AUD-U18: a press on the path while it glides stops it there and acts on nothing
    this.caught = this.fling.press(p.y, p.timeMs) && this.pressed === null;
  }

  move(p: PointerPoint): void {
    if (!this.held) return;
    this.fling.track(p.y, p.timeMs);
    if (Math.abs(p.y - this.downY) > dragThreshold(this.app.view.scale)) {
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
    if (wasDrag) {
      this.fling.release(p.y, p.timeMs, this.app.view.scale, prefersReducedMotion());
      return;
    }
    if (this.caught) return;
    // FE-11: the header block and the chip are hit-tested in layout space, each in its own band (they
    // move on a tall screen); the path's nodes with the plain logical point
    const hit = this.chromeAt(p);
    const y = this.yesterday();
    if (hit === BACK) {
      this.app.goTitle();
      return;
    }
    if (hit === LEVEL_MAP.wallet) {
      this.app.goShop('crystals', () => this.app.goLevels());
      return;
    }
    if (hit === LEVEL_MAP.commander) {
      this.app.goShop('upgrades', () => this.app.goLevels());
      return;
    }
    if (hit === LEVEL_MAP.dailyTabDaily || hit === LEVEL_MAP.dailyTabWeekly) {
      cardTab = hit === LEVEL_MAP.dailyTabWeekly ? 'weekly' : 'daily';
      this.setScroll(this.scroll); // the row comes and goes with the tab: re-clamp
      return;
    }
    if (hit === LEVEL_MAP.daily || hit === CHALLENGE_PLAY_HIT) {
      this.tapDaily();
      return;
    }
    if (y && hit === LEVEL_MAP.yesterday) {
      this.tapYesterday(y);
      return;
    }
    // under the header block and on / around the commander chip nothing else is tappable; the map's
    // nodes are, the ones that run on into the margins of a tall screen included (BUG-34, full bleed)
    if (bandAt(hudAnchors(this.app.view), levelMapBands(y !== null), p.y) !== 'content') return;
    for (let i = 0; i < LEVEL_META.length; i++) {
      const level = LEVEL_META[i];
      if (level && hitRect(this.app.view, levelNodeRect(i, this.scroll), p.x, p.y)) {
        if (isLevelUnlocked(this.app.save, LEVEL_META, i)) void this.app.startLevel(level.id);
        else this.lockedTap(i);
        return;
      }
    }
  }

  /**
   * AUD-U18: a locked node shakes for 200 ms (not under reduced motion) and the toast names the level
   * that opens it ("Clear level N to unlock", N = the node before it).
   */
  private lockedTap(i: number): void {
    const prev = LEVEL_META[i - 1];
    if (!prefersReducedMotion()) this.shake = { index: i, at: this.nowMs };
    this.toast.show(t('map.locked', { n: prev?.id ?? 1 }), 'error', this.nowMs);
  }

  wheel(dy: number): void {
    this.fling.stop();
    this.setScroll(this.scroll + dy);
  }

  cancel(): void {
    this.held = false;
    this.dragging = false;
    this.pressed = null;
    this.fling.stop();
  }

  key(e: KeyboardEvent): void {
    this.fling.stop();
    if (e.key === 'Escape') this.app.goTitle();
    else if (e.key === 'ArrowDown') this.setScroll(this.scroll + LEVEL_MAP.step);
    else if (e.key === 'ArrowUp') this.setScroll(this.scroll - LEVEL_MAP.step);
  }
}
