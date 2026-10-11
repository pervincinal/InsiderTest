import { describe, expect, it } from 'vitest';
import type { Command, GameState, LevelDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import type { PointerHandlers, PointerPoint } from '../../src/input/pointer';
import { PlayGestures, SWIPE_LANE_TRIM, attachPointer, segmentsIntersect, streamsCrossed } from '../../src/input/pointer';
import { SWIPE_TRAIL_MS } from '../../src/render/layout';
import type { View } from '../../src/render/view';

/*
 * BUG-33 (GDD §2.0b rule 8, 2026-10-11): swipe across an own stream = cut it; a drag from an own
 * tower still links; a platform `pointercancel` mid-drag from an own tower finishes the drag at the
 * finger's last position; the canvas swallows `touchstart` / `touchmove` (non-passive) so iOS
 * WKWebView never turns a pan into a scroll.
 */

/**
 * Player `p` (200, 1000) and `q` (520, 1000), neutral `n` (200, 600), enemy `e` (520, 400).
 * Lanes: every pair is clear (no obstacles, no tower within 48 px of another pair's segment).
 */
function fixture(): GameState {
  const level: LevelDef = {
    id: 998,
    name: 'swipe',
    lesson: 'swipe',
    star3: 30_000,
    star2: 60_000,
    enemies: [{ owner: 'enemy1', personality: 'rusher', aggression: 0.5 }],
    towers: [
      { id: 'p', x: 200, y: 1000, owner: 'player', units: 10, level: 2 },
      { id: 'q', x: 520, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'n', x: 200, y: 600, owner: 'neutral', units: 5 },
      { id: 'e', x: 520, y: 400, owner: 'enemy1', units: 10, level: 1 },
    ],
  };
  return createState(level, 1);
}

const link = (state: GameState, owner: 'player' | 'enemy1', from: string, to: string): void =>
  applyCommand(state, { type: 'link', owner, from, to });

describe('segmentsIntersect', () => {
  it('detects proper crossings, touching ends and collinear overlap; rejects near misses', () => {
    const o = { x: 0, y: 0 };
    expect(segmentsIntersect(o, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true); // X
    expect(segmentsIntersect(o, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 })).toBe(true); // T (touching end)
    expect(segmentsIntersect(o, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 })).toBe(true); // collinear overlap
    expect(segmentsIntersect(o, { x: 10, y: 0 }, { x: 11, y: 0 }, { x: 15, y: 0 })).toBe(false); // collinear, apart
    expect(segmentsIntersect(o, { x: 10, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 5 })).toBe(false); // stops 1 px short
    expect(segmentsIntersect(o, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBe(false); // parallel
  });
});

describe('streamsCrossed (pure decision)', () => {
  it('returns only player streams whose trimmed lane the swipe segment crosses', () => {
    const state = fixture();
    link(state, 'player', 'p', 'n'); // vertical x = 200, y 1000 → 600
    link(state, 'player', 'q', 'e'); // vertical x = 520, y 1000 → 400
    link(state, 'enemy1', 'e', 'n'); // a foreign stream is never cut
    expect(state.links).toHaveLength(3);
    // horizontal swipe at y = 800 across both player lanes (and under the enemy one)
    expect(streamsCrossed(state, { x: 100, y: 800 }, { x: 640, y: 800 })).toEqual([
      { from: 'p', to: 'n' },
      { from: 'q', to: 'e' },
    ]);
    // only the left lane
    expect(streamsCrossed(state, { x: 150, y: 800 }, { x: 260, y: 790 })).toEqual([{ from: 'p', to: 'n' }]);
    // a swipe that runs beside a lane without crossing it
    expect(streamsCrossed(state, { x: 240, y: 700 }, { x: 240, y: 900 })).toEqual([]);
    // the enemy stream e → n is crossed geometrically by this segment, but it is not the player's
    expect(streamsCrossed(state, { x: 360, y: 450 }, { x: 380, y: 560 })).toEqual([]);
  });

  it('ignores the last SWIPE_LANE_TRIM px at each end (grazing a tower is not a cut)', () => {
    const state = fixture();
    link(state, 'player', 'p', 'n');
    expect(SWIPE_LANE_TRIM).toBeGreaterThan(0);
    const nearTarget = 600 + SWIPE_LANE_TRIM - 4; // inside the target's trim
    expect(streamsCrossed(state, { x: 150, y: nearTarget }, { x: 250, y: nearTarget })).toEqual([]);
    const justOut = 600 + SWIPE_LANE_TRIM + 4;
    expect(streamsCrossed(state, { x: 150, y: justOut }, { x: 250, y: justOut })).toEqual([{ from: 'p', to: 'n' }]);
    const nearSource = 1000 - SWIPE_LANE_TRIM + 4;
    expect(streamsCrossed(state, { x: 150, y: nearSource }, { x: 250, y: nearSource })).toEqual([]);
  });

  it('no links → nothing to cut', () => {
    expect(streamsCrossed(fixture(), { x: 0, y: 800 }, { x: 720, y: 800 })).toEqual([]);
  });
});

function harness(state: GameState) {
  const commands: Command[] = [];
  const g = new PlayGestures({
    getState: () => state,
    onCommand: (cmd) => commands.push(cmd), // enqueued like the play screen: the sim applies it on its next tick
  });
  let now = 1000;
  const pt = (x: number, y: number): PointerPoint => ({ id: 1, x, y, timeMs: now });
  const at = (id: string): PointerPoint => pt(state.towers[id]!.x, state.towers[id]!.y);
  const step = (ms = 16): void => {
    now += ms;
  };
  return { g, commands, pt, at, step, clock: () => now };
}

describe('PlayGestures swipe-to-cut', () => {
  it('a swipe from empty ground cuts every player stream it crosses, live during the move, once per stream', () => {
    const state = fixture();
    link(state, 'player', 'p', 'n');
    link(state, 'player', 'q', 'e');
    const { g, commands, pt, step } = harness(state);
    g.down(pt(100, 800));
    step();
    g.move(pt(110, 800)); // under the drag threshold: nothing yet
    expect(commands).toEqual([]);
    step();
    g.move(pt(300, 800)); // crosses p → n
    expect(commands).toEqual([{ type: 'unlink', owner: 'player', from: 'p', to: 'n' }]);
    step();
    g.move(pt(150, 820)); // back across p → n: already cut by this swipe
    step();
    g.move(pt(300, 830));
    expect(commands).toHaveLength(1);
    step();
    g.move(pt(640, 840)); // crosses q → e
    expect(commands).toEqual([
      { type: 'unlink', owner: 'player', from: 'p', to: 'n' },
      { type: 'unlink', owner: 'player', from: 'q', to: 'e' },
    ]);
    g.up(pt(640, 840));
    expect(commands).toHaveLength(2);
    expect(g.selectedTowerId).toBeNull(); // a swipe is not a tap: the selection does not change
    for (const c of commands) expect(c.owner).toBe('player');
  });

  it('cuts on the final piece too when the finger lifts without a last move there', () => {
    const state = fixture();
    link(state, 'player', 'p', 'n');
    const { g, commands, pt, step } = harness(state);
    g.down(pt(100, 800));
    step();
    g.move(pt(140, 800)); // past the threshold, short of the lane
    expect(commands).toEqual([]);
    step();
    g.up(pt(300, 800));
    expect(commands).toEqual([{ type: 'unlink', owner: 'player', from: 'p', to: 'n' }]);
  });

  it('a swipe that starts on a neutral or enemy tower cuts too; a new swipe may cut the same stream again', () => {
    const state = fixture();
    link(state, 'player', 'q', 'e');
    const { g, commands, at, pt, step } = harness(state);
    g.down(at('n')); // neutral tower
    step();
    g.move(pt(640, 700)); // n (200,600) → (640,700) crosses q → e at x = 520
    expect(commands).toEqual([{ type: 'unlink', owner: 'player', from: 'q', to: 'e' }]);
    g.up(pt(640, 700));
    // the sim has not applied it yet (still in state.links): a second swipe sends it again — harmless, the sim ignores a missing link
    g.down(pt(640, 760));
    step();
    g.move(pt(400, 760));
    expect(commands).toHaveLength(2);
    g.up(pt(400, 760));
  });

  it('a drag that starts on an own tower still links and never cuts the streams it crosses', () => {
    const state = fixture();
    link(state, 'player', 'q', 'e');
    const { g, commands, at, pt, step } = harness(state);
    g.down(at('p'));
    step();
    g.move(pt(360, 800));
    step();
    g.move(pt(640, 700)); // crosses q → e (x = 520)
    step();
    g.move(at('e'));
    g.up(at('e'));
    expect(commands).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'e' }]);
    expect(g.trail).toEqual([]); // no slash trail for a link drag
  });

  it('a tap (no move past the threshold) on empty ground cuts nothing, even on a lane', () => {
    const state = fixture();
    link(state, 'player', 'p', 'n');
    const { g, commands, pt, step } = harness(state);
    g.down(pt(195, 800));
    step();
    g.move(pt(205, 800)); // 10 px: under the 14 px threshold, crosses the lane
    g.up(pt(205, 800));
    expect(commands).toEqual([]);
  });

  it('the slash trail grows with the swipe and fades: points older than SWIPE_TRAIL_MS are dropped by tick', () => {
    const state = fixture();
    const { g, pt, step, clock } = harness(state);
    g.down(pt(100, 300));
    step();
    g.move(pt(160, 300));
    step();
    g.move(pt(220, 300));
    expect(g.trail.map((p) => p.x)).toEqual([100, 160, 220]);
    g.up(pt(220, 300));
    g.tick(clock() + SWIPE_TRAIL_MS - 1);
    expect(g.trail.length).toBeGreaterThan(0);
    g.tick(clock() + SWIPE_TRAIL_MS);
    expect(g.trail).toEqual([]);
    g.reset();
    expect(g.trail).toEqual([]);
  });
});

describe('PlayGestures.cancel (BUG-33: pointercancel mid-drag = up at the last move point)', () => {
  it('a platform cancel mid-drag from an own tower finishes the link at the given point', () => {
    const state = fixture();
    const { g, commands, at, pt, step } = harness(state);
    g.down(at('p'));
    step();
    g.move(pt(200, 800));
    step();
    g.move(at('n'));
    expect(g.hoverTowerId).toBe('n');
    g.cancel(at('n'));
    expect(commands).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);
    expect(g.selectedTowerId).toBe('p');
    expect(g.hoverTowerId).toBeNull();
  });

  it('a cancel without a point (pause, HUD) or before the drag threshold stays a plain cancel', () => {
    const state = fixture();
    const { g, commands, at, pt, step } = harness(state);
    g.down(at('p'));
    step();
    g.move(at('n'));
    g.cancel(); // pause / HUD takeover
    expect(commands).toEqual([]);
    g.down(at('p'));
    step();
    g.move(pt(205, 1000)); // 5 px: a press, not a drag
    g.cancel(pt(205, 1000));
    expect(commands).toEqual([]);
    expect(g.selectedTowerId).toBeNull(); // a cancelled press is not a tap either
    // nothing is left half-pressed: the next tap works normally
    g.down(at('p'));
    g.up(at('p'));
    expect(g.selectedTowerId).toBe('p');
  });

  it('a cancel during a swipe keeps the cuts already made and sends nothing more', () => {
    const state = fixture();
    link(state, 'player', 'p', 'n');
    const { g, commands, pt, step } = harness(state);
    g.down(pt(100, 800));
    step();
    g.move(pt(300, 800));
    expect(commands).toHaveLength(1);
    g.cancel(pt(300, 800));
    expect(commands).toHaveLength(1);
    expect(g.dragging).toBe(false);
  });
});

/* ---------- attachPointer (DOM adapter) with a fake canvas ---------- */

type Listener = (e: unknown) => void;
function fakeCanvas() {
  const listeners = new Map<string, { fn: Listener; opts: unknown }[]>();
  const canvas = {
    addEventListener(type: string, fn: Listener, opts?: unknown) {
      const list = listeners.get(type) ?? [];
      list.push({ fn, opts });
      listeners.set(type, list);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((l) => l.fn !== fn),
      );
    },
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  const fire = (type: string, e: Record<string, unknown>) => {
    for (const l of listeners.get(type) ?? []) l.fn({ preventDefault() {}, ...e });
  };
  return { canvas, listeners, fire };
}

describe('attachPointer', () => {
  const view = (canvas: unknown): View => ({ canvas, scale: 1, offsetX: 0, offsetY: 0 }) as unknown as View;

  it('registers non-passive touchstart / touchmove that preventDefault (iOS WKWebView never scrolls)', () => {
    const { canvas, listeners } = fakeCanvas();
    const detach = attachPointer(canvas as unknown as HTMLCanvasElement, view(canvas), {});
    for (const type of ['touchstart', 'touchmove']) {
      const l = listeners.get(type)!;
      expect(l, type).toHaveLength(1);
      expect(l[0]!.opts).toEqual({ passive: false });
      let prevented = 0;
      l[0]!.fn({ cancelable: true, preventDefault: () => prevented++ });
      expect(prevented, type).toBe(1);
    }
    expect(listeners.get('touchend') ?? [], 'touchend keeps its user-activation role').toEqual([]);
    detach();
    expect(listeners.get('touchstart')).toEqual([]);
    expect(listeners.get('touchmove')).toEqual([]);
  });

  it('pointercancel reports the last move point, not the cancel event coordinates', () => {
    const { canvas, fire } = fakeCanvas();
    const seen: string[] = [];
    const handlers: PointerHandlers = {
      down: (p) => seen.push(`down ${p.x},${p.y}`),
      move: (p) => seen.push(`move ${p.x},${p.y}`),
      cancel: (p) => seen.push(`cancel ${p.x},${p.y}`),
    };
    attachPointer(canvas as unknown as HTMLCanvasElement, view(canvas), handlers);
    fire('pointerdown', { pointerId: 7, clientX: 10, clientY: 20 });
    fire('pointermove', { pointerId: 7, clientX: 50, clientY: 60 });
    fire('pointermove', { pointerId: 8, clientX: 999, clientY: 999 }); // another finger: ignored
    fire('pointercancel', { pointerId: 7, clientX: 0, clientY: 0 });
    expect(seen).toEqual(['down 10,20', 'move 50,60', 'cancel 50,60']);
    // a cancel right after the down (no move) reports the down point
    seen.length = 0;
    fire('pointerdown', { pointerId: 9, clientX: 30, clientY: 40 });
    fire('pointercancel', { pointerId: 9, clientX: 0, clientY: 0 });
    expect(seen).toEqual(['down 30,40', 'cancel 30,40']);
  });
});
