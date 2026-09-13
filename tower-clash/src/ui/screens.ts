import type { GameState, LevelDef } from '../sim/types';
import { C } from '../sim/constants';
import { LEVELS } from '../levels/index';
import type { Palette } from '../render/palette';
import type { View } from '../render/view';
import { applyDeviceTransform, applyTransform, clipToMap } from '../render/view';
import { LEVEL_MAP, RESULT, SETTINGS, TITLE, levelMapMaxScroll, levelNodeCentre, levelNodeRect } from '../render/layout';
import type { Rect } from '../render/widgets';
import { inRect, segmentAt } from '../render/widgets';
import { MOTION_SEGMENTS, RATIO_SEGMENTS, drawLevelSelect, drawSettings, drawTitle } from '../render/menus';
import type { PointerPoint } from '../input/pointer';
import type { PlayUi } from '../render/draw';
import { drawGame } from '../render/draw';
import type { SaveData } from './save';
import { isLevelUnlocked, resetProgress, writeSave } from './save';
import { applyMotionPref } from './motion';
import { isMuted, playSfx, toggleMuted } from '../audio/index';

/** A screen owns drawing and input while it is current. */
export interface Screen {
  readonly name: 'title' | 'levelSelect' | 'play' | 'result' | 'settings';
  enter?(): void;
  exit?(): void;
  update?(dtMs: number, nowMs: number): void;
  draw(view: View, nowMs: number): void;
  down?(p: PointerPoint): void;
  move?(p: PointerPoint): void;
  up?(p: PointerPoint): void;
  cancel?(): void;
  key?(e: KeyboardEvent): void;
  /** Mouse wheel / trackpad scroll in logical px (positive = content moves up). */
  wheel?(dy: number): void;
}

/** What screens may ask of the application shell. */
export interface App {
  readonly view: View;
  readonly save: SaveData;
  palette(): Palette;
  goTitle(): void;
  goLevels(): void;
  startLevel(levelId: number): void;
  go(screen: Screen): void;
  /** Open the settings screen; BACK returns to `from` (title, or the paused play screen). */
  openSettings(from: Screen): void;
  /** Sim speed multiplier for this and future levels (pause-menu toggle, debug). */
  setSpeed(n: number): void;
}

/** Fill the letterbox and the map background, and leave the context in logical units + clipped. */
export function beginMapFrame(view: View, pal: Palette): void {
  const ctx = view.ctx;
  applyDeviceTransform(view);
  ctx.fillStyle = pal.letterbox;
  ctx.fillRect(0, 0, view.cssW, view.cssH);
  ctx.save();
  applyTransform(view);
  clipToMap(view);
  ctx.fillStyle = pal.background;
  ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
}

export function endMapFrame(view: View): void {
  view.ctx.restore();
}

/* ---------- Title ---------- */

export const TITLE_PLAY: Rect = TITLE.play;
export const TITLE_SETTINGS: Rect = TITLE.settings;
export const TITLE_SOUND: Rect = TITLE.sound;

export class TitleScreen implements Screen {
  readonly name = 'title' as const;
  private pressed: Rect | null = null;
  constructor(private readonly app: App) {}

  draw(view: View, nowMs: number): void {
    const total = Object.values(this.app.save.stars).reduce((a, b) => a + b, 0);
    drawTitle(view, this.app.palette(), {
      playRect: TITLE_PLAY,
      settingsRect: TITLE_SETTINGS,
      soundRect: TITLE_SOUND,
      soundOn: !isMuted(),
      totalStars: total,
      coins: this.app.save.coins,
      nowMs,
      pressed: this.pressed,
    });
  }

  private hit(p: PointerPoint): Rect | null {
    for (const r of [TITLE_PLAY, TITLE_SETTINGS, TITLE_SOUND]) if (inRect(r, p.x, p.y)) return r;
    return null;
  }

  down(p: PointerPoint): void {
    this.pressed = this.hit(p);
  }

  move(p: PointerPoint): void {
    if (this.pressed && !inRect(this.pressed, p.x, p.y)) this.pressed = null;
  }

  up(p: PointerPoint): void {
    this.pressed = null;
    if (inRect(TITLE_PLAY, p.x, p.y)) this.app.goLevels();
    else if (inRect(TITLE_SETTINGS, p.x, p.y)) this.app.openSettings(this);
    else if (inRect(TITLE_SOUND, p.x, p.y)) toggleMuted(); // persists settings.sound via the audio facade
  }

  cancel(): void {
    this.pressed = null;
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') this.app.goLevels();
  }
}

/* ---------- Settings (M3-3) ---------- */

/**
 * Sound, colour-blind palette, reduced motion (auto/on/off override), default send ratio and a
 * two-step reset of the progress. Every change persists immediately; BACK returns to the screen
 * that opened it (title, or the paused play screen).
 */
export class SettingsScreen implements Screen {
  readonly name = 'settings' as const;
  private pressed: Rect | null = null;
  private confirming = false;

  constructor(
    private readonly app: App,
    private readonly back: () => void,
  ) {}

  get isConfirming(): boolean {
    return this.confirming;
  }

  draw(view: View, nowMs: number): void {
    const s = this.app.save.settings;
    const total = Object.values(this.app.save.stars).reduce((a, b) => a + b, 0);
    drawSettings(view, this.app.palette(), {
      soundOn: !isMuted(),
      colorBlind: s.colorBlind,
      reducedMotion: s.reducedMotion,
      sendRatio: s.sendRatio,
      confirming: this.confirming,
      totalStars: total,
      coins: this.app.save.coins,
      nowMs,
      pressed: this.pressed,
    });
  }

  private rects(): Rect[] {
    if (this.confirming) return [SETTINGS.confirm.yes, SETTINGS.confirm.no];
    return [SETTINGS.back, SETTINGS.sound, SETTINGS.colorBlind, SETTINGS.motion, SETTINGS.sendRatio, SETTINGS.reset];
  }

  down(p: PointerPoint): void {
    this.pressed = this.rects().find((r) => inRect(r, p.x, p.y)) ?? null;
  }

  move(p: PointerPoint): void {
    if (this.pressed && !inRect(this.pressed, p.x, p.y)) this.pressed = null;
  }

  up(p: PointerPoint): void {
    const hit = this.pressed;
    this.pressed = null;
    if (!hit || !inRect(hit, p.x, p.y)) return;
    const save = this.app.save;
    if (this.confirming) {
      if (hit === SETTINGS.confirm.yes) resetProgress(save);
      this.confirming = false;
      playSfx('button');
      return;
    }
    if (hit === SETTINGS.back) {
      this.back();
      return;
    }
    if (hit === SETTINGS.sound) {
      toggleMuted();
      playSfx('button');
      return;
    }
    playSfx('button');
    if (hit === SETTINGS.colorBlind) {
      save.settings.colorBlind = !save.settings.colorBlind;
    } else if (hit === SETTINGS.motion) {
      const seg = MOTION_SEGMENTS[segmentAt(SETTINGS.motion, MOTION_SEGMENTS.length, p.x, p.y)];
      if (seg) {
        save.settings.reducedMotion = seg.value;
        applyMotionPref(seg.value);
      }
    } else if (hit === SETTINGS.sendRatio) {
      const seg = RATIO_SEGMENTS[segmentAt(SETTINGS.sendRatio, RATIO_SEGMENTS.length, p.x, p.y)];
      if (seg) save.settings.sendRatio = seg.value;
    } else if (hit === SETTINGS.reset) {
      this.confirming = true;
      return;
    }
    writeSave(save);
  }

  cancel(): void {
    this.pressed = null;
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.confirming) this.confirming = false;
      else this.back();
    }
  }
}

/* ---------- Level select: winding path map ---------- */

const BACK = LEVEL_MAP.back;

/** Index of the level the player is "on": first unlocked level without a clear, else the last. */
export function currentLevelIndex(save: SaveData): number {
  for (let i = 0; i < LEVELS.length; i++) {
    const level = LEVELS[i]!;
    if (isLevelUnlocked(save, LEVELS, i) && (save.stars[String(level.id)] ?? 0) === 0) return i;
  }
  return Math.max(0, LEVELS.length - 1);
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

  constructor(private readonly app: App) {
    this.current = currentLevelIndex(app.save);
    // open centred on the current level
    this.setScroll(levelNodeCentre(this.current).y - C.MAP_H * 0.5);
  }

  private maxScroll(): number {
    return levelMapMaxScroll(LEVELS.length, C.MAP_H);
  }

  setScroll(y: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll(), y));
  }

  getScroll(): number {
    return this.scroll;
  }

  draw(view: View, nowMs: number): void {
    drawLevelSelect(view, this.app.palette(), {
      nodes: LEVELS.map((level, i) => ({
        id: level.id,
        name: level.name,
        stars: this.app.save.stars[String(level.id)] ?? 0,
        unlocked: isLevelUnlocked(this.app.save, LEVELS, i),
      })),
      current: this.current,
      scroll: this.scroll,
      backRect: BACK,
      coins: this.app.save.coins,
      nowMs,
      pressed: this.pressed,
    });
  }

  down(p: PointerPoint): void {
    this.held = true;
    this.downY = p.y;
    this.scrollAtDown = this.scroll;
    this.dragging = false;
    this.pressed = inRect(BACK, p.x, p.y) ? BACK : null;
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
    if (p.y < LEVEL_MAP.headerH) return;
    for (let i = 0; i < LEVELS.length; i++) {
      const level = LEVELS[i];
      if (level && inRect(levelNodeRect(i, this.scroll), p.x, p.y)) {
        if (isLevelUnlocked(this.app.save, LEVELS, i)) this.app.startLevel(level.id);
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

/* ---------- Result ---------- */

export interface ResultInfo {
  state: GameState;
  level: LevelDef;
  ui: PlayUi;
}

/** Shows the frozen final frame under the win/lose overlay (drawn by drawGame). */
export class ResultScreen implements Screen {
  readonly name = 'result' as const;
  constructor(
    private readonly app: App,
    readonly info: ResultInfo,
  ) {}

  draw(view: View, nowMs: number): void {
    drawGame(view.ctx, this.info.state, view, this.info.ui, nowMs);
  }

  up(p: PointerPoint): void {
    const { ui, level } = this.info;
    if (inRect(RESULT.retry, p.x, p.y)) this.app.startLevel(level.id);
    else if (inRect(RESULT.menu, p.x, p.y)) this.app.goLevels();
    else if (inRect(RESULT.next, p.x, p.y) && ui.outcome === 'won' && ui.hasNext) {
      const idx = LEVELS.findIndex((l) => l.id === level.id);
      const next = LEVELS[idx + 1];
      if (next) this.app.startLevel(next.id);
    }
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.app.goLevels();
    else if (e.key === 'Enter') {
      const { ui, level } = this.info;
      if (ui.outcome === 'won' && ui.hasNext) {
        const idx = LEVELS.findIndex((l) => l.id === level.id);
        const next = LEVELS[idx + 1];
        if (next) this.app.startLevel(next.id);
      } else this.app.startLevel(level.id);
    }
  }
}
