/**
 * "How to play" card (FE-3): the five rules of v3 on one card, each an icon and one sentence
 * (`howto.1` … `howto.5`). Reached from the settings screen and from the pause menu; CLOSE, BACK,
 * ESC / Enter and the platform back button return to whoever opened it (`back`). No state of its
 * own beyond the pressed button. Loaded lazily with its drawing (PERF-1, src/ui/lazyScreens.ts).
 */
import type { View } from '../render/view';
import { HOWTO } from '../render/menuLayout';
import type { Rect } from '../render/widgets';
import { inRect } from '../render/widgets';
import { drawHowTo } from '../render/menusHowto';
import type { PointerPoint } from '../input/pointer';
import { playSfx } from '../audio/index';
import type { App, Screen } from './screens';

export class HowToScreen implements Screen {
  readonly name = 'howto' as const;
  private pressed: Rect | null = null;

  constructor(
    private readonly app: App,
    private readonly back: () => void,
  ) {}

  draw(view: View, nowMs: number): void {
    drawHowTo(view, this.app.palette(), { nowMs, pressed: this.pressed });
  }

  private rects(): readonly Rect[] {
    return [HOWTO.back, HOWTO.close];
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
    playSfx('button');
    this.back();
  }

  cancel(): void {
    this.pressed = null;
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') this.back();
  }
}
