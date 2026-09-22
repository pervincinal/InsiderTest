import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import type { GameState, TowerDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { isFrozen, step } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import { run, unitsOf } from './util';

/*
 * QA bug hunt 2026-09-22, item 3: freeze / overdrive on streams (GDD §2.0b rule 4). Freeze pauses the
 * *emission* of every other owner, nothing else: units already on the lane keep walking and land; the
 * frozen link's accumulator does not move. Overdrive triples the caster's accumulation only.
 */

/** 240 px duel: `p` (player) and `e` (enemy1), infantry travel 2 s. */
function duel(p: Partial<TowerDef> = {}, e: Partial<TowerDef> = {}): GameState {
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1, ...p },
        { id: 'e', x: 360, y: 760, owner: 'enemy1', units: 10, level: 1, ...e },
      ],
    }),
    1,
  );
}

const booster = (s: GameState, owner: 'player' | 'enemy1', kind: 'freeze' | 'overdrive') => applyCommand(s, { type: 'booster', owner, booster: kind });

describe('freeze and a stream mid-lane', () => {
  it('a player freeze during an enemy stream: units already walking keep walking and land; only the emission pauses', () => {
    const s = duel({ units: 10 }, { units: 25 });
    applyCommand(s, { type: 'link', owner: 'enemy1', from: 'e', to: 'p' });
    run(s, 30); // 1500 ms: one enemy unit, spawned at 1000 ms, 11 steps of 0.025 along the lane
    expect(unitsOf(s, 'enemy1').map((u) => u.progress.toFixed(3))).toEqual(['0.275']);
    const enemyLink = s.links[0]!;
    expect(enemyLink.emitAccMs).toBe(500);
    booster(s, 'player', 'freeze');
    step(s);
    expect(isFrozen(s, 'enemy1')).toBe(true);
    expect(unitsOf(s, 'enemy1')[0]!.progress).toBeCloseTo(0.3, 9); // walking on
    expect(enemyLink.emitAccMs).toBe(500); // timer frozen
    run(s, 27);
    const before = s.towers['p']!.units;
    step(s); // 2950 ms: the walker lands (spawned at 1000, 40 steps of travel); 2950 is no growth tick
    expect(s.time).toBe(2950);
    expect(s.towers['p']!.units).toBe(before - 1);
    expect(unitsOf(s, 'enemy1')).toEqual([]);
    expect(enemyLink.emitAccMs).toBe(500);
    run(s, 72); // 6550: freeze ends at 6500 (cast at 1500)
    expect(s.boosters).toEqual([]);
    expect(enemyLink.emitAccMs).toBe(550); // one tick of accumulation since 6500
    run(s, 9); // 7000 ms: the interval completes 5 s later than it would have
    expect(unitsOf(s, 'enemy1')).toHaveLength(1);
  });

  it('the caster keeps streaming during its own freeze; a freeze by each side freezes both', () => {
    const s = duel({ units: 25 }, { units: 25 });
    applyCommand(s, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    applyCommand(s, { type: 'link', owner: 'enemy1', from: 'e', to: 'p' });
    booster(s, 'player', 'freeze');
    run(s, 40); // 2 s
    expect(unitsOf(s, 'player')).toHaveLength(2);
    expect(unitsOf(s, 'enemy1')).toHaveLength(0);
    booster(s, 'enemy1', 'freeze'); // now every owner is frozen by the other's freeze
    const accs = s.links.map((l) => l.emitAccMs);
    const nextId = s.nextUnitId;
    run(s, 20);
    expect(isFrozen(s, 'player')).toBe(true);
    expect(isFrozen(s, 'enemy1')).toBe(true);
    expect(s.links.map((l) => l.emitAccMs)).toEqual(accs);
    expect(s.nextUnitId).toBe(nextId); // nobody spawned
  });
});

describe('overdrive on streams', () => {
  it('×3 accumulation for the caster only: 150 ms per tick on the player link, 50 on the enemy link', () => {
    const s = duel({ units: 25 }, { units: 25 });
    applyCommand(s, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    applyCommand(s, { type: 'link', owner: 'enemy1', from: 'e', to: 'p' });
    booster(s, 'player', 'overdrive');
    step(s);
    expect(s.links.map((l) => [l.owner, l.emitAccMs])).toEqual([
      ['player', 150],
      ['enemy1', 50],
    ]);
    run(s, 200); // 10 050 ms: the overdrive (until 10 000) is gone
    expect(s.boosters).toEqual([]);
    // 10 s of ×3 at 1000 ms = 30 player units spawned; 10 enemy; those that met on the lane cancelled 1:1
    expect(s.nextUnitId - 1).toBe(40);
    expect(s.towers['p']!.units).toBe(25); // the enemy's 10 never landed: cancelled by the surplus walking the other way
    expect(s.towers['e']!.units).toBeLessThan(25);
    run(s, 20); // the next second: back to 1/s
    expect(s.nextUnitId - 1).toBe(42);
  });

  it('overdrive does not touch a frozen owner: an enemy overdrive under a player freeze emits nothing', () => {
    const s = duel({ units: 25 }, { units: 25 });
    applyCommand(s, { type: 'link', owner: 'enemy1', from: 'e', to: 'p' });
    booster(s, 'player', 'freeze');
    booster(s, 'enemy1', 'overdrive');
    run(s, 100); // 5 s
    expect(unitsOf(s, 'enemy1')).toEqual([]);
    expect(s.links[0]!.emitAccMs).toBe(0);
    run(s, 4); // freeze ended at 5000 — 200 ms of ×3 = 600 ms
    expect(s.links[0]!.emitAccMs).toBe(600);
    expect(C.OVERDRIVE_MUL).toBe(3);
  });
});
