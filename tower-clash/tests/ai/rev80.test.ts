import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { applyCommand, capacityOf, createState, step } from '../../src/sim/index';
import type { GameState } from '../../src/sim/index';
import { STANDOFF_RELEASE_MS, barredLanes, commit, laneKey, newMemory } from '../../src/ai/memory';
import { HOPELESS_MS } from '../../src/ai/personalities';
import { maintain, newCtx } from '../../src/ai/tactics';

/*
 * REV-80 (code review 2026-11-28, nit): `commit` barred a lane whenever a held link ended with its standoff
 * timer at the limit, whatever ended it — the comment says a link ended for another reason (the upgrade
 * break, a retreat) is not barred, its timer simply starts over. `maintain` now records the links the
 * release rule ended (`ctx.released`) and `commit` bars only those.
 */
const ENEMIES = [
  { owner: 'enemy1' as const, personality: 'rusher' as const, aggression: 1 },
  { owner: 'enemy2' as const, personality: 'rusher' as const, aggression: 1 },
];

/** e1 (enemy1) and e2 (enemy2) hold each other on one 600 px lane for 20 s; e1's hold timer sits at the limit. */
function standoff(e1Units: number): { state: GameState; memory: ReturnType<typeof newMemory> } {
  const state = createState(
    makeLevel({
      enemies: ENEMIES,
      towers: [
        { id: 'p', x: 60, y: 1300, owner: 'player', units: 10, level: 1 },
        { id: 'e1', x: 360, y: 400, owner: 'enemy1', units: e1Units, level: 1 },
        { id: 'e2', x: 360, y: 1000, owner: 'enemy2', units: 10, level: 1 },
      ],
    }),
    1,
  );
  applyCommand(state, { type: 'link', owner: 'enemy1', from: 'e1', to: 'e2' });
  applyCommand(state, { type: 'link', owner: 'enemy2', from: 'e2', to: 'e1' });
  for (let i = 0; i < 20; i++) step(state); // 1 s: both streams on the lane, cancelling
  const memory = newMemory();
  memory.holds.set(laneKey('e1', 'e2'), state.time - STANDOFF_RELEASE_MS);
  return { state, memory };
}

const cfg = { hopelessMs: HOPELESS_MS, keepSupply: () => true };

describe('REV-80: only a link the release rule ended bars its lane', () => {
  it('release: the held stream ends under the release rule, is recorded as released, and the lane is barred', () => {
    const { state, memory } = standoff(10);
    const ctx = newCtx(state, 'enemy1', undefined, barredLanes(memory, state));
    expect(ctx.barred.has(laneKey('e1', 'e2'))).toBe(true);
    maintain(ctx, state.towers['e1']!, cfg);
    expect(ctx.ended.map((l) => laneKey(l.from, l.to))).toEqual(['e1>e2']);
    expect(ctx.released).toEqual(ctx.ended);
    commit(memory, state, ctx.ended, ctx.released);
    expect(memory.released.has(laneKey('e1', 'e2'))).toBe(true);
    expect(memory.holds.has(laneKey('e1', 'e2'))).toBe(false);
  });

  it('upgrade break: the same hold ended for the level is not released, and the lane is not barred', () => {
    const { state, memory } = standoff(1);
    const e1 = state.towers['e1']!;
    e1.units = capacityOf(e1, state); // at capacity below L3: maintain drops every link for a tick to take the level
    const ctx = newCtx(state, 'enemy1', undefined, barredLanes(memory, state));
    maintain(ctx, e1, cfg);
    expect(ctx.ended.map((l) => laneKey(l.from, l.to))).toEqual(['e1>e2']);
    expect(ctx.used.has('e1')).toBe(true); // the upgrade break, not the release rule
    expect(ctx.released).toEqual([]);
    commit(memory, state, ctx.ended, ctx.released);
    expect(memory.released.has(laneKey('e1', 'e2'))).toBe(false);
    expect(memory.holds.has(laneKey('e1', 'e2'))).toBe(false); // the timer simply starts over if the standoff re-forms
  });

  it('commit alone: an ended hold at the limit is barred only when it is among the released links', () => {
    const { state, memory } = standoff(10);
    const link = state.links.find((l) => l.owner === 'enemy1')!;
    commit(memory, state, [link], []);
    expect(memory.released.size).toBe(0);
    memory.holds.set(laneKey('e1', 'e2'), state.time - STANDOFF_RELEASE_MS);
    commit(memory, state, [link], [link]);
    expect(memory.released.has(laneKey('e1', 'e2'))).toBe(true);
  });
});
