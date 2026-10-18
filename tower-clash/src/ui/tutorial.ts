import type { Command, GameState } from '../sim/types';
import type { TranslationKey } from './i18n';
import { t } from './i18n';

/*
 * First-play tutorial for levels 1–4 (M1-7, GD-5a/b): a pulsing ring + arrow on a tower (or on a
 * stream's ribbon) and a short instruction. Pure state machine (`Tutorial`); the play screen feeds it
 * the player's selection and commands and paints whatever `current()` returns through
 * render/tutorialDraw.ts (the GD-5c bubble placement, a lazy chunk). Level 1's steps are eager; levels
 * 2–4 arrive with the lazy tutorialSteps chunk (PERF-10, src/ui/tutorialChunk.ts).
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
  /** This step teaches the supply line: a relay link made while it is on screen raises no `hint.supplyLine` (GD-5f). */
  supplyLine?: true;
  /**
   * BUG-50 / BUG-51: the selection the step's instruction assumes — applied by the play screen once,
   * the first frame the step is on screen with no press under way (`null` = deselect; a tower that is
   * not the player's deselects too). Leaving the previous step's selection in place made an obeyed
   * instruction cut a stream (level 2) or hit the link limit (level 3).
   */
  select?(state: GameState): string | null;
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

/** A player `link` command `from` → `to`. */
export const isLink = (cmd: Command, from: string, to: string): boolean =>
  cmd.type === 'link' && cmd.owner === 'player' && cmd.from === from && cmd.to === to;

/** A step whose `text` is translated on every read (shared with ./tutorialSteps.ts). */
export function step(key: TranslationKey, rest: Omit<TutorialStep, 'text'>, params?: Record<string, number>): TutorialStep {
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
 * Levels 2–4 (go around + swipe-cut + supply line; both greys; stop → fill → L2) are a lazy chunk,
 * ./tutorialSteps.ts (PERF-10), registered here by `registerTutorialSteps` when it arrives
 * (./tutorialChunk.ts). Level 1 stays eager: the first launch never waits for a second fetch.
 */
const STEPS_BY_LEVEL: Record<number, () => TutorialStep[]> = {
  1: () => [
    step('tutorial.tapTower', { towerId: 'home', onSelect: (sel) => sel === 'home' }),
    step('tutorial.tapGrey', { towerId: 'camp', onCommand: (cmd) => isLink(cmd, 'home', 'camp') }),
  ],
};

/** Add the lazily loaded step tables (./tutorialSteps.ts `LATE_STEPS`; tests/setup.ts registers them directly). */
export function registerTutorialSteps(more: Readonly<Record<number, () => TutorialStep[]>>): void {
  Object.assign(STEPS_BY_LEVEL, more);
}

/** The tower a step points at in this state (`towerId` may follow the state, e.g. level 3's other grey tower). */
export function stepTowerId(step: TutorialStep, state: GameState): string {
  return typeof step.towerId === 'function' ? step.towerId(state) : step.towerId;
}

/**
 * Tutorial for a level, or null when the level has none, was already cleared (stars ≥ 1) or its steps
 * are not loaded yet (levels 2–4 before the tutorial-steps chunk is in: the play screen asks again).
 */
export function tutorialFor(levelId: number, stars: number): Tutorial | null {
  if (stars >= 1) return null;
  const make = STEPS_BY_LEVEL[levelId];
  return make ? new Tutorial(make()) : null;
}

/* ---------- stream anchors (GD-5c): the ring and arrow of a step can point at a ribbon instead of a tower ---------- */

/** Lane midpoint of the anchor's player stream (map coordinates), or null when there is no anchor / no such stream. */
export function streamMidpoint(state: GameState, anchor: StreamAnchor | undefined): { x: number; y: number } | null {
  if (!anchor) return null;
  const link = state.links.find((l) => l.owner === 'player' && l.from === anchor.from && l.to === anchor.to);
  const pts = link ? state.roads[link.roadId]?.points : undefined;
  const a = pts?.[0];
  const b = pts?.[pts.length - 1];
  return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
}
