import { describe, expect, it } from 'vitest';
import { makeLevel, wall } from '../helpers';
import type { GameState, TowerDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { isUnderFire, step } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import { run, spawn } from './util';

/*
 * QA bug hunt 2026-09-22, item 2: `sourceEmpty` (GDD §2.0b rule 6) at its edges — same-tick landings of
 * both signs, a tank factory below a tank's weight, a fortress with a half-hit carried over, and a capture
 * in the tick the garrison hits 0. Invariant under test: a link that ends emits exactly one `unlinked`
 * event and leaves nothing in `state.links`.
 */

/** Hub: player `p` in the middle, `a` north / `b` west / `c` east (240 px each); `e` far away behind a wall. */
function hub(p: Partial<TowerDef>, others: Partial<TowerDef>[] = []): GameState {
  const defaults: TowerDef[] = [
    { id: 'a', x: 360, y: 760, owner: 'neutral', units: 0 },
    { id: 'b', x: 120, y: 1000, owner: 'enemy1', units: 0 },
    { id: 'c', x: 600, y: 1000, owner: 'enemy1', units: 0 },
  ];
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1, ...p },
        ...defaults.map((t) => ({ ...t, ...(others.find((o) => o.id === t.id) ?? {}) })),
        { id: 'e', x: 100, y: 100, owner: 'enemy1', units: 10 },
      ],
      obstacles: [wall(0, 400, 720, 400)],
    }),
    1,
  );
}

const link = (s: GameState, from: string, to: string, owner: 'player' | 'enemy1' = 'player') => applyCommand(s, { type: 'link', owner, from, to });
const unlinked = (s: GameState) => s.events.filter((e) => e.type === 'unlinked');
const captures = (s: GameState) => s.events.filter((e) => e.type === 'capture');

describe('sourceEmpty: same-tick landings', () => {
  it('a linked tower at 1: a friendly then a hostile landing in one tick leaves it at 1 and linked (no event)', () => {
    const s = hub({ units: 1 });
    link(s, 'p', 'a');
    spawn(s, { owner: 'player', from: 'b', to: 'p', progress: 0.995 }); // friendly reinforcement, first in unit order
    spawn(s, { owner: 'enemy1', from: 'c', to: 'p', progress: 0.995 }); // hostile, second
    step(s);
    expect(s.towers['p']!).toMatchObject({ owner: 'player', units: 1 });
    expect(s.links).toHaveLength(1);
    expect(unlinked(s)).toEqual([]);
    expect(isUnderFire(s, s.towers['p']!)).toBe(true);
  });

  it('the hostile first, then the friendly: the garrison passes through 0 inside the tick but the link survives (prune runs after arrivals)', () => {
    const s = hub({ units: 1 });
    link(s, 'p', 'a');
    spawn(s, { owner: 'enemy1', from: 'c', to: 'p', progress: 0.995 });
    spawn(s, { owner: 'player', from: 'b', to: 'p', progress: 0.995 });
    step(s);
    expect(s.towers['p']!).toMatchObject({ owner: 'player', units: 1 });
    expect(s.links).toHaveLength(1);
    expect(unlinked(s)).toEqual([]);
  });

  it('the hostile alone empties it: exactly one `sourceEmpty`, no link left, the empty tower cannot re-link', () => {
    const s = hub({ units: 1 });
    link(s, 'p', 'a');
    spawn(s, { owner: 'enemy1', from: 'c', to: 'p', progress: 0.995 });
    step(s);
    expect(s.towers['p']!).toMatchObject({ owner: 'player', units: 0 });
    expect(unlinked(s)).toEqual([{ type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'sourceEmpty' }]);
    expect(s.links).toEqual([]);
    link(s, 'p', 'a');
    expect(s.links).toEqual([]);
    step(s);
    expect(unlinked(s)).toEqual([]); // nothing to end twice
  });

  it('sourceEmpty and targetFull in the same tick: one event per link, `sourceEmpty` wins for the emptied source', () => {
    const s = hub({ units: 1, level: 2 }, [{ id: 'a', owner: 'player', units: 24 }]);
    link(s, 'p', 'a'); // supply line into an own L1 at 24: one landing fills it
    spawn(s, { owner: 'player', from: 'p', to: 'a', progress: 0.995 });
    spawn(s, { owner: 'enemy1', from: 'c', to: 'p', progress: 0.995 });
    step(s);
    expect(s.towers['a']!).toMatchObject({ units: 25, level: 2 }); // reinforcement filled it: auto-upgrade, so not "full"
    expect(s.towers['p']!.units).toBe(0);
    expect(unlinked(s)).toEqual([{ type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'sourceEmpty' }]);
    expect(s.links).toEqual([]);
  });
});

describe('sourceEmpty: tank factory below a tank', () => {
  it('linked with 3 weight it emits one infantry per TANK_GEN_MS[1] (4 s) and keeps the 3; at 0 the link ends once', () => {
    const s = hub({ units: 3, kind: 'tankFactory' });
    link(s, 'p', 'a');
    run(s, 79);
    expect(s.units).toEqual([]);
    step(s); // 4000 ms
    expect(s.units.map((u) => [u.kind, u.weight, u.owner])).toEqual([['infantry', 1, 'player']]);
    expect(s.towers['p']!.units).toBe(3);
    run(s, 80); // 8000 ms: a second infantry (the first landed on the neutral hub)
    expect(s.towers['p']!.units).toBe(3);
    expect(s.links[0]!.emitAccMs).toBe(0);
    applyCommand(s, { type: 'booster', owner: 'enemy1', booster: 'airstrike', towerId: 'p' });
    expect(s.towers['p']!.units).toBe(0);
    step(s);
    expect(unlinked(s)).toEqual([{ type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'sourceEmpty' }]);
    const before = s.units.length;
    run(s, 100);
    expect(s.units.length).toBeLessThanOrEqual(before); // nothing new left p
    expect(s.links).toEqual([]);
    expect(s.towers['p']!.units).toBe(5); // unlinked, it grows a tank again (4 s at L1, from the moment the link ended)
  });

  it('with exactly TANK_WEIGHT it emits a tank; the same factory later at 4 emits infantry', () => {
    const s = hub({ units: C.TANK_WEIGHT, kind: 'tankFactory' });
    link(s, 'p', 'a');
    run(s, 80);
    expect(s.units.map((u) => u.kind)).toEqual(['tank']);
    s.towers['p']!.units = 4;
    run(s, 80); // the tank landed on the hub meanwhile (2.9 s of travel)
    expect(s.units.map((u) => u.kind)).toEqual(['infantry']);
    expect(s.towers['p']!.units).toBe(4);
  });
});

describe('sourceEmpty: fortress with a half hit carried over', () => {
  it('two infantry hit a linked L1 fortress at 1: the first removes nobody (link stays), the second empties it (sourceEmpty)', () => {
    const s = hub({ units: 1, kind: 'fortress' });
    link(s, 'p', 'a');
    spawn(s, { owner: 'enemy1', from: 'c', to: 'p', progress: 0.995 });
    step(s);
    expect(s.towers['p']!).toMatchObject({ units: 1, defenceAcc: 0.5 });
    expect(s.links).toHaveLength(1);
    expect(unlinked(s)).toEqual([]);
    spawn(s, { owner: 'enemy1', from: 'c', to: 'p', progress: 0.995 });
    step(s);
    expect(s.towers['p']!).toMatchObject({ owner: 'player', units: 0, defenceAcc: 0 });
    expect(unlinked(s)).toEqual([{ type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'sourceEmpty' }]);
    expect(s.links).toEqual([]);
  });

  it('a fortress at 0 with acc 0.5 flips on the next infantry with garrison 1 (the accumulator is cleared by the capture)', () => {
    const s = hub({ units: 0, kind: 'fortress' });
    spawn(s, { owner: 'enemy1', from: 'c', to: 'p', progress: 0.995 });
    step(s);
    expect(s.towers['p']!).toMatchObject({ owner: 'player', units: 0, defenceAcc: 0.5 });
    expect(captures(s)).toEqual([]);
    spawn(s, { owner: 'enemy1', from: 'c', to: 'p', progress: 0.995 });
    step(s);
    expect(s.towers['p']!).toMatchObject({ owner: 'enemy1', units: 1, defenceAcc: 0, level: 1 });
    expect(captures(s)).toEqual([{ type: 'capture', towerId: 'p', by: 'enemy1', from: 'player' }]);
  });
});

describe('capture in the tick the source empties', () => {
  it('two hostile landings in one tick: the first empties, the second captures — a single `sourceLost`, no `sourceEmpty`', () => {
    const s = hub({ units: 1 });
    link(s, 'p', 'a');
    spawn(s, { owner: 'enemy1', from: 'c', to: 'p', progress: 0.995 });
    spawn(s, { owner: 'enemy1', from: 'b', to: 'p', progress: 0.995 });
    step(s);
    expect(s.towers['p']!).toMatchObject({ owner: 'enemy1', units: 1 });
    expect(unlinked(s)).toEqual([{ type: 'unlinked', owner: 'player', from: 'p', to: 'a', reason: 'sourceLost' }]);
    expect(s.links).toEqual([]);
    expect(captures(s)).toHaveLength(1);
  });

  it('a tank capturing a linked L2 with two links: two `sourceLost` events, the level is kept, the new owner may open two links', () => {
    const s = hub({ units: 2, level: 2 }, [{ id: 'a', owner: 'enemy1', units: 0 }]);
    link(s, 'p', 'a');
    link(s, 'p', 'b');
    spawn(s, { owner: 'enemy1', from: 'c', to: 'p', progress: 0.995, weight: C.TANK_WEIGHT });
    step(s);
    expect(s.towers['p']!).toMatchObject({ owner: 'enemy1', units: 3, level: 2 });
    expect(unlinked(s).map((e) => e.type === 'unlinked' && e.reason)).toEqual(['sourceLost', 'sourceLost']);
    expect(s.links).toEqual([]);
    link(s, 'p', 'a', 'enemy1');
    link(s, 'p', 'b', 'enemy1');
    link(s, 'p', 'c', 'enemy1');
    expect(s.links.map((l) => l.to)).toEqual(['a', 'b']); // maxLinksOf keeps the captured L2's limit
  });
});
