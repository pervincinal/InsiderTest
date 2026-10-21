import { describe, expect, it } from 'vitest';
import { loadLevel } from '../../src/levels/index';
import { DEFAULT_MODIFIERS, createState } from '../../src/sim/index';
import { Rng } from '../../src/sim/rng';
import { NAIVE_FIRST_MS, NAIVE_REACT_MS, NAIVE_TIES, NAIVE_TIE_EXEMPT, makeNaivePlayer, naiveGate, naiveTarget, parseTieExempt, runNaive } from '../../scripts/lib/naivePlayer';
import type { NaiveRow, NaiveTie } from '../../scripts/lib/naivePlayer';
import { parseArgs, tiesOf } from '../../scripts/lib/playtestArgs';
import { makeLevel } from '../helpers';

/*
 * GD-7f (GDD §3.12 (i) (c), §3.13 (f)): `npm run playtest -- --naive --tie asc|desc|both`. The naive
 * line's target key is (neutral-first, lane length, id); `desc` reverses only the id on an exact tie,
 * i.e. starts a mirror pair from the other side. `asc` (default) is the gated line and must not move:
 * the runner's `asc` output for 1–50 at 5 and 20 seeds was diffed byte for byte against d4810f6 on
 * 2026-10-20 (identical but the perf line). Rows at 20 seeds / 4 s on d4810f6's levels: `tie desc`
 * 3 0/20, 5 1/20, 7 20/20 89.9 s, 11 67.2 s, 13 80.1 s, 14 70.2 s, 16 70.0 s.
 */

// a mirror pair: `w` and `e` are exactly 188.68… px from `p` (dx ±160, dy −100); `f` is farther, `x` the enemy
const mirror = makeLevel({
  towers: [
    { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
    { id: 'w', x: 200, y: 900, owner: 'neutral', units: 5, level: 1 },
    { id: 'e', x: 520, y: 900, owner: 'neutral', units: 5, level: 1 },
    { id: 'f', x: 360, y: 700, owner: 'neutral', units: 5, level: 1 },
    { id: 'x', x: 360, y: 300, owner: 'enemy1', units: 10, level: 1 },
  ],
});

function firstLinks(level = mirror, tie?: NaiveTie, tune?: (s: ReturnType<typeof createState>) => void) {
  const state = createState(level, 1, DEFAULT_MODIFIERS);
  tune?.(state);
  state.time = NAIVE_FIRST_MS;
  return makeNaivePlayer({ reactMs: NAIVE_REACT_MS, ...(tie ? { tie } : {}) })(state, new Rng(1));
}

describe('naive tie order (GD-7f)', () => {
  it('on an exact tie asc takes the smaller id and desc the larger; the default is asc', () => {
    const state = createState(mirror, 1, DEFAULT_MODIFIERS);
    const p = state.towers['p']!;
    expect(Math.hypot(p.x - 200, p.y - 900)).toBe(Math.hypot(p.x - 520, p.y - 900));
    expect(naiveTarget(state, p)?.id).toBe('e');
    expect(naiveTarget(state, p, 'asc')?.id).toBe('e');
    expect(naiveTarget(state, p, 'desc')?.id).toBe('w');
    expect(firstLinks()).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'e' }]);
    expect(firstLinks(mirror, 'asc')).toEqual(firstLinks());
    expect(firstLinks(mirror, 'desc')).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'w' }]);
  });

  it('desc reverses only the id: distance and neutral-before-enemy still decide first', () => {
    // nudge `w` 1 px out: no tie any more, both orders pick `e`
    const nudged = makeLevel({ towers: mirror.towers.map((t) => (t.id === 'w' ? { ...t, x: 199 } : t)) });
    const s1 = createState(nudged, 1, DEFAULT_MODIFIERS);
    for (const tie of NAIVE_TIES) expect(naiveTarget(s1, s1.towers['p']!, tie)?.id).toBe('e');
    // the pair goes enemy: the farther neutral `f` comes first in both orders
    const s2 = createState(mirror, 1, DEFAULT_MODIFIERS);
    s2.towers['w']!.owner = 'enemy1';
    s2.towers['e']!.owner = 'enemy1';
    for (const tie of NAIVE_TIES) expect(naiveTarget(s2, s2.towers['p']!, tie)?.id).toBe('f');
    // only enemies left: the tie between them is again by id order
    s2.towers['f']!.owner = 'player';
    expect(naiveTarget(s2, s2.towers['p']!, 'asc')?.id).toBe('e');
    expect(naiveTarget(s2, s2.towers['p']!, 'desc')?.id).toBe('w');
  });

  it('asc rows are unchanged and carry no tie key; desc rows say so; both are deterministic', () => {
    const plain = runNaive(mirror, 3);
    const asc = runNaive(mirror, 3, NAIVE_REACT_MS, undefined, 'asc');
    expect(asc).toEqual(plain);
    expect('tie' in asc).toBe(false);
    const desc = runNaive(mirror, 3, NAIVE_REACT_MS, undefined, 'desc');
    expect(desc.tie).toBe('desc');
    expect(runNaive(mirror, 3, NAIVE_REACT_MS, undefined, 'desc').results).toEqual(desc.results);
    expect(() => runNaive(mirror, 1, NAIVE_REACT_MS, undefined, 'up' as NaiveTie)).toThrow(/bad tie order "up"/);
    expect(() => makeNaivePlayer({ tie: 'sideways' as NaiveTie })).toThrow(/bad tie order/);
  });

  it('level 7 (LV-21): asc opens home -> se, desc home -> sw — the west start the gate never measured', async () => {
    const level7 = (await loadLevel(7))!;
    expect(firstLinks(level7)).toEqual([{ type: 'link', owner: 'player', from: 'home', to: 'se' }]);
    expect(firstLinks(level7, 'desc')).toEqual([{ type: 'link', owner: 'player', from: 'home', to: 'sw' }]);
  });
});

describe('naive gate over both tie orders (GD-7f (2))', () => {
  const row = (id: number, wins: number, tie?: NaiveTie, k = 5): Pick<NaiveRow, 'level' | 'reactMs' | 'wins' | 'seeds' | 'losers' | 'tie'> => ({
    level: { ...mirror, id, name: `L${id}` },
    reactMs: NAIVE_REACT_MS,
    wins,
    seeds: Array.from({ length: k }, (_, i) => i + 1),
    losers: Array.from({ length: k - wins }, (_, i) => wins + i + 1),
    ...(tie === 'desc' ? { tie } : {}),
  });

  it('default ties = [asc]: desc rows are ignored, so today\'s CI gate reads exactly what it read', () => {
    const rows = [row(3, 5), row(3, 0, 'desc'), row(5, 5), row(5, 1, 'desc')];
    expect(naiveGate(rows, { from: 3, to: 5 }).map((f) => f.levelId)).toEqual([4]); // 4 not run
    expect(naiveGate(rows, { from: 3, to: 3 })).toEqual([]);
    expect(naiveGate(rows, { from: 3, to: 3 }, ['asc'])).toEqual([]);
  });

  it('[asc, desc]: a level fails when either order is under its share; a missing order fails too', () => {
    const rows = [row(3, 5), row(3, 0, 'desc'), row(5, 3), row(5, 5, 'desc'), row(9, 3), row(9, 3, 'desc'), row(12, 2), row(12, 2, 'desc')];
    expect(naiveGate(rows, { from: 3, to: 3 }, ['asc', 'desc'])).toEqual([
      { levelId: 3, name: 'L3', wins: 0, k: 5, minWins: 4, rate: 0.8, losers: [1, 2, 3, 4, 5], tie: 'desc' },
    ]);
    expect(naiveGate(rows, { from: 5, to: 5 }, ['asc', 'desc'])).toEqual([{ levelId: 5, name: 'L5', wins: 3, k: 5, minWins: 4, rate: 0.8, losers: [4, 5] }]);
    expect(naiveGate(rows, { from: 9, to: 9 }, ['asc', 'desc'])).toEqual([]);
    expect(naiveGate(rows, { from: 12, to: 12 }, ['asc', 'desc']).map((f) => [f.levelId, f.tie ?? 'asc'])).toEqual([
      [12, 'asc'],
      [12, 'desc'],
    ]);
    expect(naiveGate([row(1, 5)], { from: 1, to: 1 }, ['asc', 'desc'])).toEqual([{ levelId: 1, name: '(not run)', wins: 0, k: 0, minWins: 1, rate: 0.8, losers: [], tie: 'desc' }]);
    expect(() => naiveGate([row(1, 5)], { from: 1, to: 1 }, [])).toThrow(/bad tie orders/);
    expect(() => naiveGate([row(1, 5)], { from: 1, to: 1 }, ['asc', 'asc'])).toThrow(/bad tie orders/);
  });

  it('QA-30: a NAIVE_TIE_EXEMPT level leaves only its desc row out of the gate', () => {
    expect(Object.keys(NAIVE_TIE_EXEMPT).map(Number)).toEqual([3]);
    expect(NAIVE_TIE_EXEMPT[3]).toMatch(/^GD-7h: /);
    const rows = [row(3, 5), row(3, 0, 'desc'), row(4, 5), row(4, 0, 'desc')];
    expect(naiveGate(rows, { from: 3, to: 4 }, ['asc', 'desc'], [3]).map((f) => [f.levelId, f.tie ?? 'asc'])).toEqual([[4, 'desc']]);
    // the asc row of an exempt level is still gated, and a missing desc row is not a failure once exempt
    expect(naiveGate([row(3, 3), row(3, 0, 'desc')], { from: 3, to: 3 }, ['asc', 'desc'], [3]).map((f) => f.tie ?? 'asc')).toEqual(['asc']);
    expect(naiveGate([row(3, 5)], { from: 3, to: 3 }, ['asc', 'desc'], [3])).toEqual([]);
    expect(() => naiveGate(rows, { from: 3, to: 4 }, ['asc'], [3])).toThrow(/needs the desc order/);
    expect(() => naiveGate(rows, { from: 3, to: 4 }, ['asc', 'desc'], [4])).toThrow(/level 4 is not in NAIVE_TIE_EXEMPT/);
  });
});

describe('--tie-exempt on the command line (QA-30)', () => {
  it('parses registry ids with --gate … --tie both; refuses everything else', () => {
    expect(parseArgs(['--naive', '--gate', '1-16', '--tie', 'both', '--tie-exempt', '3']).tieExempt).toEqual([3]);
    expect(parseArgs(['--naive', '--gate=1-16', '--tie=both', '--tie-exempt=3']).tieExempt).toEqual([3]);
    expect(parseArgs(['--naive', '--gate', '1-16', '--tie', 'both']).tieExempt).toBeUndefined();
    expect(parseTieExempt('3')).toEqual([3]);
    expect(() => parseTieExempt('3,3')).toThrow(/bad --tie-exempt/);
    expect(() => parseTieExempt('x')).toThrow(/bad --tie-exempt/);
    expect(() => parseTieExempt('5')).toThrow(/--tie-exempt 5: not in NAIVE_TIE_EXEMPT/);
    expect(() => parseArgs(['--naive', '--tie-exempt', '3'])).toThrow(/only applies to --naive --gate a-b --tie both/);
    expect(() => parseArgs(['--naive', '--gate', '1-16', '--tie-exempt', '3'])).toThrow(/only applies to --naive --gate a-b --tie both/);
    expect(() => parseArgs(['--naive', '--tie', 'both', '--tie-exempt', '3'])).toThrow(/only applies to --naive --gate a-b --tie both/);
    expect(() => parseArgs(['--naive', '--gate', '4-16', '--tie', 'both', '--tie-exempt', '3'])).toThrow('--tie-exempt 3 is outside --gate 4-16');
  });
});

describe('--tie on the command line (GD-7f)', () => {
  it('asc is the default and leaves Args untouched; desc / both parse in both flag forms', () => {
    expect(parseArgs(['--naive']).tie).toBeUndefined();
    expect(parseArgs(['--naive', '--tie', 'asc'])).toEqual(parseArgs(['--naive']));
    expect(parseArgs(['--naive', '--tie', 'desc']).tie).toBe('desc');
    expect(parseArgs(['--naive', '--tie=both', '--seeds', '20']).tie).toBe('both');
    expect(tiesOf('asc')).toEqual(['asc']);
    expect(tiesOf('desc')).toEqual(['desc']);
    expect(tiesOf('both')).toEqual(['asc', 'desc']);
  });

  it('combines with --gate only as both, with --follow and --react; refused elsewhere', () => {
    expect(parseArgs(['--naive', '--gate', '1-16', '--tie', 'both'])).toMatchObject({ gate: { from: 1, to: 16 }, tie: 'both' });
    expect(() => parseArgs(['--naive', '--gate', '1-16', '--tie', 'desc'])).toThrow(/use --tie both/);
    expect(parseArgs(['--naive', '--level', '7', '--follow', 'prio=sw', '--tie', 'desc'])).toMatchObject({ follow: { prio: ['sw'] }, tie: 'desc' });
    expect(parseArgs(['--naive', '--tie', 'both', '--react', '8000'])).toMatchObject({ tie: 'both', reactMs: 8000 });
    expect(() => parseArgs(['--naive', '--tie', 'up'])).toThrow(/bad --tie up \(asc\|desc\|both\)/);
    expect(() => parseArgs(['--tie', 'desc'])).toThrow('--tie only applies to --naive');
    expect(() => parseArgs(['--naive', '--daily', '2026-10-20', '--tie', 'desc'])).toThrow(/campaign naive run/);
    expect(() => parseArgs(['--naive', '--weekly', '2026-10-19', '--tie', 'both'])).toThrow(/campaign naive run/);
  });
});
