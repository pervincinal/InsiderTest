import type { Command, GameState, SimEvent } from '../sim/types';
import { C } from '../sim/constants';
import { applyCommand } from '../sim/commands';
import { step } from '../sim/step';
import { getOutcome } from '../sim/outcome';

export const MAX_TICKS_PER_FRAME = 10;

export interface LoopHooks {
  /** Called before every tick; returned commands are applied to the state before that tick (AI wiring). */
  beforeTick?(state: GameState): Command[] | undefined;
  /**
   * Receives every event of this frame after the last step: those emitted by the ticks and those
   * emitted by the commands applied before each tick (`linked` / `unlinked`).
   */
  onEvents?(events: SimEvent[]): void;
}

/**
 * Fixed-step accumulator. The caller drives it with real elapsed milliseconds (`advance`),
 * it runs whole C.TICK_MS ticks (at most MAX_TICKS_PER_FRAME) and leaves the remainder
 * in the accumulator so `alpha` can interpolate rendering between ticks.
 */
export class GameLoop {
  state: GameState | null = null;
  paused = false;
  speed = 1;
  private acc = 0;
  private pending: Command[] = [];

  constructor(private readonly hooks: LoopHooks = {}) {}

  load(state: GameState): void {
    this.state = state;
    this.acc = 0;
    this.pending = [];
    this.paused = false;
  }

  enqueue(cmd: Command): void {
    this.pending.push(cmd);
  }

  /** Fraction of a tick elapsed since the last step (0..1). */
  get alpha(): number {
    return Math.min(1, this.acc / C.TICK_MS);
  }

  get finished(): boolean {
    return this.state !== null && getOutcome(this.state) !== 'playing';
  }

  /** Advance by real time. Returns the number of ticks run. */
  advance(realDtMs: number): number {
    const state = this.state;
    if (!state || this.paused || this.finished) return 0;
    this.acc += Math.max(0, Math.min(realDtMs, 250)) * this.speed;
    let ticks = Math.floor(this.acc / C.TICK_MS);
    if (ticks <= 0) return 0;
    if (ticks > MAX_TICKS_PER_FRAME) {
      ticks = MAX_TICKS_PER_FRAME;
      this.acc = ticks * C.TICK_MS; // drop the backlog instead of spiralling
    }
    this.acc -= ticks * C.TICK_MS;

    // Commands issued since the last frame apply before the first step.
    if (this.pending.length) {
      for (const cmd of this.pending) applyCommand(state, cmd);
      this.pending = [];
    }

    const events: SimEvent[] = [];
    // Commands emit events too (`linked`, `unlinked`) and `step()` starts by resetting
    // `state.events`, so the list is drained right before every step as well as right after it.
    // Draining clears the state's list so the next pre-step drain never re-collects a tick's events.
    const drain = (): void => {
      if (!state.events.length) return;
      events.push(...state.events);
      state.events = [];
    };
    let ran = 0;
    for (let i = 0; i < ticks; i++) {
      const aiCmds = this.hooks.beforeTick?.(state);
      if (aiCmds) for (const cmd of aiCmds) applyCommand(state, cmd);
      drain();
      step(state, C.TICK_MS);
      ran++;
      drain();
      if (getOutcome(state) !== 'playing') {
        this.acc = 0;
        break;
      }
    }
    if (events.length) this.hooks.onEvents?.(events);
    return ran;
  }
}
