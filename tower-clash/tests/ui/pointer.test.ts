import { describe, expect, it } from 'vitest';
import type { Command, GameState } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { C } from '../../src/sim/constants';
import type { PointerPoint } from '../../src/input/pointer';
import { LIMIT_HINT_MS, LONG_PRESS_MS, PlayGestures, decideLink } from '../../src/input/pointer';
import { makeLevel } from '../helpers';

/*
 * Rules v2 gestures (GDD §2.0 "Interaction"): tap own tower = select; tap a connected tower = link,
 * or unlink when that stream exists; refused with a hint at the per-level link limit; drag = link;
 * tap the selected tower again = deselect (no upgrade command any more).
 */

/** Player `p` (L1) with roads to an enemy `e` and a neutral `n`; `n`–`e` joined too; a far tower `x` with no road to `p`. */
function fixture(): GameState {
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 200, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'e', x: 200, y: 400, owner: 'enemy1', units: 10, level: 1 },
        { id: 'n', x: 520, y: 700, owner: 'neutral', units: 5 },
        { id: 'x', x: 520, y: 300, owner: 'neutral', units: 5 },
      ],
      roads: [{ a: 'p', b: 'e' }, { a: 'p', b: 'n' }, { a: 'n', b: 'e' }, { a: 'x', b: 'e', kind: 'bridge' }],
    }),
    1,
  );
}

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
    state.towers['p']!.level = 3; // L3 allows three, but p has only two neighbours
    expect(decideLink(state, 'p', 'x')).toEqual({ kind: 'none' }); // no road
  });

  it('never decides anything for foreign sources, self-targets, missing or cut roads', () => {
    const state = fixture();
    expect(decideLink(state, 'e', 'p')).toEqual({ kind: 'none' });
    expect(decideLink(state, 'p', 'p')).toEqual({ kind: 'none' });
    expect(decideLink(state, 'p', 'x')).toEqual({ kind: 'none' });
    state.roads['e-p']!.cut = true;
    expect(decideLink(state, 'p', 'e')).toEqual({ kind: 'none' });
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

  it('long-press on an own bridge midpoint still cuts it', () => {
    const state = fixture();
    state.towers['x']!.owner = 'player';
    const { g, commands } = harness(state);
    const road = state.roads['e-x']!;
    const m = road.points[0]!;
    const n = road.points[road.points.length - 1]!;
    const mid = { id: 1, x: (m.x + n.x) / 2, y: (m.y + n.y) / 2, timeMs: 5000 };
    g.down(mid);
    g.tick(5000 + LONG_PRESS_MS - 1);
    expect(commands).toEqual([]);
    g.tick(5000 + LONG_PRESS_MS);
    expect(commands).toEqual([{ type: 'cutBridge', owner: 'player', roadId: 'e-x' }]);
    expect(road.cut).toBe(true);
    g.up({ ...mid, timeMs: 5000 + LONG_PRESS_MS + 10 });
    expect(commands).toHaveLength(1);
  });
});
