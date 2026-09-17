import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { step } from '../../src/sim/step';
import type { Command, GameState } from '../../src/sim/types';

function scenario(seed: number): GameState {
  const level = makeLevel({
    towers: [
      { id: 'p', x: 100, y: 1100, owner: 'player', units: 20, level: 1 },
      { id: 'a', x: 360, y: 700, owner: 'neutral', units: 5, kind: 'artillery' },
      { id: 'e', x: 600, y: 300, owner: 'enemy1', units: 12, kind: 'fortress' },
      { id: 't', x: 100, y: 300, owner: 'enemy1', units: 10, kind: 'tankFactory' },
    ],
    roads: [
      { a: 'p', b: 'a', mine: 2 },
      { a: 'a', b: 'e', barrier: 3, waypoints: [{ x: 500, y: 600 }] },
      { a: 'p', b: 't', kind: 'bridge' },
      { a: 't', b: 'a' },
    ],
  });
  const state = createState(level, seed);
  const script: [number, Command][] = [
    [0, { type: 'sendUnits', owner: 'player', from: 'p', to: 'a', ratio: 0.5 }],
    [0, { type: 'sendUnits', owner: 'enemy1', from: 't', to: 'a' }],
    [40, { type: 'sendUnits', owner: 'enemy1', from: 'e', to: 'a', ratio: 0.5 }],
    [60, { type: 'upgrade', owner: 'player', towerId: 'p' }], // rules v2: ignored
    [80, { type: 'link', owner: 'player', from: 'p', to: 'a' }],
    [100, { type: 'link', owner: 'enemy1', from: 'e', to: 'a' }],
    [120, { type: 'booster', owner: 'player', booster: 'overdrive' }],
    [200, { type: 'sendUnits', owner: 'player', from: 'a', to: 'e' }],
    [220, { type: 'cutBridge', owner: 'player', roadId: 'p-t' }],
    [300, { type: 'booster', owner: 'player', booster: 'freeze' }],
    [340, { type: 'unlink', owner: 'player', from: 'p' }],
  ];
  for (let tick = 0; tick < 600; tick++) {
    for (const [at, cmd] of script) if (at === tick) applyCommand(state, cmd);
    step(state);
  }
  return state;
}

describe('determinism', () => {
  it('two runs with the same seed and command script produce deep-equal states', () => {
    const a = scenario(42);
    const b = scenario(42);
    expect(a).toEqual(b);
    expect(a.time).toBe(30_000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the scenario actually exercised the rules', () => {
    const s = scenario(42);
    expect(s.roads['p-t']!.cut).toBe(true);
    expect(s.roads['a-p']!.mine).toBe(0);
    expect(s.towers['p']!.level).toBe(1); // the `upgrade` command is ignored and p drained through its link
    expect(s.towers['a']!.owner).toBe('player'); // captured through the p → a stream
    // Auto-upgraded on reinforcements + generation. Rules v2.1 "under fire": enemy1's stream into `a`
    // (tick 100 until `e` fell at 15.65 s) paused its recruiting, so it reaches L2 at 15.95 s (v2: L3 by 30 s).
    expect(s.towers['a']!.level).toBe(2);
    expect(s.towers['a']!.underFireUntilMs).toBeGreaterThan(0); // the scenario exercised the v2.1 rule
    expect(s.towers['e']!.owner).toBe('player');
    expect(s.links).toEqual([]); // player unlinked at tick 340; enemy1's link died with its source
    expect(s.boosters).toEqual([]);
  });
});
