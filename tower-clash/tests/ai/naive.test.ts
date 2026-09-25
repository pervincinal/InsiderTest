import { describe, expect, it } from 'vitest';
import { loadLevel } from '../../src/levels/index';
import { C, createState, DEFAULT_MODIFIERS } from '../../src/sim/index';
import { runHeadless, starsFor } from '../../src/ai/headless';
import { Rng } from '../../src/sim/rng';
import {
  NAIVE_FIRST_MS,
  NAIVE_GATE_BANDS,
  NAIVE_GATE_LAST,
  NAIVE_REACT_MS,
  isReactionTick,
  makeNaivePlayer,
  naiveGate,
  naiveGateMinWins,
  naiveGateRate,
  naiveTarget,
  parseNaiveGate,
  runNaive,
} from '../../scripts/lib/naivePlayer';
import type { NaiveRow } from '../../scripts/lib/naivePlayer';
import { makeLevel } from '../helpers';

const level1 = (await loadLevel(1))!;

describe('naive human line (QA-3)', () => {
  it('wins level 1 within star2 at react 4000 and 8000 ms', () => {
    for (const reactMs of [NAIVE_REACT_MS, 8000]) {
      const r = runHeadless(level1, 1, makeNaivePlayer({ reactMs }));
      expect(r.outcome).toBe('won');
      expect(r.timeMs).toBeLessThanOrEqual(level1.star2);
      expect(starsFor(level1, r)).toBeGreaterThanOrEqual(2);
    }
  });

  it('is deterministic: two runs of the same (level, seed, react) are equal tick for tick, with a fresh or a reused bot', () => {
    const shared = makeNaivePlayer({ reactMs: 4000 });
    for (const seed of [1, 2, 3]) {
      const a = runHeadless(level1, seed, makeNaivePlayer({ reactMs: 4000 }));
      const b = runHeadless(level1, seed, makeNaivePlayer({ reactMs: 4000 }));
      const c = runHeadless(level1, seed, shared);
      const d = runHeadless(level1, seed, shared);
      expect(a).toEqual(b);
      expect(c).toEqual(a);
      expect(d).toEqual(a);
    }
    const row1 = runNaive(level1, 3, 8000);
    const row2 = runNaive(level1, 3, 8000);
    expect(row1.results).toEqual(row2.results);
    expect(row1.wins).toBe(3);
    expect(row1.holds).toBe(true);
    expect(row1.withinStar2).toBe(true);
  });

  it('acts on the first AI tick at or after 3000 ms and then every react delay, never in between', () => {
    expect(isReactionTick(2500, 4000, NAIVE_FIRST_MS)).toBe(false);
    expect(isReactionTick(3000, 4000, NAIVE_FIRST_MS)).toBe(true);
    expect(isReactionTick(3500, 4000, NAIVE_FIRST_MS)).toBe(false);
    expect(isReactionTick(7000, 4000, NAIVE_FIRST_MS)).toBe(true);
    expect(isReactionTick(11_000, 4000, NAIVE_FIRST_MS)).toBe(true);
    expect(isReactionTick(10_500, 4000, NAIVE_FIRST_MS)).toBe(false);
    // a delay that is not a multiple of the AI tick still fires exactly once per period, on the next AI tick
    expect(isReactionTick(4000, 1250, NAIVE_FIRST_MS)).toBe(false); // due 4250
    expect(isReactionTick(4500, 1250, NAIVE_FIRST_MS)).toBe(true);
    expect(isReactionTick(5000, 1250, NAIVE_FIRST_MS)).toBe(false);
    expect(isReactionTick(5500, 1250, NAIVE_FIRST_MS)).toBe(true);
  });

  it('opens one stream per tower to the nearest non-own tower, neutral before enemy, and only link commands', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'e', x: 360, y: 700, owner: 'enemy1', units: 10, level: 1 }, // 300 px from p, 424 px from q
        { id: 'n', x: 60, y: 1000, owner: 'neutral', units: 5, level: 1 }, // 300 px from p (tie with e: neutral first); q–n is blocked by p
        { id: 'q', x: 660, y: 1000, owner: 'player', units: 10, level: 1 },
      ],
    });
    const state = createState(level, 1, DEFAULT_MODIFIERS);
    const rng = new Rng(1);
    const bot = makeNaivePlayer({ reactMs: 4000 });
    state.time = 2500;
    expect(bot(state, rng)).toEqual([]);
    state.time = 3000;
    const cmds = bot(state, rng);
    expect(cmds).toEqual([
      { type: 'link', owner: 'player', from: 'p', to: 'n' },
      { type: 'link', owner: 'player', from: 'q', to: 'e' }, // q's only non-own lane (no lane q–n: p sits on that line)
    ]);
    expect(naiveTarget(state, state.towers['p']!)?.id).toBe('n');
    expect(naiveTarget(state, state.towers['q']!)?.id).toBe('e');
    expect(cmds.every((c) => c.type === 'link')).toBe(true);
  });

  it('never unlinks and never uses boosters over a whole match, and does nothing before the first reaction', () => {
    const state = createState(level1, 1, DEFAULT_MODIFIERS);
    const rng = new Rng(1);
    const bot = makeNaivePlayer();
    const types = new Set<string>();
    let firstAction = Infinity;
    for (let t = 0; t <= 60_000; t += C.AI_TICK_MS) {
      state.time = t;
      for (const c of bot(state, rng)) {
        types.add(c.type);
        firstAction = Math.min(firstAction, t);
      }
    }
    expect([...types]).toEqual(['link']);
    expect(firstAction).toBe(NAIVE_FIRST_MS);
  });

  it('rejects a reaction delay that is not a whole number of ticks', () => {
    expect(() => makeNaivePlayer({ reactMs: 4010 })).toThrow(/reactMs/);
    expect(() => makeNaivePlayer({ reactMs: 0 })).toThrow(/reactMs/);
  });

  describe('CI gate (`--gate a-b`)', () => {
    /** A gate row: level id/name, K seeds 1..k, `wins` wins (the losers are the last seeds). */
    const row = (id: number, wins: number, k = 5, reactMs = NAIVE_REACT_MS): Pick<NaiveRow, 'level' | 'reactMs' | 'wins' | 'seeds' | 'losers'> => ({
      level: { ...level1, id, name: `L${id}` },
      reactMs,
      wins,
      seeds: Array.from({ length: k }, (_, i) => i + 1),
      losers: Array.from({ length: k - wins }, (_, i) => wins + i + 1),
    });

    it('thresholds: 80 % for levels 1–8, 60 % for 9–16, none after (4/5 and 3/5 at K = 5)', () => {
      expect(NAIVE_GATE_BANDS.map((b) => [b.from, b.to, b.rate])).toEqual([
        [1, 8, 0.8],
        [9, 16, 0.6],
      ]);
      expect(NAIVE_GATE_LAST).toBe(16);
      for (let id = 1; id <= 8; id++) expect(naiveGateRate(id)).toBe(0.8);
      for (let id = 9; id <= 16; id++) expect(naiveGateRate(id)).toBe(0.6);
      expect(naiveGateRate(17)).toBeUndefined();
      expect(naiveGateRate(50)).toBeUndefined();
      expect(naiveGateMinWins(0.8, 5)).toBe(4);
      expect(naiveGateMinWins(0.6, 5)).toBe(3);
      expect(naiveGateMinWins(0.8, 3)).toBe(3); // K = 3 demands 3/3: use K = 5 in CI
      expect(naiveGateMinWins(0.6, 3)).toBe(2);
      expect(naiveGateMinWins(0.8, 10)).toBe(8);
      expect(naiveGateMinWins(0.6, 10)).toBe(6);
      expect(naiveGateMinWins(0.8, 1)).toBe(1);
    });

    it('passes a clean 1–16 run and reports exactly the levels under their band threshold, in id order', () => {
      const clean = Array.from({ length: 16 }, (_, i) => row(i + 1, 5));
      expect(naiveGate(clean, { from: 1, to: 16 })).toEqual([]);
      const edge = Array.from({ length: 16 }, (_, i) => row(i + 1, i + 1 <= 8 ? 4 : 3)); // exactly on the thresholds
      expect(naiveGate(edge, { from: 1, to: 16 })).toEqual([]);
      const rows = [
        ...Array.from({ length: 16 }, (_, i) => row(i + 1, 5)).filter((r) => ![3, 9, 12].includes(r.level.id)),
        row(3, 3), // 3/5 < 4/5 in the tutorial band
        row(9, 3), // 3/5 is enough after level 8
        row(12, 2), // 2/5 < 3/5
      ];
      const failures = naiveGate(rows, { from: 1, to: 16 });
      expect(failures).toEqual([
        { levelId: 3, name: 'L3', wins: 3, k: 5, minWins: 4, rate: 0.8, losers: [4, 5] },
        { levelId: 12, name: 'L12', wins: 2, k: 5, minWins: 3, rate: 0.6, losers: [3, 4, 5] },
      ]);
      // the range narrows what is gated: outside rows are ignored, and the same rows pass a range without the misses
      expect(naiveGate(rows, { from: 4, to: 11 })).toEqual([]);
      expect(naiveGate(rows, { from: 12, to: 12 }).map((f) => f.levelId)).toEqual([12]);
      // K other than 5 scales by the share: 8/10 and 6/10 hold, 7/10 in the tutorial band does not
      expect(naiveGate([row(1, 8, 10), row(9, 6, 10)], { from: 1, to: 1 })).toEqual([]);
      expect(naiveGate([row(1, 7, 10)], { from: 1, to: 1 }).map((f) => [f.levelId, f.minWins])).toEqual([[1, 8]]);
    });

    it('a level of the range that was not run fails (0 of 0): a partial run cannot pass the gate', () => {
      const failures = naiveGate([row(1, 5), row(2, 5)], { from: 1, to: 3 });
      expect(failures).toEqual([{ levelId: 3, name: '(not run)', wins: 0, k: 0, minWins: 1, rate: 0.8, losers: [] }]);
    });

    it('rejects rows from another reaction delay and ranges outside 1–16', () => {
      expect(() => naiveGate([row(1, 5, 5, 8000)], { from: 1, to: 1 })).toThrow(/react 8000 ms/);
      expect(() => naiveGate([row(1, 5)], { from: 1, to: 17 })).toThrow(/bad range/);
      expect(() => naiveGate([row(1, 5)], { from: 0, to: 1 })).toThrow(/bad range/);
      expect(() => naiveGate([row(1, 5)], { from: 3, to: 2 })).toThrow(/bad range/);
    });

    it('parses `a-b` for --gate and refuses anything past NAIVE_GATE_LAST or out of order', () => {
      expect(parseNaiveGate('1-16')).toEqual({ from: 1, to: 16 });
      expect(parseNaiveGate(' 9-16 ')).toEqual({ from: 9, to: 16 });
      expect(parseNaiveGate('3-3')).toEqual({ from: 3, to: 3 });
      expect(() => parseNaiveGate('1-17')).toThrow(/levels 1-16 only/);
      expect(() => parseNaiveGate('5-3')).toThrow(/1 <= a <= b/);
      expect(() => parseNaiveGate('0-3')).toThrow(/1 <= a <= b/);
      expect(() => parseNaiveGate('1')).toThrow(/a-b/);
      expect(() => parseNaiveGate('a-b')).toThrow(/a-b/);
    });

    it('HEAD passes the CI gate on the tutorial band at K = 5 (levels 1–8, the cheap half of the CI step)', async () => {
      const rows: NaiveRow[] = [];
      for (let id = 1; id <= 8; id++) {
        const level = (await loadLevel(id))!;
        rows.push(runNaive(level, 5, NAIVE_REACT_MS));
      }
      expect(naiveGate(rows, { from: 1, to: 8 })).toEqual([]);
    });
  });
});
