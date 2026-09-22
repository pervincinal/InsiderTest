import { describe, expect, it } from 'vitest';
import type { Command, GameState, LevelDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { C } from '../../src/sim/constants';
import type { PointerPoint } from '../../src/input/pointer';
import { LIMIT_HINT_MS, PlayGestures, decideLink } from '../../src/input/pointer';

/*
 * Rules v2 / v3 gestures (GDD §2.0 "Interaction", §2.0b rule 8): tap own tower = select; tap a
 * tower with a clear lane = link, or unlink when that stream exists; refused with a hint at the
 * per-level link limit; a blocked tower (wall in the way) = shake + `hint.blocked`; drag = link;
 * tap the selected tower again = deselect (no upgrade command any more). No bridge cut.
 */

/**
 * Player `p` (L1), an enemy `e`, a neutral `n` and a far neutral `x`. Every pair has a clear lane
 * except `p`–`x`: a short wall crosses that segment at (440, 475) — `e`–`x` and `n`–`x` pass it by
 * more than its half width, so `x` stays reachable from the others.
 */
function fixture(): GameState {
  const level: LevelDef = {
    id: 999,
    name: 'gestures',
    lesson: 'gestures',
    star3: 30_000,
    star2: 60_000,
    enemies: [{ owner: 'enemy1', personality: 'rusher', aggression: 0.5 }],
    towers: [
      { id: 'p', x: 200, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 200, y: 400, owner: 'enemy1', units: 10, level: 1 },
      { id: 'n', x: 520, y: 700, owner: 'neutral', units: 5 },
      { id: 'x', x: 520, y: 300, owner: 'neutral', units: 5 },
    ],
    obstacles: [{ kind: 'wall', points: [{ x: 410, y: 450 }, { x: 470, y: 500 }], width: 28 }],
  };
  return createState(level, 1);
}

describe('fixture lanes', () => {
  it('joins every pair except p–x (blocked by the wall)', () => {
    const state = fixture();
    expect(Object.keys(state.roads).sort()).toEqual(['e-n', 'e-p', 'e-x', 'n-p', 'n-x']);
    expect(state.roads['n-p']!.points).toEqual([
      { x: 520, y: 700 },
      { x: 200, y: 1000 },
    ]);
  });
});

describe('decideLink', () => {
  it('links, then toggles to unlink, and refuses a second stream at L1', () => {
    const state = fixture();
    expect(decideLink(state, 'p', 'e')).toEqual({ kind: 'link' });
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    expect(decideLink(state, 'p', 'e')).toEqual({ kind: 'unlink' });
    expect(decideLink(state, 'p', 'e', false)).toEqual({ kind: 'none' }); // a drag onto an existing stream is a no-op
    expect(decideLink(state, 'p', 'n')).toEqual({ kind: 'limit', nextLevel: 2 });
    expect(C.LINKS_PER_LEVEL[1]).toBe(1);
  });

  it('allows a second stream from an L2 tower and refuses the third', () => {
    const state = fixture();
    state.towers['p']!.level = 2;
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    expect(decideLink(state, 'p', 'n')).toEqual({ kind: 'link' });
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'n' });
    expect(state.links).toHaveLength(2);
    state.towers['p']!.level = 3; // L3 allows three, but p has only two clear lanes
    expect(decideLink(state, 'p', 'x')).toEqual({ kind: 'blocked' });
  });

  it('never decides anything for foreign sources, self-targets or unknown towers; a wall in the way is `blocked`', () => {
    const state = fixture();
    expect(decideLink(state, 'e', 'p')).toEqual({ kind: 'none' });
    expect(decideLink(state, 'p', 'p')).toEqual({ kind: 'none' });
    expect(decideLink(state, 'p', 'ghost')).toEqual({ kind: 'none' });
    expect(decideLink(state, 'p', 'x')).toEqual({ kind: 'blocked' });
    expect(decideLink(state, 'p', 'x', false)).toEqual({ kind: 'blocked' });
  });
});

describe('PlayGestures (taps and drags → link / unlink commands)', () => {
  function harness(state: GameState) {
    const commands: Command[] = [];
    const g = new PlayGestures({
      getState: () => state,
      onCommand: (cmd) => {
        commands.push(cmd);
        applyCommand(state, cmd); // the play screen enqueues; here the sim applies at once so the next tap sees it
      },
      limitHintText: (n) => `L${n} needed for ${n} streams`,
      blockedHintText: () => 'Blocked — no clear line',
      emptyHintText: () => 'No soldiers — let the tower grow',
    });
    let now = 1000;
    const at = (id: string, dx = 0, dy = 0): PointerPoint => ({ id: 1, x: state.towers[id]!.x + dx, y: state.towers[id]!.y + dy, timeMs: now });
    const tap = (id: string): void => {
      now += 50;
      g.down(at(id));
      g.up(at(id));
    };
    const drag = (from: string, to: string): void => {
      now += 50;
      g.down(at(from));
      g.move(at(from, 30, 0));
      g.move(at(to));
      g.up(at(to));
    };
    return { g, commands, tap, drag, at, clock: () => now };
  }

  it('tap own tower selects; tap a connected tower links; the same tap again unlinks', () => {
    const state = fixture();
    const { g, commands, tap } = harness(state);
    tap('p');
    expect(g.selectedTowerId).toBe('p');
    expect(commands).toEqual([]);
    tap('e');
    expect(commands).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'e' }]);
    expect(g.selectedTowerId).toBe('p'); // the source stays selected
    expect(state.links.map((l) => l.to)).toEqual(['e']);
    tap('e');
    expect(commands[1]).toEqual({ type: 'unlink', owner: 'player', from: 'p', to: 'e' });
    expect(state.links).toEqual([]);
    for (const c of commands) expect(c.owner).toBe('player');
  });

  it('tapping the selected tower again deselects and issues no upgrade command', () => {
    const state = fixture();
    const { g, commands, tap } = harness(state);
    tap('p');
    tap('p');
    expect(g.selectedTowerId).toBeNull();
    expect(commands).toEqual([]);
  });

  it('at the link limit the tap is refused with a hint that expires after LIMIT_HINT_MS', () => {
    const state = fixture();
    const { g, commands, tap, clock } = harness(state);
    tap('p');
    tap('e');
    expect(g.limitHint).toBeNull();
    tap('n');
    expect(commands).toHaveLength(1); // the refused tap sent nothing
    expect(state.links).toHaveLength(1);
    expect(g.limitHint).toEqual({ until: clock() + LIMIT_HINT_MS });
    expect(g.limitHintText).toBe('L2 needed for 2 streams');
    expect(g.selectedTowerId).toBe('p'); // still selected, so the renderer can shake it
    const hint = g.limitHint;
    g.tick(clock() + LIMIT_HINT_MS - 1);
    expect(g.limitHint).toBe(hint); // same object while it lasts (the renderer keys the shake on it)
    g.tick(clock() + LIMIT_HINT_MS);
    expect(g.limitHint).toBeNull();
    expect(g.limitHintText).toBe('');
  });

  it('drag from an own tower onto a connected tower links; onto an existing stream it is a no-op', () => {
    const state = fixture();
    const { g, commands, drag } = harness(state);
    drag('p', 'n');
    expect(commands).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);
    expect(g.selectedTowerId).toBe('p');
    drag('p', 'n');
    expect(commands).toHaveLength(1);
    expect(state.links).toHaveLength(1);
    drag('e', 'p'); // not ours
    expect(commands).toHaveLength(1);
  });

  it('tap on a foreign tower without a selection, or on empty ground, only changes the selection', () => {
    const state = fixture();
    const { g, commands, tap, at } = harness(state);
    tap('e');
    expect(g.selectedTowerId).toBeNull();
    tap('p');
    g.down({ ...at('p'), x: 40, y: 600 });
    g.up({ ...at('p'), x: 40, y: 600 });
    expect(g.selectedTowerId).toBeNull();
    expect(commands).toEqual([]);
  });

  it('tap on a blocked tower sends nothing, keeps the selection and raises hint.blocked for LIMIT_HINT_MS', () => {
    const state = fixture();
    const { g, commands, tap, clock } = harness(state);
    tap('p');
    tap('x');
    expect(commands).toEqual([]);
    expect(g.selectedTowerId).toBe('p'); // still selected, so the renderer can shake it
    expect(g.limitHint).toEqual({ until: clock() + LIMIT_HINT_MS });
    expect(g.limitHintText).toBe('Blocked — no clear line');
    g.tick(clock() + LIMIT_HINT_MS);
    expect(g.limitHint).toBeNull();
    // a reachable tower right after works as usual
    tap('n');
    expect(commands).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);
  });

  it('drag onto a blocked tower is refused with the same hint; tapping another own tower moves the selection', () => {
    const state = fixture();
    const { g, commands, drag, tap } = harness(state);
    drag('p', 'x');
    expect(commands).toEqual([]);
    expect(g.selectedTowerId).toBe('p');
    expect(g.limitHintText).toBe('Blocked — no clear line');
    state.towers['x']!.owner = 'player';
    tap('x');
    expect(g.selectedTowerId).toBe('x');
    expect(commands).toEqual([]);
  });

  it('two blocked taps in a row raise two distinct hint objects (the renderer restarts the shake on identity)', () => {
    const state = fixture();
    const { g, commands, tap } = harness(state);
    tap('p');
    tap('x'); // neutral behind the wall
    const first = g.limitHint;
    expect(first).not.toBeNull();
    tap('x');
    expect(g.limitHint).not.toBe(first);
    expect(g.limitHint!.until).toBeGreaterThan(first!.until);
    expect(g.limitHintText).toBe('Blocked — no clear line');
    expect(commands).toEqual([]);
    expect(g.selectedTowerId).toBe('p');
  });

  it('a tap or drag from an own tower at 0 units sends nothing and raises hint.empty; stopping a stream never needs soldiers (BUG-10)', () => {
    const state = fixture();
    state.towers['p']!.units = 0;
    const { g, commands, tap } = harness(state);
    tap('p');
    expect(g.selectedTowerId).toBe('p'); // selecting an empty tower is allowed (it shows the guide lines)
    expect(decideLink(state, 'p', 'e')).toEqual({ kind: 'empty' });
    tap('e');
    expect(commands).toEqual([]); // nothing reaches the sim (which would drop it silently, rule 6)
    expect(state.links).toEqual([]);
    expect(g.selectedTowerId).toBe('p'); // the source stays selected
    expect(g.limitHint).not.toBeNull();
    expect(g.limitHintText).toBe('No soldiers — let the tower grow');
    const first = g.limitHint;
    // a drag is refused the same way, with a fresh hint object (the renderer restarts the shake on identity)
    g.down({ id: 1, x: state.towers['p']!.x, y: state.towers['p']!.y, timeMs: 5000 });
    g.move({ id: 1, x: state.towers['e']!.x, y: state.towers['e']!.y, timeMs: 5100 });
    g.up({ id: 1, x: state.towers['e']!.x, y: state.towers['e']!.y, timeMs: 5200 });
    expect(commands).toEqual([]);
    expect(g.limitHint).not.toBe(first);
    expect(g.limitHintText).toBe('No soldiers — let the tower grow');
    // an existing stream from an empty tower can still be stopped: unlink wins over empty
    state.towers['p']!.units = 3;
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    state.towers['p']!.units = 0;
    expect(decideLink(state, 'p', 'e')).toEqual({ kind: 'unlink' });
    // a blocked lane still reads as blocked, and an empty tower at the limit reads as empty
    expect(decideLink(state, 'p', 'x')).toEqual({ kind: 'blocked' });
    expect(decideLink(state, 'p', 'n')).toEqual({ kind: 'empty' });
  });

  it('long-press does nothing any more (no bridges to cut)', () => {
    const state = fixture();
    const { g, commands, at } = harness(state);
    const down = { ...at('p'), x: 360, y: 700, timeMs: 5000 };
    g.down(down);
    g.tick(5000 + 2000);
    g.up({ ...down, timeMs: 7000 });
    expect(commands).toEqual([]);
    expect(g.selectedTowerId).toBeNull();
  });
});
