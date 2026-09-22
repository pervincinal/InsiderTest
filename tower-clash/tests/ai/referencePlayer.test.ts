import { describe, expect, it } from 'vitest';
import { makeLevel, wall } from '../helpers';
import { Rng, applyCommand, createState, step } from '../../src/sim/index';
import type { Command, GameState, TowerDef } from '../../src/sim/index';
import { ATTACK_PLAN_MS, CAPTURE_PLAN_MS, GROWER_MIN_TOWERS, GROW_FIRST_MS, grower, growsFirst, hopsToOpponent, ownedTowers, referencePlayerCommands } from '../../src/ai/index';
import { CONTEST_PENALTY_MS, HOPELESS_MS } from '../../src/ai/referencePlayer';
import { RACE_MARGIN_MS } from '../../src/ai/tactics';
import { MIN_LANDING_SHARE } from '../../src/ai/common';

/*
 * Reference player (GDD §2.5, rules v3). Every test asserts the exact commands of one tick on a small
 * fixture; the campaign-level behaviour (level 1 win, determinism, idle player) lives in headless.test.ts.
 */

function game(towers: TowerDef[], over: Parameters<typeof makeLevel>[0] = {}): GameState {
  return createState(makeLevel({ towers, ...over }), 1);
}
const link = (from: string, to: string): Command => ({ type: 'link', owner: 'player', from, to });
const unlink = (from: string, to: string): Command => ({ type: 'unlink', owner: 'player', from, to });
const bot = (state: GameState, trace?: (rule: string, cmd: Command) => void) => referencePlayerCommands(state, new Rng(1), trace);
function enemyLink(state: GameState, from: string, to: string): void {
  applyCommand(state, { type: 'link', owner: 'enemy1', from, to });
}

describe('capture (rule 2)', () => {
  it('opens with the neutral that falls soonest and traces the rule', () => {
    const state = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 12 },
      { id: 'cheap', x: 60, y: 1100, owner: 'neutral', units: 4 }, // 1 + 2.5 + 4 = 7.5 s
      { id: 'dear', x: 660, y: 1100, owner: 'neutral', units: 9 }, // 12.5 s
      { id: 'foe', x: 360, y: 300, owner: 'enemy1', units: 8 },
    ]);
    const rules: string[] = [];
    expect(bot(state, (rule) => rules.push(rule))).toEqual([link('home', 'cheap')]);
    expect(rules).toEqual(['capture']);
    expect(CAPTURE_PLAN_MS).toBe(30_000);
  });

  it('never wastes a link: a neutral that cannot fall within the horizon is left alone and the tower grows', () => {
    const state = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 12 },
      { id: 'big', x: 360, y: 500, owner: 'neutral', units: 40, level: 3 }, // 1 + 5 + 40 = 46 s
      { id: 'foe', x: 60, y: 300, owner: 'enemy1', units: 100, level: 3 },
    ]);
    expect(bot(state)).toEqual([]);
  });

  it('stacks links from several towers when one stream cannot break the target in time', () => {
    const state = game([
      { id: 'rear', x: 360, y: 1250, owner: 'player', units: 30, level: 2 }, // the grower: kept out of captures
      { id: 'a', x: 60, y: 1100, owner: 'player', units: 12 },
      { id: 'b', x: 660, y: 1100, owner: 'player', units: 12 },
      { id: 'big', x: 360, y: 700, owner: 'neutral', units: 40, level: 3 }, // 500 px: one stream 45 s, two 25 s
      { id: 'foe', x: 360, y: 100, owner: 'enemy1', units: 100, level: 3 },
    ]);
    expect(grower(state, hopsToOpponent(state, 'player'))?.id).toBe('rear');
    expect(bot(state)).toEqual([link('a', 'big'), link('b', 'big')]);
  });

  it('keeps the growing keep out of captures while it holds ≥ GROWER_MIN_TOWERS towers', () => {
    expect(GROWER_MIN_TOWERS).toBe(2);
    const state = game([
      { id: 'rear', x: 360, y: 1200, owner: 'player', units: 20, level: 1 },
      { id: 'front', x: 360, y: 900, owner: 'player', units: 5, level: 1 },
      { id: 'n', x: 60, y: 900, owner: 'neutral', units: 3 },
      { id: 'foe', x: 360, y: 300, owner: 'enemy1', units: 8 },
    ]);
    const hops = hopsToOpponent(state, 'player');
    expect(grower(state, hops)?.id).toBe('rear');
    // rear also has a lane to n (no tower between), but front takes it and rear grows.
    expect(state.roads['n-rear']).toBeDefined();
    expect(bot(state)).toEqual([link('front', 'n')]);
    state.towers['rear']!.level = 3; // a finished keep is no grower: the next one is
    expect(grower(state, hops)?.id).toBe('front');
  });

  it('does not race a contested neutral it would lose on parity, and prefers uncontested ones', () => {
    // Level-1 geometry: equal L1 rates, ours 1.5 s ahead, a 5-unit camp: the rival's landing at 7.9 s is the 6th.
    const state = game([
      { id: 'home', x: 200, y: 1100, owner: 'player', units: 12 },
      { id: 'camp', x: 520, y: 760, owner: 'neutral', units: 5 },
      { id: 'foe', x: 200, y: 340, owner: 'enemy1', units: 8 },
    ]);
    applyCommand(state, link('home', 'camp'));
    for (let i = 0; i < 30; i++) step(state);
    enemyLink(state, 'foe', 'camp');
    const cmds = bot(state);
    expect(cmds[0]).toEqual(unlink('home', 'camp')); // feeding the rival's capture is waste
    expect(cmds[1]).toEqual(link('home', 'foe')); // foe's only link is busy: the stream lands unopposed
    expect(CONTEST_PENALTY_MS).toBe(10_000);
  });

  it('hold check: a neutral next to a stronger enemy tower is not taken (it would be lost at once)', () => {
    const state = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 12, level: 1 },
      { id: 'n', x: 360, y: 800, owner: 'neutral', units: 2 },
      { id: 'keep', x: 360, y: 500, owner: 'enemy1', units: 60, level: 3 }, // 2/s with free links
    ]);
    expect(bot(state)).toEqual([]);
    state.towers['keep']!.level = 1; // 1/s: our 1/s supply can hold it
    expect(bot(state)).toEqual([link('home', 'n')]);
  });
});

describe('attack (rule 3)', () => {
  it('focuses on the enemy tower that falls soonest, planning against its shield and reinforcement', () => {
    expect(ATTACK_PLAN_MS).toBe(45_000);
    const state = game([
      { id: 'a', x: 60, y: 1100, owner: 'player', units: 20, level: 2 },
      { id: 'b', x: 660, y: 1100, owner: 'player', units: 20, level: 2 },
      { id: 'weak', x: 360, y: 700, owner: 'enemy1', units: 3, level: 1 }, // one link: shields one of two L2 streams
      { id: 'far', x: 60, y: 300, owner: 'enemy1', units: 3, level: 1 },
    ]);
    // a is the growing keep (tie → first), so b opens on weak (L1: it cannot match an L2 stream, one breaks it);
    // far is reachable from a only, and a joins as the last resort.
    expect(grower(state, hopsToOpponent(state, 'player'))?.id).toBe('a');
    expect(bot(state)).toEqual([link('b', 'weak'), link('a', 'far')]);
    state.towers['weak']!.level = 2; // two links: it would shield both L2 streams — nothing is opened
    state.towers['far']!.level = 3;
    expect(bot(state)).toEqual([]);
    // far (L1) already supplies weak with its only link (1/s) and weak's one free link shields one stream:
    // b is shielded, a's 1.43/s nets 0.43/s over the supply — both are needed, the keep last.
    state.towers['far']!.level = 1;
    applyCommand(state, { type: 'link', owner: 'enemy1', from: 'weak', to: 'far' });
    applyCommand(state, { type: 'link', owner: 'enemy1', from: 'far', to: 'weak' });
    expect(bot(state)).toEqual([link('b', 'weak'), link('a', 'weak')]);
  });

  it('an equal-level tower with a free link on a single lane is not attacked (it would shield) — the tower grows instead', () => {
    const state = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 12, level: 1 },
      { id: 'foe', x: 360, y: 500, owner: 'enemy1', units: 3, level: 1 },
    ]);
    expect(bot(state)).toEqual([]);
    enemyLink(state, 'foe', 'home'); // its only link is now busy: the counter lands
    expect(bot(state)).toContainEqual(link('home', 'foe'));
  });

  it('the growing keep joins an attack only as a last resort', () => {
    // foe (L1, one free link) shields front's 1/s; the grower's 1.43/s is then unmatched and breaks it.
    const towers: TowerDef[] = [
      { id: 'rear', x: 360, y: 1200, owner: 'player', units: 20, level: 2 },
      { id: 'front', x: 60, y: 900, owner: 'player', units: 5, level: 1 },
      { id: 'foe', x: 60, y: 500, owner: 'enemy1', units: 30, level: 1 },
    ];
    const alone = game(towers);
    expect(grower(alone, hopsToOpponent(alone, 'player'))?.id).toBe('rear');
    expect(bot(alone)).toEqual([link('front', 'foe'), link('rear', 'foe')]);
    // With a third tower the grower stays out: front is shielded, side lands.
    const withSide = game([...towers, { id: 'side', x: 660, y: 900, owner: 'player', units: 10, level: 1 }]);
    expect(bot(withSide)).toEqual([link('front', 'foe'), link('side', 'foe')]);
  });
});

describe('defend (rule 1)', () => {
  it('reinforces a sieged tower from a neighbour when that makes it hold (and no counter is possible)', () => {
    const state = game(
      [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 3, level: 1 },
        { id: 'q', x: 60, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
      ],
      { obstacles: [{ kind: 'rock', points: [{ x: 210, y: 700 }] }] }, // blocks q–e: no counter
    );
    expect(state.roads['e-q']).toBeUndefined();
    enemyLink(state, 'e', 'p');
    const rules: string[] = [];
    const cmds = bot(state, (r) => rules.push(r));
    expect(cmds[0]).toEqual(link('q', 'p'));
    expect(rules[0]).toBe('reinforce');
  });

  it('counter comes first: with a lane to the attacker’s source the helper besieges it and the tower shields meanwhile', () => {
    const state = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 3, level: 1 },
      { id: 'q', x: 60, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
    ]);
    enemyLink(state, 'e', 'p');
    const rules: string[] = [];
    // e is linked (not growing): q's stream lands from 6.6 s and flips it at 17.6 s; p would fall at 10 s, so it shields.
    expect(bot(state, (r) => rules.push(r))).toEqual([link('q', 'e'), link('p', 'e')]);
    expect(rules).toEqual(['counter', 'shield']);
  });

  it('counters: besieges the attacker’s source from a second tower when a reinforcement cannot save the target', () => {
    const state = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 3, level: 1 },
      { id: 'q', x: 660, y: 700, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 4, level: 2 }, // 1.43/s: q's 1/s supply cannot hold p
    ]);
    enemyLink(state, 'e', 'p');
    const rules: string[] = [];
    const cmds = bot(state, (r) => rules.push(r));
    expect(cmds).toContainEqual(link('q', 'e')); // e is linked (not growing): 1 + 3.5 + 5 = 9.5 s
    expect(rules).toContain('counter');
  });

  it('shields: streams back on the attacker’s lane when its rate matches, reclaiming a slower attack', () => {
    const state = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
      { id: 'n', x: 660, y: 1000, owner: 'neutral', units: 20 },
    ]);
    applyCommand(state, link('p', 'n')); // a 24 s capture
    enemyLink(state, 'e', 'p'); // p falls at 1 + 5 + 11 = 17 s: before n would fall
    const cmds = bot(state);
    expect(cmds).toEqual([unlink('p', 'n'), link('p', 'e')]);
  });

  it('does not shield an attacker it cannot match', () => {
    const state = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 2 },
    ]);
    enemyLink(state, 'e', 'p');
    expect(bot(state)).toEqual([]);
  });

  it('shield race (RACE_MARGIN_MS): drops a shield for an attack whose target falls first', () => {
    expect(RACE_MARGIN_MS).toBe(1000);
    // Level-3 standoff: p shields w; foe's only link shields q; foe (3) falls to p in 1 + 5 + 4 = 10 s,
    // p (20) would fall to w's stream in ≈ 1.5 + 21 s: the race is worth it.
    const state = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 20, level: 1 },
      { id: 'q', x: 660, y: 700, owner: 'player', units: 1, level: 1 },
      { id: 'w', x: 60, y: 1000, owner: 'enemy1', units: 5, level: 1 },
      { id: 'foe', x: 360, y: 400, owner: 'enemy1', units: 3, level: 1 },
    ]);
    enemyLink(state, 'w', 'p');
    applyCommand(state, link('p', 'w'));
    applyCommand(state, link('q', 'foe'));
    enemyLink(state, 'foe', 'q');
    for (let i = 0; i < 40; i++) step(state); // the standoff is running
    expect(bot(state)).toEqual([unlink('p', 'w'), link('p', 'foe')]);
  });
});

describe('maintain (rule 0) and supply (rule 4)', () => {
  it('ends a hopeless attack after its commitment, but keeps a shield', () => {
    const state = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
      { id: 'k', x: 60, y: 400, owner: 'enemy1', units: 100, level: 3 },
    ]);
    applyCommand(state, link('p', 'e'));
    enemyLink(state, 'k', 'e'); // 2/s of supply: e never falls
    while (state.time < 5000) step(state);
    expect(bot(state)).toEqual([unlink('p', 'e')]);
    expect(HOPELESS_MS).toBe(60_000);
    enemyLink(state, 'e', 'p');
    expect(bot(state)).toEqual([]); // now a shield: kept
  });

  it('a supply line that is no reinforcement ends unless its source is a capped keep', () => {
    const state = game([
      { id: 'r', x: 360, y: 1200, owner: 'player', units: 20, level: 2 },
      { id: 'f', x: 360, y: 900, owner: 'player', units: 5, level: 1 },
      { id: 'e', x: 360, y: 300, owner: 'enemy1', units: 100, level: 3 },
    ]);
    applyCommand(state, link('r', 'f'));
    expect(bot(state)).toEqual([unlink('r', 'f')]);
    state.towers['r']!.level = 3;
    state.towers['r']!.units = 100;
    expect(bot(state)).toEqual([]);
  });

  it('a capped keep with nothing to attack pours into the emptiest friendly neighbour nearest the front', () => {
    const state = game([
      { id: 'keep', x: 360, y: 1200, owner: 'player', units: 100, level: 3 },
      { id: 'a', x: 60, y: 900, owner: 'player', units: 30, level: 2 },
      { id: 'b', x: 660, y: 900, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 360, y: 300, owner: 'enemy1', units: 100, level: 3 },
    ]);
    const rules: string[] = [];
    expect(bot(state, (r) => rules.push(r))).toEqual([link('keep', 'b')]);
    expect(rules).toEqual(['supply']);
  });

  it('upgrade break: a linked L1 at 25 drops its link, upgrades next tick and re-links at the L2 rate', () => {
    const state = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 25, level: 1 },
      { id: 'n', x: 360, y: 400, owner: 'neutral', units: 10 },
    ]);
    applyCommand(state, link('p', 'n'));
    const rules: string[] = [];
    expect(bot(state, (r) => rules.push(r))).toEqual([unlink('p', 'n')]);
    expect(rules).toEqual(['upgrade']);
    applyCommand(state, unlink('p', 'n'));
    step(state);
    expect(state.towers['p']!.level).toBe(2);
    expect(bot(state)).toEqual([link('p', 'n')]);
  });

  it('retreat: a tower under fire below 3 units drops a stream that is not winning its lane', () => {
    const state = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 2, level: 1 },
      { id: 'n', x: 660, y: 1000, owner: 'neutral', units: 80, level: 3 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 2 },
    ]);
    applyCommand(state, link('p', 'n'));
    state.towers['p']!.underFireUntilMs = 1500;
    expect(bot(state)).toEqual([unlink('p', 'n')]);
  });
});

describe('purity', () => {
  it('reads only the state: two calls on the same state give the same commands and mutate nothing', () => {
    const state = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 12 },
      { id: 'n', x: 60, y: 1100, owner: 'neutral', units: 4 },
      { id: 'foe', x: 360, y: 300, owner: 'enemy1', units: 8 },
    ]);
    const before = JSON.stringify(state);
    const a = bot(state);
    const b = bot(state);
    expect(a).toEqual(b);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('a wall with no lane through it leaves the bot with nothing to do', () => {
    const state = game(
      [
        { id: 'home', x: 360, y: 1100, owner: 'player', units: 12 },
        { id: 'foe', x: 360, y: 300, owner: 'enemy1', units: 2 },
      ],
      { obstacles: [wall(100, 700, 620, 700)] },
    );
    expect(bot(state)).toEqual([]);
  });
});

describe('grow first (AI-7a): a lone home within GROW_FIRST_MS of its next level grows before it expands', () => {
  it('an L1 at 18 (7 s to L2) opens no capture; at 12 (13 s) it captures at once', () => {
    expect(GROW_FIRST_MS).toBe(8_000);
    const near = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 18 },
      { id: 'n', x: 60, y: 1100, owner: 'neutral', units: 4 },
      { id: 'foe', x: 360, y: 300, owner: 'enemy1', units: 8 },
    ]);
    expect(growsFirst(near, ownedTowers(near, 'player'))?.id).toBe('home');
    expect(bot(near)).toEqual([]);
    const far = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 12 },
      { id: 'n', x: 60, y: 1100, owner: 'neutral', units: 4 },
      { id: 'foe', x: 360, y: 300, owner: 'enemy1', units: 8 },
    ]);
    expect(growsFirst(far, ownedTowers(far, 'player'))).toBeUndefined();
    expect(bot(far)).toEqual([link('home', 'n')]);
  });

  it('grows through to the level and then streams at the L2 rate with two links', () => {
    const state = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 18 },
      { id: 'n', x: 60, y: 1100, owner: 'neutral', units: 4 },
      { id: 'm', x: 660, y: 1100, owner: 'neutral', units: 4 },
      { id: 'foe', x: 360, y: 300, owner: 'enemy1', units: 8 },
    ]);
    let issued: Command[] = [];
    while (state.time < 8_000 && issued.length === 0) {
      if (state.time % 500 === 0) {
        issued = bot(state);
        for (const c of issued) applyCommand(state, c);
      }
      step(state);
    }
    expect(state.towers['home']!.level).toBe(2);
    expect(state.time).toBeLessThanOrEqual(7_500);
    expect(issued).toEqual([link('home', 'm')]); // one new stream per tower per tick (readable ribbons)
    while (state.time % 500 !== 0) step(state);
    expect(bot(state)).toEqual([link('home', 'n')]); // the second link the level allows
  });

  it('never waits under siege, and not at all once we hold GROWER_MIN_TOWERS towers', () => {
    const sieged = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 18 },
      { id: 'n', x: 60, y: 1100, owner: 'neutral', units: 4 },
      { id: 'foe', x: 360, y: 500, owner: 'enemy1', units: 8 },
    ]);
    enemyLink(sieged, 'foe', 'home');
    expect(growsFirst(sieged, ownedTowers(sieged, 'player'))).toBeUndefined();
    expect(bot(sieged).length).toBeGreaterThan(0);
    const two = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 18 },
      { id: 'side', x: 660, y: 1100, owner: 'player', units: 18 },
      { id: 'n', x: 60, y: 1100, owner: 'neutral', units: 4 },
      { id: 'foe', x: 360, y: 300, owner: 'enemy1', units: 8 },
    ]);
    expect(growsFirst(two, ownedTowers(two, 'player'))).toBeUndefined();
  });
});

describe('shield reclaims a reinforcement (AI-7b): a falling tower saves itself before its neighbour', () => {
  /** `a` reinforces `b` (which falls to `f` without it); `e` streams at `a`; no lane b–e (rock), so no counter. */
  function fixture(): GameState {
    const state = game(
      [
        { id: 'a', x: 360, y: 1000, owner: 'player', units: 5 },
        { id: 'b', x: 60, y: 1000, owner: 'player', units: 3 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 },
        { id: 'f', x: 60, y: 400, owner: 'enemy1', units: 10 },
      ],
      { obstacles: [{ kind: 'rock', points: [{ x: 210, y: 700 }] }] },
    );
    expect(state.roads['b-e']).toBeUndefined();
    expect(state.roads['a-f']).toBeUndefined();
    enemyLink(state, 'f', 'b');
    enemyLink(state, 'e', 'a');
    applyCommand(state, link('b', 'f')); // b's only link shields its lane: it cannot reinforce a
    applyCommand(state, link('a', 'b'));
    return state;
  }

  it('drops a->b (a reinforcement) for the shield a->e when the shield makes `a` hold', () => {
    const state = fixture();
    const rules: string[] = [];
    const cmds = bot(state, (r) => rules.push(r));
    expect(cmds).toEqual([unlink('a', 'b'), link('a', 'e')]);
    expect(rules).toEqual(['shield', 'shield']);
  });

  it('keeps the reinforcement when the shield would not save `a` (out-rated: the stream is cancelled)', () => {
    const state = fixture();
    state.towers['e']!.level = 2; // 1.43/s against our 1/s: a shield cannot cancel it
    const cmds = bot(state);
    expect(cmds).not.toContainEqual(unlink('a', 'b'));
    expect(cmds).not.toContainEqual(link('a', 'e'));
  });
});

describe('partial shields and the landing share (2026-09-22, lean / thinWalls findings)', () => {
  it('keeps an out-rated counter-stream: it still cancels 1:1, so only the enemy surplus lands', () => {
    const state = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 2 }, // 1.43/s against our 1/s
    ]);
    enemyLink(state, 'e', 'p');
    applyCommand(state, link('p', 'e'));
    expect(bot(state)).toEqual([]); // not dropped as "lands nothing"
    expect(MIN_LANDING_SHARE).toBe(0.25);
  });

  it('ends an attack that lands less than MIN_LANDING_SHARE of what it emits (an L2 stream alone into a gun post)', () => {
    const state = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 30, level: 2 }, // 1.43/s, the post shoots 1.25/s: 13 % lands
      { id: 'g', x: 360, y: 400, owner: 'enemy1', units: 2, level: 1, kind: 'artillery' },
    ]);
    applyCommand(state, link('p', 'g'));
    expect(bot(state)).toEqual([unlink('p', 'g')]);
    // With a second stream sharing the post's fire each lands 37 %: both stay.
    const two = game([
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 20, level: 1 },
      { id: 'q', x: 60, y: 1000, owner: 'player', units: 20, level: 1 },
      { id: 'g', x: 360, y: 400, owner: 'enemy1', units: 2, level: 1, kind: 'artillery' },
    ]);
    applyCommand(two, link('p', 'g'));
    applyCommand(two, link('q', 'g'));
    expect(bot(two).filter((c) => c.type === 'unlink')).toEqual([]);
  });
});
