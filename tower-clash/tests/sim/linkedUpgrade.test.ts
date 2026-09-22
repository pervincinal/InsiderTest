import { describe, expect, it } from 'vitest';
import { makeLevel, wall } from '../helpers';
import type { GameState, TowerDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { isUnderFire, maxLinksOf, step } from '../../src/sim/step';
import { run, spawn } from './util';

/*
 * QA bug hunt 2026-09-22, item 6: auto-upgrade against the link limit (GDD §2.0 / §2.0b rule 5). A
 * linked tower never upgrades; the level is taken on the tick after the last link ends — "on the spot",
 * whatever else is going on (under fire, frozen). Levels never go down; a capture keeps the level and
 * therefore `maxLinksOf`.
 */

function hub(p: Partial<TowerDef>, others: Partial<TowerDef>[] = []): GameState {
  const defaults: TowerDef[] = [
    { id: 'a', x: 360, y: 760, owner: 'neutral', units: 0 },
    { id: 'b', x: 120, y: 1000, owner: 'player', units: 20 },
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
const upgrades = (s: GameState) => s.events.filter((e) => e.type === 'upgrade');

describe('an L1 with one link filled to 25 by reinforcement', () => {
  it('stays L1 (at 25, nothing grows) while linked and takes L2 on the tick after the unlink', () => {
    const s = hub({ units: 24 });
    link(s, 'p', 'a');
    spawn(s, { owner: 'player', from: 'b', to: 'p', progress: 0.995 });
    step(s);
    expect(s.towers['p']!).toMatchObject({ level: 1, units: 25 });
    expect(upgrades(s)).toEqual([]);
    run(s, 40);
    expect(s.towers['p']!).toMatchObject({ level: 1, units: 25, genAccMs: 0 });
    applyCommand(s, { type: 'unlink', owner: 'player', from: 'p' });
    step(s);
    expect(s.towers['p']!).toMatchObject({ level: 2, units: 25 });
    expect(upgrades(s)).toEqual([{ type: 'upgrade', towerId: 'p', level: 2 }]);
    expect(maxLinksOf(s.towers['p']!)).toBe(2);
  });

  it('the tick after the unlink upgrades it even while it is under fire (the level is not growth)', () => {
    const s = hub({ units: 25 });
    link(s, 'p', 'a');
    spawn(s, { owner: 'enemy1', from: 'c', to: 'p', progress: 0.995 });
    step(s); // 24, under fire until 1550
    spawn(s, { owner: 'player', from: 'b', to: 'p', progress: 0.995 });
    step(s); // 25 again, still linked, still under fire
    expect(s.towers['p']!).toMatchObject({ level: 1, units: 25 });
    expect(isUnderFire(s, s.towers['p']!)).toBe(true);
    applyCommand(s, { type: 'unlink', owner: 'player', from: 'p' });
    step(s);
    expect(isUnderFire(s, s.towers['p']!)).toBe(true);
    expect(s.towers['p']!).toMatchObject({ level: 2, units: 25 });
    expect(upgrades(s)).toEqual([{ type: 'upgrade', towerId: 'p', level: 2 }]);
  });

  it('the tick after the unlink upgrades a frozen tower too (the enemy under a player freeze)', () => {
    const s = hub({ units: 25 }, [{ id: 'c', units: 25 }]);
    link(s, 'c', 'a', 'enemy1');
    applyCommand(s, { type: 'booster', owner: 'player', booster: 'freeze' });
    run(s, 10);
    expect(s.towers['c']!).toMatchObject({ level: 1, units: 25 });
    applyCommand(s, { type: 'unlink', owner: 'enemy1', from: 'c' });
    step(s);
    expect(s.boosters).toHaveLength(1);
    expect(s.towers['c']!).toMatchObject({ level: 2, units: 25 });
    expect(upgrades(s)).toEqual([{ type: 'upgrade', towerId: 'c', level: 2 }]);
    run(s, 100); // the freeze still holds the garrison at 25 (no growth) until it ends at 5000
    expect(s.towers['c']!.units).toBe(25 + Math.floor((s.time - 5000) / 700));
  });

  it('a linked tower at capacity never upgrades even when its two links end on different ticks — only after the last one', () => {
    const s = hub({ units: 50, level: 2 });
    link(s, 'p', 'a');
    link(s, 'p', 'b');
    run(s, 5);
    applyCommand(s, { type: 'unlink', owner: 'player', from: 'p', to: 'a' });
    run(s, 5);
    expect(s.towers['p']!.level).toBe(2);
    applyCommand(s, { type: 'unlink', owner: 'player', from: 'p', to: 'b' });
    step(s);
    expect(s.towers['p']!.level).toBe(3);
    expect(maxLinksOf(s.towers['p']!)).toBe(3);
  });
});

describe('levels never go down', () => {
  it('an L2 with two links shot to 0 (sourceEmpty) and then captured keeps level 2; the captor gets two links', () => {
    const s = hub({ units: 2, level: 2 }, [{ id: 'c', owner: 'enemy1', units: 30 }]);
    link(s, 'p', 'a');
    link(s, 'p', 'b');
    applyCommand(s, { type: 'booster', owner: 'enemy1', booster: 'airstrike', towerId: 'p' });
    step(s);
    expect(s.towers['p']!).toMatchObject({ level: 2, units: 0 });
    expect(s.links).toEqual([]);
    spawn(s, { owner: 'enemy1', from: 'c', to: 'p', progress: 0.995 });
    step(s);
    expect(s.towers['p']!).toMatchObject({ owner: 'enemy1', level: 2, units: 1 });
    expect(maxLinksOf(s.towers['p']!)).toBe(2);
    link(s, 'p', 'a', 'enemy1');
    link(s, 'p', 'b', 'enemy1');
    link(s, 'p', 'c', 'enemy1');
    expect(s.links.map((l) => `${l.from}>${l.to}`)).toEqual(['p>a', 'p>b']);
    run(s, 200);
    expect(s.towers['p']!.level).toBe(2);
  });

  it('a captured L3 at 1 unit keeps L3 (capacity 100, three links) for its new owner', () => {
    const s = hub({ units: 0, level: 3 }, [{ id: 'c', owner: 'enemy1', units: 30 }]);
    spawn(s, { owner: 'enemy1', from: 'c', to: 'p', progress: 0.995 });
    step(s);
    expect(s.towers['p']!).toMatchObject({ owner: 'enemy1', level: 3, units: 1 });
    expect(maxLinksOf(s.towers['p']!)).toBe(3);
    run(s, 200); // grows at the L3 rate (500 ms): 10 s → +20
    expect(s.towers['p']!.units).toBe(21);
  });
});
