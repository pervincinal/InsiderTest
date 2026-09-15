import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { Rng, applyCommand, createState } from '../../src/sim/index';
import type { Command, EnemyDef, GameState } from '../../src/sim/index';
import { enemyCommands, runAiTick } from '../../src/ai/index';
import { OPPORTUNIST_RESERVE } from '../../src/ai/personalities';
import { incomingThreat } from '../../src/ai/common';

function enemy(personality: EnemyDef['personality'], aggression: number): EnemyDef {
  return { owner: 'enemy1', personality, aggression };
}

/** p (player) — e (enemy1) on one road, with chosen garrisons. */
function duel(enemyDef: EnemyDef, enemyUnits: number, playerUnits: number, seed = 1): GameState {
  return createState(
    makeLevel({
      enemies: [enemyDef],
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: playerUnits, level: 1 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: enemyUnits, level: 1 },
      ],
    }),
    seed,
  );
}

const sends = (cmds: Command[]) => cmds.filter((c) => c.type === 'sendUnits');
const upgrades = (cmds: Command[]) => cmds.filter((c) => c.type === 'upgrade');
const cuts = (cmds: Command[]) => cmds.filter((c) => c.type === 'cutBridge');

/**
 * e (enemy1, `enemyUnits`) at the north end of a 600 px bridge from p (player, `playerUnits`); with `alt`,
 * a plain detour p — n — e (neutral n) keeps e reachable once the bridge is gone.
 */
function bridgeDuel(enemyDef: EnemyDef, enemyUnits: number, playerUnits: number, alt = true, level: 1 | 2 | 3 = 3): GameState {
  return createState(
    makeLevel({
      enemies: [enemyDef],
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: playerUnits },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: enemyUnits, level },
        ...(alt ? [{ id: 'n', x: 60, y: 700, owner: 'neutral' as const, units: 2 }] : []),
      ],
      roads: [{ a: 'p', b: 'e', kind: 'bridge' }, ...(alt ? [{ a: 'p', b: 'n' }, { a: 'n', b: 'e' }] : [])],
    }),
    1,
  );
}

describe('rusher', () => {
  it('attacks only when garrison ≥ target + 3 at aggression 0', () => {
    const def = enemy('rusher', 0);
    // aggression 0 skips half the ticks: try several ticks per case so the gate never hides the rule.
    for (const [units, expected] of [
      [12, 0],
      [13, 1],
    ] as const) {
      const rng = new Rng(7);
      let attacks = 0;
      for (let i = 0; i < 12; i++) {
        const cmds = enemyCommands(duel(def, units, 10), def, rng);
        attacks += sends(cmds).length;
      }
      if (expected === 0) expect(attacks).toBe(0);
      else expect(attacks).toBeGreaterThan(0);
    }
  });

  it('at aggression 1 never skips and needs just enough to flip the tower', () => {
    const def = enemy('rusher', 1);
    expect(sends(enemyCommands(duel(def, 10, 10), def, new Rng(1)))).toHaveLength(0);
    const cmds = enemyCommands(duel(def, 11, 10), def, new Rng(1));
    expect(cmds).toEqual([{ type: 'sendUnits', owner: 'enemy1', from: 'e', to: 'p', ratio: 1 }]);
  });

  it('needs double the garrison against a fortress', () => {
    const def = enemy('rusher', 1);
    const level = makeLevel({
      enemies: [def],
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, kind: 'fortress' },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 21 },
      ],
    });
    expect(sends(enemyCommands(createState(level, 1), def, new Rng(1)))).toHaveLength(0);
    level.towers[1]!.units = 22;
    expect(sends(enemyCommands(createState(level, 1), def, new Rng(1)))).toHaveLength(1);
  });

  it('keeps a reserve while hostile units are incoming and never sends from a doomed tower', () => {
    const def = enemy('rusher', 1);
    const state = duel(def, 20, 2);
    // Player sends 12 at the enemy: enemy must keep 12 + 2 and may only send 6 — not enough to take p (2 + 1).
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: 1 });
    expect(incomingThreat(state, 'e')).toBe(2);
    const cmds = enemyCommands(state, def, new Rng(1));
    expect(sends(cmds)).toHaveLength(1);
    applyCommand(state, cmds[0]!);
    expect(state.towers['e']!.units).toBe(4); // kept ceil(2) + 2

    const doomed = duel(def, 5, 30);
    applyCommand(doomed, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: 1 });
    expect(incomingThreat(doomed, 'e')).toBe(30);
    expect(enemyCommands(doomed, def, new Rng(1))).toEqual([]);
  });
});

describe('turtle', () => {
  it('upgrades before attacking even when the attack threshold is met', () => {
    const def = enemy('turtle', 1);
    const state = duel(def, 25, 5);
    const first = enemyCommands(state, def, new Rng(1));
    expect(first).toEqual([{ type: 'upgrade', owner: 'enemy1', towerId: 'e' }]);
    expect(sends(first)).toHaveLength(0);
    applyCommand(state, first[0]!);
    expect(state.towers['e']!.level).toBe(2);
    expect(state.towers['e']!.units).toBe(15);
    // L2→L3 costs 20: not affordable, and a turtle does not attack below max level.
    expect(enemyCommands(state, def, new Rng(1))).toEqual([]);
    state.towers['e']!.units = 20;
    const second = enemyCommands(state, def, new Rng(1));
    expect(upgrades(second)).toHaveLength(1);
  });

  it('at max level attacks only with (2 - aggression) × target', () => {
    const def = enemy('turtle', 0.5); // factor 1.5
    const state = duel(def, 16, 10);
    state.towers['e']!.level = 3;
    // needs 10 * 1.5 + 1 = 16
    for (const [units, expected] of [
      [15, 0],
      [16, 1],
    ] as const) {
      state.towers['e']!.units = units;
      let attacks = 0;
      const rng = new Rng(3);
      for (let i = 0; i < 12; i++) attacks += sends(enemyCommands(state, def, rng)).length;
      if (expected === 0) expect(attacks).toBe(0);
      else expect(attacks).toBeGreaterThan(0);
    }
  });
});

describe('turtle: cutBridge', () => {
  it('cuts the bridge under a player column that would take its max-level tower', () => {
    const def = enemy('turtle', 1);
    // 40 walk at e (L3, 20 units, 30 when they land): nothing left to upgrade and, with 42 to hold against
    // the column, nothing spare for an attack — its one move is to drown the column.
    const state = bridgeDuel(def, 20, 40);
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: 1 });
    const cmds = enemyCommands(state, def, new Rng(1));
    expect(cmds).toEqual([{ type: 'cutBridge', owner: 'enemy1', roadId: 'e-p' }]);
    applyCommand(state, cmds[0]!);
    expect(state.roads['e-p']!.cut).toBe(true);
    expect(state.queues).toHaveLength(0);
    expect(state.towers['e']!.units).toBe(20);
  });

  it('keeps the bridge under a column its garrison absorbs', () => {
    const def = enemy('turtle', 1);
    const state = bridgeDuel(def, 20, 40);
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: (5 + 0.5) / 40 });
    expect(state.queues[0]!.remaining).toBe(5);
    expect(cuts(enemyCommands(state, def, new Rng(1)))).toHaveLength(0);
  });

  it('never cuts its last route to an opponent, even to save the tower', () => {
    const def = enemy('turtle', 1);
    const state = bridgeDuel(def, 20, 40, false);
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: 1 });
    expect(cuts(enemyCommands(state, def, new Rng(1)))).toHaveLength(0);
  });

  it('does not cut pre-emptively: a big garrison across the bridge is not a column', () => {
    const def = enemy('turtle', 1);
    const state = bridgeDuel(def, 20, 40);
    expect(cuts(enemyCommands(state, def, new Rng(1)))).toHaveLength(0);
  });

  it('does not burn a bridge for a tower below max level (a fresh capture is not worth it)', () => {
    const def = enemy('turtle', 1);
    // Same lethal column, but e is L1 with 5 units: it cannot afford an upgrade under threat and lets the tower go.
    const state = bridgeDuel(def, 5, 30, true, 1);
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: 1 });
    expect(enemyCommands(state, def, new Rng(1))).toEqual([]);
    // At L2 (barracks max is L3) still no; at L3 it cuts.
    state.towers['e']!.level = 2;
    expect(cuts(enemyCommands(state, def, new Rng(1)))).toHaveLength(0);
    state.towers['e']!.level = 3;
    expect(cuts(enemyCommands(state, def, new Rng(1)))).toEqual([{ type: 'cutBridge', owner: 'enemy1', roadId: 'e-p' }]);
  });

  it('is gated by aggression like every other action, and cuts on a later tick if skipped', () => {
    const def = enemy('turtle', 0);
    const state = bridgeDuel(def, 20, 40);
    applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: 1 });
    const rng = new Rng(3);
    let total = 0;
    for (let i = 0; i < 12; i++) total += cuts(enemyCommands(state, def, rng)).length;
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(12);
  });
});

describe('rusher and opportunist never cut bridges', () => {
  for (const personality of ['rusher', 'opportunist'] as const) {
    it(personality, () => {
      const def = enemy(personality, 1);
      const state = bridgeDuel(def, 20, 40);
      applyCommand(state, { type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: 1 });
      expect(cuts(enemyCommands(state, def, new Rng(1)))).toHaveLength(0);
    });
  }
});

describe('opportunist', () => {
  it('keeps 5 in reserve when attacking', () => {
    const def = enemy('opportunist', 1);
    const state = duel(def, 12, 3);
    const cmds = enemyCommands(state, def, new Rng(1));
    expect(sends(cmds)).toHaveLength(1);
    applyCommand(state, cmds[0]!);
    expect(state.towers['e']!.units).toBe(OPPORTUNIST_RESERVE);
    expect(state.queues[0]!.remaining).toBe(7);
  });

  it('does not attack when the spare units above the reserve cannot flip the target', () => {
    const def = enemy('opportunist', 1);
    // 8 - 5 = 3 spare, target 3 needs 4.
    expect(sends(enemyCommands(duel(def, 8, 3), def, new Rng(1)))).toHaveLength(0);
    // 9 - 5 = 4 spare: attack, leaving exactly 5.
    const state = duel(def, 9, 3);
    const cmds = enemyCommands(state, def, new Rng(1));
    expect(sends(cmds)).toHaveLength(1);
    applyCommand(state, cmds[0]!);
    expect(state.towers['e']!.units).toBe(5);
  });

  it('targets the tower with the fewest units regardless of owner', () => {
    const def = enemy('opportunist', 1);
    const level = makeLevel({
      enemies: [def],
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 4 },
        { id: 'n', x: 100, y: 400, owner: 'neutral', units: 2 },
        { id: 'e', x: 600, y: 400, owner: 'enemy1', units: 12 },
      ],
      roads: [
        { a: 'p', b: 'e' },
        { a: 'n', b: 'e' },
      ],
    });
    const cmds = enemyCommands(createState(level, 1), def, new Rng(1));
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ type: 'sendUnits', from: 'e', to: 'n' });
  });

  it('upgrades when idle and rich', () => {
    const def = enemy('opportunist', 1);
    // 30 units, target 30: cannot attack; 30 ≥ 10 + 5 + 5 → upgrade.
    const cmds = enemyCommands(duel(def, 30, 30), def, new Rng(1));
    expect(cmds).toEqual([{ type: 'upgrade', owner: 'enemy1', towerId: 'e' }]);
    expect(enemyCommands(duel(def, 19, 30), def, new Rng(1))).toEqual([]);
  });
});

describe('tank factories (whole tanks only)', () => {
  /** Enemy tank factory `e` (`units` weight, level `level`) facing player barracks `p`. */
  function tankDuel(def: EnemyDef, units: number, playerUnits: number, level: 1 | 2 | 3 = 1): GameState {
    return createState(
      makeLevel({
        enemies: [def],
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: playerUnits, level: 1 },
          { id: 'e', x: 360, y: 400, owner: 'enemy1', units, level, kind: 'tankFactory' },
        ],
      }),
      1,
    );
  }

  it('rusher counts only whole tanks: 4 weight is nothing, 8 weight is one tank', () => {
    const def = enemy('rusher', 1);
    // 4 weight < one tank: nothing to send even though 4 ≥ 2 + 1.
    expect(enemyCommands(tankDuel(def, 4, 2), def, new Rng(1))).toEqual([]);
    // 8 weight vs 6: raw weight passes 6 + 1 = 7, but only one tank (5) could go — it waits.
    expect(enemyCommands(tankDuel(def, 8, 6), def, new Rng(1))).toEqual([]);
    // 10 weight vs 6: two tanks (10 ≥ 7) go.
    const state = tankDuel(def, 10, 6);
    const cmds = enemyCommands(state, def, new Rng(1));
    expect(cmds).toEqual([{ type: 'sendUnits', owner: 'enemy1', from: 'e', to: 'p', ratio: 1 }]);
    applyCommand(state, cmds[0]!);
    expect(state.queues[0]).toMatchObject({ unitKind: 'tank', remaining: 2 });
    expect(state.towers['e']!.units).toBe(0);
  });

  it('turtle at max level needs the whole-tank weight to reach its threshold', () => {
    const def = enemy('turtle', 1); // factor 1: needs target + 1
    // 9 weight vs 5: raw 9 ≥ 6 but one tank (5) < 6 — waits.
    expect(enemyCommands(tankDuel(def, 9, 5, 3), def, new Rng(1))).toEqual([]);
    const state = tankDuel(def, 10, 5, 3);
    const cmds = enemyCommands(state, def, new Rng(1));
    expect(sends(cmds)).toHaveLength(1);
    applyCommand(state, cmds[0]!);
    expect(state.queues[0]).toMatchObject({ unitKind: 'tank', remaining: 2 });
  });

  it('opportunist keeps the reserve and sends only whole tanks above it', () => {
    const def = enemy('opportunist', 1);
    // 9 - 5 = 4 spare < one tank: no attack; 9 < 10 + 5 + 5: no upgrade.
    expect(enemyCommands(tankDuel(def, 9, 3), def, new Rng(1))).toEqual([]);
    // 12 - 5 = 7 spare → one tank (5 ≥ 3 + 1); the factory keeps 7, not 5.
    const state = tankDuel(def, 12, 3);
    const cmds = enemyCommands(state, def, new Rng(1));
    expect(sends(cmds)).toHaveLength(1);
    applyCommand(state, cmds[0]!);
    expect(state.queues[0]).toMatchObject({ unitKind: 'tank', remaining: 1 });
    expect(state.towers['e']!.units).toBe(7);
  });
});

describe('runAiTick', () => {
  it('is deterministic for the same state and rng seed, and returns one command per enemy owner', () => {
    const level = makeLevel({
      enemies: [
        { owner: 'enemy1', personality: 'rusher', aggression: 0.4 },
        { owner: 'enemy2', personality: 'opportunist', aggression: 0.6 },
      ],
      towers: [
        { id: 'p', x: 360, y: 1100, owner: 'player', units: 3 },
        { id: 'e1', x: 150, y: 400, owner: 'enemy1', units: 20 },
        { id: 'e2', x: 570, y: 400, owner: 'enemy2', units: 20 },
      ],
      roads: [
        { a: 'p', b: 'e1' },
        { a: 'p', b: 'e2' },
        { a: 'e1', b: 'e2' },
      ],
    });
    const collect = (seed: number): Command[][] => {
      const state = createState(level, 5);
      const rng = new Rng(seed);
      const out: Command[][] = [];
      for (let i = 0; i < 10; i++) out.push(runAiTick(state, rng));
      return out;
    };
    const a = collect(11);
    const b = collect(11);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const all = a.flat();
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((c) => c.owner))).toEqual(new Set(['enemy1', 'enemy2']));
    // A different seed changes which ticks are skipped (aggression gate) but not the command shapes.
    const c = collect(12).flat();
    for (const cmd of c) expect(cmd.type).toBe('sendUnits');
  });
});
