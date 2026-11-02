import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import { FLAT } from '../../src/render/camera';
import type { PlayUi } from '../../src/render/draw';
import { drawGroundMarks } from '../../src/render/draw';
import { setReducedMotionOverride } from '../../src/ui/motion';
import { makeLevel } from '../helpers';

/*
 * AUD-F12 (ART_DIRECTION §4 "Press state"): from `pointerdown` on an own tower until lift / cancel /
 * the drag threshold, that tower shows its drag-source ring (r 56) at 50 % alpha — the frame
 * the finger lands changes, while the selection itself still happens on `up`. Only the pressed tower
 * (on the selected one the half ring lies over its own); reduced motion draws the same (a state, not motion).
 */

interface Call {
  fn: string;
  args: unknown[];
  stroke: unknown;
  alpha: number;
}

function recCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  let store: Record<string | symbol, unknown> = { globalAlpha: 1 };
  const stack: Record<string | symbol, unknown>[] = [];
  const calls: Call[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'save') return () => void stack.push({ ...store });
      if (key === 'restore') return () => void (store = stack.pop() ?? store);
      if (key in store) return store[key];
      return (...args: unknown[]) => void calls.push({ fn: String(key), args, stroke: store.strokeStyle, alpha: store.globalAlpha as number });
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
  return { ctx, calls };
}

function board(): GameState {
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 200, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'q', x: 520, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
      ],
    }),
    1,
  );
}

function ui(state: GameState, selectedTowerId: string | null, pressedTowerId: string | null): PlayUi {
  return {
    level: makeLevel(),
    palette: DEFAULT_PALETTE,
    alpha: 0,
    selectedTowerId,
    hoverTowerId: null,
    pressedTowerId,
    paused: false,
    outcome: 'playing',
    stars: 0,
    hasNext: true,
    speed: 1,
    coinsEarned: 0,
    coinsTotal: 0,
  };
}

/** The gold ring strokes (the ring's 7 px gold line) by tower centre x, with the alpha they were drawn at. */
function goldRings(state: GameState, sel: string | null, pressed: string | null): { x: number; alpha: number; r: number }[] {
  const { ctx, calls } = recCtx();
  drawGroundMarks(ctx, DEFAULT_PALETTE, state, ui(state, sel, pressed), 0, FLAT);
  const out: { x: number; alpha: number; r: number }[] = [];
  let last: Call | null = null;
  for (const c of calls) {
    if (c.fn === 'ellipse') last = c;
    if (c.fn === 'stroke' && c.stroke === DEFAULT_PALETTE.gold && last) out.push({ x: last.args[0] as number, alpha: c.alpha, r: last.args[2] as number });
  }
  return out;
}

afterEach(() => {
  setReducedMotionOverride(null);
  vi.restoreAllMocks();
});

describe('AUD-F12: the pressed own tower shows its ring at half alpha', () => {
  it('nothing pressed, nothing selected: no ring', () => {
    expect(goldRings(board(), null, null)).toEqual([]);
  });

  it('pressed p: one ring, at p only, the drag-source size (r 56) at 50 % alpha', () => {
    const state = board();
    expect(goldRings(state, null, 'p')).toEqual([{ x: state.towers.p!.x, alpha: 0.5, r: 56 }]);
  });

  it('pressed p while q is selected: q full, p half; pressing the selected tower lays the half ring over its own', () => {
    const state = board();
    const rings = goldRings(state, 'q', 'p');
    expect(rings.map((r) => [r.x, r.alpha])).toEqual([
      [state.towers.q!.x, 1],
      [state.towers.p!.x, 0.5],
    ]);
    expect(goldRings(state, 'q', 'q').map((r) => [r.x, r.alpha])).toEqual([
      [state.towers.q!.x, 1],
      [state.towers.q!.x, 0.5],
    ]);
  });

  it('reduced motion draws the same press ring (a state, not motion)', () => {
    setReducedMotionOverride(true);
    vi.spyOn(performance, 'now').mockReturnValue(1e9); // past draw.ts's 500 ms reduced-motion recheck
    const state = board();
    expect(goldRings(state, null, 'p')).toEqual([{ x: state.towers.p!.x, alpha: 0.5, r: 56 }]);
  });
});
