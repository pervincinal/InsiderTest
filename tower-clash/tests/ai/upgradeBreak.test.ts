import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { C, DEFAULT_MODIFIERS, Rng, applyCommand, createState, isLinked, roadIdFor, step } from '../../src/sim/index';
import type { Command, EnemyDef, GameState, TowerDef } from '../../src/sim/index';
import { referencePlayerCommands, rusherCommands } from '../../src/ai/index';
import { UPGRADE_BREAK_SAFE_MS } from '../../src/ai/tactics';

/*
 * AI-6 (2026-09-21): under thinWalls (capacity ×0.8) a home that starts at exactly its capacity (L2
 * 40/40) never upgraded — the upgrade break dropped the link and the attack rule re-linked the tower to
 * another neighbour in the same tick, so the sim never saw it unlinked. The fix marks the tower used for
 * the rest of the tick; the sim then upgrades it on its next tick and the bot re-links at the new rate.
 */

const link = (owner: 'player' | 'enemy1', from: string, to: string): Command => ({ type: 'link', owner, from, to });

/** Run `ticks` AI ticks (0.5 s each) of the sim with one bot; returns the commands of each tick. */
function runTicks(state: GameState, ticks: number, bot: (s: GameState) => Command[]): Command[][] {
  const out: Command[][] = [];
  for (let i = 0; i < ticks; i++) {
    const cmds = bot(state);
    out.push(cmds);
    for (const c of cmds) applyCommand(state, c);
    for (let t = 0; t < C.AI_TICK_MS / C.TICK_MS; t++) step(state, C.TICK_MS);
  }
  return out;
}

/** A home with two neutral neighbours (so the old bug had a second target to re-link to) and a far enemy. */
function towers(owner: 'player' | 'enemy1', units: number): TowerDef[] {
  const foe = owner === 'player' ? 'enemy1' : 'player';
  return [
    { id: 'home', x: 360, y: 1000, owner, units, level: 2 },
    { id: 'a', x: 60, y: 1000, owner: 'neutral', units: 10 },
    { id: 'b', x: 660, y: 1000, owner: 'neutral', units: 10 },
    { id: 'foe', x: 360, y: 100, owner: foe, units: 10, level: 1 },
  ];
}

describe('AI-6 upgrade break at capacity', () => {
  it('reference player under thinWalls: a linked L2 at 40/40 is L3 and streaming again within 2 AI ticks', () => {
    const state = createState(makeLevel({ towers: towers('player', 40) }), 1, { ...DEFAULT_MODIFIERS, capacityMul: 0.8 });
    expect(state.towers['home']!.units).toBe(40); // = capacity 50 × 0.8: the sim's auto-upgrade is blocked only by the link
    applyCommand(state, link('player', 'home', 'a'));
    const bot = (s: GameState) => referencePlayerCommands(s, new Rng(1));
    const [first, second] = runTicks(state, 2, bot);
    // Tick 1: the break — only unlinks, no re-link to `b` in the same tick (the bug).
    expect(first!.every((c) => c.type === 'unlink')).toBe(true);
    expect(first!.length).toBeGreaterThan(0);
    // Tick 2: the sim upgraded it at once; the bot re-links (two links now, at the L3 rate).
    expect(second!.some((c) => c.type === 'link' && c.from === 'home')).toBe(true);
    expect(state.towers['home']!.level).toBe(3);
    expect(isLinked(state, 'home')).toBe(true);
    expect(UPGRADE_BREAK_SAFE_MS).toBe(3000);
  });

  it('rusher (shared code): a linked L2 at 50/50 with a second target is L3 and streaming within 2 AI ticks', () => {
    const enemy: EnemyDef = { owner: 'enemy1', personality: 'rusher', aggression: 1 };
    const state = createState(makeLevel({ towers: towers('enemy1', 50), enemies: [enemy] }), 1);
    applyCommand(state, link('enemy1', 'home', 'a'));
    const rng = new Rng(1);
    const [first, second] = runTicks(state, 2, (s) => rusherCommands(s, enemy, rng));
    expect(first!.every((c) => c.type === 'unlink')).toBe(true);
    expect(second!.some((c) => c.type === 'link' && c.from === 'home')).toBe(true);
    expect(state.towers['home']!.level).toBe(3);
    expect(isLinked(state, 'home')).toBe(true);
  });

  it('does not break a link when the tower would fall within UPGRADE_BREAK_SAFE_MS without it', () => {
    // An L1 at 25 (capacity) shielding the lane of an equal enemy stream; a 30-unit column is about to land
    // (the shield sweeps it; without the shield it lands in 0.1 s).
    const state = createState(
      makeLevel({ towers: [...towers('player', 25).slice(0, 3), { id: 'foe', x: 360, y: 700, owner: 'enemy1', units: 10, level: 1 }] }),
      1,
    );
    state.towers['home']!.level = 1;
    applyCommand(state, link('enemy1', 'foe', 'home'));
    applyCommand(state, link('player', 'home', 'foe'));
    for (let i = 0; i < 30; i++) {
      state.units.push({ id: state.nextUnitId++, owner: 'enemy1', kind: 'infantry', weight: 1, roadId: roadIdFor('foe', 'home'), from: 'foe', to: 'home', progress: 0.95, speed: C.UNIT_SPEED });
    }
    const cmds = referencePlayerCommands(state, new Rng(1));
    expect(cmds.some((c) => c.type === 'unlink' && c.from === 'home')).toBe(false);
    // Without the column the break is safe and happens.
    state.units = [];
    expect(referencePlayerCommands(state, new Rng(1))).toEqual([{ type: 'unlink', owner: 'player', from: 'home', to: 'foe' }]);
  });
});
