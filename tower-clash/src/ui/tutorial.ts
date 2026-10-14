import type { Command, GameState } from '../sim/types';
import { C } from '../sim/constants';
import type { Palette } from '../render/palette';
import { TOWER_RADIUS, WORLD_ZOOM } from '../render/layout';
import { badgeY } from '../render/sprites';
import { font, roundRect } from '../render/widgets';
import type { Camera } from '../render/camera';
import { FLAT } from '../render/camera';
import type { TranslationKey } from './i18n';
import { t } from './i18n';

/*
 * First-play tutorial for levels 1–3 (M1-7): a pulsing ring + arrow on a tower and a short
 * instruction. Pure state machine (`Tutorial`) plus a pure renderer (`drawTutorial`); the play
 * screen feeds it the player's selection and commands and draws whatever `current()` returns.
 */

export interface TutorialStep {
  /** Hint in the current UI language (a getter over `t()`, so a language switch mid-level applies at once). */
  readonly text: string;
  /** Tower the ring/arrow points at. */
  towerId: string;
  /** Optional gate: the step stays hidden (and cannot complete) until this holds. */
  showWhen?(state: GameState): boolean;
  /** Completes on the first player command matching this predicate. */
  onCommand?(cmd: Command, state: GameState): boolean;
  /** Completes as soon as the selection matches. */
  onSelect?(selectedTowerId: string | null, state: GameState): boolean;
  /** Completes as soon as the sim state satisfies this (checked every frame, e.g. an auto-upgrade). */
  doneWhen?(state: GameState): boolean;
}

/**
 * Longest a step stays on screen without being completed (BUG-33): after this much visible play
 * time it gives way to the next step (or the tutorial ends), so a player who does not find the
 * gesture is never stuck under the bubble. Counted only while the step is drawn (not paused / gated).
 */
export const TUTORIAL_STEP_TIMEOUT_MS = 20_000;
/** Largest single frame counted toward the timeout (a stalled frame / background return is not "showing"). */
const MAX_FRAME_MS = 250;

export class Tutorial {
  private index = 0;
  /** Visible time of the current step, ms. */
  private shownMs = 0;

  constructor(readonly steps: readonly TutorialStep[]) {}

  get finished(): boolean {
    return this.index >= this.steps.length;
  }

  /** The step to display right now, or null when gated / finished. */
  current(state: GameState): TutorialStep | null {
    const step = this.steps[this.index];
    if (!step) return null;
    if (step.showWhen && !step.showWhen(state)) return null;
    return step;
  }

  /** Player issued a sim command (before it is applied). */
  onCommand(cmd: Command, state: GameState): void {
    const step = this.current(state);
    if (step?.onCommand?.(cmd, state)) this.advance();
  }

  /** Call every frame with the current selection (also settles the state-driven `doneWhen` steps). */
  onSelect(selectedTowerId: string | null, state: GameState): void {
    // `doneWhen` is checked on the raw step, before the `showWhen` gate (the two may exclude each other).
    if (this.steps[this.index]?.doneWhen?.(state)) {
      this.advance();
      return;
    }
    const step = this.current(state);
    if (step?.onSelect?.(selectedTowerId, state)) this.advance();
  }

  /** Real time passed with the game running: the current step times out after `TUTORIAL_STEP_TIMEOUT_MS` on screen. */
  elapse(dtMs: number, state: GameState): void {
    if (!this.current(state)) return;
    this.shownMs += Math.max(0, Math.min(MAX_FRAME_MS, dtMs));
    if (this.shownMs >= TUTORIAL_STEP_TIMEOUT_MS) this.advance();
  }

  private advance(): void {
    this.index++;
    this.shownMs = 0;
  }
}

const isLink = (cmd: Command, from: string, to: string): boolean =>
  cmd.type === 'link' && cmd.owner === 'player' && cmd.from === from && cmd.to === to;
const hasLink = (state: GameState, from: string, to: string): boolean =>
  state.links.some((l) => l.owner === 'player' && l.from === from && l.to === to);
/** Some player stream runs into `to`. */
const hasLinkInto = (state: GameState, to: string): boolean => state.links.some((l) => l.owner === 'player' && l.to === to);
/**
 * A player `unlink` that stops a stream into `to`: a named one (`to` given — a swipe cut or the second
 * tap), or "all links of `from`" when one of them runs into `to`. Checked before the sim applies it.
 */
const stopsStreamInto = (cmd: Command, state: GameState, to: string): boolean =>
  cmd.type === 'unlink' && cmd.owner === 'player' && (cmd.to === undefined ? hasLink(state, cmd.from, to) : cmd.to === to);

/** A step whose `text` is translated on every read. */
function step(key: TranslationKey, rest: Omit<TutorialStep, 'text'>, params?: Record<string, number>): TutorialStep {
  return {
    ...rest,
    get text(): string {
      return t(key, params);
    },
  };
}

/*
 * Rules v2 (GDD §2.0): level 1 teaches the stream (tap your tower, then a target — it keeps
 * flowing), level 2 how to stop one (swipe across it — BUG-33; the second tap on the target still
 * works and counts), level 3 the auto-upgrade (a tower that fills to its capacity gains a level; L2
 * can run two streams).
 */
const STEPS_BY_LEVEL: Record<number, () => TutorialStep[]> = {
  1: () => [
    step('tutorial.tapTower', { towerId: 'home', onSelect: (sel) => sel === 'home' }),
    step('tutorial.tapGrey', { towerId: 'camp', onCommand: (cmd) => isLink(cmd, 'home', 'camp') }),
  ],
  2: () => [
    step('tutorial.tapThenGrey', { towerId: 'mid', onCommand: (cmd) => isLink(cmd, 'home', 'mid') }),
    step('tutorial.stopStream', {
      towerId: 'mid',
      showWhen: (s) => hasLinkInto(s, 'mid'),
      // any player stream into mid counts (home→mid or side→mid), cut by a swipe or by a tap
      onCommand: (cmd, s) => stopsStreamInto(cmd, s, 'mid'),
      // the stream may end on its own (target full): nothing left to teach then
      doneWhen: (s) => s.towers['mid']?.owner === 'player' && !hasLinkInto(s, 'mid'),
    }),
  ],
  3: () => [
    step(
      'tutorial.fillToUpgrade',
      { towerId: 'home', doneWhen: (s) => Object.values(s.towers).some((tw) => tw.owner === 'player' && tw.level >= 2) },
      { n: C.CAPACITY[1] },
    ),
  ],
};

/** Tutorial for a level, or null when the level has none or was already cleared (stars ≥ 1). */
export function tutorialFor(levelId: number, stars: number): Tutorial | null {
  if (stars >= 1) return null;
  const make = STEPS_BY_LEVEL[levelId];
  return make ? new Tutorial(make()) : null;
}

/* ---------- rendering ---------- */

const HINT_PX = 24;
export const PAD_X = 22;
const BUBBLE_H = 56;
export const ARROW_H = 38;

/**
 * Draw the ring, arrow and hint for `step`. Expects the logical-map transform to be active; `cam` is
 * the play camera (ART-21): the tower stands at its projected anchor, scaled by depth. Under the
 * perspective camera, when the bubble above the tower would cover another tower (towers sit closer
 * together on the screen), `cam.tilt.tutorialSide` (perspective.ts, PERF-9 lazy chunk) moves it beside
 * the tower instead.
 */
export function drawTutorial(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, step: TutorialStep, nowMs: number, cam: Camera = FLAT): void {
  const tower = state.towers[step.towerId];
  if (!tower) return;
  const pulse = (Math.sin(nowMs / 220) + 1) / 2; // 0..1
  // ART-21: the tower stands at its projected anchor, scaled by depth (play camera); the ring and the
  // arrow's offsets follow that size, the arrow and bubble keep their readable size
  const at = cam.proj(tower.x, tower.y);
  const x = at.x;
  const y = at.y;
  const k = at.s;

  ctx.save();
  // Pulsing ring
  ctx.strokeStyle = pal.star;
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.55 + 0.45 * (1 - pulse);
  ctx.beginPath();
  ctx.arc(x, y, (TOWER_RADIUS + 16 + pulse * 10) * k * WORLD_ZOOM.tower, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Bubble above the tower unless it is near the top edge, then below. Above, the arrow points at
  // the unit-count badge from above it, so neither the arrow nor the bubble covers the number
  // (BUG-35: "the text sits on top of it"). ART-21: when that would cover another tower (towers sit
  // closer together on the screen under the camera), the bubble moves beside the tower instead —
  // to the roomier side, text wrapped, the arrow pointing sideways at the tower's body.
  const below = y < 300;
  const bob = pulse * 8;
  ctx.font = font(HINT_PX);
  const textW = ctx.measureText(step.text).width;
  // ART-24: offsets from the zoomed building and its zoomed badge (draw.ts `badgeLift`)
  const lift = (badgeY(tower.kind, tower.level) + 18) * WORLD_ZOOM.tower - 18 * WORLD_ZOOM.badge;
  const arrowTip = below ? y + (TOWER_RADIUS + 30) * k * WORLD_ZOOM.tower + bob : y + lift * k - 30 - bob;
  const arrowBase = below ? arrowTip + ARROW_H : arrowTip - ARROW_H;
  const w = Math.min(C.MAP_W - 24, textW + PAD_X * 2);
  const bx = Math.max(12, Math.min(C.MAP_W - 12 - w, x - w / 2));
  const by = below ? arrowBase + 16 : arrowBase - 16 - BUBBLE_H;
  ctx.fillStyle = pal.star;
  if (cam.tilt?.tutorialSide(ctx, pal, state, tower, step.text, { x, y, k, bob }, { x: bx, y: Math.min(by, arrowTip), w, h: BUBBLE_H + ARROW_H + 16 })) {
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x, arrowTip);
  ctx.lineTo(x - 20, arrowBase);
  ctx.lineTo(x - 7, arrowBase);
  ctx.lineTo(x - 7, below ? arrowBase + 12 : arrowBase - 12);
  ctx.lineTo(x + 7, below ? arrowBase + 12 : arrowBase - 12);
  ctx.lineTo(x + 7, arrowBase);
  ctx.lineTo(x + 20, arrowBase);
  ctx.closePath();
  ctx.fill();

  roundRect(ctx, { x: bx, y: by, w, h: BUBBLE_H }, 14);
  ctx.fillStyle = pal.panel;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = pal.star;
  ctx.stroke();
  ctx.fillStyle = pal.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(step.text, bx + w / 2, by + BUBBLE_H / 2 + 1, w - PAD_X);
  ctx.restore();
}
