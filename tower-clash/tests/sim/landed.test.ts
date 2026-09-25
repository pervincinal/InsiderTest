import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import type { GameState, SimEvent, TowerDef } from '../../src/sim/types';
import { createState, roadIdFor } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { laneStalemate, step } from '../../src/sim/step';
import { cloneState } from '../../src/sim/snapshot';
import { run, spawn } from './util';

/*
 * FE-1 support (BUG-13): the sim tells the play screen when a unit lands (`landed`) and when a lane is
 * shielded by opposing streams (`laneStalemate`). Map: `p` (360,1000) player L1 — `e` (360,400) enemy L1
 * on a 600 px lane; `n` (120,1000) is a neutral neighbour of `p` on a 240 px lane.
 */
function level(n: Partial<TowerDef> = {}): GameState {
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
        { id: 'n', x: 120, y: 1000, owner: 'neutral', units: 0, ...n },
      ],
    }),
    1,
  );
}

const landed = (state: GameState) => state.events.filter((e) => e.type === 'landed');
const types = (events: SimEvent[]) => events.map((e) => e.type);

describe('landed event', () => {
  it('a friendly reinforcement emits landed { hostile: false } with the unit weight', () => {
    const state = level();
    spawn(state, { owner: 'player', from: 'e', to: 'p', progress: 0.995 });
    step(state);
    expect(state.towers['p']!.units).toBe(11);
    expect(state.events).toEqual([{ type: 'landed', towerId: 'p', owner: 'player', weight: 1, hostile: false }]);
  });

  it('a hostile landing that does not flip the tower emits landed { hostile: true } and no capture', () => {
    const state = level();
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.995, weight: 5, kind: 'tank' });
    step(state);
    expect(state.towers['p']!.units).toBe(5);
    expect(state.towers['p']!.owner).toBe('player');
    expect(state.events).toEqual([{ type: 'landed', towerId: 'p', owner: 'enemy1', weight: 5, hostile: true }]);
  });

  it('a capturing landing emits landed before capture', () => {
    const state = level({ units: 3 });
    spawn(state, { owner: 'player', from: 'p', to: 'n', progress: 0.995, weight: 5, kind: 'tank' });
    step(state);
    expect(state.towers['n']!.owner).toBe('player');
    expect(state.towers['n']!.units).toBe(2);
    expect(types(state.events)).toEqual(['landed', 'capture']);
    expect(state.events[0]).toEqual({ type: 'landed', towerId: 'n', owner: 'player', weight: 5, hostile: true });
    expect(state.events[1]).toEqual({ type: 'capture', towerId: 'n', by: 'player', from: 'neutral' });
  });

  it('units that die on the lane (clash, artillery, mine) never land', () => {
    // Clash at mid-lane: both die, nothing lands.
    const clash = level();
    spawn(clash, { owner: 'player', from: 'p', to: 'e', progress: 0.49 });
    spawn(clash, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.49 });
    step(clash);
    expect(clash.units).toEqual([]);
    expect(types(clash.events)).toEqual(['unitDied', 'unitDied']);
    // BUG-14: every death names its lane so the play screen can count clashes per link.
    expect(clash.events).toEqual([
      { type: 'unitDied', x: 360, y: 700, owner: 'enemy1', cause: 'clash', roadId: roadIdFor('p', 'e') },
      { type: 'unitDied', x: 360, y: 700, owner: 'player', cause: 'clash', roadId: roadIdFor('p', 'e') },
    ]);
    // Artillery: the last unit before the gun dies 120 px out.
    const gun = createState(
      makeLevel({ towers: [{ id: 'p', x: 360, y: 1000, owner: 'player', units: 10, kind: 'artillery' }, { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 }] }),
      1,
    );
    spawn(gun, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.8 });
    step(gun);
    expect(gun.units).toEqual([]);
    expect(types(gun.events)).toEqual(['unitDied']);
    // Mine 2 px before the tower: the unit is spent one tick before it would land.
    const mined = createState(makeLevel({ mines: [{ x: 360, y: 997, charges: 1 }] }), 1);
    spawn(mined, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.99 });
    step(mined);
    expect(mined.units).toEqual([]);
    expect(landed(mined)).toEqual([]);
    expect(mined.towers['p']!.units).toBe(10);
  });

  it('each tick clears the previous tick\'s landed events', () => {
    const state = level();
    spawn(state, { owner: 'player', from: 'e', to: 'p', progress: 0.995 });
    step(state);
    expect(landed(state).length).toBe(1);
    step(state);
    expect(landed(state)).toEqual([]);
  });

  it('events are not replayed from a snapshot: the tick after a restore starts with fresh events', () => {
    const state = level();
    spawn(state, { owner: 'player', from: 'e', to: 'p', progress: 0.995 });
    step(state);
    expect(landed(state).length).toBe(1);
    const restored = cloneState(state);
    step(restored);
    expect(landed(restored)).toEqual([]);
    // The snapshot itself carries only what `step` overwrote next tick: state and copy stay in lockstep.
    step(state);
    expect(restored).toEqual(state);
  });
});

describe('laneStalemate', () => {
  const link = (owner: 'player' | 'enemy1', from: string, to: string) => ({ owner, from, to, roadId: roadIdFor(from, to) });

  it('is true when the lane carries units of both owners walking in opposite directions', () => {
    const state = level();
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.2 });
    spawn(state, { owner: 'enemy1', from: 'e', to: 'p', progress: 0.2 });
    expect(laneStalemate(state, link('player', 'p', 'e'))).toBe(true);
    expect(laneStalemate(state, link('enemy1', 'e', 'p'))).toBe(true);
  });

  it('is false for a one-sided stream, for same-owner traffic both ways, and for units on another lane', () => {
    const state = level();
    spawn(state, { owner: 'player', from: 'p', to: 'e', progress: 0.2 });
    expect(laneStalemate(state, link('player', 'p', 'e'))).toBe(false);
    // The enemy's link on the same lane has no unit of its own out there yet: no shield from its side.
    expect(laneStalemate(state, link('enemy1', 'e', 'p'))).toBe(false);
    spawn(state, { owner: 'player', from: 'e', to: 'p', progress: 0.2 });
    expect(laneStalemate(state, link('player', 'p', 'e'))).toBe(false);
    spawn(state, { owner: 'enemy1', from: 'n', to: 'p', progress: 0.2 });
    expect(laneStalemate(state, link('player', 'p', 'e'))).toBe(false);
    expect(laneStalemate(state, link('player', 'p', 'n'))).toBe(false);
  });

  it('two equal streams on one lane: laneStalemate holds and nothing lands for 30 s (BUG-13 root cause)', () => {
    const state = level();
    state.towers['p']!.units = 25;
    state.towers['e']!.units = 25;
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    applyCommand(state, { type: 'link', owner: 'enemy1', from: 'e', to: 'p' });
    const pLink = state.links[0]!;
    const eLink = state.links[1]!;
    run(state, 19); // t = 950: no unit has left yet
    expect(laneStalemate(state, pLink)).toBe(false);
    step(state); // t = 1000: the first unit of each stream is on the lane
    expect(laneStalemate(state, pLink)).toBe(true);
    expect(laneStalemate(state, eLink)).toBe(true);
    let landings = 0;
    let shielded = 0;
    while (state.time < 30_000) {
      step(state);
      landings += landed(state).length;
      if (laneStalemate(state, pLink)) shielded++;
    }
    expect(landings).toBe(0);
    expect(shielded).toBe(580); // every tick from 1050 to 30000
    expect(state.towers['p']!.units).toBe(25);
    expect(state.towers['e']!.units).toBe(25);
  });

  it('a one-sided stream is never a stalemate and lands', () => {
    const state = level();
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'n' });
    const pLink = state.links[0]!;
    let landings = 0;
    let shielded = 0;
    while (state.time < 4_000) {
      step(state);
      landings += landed(state).length;
      if (laneStalemate(state, pLink)) shielded++;
    }
    expect(shielded).toBe(0);
    expect(landings).toBe(2); // units left at 1000 and 2000 ms, 240 px = 2 s of travel
  });
});
