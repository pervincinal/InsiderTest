import { describe, expect, it } from 'vitest';
import type { Command, GameState, LevelDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { C } from '../../src/sim/constants';
import type { PointerPoint } from '../../src/input/pointer';
import { LINK_REPEAT_GUARD_MS, PlayGestures, SWIPE_LANE_TRIM } from '../../src/input/pointer';
import { SWIPE_TRAIL_MS, TOWER_HIT_RADIUS } from '../../src/render/layout';

/*
 * AUD-U8 (GDD §4 "AUD-U8 2026-11-02"): a drag that starts on an own tower and is released on empty
 * ground (no tower under the finger, so no snap) is read as a swipe: every player stream its path
 * crossed is cut on release (one `unlink` per stream, the slash trail), so "slash across my stream next
 * to my tower" works although it starts inside the tower's hit disc. Released on a tower it links as
 * before and cuts nothing; released on its start tower it is a tap (AUD-U3); enemy streams are never
 * cut; the AUD-U6 double-tap guard is unchanged (and, like the swipe, never guards a cut).
 */

/** Player `p` (L2) and `q`, neutral `n` above `p`, enemy `e` above `q`; every pair has a clear lane. */
function fixture(): GameState {
  const level: LevelDef = {
    id: 996,
    name: 'dragCut',
    lesson: 'dragCut',
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

function harness(state: GameState) {
  const sent: Command[] = [];
  const queue: Command[] = [];
  const g = new PlayGestures({
    getState: () => state,
    onCommand: (cmd) => {
      sent.push(cmd);
      queue.push(cmd); // the play screen enqueues; the sim applies it on its next tick
    },
  });
  let now = 1000;
  const pt = (x: number, y: number): PointerPoint => ({ id: 1, x, y, timeMs: now });
  const at = (id: string): PointerPoint => pt(state.towers[id]!.x, state.towers[id]!.y);
  const tick = (): void => {
    for (const c of queue.splice(0)) applyCommand(state, c);
  };
  /** Advance the pointer clock by `ms`, running the sim's tick when a whole one falls in it. */
  const wait = (ms = 16): void => {
    now += ms;
    if (ms >= C.TICK_MS) tick();
  };
  const tap = (id: string): void => {
    g.down(at(id));
    g.up(at(id));
  };
  return { g, sent, pt, at, tick, wait, tap, clock: () => now };
}

const link = (state: GameState, owner: 'player' | 'enemy1', from: string, to: string): void =>
  applyCommand(state, { type: 'link', owner, from, to });
const streams = (state: GameState): string[] => state.links.filter((l) => l.owner === 'player').map((l) => `${l.from}>${l.to}`);

/** On `p`'s hit disc, right of its stream to `n` (x = 200): 50 px from the centre. */
const ON_P = { x: 240, y: 970 };
/** Left of the p → n lane: the piece ON_P → ACROSS crosses it at y ≈ 955, 45 px out of `p`. */
const ACROSS = { x: 160, y: 940 };
/** Empty ground beyond: no tower within its hit radius. */
const GROUND = { x: 120, y: 900 };

describe('AUD-U8: a drag from an own tower released on empty ground cuts the own streams it crossed', () => {
  it('the geometry: ON_P is on p, GROUND on nothing, and the crossing is past the lane trim', () => {
    expect(Math.hypot(ON_P.x - 200, ON_P.y - 1000)).toBeLessThan(TOWER_HIT_RADIUS);
    expect(Math.hypot(GROUND.x - 200, GROUND.y - 1000)).toBeGreaterThan(TOWER_HIT_RADIUS);
    expect(1000 - 955).toBeGreaterThan(SWIPE_LANE_TRIM);
  });

  it('the slash next to the tower: no cut while dragging (band up), one unlink on release, the slash trail, the selection kept', () => {
    const state = fixture();
    link(state, 'player', 'p', 'n');
    const { g, sent, pt, tick, wait, clock } = harness(state);
    g.down(pt(ON_P.x, ON_P.y));
    wait();
    g.move(pt(ACROSS.x, ACROSS.y));
    expect(g.drag).toMatchObject({ fromId: 'p' }); // a drag from the own tower: the rubber band shows
    expect(g.hoverTowerId).toBeNull();
    expect(sent).toEqual([]); // not cut yet: the release decides
    expect(g.trail).toEqual([]); // no live slash trail behind a drag
    wait();
    g.move(pt(230, 920)); // back across p → n: one stream, one cut
    wait();
    g.move(pt(GROUND.x, GROUND.y));
    expect(sent).toEqual([]);
    g.up(pt(GROUND.x, GROUND.y));
    expect(sent).toEqual([{ type: 'unlink', owner: 'player', from: 'p', to: 'n' }]);
    expect(g.drag).toBeNull();
    expect(g.selectedTowerId).toBeNull(); // as a swipe: the selection does not change
    // the drag's path becomes the slash trail, fading from the release
    expect(g.trail.map((q) => [q.x, q.y])).toEqual([
      [ON_P.x, ON_P.y],
      [ACROSS.x, ACROSS.y],
      [230, 920],
      [GROUND.x, GROUND.y],
    ]);
    expect(new Set(g.trail.map((q) => q.t))).toEqual(new Set([clock()]));
    g.tick(clock() + SWIPE_TRAIL_MS - 1);
    expect(g.trail).toHaveLength(4);
    g.tick(clock() + SWIPE_TRAIL_MS);
    expect(g.trail).toEqual([]);
    tick();
    expect(streams(state)).toEqual([]);
  });

  it('cuts every own stream the path crossed (any own tower), each once; the last piece to the release counts', () => {
    const state = fixture();
    link(state, 'player', 'p', 'n');
    link(state, 'player', 'q', 'e'); // x = 520, y 1000 → 400
    const { g, sent, pt, wait } = harness(state);
    g.down(pt(ON_P.x, ON_P.y));
    wait();
    g.move(pt(360, 800)); // right of both lanes' start: crosses neither
    wait();
    g.move(pt(600, 800)); // across q → e
    expect(sent).toEqual([]);
    g.up(pt(GROUND.x, 800)); // the lift's own piece runs back across both lanes
    expect(sent).toEqual([
      { type: 'unlink', owner: 'player', from: 'q', to: 'e' },
      { type: 'unlink', owner: 'player', from: 'p', to: 'n' },
    ]);
  });

  it('released on a target it links as before and cuts nothing (no trail)', () => {
    const state = fixture();
    link(state, 'player', 'p', 'n');
    const { g, sent, pt, at, tick, wait } = harness(state);
    g.down(pt(ON_P.x, ON_P.y));
    wait();
    g.move(pt(ACROSS.x, ACROSS.y)); // across p → n
    wait();
    g.move(at('e'));
    expect(g.hoverTowerId).toBe('e'); // snapped
    g.up(at('e'));
    expect(sent).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'e' }]);
    expect(g.trail).toEqual([]);
    expect(g.selectedTowerId).toBe('p');
    tick();
    expect(streams(state)).toEqual(['p>n', 'p>e']);
  });

  it('released on a tower it cannot link to (the stream exists) is still not a cut', () => {
    const state = fixture();
    link(state, 'player', 'p', 'n');
    const { g, sent, pt, at, wait } = harness(state);
    g.down(pt(ON_P.x, ON_P.y));
    wait();
    g.move(pt(ACROSS.x, ACROSS.y));
    wait();
    g.move(at('n'));
    g.up(at('n')); // a drag onto an existing stream: a no-op, as before
    expect(sent).toEqual([]);
    expect(streams(state)).toEqual(['p>n']);
  });

  it('released back on its start tower it is a tap (AUD-U3): select, then deselect — never a cut', () => {
    const state = fixture();
    link(state, 'player', 'p', 'n');
    const { g, sent, pt, wait } = harness(state);
    for (const selected of ['p', null]) {
      g.down(pt(ON_P.x, ON_P.y));
      wait();
      g.move(pt(ACROSS.x, ACROSS.y)); // across p → n …
      wait();
      g.move(pt(215, 1010)); // … and back onto p
      g.up(pt(215, 1010));
      expect(g.selectedTowerId).toBe(selected);
    }
    expect(sent).toEqual([]);
    expect(g.trail).toEqual([]);
  });

  it('an enemy stream is never cut; a drag that crosses no own stream cuts nothing', () => {
    const state = fixture();
    link(state, 'enemy1', 'e', 'q'); // x = 520, y 400 → 1000
    expect(state.links).toHaveLength(1);
    const { g, sent, at, pt, wait } = harness(state);
    g.down(at('p'));
    wait();
    g.move(pt(400, 900));
    wait();
    g.move(pt(620, 800)); // across e → q
    g.up(pt(620, 800));
    expect(sent).toEqual([]);
    expect(g.trail).toEqual([]);
    expect(state.links).toHaveLength(1);
  });

  it('a platform cancel over empty ground finishes the drag as a cut; a cancel without a point (pause) cuts nothing', () => {
    const state = fixture();
    link(state, 'player', 'p', 'n');
    const { g, sent, pt, wait } = harness(state);
    g.down(pt(ON_P.x, ON_P.y));
    wait();
    g.move(pt(GROUND.x, GROUND.y));
    g.cancel(); // pause / HUD takeover
    expect(sent).toEqual([]);
    g.down(pt(ON_P.x, ON_P.y));
    wait();
    g.move(pt(GROUND.x, GROUND.y));
    g.cancel(pt(GROUND.x, GROUND.y)); // pointercancel: as if lifted at the last point (BUG-33)
    expect(sent).toEqual([{ type: 'unlink', owner: 'player', from: 'p', to: 'n' }]);
  });

  it('AUD-U6 still holds: the bounce tap is ignored; the drag-cut, like the swipe, is never guarded', () => {
    const state = fixture();
    const { g, sent, pt, tap, tick, wait } = harness(state);
    tap('p');
    wait(100);
    tap('n'); // link p → n
    tick();
    wait(60);
    tap('n'); // a bounce under LINK_REPEAT_GUARD_MS: ignored
    expect(sent).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);
    expect(streams(state)).toEqual(['p>n']);
    wait(60); // still well under the guard
    g.down(pt(ON_P.x, ON_P.y));
    wait();
    g.move(pt(ACROSS.x, ACROSS.y));
    g.up(pt(GROUND.x, GROUND.y));
    expect(sent[1]).toEqual({ type: 'unlink', owner: 'player', from: 'p', to: 'n' });
    wait(C.TICK_MS);
    expect(streams(state)).toEqual([]);
    expect(LINK_REPEAT_GUARD_MS).toBe(400);
  });
});
