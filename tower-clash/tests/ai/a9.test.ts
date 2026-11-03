import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { C, Rng, applyCommand, createState, step } from '../../src/sim/index';
import type { Command, EnemyDef, GameState, TowerDef } from '../../src/sim/index';
import { loadLevel } from '../../src/levels/index';
import { SHIELD_WATCH_MS, isPassive, newPlayerMemory, observePlayer, playerMemoryFor, referencePlayerCommands } from '../../src/ai/index';
import { isAiTick } from '../../src/ai/common';
import { anticipates } from '../../src/ai/tactics';
import { runHeadless } from '../../src/ai/headless';

/*
 * AUD-A9 (GDD §2.5 "Passive towers", 2026-11-03): the reference player plans its attacks against the
 * shields a defender could raise; an enemy below DEFENCE_MIN_AGGRESSION never raises one, so the planner
 * never found a plan on level 4 once every tower was L3 and the map froze. Two rules, both from what a
 * human sees: (1) a tower under our streams for SHIELD_WATCH_MS since its last shield is *passive* and is
 * planned against plain; (2) a capped keep with a free slot *probes* with the plain plan (it makes
 * nothing, a stream costs it nothing) — which is how a tower that never had to defend gets its occasion.
 */

const turtle: EnemyDef = { owner: 'enemy1', personality: 'turtle', aggression: 0.3 };
const link = (from: string, to: string, owner: Command['owner'] = 'player'): Command => ({ type: 'link', owner, from, to });
const unlink = (from: string, to: string, owner: Command['owner'] = 'player'): Command => ({ type: 'unlink', owner, from, to });
const bot = (state: GameState, trace?: (rule: string, cmd: Command) => void) => referencePlayerCommands(state, new Rng(1), trace);

/** Three player L3 keeps on a row, one enemy L3 keep at 100 with a lane to each (3 links: it could shield all three). */
function front(units: number): GameState {
  const towers: TowerDef[] = [
    { id: 'a', x: 120, y: 1100, owner: 'player', units, level: 3 },
    { id: 'b', x: 360, y: 1100, owner: 'player', units, level: 3 },
    { id: 'c', x: 600, y: 1100, owner: 'player', units, level: 3 },
    { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 100, level: 3 },
  ];
  return createState(makeLevel({ towers, enemies: [turtle] }), 1);
}

/** Advance `ms` of sim time, observing the player's memory at every AI tick (as the bot would). */
function watch(state: GameState, ms: number): void {
  const memory = playerMemoryFor(state);
  const until = state.time + ms;
  while (state.time < until) {
    if (isAiTick(state)) observePlayer(memory, state, 'player');
    step(state, C.TICK_MS);
  }
  if (isAiTick(state)) observePlayer(memory, state, 'player');
}

describe('player memory (observePlayer / isPassive)', () => {
  it('credits a tower the time our stream runs into it, and 20 s of it makes the tower passive', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'a', x: 360, y: 1100, owner: 'player', units: 20, level: 1 },
          { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 100, level: 3 },
        ],
        enemies: [turtle],
      }),
      1,
    );
    const memory = playerMemoryFor(state);
    expect(SHIELD_WATCH_MS).toBe(20_000);
    applyCommand(state, link('a', 'e'));
    watch(state, SHIELD_WATCH_MS - C.AI_TICK_MS);
    expect(memory.watched.get('e')).toBe(SHIELD_WATCH_MS - C.AI_TICK_MS);
    expect(isPassive(memory, 'e')).toBe(false);
    watch(state, C.AI_TICK_MS);
    expect(memory.watched.get('e')).toBe(SHIELD_WATCH_MS);
    expect(isPassive(memory, 'e')).toBe(true);
    // The count survives the end of the stream: the tower showed its hand.
    applyCommand(state, unlink('a', 'e'));
    watch(state, 5_000);
    expect(memory.watched.get('e')).toBe(SHIELD_WATCH_MS);
    expect(isPassive(memory, 'e')).toBe(true);
  });

  it('a shield (its stream back on our lane) starts the count over; a tower we never stream into is never passive', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'a', x: 360, y: 1100, owner: 'player', units: 20, level: 1 },
          { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 100, level: 3 },
          { id: 'f', x: 60, y: 400, owner: 'enemy1', units: 100, level: 3 },
        ],
        enemies: [turtle],
      }),
      1,
    );
    const memory = playerMemoryFor(state);
    applyCommand(state, link('a', 'e'));
    watch(state, SHIELD_WATCH_MS);
    expect(isPassive(memory, 'e')).toBe(true);
    expect(memory.watched.has('f')).toBe(false);
    expect(isPassive(memory, 'f')).toBe(false);
    applyCommand(state, link('e', 'a', 'enemy1')); // the shield
    watch(state, C.AI_TICK_MS);
    expect(memory.watched.get('e')).toBe(0);
    expect(isPassive(memory, 'e')).toBe(false);
    applyCommand(state, unlink('e', 'a', 'enemy1'));
    watch(state, SHIELD_WATCH_MS - C.AI_TICK_MS);
    expect(isPassive(memory, 'e')).toBe(false);
    watch(state, C.AI_TICK_MS);
    expect(isPassive(memory, 'e')).toBe(true);
  });

  it('is observed once per sim time, starts over when time goes backwards, and forgets a tower that is no longer an enemy’s', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'a', x: 360, y: 1100, owner: 'player', units: 20, level: 1 },
          { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 100, level: 3 },
        ],
        enemies: [turtle],
      }),
      1,
    );
    const memory = newPlayerMemory();
    applyCommand(state, link('a', 'e'));
    observePlayer(memory, state, 'player');
    step(state, C.AI_TICK_MS);
    observePlayer(memory, state, 'player');
    observePlayer(memory, state, 'player');
    expect(memory.watched.get('e')).toBe(C.AI_TICK_MS);
    const rewound = createState(makeLevel({ towers: [{ id: 'e', x: 360, y: 400, owner: 'enemy1', units: 100, level: 3 }], enemies: [turtle] }), 1);
    observePlayer(memory, rewound, 'player');
    expect(memory.time).toBe(0);
    expect(memory.watched.size).toBe(0);
    // Captured: forgotten.
    memory.watched.set('e', SHIELD_WATCH_MS);
    state.towers['e']!.owner = 'player';
    observePlayer(memory, state, 'player');
    expect(memory.watched.has('e')).toBe(false);
    // One memory per match object.
    expect(playerMemoryFor(state)).toBe(playerMemoryFor(state));
    expect(playerMemoryFor(state)).not.toBe(playerMemoryFor(rewound));
  });
});

describe('passive tower (rule 3 plans plain against it)', () => {
  it('anticipating its shields the bot leaves an L3 keep with three lanes alone; read as passive it is attacked with the plain plan', () => {
    const state = front(90); // not capped: no probe
    expect(bot(state)).toEqual([]);
    playerMemoryFor(state).watched.set('e', SHIELD_WATCH_MS);
    const rules: string[] = [];
    expect(bot(state, (r) => rules.push(r))).toEqual([link('b', 'e'), link('a', 'e'), link('c', 'e')]);
    expect(rules).toEqual(['attack', 'attack', 'stack']);
    // One tick short of the watch: still anticipated.
    playerMemoryFor(state).watched.set('e', SHIELD_WATCH_MS - C.AI_TICK_MS);
    expect(bot(state)).toEqual([]);
  });

  it('anticipates() reads a flag or a per-target predicate', () => {
    const state = front(90);
    const e = state.towers['e']!;
    expect(anticipates(true, e)).toBe(true);
    expect(anticipates(false, e)).toBe(false);
    expect(anticipates(undefined, e)).toBe(false);
    expect(anticipates((t) => t.id === 'e', e)).toBe(true);
    expect(anticipates((t) => t.id !== 'e', e)).toBe(false);
  });
});

describe('probe (rule 5): a capped keep tests the shields the planner assumes', () => {
  it('capped keeps (L3 at capacity) open the plain plan under the rule `probe`; the same keeps one unit short do nothing', () => {
    const rules: string[] = [];
    expect(bot(front(100), (r) => rules.push(r))).toEqual([link('b', 'e'), link('a', 'e')]);
    expect(rules).toEqual(['probe', 'probe']);
    expect(bot(front(99))).toEqual([]);
  });

  it('does not pile onto a target the attack rule already takes', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'a', x: 360, y: 1100, owner: 'player', units: 100, level: 3 },
          { id: 'b', x: 600, y: 1100, owner: 'player', units: 100, level: 3 },
          { id: 'e', x: 360, y: 700, owner: 'enemy1', units: 3, level: 1 },
        ],
        enemies: [turtle],
      }),
      1,
    );
    const rules: string[] = [];
    const cmds = bot(state, (r) => rules.push(r));
    expect(cmds[0]).toEqual(link('a', 'e'));
    expect(rules[0]).toBe('attack');
    expect(rules).not.toContain('probe');
  });

  it('purity: two calls on the same snapshot give the same commands', () => {
    const state = front(100);
    expect(bot(state)).toEqual(bot(state));
    playerMemoryFor(state).watched.set('e', SHIELD_WATCH_MS);
    expect(bot(front(90))).toEqual([]);
  });
});

const level4 = (await loadLevel(4))!;

describe('level 4 "Build Up" (turtle 0.3): the AUD-A9 deadlock', () => {
  const level = level4;
  const from = (startMs: number) => (state: GameState, rng: Rng) => (state.time >= startMs ? referencePlayerCommands(state, rng) : []);

  it('the campaign row is unchanged: from t = 0 seed 1 wins at 28.9 s (nothing is capped before the win)', () => {
    expect(runHeadless(level, 1, referencePlayerCommands)).toMatchObject({ outcome: 'won', timeMs: 28_900 });
  });

  it('with the bot starting at 20 s every seed ends (10/10; before AUD-A9 0/10: all four towers L3/100 from 95 s, no ribbon)', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = runHeadless(level, seed, from(20_000));
      expect(r.outcome, `seed ${seed}`).toBe('won');
      expect(r.timeMs, `seed ${seed}`).toBeLessThan(135_000);
    }
    // Pinned (2026-11-03): the keeps cap at ~95 s, the probe opens mid + outpost → foe, foe falls ~30 s later.
    const a = runHeadless(level, 1, from(20_000));
    const b = runHeadless(level, 1, from(20_000));
    expect(a).toEqual(b);
    expect(a.timeMs).toBe(126_650);
  });
});
