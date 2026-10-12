import { describe, expect, it } from 'vitest';
import { makeLevel, wall } from '../helpers';
import type { GameState, PlayerModifiers, SimEvent, TowerDef } from '../../src/sim/types';
import { DEFAULT_MODIFIERS } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { relaysOnward, step } from '../../src/sim/step';
import { cloneState, SnapshotRing } from '../../src/sim/snapshot';
import { C } from '../../src/sim/constants';
import { loadLevel } from '../../src/levels/index';
import { run, spawn } from './util';

/*
 * RELAY-1 (GDD §2.0b rule 13, 2026-10-12): a friendly unit landing on its owner's FULL tower that has
 * at least one outgoing link of that owner is not absorbed — it leaves again at once on the tower's
 * outgoing links, round-robin in creation order, same kind and weight, normal speed; the garrison and
 * the tower's own timers are untouched. Relay is "intentional only" for links: a link made into a full
 * own tower that already relays onward is a supply line (`relay: true`) and ends with `targetFull` only
 * when the target is full and no longer relays onward (re-checked every prune); a link made into a
 * non-full own tower is a reinforcement and ends with `targetFull` as soon as the target fills.
 *
 * Map: source `s` (360,1100) → relay `m` (360,860), 240 px (39 ticks of infantry travel); `m` has lanes
 * to `a` (120,620) and `b` (600,620); enemy `e` far behind a wall (it never acts: no AI here).
 */

const FAR_ENEMY: TowerDef = { id: 'e', x: 100, y: 100, owner: 'enemy1', units: 10 };

function relayMap(m: Partial<TowerDef>, extra: Partial<Record<'s' | 'a' | 'b', Partial<TowerDef>>> = {}, mods: Readonly<PlayerModifiers> = DEFAULT_MODIFIERS): GameState {
  return createState(
    makeLevel({
      towers: [
        { id: 's', x: 360, y: 1100, owner: 'player', units: 10, level: 1, ...extra.s },
        { id: 'm', x: 360, y: 860, owner: 'player', units: 25, level: 1, ...m },
        { id: 'a', x: 120, y: 620, owner: 'neutral', units: 200, ...extra.a },
        { id: 'b', x: 600, y: 620, owner: 'neutral', units: 200, ...extra.b },
        FAR_ENEMY,
      ],
      obstacles: [wall(0, 400, 720, 400)],
    }),
    1,
    mods,
  );
}

const link = (state: GameState, from: string, to: string): void => applyCommand(state, { type: 'link', owner: 'player', from, to });
const unlink = (state: GameState, from: string, to: string): void => applyCommand(state, { type: 'unlink', owner: 'player', from, to });
/** A freeze cast by the enemy: the player's production and streams pause (units already on lanes still walk). */
const freezePlayer = (state: GameState): void => {
  state.boosters.push({ type: 'freeze', owner: 'enemy1', untilMs: 1e9 });
};
const onLane = (state: GameState, from: string, to: string) => state.units.filter((u) => u.from === from && u.to === to);
const unlinkedEvents = (events: SimEvent[]) => events.filter((e) => e.type === 'unlinked');

describe('RELAY-1: a full own tower with outgoing links relays arrivals', () => {
  it('forwards arrivals round-robin over two outgoing links (creation order), garrison stays at capacity', () => {
    const state = relayMap({ level: 2, units: 50 }); // L2: capacity 50, two links
    link(state, 'm', 'a');
    link(state, 'm', 'b');
    freezePlayer(state); // isolate the relay from m's own streams
    for (let i = 0; i < 5; i++) spawn(state, { owner: 'player', from: 's', to: 'm', progress: 0.999 });
    step(state);
    const m = state.towers['m']!;
    expect(m).toMatchObject({ units: 50, level: 2, genAccMs: 0, relayCursor: 1 });
    expect(state.events.filter((e) => e.type === 'landed')).toHaveLength(5);
    // five arrivals in unit order → a, b, a, b, a; fresh units at m, progress 0, infantry speed
    const out = state.units.filter((u) => u.from === 'm');
    expect(out.map((u) => u.to)).toEqual(['a', 'b', 'a', 'b', 'a']);
    for (const u of out) expect(u).toMatchObject({ owner: 'player', kind: 'infantry', weight: 1, progress: 0, speed: C.UNIT_SPEED });
    expect(onLane(state, 's', 'm')).toEqual([]);
    expect(state.links.every((l) => l.emitAccMs === 0)).toBe(true); // frozen: m's own timers untouched
    // they walk on and land: 3 on a, 2 on b
    run(state, 80);
    expect(state.towers['a']!.units).toBe(197);
    expect(state.towers['b']!.units).toBe(198);
    expect(m.units).toBe(50);
  });

  it("does not touch the relay's garrison, production or emission timer: a live s → m → a chain lands s's stream on a", () => {
    const withRelay = relayMap({});
    const control = relayMap({});
    for (const st of [withRelay, control]) link(st, 'm', 'a');
    link(withRelay, 's', 'm');
    let landedOnM = 0;
    let targetFull = 0;
    for (let i = 0; i < 400; i++) {
      step(withRelay);
      step(control);
      landedOnM += withRelay.events.filter((e) => e.type === 'landed' && e.towerId === 'm').length;
      targetFull += unlinkedEvents(withRelay.events).length;
      expect(withRelay.towers['m']!.units).toBe(25); // full the whole time, never absorbs, never upgrades
      expect(withRelay.towers['m']!.level).toBe(1);
      expect(withRelay.towers['m']!.genAccMs).toBe(control.towers['m']!.genAccMs);
      expect(withRelay.links.find((l) => l.from === 'm')!.emitAccMs).toBe(control.links[0]!.emitAccMs);
    }
    expect(targetFull).toBe(0);
    expect(withRelay.links.map((l) => `${l.from}>${l.to}`)).toEqual(['m>a', 's>m']);
    // s emits at 1 000, 2 000, … ms; each lands on m 1 950 ms later: 18 landings by 20 s
    expect(landedOnM).toBe(18);
    // every relayed unit either landed on a or is still on m → a (m's own stream is identical in both runs)
    const landedOnA = control.towers['a']!.units - withRelay.towers['a']!.units;
    const inFlight = onLane(withRelay, 'm', 'a').length - onLane(control, 'm', 'a').length;
    expect(landedOnA + inFlight).toBe(landedOnM);
    expect(landedOnA).toBeGreaterThan(10);
  });

  it('no targetFull while the target streams onward; targetFull on the tick after its onward stream stops', () => {
    const state = relayMap({ level: 3, units: 100 }); // top level: unlinked it stays full (no upgrade)
    link(state, 'm', 'a');
    link(state, 's', 'm');
    expect(relaysOnward(state, state.towers['m']!)).toBe(true);
    const events: SimEvent[] = [];
    for (let i = 0; i < 100; i++) {
      step(state);
      events.push(...state.events);
    }
    expect(unlinkedEvents(events)).toEqual([]);
    unlink(state, 'm', 'a');
    expect(relaysOnward(state, state.towers['m']!)).toBe(false);
    step(state);
    expect(unlinkedEvents(state.events)).toEqual([{ type: 'unlinked', owner: 'player', from: 's', to: 'm', reason: 'targetFull' }]);
    expect(state.links).toEqual([]);
    // the units still walking s → m are absorbed as before (capped: overflow lost), nothing leaves m
    run(state, 60);
    expect(state.towers['m']!.units).toBe(100);
    expect(state.units.filter((u) => u.from === 'm')).toEqual([]);
  });

  it('a full tower without an outgoing link absorbs as before (capped), and a below-capacity relay tower reinforces', () => {
    const state = relayMap({ level: 3, units: 100 });
    spawn(state, { owner: 'player', from: 's', to: 'm', progress: 0.999 });
    step(state);
    expect(state.towers['m']!.units).toBe(100);
    expect(state.units).toEqual([]);
    // not full: a streaming tower takes the reinforcement (+1), nothing is relayed
    state.towers['m']!.units = 98;
    link(state, 'm', 'a');
    freezePlayer(state);
    spawn(state, { owner: 'player', from: 's', to: 'm', progress: 0.999 });
    step(state);
    expect(state.towers['m']!.units).toBe(99);
    expect(state.units).toEqual([]);
  });

  it('enemy arrivals on a full relaying tower are hostile landings as before (damage + under fire, no relay)', () => {
    const state = relayMap({});
    link(state, 'm', 'a');
    link(state, 's', 'm');
    freezePlayer(state);
    spawn(state, { owner: 'enemy1', from: 'a', to: 'm', progress: 0.999 });
    step(state);
    const m = state.towers['m']!;
    expect(m).toMatchObject({ owner: 'player', units: 24, underFireUntilMs: state.time + C.UNDER_FIRE_MS, relayCursor: 0 });
    expect(state.units).toEqual([]);
    // now below capacity: the next friendly arrival reinforces instead of relaying
    spawn(state, { owner: 'player', from: 's', to: 'm', progress: 0.999 });
    step(state);
    expect(m.units).toBe(25);
    expect(state.units).toEqual([]);
  });

  it('an enemy relays through its own full tower too (the rule is owner-symmetric)', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'x', x: 360, y: 1100, owner: 'enemy1', units: 10 },
          { id: 'y', x: 360, y: 860, owner: 'enemy1', units: 25 },
          { id: 'p', x: 120, y: 620, owner: 'player', units: 50, level: 2 },
        ],
      }),
      1,
    );
    applyCommand(state, { type: 'link', owner: 'enemy1', from: 'y', to: 'p' });
    state.boosters.push({ type: 'freeze', owner: 'player', untilMs: 1e9 });
    spawn(state, { owner: 'enemy1', from: 'x', to: 'y', progress: 0.999 });
    step(state);
    expect(state.towers['y']!.units).toBe(25);
    expect(state.units.map((u) => `${u.owner}:${u.from}>${u.to}`)).toEqual(['enemy1:y>p']);
  });

  it('keeps kind and weight (a tank, a clash-worn tank) and uses the owner speed modifier', () => {
    const state = relayMap({}, {}, { ...DEFAULT_MODIFIERS, unitSpeedMul: 1.2 });
    link(state, 'm', 'a');
    freezePlayer(state);
    spawn(state, { owner: 'player', from: 's', to: 'm', progress: 0.999, kind: 'tank', weight: C.TANK_WEIGHT });
    spawn(state, { owner: 'player', from: 's', to: 'm', progress: 0.999, kind: 'tank', weight: 3 });
    spawn(state, { owner: 'player', from: 's', to: 'm', progress: 0.999 });
    step(state);
    expect(state.towers['m']!.units).toBe(25);
    expect(onLane(state, 'm', 'a').map((u) => ({ kind: u.kind, weight: u.weight, speed: u.speed, progress: u.progress }))).toEqual([
      { kind: 'tank', weight: 5, speed: C.UNIT_SPEED * C.TANK_SPEED_MUL * 1.2, progress: 0 },
      { kind: 'tank', weight: 3, speed: C.UNIT_SPEED * C.TANK_SPEED_MUL * 1.2, progress: 0 },
      { kind: 'infantry', weight: 1, speed: C.UNIT_SPEED * 1.2, progress: 0 },
    ]);
    run(state, 80); // 339 px at 100.8 px/s (tanks) = 3.4 s
    expect(state.towers['a']!.units).toBe(200 - 9);
  });

  it('relays along a chain of full towers (s → m → n → a) and stays bounded', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 's', x: 360, y: 1180, owner: 'player', units: 10 },
          { id: 'm', x: 360, y: 940, owner: 'player', units: 25 },
          { id: 'n', x: 360, y: 700, owner: 'player', units: 25 },
          { id: 'a', x: 600, y: 700, owner: 'neutral', units: 300 },
          FAR_ENEMY,
        ],
        obstacles: [wall(0, 400, 720, 400)],
      }),
      1,
    );
    link(state, 'n', 'a');
    link(state, 'm', 'n');
    link(state, 's', 'm');
    run(state, 600);
    expect(state.links.map((l) => `${l.from}>${l.to}`)).toEqual(['n>a', 'm>n', 's>m']);
    expect(state.towers['m']!.units).toBe(25);
    expect(state.towers['n']!.units).toBe(25);
    // three L1 streams (1/s each) all end on a: ≈ 3/s after the travel times
    expect(300 - state.towers['a']!.units).toBeGreaterThan(70);
    expect(state.units.length).toBeLessThan(15);
  });

  it('a closed loop of full towers relays nowhere: both links end with targetFull instead of circulating units', () => {
    const state = relayMap({ level: 3, units: 100 }, { s: { level: 3, units: 100 } });
    link(state, 's', 'm');
    link(state, 'm', 's');
    expect(relaysOnward(state, state.towers['m']!)).toBe(false);
    step(state);
    expect(unlinkedEvents(state.events).map((e) => e.type === 'unlinked' && `${e.from}>${e.to}:${e.reason}`)).toEqual(['s>m:targetFull', 'm>s:targetFull']);
    expect(state.links).toEqual([]);
    // with an exit (m → a, made first so that both loop links are supply lines) the loop drains:
    // all stay, and m relays round-robin to a and s
    link(state, 'm', 'a');
    link(state, 's', 'm');
    link(state, 'm', 's');
    expect(state.links.map((l) => `${l.from}>${l.to}:${l.relay}`)).toEqual(['m>a:false', 's>m:true', 'm>s:true']);
    expect(relaysOnward(state, state.towers['m']!)).toBe(true);
    expect(relaysOnward(state, state.towers['s']!)).toBe(true);
    // steady state: m takes 2/s from s plus what s relays back; half of m's relays go out to a, so
    // the circulation converges (≈ 8/s into m, 6/s into s) instead of growing every tick
    run(state, 400);
    const at20s = state.units.length;
    run(state, 400);
    expect(state.links).toHaveLength(3);
    expect(state.units.length).toBeLessThanOrEqual(at20s + 3);
    expect(state.units.length).toBeLessThan(60);
  });

  it('intentional only: a link made into a full relaying tower is a supply line (relay: true) and keeps relaying; one made into a non-full tower is a reinforcement that ends when the tower fills', () => {
    // supply line: m is full and streams to a when s links into it
    const supply = relayMap({});
    link(supply, 'm', 'a');
    link(supply, 's', 'm');
    expect(supply.links.map((l) => `${l.from}>${l.to}:${l.relay}`)).toEqual(['m>a:false', 's>m:true']);
    const events: SimEvent[] = [];
    for (let i = 0; i < 400; i++) {
      step(supply);
      events.push(...supply.events);
    }
    expect(unlinkedEvents(events)).toEqual([]);
    expect(supply.links.map((l) => `${l.from}>${l.to}`)).toEqual(['m>a', 's>m']);
    expect(events.filter((e) => e.type === 'landed' && e.towerId === 'm')).toHaveLength(18);

    // reinforcement: m at 23 streams to a (so it does not grow); s's stream fills it and then ends
    const reinforce = relayMap({ units: 23 });
    link(reinforce, 'm', 'a');
    link(reinforce, 's', 'm');
    expect(reinforce.links.map((l) => `${l.from}>${l.to}:${l.relay}`)).toEqual(['m>a:false', 's>m:false']);
    const ended: SimEvent[] = [];
    let endedAt = -1;
    for (let i = 0; i < 400 && endedAt < 0; i++) {
      step(reinforce);
      ended.push(...unlinkedEvents(reinforce.events));
      if (ended.length) endedAt = reinforce.time;
    }
    // s emits at 1 000 / 2 000 ms, landing 1 950 ms later: the second landing (3 950 ms) fills m to 25
    expect(endedAt).toBe(3950);
    expect(ended).toEqual([{ type: 'unlinked', owner: 'player', from: 's', to: 'm', reason: 'targetFull' }]);
    expect(reinforce.towers['m']!.units).toBe(25);
    // the reinforcement's units still on s → m are relayed on arrival (m is full and streams), not capped away
    const inFlight = onLane(reinforce, 's', 'm').length;
    expect(inFlight).toBe(1); // emitted at 3 000 ms
    let relayedLater = 0;
    for (let i = 0; i < 60; i++) {
      step(reinforce);
      relayedLater += reinforce.events.filter((e) => e.type === 'landed' && e.towerId === 'm').length;
    }
    expect(relayedLater).toBe(inFlight);
    expect(reinforce.towers['m']!.units).toBe(25);
    expect(reinforce.links.map((l) => `${l.from}>${l.to}`)).toEqual(['m>a']);
  });

  it('a supply line into a relay tower that drops below capacity stays up: the tower absorbs until full, then relays again', () => {
    const state = relayMap({});
    link(state, 'm', 'a');
    link(state, 's', 'm');
    expect(state.links[1]!.relay).toBe(true);
    state.towers['m']!.units = 20; // e.g. an airstrike
    const events: SimEvent[] = [];
    for (let i = 0; i < 400; i++) {
      step(state);
      events.push(...state.events);
    }
    expect(unlinkedEvents(events)).toEqual([]);
    expect(state.links.map((l) => `${l.from}>${l.to}:${l.relay}`)).toEqual(['m>a:false', 's>m:true']);
    expect(state.towers['m']!.units).toBe(25); // the first five landings refilled it, the rest were relayed
    expect(events.filter((e) => e.type === 'landed' && e.towerId === 'm')).toHaveLength(18);
  });

  it('a capture resets the relay cursor', () => {
    const state = relayMap({ level: 2, units: 50 });
    link(state, 'm', 'a');
    link(state, 'm', 'b');
    freezePlayer(state);
    spawn(state, { owner: 'player', from: 's', to: 'm', progress: 0.999 });
    step(state);
    expect(state.towers['m']!.relayCursor).toBe(1);
    state.towers['m']!.units = 0;
    // from b: the unit just relayed walks m → a and would meet one coming from a head-on
    spawn(state, { owner: 'enemy1', from: 'b', to: 'm', progress: 0.999 });
    step(state);
    expect(state.towers['m']).toMatchObject({ owner: 'enemy1', relayCursor: 0 });
  });
});

describe('RELAY-1 snapshots', () => {
  it('a snapshot taken mid-relay (units on both legs, cursor mid-cycle) replays identically', () => {
    const state = relayMap({ level: 2, units: 50 }, { s: { level: 2, units: 30 } });
    link(state, 'm', 'a');
    link(state, 'm', 'b');
    link(state, 's', 'm');
    run(state, 150); // 7.5 s: relayed units on m → a and m → b, s's units on s → m
    expect(onLane(state, 's', 'm').length).toBeGreaterThan(0);
    expect(state.units.filter((u) => u.from === 'm').length).toBeGreaterThan(2);
    if (state.towers['m']!.relayCursor === 0) step(state); // the next arrival lands within a tick or two
    while (state.towers['m']!.relayCursor === 0) step(state);
    const cursor = state.towers['m']!.relayCursor; // mid-cycle: the next relay goes to b
    const ring = new SnapshotRing<GameState>(C.SNAPSHOT_INTERVAL_MS, C.SNAPSHOT_CAPACITY_MS);
    ring.record(state);
    const atSnapshot = JSON.stringify(state);
    run(state, 200);
    const restored = ring.rewind(0)!;
    expect(JSON.stringify(restored)).toBe(atSnapshot);
    expect(restored.towers['m']!.relayCursor).toBe(cursor);
    run(restored, 200);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(state));
    expect(state.towers['m']!.units).toBe(50);
  });
});

describe('RELAY-1 on level 2 "Supply Line" (stakeholder report, TestFlight build 10)', () => {
  it('home → mid with mid full and streaming to side: home\'s soldiers reach side through mid', async () => {
    const level = (await loadLevel(2))!;
    const state = createState(level, 1);
    const home = state.towers['home']!;
    const mid = state.towers['mid']!;
    const side = state.towers['side']!;
    // the screenshot: home L2 at 29 (selected), mid L1 at 25 (full), side enemy-held under fire from mid
    home.level = 2;
    home.units = 29;
    mid.owner = 'player';
    mid.units = 25;
    side.owner = 'enemy1';
    side.level = 3;
    side.units = 100; // under fire from the first landing: it regenerates nothing and holds 30 s
    applyCommand(state, { type: 'link', owner: 'player', from: 'mid', to: 'side' });
    const control = cloneState(state);
    applyCommand(state, { type: 'link', owner: 'player', from: 'home', to: 'mid' });
    expect(state.links.map((l) => `${l.from}>${l.to}`)).toEqual(['mid>side', 'home>mid']);
    let relayedLandings = 0;
    for (let i = 0; i < 600; i++) {
      // no AI: the sim alone; the side tower is kept from capture so every landing is counted
      step(state);
      step(control);
      relayedLandings += state.events.filter((e) => e.type === 'landed' && e.towerId === 'mid').length;
      expect(state.links.some((l) => l.from === 'home' && l.to === 'mid')).toBe(true);
      expect(mid.units).toBe(25);
    }
    // home L2 emits every 700 ms from 0.7 s; 360 px to mid = 3 s: 38 landings on mid by 30 s
    expect(relayedLandings).toBe(38);
    // side lost more in the relay run than with mid alone: home's production reached it
    // (mid → side is 434 px = 3.6 s, so the relayed units that landed are the ones relayed before 26.4 s)
    expect(control.towers['side']!.units - side.units).toBeGreaterThan(30);
    expect(side.owner).toBe('enemy1');
  });
});
