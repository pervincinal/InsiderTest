import type { Command, GameState } from '../sim/types';
import { C } from '../sim/constants';
import { capacityOf, linksFrom, maxLinksOf, relaysOnward } from '../sim/step';
import { roadIdFor } from '../sim/geometry';
import type { Palette } from '../render/palette';
import { TOWER_RADIUS, WORLD_ZOOM } from '../render/layout';
import { badgeY } from '../render/sprites';
import { font, roundRect } from '../render/widgets';
import type { Camera } from '../render/camera';
import { FLAT } from '../render/camera';
import type { TranslationKey } from './i18n';
import { t } from './i18n';

/*
 * First-play tutorial for levels 1–4 (M1-7, GD-5a/b): a pulsing ring + arrow on a tower (or on a
 * stream's ribbon) and a short instruction. Pure state machine (`Tutorial`) plus a pure renderer
 * (`drawTutorial`); the play screen feeds it the player's selection and commands and draws whatever
 * `current()` returns.
 */

/** Where a step's ring and arrow point instead of its tower (GD-5c): the lane midpoint of a player stream. */
export interface StreamAnchor {
  readonly kind: 'stream';
  readonly from: string;
  readonly to: string;
}

export interface TutorialStep {
  /** Hint in the current UI language (a getter over `t()`, so a language switch mid-level applies at once). */
  readonly text: string;
  /** Tower the ring/arrow points at, or a function of the state when the target moves (`stepTowerId`). */
  towerId: string | ((state: GameState) => string);
  /** Point at this player stream's ribbon instead of the tower (the tower is the fallback while it does not exist). */
  anchor?: StreamAnchor;
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
const ownerIs = (state: GameState, id: string, owner: string): boolean => state.towers[id]?.owner === owner;
/** Some player stream leaves `from`. */
const hasLinkFrom = (state: GameState, from: string): boolean => state.links.some((l) => l.owner === 'player' && l.from === from);
/** A player `link` command into `to` (from any tower). */
const isLinkInto = (cmd: Command, to: string): boolean => cmd.type === 'link' && cmd.owner === 'player' && cmd.to === to;
const anyPlayerL2 = (state: GameState): boolean => Object.values(state.towers).some((tw) => tw.owner === 'player' && tw.level >= 2);

/**
 * GD-5a step 4: the first own tower in id order (not `home`) that is full, streams onward and relays
 * (the sim's `relaysOnward`), when some other own tower with a lane to it, a free link slot and ≥ 1
 * unit could start a supply line into it; null otherwise.
 */
export function supplyLineTarget(state: GameState): string | null {
  for (const id of Object.keys(state.towers).sort()) {
    const tw = state.towers[id]!;
    if (id === 'home' || tw.owner !== 'player' || tw.units < capacityOf(tw, state) || !hasLinkFrom(state, id) || !relaysOnward(state, tw)) continue;
    for (const sid in state.towers) {
      const src = state.towers[sid]!;
      if (sid === id || src.owner !== 'player' || src.units < 1 || !state.roads[roadIdFor(sid, id)]) continue;
      const out = linksFrom(state, sid);
      if (out.length < maxLinksOf(src) && !out.some((l) => l.to === id)) return id;
    }
    return null;
  }
  return null;
}

/** GD-5b level 3: the grey tower still to take (`west` until only `east` is left neutral). */
const otherGrey = (state: GameState): string => (ownerIs(state, 'west', 'neutral') ? 'west' : 'east');

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
 * GDD §3 "first-time line" 11 (GD-5): a step never asks for an action the level's naive line or
 * reference player would not take at that moment, and the first target is the uncontested one.
 *   level 1  the stream: tap your tower, then a target — it keeps flowing.
 *   level 2  go around by the side tower (home → side, then side → foe), then — only once `side` is
 *            ours — swipe across home → side so home grows again (BUG-33; the second tap on the target
 *            still counts; the arrow points at the ribbon); then, only if an own full tower relays
 *            onward (the mid-first line, ≈ 33–35 s), stream into it: a supply line (rule 13). That last
 *            step is hidden otherwise and hidden steps never time out, so on the side-first line it
 *            simply never shows; when it comes up first it also clears the steps before it.
 *   level 3  take both free neutrals (`east`, then whichever grey tower is left).
 *   level 4  stop home's stream once the outpost is ours so home can grow, then the auto-upgrade at
 *            25 (L2 runs two streams).
 */
const STEPS_BY_LEVEL: Record<number, () => TutorialStep[]> = {
  1: () => [
    step('tutorial.tapTower', { towerId: 'home', onSelect: (sel) => sel === 'home' }),
    step('tutorial.tapGrey', { towerId: 'camp', onCommand: (cmd) => isLink(cmd, 'home', 'camp') }),
  ],
  2: () => [
    step('tutorial.tapThenGrey', {
      towerId: 'side',
      onCommand: (cmd) => isLink(cmd, 'home', 'side'),
      // the mid-first line at ×2 reaches a supply line (sim ≈ 33 s) before this step's 20 s timeout
      doneWhen: (s) => supplyLineTarget(s) !== null,
    }),
    step('tutorial.goAround', {
      towerId: 'foe',
      showWhen: (s) => ownerIs(s, 'side', 'player'),
      onCommand: (cmd) => isLink(cmd, 'side', 'foe'),
      // a supply-line situation (step 4) pre-empts the steps before it: the mid-first line reaches it without `side`
      doneWhen: (s) => hasLink(s, 'side', 'foe') || ownerIs(s, 'foe', 'player') || supplyLineTarget(s) !== null,
    }),
    step('tutorial.stopStream', {
      towerId: 'side',
      anchor: { kind: 'stream', from: 'home', to: 'side' },
      showWhen: (s) => ownerIs(s, 'side', 'player') && hasLink(s, 'home', 'side'),
      // any player stream into side counts, cut by a swipe or by a tap
      onCommand: (cmd, s) => stopsStreamInto(cmd, s, 'side'),
      // the stream may end on its own (target full): nothing left to teach then
      doneWhen: (s) => (ownerIs(s, 'side', 'player') && !hasLinkInto(s, 'side')) || supplyLineTarget(s) !== null,
    }),
    step('tutorial.supplyLine', {
      towerId: (s) => supplyLineTarget(s) ?? 'mid',
      showWhen: (s) => supplyLineTarget(s) !== null,
      onCommand: (cmd, s) => {
        const to = supplyLineTarget(s);
        return to !== null && isLinkInto(cmd, to);
      },
      doneWhen: (s) => s.links.some((l) => l.owner === 'player' && l.relay),
    }),
  ],
  3: () => [
    step('tutorial.tapThenGrey', { towerId: 'east', onCommand: (cmd) => isLink(cmd, 'home', 'east') || isLink(cmd, 'home', 'west') }),
    step('tutorial.grabOther', {
      towerId: otherGrey,
      showWhen: (s) => (ownerIs(s, 'west', 'player') && ownerIs(s, 'east', 'neutral')) || (ownerIs(s, 'east', 'player') && ownerIs(s, 'west', 'neutral')),
      onCommand: (cmd, s) => isLinkInto(cmd, otherGrey(s)),
      doneWhen: (s) => !ownerIs(s, 'west', 'neutral') && !ownerIs(s, 'east', 'neutral'),
    }),
  ],
  4: () => [
    step('tutorial.stopToGrow', {
      towerId: 'home',
      showWhen: (s) => ownerIs(s, 'outpost', 'player') && hasLinkFrom(s, 'home'),
      // a swipe cut or the second tap on the target: any player unlink of home's streams
      onCommand: (cmd) => cmd.type === 'unlink' && cmd.owner === 'player' && cmd.from === 'home',
      // home grew anyway, or its stream ended (target full) after the capture: nothing left to stop
      doneWhen: (s) => (s.towers['home']?.level ?? 1) >= 2 || (ownerIs(s, 'outpost', 'player') && !hasLinkFrom(s, 'home')),
    }),
    step('tutorial.fillToUpgrade', { towerId: 'home', showWhen: (s) => !hasLinkFrom(s, 'home'), doneWhen: anyPlayerL2 }, { n: C.CAPACITY[1] }),
  ],
};

/** The tower a step points at in this state (`towerId` may follow the state, e.g. level 3's other grey tower). */
export function stepTowerId(step: TutorialStep, state: GameState): string {
  return typeof step.towerId === 'function' ? step.towerId(state) : step.towerId;
}

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
/** Ring radius on a stream anchor's ribbon (the ribbon is 10 px wide, its glow 16). */
const STREAM_RING_PX = 26;

/** Lane midpoint of the anchor's player stream (map coordinates), or null when there is no anchor / no such stream. */
export function streamMidpoint(state: GameState, anchor: StreamAnchor | undefined): { x: number; y: number } | null {
  if (!anchor) return null;
  const link = state.links.find((l) => l.owner === 'player' && l.from === anchor.from && l.to === anchor.to);
  const pts = link ? state.roads[link.roadId]?.points : undefined;
  const a = pts?.[0];
  const b = pts?.[pts.length - 1];
  return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
}

/**
 * Draw the ring, arrow and hint for `step`. Expects the logical-map transform to be active; `cam` is
 * the play camera (ART-21): the tower stands at its projected anchor, scaled by depth. Under the
 * perspective camera, when the bubble above the tower would cover another tower (towers sit closer
 * together on the screen), `cam.tilt.tutorialSide` (perspective.ts, PERF-9 lazy chunk) moves it beside
 * the tower instead. A step with a stream anchor (GD-5c) rings the ribbon's lane midpoint and keeps
 * the bubble above it (below near the top edge) under either camera.
 */
export function drawTutorial(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, step: TutorialStep, nowMs: number, cam: Camera = FLAT): void {
  const tower = state.towers[stepTowerId(step, state)];
  if (!tower) return;
  const pulse = (Math.sin(nowMs / 220) + 1) / 2; // 0..1
  // GD-5c: a stream anchor puts the ring on the ribbon's lane midpoint (the tower while the stream is gone)
  const lane = streamMidpoint(state, step.anchor);
  // ART-21: the tower stands at its projected anchor, scaled by depth (play camera); the ring and the
  // arrow's offsets follow that size, the arrow and bubble keep their readable size
  const at = lane ? cam.proj(lane.x, lane.y) : cam.proj(tower.x, tower.y);
  const x = at.x;
  const y = at.y;
  const k = at.s;
  const ringR = lane ? (STREAM_RING_PX + pulse * 6) * k : (TOWER_RADIUS + 16 + pulse * 10) * k * WORLD_ZOOM.tower;

  ctx.save();
  // Pulsing ring
  ctx.strokeStyle = pal.star;
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.55 + 0.45 * (1 - pulse);
  ctx.beginPath();
  ctx.arc(x, y, ringR, 0, Math.PI * 2);
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
  const arrowTip = lane
    ? y + (below ? ringR + 6 + bob : -ringR - 6 - bob)
    : below
      ? y + (TOWER_RADIUS + 30) * k * WORLD_ZOOM.tower + bob
      : y + lift * k - 30 - bob;
  const arrowBase = below ? arrowTip + ARROW_H : arrowTip - ARROW_H;
  const w = Math.min(C.MAP_W - 24, textW + PAD_X * 2);
  const bx = Math.max(12, Math.min(C.MAP_W - 12 - w, x - w / 2));
  const by = below ? arrowBase + 16 : arrowBase - 16 - BUBBLE_H;
  ctx.fillStyle = pal.star;
  // the side bubble (perspective chunk) is laid out around a tower: a stream anchor keeps the bubble above / below
  if (!lane && cam.tilt?.tutorialSide(ctx, pal, state, tower, step.text, { x, y, k, bob }, { x: bx, y: Math.min(by, arrowTip), w, h: BUBBLE_H + ARROW_H + 16 })) {
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
