import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { Rng, applyCommand, createState, step } from '../../src/sim/index';
import type { Command, EnemyDef, GameState, TowerKind } from '../../src/sim/index';
import { enemyCommands, runAiTick } from '../../src/ai/index';
import { ENEMY_MAX_LINKS, OPPORTUNIST_MAX_LINKS, OPPORTUNIST_RESERVE, SUPPLY_FULL_UNITS, supplyFull } from '../../src/ai/personalities';
import { incomingThreat, threatReserve } from '../../src/ai/common';
import { LEVELS } from '../../src/levels/index';
import { runHeadless } from '../../src/ai/headless';

/*
 * Rules v2 (GDD §2.0 / §2.5): an enemy attack is a `link`; the stream ends with `unlink` when the
 * source is threatened below its reserve or the captured target is full. Upgrades are automatic, so no
 * personality ever issues `upgrade`, and `sendUnits` is legacy: every test below asserts the exact
 * command list, and the last block runs whole levels asserting neither legacy command is ever emitted.
 */

function enemy(personality: EnemyDef['personality'], aggression: number): EnemyDef {
  return { owner: 'enemy1', personality, aggression };
}

/** p (player) — e (enemy1) on one 600 px road, with chosen garrisons (and e's level / kind). */
function duel(enemyDef: EnemyDef, enemyUnits: number, playerUnits: number, level: 1 | 2 | 3 = 1, kind: TowerKind = 'barracks'): GameState {
  return createState(
    makeLevel({
      enemies: [enemyDef],
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: playerUnits, level: 1 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: enemyUnits, level, kind },
      ],
    }),
    1,
  );
}

const links = (cmds: Command[]) => cmds.filter((c) => c.type === 'link');
const unlinks = (cmds: Command[]) => cmds.filter((c) => c.type === 'unlink');
const cuts = (cmds: Command[]) => cmds.filter((c) => c.type === 'cutBridge');
const legacy = (cmds: Command[]) => cmds.filter((c) => c.type === 'upgrade' || c.type === 'sendUnits');
const linkCmd = (from: string, to: string): Command => ({ type: 'link', owner: 'enemy1', from, to });

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
  it('links to the target only when garrison ≥ target + 3 at aggression 0', () => {
    const def = enemy('rusher', 0);
    // aggression 0 skips half the ticks: try several ticks per case so the gate never hides the rule.
    for (const [units, expected] of [
      [12, 0],
      [13, 1],
    ] as const) {
      const rng = new Rng(7);
      let attacks = 0;
      for (let i = 0; i < 12; i++) attacks += links(enemyCommands(duel(def, units, 10), def, rng)).length;
      if (expected === 0) expect(attacks).toBe(0);
      else expect(attacks).toBeGreaterThan(0);
    }
  });

  it('at aggression 1 never skips and needs just enough to flip the tower: 10 v 10 waits, 11 v 10 links', () => {
    const def = enemy('rusher', 1);
    expect(enemyCommands(duel(def, 10, 10), def, new Rng(1))).toEqual([]);
    expect(enemyCommands(duel(def, 11, 10), def, new Rng(1))).toEqual([linkCmd('e', 'p')]);
  });

  it('needs double the garrison against a fortress: 21 v 10 waits, 22 links', () => {
    const def = enemy('rusher', 1);
    const level = makeLevel({
      enemies: [def],
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, kind: 'fortress' },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 21 },
      ],
    });
    expect(enemyCommands(createState(level, 1), def, new Rng(1))).toEqual([]);
    level.towers[1]!.units = 22;
    expect(enemyCommands(createState(level, 1), def, new Rng(1))).toEqual([linkCmd('e', 'p')]);
  });

  it('keeps the stream while it drains, and ends it once the captured target holds SUPPLY_FULL_UNITS', () => {
    const def = enemy('rusher', 1);
    const state = duel(def, 12, 3);
    for (const cmd of enemyCommands(state, def, new Rng(1))) applyCommand(state, cmd);
    expect(state.links).toHaveLength(1);
    expect(SUPPLY_FULL_UNITS).toBe(5);
    expect(supplyFull(state, state.towers['p']!)).toBe(5);
    // e pours its 12 in 1.5 s and then trickles at 1/s; p grows 1/s and absorbs the burst: no re-link, no unlink.
    let captureMs = 0;
    let unlinkMs = 0;
    for (let tick = 0; tick < 200 && unlinkMs === 0; tick++) {
      step(state);
      if (state.events.some((e) => e.type === 'capture')) captureMs = state.time;
      if (state.time % 500 !== 0) continue;
      const cmds = enemyCommands(state, def, new Rng(1));
      if (captureMs === 0) expect(cmds).toEqual([]);
      if (unlinks(cmds).length) {
        unlinkMs = state.time;
        expect(cmds).toEqual([{ type: 'unlink', owner: 'enemy1', from: 'e', to: 'p' }]);
      }
    }
    expect(captureMs).toBe(6150); // the 12th unit lands on an empty tower
    expect(state.towers['p']!.owner).toBe('enemy1');
    // Unlinked on the first tick the captured tower held 5 (the trickle plus its own production).
    expect(state.towers['p']!.units).toBe(5);
    expect(unlinkMs).toBe(7000);
  });

  it('stops every stream when a hostile column approaches while its garrison is under the reserve, and links nothing new', () => {
    const def = enemy('rusher', 1);
    const state = duel(def, 12, 3);
    applyCommand(state, linkCmd('e', 'p'));
    for (let i = 0; i < 30; i++) step(state); // 1.5 s: e has poured 12 and holds 1 fresh unit
    expect(state.towers['e']!.units).toBe(1);
    expect(enemyCommands(state, def, new Rng(1))).toEqual([]);
    // The player streams back: 4 units still to drain out of p count as an approaching column.
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    expect(incomingThreat(state, 'e')).toBe(4);
    expect(threatReserve(state, state.towers['e']!)).toBe(6);
    expect(enemyCommands(state, def, new Rng(1))).toEqual([{ type: 'unlink', owner: 'enemy1', from: 'e' }]);
  });

  it('never links a target it already streams to, and runs one stream per tower whatever its level', () => {
    const def = enemy('rusher', 1);
    const level = makeLevel({
      enemies: [def],
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 2 },
        { id: 'q', x: 60, y: 400, owner: 'player', units: 2 },
        { id: 'e', x: 660, y: 400, owner: 'enemy1', units: 40, level: 3 },
      ],
      roads: [
        { a: 'p', b: 'e' },
        { a: 'q', b: 'e' },
      ],
    });
    const state = createState(level, 1);
    const first = enemyCommands(state, def, new Rng(1));
    expect(first).toHaveLength(ENEMY_MAX_LINKS);
    expect(first[0]).toMatchObject({ type: 'link', from: 'e' });
    applyCommand(state, first[0]!);
    expect(enemyCommands(state, def, new Rng(1))).toEqual([]);
  });
});

describe('turtle', () => {
  it('issues nothing below max level — it grows to 100 unlinked instead of upgrading', () => {
    const def = enemy('turtle', 1);
    expect(enemyCommands(duel(def, 25, 5, 1), def, new Rng(1))).toEqual([]);
    expect(enemyCommands(duel(def, 50, 5, 2), def, new Rng(1))).toEqual([]);
    // Left alone the sim upgrades it by itself: 5 → L2 at 25, L3 at 50 (and the turtle still waits).
    const state = duel(def, 24, 5, 1);
    for (let i = 0; i < 20; i++) step(state); // 1 s: one unit produced → 25 → L2
    expect(state.towers['e']!).toMatchObject({ level: 2, units: 25 });
    expect(enemyCommands(state, def, new Rng(1))).toEqual([]);
  });

  it('at max level links only with (2 − aggression) × target + 1: 15 v 10 waits at aggression 0.5, 16 links', () => {
    const def = enemy('turtle', 0.5); // factor 1.5: needs 10 × 1.5 + 1 = 16
    expect(enemyCommands(duel(def, 15, 10, 3), def, new Rng(1))).toEqual([]);
    expect(enemyCommands(duel(def, 16, 10, 3), def, new Rng(1))).toEqual([linkCmd('e', 'p')]);
  });

  it('a fortress is finished at L2', () => {
    const def = enemy('turtle', 1);
    const level = makeLevel({
      enemies: [def],
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 5 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 20, level: 2, kind: 'fortress' },
      ],
    });
    expect(enemyCommands(createState(level, 1), def, new Rng(1))).toEqual([linkCmd('e', 'p')]);
  });
});

describe('turtle: cutBridge', () => {
  it('cuts the bridge under a player stream that would take its max-level tower', () => {
    const def = enemy('turtle', 1);
    // p (40) streams at e (L3, 20): the 40 still to drain out of p are the column on the bridge.
    const state = bridgeDuel(def, 20, 40);
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    const cmds = enemyCommands(state, def, new Rng(1));
    expect(cmds).toEqual([{ type: 'cutBridge', owner: 'enemy1', roadId: 'e-p' }]);
    applyCommand(state, cmds[0]!);
    expect(state.roads['e-p']!.cut).toBe(true);
    expect(state.links).toHaveLength(0); // the stream dies with the road
    expect(state.towers['e']!.units).toBe(20);
  });

  it('keeps the bridge under a stream its garrison absorbs', () => {
    const def = enemy('turtle', 1);
    const state = bridgeDuel(def, 20, 5);
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    expect(cuts(enemyCommands(state, def, new Rng(1)))).toHaveLength(0);
  });

  it('never cuts its last route to an opponent, even to save the tower', () => {
    const def = enemy('turtle', 1);
    const state = bridgeDuel(def, 20, 40, false);
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    expect(cuts(enemyCommands(state, def, new Rng(1)))).toHaveLength(0);
  });

  it('does not cut pre-emptively: a big garrison across the bridge is not a column', () => {
    const def = enemy('turtle', 1);
    const state = bridgeDuel(def, 20, 40);
    expect(cuts(enemyCommands(state, def, new Rng(1)))).toHaveLength(0);
  });

  it('does not burn a bridge for a tower below max level (a fresh capture is not worth it)', () => {
    const def = enemy('turtle', 1);
    const state = bridgeDuel(def, 5, 30, true, 1);
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    expect(enemyCommands(state, def, new Rng(1))).toEqual([]);
    state.towers['e']!.level = 2;
    expect(cuts(enemyCommands(state, def, new Rng(1)))).toHaveLength(0);
    state.towers['e']!.level = 3;
    expect(cuts(enemyCommands(state, def, new Rng(1)))).toEqual([{ type: 'cutBridge', owner: 'enemy1', roadId: 'e-p' }]);
  });

  it('never cuts a bridge its own stream uses', () => {
    const def = enemy('turtle', 1);
    const state = bridgeDuel(def, 100, 40);
    applyCommand(state, linkCmd('e', 'p')); // the turtle's own attack over the bridge
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    expect(cuts(enemyCommands(state, def, new Rng(1)))).toHaveLength(0);
  });

  it('is gated by aggression like every other action, and cuts on a later tick if skipped', () => {
    const def = enemy('turtle', 0);
    const state = bridgeDuel(def, 20, 40);
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
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
      applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
      expect(cuts(enemyCommands(state, def, new Rng(1)))).toHaveLength(0);
    });
  }
});

describe('opportunist', () => {
  it('links when the units above its reserve of 5 can flip the target: 8 v 3 waits, 9 v 3 links', () => {
    const def = enemy('opportunist', 1);
    expect(OPPORTUNIST_RESERVE).toBe(5);
    expect(enemyCommands(duel(def, 8, 3), def, new Rng(1))).toEqual([]); // 3 spare, target 3 needs 4
    expect(enemyCommands(duel(def, 9, 3), def, new Rng(1))).toEqual([linkCmd('e', 'p')]);
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
    expect(enemyCommands(createState(level, 1), def, new Rng(1))).toEqual([linkCmd('e', 'n')]);
  });

  it('runs two streams at L2 when half the spare garrison takes each target, one at L1', () => {
    const def = enemy('opportunist', 1);
    const level = (units: number, lvl: 1 | 2) =>
      makeLevel({
        enemies: [def],
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 3 },
          { id: 'n', x: 100, y: 400, owner: 'neutral', units: 3 },
          { id: 'e', x: 600, y: 400, owner: 'enemy1', units, level: lvl },
        ],
        roads: [
          { a: 'p', b: 'e' },
          { a: 'n', b: 'e' },
        ],
      });
    expect(OPPORTUNIST_MAX_LINKS).toBe(2);
    // 13 − 5 = 8 spare, half 4 ≥ 3 + 1 for both targets: two streams (p first: equal units, lower cost).
    expect(enemyCommands(createState(level(13, 2), 1), def, new Rng(1))).toEqual([linkCmd('e', 'p'), linkCmd('e', 'n')]);
    // 12 − 5 = 7 spare: half 3 < 4 — one stream only.
    expect(enemyCommands(createState(level(12, 2), 1), def, new Rng(1))).toEqual([linkCmd('e', 'p')]);
    // L1 allows one link however rich the tower is.
    expect(enemyCommands(createState(level(30, 1), 1), def, new Rng(1))).toEqual([linkCmd('e', 'p')]);
  });

  it('never issues upgrade commands, however rich and idle', () => {
    const def = enemy('opportunist', 1);
    expect(enemyCommands(duel(def, 30, 30), def, new Rng(1))).toEqual([]);
    expect(enemyCommands(duel(def, 49, 60, 2), def, new Rng(1))).toEqual([]);
  });
});

describe('tank factories (whole tanks only)', () => {
  it('rusher counts only whole tanks: 4 weight is nothing, 8 weight is one tank, 10 weight goes', () => {
    const def = enemy('rusher', 1);
    expect(enemyCommands(duel(def, 4, 2, 1, 'tankFactory'), def, new Rng(1))).toEqual([]);
    // 8 weight vs 6: raw weight passes 6 + 1 = 7, but only one tank (5) could go — it waits.
    expect(enemyCommands(duel(def, 8, 6, 1, 'tankFactory'), def, new Rng(1))).toEqual([]);
    const state = duel(def, 10, 6, 1, 'tankFactory');
    expect(enemyCommands(state, def, new Rng(1))).toEqual([linkCmd('e', 'p')]);
    applyCommand(state, linkCmd('e', 'p'));
    for (let i = 0; i < 3; i++) step(state);
    expect(state.units[0]).toMatchObject({ kind: 'tank', weight: 5, owner: 'enemy1' });
  });

  it('turtle at max level needs the whole-tank weight to reach its threshold', () => {
    const def = enemy('turtle', 1); // factor 1: needs target + 1
    expect(enemyCommands(duel(def, 9, 5, 3, 'tankFactory'), def, new Rng(1))).toEqual([]);
    expect(enemyCommands(duel(def, 10, 5, 3, 'tankFactory'), def, new Rng(1))).toEqual([linkCmd('e', 'p')]);
  });

  it('opportunist keeps the reserve and counts only whole tanks above it', () => {
    const def = enemy('opportunist', 1);
    expect(enemyCommands(duel(def, 9, 3, 1, 'tankFactory'), def, new Rng(1))).toEqual([]); // 4 spare < one tank
    expect(enemyCommands(duel(def, 12, 3, 1, 'tankFactory'), def, new Rng(1))).toEqual([linkCmd('e', 'p')]); // 7 spare → one tank
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
    for (const cmd of c) expect(cmd.type).toBe('link');
  });
});

describe('no legacy commands', () => {
  for (const id of [1, 4, 6, 9, 33]) {
    it(`level ${id}: enemies never issue upgrade or sendUnits over 60 s`, () => {
      const level = LEVELS.find((l) => l.id === id)!;
      const state = createState(level, 1);
      const rng = new Rng(3);
      const seen = new Set<string>();
      for (let tick = 0; tick < 1200; tick++) {
        if (state.time % 500 === 0) {
          const cmds = runAiTick(state, rng);
          expect(legacy(cmds)).toEqual([]);
          for (const cmd of cmds) {
            seen.add(cmd.type);
            applyCommand(state, cmd);
          }
        }
        step(state);
      }
      expect([...seen].every((t) => t === 'link' || t === 'unlink' || t === 'cutBridge')).toBe(true);
      // and the idle player still never wins the level
      expect(runHeadless(level, 1, undefined, { maxMs: 60_000 }).outcome).not.toBe('won');
    });
  }
});
