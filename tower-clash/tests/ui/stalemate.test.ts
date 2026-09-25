import { describe, expect, it } from 'vitest';
import type { GameState, Link } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { roadIdFor } from '../../src/sim/create';
import { STALEMATE_HINT_MS, StalemateWatch } from '../../src/ui/play';
import { makeLevel } from '../helpers';

/*
 * FE-1 / BUG-13: the stalemate hint fires once per player link after STALEMATE_HINT_MS of sim time
 * without a landing while the lane carries an opposing stream. The sim's `laneStalemate` is stubbed
 * so the bookkeeping (window, reset, once-per-link, level-1 gate) is tested on its own numbers.
 */

/** Player `p` and enemy `e` on one clear lane; `p` streams into `e` from t = 0. */
function linked(): GameState {
  const state = createState(makeLevel(), 1);
  applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
  expect(state.links.map((l) => `${l.owner}:${l.from}->${l.to}@${l.createdMs}`)).toEqual(['player:p->e@0']);
  return state;
}

const at = (state: GameState, time: number): GameState => {
  state.time = time;
  return state;
};

const always = (): boolean => true;
const never = (): boolean => false;

describe('StalemateWatch (FE-1)', () => {
  it('a stalemate lane triggers the hint exactly once, at 8 s of sim time', () => {
    expect(STALEMATE_HINT_MS).toBe(8000);
    const state = linked();
    const watch = new StalemateWatch(true, always);
    expect(watch.check(at(state, 50))).toBeNull();
    expect(watch.check(at(state, 7950))).toBeNull();
    const fired = watch.check(at(state, 8000));
    expect(fired && `${fired.from}->${fired.to}`).toBe('p->e');
    expect(watch.check(at(state, 8050))).toBeNull(); // once per link
    expect(watch.check(at(state, 60_000))).toBeNull();
  });

  it('a landing of the player on the target restarts the window', () => {
    const state = linked();
    const watch = new StalemateWatch(true, always);
    expect(watch.check(at(state, 50))).toBeNull(); // the window is registered at the link's creation time
    watch.onLanded('e', 5000);
    expect(watch.check(at(state, 8000))).toBeNull(); // only 3 s since the landing
    expect(watch.check(at(state, 12_950))).toBeNull();
    expect(watch.check(at(state, 13_000))).not.toBeNull();
    watch.onLanded('e', 13_050); // a later landing changes nothing: the hint was shown for this link
    expect(watch.check(at(state, 30_000))).toBeNull();
  });

  it('a landing on another tower does not touch the window', () => {
    const state = linked();
    const watch = new StalemateWatch(true, always);
    watch.check(at(state, 50));
    watch.onLanded('p', 7000); // a reinforcement into the source is not a landing on the target
    expect(watch.check(at(state, 8000))).not.toBeNull();
  });

  it('level 1 never shows it', () => {
    const state = linked();
    const watch = new StalemateWatch(false, always);
    for (const time of [8000, 20_000, 120_000]) expect(watch.check(at(state, time))).toBeNull();
  });

  it('needs an opposing stream: no hint on a lane the sim does not call a stalemate, then fires when it becomes one', () => {
    const state = linked();
    let stalemate = false;
    const watch = new StalemateWatch(true, () => stalemate);
    expect(watch.check(at(state, 8000))).toBeNull();
    expect(watch.check(at(state, 15_000))).toBeNull();
    stalemate = true; // the enemy answers on the same lane at 15 s; the window has long run out
    expect(watch.check(at(state, 15_050))).not.toBeNull();
  });

  it('resets when the link ends: a re-created link gets a fresh 8 s window and one more hint', () => {
    const state = linked();
    const watch = new StalemateWatch(true, always);
    expect(watch.check(at(state, 8000))).not.toBeNull();
    applyCommand(state, { type: 'unlink', owner: 'player', from: 'p', to: 'e' });
    expect(watch.check(at(state, 8050))).toBeNull();
    applyCommand(at(state, 9000), { type: 'link', owner: 'player', from: 'p', to: 'e' });
    expect(state.links[0]!.createdMs).toBe(9000);
    expect(watch.check(at(state, 16_950))).toBeNull();
    expect(watch.check(at(state, 17_000))).not.toBeNull();
    expect(watch.check(at(state, 40_000))).toBeNull();
  });

  it('BUG-14: player units clashing on the spawn tick count as an opposing stream even though none survives the tick', () => {
    const state = linked();
    const watch = new StalemateWatch(true, never); // `laneStalemate` sees no outbound unit: they die on the tick they spawn
    watch.check(at(state, 50));
    for (let time = 1000; time < 8000; time += 1000) {
      watch.onClash(roadIdFor('p', 'e'));
      expect(watch.check(at(state, time))).toBeNull(); // inside the 8 s window: a clash alone fires nothing
    }
    expect(watch.check(at(state, 7950))).toBeNull(); // no clash noted for this tick and the window is not up
    watch.onClash(roadIdFor('p', 'e'));
    expect(watch.check(at(state, 8000))).not.toBeNull();
    watch.onClash(roadIdFor('p', 'e'));
    expect(watch.check(at(state, 9000))).toBeNull(); // once per link
  });

  it('a clash on another lane is not this link\'s opposing stream, and a noted clash is consumed by the next check', () => {
    const state = linked();
    const watch = new StalemateWatch(true, never);
    watch.onClash('e-q'); // some other lane
    expect(watch.check(at(state, 8000))).toBeNull();
    watch.onClash(roadIdFor('p', 'e'));
    watch.check(at(state, 8050)); // fires here (consumed)
    const again = new StalemateWatch(true, never);
    again.onClash(roadIdFor('p', 'e'));
    expect(again.check(at(state, 50))).toBeNull(); // window not up: the clash is dropped, not banked
    expect(again.check(at(state, 8000))).toBeNull();
  });

  it('only player links are watched and at most one hint fires per tick', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 2 },
          { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
          { id: 'f', x: 120, y: 400, owner: 'enemy1', units: 10, level: 1 },
        ],
      }),
      1,
    );
    applyCommand(state, { type: 'link', owner: 'enemy1', from: 'e', to: 'p' });
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'f' });
    const asked: string[] = [];
    const watch = new StalemateWatch(true, (_s: GameState, l: Link) => {
      asked.push(`${l.owner}:${l.from}->${l.to}`);
      return true;
    });
    const first = watch.check(at(state, 8000));
    const second = watch.check(at(state, 8050));
    expect([first, second].map((l) => l && `${l.from}->${l.to}`)).toEqual(['p->e', 'p->f']);
    expect(watch.check(at(state, 8100))).toBeNull();
    expect(asked).toEqual(['player:p->e', 'player:p->f']); // the enemy's e->p link was never consulted
    expect(never()).toBe(false);
  });
});
