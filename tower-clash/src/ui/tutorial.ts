import type { Command, GameState } from '../sim/types';
import { C } from '../sim/constants';
import type { Palette } from '../render/palette';
import { HUD, TOWER_RADIUS } from '../render/layout';
import { badgeY } from '../render/sprites';
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
const PAD_X = 22;
const BUBBLE_H = 56;
const ARROW_H = 38;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const LINE_H = 30;
const SIDE_PAD_Y = 12;
const SIDE_MIN_W = 180;

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Greedy word wrap of `text` into lines no wider than `maxW` at the current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The hint bubble beside a tower (ART-21): on the side with more room, wrapped to fit it, vertically
 * centred on the tower's body (`cy`, `half` = its half width) and kept inside the play band; null when
 * no side has room or the bubble would cover another tower there too.
 */
function sideBubble(ctx: CanvasRenderingContext2D, text: string, x: number, cy: number, half: number, others: Box[]): { rect: Box; lines: string[]; right: boolean; tipX: number; cy: number } | null {
  const gap = 6;
  const leftRoom = x - half - gap - ARROW_H - 12 - 12;
  const rightRoom = C.MAP_W - 12 - (x + half + gap + ARROW_H + 12);
  const right = rightRoom >= leftRoom;
  const room = Math.min(C.MAP_W - 24, right ? rightRoom : leftRoom);
  if (room < SIDE_MIN_W) return null;
  const lines = wrap(ctx, text, room - PAD_X * 2);
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const w = Math.min(room, textW + PAD_X * 2);
  const h = lines.length * LINE_H + SIDE_PAD_Y * 2;
  const tipX = right ? x + half + gap : x - half - gap;
  const bx = right ? tipX + ARROW_H + 12 : tipX - ARROW_H - 12 - w;
  const by = Math.max(HUD_TOP_GAP, Math.min(cy - h / 2, HUD_BOTTOM_GAP - h));
  const rect = { x: bx, y: by, w, h };
  if (others.some((o) => overlaps(o, rect))) return null;
  return { rect, lines, right, tipX, cy };
}

/** The side bubble stays inside the play band, with a margin. */
const HUD_TOP_GAP = HUD.mapTop + 8;
const HUD_BOTTOM_GAP = HUD.mapBottom - 8;

/**
 * Draw the ring, arrow and hint for `step`. Expects the logical-map transform to be active; `project`
 * maps a map point to the screen with its depth scale (the play camera, ART-21); `avoidTowers` (the
 * camera is on) moves the bubble beside the tower when above it would cover another tower.
 */
export function drawTutorial(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, step: TutorialStep, nowMs: number, project: (x: number, y: number) => { x: number; y: number; s: number } = (x, y) => ({ x, y, s: 1 }), avoidTowers = false): void {
  const tower = state.towers[step.towerId];
  if (!tower) return;
  const pulse = (Math.sin(nowMs / 220) + 1) / 2; // 0..1
  // ART-21: the tower stands at its projected anchor, scaled by depth (play camera); the ring and the
  // arrow's offsets follow that size, the arrow and bubble keep their readable size
  const at = project(tower.x, tower.y);
  const x = at.x;
  const y = at.y;
  const k = at.s;

  ctx.save();
  // Pulsing ring
  ctx.strokeStyle = pal.star;
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.55 + 0.45 * (1 - pulse);
  ctx.beginPath();
  ctx.arc(x, y, (TOWER_RADIUS + 16 + pulse * 10) * k, 0, Math.PI * 2);
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
  const arrowTip = below ? y + (TOWER_RADIUS + 30) * k + bob : y + badgeY(tower.kind, tower.level) * k - 30 - bob;
  const arrowBase = below ? arrowTip + ARROW_H : arrowTip - ARROW_H;
  const w = Math.min(C.MAP_W - 24, textW + PAD_X * 2);
  const bx = Math.max(12, Math.min(C.MAP_W - 12 - w, x - w / 2));
  const by = below ? arrowBase + 16 : arrowBase - 16 - BUBBLE_H;
  const others: Box[] = [];
  for (const id in state.towers) {
    if (id === tower.id) continue;
    const o = state.towers[id]!;
    const p = project(o.x, o.y);
    others.push({ x: p.x - 44 * p.s, y: p.y + (badgeY(o.kind, o.level) - 20) * p.s, w: 88 * p.s, h: (20 - badgeY(o.kind, o.level)) * p.s });
  }
  const above: Box = { x: bx, y: Math.min(by, arrowTip), w, h: BUBBLE_H + ARROW_H + 16 };
  const side = avoidTowers && others.some((o) => overlaps(o, above)) ? sideBubble(ctx, step.text, x, y - 46 * k, 44 * k, others) : null;
  ctx.fillStyle = pal.star;
  if (side) {
    // horizontal arrow at the tower's body, the bubble beyond it
    const dir = side.right ? 1 : -1;
    const tip = side.tipX + dir * bob;
    const base = tip + dir * ARROW_H;
    const cy = side.cy;
    ctx.beginPath();
    ctx.moveTo(tip, cy);
    ctx.lineTo(base, cy - 20);
    ctx.lineTo(base, cy - 7);
    ctx.lineTo(base + dir * 12, cy - 7);
    ctx.lineTo(base + dir * 12, cy + 7);
    ctx.lineTo(base, cy + 7);
    ctx.lineTo(base, cy + 20);
    ctx.closePath();
    ctx.fill();
    const r = side.rect;
    roundRect(ctx, r, 14);
    ctx.fillStyle = pal.panel;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = pal.star;
    ctx.stroke();
    ctx.fillStyle = pal.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    side.lines.forEach((line, i) => ctx.fillText(line, r.x + r.w / 2, r.y + SIDE_PAD_Y + LINE_H * (i + 0.5) + 1, r.w - PAD_X));
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
