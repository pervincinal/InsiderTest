import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { Rng, applyCommand, createState, getOutcome, step } from '../../src/sim/index';
import type { Command, GameState, LevelDef, Outcome } from '../../src/sim/index';
import { isAiTick, referencePlayerCommands, rngsFor, runAiTick } from '../../src/ai/index';
import { CUT_REACTION_MS, OPENING_GROW_LEVEL, SUPPLY_MIN, bridgeLoss, wantAt } from '../../src/ai/referencePlayer';
import { loadAllLevels } from '../../src/levels/index';

const LEVELS = await loadAllLevels();

/*
 * Rules v2: the reference player only ever issues `link`, `unlink` and `cutBridge`. Every test pins the
 * exact command list of a tick, and the level runs assert that no `sendUnits` / `upgrade` is emitted.
 */

const links = (cmds: Command[]) => cmds.filter((c) => c.type === 'link');
const unlinks = (cmds: Command[]) => cmds.filter((c) => c.type === 'unlink');
const legacy = (cmds: Command[]) => cmds.filter((c) => c.type === 'sendUnits' || c.type === 'upgrade');
const link = (from: string, to: string): Command => ({ type: 'link', owner: 'player', from, to });
const unlink = (from: string, to: string): Command => ({ type: 'unlink', owner: 'player', from, to });

/** Headless game with the reference player vs the level's enemies; asserts no legacy command on the way. */
function play(level: LevelDef, seed: number, maxMs: number): { outcome: Outcome; state: GameState } {
  const state = createState(level, seed);
  const enemyRng = new Rng(seed);
  const playerRng = new Rng(seed + 1);
  while (getOutcome(state) === 'playing' && state.time < maxMs) {
    if (isAiTick(state)) {
      const p = referencePlayerCommands(state, playerRng);
      expect(legacy(p)).toEqual([]);
      const e = runAiTick(state, enemyRng);
      for (const cmd of p) applyCommand(state, cmd);
      for (const cmd of e) applyCommand(state, cmd);
    }
    step(state);
  }
  return { outcome: getOutcome(state), state };
}

/** Run the player's commands at each AI tick for `ms` of sim time; returns the commands per tick. */
function drive(state: GameState, ms: number, rng = new Rng(1)): Map<number, Command[]> {
  const out = new Map<number, Command[]>();
  const end = state.time + ms;
  while (state.time < end) {
    if (isAiTick(state)) {
      const cmds = referencePlayerCommands(state, rng);
      out.set(state.time, cmds);
      for (const cmd of cmds) applyCommand(state, cmd);
    }
    step(state);
  }
  return out;
}

describe('reference player: captures', () => {
  it('takes a free neutral with a metered stream: links, then unlinks once enough is walking', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1100, owner: 'player', units: 10 },
        { id: 'n', x: 360, y: 800, owner: 'neutral', units: 5 },
        { id: 'm', x: 360, y: 500, owner: 'neutral', units: 20 },
        { id: 'e', x: 360, y: 200, owner: 'enemy1', units: 10 },
      ],
      roads: [
        { a: 'p', b: 'n' },
        { a: 'n', b: 'm' },
        { a: 'm', b: 'e' },
      ],
    });
    const state = createState(level, 1);
    const first = referencePlayerCommands(state, new Rng(1));
    expect(first).toEqual([link('p', 'n')]);
    for (const cmd of first) applyCommand(state, cmd);
    const ticks = drive(state, 4000);
    // "garrison > units + 1": 7 must land. 4 are walking at 0.5 s (too few), 8 at 1.0 s → the stream ends there.
    expect(ticks.get(0)).toEqual([]);
    expect(ticks.get(500)).toEqual([]);
    expect(ticks.get(1000)).toEqual([unlink('p', 'n')]);
    expect(state.links).toHaveLength(0);
    expect(state.towers['n']!).toMatchObject({ owner: 'player', units: 3 });
    expect(state.towers['p']!.units).toBe(6); // 10 − 8 poured + 4 produced
    // A captured tower with no enemy next to it is left to grow: no supply stream.
    expect(wantAt(state, state.towers['n']!)).toBe(0);
    expect(ticks.get(3500)).toEqual([]);
  });

  it('a contested neutral is taken from L1 too (OPENING_GROW_LEVEL = 1) when the garrison can hold it', () => {
    expect(OPENING_GROW_LEVEL).toBe(1);
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1100, owner: 'player', units: 20 },
        { id: 'n', x: 360, y: 700, owner: 'neutral', units: 5 },
        { id: 'e', x: 360, y: 300, owner: 'enemy1', units: 8 },
      ],
      roads: [
        { a: 'p', b: 'n' },
        { a: 'n', b: 'e' },
      ],
    });
    expect(referencePlayerCommands(createState(level, 1), new Rng(1))).toEqual([link('p', 'n')]);
  });

  it('does not race a rusher for a neutral it could not hold: 12 vs camp 5 with foe 8 next to it waits', () => {
    const tutorial = makeLevel({
      enemies: [{ owner: 'enemy1', personality: 'rusher', aggression: 0.2 }],
      towers: [
        { id: 'home', x: 200, y: 1100, owner: 'player', units: 12 },
        { id: 'camp', x: 520, y: 760, owner: 'neutral', units: 5 },
        { id: 'foe', x: 200, y: 340, owner: 'enemy1', units: 8 },
      ],
      roads: [
        { a: 'home', b: 'camp' },
        { a: 'camp', b: 'foe' },
        { a: 'home', b: 'foe' },
      ],
    });
    expect(referencePlayerCommands(createState(tutorial, 1), new Rng(1))).toEqual([]);
  });
});

describe('reference player: attacks', () => {
  it('does not suicide into a stronger enemy tower', () => {
    const level = (p: number, e: number) =>
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: p },
          { id: 'e', x: 360, y: 400, owner: 'enemy1', units: e },
        ],
      });
    expect(referencePlayerCommands(createState(level(10, 20), 1), new Rng(1))).toEqual([]);
    // Even at 1.2 × 20 + 2 = 26 it waits: the enemy grows ~5 during the 5 s walk.
    expect(referencePlayerCommands(createState(level(26, 20), 1), new Rng(1))).toEqual([]);
    // 20 + 5 grown = 25 → 25 × 1.2 + 2 = 32 > 30: still waits.
    expect(referencePlayerCommands(createState(level(30, 20), 1), new Rng(1))).toEqual([]);
  });

  it('attacks a weak adjacent enemy tower with a stream and keeps it flowing (nothing else to hold against)', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 20 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 3 },
      ],
    });
    const state = createState(level, 1);
    const first = referencePlayerCommands(state, new Rng(1));
    expect(first).toEqual([link('p', 'e')]);
    for (const cmd of first) applyCommand(state, cmd);
    const ticks = drive(state, 3000);
    for (const cmds of ticks.values()) expect(cmds).toEqual([]);
    expect(state.links).toHaveLength(1);
  });

  it('ends the stream at the reserve it must keep against a second enemy neighbour', () => {
    const level = (f: number): LevelDef =>
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 30 },
          { id: 'e', x: 360, y: 700, owner: 'enemy1', units: 2 },
          ...(f ? [{ id: 'f', x: 60, y: 1000, owner: 'enemy1' as const, units: f }] : []),
        ],
        roads: [{ a: 'p', b: 'e' }, ...(f ? [{ a: 'p', b: 'f' }] : [])],
      });
    // Alone against a 2-unit tower: the stream runs on (p drains 4 per tick).
    const alone = createState(level(0), 1);
    const aloneFirst = referencePlayerCommands(alone, new Rng(1));
    expect(aloneFirst).toEqual([link('p', 'e')]);
    for (const cmd of aloneFirst) applyCommand(alone, cmd);
    const aloneTicks = drive(alone, 3000);
    for (const cmds of aloneTicks.values()) expect(cmds).toEqual([]);
    expect(alone.towers['p']!.units).toBe(7);
    // With f (12) 300 px away: f grows to 14 while its column would walk, lands at 4.2 s, p regrows 4 → keep 11.
    const flanked = createState(level(12), 1);
    const flankedFirst = referencePlayerCommands(flanked, new Rng(1));
    expect(flankedFirst).toEqual([link('p', 'e')]);
    for (const cmd of flankedFirst) applyCommand(flanked, cmd);
    const ticks = drive(flanked, 3000);
    expect(ticks.get(2000)).toEqual([]);
    expect(ticks.get(2500)).toEqual([unlink('p', 'e')]);
    expect(flanked.towers['p']!.units).toBeGreaterThanOrEqual(11);
    expect(flanked.links).toHaveLength(0);
  });

  it('hits the tower the rusher just emptied (level 1 opening) and wins in 19.8 s on seed 1', () => {
    const level = LEVELS.find((l) => l.id === 1)!;
    const state = createState(level, 1);
    const playerRng = new Rng(1);
    const enemyRng = new Rng(5);
    const log: [number, Command[]][] = [];
    while (getOutcome(state) === 'playing' && state.time < 30_000) {
      if (isAiTick(state)) {
        const p = referencePlayerCommands(state, playerRng);
        expect(legacy(p)).toEqual([]);
        if (p.length) log.push([state.time, p]);
        const e = runAiTick(state, enemyRng);
        for (const cmd of p) applyCommand(state, cmd);
        for (const cmd of e) applyCommand(state, cmd);
      }
      step(state);
    }
    // t = 0: camp is contested (foe 8 next to it) → wait. t = 1 s: foe streams at camp and holds 1 → attack it.
    expect(log[0]).toEqual([1000, [link('home', 'foe')]]);
    expect(getOutcome(state)).toBe('won');
    expect(state.time).toBe(19_800);
  });

  it('ends a hopeless attack: a stream that can no longer flip its target is unlinked', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 3, level: 3 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 60, level: 3 },
      ],
    });
    const state = createState(level, 1);
    applyCommand(state, link('p', 'e')); // a human tapped it: 3 units against 60
    expect(referencePlayerCommands(state, new Rng(1))).toEqual([unlink('p', 'e')]);
  });
});

describe('reference player: reinforce', () => {
  it('links a helper only when its stream lands before the tower falls', () => {
    const level = (qy: number): LevelDef =>
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 2 },
          { id: 'q', x: 60, y: qy, owner: 'player', units: 9 },
          { id: 'e', x: 360, y: 640, owner: 'enemy1', units: 8 },
        ],
        roads: [
          { a: 'p', b: 'e' },
          { a: 'p', b: 'q' },
        ],
      });
    // e's 8 start landing at 3.0 s; p has 5 by then and falls to the fifth unit at ~3.5 s.
    const near = createState(level(1000), 1); // q → p is 300 px = 2.5 s: in time
    applyCommand(near, { type: 'link', owner: 'enemy1', from: 'e', to: 'p' });
    expect(referencePlayerCommands(near, new Rng(1))).toEqual([link('q', 'p')]);
    const far = createState(level(1360), 1); // q → p is 469 px = 3.9 s: lands after p has fallen
    applyCommand(far, { type: 'link', owner: 'enemy1', from: 'e', to: 'p' });
    expect(referencePlayerCommands(far, new Rng(1))).toEqual([]);
  });

  it('answers an all-in on a neighbour instead of racing for a neutral', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 6 },
        { id: 'q', x: 60, y: 1000, owner: 'player', units: 2 },
        { id: 'n', x: 660, y: 1000, owner: 'neutral', units: 2 },
        { id: 'e', x: 60, y: 640, owner: 'enemy1', units: 6 },
      ],
      roads: [
        { a: 'p', b: 'q' },
        { a: 'p', b: 'n' },
        { a: 'q', b: 'e' },
      ],
    });
    const calm = createState(level, 1);
    expect(referencePlayerCommands(calm, new Rng(1))).toEqual([link('p', 'n')]);
    const attacked = createState(level, 1);
    applyCommand(attacked, { type: 'link', owner: 'enemy1', from: 'e', to: 'q' });
    expect(referencePlayerCommands(attacked, new Rng(1))).toEqual([link('p', 'q')]);
  });

  it('ends a supply line once the captured front tower holds what it needs (at least SUPPLY_MIN)', () => {
    expect(SUPPLY_MIN).toBe(10);
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 30, level: 2 },
        { id: 'f', x: 360, y: 700, owner: 'player', units: 12 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 3 },
      ],
      roads: [
        { a: 'p', b: 'f' },
        { a: 'f', b: 'e' },
      ],
    });
    const state = createState(level, 1);
    applyCommand(state, link('p', 'f')); // a human left a supply line running
    // f faces e (3 units): it wants max(10, what holds e's column) = 10 and already has 12 → the line ends.
    expect(wantAt(state, state.towers['f']!)).toBe(10);
    expect(unlinks(referencePlayerCommands(state, new Rng(1)))).toEqual([unlink('p', 'f')]);
  });
});

describe('reference player: whole games', () => {
  it('is deterministic given the rng', () => {
    const level = LEVELS.find((l) => l.id === 3)!;
    const a = play(level, 3, 60_000);
    const b = play(level, 3, 60_000);
    expect(a.outcome).toBe(b.outcome);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('an equal 1 v 1 against a rusher is a stalemate under rules v2 (both towers grow to 100, nobody attacks)', () => {
    // p 10 vs e 10 (rusher 0.5) on a 600 px road: the rusher never attacks an equal tower and the
    // reference player never attacks without 1.2 × superiority, which symmetric auto-upgrades never give.
    const { outcome, state } = play(makeLevel(), 1, 120_000);
    expect(outcome).toBe('playing');
    expect(state.towers['p']!).toMatchObject({ level: 3, units: 100 });
    expect(state.towers['e']!).toMatchObject({ level: 3, units: 100 });
  });

  it('wins level 1 on every seed 1..100 with the game client rng streams, never issuing a legacy command', () => {
    const level = LEVELS.find((l) => l.id === 1)!;
    const lost: number[] = [];
    for (let seed = 1; seed <= 100; seed++) {
      const state = createState(level, seed);
      const rngs = rngsFor(seed, level.enemies);
      while (getOutcome(state) === 'playing' && state.time < 60_000) {
        if (isAiTick(state)) {
          const p = referencePlayerCommands(state, rngs.player);
          expect(legacy(p)).toEqual([]);
          const e = runAiTick(state, rngs.enemies);
          for (const cmd of p) applyCommand(state, cmd);
          for (const cmd of e) applyCommand(state, cmd);
        }
        step(state);
      }
      if (getOutcome(state) !== 'won') lost.push(seed);
    }
    expect(lost).toEqual([]);
  });
});

describe('reference player: tank factory sources', () => {
  it('a factory holding less than one tank (3 weight) next to a 4-unit enemy issues nothing', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 3, kind: 'tankFactory' },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 4 },
      ],
    });
    expect(referencePlayerCommands(createState(level, 1), new Rng(1))).toEqual([]);
  });

  it('sizes a tank source in whole tanks when judging an attack', () => {
    /** Tank factory `p` (`units` weight) 600 px below a 1-unit enemy `e` (grows to 6 during the 5 s walk). */
    const vs1 = (units: number): GameState =>
      createState(
        makeLevel({
          towers: [
            { id: 'p', x: 360, y: 1000, owner: 'player', units, kind: 'tankFactory' },
            { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 1 },
          ],
        }),
        1,
      );
    // 14 weight is two tanks (10): 10 + 1 grown < 6 × 1.2 + 2 + 2 regen = 11.2 → wait.
    expect(referencePlayerCommands(vs1(14), new Rng(1))).toEqual([]);
    // 15 weight is three tanks: 15 + 2 grown ≥ 12.2 → the stream starts and the first unit out is a tank.
    const state = vs1(15);
    expect(referencePlayerCommands(state, new Rng(1))).toEqual([link('p', 'e')]);
    applyCommand(state, link('p', 'e'));
    for (let i = 0; i < 3; i++) step(state);
    expect(state.units[0]).toMatchObject({ kind: 'tank', weight: 5 });
  });

  it('plays 20 s of sim time with a sub-tank factory in play and finishes', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 200, y: 1000, owner: 'player', units: 3, kind: 'tankFactory' },
        { id: 'q', x: 520, y: 1000, owner: 'player', units: 30 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 4 },
      ],
      roads: [
        { a: 'p', b: 'e' },
        { a: 'q', b: 'e' },
      ],
    });
    const { outcome, state } = play(level, 1, 20_000);
    expect(outcome === 'won' || state.time >= 20_000).toBe(true);
  });
});

describe('reference player: bridge-aware attack planner', () => {
  /**
   * Two own towers next to enemy `e` (600 px north): `a` over a bridge, `b` over a plain road, and an
   * `a`–`b` road (320 px) so that cutting the bridge would leave `a` two hops from `e` — a cut the far
   * side can afford (`keepsRoutes`, +1 hop). `e` is a turtle keep at `level` with `units`.
   */
  function forkLevel(opts: { a: number; b: number; units: number; level: 1 | 2 | 3; link?: boolean; bridge?: boolean }): LevelDef {
    return makeLevel({
      enemies: [{ owner: 'enemy1', personality: 'turtle', aggression: 0.5 }],
      towers: [
        { id: 'a', x: 200, y: 1000, owner: 'player', units: opts.a, level: 3 },
        { id: 'b', x: 520, y: 1000, owner: 'player', units: opts.b, level: 3 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: opts.units, level: opts.level },
      ],
      roads: [
        { a: 'a', b: 'e', kind: opts.bridge === false ? 'road' : 'bridge' },
        { a: 'b', b: 'e' },
        ...(opts.link === false ? [] : [{ a: 'a', b: 'b' }]),
      ],
    });
  }
  const from = (cmds: Command[]) =>
    links(cmds)
      .map((c) => (c.type === 'link' ? c.from : ''))
      .sort();

  it('bridgeLoss: everything landing later than one AI tick after the first step is lost', () => {
    expect(CUT_REACTION_MS).toBe(500);
    expect(bridgeLoss(22, 5000)).toBe(22);
    expect(bridgeLoss(10, 500)).toBe(9);
    expect(bridgeLoss(10, 380)).toBe(8);
    expect(bridgeLoss(1, 380)).toBe(0);
  });

  it('(1) attacks a max-level keep with the plain-road source only, keeping the bridge source home', () => {
    const state = createState(forkLevel({ a: 30, b: 30, units: 4, level: 3 }), 1);
    expect(referencePlayerCommands(state, new Rng(1))).toEqual([link('b', 'e')]);
  });

  it('(1) the same fork into an L1 barracks uses both sources: only a finished keep is planned as a cutter', () => {
    const state = createState(forkLevel({ a: 30, b: 30, units: 4, level: 1 }), 1);
    expect(from(referencePlayerCommands(state, new Rng(1)))).toEqual(['a', 'b']);
  });

  it('(1) a keep that would strand itself by cutting is not a cutter: both sources go', () => {
    const state = createState(forkLevel({ a: 30, b: 30, units: 4, level: 3, link: false }), 1);
    expect(from(referencePlayerCommands(state, new Rng(1)))).toEqual(['a', 'b']);
  });

  it('(2) requires the force surviving the cut to reach needed: a stream that is all bridge waits', () => {
    const road = createState(forkLevel({ a: 40, b: 1, units: 4, level: 3, bridge: false }), 1);
    expect(from(referencePlayerCommands(road, new Rng(1)))).toContain('a');
    const bridge = createState(forkLevel({ a: 40, b: 1, units: 4, level: 3 }), 1);
    expect(referencePlayerCommands(bridge, new Rng(1))).toEqual([]);
  });

  it('(2) relays chained into an exposed source are lost with it', () => {
    const level = forkLevel({ a: 40, b: 1, units: 4, level: 3 });
    level.towers.push({ id: 'r', x: 200, y: 1250, owner: 'player', units: 30, level: 3 });
    level.roads.push({ a: 'a', b: 'r' });
    expect(referencePlayerCommands(createState(level, 1), new Rng(1))).toEqual([]);
  });

  it('a short stream is replaced by the stronger source over a plain road, never joined over a bridge the keep can cut', () => {
    // b (30) streams at e (L3 keep, 20 → 30 when the stream lands, 2/s regen): hopeless on its own.
    const road = createState(forkLevel({ a: 40, b: 30, units: 20, level: 3, bridge: false }), 1);
    applyCommand(road, link('b', 'e'));
    for (let i = 0; i < 10; i++) step(road);
    const rules: string[] = [];
    expect(referencePlayerCommands(road, new Rng(1), (rule) => rules.push(rule))).toEqual([unlink('b', 'e'), link('a', 'e')]);
    expect(rules).toEqual(['maintain', 'attack']);
    const bridge = createState(forkLevel({ a: 40, b: 30, units: 20, level: 3 }), 1);
    applyCommand(bridge, link('b', 'e'));
    for (let i = 0; i < 10; i++) step(bridge);
    expect(referencePlayerCommands(bridge, new Rng(1))).toEqual([unlink('b', 'e')]);
  });

  it('level 40 seed 6: no player unit is drowned by an enemy bridge cut, and the crown falls before 90 s', () => {
    const level = LEVELS.find((l) => l.id === 40)!;
    const state = createState(level, 6);
    const rngs = rngsFor(6, level.enemies);
    let drowned = 0;
    let enemyCuts = 0;
    while (getOutcome(state) === 'playing' && state.time < 180_000) {
      if (isAiTick(state)) {
        const p = referencePlayerCommands(state, rngs.player);
        expect(legacy(p)).toEqual([]);
        const e = runAiTick(state, rngs.enemies);
        for (const cmd of p) applyCommand(state, cmd);
        for (const cmd of e) {
          if (cmd.type === 'cutBridge') enemyCuts++;
          applyCommand(state, cmd);
        }
        for (const ev of state.events) if (ev.type === 'unitDied' && ev.cause === 'bridge' && ev.owner === 'player') drowned += 1;
      }
      step(state);
    }
    expect(getOutcome(state)).toBe('won');
    expect(enemyCuts).toBe(0);
    expect(drowned).toBe(0);
    expect(state.time).toBeLessThanOrEqual(90_000);
  });
});
