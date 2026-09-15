import type { Command, GameState } from '../sim/types';
import { C } from '../sim/constants';
import type { Palette } from '../render/palette';
import { TOWER_RADIUS } from '../render/layout';
import { font, roundRect } from '../render/widgets';
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
}

export class Tutorial {
  private index = 0;

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

  /** Call every frame with the current selection. */
  onSelect(selectedTowerId: string | null, state: GameState): void {
    const step = this.current(state);
    if (step?.onSelect?.(selectedTowerId, state)) this.advance();
  }

  private advance(): void {
    this.index++;
  }
}

const isSend = (cmd: Command, from: string, to: string): boolean =>
  cmd.type === 'sendUnits' && cmd.owner === 'player' && cmd.from === from && cmd.to === to;

/** A step whose `text` is translated on every read. */
function step(key: TranslationKey, rest: Omit<TutorialStep, 'text'>, params?: Record<string, number>): TutorialStep {
  return {
    ...rest,
    get text(): string {
      return t(key, params);
    },
  };
}

const STEPS_BY_LEVEL: Record<number, () => TutorialStep[]> = {
  1: () => [
    step('tutorial.tapTower', { towerId: 'home', onSelect: (sel) => sel === 'home' }),
    step('tutorial.tapGrey', { towerId: 'camp', onCommand: (cmd) => isSend(cmd, 'home', 'camp') }),
  ],
  2: () => [
    step('tutorial.tapThenGrey', { towerId: 'mid', onCommand: (cmd) => isSend(cmd, 'home', 'mid') }),
    step('tutorial.reinforce', {
      towerId: 'mid',
      showWhen: (s) => s.towers['mid']?.owner === 'player',
      onCommand: (cmd) => isSend(cmd, 'home', 'mid'),
    }),
  ],
  3: () => [
    step('tutorial.select', { towerId: 'home', onSelect: (sel) => sel === 'home' }),
    step('tutorial.upgrade', { towerId: 'home', onCommand: (cmd) => cmd.type === 'upgrade' && cmd.owner === 'player' }, { n: C.UPGRADE_COST[1] ?? 0 }),
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
const PAD_X = 22;
const BUBBLE_H = 56;
const ARROW_H = 38;

/** Draw the ring, arrow and hint for `step`. Expects the logical-map transform to be active. */
export function drawTutorial(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, step: TutorialStep, nowMs: number): void {
  const tower = state.towers[step.towerId];
  if (!tower) return;
  const pulse = (Math.sin(nowMs / 220) + 1) / 2; // 0..1
  const { x, y } = tower;

  ctx.save();
  // Pulsing ring
  ctx.strokeStyle = pal.star;
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.55 + 0.45 * (1 - pulse);
  ctx.beginPath();
  ctx.arc(x, y, TOWER_RADIUS + 16 + pulse * 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Bubble above the tower unless it is near the top edge, then below.
  const below = y < 300;
  const bob = pulse * 8;
  const arrowTip = below ? y + TOWER_RADIUS + 30 + bob : y - TOWER_RADIUS - 30 - bob;
  const arrowBase = below ? arrowTip + ARROW_H : arrowTip - ARROW_H;
  ctx.fillStyle = pal.star;
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

  ctx.font = font(HINT_PX);
  const textW = ctx.measureText(step.text).width;
  const w = Math.min(C.MAP_W - 24, textW + PAD_X * 2);
  const bx = Math.max(12, Math.min(C.MAP_W - 12 - w, x - w / 2));
  const by = below ? arrowBase + 16 : arrowBase - 16 - BUBBLE_H;
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
