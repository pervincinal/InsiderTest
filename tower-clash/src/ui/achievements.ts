/**
 * Achievements screen (ECON-4): every catalog achievement with a progress bar and its crystal
 * reward; unlocked rows are marked. Entering re-evaluates the save (a migrated save with 3★ levels
 * gets its star goals paid here). Loaded lazily with its drawing (PERF-1, src/ui/lazyScreens.ts).
 */
import type { View } from '../render/view';
import { hudAnchors } from '../render/view';
import { ACHIEVEMENTS_BANDS, ACHIEVEMENTS_LAYOUT, achievementRowRect, achievementsMaxScroll, bandToScreen, screenToBand } from '../render/menuLayout';
import type { Rect } from '../render/widgets';
import { hitRect } from '../render/widgets';
import { dragThreshold } from '../input/pointer';
import type { AchievementRow } from '../render/menusAchievements';
import { drawAchievements } from '../render/menusAchievements';
import type { PointerPoint } from '../input/pointer';
import { playSfx } from '../audio/index';
import { ACHIEVEMENTS } from '../economy/catalog';
import { achievementName } from './catalogText';
import { achievementCrystalsEarned, achievementProgress, evaluateAchievements } from '../economy/achievements';
import type { App, Screen } from './screens';
import { Toast, achievementToastText } from './screens';

export class AchievementsScreen implements Screen {
  readonly name = 'achievements' as const;
  private scroll = 0;
  private downY = 0;
  private scrollAtDown = 0;
  private held = false;
  private dragging = false;
  private pressed: Rect | null = null;
  private nowMs = 0;
  readonly toast = new Toast();

  constructor(
    private readonly app: App,
    private readonly back: () => void = () => app.goTitle(),
  ) {}

  enter(): void {
    const text = achievementToastText(evaluateAchievements(this.app.save));
    if (text) {
      playSfx('upgrade');
      this.toast.show(text, 'ok', performance.now(), 3500);
    }
  }

  rows(): AchievementRow[] {
    return achievementProgress(this.app.save).map((p, i) => ({ ...p, label: achievementName(p), rect: achievementRowRect(i) }));
  }

  /** The rows' viewport grows by the room a tall screen adds (FE-11), so the list scrolls less. */
  private maxScroll(): number {
    const a = hudAnchors(this.app.view);
    return achievementsMaxScroll(ACHIEVEMENTS.length, a.bottom - a.top);
  }

  /** FE-11: screen logical point → layout point (header, summary and rows follow the header up on a tall screen). */
  toLayout(x: number, y: number): { x: number; y: number } {
    return screenToBand(hudAnchors(this.app.view), ACHIEVEMENTS_BANDS, x, y);
  }

  /** Where layout point (x, y) is drawn (e2e: `layoutToClient`). */
  fromLayout(x: number, y: number): { x: number; y: number } {
    return bandToScreen(hudAnchors(this.app.view), ACHIEVEMENTS_BANDS, x, y);
  }

  setScroll(y: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll(), y));
  }

  draw(view: View, nowMs: number): void {
    this.nowMs = nowMs;
    this.setScroll(this.scroll); // the viewport grows / shrinks with the screen's height (FE-11): re-clamp
    const save = this.app.save;
    drawAchievements(view, this.app.palette(), {
      rows: this.rows(),
      unlockedCount: save.achievements.unlocked.length,
      total: ACHIEVEMENTS.length,
      crystalsEarned: achievementCrystalsEarned(save),
      scroll: this.scroll,
      backRect: ACHIEVEMENTS_LAYOUT.back,
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
    const l = this.toLayout(p.x, p.y);
    this.pressed = hitRect(this.app.view, ACHIEVEMENTS_LAYOUT.back, l.x, l.y) ? ACHIEVEMENTS_LAYOUT.back : null;
  }

  move(p: PointerPoint): void {
    if (!this.held) return;
    if (Math.abs(p.y - this.downY) > dragThreshold(this.app.view.scale)) {
      this.dragging = true;
      this.pressed = null;
    }
    if (this.dragging) this.setScroll(this.scrollAtDown - (p.y - this.downY));
  }

  up(p: PointerPoint): void {
    const hit = this.pressed;
    this.pressed = null;
    const wasDrag = this.dragging;
    this.held = false;
    this.dragging = false;
    if (wasDrag) return;
    const l = this.toLayout(p.x, p.y);
    if (hit === ACHIEVEMENTS_LAYOUT.back && hitRect(this.app.view, hit, l.x, l.y)) this.back();
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
    if (e.key === 'Escape') this.back();
    else if (e.key === 'ArrowDown') this.setScroll(this.scroll + 120);
    else if (e.key === 'ArrowUp') this.setScroll(this.scroll - 120);
  }
}
