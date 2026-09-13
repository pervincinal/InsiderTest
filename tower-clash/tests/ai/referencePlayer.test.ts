import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { Rng, applyCommand, createState, getOutcome, step } from '../../src/sim/index';
import type { Command, GameState, LevelDef, Outcome } from '../../src/sim/index';
import { isAiTick, referencePlayerCommands, runAiTick } from '../../src/ai/index';

const sends = (cmds: Command[]) => cmds.filter((c) => c.type === 'sendUnits');

/** Headless game with the reference player vs the level's enemies. */
function play(level: LevelDef, seed: number, maxMs: number): { outcome: Outcome; state: GameState } {
  const state = createState(level, seed);
  const enemyRng = new Rng(seed);
  const playerRng = new Rng(seed + 1);
  while (getOutcome(state) === 'playing' && state.time < maxMs) {
    if (isAiTick(state)) {
      const p = referencePlayerCommands(state, playerRng);
      const e = runAiTick(state, enemyRng);
      for (const cmd of p) applyCommand(state, cmd);
      for (const cmd of e) applyCommand(state, cmd);
    }
    step(state);
  }
  return { outcome: getOutcome(state), state };
}

describe('reference player', () => {
  it('takes a free neutral with just enough units', () => {
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
    const cmds = referencePlayerCommands(state, new Rng(1));
    expect(sends(cmds)).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ type: 'sendUnits', owner: 'player', from: 'p', to: 'n' });
    applyCommand(state, cmds[0]!);
    // garrison > units + 1: sends 7 (flip 5 with 1 to spare), keeps 3 at home.
    expect(state.queues[0]!.remaining).toBe(7);
    expect(state.towers['p']!.units).toBe(3);
    // The column is walking: it does not re-send next tick.
    expect(sends(referencePlayerCommands(state, new Rng(1)))).toHaveLength(0);
  });

  it('sends a bigger force into a neutral that an enemy tower can race for', () => {
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
    const state = createState(level, 1);
    const cmds = referencePlayerCommands(state, new Rng(1));
    expect(cmds[0]).toMatchObject({ type: 'sendUnits', owner: 'player', from: 'p', to: 'n' });
    applyCommand(state, cmds[0]!);
    // 7 to flip it plus the 8 the enemy could throw at it.
    expect(state.queues[0]!.remaining).toBe(15);
  });

  it('does not suicide into a stronger enemy tower', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 20 },
      ],
    });
    const state = createState(level, 1);
    expect(sends(referencePlayerCommands(state, new Rng(1)))).toHaveLength(0);
    // Even at 1.2 × 20 + 2 = 26 it waits: the enemy grows ~5 during the 5 s walk.
    state.towers['p']!.units = 26;
    expect(sends(referencePlayerCommands(state, new Rng(1)))).toHaveLength(0);
    state.towers['p']!.units = 30;
    state.towers['e']!.units = 20;
    // 20 + 5 grown = 25 → 25 × 1.2 + 2 = 32 > 30: still waits.
    expect(sends(referencePlayerCommands(state, new Rng(1)))).toHaveLength(0);
  });

  it('attacks a weak adjacent enemy tower and sends everything', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 20 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 3 },
      ],
    });
    const state = createState(level, 1);
    const cmds = referencePlayerCommands(state, new Rng(1));
    expect(cmds).toEqual([{ type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: 1 }]);
  });

  it('wins the default 2-tower makeLevel within 120 s', () => {
    // p 10 vs e 10 (rusher, aggression 0.5) on a 600 px road. The rusher never attacks an equal tower,
    // so the only sound line is: fill to 30 (20 s), upgrade, absorb the all-in it provokes, out-produce
    // at L2/L3, then attack once ≥ 1.2 × defenders + 2. That lands around 80 s; a 60 s win would need
    // an all-in that loses to the enemy's production during the walk.
    const { outcome, state } = play(makeLevel(), 1, 120_000);
    expect(outcome).toBe('won');
    expect(state.time).toBeLessThanOrEqual(120_000);
    expect(state.time).toBeGreaterThan(20_000);
  });

  it('is deterministic given the rng', () => {
    const a = play(makeLevel(), 3, 60_000);
    const b = play(makeLevel(), 3, 60_000);
    expect(a.outcome).toBe(b.outcome);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});

describe('reference player: tank factory sources', () => {
  /** Tank factory `p` (weight `tankUnits`) next to enemy `e` (4 units), plus barracks `q` next to `e`. */
  function tankLevel(tankUnits: number, barracksUnits: number): LevelDef {
    return makeLevel({
      towers: [
        { id: 'p', x: 200, y: 1000, owner: 'player', units: tankUnits, kind: 'tankFactory' },
        { id: 'q', x: 520, y: 1000, owner: 'player', units: barracksUnits },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 4 },
      ],
      roads: [
        { a: 'p', b: 'e' },
        { a: 'q', b: 'e' },
      ],
    });
  }

  it('a factory holding less than one tank (3 weight) next to a 4-unit enemy issues nothing', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 3, kind: 'tankFactory' },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 4 },
      ],
    });
    expect(referencePlayerCommands(createState(level, 1), new Rng(1))).toEqual([]);
  });

  it('terminates when a sub-tank factory is the only free source of a ready attack plan', () => {
    // Tick 1: q's whole garrison (30) goes for e; p (3 weight) is a source too but cannot send a tank.
    // Tick 2: the wave is inbound, so a plan with p as its only source is "ready" — it must not spin.
    const state = createState(tankLevel(3, 30), 1);
    const first = referencePlayerCommands(state, new Rng(1));
    expect(sends(first).map((c) => (c.type === 'sendUnits' ? c.from : ''))).toEqual(['q']);
    for (const cmd of first) applyCommand(state, cmd);
    expect(state.queues[0]).toMatchObject({ from: 'q', to: 'e', remaining: 30 });
    expect(state.towers['q']!.units).toBe(0);
    const second = referencePlayerCommands(state, new Rng(1));
    expect(sends(second)).toHaveLength(0);
    expect(state.towers['p']!.units).toBe(3);
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
    // (Raw weight would say 14 + 2 grown = 16 ≥ 12.2 and launch a wave it cannot actually send.)
    expect(referencePlayerCommands(vs1(14), new Rng(1))).toEqual([]);
    // 15 weight is three tanks: 15 + 2 grown = 17 ≥ 6 × 1.2 + 2 + 3 regen = 12.2 → all three go.
    const state = vs1(15);
    const cmds = referencePlayerCommands(state, new Rng(1));
    expect(cmds).toEqual([{ type: 'sendUnits', owner: 'player', from: 'p', to: 'e', ratio: 1 }]);
    applyCommand(state, cmds[0]!);
    expect(state.queues[0]).toMatchObject({ unitKind: 'tank', remaining: 3 });
    expect(state.towers['p']!.units).toBe(0);
  });

  it('sends whole tanks and keeps the remainder: 12 weight vs an empty tower sends two, keeps 2', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 12, kind: 'tankFactory' },
          { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 0 },
        ],
      }),
      1,
    );
    const cmds = referencePlayerCommands(state, new Rng(1));
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ type: 'sendUnits', owner: 'player', from: 'p', to: 'e' });
    applyCommand(state, cmds[0]!);
    expect(state.queues[0]).toMatchObject({ unitKind: 'tank', remaining: 2 });
    expect(state.towers['p']!.units).toBe(2);
  });

  it('plays 20 s of sim time with a sub-tank factory in play and finishes', () => {
    // Regression for the playtest hang: with the bug this call never returns.
    const { outcome, state } = play(tankLevel(3, 30), 1, 20_000);
    expect(outcome === 'won' || state.time >= 20_000).toBe(true);
    if (outcome !== 'won') expect(state.time).toBe(20_000);
  });
});
