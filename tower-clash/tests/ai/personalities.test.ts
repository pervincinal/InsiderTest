import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { Rng, applyCommand, createState, step } from '../../src/sim/index';
import type { Command, EnemyDef, GameState, TowerDef } from '../../src/sim/index';
import {
  COUNTER_PLAN_MS,
  DEFENCE_MIN_AGGRESSION,
  HOPELESS_MS,
  OPPORTUNIST_MAX_LINKS,
  RUSHER_MAX_LINKS,
  SIEGE_PLAN_S,
  SUPPLY_FULL_UNITS,
  TURTLE_MAX_LINKS,
  TURTLE_MIN_LEVEL,
  enemyCommands,
  opportunistCommands,
  planMsFor,
  rusherCommands,
  turtleCommands,
} from '../../src/ai/index';
import { MIN_ATTACK_MS, RETREAT_UNITS, UPGRADE_BREAK_SAFE_MS } from '../../src/ai/tactics';

/*
 * Rules v3 personalities (GDD §2.5). Aggression 1 everywhere unless a test is about the gate, so no
 * tick is skipped and the decision rule alone decides. Fixtures keep every lane length a round number.
 */

const rusher = (aggression = 1): EnemyDef => ({ owner: 'enemy1', personality: 'rusher', aggression });
const turtle = (aggression = 1): EnemyDef => ({ owner: 'enemy1', personality: 'turtle', aggression });
const opportunist = (aggression = 1): EnemyDef => ({ owner: 'enemy1', personality: 'opportunist', aggression });
const rival: EnemyDef = { owner: 'enemy2', personality: 'rusher', aggression: 1 };

function game(towers: TowerDef[], enemies: EnemyDef[] = [rusher()]): GameState {
  return createState(makeLevel({ towers, enemies }), 1);
}

const link = (from: string, to: string, owner: EnemyDef['owner'] = 'enemy1'): Command => ({ type: 'link', owner, from, to });
const unlink = (from: string, to: string, owner: EnemyDef['owner'] = 'enemy1'): Command => ({ type: 'unlink', owner, from, to });
const links = (cmds: Command[]) => cmds.filter((c) => c.type === 'link');

/** Enemy tower `e` 600 px above a target tower. */
function duel(targetUnits: number, targetOwner: 'player' | 'neutral' = 'player', enemyLevel: 1 | 2 | 3 = 1): TowerDef[] {
  return [
    { id: 'p', x: 360, y: 1000, owner: targetOwner, units: targetUnits, level: 1 },
    { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 8, level: enemyLevel },
  ];
}

describe('plan horizon and aggression', () => {
  it('planMsFor scales the personality horizon by 0.5 + 0.5 × aggression', () => {
    expect(SIEGE_PLAN_S).toEqual({ rusher: 30, turtle: 45, opportunist: 45 });
    expect(planMsFor('rusher', 1)).toBe(30_000);
    expect(planMsFor('rusher', 0)).toBe(15_000);
    expect(planMsFor('turtle', 0.5)).toBe(45_000 * 0.75);
    expect(planMsFor('opportunist', 2)).toBe(45_000); // clamped
  });

  it('the aggression gate skips a tower with probability (1 − a) × 0.5, drawn once per tower in level order', () => {
    const state = game(duel(3, 'neutral'));
    // a = 0: the draw must be ≥ 0.5 for the tower to act. Rng(1).next() is deterministic; test both outcomes.
    const r = new Rng(1).next();
    const cmds = rusherCommands(state, rusher(0), new Rng(1));
    if (r < 0.5) expect(cmds).toEqual([]);
    else expect(cmds).toEqual([link('e', 'p')]);
    // a = 1 never skips, whatever the draw.
    expect(rusherCommands(state, rusher(1), new Rng(1))).toEqual([link('e', 'p')]);
    expect(rusherCommands(state, rusher(1), new Rng(2))).toEqual([link('e', 'p')]);
  });

  it('is deterministic: same state, same rng seed, same commands', () => {
    const state = game(duel(3, 'neutral'));
    expect(enemyCommands(state, rusher(0.5), new Rng(7))).toEqual(enemyCommands(state, rusher(0.5), new Rng(7)));
  });
});

describe('rusher', () => {
  it('links when the target falls within 30 s: a player L1 at 10 over 600 px (22 s) yes, at 30 (44 s) no', () => {
    expect(rusherCommands(game(duel(10)), rusher(), new Rng(1))).toEqual([link('e', 'p')]);
    expect(rusherCommands(game(duel(30)), rusher(), new Rng(1))).toEqual([]);
  });

  it('the horizon shrinks with low aggression: the same 10-unit target (22 s) is beyond a = 0.2 (18 s)', () => {
    const state = game(duel(10));
    // Force the gate open by picking a seed whose first draw is ≥ (1 − 0.2) × 0.5 = 0.4.
    let seed = 1;
    while (new Rng(seed).next() < 0.4) seed++;
    expect(rusherCommands(state, rusher(0.2), new Rng(seed))).toEqual([]);
    expect(rusherCommands(state, rusher(0.4), new Rng(seed))).toEqual([]); // 21 s horizon
    expect(rusherCommands(state, rusher(0.5), new Rng(seed))).toEqual([link('e', 'p')]); // 22.5 s
  });

  it('never waits for a level and takes the target that falls soonest', () => {
    const state = game([
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 1, level: 1 },
      { id: 'near', x: 360, y: 700, owner: 'neutral', units: 8 }, // 300 px: 1 + 2.5 + 8 = 11.5 s
      { id: 'far', x: 60, y: 400, owner: 'neutral', units: 2 }, // 300 px: 1 + 2.5 + 2 = 5.5 s
    ]);
    expect(rusherCommands(state, rusher(), new Rng(1))).toEqual([link('e', 'far')]);
  });

  it('runs one ribbon per tower whatever the level (RUSHER_MAX_LINKS)', () => {
    expect(RUSHER_MAX_LINKS).toBe(1);
    const state = game([
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 50, level: 3 },
      { id: 'a', x: 60, y: 400, owner: 'neutral', units: 2 },
      { id: 'b', x: 660, y: 400, owner: 'neutral', units: 2 },
    ]);
    expect(links(rusherCommands(state, rusher(), new Rng(1)))).toHaveLength(1);
    applyCommand(state, link('e', 'a'));
    expect(links(rusherCommands(state, rusher(), new Rng(1)))).toHaveLength(0);
  });

  it('does not plan against the defence (a single L1 stream at a player L1 with a free link is still opened)', () => {
    const state = game(duel(3));
    expect(rusherCommands(state, rusher(), new Rng(1))).toEqual([link('e', 'p')]);
  });
});

describe('turtle', () => {
  it('opens no attack from an L1 tower, even at a 1-unit neutral next door; an L2 tower attacks', () => {
    expect(TURTLE_MIN_LEVEL).toBe(2);
    const l1 = game([
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 20, level: 1 },
      { id: 'n', x: 360, y: 700, owner: 'neutral', units: 1 },
    ]);
    expect(turtleCommands(l1, turtle(), new Rng(1))).toEqual([]);
    const l2 = game([
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 20, level: 2 },
      { id: 'n', x: 360, y: 700, owner: 'neutral', units: 1 },
    ]);
    expect(turtleCommands(l2, turtle(), new Rng(1))).toEqual([link('e', 'n')]);
  });

  it('an L3 turtle uses every link its level allows, one new stream per tick', () => {
    expect(TURTLE_MAX_LINKS).toBe(3);
    const state = game([
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 100, level: 3 },
      { id: 'a', x: 60, y: 400, owner: 'neutral', units: 2 },
      { id: 'b', x: 660, y: 400, owner: 'neutral', units: 2 },
      { id: 'c', x: 360, y: 700, owner: 'neutral', units: 2 },
    ]);
    const seen: string[] = [];
    for (let tick = 0; tick < 3; tick++) {
      const cmds = links(turtleCommands(state, turtle(), new Rng(1)));
      expect(cmds).toHaveLength(1);
      seen.push((cmds[0] as { to: string }).to);
      for (const c of cmds) applyCommand(state, c);
    }
    expect(new Set(seen).size).toBe(3);
    expect(turtleCommands(state, turtle(), new Rng(1))).toEqual([]);
  });

  it('plans against the defence: an L2 target with two links shields two L2 streams, so it takes three towers to open', () => {
    const one = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 3, level: 2 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 30, level: 2 },
    ]);
    expect(turtleCommands(one, turtle(), new Rng(1))).toEqual([]);
    const two = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 3, level: 2 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 30, level: 2 },
      { id: 'f', x: 60, y: 1000, owner: 'enemy1', units: 30, level: 2 },
    ]);
    expect(turtleCommands(two, turtle(), new Rng(1))).toEqual([]);
    const three = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 3, level: 2 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 30, level: 2 },
      { id: 'f', x: 60, y: 1000, owner: 'enemy1', units: 30, level: 2 },
      { id: 'g', x: 660, y: 1000, owner: 'enemy1', units: 30, level: 2 },
    ]);
    expect(links(turtleCommands(three, turtle(), new Rng(1)))).toHaveLength(3);
  });

  it('a capped keep supplies the growing neighbour nearest the front', () => {
    const state = game([
      { id: 'keep', x: 360, y: 200, owner: 'enemy1', units: 100, level: 3 },
      { id: 'front', x: 360, y: 500, owner: 'enemy1', units: 10, level: 1 },
      { id: 'rear', x: 360, y: 100, owner: 'enemy1', units: 5, level: 1 }, // behind the keep: its only lane is to the keep
      { id: 'p', x: 360, y: 1100, owner: 'player', units: 100, level: 3 },
    ]);
    // Nothing to attack (p is an L3 at 100 with three links to shield with), so the keep pours forward.
    expect(turtleCommands(state, turtle(), new Rng(1))).toEqual([link('keep', 'front')]);
  });
});

describe('opportunist', () => {
  it('prefers a target already under fire from someone else over one that falls sooner', () => {
    const state = game(
      [
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
        { id: 'quick', x: 60, y: 400, owner: 'neutral', units: 2 },
        { id: 'hit', x: 660, y: 400, owner: 'neutral', units: 6 },
        { id: 'r', x: 660, y: 100, owner: 'enemy2', units: 10, level: 1 },
      ],
      [opportunist(), rival],
    );
    expect(opportunistCommands(state, opportunist(), new Rng(1))).toEqual([link('e', 'quick')]);
    applyCommand(state, link('r', 'hit', 'enemy2'));
    // Contested: the rival's stream (300 px) lands first; our 300 px stream at 1/s wins the flip only if the parity says so.
    expect(links(opportunistCommands(state, opportunist(), new Rng(1)))).toHaveLength(1);
  });

  it('runs at most two ribbons per tower (OPPORTUNIST_MAX_LINKS), the second from L2 up', () => {
    expect(OPPORTUNIST_MAX_LINKS).toBe(2);
    const state = game([
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 100, level: 3 },
      { id: 'a', x: 60, y: 400, owner: 'neutral', units: 2 },
      { id: 'b', x: 660, y: 400, owner: 'neutral', units: 2 },
      { id: 'c', x: 360, y: 700, owner: 'neutral', units: 2 },
    ]);
    for (let tick = 0; tick < 3; tick++) for (const c of opportunistCommands(state, opportunist(), new Rng(1))) applyCommand(state, c);
    expect(state.links).toHaveLength(2);
  });
});

describe('shared defence (every personality)', () => {
  const sieged = (attackerLevel: 1 | 2, helper = false): GameState =>
    game([
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: attackerLevel },
      ...(helper ? [{ id: 'h', x: 60, y: 400, owner: 'enemy1' as const, units: 10, level: 1 as const }] : []),
    ]);

  it('shield: streams back on the attacker’s lane when its rate matches (L1 v L1), not when it is outrated (L1 v L2)', () => {
    const equal = sieged(1);
    applyCommand(equal, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    for (const p of [rusher(), turtle(), opportunist()]) expect(enemyCommands(equal, p, new Rng(1))).toEqual([link('e', 'p')]);
    const outrated = sieged(2);
    applyCommand(outrated, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    for (const p of [rusher(), turtle(), opportunist()]) expect(enemyCommands(outrated, p, new Rng(1))).toEqual([]);
  });

  it('counter before reinforce: the neighbour besieges the attacker’s source when it can reach it, else it reinforces', () => {
    const open = sieged(1, true);
    applyCommand(open, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    // p is linked (not growing): h's stream flips it at 1 + 5.6 + 10 = 16.6 s; e (10 + 6 grown) falls only at 22 s,
    // so the counter alone answers — no shield, no reinforcement.
    expect(enemyCommands(open, turtle(), new Rng(1))).toEqual([link('h', 'p')]);
    open.towers['e']!.units = 3; // e would fall at 6 + 9 = 15 s, before the counter frees it: it shields meanwhile
    expect(enemyCommands(open, turtle(), new Rng(1))).toEqual([link('h', 'p'), link('e', 'p')]);
    const walled = game(
      [
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'h', x: 60, y: 400, owner: 'enemy1', units: 10, level: 1 },
      ],
      [turtle()],
    );
    expect(walled.roads['h-p']).toBeDefined();
    // Without a lane to p, h can only reinforce: h → e (1/s) offsets p → e (1/s) and e holds.
    const noLane = createState(makeLevel({ enemies: [turtle()], towers: [
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'h', x: 60, y: 400, owner: 'enemy1', units: 10, level: 1 },
    ], obstacles: [{ kind: 'rock', points: [{ x: 210, y: 700 }] }] }), 1);
    expect(noLane.roads['h-p']).toBeUndefined();
    applyCommand(noLane, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    expect(enemyCommands(noLane, turtle(), new Rng(1))[0]).toEqual(link('h', 'e'));
  });

  it('counter: a second tower besieges the attacker’s source when that falls within COUNTER_PLAN_MS', () => {
    expect(COUNTER_PLAN_MS).toBe(30_000);
    const state = game([
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
      { id: 'h', x: 360, y: 700, owner: 'enemy1', units: 10, level: 1 },
      { id: 'p', x: 660, y: 700, owner: 'player', units: 4, level: 2 },
    ]);
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' }); // p (L2) outrates e's shield
    const cmds = enemyCommands(state, rusher(), new Rng(1));
    // h cannot reinforce enough (1/s v 1.43/s) but p, linked and not growing, falls to h in 1 + 2.5 + 5 = 8.5 s.
    expect(cmds).toContainEqual(link('h', 'p'));
  });
});

describe('defence needs aggression (DEFENCE_MIN_AGGRESSION)', () => {
  it('an enemy below 0.35 neither shields nor reinforces; at 0.35 it does', () => {
    expect(DEFENCE_MIN_AGGRESSION).toBe(0.35);
    const state = game([
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 3, level: 1 }, // falls at 15 s, before h's counter lands p (16.6 s)
      { id: 'h', x: 60, y: 400, owner: 'enemy1', units: 10, level: 1 },
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
    ]);
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    let seed = 1;
    const bothAct = (n: number): boolean => {
      const r = new Rng(n);
      return r.next() >= 0.4 && r.next() >= 0.4;
    };
    while (!bothAct(seed)) seed++; // both towers pass the gate this tick at a = 0.2 (skip < 0.4) and above
    const timid = rusherCommands(state, rusher(0.2), new Rng(seed));
    expect(timid).toEqual([link('h', 'p')]); // an attack (p falls within its 18 s horizon) — no shield e → p
    const brave = rusherCommands(state, rusher(0.35), new Rng(seed));
    expect(brave).toEqual([link('h', 'p'), link('e', 'p')]); // the counter, and the shield while it runs
  });
});

describe('maintain (every personality)', () => {
  it('ends an attack that has become hopeless once it has run MIN_ATTACK_MS', () => {
    expect(MIN_ATTACK_MS).toBe(5000);
    expect(HOPELESS_MS).toBe(60_000);
    const state = game([
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 8, level: 1 },
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'q', x: 60, y: 1000, owner: 'player', units: 10, level: 3 },
    ]);
    applyCommand(state, link('e', 'p'));
    applyCommand(state, { type: 'link', owner: 'player', from: 'q', to: 'p' }); // 2/s of supply: p never falls
    expect(rusherCommands(state, rusher(), new Rng(1))).toEqual([]); // committed for 5 s
    while (state.time < MIN_ATTACK_MS) step(state);
    const cmds = rusherCommands(state, rusher(), new Rng(1));
    expect(cmds[0]).toEqual(unlink('e', 'p'));
    expect(cmds.slice(1)).toEqual([link('e', 'q')]); // the freed link goes to q at once (a rusher plans against no defence)
  });

  it('keeps a stream that shields its source even when it lands nothing', () => {
    const state = game(duel(10));
    applyCommand(state, link('e', 'p'));
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    while (state.time < 10_000) step(state);
    expect(rusherCommands(state, rusher(), new Rng(1))).toEqual([]);
  });

  it('ends a supply line into a captured tower once it holds SUPPLY_FULL_UNITS, unless the source is a capped keep', () => {
    expect(SUPPLY_FULL_UNITS).toBe(5);
    const state = game([
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 8, level: 1 },
      { id: 'c', x: 360, y: 700, owner: 'enemy1', units: 4, level: 1 },
    ]);
    applyCommand(state, link('e', 'c'));
    expect(rusherCommands(state, rusher(), new Rng(1))).toEqual([]);
    state.towers['c']!.units = 5;
    expect(rusherCommands(state, rusher(), new Rng(1))).toEqual([unlink('e', 'c')]);
    state.towers['e']!.level = 3;
    state.towers['e']!.units = 100;
    expect(rusherCommands(state, rusher(), new Rng(1))).toEqual([]);
  });

  it('retreat: a tower under fire below RETREAT_UNITS drops a stream that is not winning its lane', () => {
    expect(RETREAT_UNITS).toBe(3);
    const state = game([
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 2, level: 1 },
      { id: 'n', x: 660, y: 400, owner: 'neutral', units: 80, level: 3 }, // 1 + 2.5 + 80 s: beyond HOPELESS_MS
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 20, level: 2 },
    ]);
    applyCommand(state, link('e', 'n'));
    state.towers['e']!.underFireUntilMs = state.time + 1500;
    expect(rusherCommands(state, rusher(), new Rng(1))).toEqual([unlink('e', 'n')]);
  });

  it('upgrade break: a linked tower at capacity below its top level drops its links for a tick when that is safe', () => {
    expect(UPGRADE_BREAK_SAFE_MS).toBe(3000);
    const state = game([
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 25, level: 1 },
      { id: 'n', x: 360, y: 700, owner: 'neutral', units: 10 },
    ]);
    applyCommand(state, link('e', 'n'));
    expect(rusherCommands(state, rusher(), new Rng(1))).toEqual([unlink('e', 'n')]);
    applyCommand(state, unlink('e', 'n'));
    step(state);
    expect(state.towers['e']!.level).toBe(2);
    expect(rusherCommands(state, rusher(), new Rng(1))).toEqual([link('e', 'n')]); // and back, at 1.43/s
  });
});
