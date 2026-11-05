import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { Rng, applyCommand, createState } from '../../src/sim/index';
import type { Command, EnemyDef, GameState, TowerDef } from '../../src/sim/index';
import { DEFENCE_MIN_AGGRESSION, FRONT_BIAS_S, HOPELESS_MS, enemyCommands, frontBiasMs, opportunistCommands, rusherCommands, turtleCommands } from '../../src/ai/index';
import type { EnemyAiOptions } from '../../src/ai/index';
import { runHeadless } from '../../src/ai/headless';
import { loadLevel } from '../../src/levels/index';
import { makeNaivePlayer } from '../../scripts/lib/naivePlayer';

/*
 * AUD-A3 prototype "opponent awareness" (GDD §2.5 personalities, `EnemyAiOptions.opponentAwareness`):
 * off by default and then byte-identical to the shipped enemies; on, `attack` gives the player's towers
 * a personality-scaled front bias (horizon + score). Fixtures: enemy `e` 600 px from the player's `p`
 * (a player L1 at 10 falls at 22 s to one L1 stream, at 30 at 44 s — `tests/ai/personalities.test.ts`)
 * and a grey `n` 600 px to the east (a neutral at 10 falls at 16 s).
 */

const ON: EnemyAiOptions = { opponentAwareness: true };
const OFF: EnemyAiOptions = { opponentAwareness: false };

const rusher = (aggression = 1): EnemyDef => ({ owner: 'enemy1', personality: 'rusher', aggression });
const turtle = (aggression = 1): EnemyDef => ({ owner: 'enemy1', personality: 'turtle', aggression });
const opportunist = (aggression = 1): EnemyDef => ({ owner: 'enemy1', personality: 'opportunist', aggression });
const rival: EnemyDef = { owner: 'enemy2', personality: 'rusher', aggression: 1 };

function game(towers: TowerDef[], enemies: EnemyDef[] = [rusher()]): GameState {
  return createState(makeLevel({ towers, enemies }), 1);
}
const link = (from: string, to: string, owner: EnemyDef['owner'] = 'enemy1'): Command => ({ type: 'link', owner, from, to });

/** `e` (L1, 8 u) with the player's `p` 600 px south and a grey `n` 600 px east. */
function fork(playerUnits: number, neutralUnits = 10, enemyLevel: 1 | 2 | 3 = 1): TowerDef[] {
  return [
    { id: 'p', x: 360, y: 1000, owner: 'player', units: playerUnits, level: 1 },
    { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 8, level: enemyLevel },
    { id: 'n', x: 960, y: 400, owner: 'neutral', units: neutralUnits, level: 1 },
  ];
}

describe('frontBiasMs', () => {
  it('is 0 without the option (or with it off) and FRONT_BIAS_S × (0.5 + 0.5 a) with it on', () => {
    expect(FRONT_BIAS_S).toEqual({ rusher: 20, opportunist: 10, turtle: 5 });
    expect(frontBiasMs('rusher', 1)).toBe(0);
    expect(frontBiasMs('rusher', 1, OFF)).toBe(0);
    expect(frontBiasMs('rusher', 1, ON)).toBe(20_000);
    expect(frontBiasMs('rusher', 0.6, ON)).toBe(16_000);
    expect(frontBiasMs('opportunist', 1, ON)).toBe(10_000);
    expect(frontBiasMs('turtle', 0.5, ON)).toBe(3_750);
    expect(frontBiasMs('rusher', 2, ON)).toBe(20_000); // clamped
  });

  it('is 0 below DEFENCE_MIN_AGGRESSION: a tutorial enemy that never defends does not hunt the player either', () => {
    expect(DEFENCE_MIN_AGGRESSION).toBe(0.35);
    expect(frontBiasMs('rusher', 0.3, ON)).toBe(0);
    expect(frontBiasMs('rusher', 0.2, ON)).toBe(0);
    expect(frontBiasMs('turtle', 0, ON)).toBe(0);
    expect(frontBiasMs('rusher', 0.35, ON)).toBe(13_500);
    // Level 2's rusher (a = 0.2) issues the same commands on, off and without options.
    const state = game(fork(10));
    const plain = rusherCommands(state, rusher(0.2), new Rng(4));
    expect(plain).toEqual([link('e', 'n')]);
    expect(rusherCommands(state, rusher(0.2), new Rng(4), undefined, ON)).toEqual(plain);
  });

  it('takes a per-personality override for measurement sweeps', () => {
    const half: EnemyAiOptions = { opponentAwareness: true, frontBiasS: { rusher: 10, opportunist: 5, turtle: 0 } };
    expect(frontBiasMs('rusher', 1, half)).toBe(10_000);
    expect(frontBiasMs('turtle', 1, half)).toBe(0);
  });
});

describe('rusher with opponent awareness', () => {
  it('off: takes the grey that falls first (16 s) over the player at 10 (22 s); on: the player (22 − 20 s < 16 s)', () => {
    const state = game(fork(10));
    expect(rusherCommands(state, rusher(), new Rng(1))).toEqual([link('e', 'n')]);
    expect(rusherCommands(state, rusher(), new Rng(1), undefined, OFF)).toEqual([link('e', 'n')]);
    expect(rusherCommands(state, rusher(), new Rng(1), undefined, ON)).toEqual([link('e', 'p')]);
  });

  it('on: the bias extends the horizon — a player L1 at 30 (44 s) is out of the 30 s reach off, inside 50 s on', () => {
    const state = game([fork(30)[0]!, fork(30)[1]!]);
    expect(rusherCommands(state, rusher(), new Rng(1))).toEqual([]);
    expect(rusherCommands(state, rusher(), new Rng(1), undefined, ON)).toEqual([link('e', 'p')]);
  });

  it('on: the bias is scaled by aggression like the horizon (Rng(4)\'s first draw is 0.92: no tower is ever skipped)', () => {
    // p at 20 grows to 25 by the first landing and falls at 31 s; n at 12 falls at 18 s.
    // a = 0.5 off: horizon 22.5 s reaches n only. On: bias 15 s — p is in reach (37.5 s) and scores 16 < 18.
    const state = game(fork(20, 12));
    expect(rusherCommands(state, rusher(0.5), new Rng(4))).toEqual([link('e', 'n')]);
    expect(rusherCommands(state, rusher(0.5), new Rng(4), undefined, ON)).toEqual([link('e', 'p')]);
    // a = 0.35 on: horizon 20.25 s + bias 13.5 s = 33.75 s reaches p (31 s), and p scores 17.5 < 18.
    expect(rusherCommands(state, rusher(0.35), new Rng(4), undefined, ON)).toEqual([link('e', 'p')]);
    // a = 0.3 on: below the defence gate the bias is 0 — the plain 19.5 s horizon reaches n only.
    expect(rusherCommands(state, rusher(0.3), new Rng(4), undefined, ON)).toEqual([link('e', 'n')]);
  });

  it('on: only the player is the opponent — a rival enemy tower gets no bias', () => {
    // `a` (enemy2) and `p` both L1 at 10, 600 px from `e`: a tie off goes to the smaller id `a`; on, `p`.
    const towers: TowerDef[] = [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 8, level: 1 },
      { id: 'a', x: 960, y: 400, owner: 'enemy2', units: 10, level: 1 },
    ];
    const state = game(towers, [rusher(), rival]);
    expect(rusherCommands(state, rusher(), new Rng(1))).toEqual([link('e', 'a')]);
    expect(rusherCommands(state, rusher(), new Rng(1), undefined, ON)).toEqual([link('e', 'p')]);
  });
});

describe('turtle and opportunist with opponent awareness', () => {
  it('turtle: still opens nothing below TURTLE_MIN_LEVEL; at L2 prefers the player within its 5 s bias', () => {
    expect(turtleCommands(game(fork(10)), turtle(), new Rng(1), undefined, ON)).toEqual([]);
    // L2 `e` (1.43/s): p at 10 falls ≈ 1 + 5 + (16 + 1) / 1.43 ≈ 18 s, n at 10 ≈ 1 + 5 + 11 / 1.43 ≈ 13.7 s.
    // Off the grey (13.7 < 18); on, p scores 18 − 5 = 13 < 13.7 — but the turtle may use 3 links, so it takes both.
    const state = game(fork(10, 10, 2));
    const off = turtleCommands(state, turtle(), new Rng(1)).filter((c) => c.type === 'link');
    const on = turtleCommands(state, turtle(), new Rng(1), undefined, ON).filter((c) => c.type === 'link');
    expect(off[0]).toEqual(link('e', 'n'));
    expect(on[0]).toEqual(link('e', 'p'));
  });

  it('opportunist: the under-fire preference (60 s) still outranks the 10 s front bias', () => {
    // The player streams into the rival's `n`: under fire by someone else, so it scores 60 s better than its fall.
    const towers: TowerDef[] = [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 8, level: 1 },
      { id: 'n', x: 960, y: 400, owner: 'enemy2', units: 10, level: 1 },
    ];
    const state = game(towers, [opportunist(), rival]);
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'n' });
    expect(state.links).toHaveLength(1);
    expect(HOPELESS_MS).toBe(60_000);
    const on = opportunistCommands(state, opportunist(), new Rng(1), undefined, ON).filter((c) => c.type === 'link');
    expect(on[0]).toEqual(link('e', 'n'));
  });
});

describe('off is the shipped enemy', () => {
  it('enemyCommands with no options, with {}, and with the flag off issue the same commands', () => {
    for (const enemy of [rusher(0.6), turtle(0.6), opportunist(0.6)]) {
      const state = game(fork(10), [enemy]);
      const plain = enemyCommands(state, enemy, new Rng(3));
      expect(enemyCommands(state, enemy, new Rng(3), undefined, {})).toEqual(plain);
      expect(enemyCommands(state, enemy, new Rng(3), undefined, OFF)).toEqual(plain);
    }
  });

  it('a whole match on level 49 (naive line, seed 1) is identical with the option off, and differs with it on', async () => {
    const level = (await loadLevel(49))!;
    const plain = runHeadless(level, 1, makeNaivePlayer());
    expect(runHeadless(level, 1, makeNaivePlayer(), { ai: OFF })).toEqual(plain);
    expect(runHeadless(level, 1, makeNaivePlayer(), { ai: {} })).toEqual(plain);
    const on = runHeadless(level, 1, makeNaivePlayer(), { ai: ON });
    expect(on).toEqual(runHeadless(level, 1, makeNaivePlayer(), { ai: ON })); // deterministic
    expect(on.timeMs === plain.timeMs && on.outcome === plain.outcome).toBe(false);
  });
});
