/**
 * "How to play" card (FE-3): the six rules of v3 on one card, each an icon and one sentence
 * (`howto.1` … `howto.6`; GD-5f added the swipe to `howto.2` and the supply line as `howto.6`). Reached from the settings screen and from the pause menu; CLOSE, BACK,
 * ESC / Enter and the platform back button return to whoever opened it (`back`). No state of its
 * own beyond the pressed button. Loaded lazily with its drawing (PERF-1, src/ui/lazyScreens.ts).
 */
import type { View } from '../render/view';
import { hudAnchors } from '../render/view';
import { HOWTO, HOWTO_BANDS, bandAt, bandToScreen, screenToBand } from '../render/menuLayout';
import type { Rect } from '../render/widgets';
import { inRect } from '../render/widgets';
import { drawHowTo } from '../render/menusHowto';
import type { PointerPoint } from '../input/pointer';
import { playSfx } from '../audio/index';
import type { App, Screen } from './screens';

export class HowToScreen implements Screen {
  readonly name = 'howto' as const;
  private pressed: Rect | null = null;
  /** Wrapped line count of each rule at the last draw, before the 3-line cut (e2e: `getHowtoLines`). */
  lines: readonly number[] = [];

  constructor(
    private readonly app: App,
    private readonly back: () => void,
  ) {}

  draw(view: View, nowMs: number): void {
    this.lines = drawHowTo(view, this.app.palette(), { nowMs, pressed: this.pressed });
  }

  /**
   * BACK or CLOSE under screen point `p`, each tested in its own band (FE-11: on a tall screen the
   * stretched card's layout range overlaps CLOSE's rect), or null.
   */
  private buttonAt(p: { x: number; y: number }): Rect | null {
    const band = bandAt(hudAnchors(this.app.view), HOWTO_BANDS, p.y);
    const r = band === 'top' ? HOWTO.back : band === 'bottom' ? HOWTO.close : null;
    const l = this.toLayout(p.x, p.y);
    return r && inRect(r, l.x, l.y) ? r : null;
  }

  /** FE-11: screen logical point → layout point (BACK moves up with the header, CLOSE down to the bottom safe edge). */
  toLayout(x: number, y: number): { x: number; y: number } {
    return screenToBand(hudAnchors(this.app.view), HOWTO_BANDS, x, y);
  }

  /** Where layout point (x, y) is drawn (e2e: `layoutToClient`). */
  fromLayout(x: number, y: number): { x: number; y: number } {
    return bandToScreen(hudAnchors(this.app.view), HOWTO_BANDS, x, y);
  }

  down(p: PointerPoint): void {
    this.pressed = this.buttonAt(p);
  }

  move(p: PointerPoint): void {
    if (this.pressed && this.buttonAt(p) !== this.pressed) this.pressed = null;
  }

  up(p: PointerPoint): void {
    const hit = this.pressed;
    this.pressed = null;
    if (!hit || this.buttonAt(p) !== hit) return;
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
