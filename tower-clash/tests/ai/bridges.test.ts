import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { C, Rng, applyCommand, createState, getOutcome, step } from '../../src/sim/index';
import type { Command, GameState, LevelDef, RoadDef, TowerDef } from '../../src/sim/index';
import { isAiTick, referencePlayerCommands, rngsFor, runAiTick } from '../../src/ai/index';
import { MAX_DETOUR_HOPS, bridgeCutCommands, keepsRoutes, opponentHops } from '../../src/ai/bridges';
import { LEVELS } from '../../src/levels/index';

const cuts = (cmds: Command[]) => cmds.filter((c) => c.type === 'cutBridge');
const sends = (cmds: Command[]) => cmds.filter((c) => c.type === 'sendUnits');

/**
 * p (player) at the south end of a 600 px bridge to e (enemy1) at the north end. `alt` adds a plain
 * detour p — n — e through a 2-unit neutral (two hops instead of one). Extra towers/roads are appended.
 */
function bridgeLevel(opts: { p: number; e: number; alt?: boolean; towers?: TowerDef[]; roads?: RoadDef[] }): LevelDef {
  return makeLevel({
    towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: opts.p },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: opts.e },
      ...(opts.alt ? [{ id: 'n', x: 60, y: 700, owner: 'neutral' as const, units: 2 }] : []),
      ...(opts.towers ?? []),
    ],
    roads: [{ a: 'p', b: 'e', kind: 'bridge' }, ...(opts.alt ? [{ a: 'p', b: 'n' }, { a: 'n', b: 'e' }] : []), ...(opts.roads ?? [])],
  });
}

/** Send `count` units from `from` to `to` (exact count through the ratio the sim uses). */
function send(state: GameState, from: string, to: string, count: number): void {
  const tower = state.towers[from]!;
  applyCommand(state, { type: 'sendUnits', owner: tower.owner, from, to, ratio: count >= tower.units ? 1 : (count + 0.5) / tower.units });
}

describe('reference player: cutBridge rule', () => {
  it('(b) cuts the bridge under a column that would take the tower, and the sim drowns it', () => {
    // e throws 12 at p (3): p has 7–8 when they land, so the tower is lost — unless the bridge goes.
    const state = createState(bridgeLevel({ p: 3, e: 12, alt: true }), 1);
    send(state, 'e', 'p', 12);
    for (let i = 0; i < 10; i++) step(state); // 0.5 s: five units are on the bridge, seven still queued
    expect(state.units).toHaveLength(5);
    const cmds = referencePlayerCommands(state, new Rng(1));
    expect(cuts(cmds)).toEqual([{ type: 'cutBridge', owner: 'player', roadId: 'e-p' }]);
    expect(sends(cmds)).toHaveLength(0);
    for (const cmd of cmds) applyCommand(state, cmd);
    expect(state.roads['e-p']!.cut).toBe(true);
    expect(state.units).toHaveLength(0);
    expect(state.queues).toHaveLength(0);
    expect(state.events.filter((ev) => ev.type === 'bridgeCut')).toEqual([{ type: 'bridgeCut', roadId: 'e-p' }]);
    expect(state.events.filter((ev) => ev.type === 'unitDied' && ev.cause === 'bridge')).toHaveLength(5);
    expect(state.towers['p']!.units).toBe(3);
    // Cut once: the rule has nothing left to say about that road.
    expect(cuts(referencePlayerCommands(state, new Rng(1)))).toHaveLength(0);
  });

  it('(b) does not cut under a column the garrison absorbs', () => {
    // 3 attackers against 10 defenders (15 by the time they land): no reason to burn the road.
    const state = createState(bridgeLevel({ p: 10, e: 12, alt: true }), 1);
    send(state, 'e', 'p', 3);
    expect(state.queues[0]!.remaining).toBe(3);
    expect(cuts(referencePlayerCommands(state, new Rng(1)))).toHaveLength(0);
  });

  it('(b) reinforces instead of cutting when a friendly neighbour can save the tower', () => {
    // q (20) is 300 px from p: rule 1 sends deficit + 1 = 6, which lands in 2.5 s — before the column does.
    const level = bridgeLevel({ p: 3, e: 12, alt: true, towers: [{ id: 'q', x: 60, y: 1000, owner: 'player', units: 20 }], roads: [{ a: 'p', b: 'q' }] });
    const state = createState(level, 1);
    send(state, 'e', 'p', 12);
    const cmds = referencePlayerCommands(state, new Rng(1));
    expect(cuts(cmds)).toHaveLength(0);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ type: 'sendUnits', from: 'q', to: 'p' });
    applyCommand(state, cmds[0]!);
    expect(state.queues.find((q) => q.from === 'q')).toMatchObject({ to: 'p', remaining: 6 });
  });

  it('(b) cuts before the garrison across the bridge comes when nothing could answer it', () => {
    // e (20) could throw 20 at p (2): p has 9 when the last one lands, nobody can help → cut now.
    const alone = createState(bridgeLevel({ p: 2, e: 20, alt: true }), 1);
    expect(referencePlayerCommands(alone, new Rng(1))).toEqual([{ type: 'cutBridge', owner: 'player', roadId: 'e-p' }]);
    // With q (12) next door able to answer in 2.5 s, 9 + 12 > 20: keep the bridge.
    const covered = createState(
      bridgeLevel({ p: 2, e: 20, alt: true, towers: [{ id: 'q', x: 60, y: 1000, owner: 'player', units: 12 }], roads: [{ a: 'p', b: 'q' }] }),
      1,
    );
    expect(cuts(referencePlayerCommands(covered, new Rng(1)))).toHaveLength(0);
  });

  it('(b) does not cut pre-emptively toward a neutral far tower', () => {
    // A rival column about to flip the neutral across the bridge is not "about to send" until it owns it.
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 2 },
        { id: 'm', x: 360, y: 700, owner: 'neutral', units: 1 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 20 },
        { id: 'n', x: 60, y: 700, owner: 'neutral', units: 2 },
      ],
      roads: [{ a: 'p', b: 'm', kind: 'bridge' }, { a: 'm', b: 'e' }, { a: 'p', b: 'n' }, { a: 'n', b: 'e' }],
    });
    const state = createState(level, 1);
    send(state, 'e', 'm', 20);
    expect(cuts(referencePlayerCommands(state, new Rng(1)))).toHaveLength(0);
  });

  it('(c) never cuts under its own units', () => {
    const state = createState(bridgeLevel({ p: 3, e: 12, alt: true }), 1);
    send(state, 'p', 'e', 1);
    send(state, 'e', 'p', 12);
    for (let i = 0; i < 10; i++) step(state);
    expect(state.units.some((u) => u.owner === 'player' && u.roadId === 'e-p')).toBe(true);
    expect(cuts(referencePlayerCommands(state, new Rng(1)))).toHaveLength(0);
  });

  it('(c) never cuts a bridge it is sending over this tick', () => {
    const state = createState(bridgeLevel({ p: 3, e: 12, alt: true }), 1);
    send(state, 'e', 'p', 12);
    expect(bridgeCutCommands(state, 'player')).toHaveLength(1);
    expect(bridgeCutCommands(state, 'player', { usedRoads: new Set(['e-p']) })).toEqual([]);
  });

  it('(c) never cuts the last route to a remaining enemy tower', () => {
    const state = createState(bridgeLevel({ p: 3, e: 12 }), 1);
    send(state, 'e', 'p', 12);
    expect(keepsRoutes(state, 'player', state.roads['e-p']!, new Set())).toBe(false);
    expect(cuts(referencePlayerCommands(state, new Rng(1)))).toHaveLength(0);
  });

  it(`(c) never cuts a bridge whose loss makes an enemy tower more than ${MAX_DETOUR_HOPS} hop(s) further`, () => {
    // Detour p — n1 — n2 — e is three hops against the bridge's one: too long, the tower is defended instead.
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 3 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 12 },
        { id: 'n1', x: 60, y: 900, owner: 'neutral', units: 1 },
        { id: 'n2', x: 60, y: 500, owner: 'neutral', units: 1 },
      ],
      roads: [{ a: 'p', b: 'e', kind: 'bridge' }, { a: 'p', b: 'n1' }, { a: 'n1', b: 'n2' }, { a: 'n2', b: 'e' }],
    });
    const state = createState(level, 1);
    send(state, 'e', 'p', 12);
    expect(opponentHops(state, 'player', new Set())).toEqual(new Map([['e', 1]]));
    expect(opponentHops(state, 'player', new Set(['e-p']))).toEqual(new Map([['e', 3]]));
    expect(cuts(referencePlayerCommands(state, new Rng(1)))).toHaveLength(0);
  });

  it('(c) cuts at most what keeps a route: two lethal bridges to the same side, one cut', () => {
    // Bridges p—e and p—f, road e—f. Cutting e-p leaves f one hop and e two; cutting f-p too would strand both.
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 3 },
        { id: 'e', x: 100, y: 400, owner: 'enemy1', units: 12 },
        { id: 'f', x: 620, y: 400, owner: 'enemy1', units: 12 },
      ],
      roads: [{ a: 'p', b: 'e', kind: 'bridge' }, { a: 'p', b: 'f', kind: 'bridge' }, { a: 'e', b: 'f' }],
    });
    const state = createState(level, 1);
    send(state, 'e', 'p', 12);
    send(state, 'f', 'p', 12);
    expect(cuts(referencePlayerCommands(state, new Rng(1)))).toEqual([{ type: 'cutBridge', owner: 'player', roadId: 'e-p' }]);
  });

  it('(a) issues nothing for a bridge it owns no end of', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1100, owner: 'player', units: 5 },
        { id: 'n', x: 360, y: 800, owner: 'neutral', units: 1 },
        { id: 'e', x: 360, y: 300, owner: 'enemy1', units: 12 },
      ],
      roads: [{ a: 'p', b: 'n' }, { a: 'n', b: 'e', kind: 'bridge' }],
    });
    const state = createState(level, 1);
    send(state, 'e', 'n', 12);
    expect(cuts(referencePlayerCommands(state, new Rng(1)))).toHaveLength(0);
  });

  it('is deterministic: the same state yields the same cut', () => {
    const a = createState(bridgeLevel({ p: 2, e: 20, alt: true }), 1);
    const b = createState(bridgeLevel({ p: 2, e: 20, alt: true }), 1);
    expect(referencePlayerCommands(a, new Rng(5))).toEqual(referencePlayerCommands(b, new Rng(9)));
  });

  it('level 28 (Burn the Bridge): the player cuts a bridge on at least one of seeds 1–10 and wins them all', () => {
    const level = LEVELS.find((l) => l.id === 28)!;
    let playerCuts = 0;
    const lost: number[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const state = createState(level, seed);
      const rngs = rngsFor(seed, level.enemies);
      while (getOutcome(state) === 'playing' && state.time < 180_000) {
        if (isAiTick(state)) {
          const p = referencePlayerCommands(state, rngs.player);
          const e = runAiTick(state, rngs.enemies);
          for (const cmd of p) {
            const before = state.events.length;
            applyCommand(state, cmd);
            if (cmd.type === 'cutBridge') {
              expect(state.events.slice(before).some((ev) => ev.type === 'bridgeCut' && ev.roadId === cmd.roadId)).toBe(true);
              playerCuts++;
            }
          }
          for (const cmd of e) applyCommand(state, cmd);
        }
        step(state, C.TICK_MS);
      }
      if (getOutcome(state) !== 'won') lost.push(seed);
    }
    expect(lost).toEqual([]);
    expect(playerCuts).toBeGreaterThanOrEqual(1);
  });
});
