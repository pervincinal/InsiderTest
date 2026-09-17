import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { C, Rng, applyCommand, createState, step } from '../../src/sim/index';
import type { Command, GameState } from '../../src/sim/index';
import { referencePlayerCommands } from '../../src/ai/index';
import {
  SIEGE_PLAN_MS,
  TWO_HOP_DISCOUNT,
  fallsAtMs,
  holdReserve,
  landings,
  neighbours,
  producedIn,
  siegeCredit,
  siegeNetRate,
  siegeRegenPerSecond,
  threatFrom,
  walkLandings,
  type Landing,
} from '../../src/ai/common';
import { siegeForce } from '../../src/ai/personalities';
import { BLEED_PATIENCE_MS } from '../../src/ai/bridges';
import { DRAINED_UNITS } from '../../src/ai/referencePlayer';

/*
 * Rules v2.1 "Under fire" (GDD §2.0 / §2.5, AI side): a hostile landing pauses the target's recruiting
 * for UNDER_FIRE_MS = 1500 ms. The landing model, the siege arithmetic the bots share, and the
 * reference player's answers to a siege (leak, reinforce, counter, parry, bleed cut) are pinned here.
 * Roads are 240 px (2 s of infantry travel) unless stated.
 */

const link = (from: string, to: string, owner: Command['owner'] = 'player'): Command => ({ type: 'link', owner, from, to });
const unlink = (from: string, to: string): Command => ({ type: 'unlink', owner: 'player', from, to });
const cmdsOf = (state: GameState, rules?: string[]) => referencePlayerCommands(state, new Rng(1), rules ? (r) => rules.push(r) : undefined);

describe('walkLandings under fire', () => {
  const single = (units: number, level: 1 | 2 | 3) =>
    createState(makeLevel({ towers: [{ id: 'p', x: 360, y: 1000, owner: 'player', units, level }, { id: 'e', x: 360, y: 760, owner: 'enemy1', units: 1 }] }), 1);
  const hits = (gapMs: number, weight: number, count: number): Landing[] => Array.from({ length: count }, (_, i) => ({ etaMs: gapMs * (i + 1), weight, hostile: true }));

  it('a barracks trickle (1 s gaps) stops recruiting altogether: an L3 at 50 recruits only before the first landing', () => {
    const state = single(50, 3);
    const walk = walkLandings(state, state.towers['p']!, 50, hits(1000, 1, 5));
    // +2 before the first landing (2/s over 1 s), then −1 per landing with nothing recruited between.
    expect(walk).toEqual({ minUnits: 47, fallsAtMs: Infinity, hostile: true });
  });

  it('a lone tank trickle (4 s gaps) leaves 2.5 s of recruiting between landings', () => {
    const state = single(50, 3);
    const walk = walkLandings(state, state.towers['p']!, 50, hits(4000, 5, 3));
    // 50 + 8 = 58 → 53; then 2.5 s × 2/s = +5 → 58 → 53 each cycle: never below the 50 it started with.
    expect(walk).toEqual({ minUnits: 50, fallsAtMs: Infinity, hostile: true });
    // The same three tanks 1 s apart (a chain of factories) would leave nothing to recruit: 58 → 43.
    expect(walkLandings(state, state.towers['p']!, 50, hits(1000, 5, 3)).minUnits).toBe(37);
  });

  it('the rest of the current window counts: a tower hit 100 ms ago recruits nothing for the next 1.4 s', () => {
    const state = single(10, 1);
    const p = state.towers['p']!;
    p.underFireUntilMs = state.time + C.UNDER_FIRE_MS - 100;
    expect(producedIn(p, 1400, state)).toBe(0);
    expect(producedIn(p, 2400, state)).toBeCloseTo(1);
    expect(walkLandings(state, p, 10, [{ etaMs: 1400, weight: 3, hostile: true }])).toEqual({ minUnits: 7, fallsAtMs: Infinity, hostile: true });
  });

  it('holdReserve and fallsAtMs read a real L1 25-stream into an L3 100: no recruit after the burst lands', () => {
    const state = createState(
      makeLevel({ towers: [{ id: 'p', x: 360, y: 1000, owner: 'player', units: 100, level: 3 }, { id: 'e', x: 360, y: 760, owner: 'enemy1', units: 25, level: 1 }] }),
      1,
    );
    applyCommand(state, link('e', 'p', 'enemy1'));
    const p = state.towers['p']!;
    // From 0: +4 before the first landing at 2 s, then the 25-burst (landing until 4.9 s) and 5 trickle
    // landings within the horizon, nothing recruited in between: 4 − 30 = −26 → 26 + margin 1.
    // (Under v2 the keep recruited 2/s throughout: 4 + 16 − 30 = −10 → 11.)
    expect(holdReserve(state, p)).toBe(27);
    expect(fallsAtMs(state, p)).toBe(Infinity);
    expect(landings(state, p).filter((l) => l.hostile)).toHaveLength(30);
  });
});

describe('siege arithmetic (shared by every bot)', () => {
  const pair = createState(
    makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 100, level: 3 },
        { id: 'e', x: 360, y: 760, owner: 'enemy1', units: 25, level: 1 },
        { id: 'f', x: 120, y: 1000, owner: 'enemy1', units: 10, level: 1, kind: 'tankFactory' },
        { id: 'n', x: 600, y: 1000, owner: 'neutral', units: 8 },
      ],
      roads: [
        { a: 'p', b: 'e' },
        { a: 'p', b: 'f' },
        { a: 'p', b: 'n' },
      ],
    }),
    1,
  );
  const p = pair.towers['p']!;
  const e = pair.towers['e']!;
  const f = pair.towers['f']!;
  const n = pair.towers['n']!;

  it('SIEGE_PLAN_MS is 10 s (GDD §2.0 v2.1 SIEGE_PLAN_S)', () => {
    expect(SIEGE_PLAN_MS).toBe(10_000);
  });

  it('siegeRegenPerSecond: nothing under a barracks trickle, 5/8 of the rate between tanks, the full rate with no stream', () => {
    expect(siegeRegenPerSecond(p, 1000, pair)).toBe(0);
    expect(siegeRegenPerSecond(p, 1500, pair)).toBe(0);
    expect(siegeRegenPerSecond(p, 4000, pair)).toBeCloseTo(1.25);
    expect(siegeRegenPerSecond(p, Infinity, pair)).toBe(2);
  });

  it('siegeCredit: an L1 barracks lands 10 on an L3 keep in 10 s; a tank factory lands 2 tanks but the keep recruits 13 between them', () => {
    expect(siegeCredit(e, p, SIEGE_PLAN_MS, pair)).toBe(10);
    expect(siegeCredit(f, p, SIEGE_PLAN_MS, pair)).toBe(0);
    expect(siegeCredit(f, n, SIEGE_PLAN_MS, pair)).toBe(10); // a neutral recruits nothing
    expect(siegeCredit(n, p, SIEGE_PLAN_MS, pair)).toBe(0); // and produces nothing
  });

  it('siegeForce: the trickle counts only once the burst matches the effective garrison', () => {
    expect(siegeForce(pair, e, 0, p)).toBe(0);
    expect(siegeForce(pair, e, 99, p)).toBe(99);
    expect(siegeForce(pair, e, 100, p)).toBe(110);
    const fort: typeof p = { ...p, kind: 'fortress', units: 30, level: 2 };
    expect(siegeForce(pair, e, 59, fort)).toBe(59);
    expect(siegeForce(pair, e, 60, fort)).toBe(70);
  });

  it('siegeNetRate: an L3 under a 1/s trickle bleeds at −1 (it recruits nothing); a friendly L3 stream turns it to +1', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 100, level: 3 },
          { id: 'e', x: 360, y: 760, owner: 'enemy1', units: 25, level: 1 },
          { id: 'q', x: 120, y: 1000, owner: 'player', units: 100, level: 3 },
        ],
        roads: [
          { a: 'p', b: 'e' },
          { a: 'p', b: 'q' },
        ],
      }),
      1,
    );
    expect(siegeNetRate(state, state.towers['p']!)).toBe(2);
    applyCommand(state, link('e', 'p', 'enemy1'));
    expect(siegeNetRate(state, state.towers['p']!)).toBe(-1);
    expect(siegeNetRate(state, state.towers['p']!, 2)).toBe(1);
    applyCommand(state, link('q', 'p'));
    expect(siegeNetRate(state, state.towers['p']!)).toBe(1);
  });
});

describe('threatFrom: two hops through a neutral, and an own neighbour about to fall', () => {
  it('a neutral neighbour relays half of what the enemy behind it could push through (TWO_HOP_DISCOUNT = 0.5)', () => {
    expect(TWO_HOP_DISCOUNT).toBe(0.5);
    const state = createState(
      makeLevel({
        towers: [
          { id: 'home', x: 360, y: 1000, owner: 'player', units: 12 },
          { id: 'n', x: 360, y: 760, owner: 'neutral', units: 5 },
          { id: 'e', x: 360, y: 520, owner: 'enemy1', units: 20 },
        ],
        roads: [
          { a: 'home', b: 'n' },
          { a: 'n', b: 'e' },
        ],
      }),
      1,
    );
    const viaN = neighbours(state, 'home').find((x) => x.tower.id === 'n')!;
    // (20 − 6 to flip the neutral) × 0.5 = 7, timed over both roads.
    expect(threatFrom(state, 'player', viaN)).toMatchObject({ attackers: 7 });
    expect(threatFrom(state, 'player', viaN)!.etaMs).toBeGreaterThan(4000);
    // Without the enemy behind it the neutral is no threat, and the reserve is 0.
    state.towers['e']!.owner = 'neutral';
    expect(threatFrom(state, 'player', viaN)).toBeUndefined();
  });

  it('an own neighbour that falls within the horizon relays the surplus of the attack that takes it', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'home', x: 360, y: 1000, owner: 'player', units: 12 },
          { id: 'p', x: 360, y: 760, owner: 'player', units: 2 },
          { id: 'e', x: 360, y: 520, owner: 'enemy1', units: 10 },
        ],
        roads: [
          { a: 'home', b: 'p' },
          { a: 'p', b: 'e' },
        ],
      }),
      1,
    );
    const viaP = neighbours(state, 'home').find((x) => x.tower.id === 'p')!;
    expect(threatFrom(state, 'player', viaP)).toBeUndefined();
    applyCommand(state, link('e', 'p', 'enemy1'));
    // p has 4 when the 10 start landing and recruits nothing after: 10 − 4 = 6, plus the trickle landings
    // within 10 s → 12 (measured; ∞ / undefined under v2's landing model with p regrowing between hits).
    const src = threatFrom(state, 'player', viaP)!;
    expect(src.from.id).toBe('p');
    expect(src.attackers).toBe(12);
    expect(fallsAtMs(state, state.towers['p']!)).toBeLessThan(3000);
  });
});

describe('reference player: answers to a siege (rules 0b′, 1, 2a, 2b, 6)', () => {
  /** home — f — g: an enemy L2 `g` (drained) streams into own `f`; `home` supplies f. */
  const chain = (homeUnits: number, fUnits: number) => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'home', x: 360, y: 1000, owner: 'player', units: homeUnits, level: 2 },
          { id: 'f', x: 360, y: 760, owner: 'player', units: fUnits },
          { id: 'g', x: 360, y: 520, owner: 'enemy1', units: 1, level: 2 },
        ],
        roads: [
          { a: 'home', b: 'f' },
          { a: 'f', b: 'g' },
        ],
      }),
      1,
    );
    applyCommand(state, link('g', 'f', 'enemy1'));
    return state;
  };

  it('0b′ leak: a drained supply source into a tower a stream still bleeds is unlinked; a source with a wave keeps pouring', () => {
    expect(DRAINED_UNITS).toBe(1);
    const drained = chain(1, 6);
    applyCommand(drained, link('home', 'f'));
    expect(siegeNetRate(drained, drained.towers['f']!)).toBeLessThanOrEqual(0); // 1.43 in, 1.43 out, f recruits nothing
    // The leak ends and, in the same tick, f (6) counters the drained source g (1 unit): the order the GDD asks for.
    const rules: string[] = [];
    expect(cmdsOf(drained, rules)).toEqual([unlink('home', 'f'), link('f', 'g')]);
    expect(rules).toEqual(['maintain', 'counter']);
    const wave = chain(30, 6);
    applyCommand(wave, link('home', 'f'));
    expect(cmdsOf(wave).filter((c) => c.type === 'unlink')).toEqual([]);
  });

  it('1 reinforce: a helper links when its burst absorbs what is coming, not when it can only add a trickle to a leak', () => {
    // e (8) streams at p (2); q is p's only friend, 300 px away.
    const level = (q: number) =>
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 2 },
          { id: 'q', x: 60, y: 1000, owner: 'player', units: q },
          { id: 'e', x: 360, y: 640, owner: 'enemy1', units: 8 },
        ],
        roads: [
          { a: 'p', b: 'e' },
          { a: 'p', b: 'q' },
        ],
      });
    const strong = createState(level(9), 1);
    applyCommand(strong, link('e', 'p', 'enemy1'));
    expect(cmdsOf(strong)).toEqual([link('q', 'p')]);
    // q at 2: its burst cannot absorb the 8 and its 1/s only matches e's 1/s (net 0) — a leak, so no link;
    // p itself is too small to parry (2 + production against 8 landing at once).
    const weak = createState(level(2), 1);
    applyCommand(weak, link('e', 'p', 'enemy1'));
    expect(cmdsOf(weak)).toEqual([]);
  });

  it('2a counter: the drained source of a stream is attacked from another tower first, and from the sieged tower only with a surplus', () => {
    // e (drained L1, 1 unit) streams at p; q borders e but not p.
    const level = (pUnits: number, qUnits: number) =>
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: pUnits },
          { id: 'e', x: 360, y: 760, owner: 'enemy1', units: 1 },
          { id: 'q', x: 120, y: 760, owner: 'player', units: qUnits },
        ],
        roads: [
          { a: 'p', b: 'e' },
          { a: 'q', b: 'e' },
        ],
      });
    const other = createState(level(5, 15), 1);
    applyCommand(other, link('e', 'p', 'enemy1'));
    for (let i = 0; i < 20; i++) step(other); // 1 s: e is drained, its units walk to p
    const rules: string[] = [];
    expect(cmdsOf(other, rules)).toEqual([link('q', 'e')]);
    expect(rules).toEqual(['counter']);
    // No other tower: p (30) has a surplus over the handful on the road and counters itself.
    const self = createState(level(30, 0), 1);
    self.towers['q']!.owner = 'neutral';
    applyCommand(self, link('e', 'p', 'enemy1'));
    for (let i = 0; i < 20; i++) step(self);
    const selfRules: string[] = [];
    expect(cmdsOf(self, selfRules)).toEqual([link('p', 'e')]);
    expect(selfRules).toEqual(['counter']);
  });

  it('2b parry: a sieged tower with no help streams back at a source whose trickle its production matches', () => {
    // foe (drained L1) streams 1/s at west (3, L1); nothing else can help — level 3's opening.
    const state = createState(
      makeLevel({
        towers: [
          { id: 'west', x: 140, y: 820, owner: 'player', units: 3 },
          { id: 'foe', x: 360, y: 220, owner: 'enemy1', units: 0 },
        ],
        roads: [{ a: 'west', b: 'foe' }],
      }),
      1,
    );
    applyCommand(state, link('foe', 'west', 'enemy1'));
    for (let i = 0; i < 40; i++) step(state); // 2 s: two of foe's recruits are on the 600 px road
    const rules: string[] = [];
    expect(cmdsOf(state, rules)).toEqual([link('west', 'foe')]);
    expect(rules).toEqual(['parry']);
    // Against an L3 source (2/s) an L1 cannot parry: it would only feed the road.
    state.towers['foe']!.level = 3;
    applyCommand(state, link('west', 'foe'));
    applyCommand(state, unlink('west', 'foe'));
    expect(cmdsOf(state)).toEqual([]);
  });

  it('6 bleed cut: a bridge under a stream that bleeds a tower nobody can save is cut; a garrison that can outlast or counter it keeps the bridge', () => {
    expect(BLEED_PATIENCE_MS).toBe(10_000);
    const level = (homeUnits: number) =>
      makeLevel({
        towers: [
          { id: 'home', x: 360, y: 1000, owner: 'player', units: homeUnits, level: 2, kind: 'tankFactory' },
          { id: 'north', x: 360, y: 400, owner: 'enemy1', units: 0, level: 2 },
          { id: 'n', x: 60, y: 700, owner: 'neutral', units: 2 },
        ],
        roads: [{ a: 'home', b: 'north', kind: 'bridge' }, { a: 'home', b: 'n' }, { a: 'n', b: 'north' }],
      });
    const empty = createState(level(0), 1);
    applyCommand(empty, link('north', 'home', 'enemy1'));
    for (let i = 0; i < 40; i++) step(empty);
    const rules: string[] = [];
    expect(cmdsOf(empty, rules)).toEqual([{ type: 'cutBridge', owner: 'player', roadId: 'home-north' }]);
    expect(rules).toEqual(['cutBridge']);
    const full = createState(level(40), 1);
    applyCommand(full, link('north', 'home', 'enemy1'));
    for (let i = 0; i < 40; i++) step(full);
    expect(cmdsOf(full).filter((c) => c.type === 'cutBridge')).toEqual([]);
  });
});
