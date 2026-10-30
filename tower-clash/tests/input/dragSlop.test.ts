import { describe, expect, it } from 'vitest';
import type { Command, GameState, LevelDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import type { PointerPoint } from '../../src/input/pointer';
import { DRAG_SLOP_PT, PlayGestures, dragThreshold } from '../../src/input/pointer';

/*
 * AUD-U3: the tap / drag decision is made on the screen, not in layout px. A press becomes a drag (from
 * an own tower) or a swipe (from anywhere else) once it moved more than DRAG_SLOP_PT = 10 CSS px
 * (≈ the platforms' touch slop): 20 layout px on a 360-wide phone (scale 0.5), 10 at scale 1. It was
 * 14 layout px everywhere — 7 CSS px at 360 — so a jittery tap was silently lost. And a drag that is
 * released on its own start tower is a tap (select / deselect), not a no-op.
 */

function fixture(): GameState {
  const level: LevelDef = {
    id: 998,
    name: 'slop',
    lesson: 'slop',
    star3: 30_000,
    star2: 60_000,
    enemies: [{ owner: 'enemy1', personality: 'rusher', aggression: 0.5 }],
    towers: [
      { id: 'p', x: 200, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 200, y: 400, owner: 'enemy1', units: 10, level: 1 },
      { id: 'n', x: 520, y: 700, owner: 'neutral', units: 5 },
    ],
  };
  return createState(level, 1);
}

const pt = (x: number, y: number): PointerPoint => ({ id: 1, x, y, timeMs: 0 });

function gestures(state: GameState, scale: number): { g: PlayGestures; commands: Command[] } {
  const commands: Command[] = [];
  const g = new PlayGestures({ getState: () => state, onCommand: (c) => commands.push(c), viewScale: () => scale });
  return { g, commands };
}

/** Press at (x, y), move by `d` layout px to the right, lift there. */
function jitterTap(g: PlayGestures, x: number, y: number, d: number): void {
  g.down(pt(x, y));
  g.move(pt(x + d, y));
  g.up(pt(x + d, y));
}

describe('drag threshold in CSS px (AUD-U3)', () => {
  it('10 pt = 20 layout px at scale 0.5 (360 wide), ≈ 16.8 at 430 wide, 10 at scale 1', () => {
    expect(DRAG_SLOP_PT).toBe(10);
    expect(dragThreshold(0.5)).toBe(20);
    expect(dragThreshold(430 / 720)).toBeCloseTo(16.74, 2);
    expect(dragThreshold(1)).toBe(10);
  });

  it('scale 0.5: a 9 CSS px (18 layout px) jitter on a tower is still a tap — it selects; 11 CSS px is a drag', () => {
    const state = fixture();
    const { g } = gestures(state, 0.5);
    jitterTap(g, 200, 1000, 18);
    expect(g.selectedTowerId).toBe('p');
    // the same 18 px jitter on the neutral then streams to it (a tap on a target, not a swipe)
    const { g: g2, commands } = gestures(state, 0.5);
    jitterTap(g2, 200, 1000, 0);
    jitterTap(g2, 520, 700, 18);
    expect(commands).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);
    // 22 layout px = 11 CSS px: past the slop, a drag from p that ends on nothing
    const { g: g3 } = gestures(state, 0.5);
    g3.down(pt(200, 1000));
    g3.move(pt(222, 1000));
    expect(g3.dragging).toBe(true);
  });

  it('scale 1: the slop is 10 layout px — 9 is a tap, 11 a drag', () => {
    const state = fixture();
    const { g } = gestures(state, 1);
    g.down(pt(200, 1000));
    g.move(pt(209, 1000));
    expect(g.dragging).toBe(false);
    g.move(pt(211, 1000));
    expect(g.dragging).toBe(true);
  });

  it('a deselect tap on empty ground that jitters across a stream does not cut it (scale 0.5)', () => {
    const state = fixture();
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'n' });
    const { g, commands } = gestures(state, 0.5);
    // the p → n lane passes (360, 850); a 16 layout px (8 pt) wobble across it is a tap, not a swipe
    g.down(pt(352, 842));
    g.move(pt(364, 852));
    g.up(pt(364, 852));
    expect(commands).toEqual([]);
  });
});

describe('a drag released on its own start tower is a tap (AUD-U3)', () => {
  it('selects the tower; a second such drag deselects it; no command either time', () => {
    const state = fixture();
    const { g, commands } = gestures(state, 0.5);
    g.down(pt(200, 1000));
    g.move(pt(240, 1000)); // well past the slop: a drag with its rubber band
    expect(g.drag?.fromId).toBe('p');
    g.move(pt(205, 1004));
    g.up(pt(205, 1004)); // back on p
    expect(g.selectedTowerId).toBe('p');
    expect(g.drag).toBeNull();
    g.down(pt(200, 1000));
    g.move(pt(240, 1000));
    g.up(pt(198, 998));
    expect(g.selectedTowerId).toBeNull();
    expect(commands).toEqual([]);
  });

  it('a drag onto another tower still links; one released on empty ground still does nothing', () => {
    const state = fixture();
    const { g, commands } = gestures(state, 0.5);
    g.down(pt(200, 1000));
    g.move(pt(400, 800));
    g.up(pt(520, 700));
    expect(commands).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);
    expect(g.selectedTowerId).toBe('p');
    const { g: g2, commands: c2 } = gestures(state, 0.5);
    g2.down(pt(200, 1000));
    g2.move(pt(400, 1100));
    g2.up(pt(400, 1100));
    expect(c2).toEqual([]);
    expect(g2.selectedTowerId).toBeNull();
  });

  it('a platform cancel back on the start tower is not a tap (BUG-33: a cancel only finishes a drag onto a target)', () => {
    const state = fixture();
    const { g } = gestures(state, 0.5);
    g.down(pt(200, 1000));
    g.move(pt(240, 1000));
    g.cancel(pt(202, 1000));
    expect(g.selectedTowerId).toBeNull();
  });
});
