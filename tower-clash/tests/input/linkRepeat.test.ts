import { describe, expect, it } from 'vitest';
import type { Command, GameState, LevelDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { C } from '../../src/sim/constants';
import type { PointerPoint } from '../../src/input/pointer';
import { LINK_REPEAT_GUARD_MS, PlayGestures } from '../../src/input/pointer';

/*
 * AUD-U6 (GDD §2.0b rule 8, 2026-11-01): a second tap on the target of a stream the player's tap just
 * started is ignored for LINK_REPEAT_GUARD_MS = 400 ms (a bounce or a "tap harder" retry used to stop the
 * stream again, with no feedback but the ribbon vanishing). After 400 ms the tap unlinks as before; the
 * swipe-cut and a tap on another target are never guarded. Commands are queued like the play screen's and
 * reach the sim on its next 50 ms tick (`tick`), so a 50 ms bounce lands before the link exists.
 */

/** Player `p` (L2: two streams) and `q`, neutrals `n` and `m`; every pair has a clear lane. */
function fixture(): GameState {
  const level: LevelDef = {
    id: 997,
    name: 'repeat',
    lesson: 'repeat',
    star3: 30_000,
    star2: 60_000,
    enemies: [{ owner: 'enemy1', personality: 'rusher', aggression: 0.5 }],
    towers: [
      { id: 'p', x: 200, y: 1000, owner: 'player', units: 10, level: 2 },
      { id: 'q', x: 520, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'n', x: 200, y: 600, owner: 'neutral', units: 5 },
      { id: 'm', x: 520, y: 600, owner: 'neutral', units: 5 },
      { id: 'e', x: 360, y: 200, owner: 'enemy1', units: 10, level: 1 },
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
      queue.push(cmd);
    },
  });
  let now = 1000;
  const pt = (x: number, y: number): PointerPoint => ({ id: 1, x, y, timeMs: now });
  /** A tap on tower `id` at `now`. */
  const tap = (id: string): void => {
    const p = pt(state.towers[id]!.x, state.towers[id]!.y);
    g.down(p);
    g.up(p);
  };
  /** The sim's tick: the queued commands reach the state. */
  const tick = (): void => {
    for (const c of queue.splice(0)) applyCommand(state, c);
  };
  /** Advance the pointer clock by `ms`, running the sim's ticks that fall in it. */
  const wait = (ms: number): void => {
    now += ms;
    if (ms >= C.TICK_MS) tick();
  };
  return { g, sent, pt, tap, tick, wait };
}

const streams = (state: GameState): string[] => state.links.filter((l) => l.owner === 'player').map((l) => `${l.from}>${l.to}`);

describe('AUD-U6: a second tap on a target just linked does not unlink it', () => {
  it('is 400 ms', () => {
    expect(LINK_REPEAT_GUARD_MS).toBe(400);
  });

  it('a 50 ms bounce (before the sim tick): one link command, the stream stays', () => {
    const state = fixture();
    const { g, sent, tap, tick, wait } = harness(state);
    tap('p');
    wait(100);
    tap('n'); // link, still queued
    wait(30); // the bounce lands before the next tick
    tap('n');
    tick();
    expect(sent).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);
    expect(streams(state)).toEqual(['p>n']);
    expect(g.selectedTowerId).toBe('p');
    expect(g.limitHint).toBeNull(); // a toast-less no-op: no refusal bubble
  });

  it('399 ms after the linking tap: ignored, the stream stays; 401 ms: the tap unlinks as before', () => {
    const state = fixture();
    const { g, sent, tap, wait } = harness(state);
    tap('p');
    wait(100);
    tap('n');
    wait(LINK_REPEAT_GUARD_MS - 1);
    tap('n');
    expect(sent).toHaveLength(1);
    expect(streams(state)).toEqual(['p>n']);
    expect(g.limitHint).toBeNull();
    // the guard counts from the linking tap, not from the ignored one: 2 ms later it is 401 ms
    wait(2);
    tap('n');
    expect(sent[1]).toEqual({ type: 'unlink', owner: 'player', from: 'p', to: 'n' });
    wait(C.TICK_MS);
    expect(streams(state)).toEqual([]);
  });

  it('401 ms after the linking tap, with no tap in between: unlink', () => {
    const state = fixture();
    const { sent, tap, wait } = harness(state);
    tap('p');
    wait(100);
    tap('n');
    wait(LINK_REPEAT_GUARD_MS + 1);
    tap('n');
    expect(sent.map((c) => c.type)).toEqual(['link', 'unlink']);
  });

  it('a tap on a different target is never guarded (a second stream starts at once)', () => {
    const state = fixture();
    const { g, sent, tap, wait } = harness(state);
    tap('p');
    wait(100);
    tap('n');
    wait(60);
    tap('m'); // p is L2: a second stream
    wait(C.TICK_MS);
    expect(sent).toEqual([
      { type: 'link', owner: 'player', from: 'p', to: 'n' },
      { type: 'link', owner: 'player', from: 'p', to: 'm' },
    ]);
    expect(streams(state)).toEqual(['p>n', 'p>m']);
    // …and the same target from another source is another stream: q → n is not guarded by p → n
    g.selectedTowerId = 'q'; // (a tap on q would be a p → q stream: p and q share a lane)
    wait(60);
    tap('n');
    expect(sent[2]).toEqual({ type: 'link', owner: 'player', from: 'q', to: 'n' });
  });

  it('the swipe-cut is never guarded: a swipe 100 ms after the linking tap cuts the stream', () => {
    const state = fixture();
    const { g, sent, pt, tap, wait } = harness(state);
    tap('p');
    wait(100);
    tap('n');
    wait(C.TICK_MS); // the link is in
    expect(streams(state)).toEqual(['p>n']);
    // across the p → n lane (x = 200, y 1000 → 600) from empty ground
    g.down(pt(100, 800));
    wait(16);
    g.move(pt(300, 800));
    g.up(pt(300, 800));
    expect(sent[1]).toEqual({ type: 'unlink', owner: 'player', from: 'p', to: 'n' });
  });

  it('a drag never arms the guard: a tap 100 ms after a drag-link stops it (only a tap-made link is guarded)', () => {
    const state = fixture();
    const { g, sent, pt, tap, wait } = harness(state);
    const n = state.towers['n']!;
    g.down(pt(200, 1000));
    wait(16);
    g.move(pt(200, 900));
    g.move(pt(n.x, n.y));
    g.up(pt(n.x, n.y));
    wait(C.TICK_MS);
    expect(streams(state)).toEqual(['p>n']);
    expect(g.selectedTowerId).toBe('p');
    wait(50);
    tap('n');
    expect(sent.map((c) => c.type)).toEqual(['link', 'unlink']);
  });

  it('GD-7h cadence: one tap per bubble 250 ms apart on different targets all go through', () => {
    // the level 3 west-first steps (tests/ui/tutorialWestFirst.test.ts): link, stop an old stream, link —
    // each from the selection the step sets, 250 ms apart; none repeats the target of the tap before it
    const state = fixture();
    const { g, sent, tap, wait } = harness(state);
    tap('p');
    wait(100);
    tap('n'); // the old stream (the trace's home → west at 3 s)
    wait(5000);
    g.selectedTowerId = 'q'; // step: grab the other one
    tap('m');
    wait(250);
    g.selectedTowerId = 'p'; // step: stop home → west
    tap('n');
    wait(250);
    tap('m'); // step: home → east
    expect(sent.map((c) => `${c.type}:${c.type === 'link' || c.type === 'unlink' ? `${c.from}>${c.to}` : ''}`)).toEqual([
      'link:p>n',
      'link:q>m',
      'unlink:p>n',
      'link:p>m',
    ]);
  });
});
