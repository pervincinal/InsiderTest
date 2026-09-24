import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { C, DEFAULT_MODIFIERS, Rng, applyCommand, createState, step } from '../../src/sim/index';
import type { Command, EnemyDef, GameState, TowerDef } from '../../src/sim/index';
import { contestOf, holdMs, opportunistCommands, referencePlayerCommands, rusherCommands, turtleCommands } from '../../src/ai/index';
import { remainingMs } from '../../src/ai/common';
import { attack, newCtx } from '../../src/ai/tactics';

/*
 * AI-9 (2026-09-24): the hold cost of a contested neutral, modelled instead of the flat +10 s the
 * 2026-09-22 bot paid (AI-8c removed it). Once we have taken the tower the rival ends its stream the
 * tick after our ribbon appears (rule c is shared), but its last unit lands a lane's travel time later
 * and any column already walking lands at its remaining walk: until then the tower is under fire, its
 * garrison stays at the capture's 1 and the source that took it is frozen on it as its reinforcement.
 * `holdMs` is that time beyond our acquisition; the capture rule ranks a contested neutral as if
 * acquired that much later. Reference player only: the enemies never paid the flat penalty either.
 */

const link = (owner: 'player' | 'enemy1', from: string, to: string): Command => ({ type: 'link', owner, from, to });
const enemy1: EnemyDef = { owner: 'enemy1', personality: 'rusher', aggression: 1 };
function game(towers: TowerDef[], enemies: EnemyDef[] = [enemy1]): GameState {
  return createState(makeLevel({ towers, enemies }), 1, DEFAULT_MODIFIERS);
}
function run(state: GameState, ms: number): void {
  for (let i = 0; i < ms / C.TICK_MS; i++) step(state, C.TICK_MS);
}

/**
 * Home L2 with two neutrals: `near` (2 units, 100 px — three landings, ours from 1.5 s, flips at
 * 2.9 s) under the foe's stream over a 700 px lane (5.8 s of travel; its first unit lands at 6.8 s, after
 * our flip), and `far` (3 units, 160 px — four landings, flips at 4.1 s), free.
 */
function fixture(): GameState {
  const state = game([
    { id: 'home', x: 360, y: 1100, owner: 'player', units: 30, level: 2 },
    { id: 'near', x: 360, y: 1000, owner: 'neutral', units: 2 },
    { id: 'far', x: 200, y: 1100, owner: 'neutral', units: 3 },
    { id: 'foe', x: 360, y: 300, owner: 'enemy1', units: 8 },
    { id: 'foe2', x: 60, y: 300, owner: 'enemy1', units: 8 },
  ]);
  applyCommand(state, link('enemy1', 'foe', 'near'));
  return state;
}
const travelFoeNear = (700 / C.UNIT_SPEED) * 1000;

describe('AI-9 holdMs: what the rival still lands after our acquisition', () => {
  it('is the rival stream\'s last tick of emission plus its lane\'s travel, beyond our acquisition', () => {
    const state = fixture();
    const near = state.towers['near']!;
    const contest = contestOf(state, near, { planned: [{ owner: 'player', from: 'home', to: 'near' }] });
    expect(contest.winner).toBe('player');
    expect(contest.flipAtMs).toBeCloseTo(2933, -1);
    const all = [...state.links, { owner: 'player' as const, from: 'home', to: 'near' }];
    expect(holdMs(state, near, 'player', contest.flipAtMs, all)).toBeCloseTo(C.AI_TICK_MS + travelFoeNear - contest.flipAtMs, 0);
    expect(holdMs(state, near, 'player', contest.flipAtMs, all)).toBeCloseTo(3400, -2);
    // An acquisition later than that last landing pays nothing.
    expect(holdMs(state, near, 'player', 7000, all)).toBe(0);
    // Nothing hostile on its way: nothing to hold against.
    expect(holdMs(state, state.towers['far']!, 'player', 1000, all)).toBe(0);
  });

  it('counts a column already walking at its remaining walk', () => {
    const state = fixture();
    run(state, 1500); // the foe's first unit is on the lane
    const unit = state.units.find((u) => u.from === 'foe' && u.to === 'near');
    expect(unit).toBeDefined();
    const lands = remainingMs(state, unit!);
    expect(lands).toBeGreaterThan(5000);
    applyCommand(state, { type: 'unlink', owner: 'enemy1', from: 'foe', to: 'near' });
    expect(state.links).toHaveLength(0);
    const near = state.towers['near']!;
    expect(holdMs(state, near, 'player', 2000, state.links)).toBeCloseTo(lands - 2000, 0);
    expect(holdMs(state, near, 'player', lands + 1, state.links)).toBe(0);
    // Our own walkers are not a hold.
    applyCommand(state, link('player', 'home', 'near'));
    run(state, 800);
    expect(state.units.some((u) => u.owner === 'player' && u.to === 'near')).toBe(true);
    const ours = state.units.filter((u) => u.owner === 'player').map((u) => remainingMs(state, u));
    expect(holdMs(state, near, 'player', lands + 1, state.links)).toBe(0);
    expect(Math.max(...ours)).toBeLessThan(lands);
  });
});

describe('AI-9 capture: a contested neutral is ranked by acquisition plus hold cost', () => {
  it('the reference player takes the free neutral first when the hold makes the contested one later', () => {
    const state = fixture();
    // Without the hold the contested `near` (2.9 s) beats `far` (4.1 s) — the shared rule as the enemies run it.
    const plain = newCtx(state, 'player');
    attack(plain, { planMs: 30_000, targets: (t) => t.owner === 'neutral' });
    expect(plain.cmds[0]).toEqual(link('player', 'home', 'near'));
    // With it `near` scores 2.9 + 3.4 = 6.3 s: `far` first.
    const held = newCtx(state, 'player');
    attack(held, { planMs: 30_000, targets: (t) => t.owner === 'neutral', holdCost: true });
    expect(held.cmds[0]).toEqual(link('player', 'home', 'far'));
    expect(referencePlayerCommands(state, new Rng(1))[0]).toEqual(link('player', 'home', 'far'));
  });

  it('pays nothing when the rival column has landed by our flip (AI-8c: the cheap contested neutral is still taken)', () => {
    // The AI-8c fixture: the foe 360 px from `cheap` (3 s of travel); ours flips it at 4.3 s, after the
    // foe's last unit (emitted within a tick of our ribbon) has landed at 3.5 s.
    const state = createState(
      makeLevel({
        towers: [
          { id: 'home', x: 360, y: 1100, owner: 'player', units: 30, level: 2 },
          { id: 'cheap', x: 360, y: 860, owner: 'neutral', units: 3 },
          { id: 'big', x: 60, y: 1100, owner: 'neutral', units: 8 },
          { id: 'foe', x: 360, y: 500, owner: 'enemy1', units: 8 },
          { id: 'far', x: 660, y: 300, owner: 'enemy1', units: 8 },
        ],
        enemies: [{ owner: 'enemy1', personality: 'rusher', aggression: 0.3 }],
      }),
      1,
      { ...DEFAULT_MODIFIERS, productionMul: 0.9 },
    );
    applyCommand(state, link('enemy1', 'foe', 'cheap'));
    const planned = { owner: 'player' as const, from: 'home', to: 'cheap' };
    const contest = contestOf(state, state.towers['cheap']!, { planned: [planned] });
    expect(contest.winner).toBe('player');
    expect(holdMs(state, state.towers['cheap']!, 'player', contest.flipAtMs, [...state.links, planned])).toBe(0);
    expect(referencePlayerCommands(state, new Rng(1))[0]).toEqual(link('player', 'home', 'cheap'));
  });
});

describe('AI-9 personalities: the enemies pay no hold cost (as they never paid the flat penalty)', () => {
  /** The fixture mirrored: an enemy home faces `near` under the player's 700 px stream and a free `far`. */
  function mirrored(level: 1 | 2): GameState {
    const state = game(
      [
        { id: 'ehome', x: 360, y: 1100, owner: 'enemy1', units: 30, level },
        { id: 'near', x: 360, y: 1000, owner: 'neutral', units: 2 },
        { id: 'far', x: 200, y: 1100, owner: 'neutral', units: 3 },
        { id: 'phome', x: 360, y: 300, owner: 'player', units: 8 },
        { id: 'phome2', x: 60, y: 300, owner: 'player', units: 8 },
      ],
      [enemy1],
    );
    applyCommand(state, link('player', 'phome', 'near'));
    return state;
  }
  const first = (cmds: Command[]) => cmds.find((c) => c.type === 'link');

  it('rusher: the contested neutral that falls soonest, whatever lands on it afterwards', () => {
    const state = mirrored(1);
    expect(first(rusherCommands(state, { ...enemy1, personality: 'rusher' }, new Rng(1)))).toEqual(link('enemy1', 'ehome', 'near'));
  });

  it('turtle: from an L2 tower, the same target', () => {
    const state = mirrored(2);
    expect(first(turtleCommands(state, { ...enemy1, personality: 'turtle' }, new Rng(1)))).toEqual(link('enemy1', 'ehome', 'near'));
  });

  it('opportunist: a target under someone else\'s fire is scored 60 s sooner — the same target, with margin', () => {
    const state = mirrored(2);
    expect(first(opportunistCommands(state, { ...enemy1, personality: 'opportunist' }, new Rng(1)))).toEqual(link('enemy1', 'ehome', 'near'));
  });
});
