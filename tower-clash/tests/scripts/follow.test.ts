import { describe, expect, it } from 'vitest';
import { loadLevel } from '../../src/levels/index';
import { C, DEFAULT_MODIFIERS, applyCommand, createState } from '../../src/sim/index';
import { Rng } from '../../src/sim/rng';
import {
  FOLLOW_HOLD_LEVEL,
  NAIVE_FIRST_MS,
  RULE_A_CLOCK_STEP_MS,
  followHoldLevel,
  followTarget,
  formatFollowSpec,
  makeNaivePlayer,
  naiveGate,
  naiveTarget,
  parseFollowSpec,
  ruleA,
  runNaive,
} from '../../scripts/lib/naivePlayer';
import { parseArgs } from '../../scripts/lib/playtestArgs';
import { makeLevel } from '../helpers';

/*
 * GD-6h: the literal card follower of GDD §3.12 item 12 (a) in the playtest runner
 * (`npm run playtest -- --naive --level N --follow "prio=a,b;hold=c;noprioFrom=d"`): the naive line, but
 * each free link goes first to the named towers in order, `hold` towers wait for L2, `noprioFrom`
 * towers play the plain line. Ported from the GD-6 scratch tool; the runner reproduces its rows
 * (7 prio=fwd 5/20, 6 prio=outpost at 8 s 0/20, 10 prio=fort 16/20 — checked by hand on 2026-10-19).
 */

// p's nearest non-own tower is the neutral n (≈ 170 px); f is a far neutral (≈ 560 px), e the enemy.
const small = makeLevel({
  towers: [
    { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
    { id: 'n', x: 500, y: 900, owner: 'neutral', units: 5, level: 1 },
    { id: 'f', x: 100, y: 500, owner: 'neutral', units: 5, level: 1 },
    { id: 'e', x: 600, y: 300, owner: 'enemy1', units: 10, level: 1 },
  ],
});

function firstReaction(level = small, follow?: ReturnType<typeof parseFollowSpec>, tune?: (s: ReturnType<typeof createState>) => void) {
  const state = createState(level, 1, DEFAULT_MODIFIERS);
  tune?.(state);
  const bot = makeNaivePlayer({ reactMs: 4000, ...(follow ? { follow } : {}) });
  state.time = NAIVE_FIRST_MS;
  return { state, cmds: bot(state, new Rng(1)) };
}

describe('card follower spec (GD-6h)', () => {
  it('parses prio / hold / noprioFrom in any order, ignores spaces, and formats canonically', () => {
    const spec = parseFollowSpec(' hold = home ; prio=west, east,outpost;noprioFrom=x ');
    expect(spec).toEqual({ prio: ['west', 'east', 'outpost'], hold: ['home'], noprioFrom: ['x'], after: [] });
    expect(formatFollowSpec(spec)).toBe('prio=west,east,outpost;hold=home;noprioFrom=x');
    expect(parseFollowSpec('prio=fwd')).toEqual({ prio: ['fwd'], hold: [], noprioFrom: [], after: [] });
    expect(formatFollowSpec(parseFollowSpec('hold=home;'))).toBe('hold=home');
  });

  it('rejects an empty spec, unknown or repeated keys, keys without ids and repeated ids', () => {
    expect(() => parseFollowSpec('')).toThrow(/bad --follow/);
    expect(() => parseFollowSpec(' ; ')).toThrow(/bad --follow/);
    expect(() => parseFollowSpec('prefer=a')).toThrow(/unknown key "prefer"/);
    expect(() => parseFollowSpec('only=a')).toThrow(/unknown key "only"/);
    expect(() => parseFollowSpec('prio=a;prio=b')).toThrow(/"prio" given twice/);
    expect(() => parseFollowSpec('prio=')).toThrow(/"prio" needs at least one tower id/);
    expect(() => parseFollowSpec('hold')).toThrow(/"hold" needs at least one tower id/);
    expect(() => parseFollowSpec('prio=a,b,a')).toThrow(/repeats a tower id/);
  });

  it('--follow and the --prefer / --hold shorthands parse to the same spec, on a one-level naive run only', () => {
    const long = parseArgs(['--naive', '--level', '6', '--follow', 'prio=west,east,outpost;hold=home', '--seeds', '20']);
    expect(long.follow).toEqual({ prio: ['west', 'east', 'outpost'], hold: ['home'], noprioFrom: [], after: [] });
    expect(long).toMatchObject({ naive: true, level: 6, seeds: 20, gate: undefined });
    expect(parseArgs(['--naive', '--level=6', '--prefer=west,east,outpost', '--hold', 'home']).follow).toEqual(long.follow);
    expect(parseArgs(['--naive', '--level', '7', '--prefer', 'fwd', '--react', '8000'])).toMatchObject({ follow: { prio: ['fwd'] }, reactMs: 8000 });
    expect(parseArgs(['--naive', '--level', '7']).follow).toBeUndefined();

    expect(() => parseArgs(['--level', '7', '--follow', 'prio=fwd'])).toThrow('--follow only applies to --naive');
    expect(() => parseArgs(['--level', '7', '--prefer', 'fwd'])).toThrow('--prefer / --hold only applies to --naive');
    expect(() => parseArgs(['--naive', '--follow', 'prio=fwd'])).toThrow('--follow needs --level N');
    expect(() => parseArgs(['--naive', '--level', '7', '--follow', 'prio=fwd', '--gate', '7-7'])).toThrow(/does not combine with --gate/);
    expect(() => parseArgs(['--naive', '--daily', '2026-10-19', '--follow', 'prio=fwd'])).toThrow(/does not apply to --naive with --daily/);
    expect(() => parseArgs(['--naive', '--level', '7', '--follow', 'prio=fwd', '--hold', 'home'])).toThrow(/two spellings of one spec/);
    expect(() => parseArgs(['--naive', '--level', '7', '--follow', 'prio'])).toThrow(/needs at least one tower id/);
  });
});

describe('card follower line (GD-6h)', () => {
  it('the first link goes to the first named tower it has a lane to, not to the nearest one', () => {
    const naive = firstReaction();
    expect(naiveTarget(naive.state, naive.state.towers['p']!)?.id).toBe('n');
    expect(naive.cmds).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);

    const follower = firstReaction(small, parseFollowSpec('prio=f,n'));
    expect(follower.cmds).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'f' }]);
    // order matters, an enemy can be named, and a named tower the player already owns is skipped
    expect(firstReaction(small, parseFollowSpec('prio=e,f')).cmds).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'e' }]);
    const owned = firstReaction(small, parseFollowSpec('prio=f'), (s) => (s.towers['f']!.owner = 'player')).cmds;
    expect(owned.filter((c) => c.type === 'link' && c.from === 'p')).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);
    expect(followTarget(follower.state, follower.state.towers['p']!, ['p', 'f'])?.id).toBe('f');
  });

  it('noprioFrom exempts a source; hold keeps an L1 tower unlinked until L2', () => {
    expect(firstReaction(small, parseFollowSpec('prio=f;noprioFrom=p')).cmds).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);
    expect(firstReaction(small, parseFollowSpec('hold=p')).cmds).toEqual([]);
    expect(firstReaction(small, parseFollowSpec('prio=f;hold=p'), (s) => (s.towers['p']!.level = 2)).cmds).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'f' }]);
  });

  it('a follower row is deterministic, carries its spec, rejects unknown tower ids and is refused by the naive gate', () => {
    const spec = parseFollowSpec('prio=f');
    const a = runNaive(small, 2, 4000, spec);
    const b = runNaive(small, 2, 4000, spec);
    expect(a.results).toEqual(b.results);
    expect(a.follow).toEqual(spec);
    expect(runNaive(small, 1).follow).toBeUndefined();
    expect(() => runNaive(small, 1, 4000, parseFollowSpec('prio=fwd'))).toThrow(/level 999 has no tower "fwd"/);
    expect(() => naiveGate([{ ...a, level: { ...small, id: 1 } }], { from: 1, to: 1 })).toThrow(/card follower/);
  });

  it('level 7 (GDD §3.12 item 12 (a)): the card follower opens home -> fwd where the naive line opens home -> se', async () => {
    const level7 = (await loadLevel(7))!;
    expect(firstReaction(level7).cmds).toEqual([{ type: 'link', owner: 'player', from: 'home', to: 'se' }]);
    expect(firstReaction(level7, parseFollowSpec('prio=fwd')).cmds).toEqual([{ type: 'link', owner: 'player', from: 'home', to: 'fwd' }]);
  });
});

describe('card follower `after=id:k` (GD-7f (3))', () => {
  it('parses id:k pairs, formats them canonically, and needs every after id in prio', () => {
    const spec = parseFollowSpec('prio=east,camp,guns,keep; after=camp:5, guns : 5,keep:7');
    expect(spec.after).toEqual([
      { id: 'camp', k: 5 },
      { id: 'guns', k: 5 },
      { id: 'keep', k: 7 },
    ]);
    expect(formatFollowSpec(spec)).toBe('prio=east,camp,guns,keep;after=camp:5,guns:5,keep:7');
    expect(formatFollowSpec(parseFollowSpec('after=f:2;prio=f;hold=p'))).toBe('prio=f;hold=p;after=f:2');
    expect(() => parseFollowSpec('prio=f;after=f')).toThrow(/after "f" is not id:k/);
    expect(() => parseFollowSpec('prio=f;after=f:0')).toThrow(/after "f:0" is not id:k/);
    expect(() => parseFollowSpec('prio=f;after=f:x')).toThrow(/is not id:k/);
    expect(() => parseFollowSpec('prio=f;after=f:2,f:3')).toThrow(/"after" repeats a tower id/);
    expect(() => parseFollowSpec('prio=f;after=n:2')).toThrow(/"n" is not in prio/);
    expect(() => parseFollowSpec('after=f:2')).toThrow(/"f" is not in prio/);
    expect(() => parseFollowSpec('prio=f;after=')).toThrow(/"after" needs at least one tower id/);
    expect(parseArgs(['--naive', '--level', '13', '--follow', 'prio=guns,outpost;after=guns:3,outpost:4']).follow?.after).toEqual([
      { id: 'guns', k: 3 },
      { id: 'outpost', k: 4 },
    ]);
  });

  it('a gated prio tower is skipped until the player owns k towers (counted at the reaction)', () => {
    // the player owns 1 tower: f (k = 2) is not eligible, the source falls through to the next prio tower, then to naive
    expect(firstReaction(small, parseFollowSpec('prio=f;after=f:2')).cmds).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);
    expect(firstReaction(small, parseFollowSpec('prio=f,e;after=f:2')).cmds).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'e' }]);
    expect(firstReaction(small, parseFollowSpec('prio=f;after=f:1')).cmds).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'f' }]);
    // own n too (2 towers): f is eligible from both sources
    const two = firstReaction(small, parseFollowSpec('prio=f;after=f:2'), (s) => (s.towers['n']!.owner = 'player')).cmds;
    expect(two).toEqual([
      { type: 'link', owner: 'player', from: 'n', to: 'f' },
      { type: 'link', owner: 'player', from: 'p', to: 'f' },
    ]);
    // `after` gates the card's instruction, not the naive line: a gated tower that is also the nearest is still taken
    expect(firstReaction(small, parseFollowSpec('prio=n;after=n:3')).cmds).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);
    const state = createState(small, 1, DEFAULT_MODIFIERS);
    expect(followTarget(state, state.towers['p']!, ['f'], [{ id: 'f', k: 2 }])).toBeUndefined();
    expect(followTarget(state, state.towers['p']!, ['f'], [])?.id).toBe('f');
  });

  it('without after the follower is unchanged; after ids are validated against the level', () => {
    const spec = parseFollowSpec('prio=f');
    expect(runNaive(small, 2, 4000, spec).results).toEqual(runNaive(small, 2, 4000, { ...spec, after: [{ id: 'f', k: 1 }] }).results);
    expect(() => runNaive(small, 1, 4000, { prio: ['f'], hold: [], noprioFrom: [], after: [{ id: 'guns', k: 3 }] })).toThrow(/after=guns: level 999 has no tower "guns"/);
  });
});

describe('card follower `hold=id@N` (GD-11g)', () => {
  it('parses an optional @N per hold id (default @2), formats @N only past L2, and rejects levels outside 2..MAX_LEVEL', () => {
    expect(FOLLOW_HOLD_LEVEL).toBe(2);
    expect(C.MAX_LEVEL).toBe(3);
    const spec = parseFollowSpec('hold=home@3');
    expect(spec).toEqual({ prio: [], hold: ['home'], holdLevel: { home: 3 }, noprioFrom: [], after: [] });
    expect(formatFollowSpec(spec)).toBe('hold=home@3');
    // no @: exactly the pre-GD-11g spec (no holdLevel key), so every existing header and row is unchanged
    expect(parseFollowSpec('hold=home')).not.toHaveProperty('holdLevel');
    expect(parseFollowSpec('hold=home@2')).not.toHaveProperty('holdLevel');
    expect(formatFollowSpec(parseFollowSpec('hold=home@2'))).toBe('hold=home');
    const mixed = parseFollowSpec('prio=f; hold = a @ 3, b ,c@2');
    expect(mixed.hold).toEqual(['a', 'b', 'c']);
    expect(mixed.holdLevel).toEqual({ a: 3 });
    expect(formatFollowSpec(mixed)).toBe('prio=f;hold=a@3,b,c');
    expect([followHoldLevel(mixed, 'a'), followHoldLevel(mixed, 'b'), followHoldLevel(mixed, 'c'), followHoldLevel(mixed, 'f'), followHoldLevel(undefined, 'a')]).toEqual([3, 2, 2, 0, 0]);
    expect(followHoldLevel(parseFollowSpec('hold=a@3'), 'constructor')).toBe(0);
    for (const bad of ['hold=x@1', 'hold=x@4', 'hold=x@0', 'hold=x@', 'hold=x@y', 'hold=@3', 'hold=x@3@3']) expect(() => parseFollowSpec(bad)).toThrow(/is not id or id@N \(2 <= N <= 3/);
    expect(() => parseFollowSpec('hold=x@3,x')).toThrow(/"hold" repeats a tower id/);
    // the --hold shorthand carries @N too
    expect(parseArgs(['--naive', '--level', '42', '--hold', 'home@3']).follow).toEqual(parseArgs(['--naive', '--level', '42', '--follow', 'hold=home@3']).follow);
  });

  it('a tower held @3 opens no link at L1 or L2, links at L3, and is not held once it has streamed', () => {
    const at = (lvl: 1 | 2 | 3) => (s: ReturnType<typeof createState>) => (s.towers['p']!.level = lvl);
    expect(firstReaction(small, parseFollowSpec('hold=p@3'), at(1)).cmds).toEqual([]);
    expect(firstReaction(small, parseFollowSpec('hold=p@3'), at(2)).cmds).toEqual([]);
    expect(firstReaction(small, parseFollowSpec('hold=p'), at(2)).cmds).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);
    expect(firstReaction(small, parseFollowSpec('prio=f;hold=p@3'), at(3)).cmds).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'f' }]);
    // already streaming (an L2 with one of its two links open): "unless it already streamed" — the second link opens
    const streaming = firstReaction(small, parseFollowSpec('hold=p@3'), (s) => {
      s.towers['p']!.level = 2;
      applyCommand(s, { type: 'link', owner: 'player', from: 'p', to: 'n' });
    });
    expect(streaming.state.links.map((l) => `${l.from}->${l.to}`)).toEqual(['p->n']);
    expect(streaming.cmds).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'f' }]);
  });

  it('@2 is the plain hold; a hold past the tower kind\'s max level is rejected against the level', () => {
    expect(runNaive(small, 2, 4000, parseFollowSpec('hold=p@2')).results).toEqual(runNaive(small, 2, 4000, parseFollowSpec('hold=p')).results);
    const fort = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1, kind: 'fortress' },
        { id: 'e', x: 600, y: 300, owner: 'enemy1', units: 10, level: 1 },
      ],
    });
    expect(() => runNaive(fort, 1, 4000, parseFollowSpec('hold=p@3'))).toThrow(/hold=p@3: level 999's "p" is a fortress \(max L2\); it would never link/);
    expect(runNaive(fort, 1, 4000, parseFollowSpec('hold=p')).follow).toEqual({ prio: [], hold: ['p'], noprioFrom: [], after: [] });
    expect(() => runNaive(small, 1, 4000, parseFollowSpec('hold=q@3'))).toThrow(/hold=q: level 999 has no tower "q"/);
  });

  it('levels 42 and 47 at 20 seeds (GD-11g acceptance, real sim): hold=home@3 20/20, 88.8 / 87.3 s and 67.9 / 67.9 s, faster than hold=home', async () => {
    const spec = parseFollowSpec('hold=home@3');
    const level42 = (await loadLevel(42))!;
    const level47 = (await loadLevel(47))!;
    const rows = [runNaive(level42, 20, 4000, spec), runNaive(level42, 20, 4000, spec, 'desc'), runNaive(level47, 20, 4000, spec), runNaive(level47, 20, 4000, spec, 'desc')];
    expect(rows.map((r) => [r.wins, r.medianMs])).toEqual([
      [20, 88_775],
      [20, 87_325],
      [20, 67_925],
      [20, 67_925],
    ]);
    // the L2 hold is a different (slower) line: @3 is not a no-op (47 hold=home is 73.7 s, see the GD-11g note)
    expect(runNaive(level42, 20, 4000, parseFollowSpec('hold=home')).medianMs).toBe(95_850);
  }, 60_000);
});

describe('rule (a) verdict: GDD §3.12 item 12 (a) on 1–16, the §3.14 clock bar past 16 (GD-8f)', () => {
  const lvl = (id: number, star2: number) => makeLevel({ id, name: `L${id}`, star2 });
  // a row of K seeds with `wins` wins and the given median (only the fields `ruleA` reads)
  const row = (id: number, star2: number, wins: number, medianMs: number | undefined, extra: { k?: number; reactMs?: number; tie?: 'desc'; follow?: ReturnType<typeof parseFollowSpec> } = {}) => {
    const k = extra.k ?? 20;
    return {
      level: lvl(id, star2),
      reactMs: extra.reactMs ?? 4000,
      wins,
      seeds: Array.from({ length: k }, (_, i) => i + 1),
      medianMs,
      holds: wins / k >= 0.5,
      ...(extra.tie ? { tie: extra.tie } : {}),
      ...(extra.follow ? { follow: extra.follow } : {}),
    };
  };

  it('levels 1–16 keep the gate share + star2 bar, text unchanged, on both tie orders, no naive row needed', () => {
    expect(ruleA(row(13, 80_000, 20, 71_900))).toEqual({ ok: true, minWins: 12, bar: 'star2', barMs: 80_000, text: 'gate share 20/20 >= 12/20 (60%), median 71.9s <= star2 80.0s' });
    expect(ruleA(row(7, 65_000, 5, 135_000))).toMatchObject({ ok: false, text: 'gate share 5/20 < 16/20 (80%), median 135.0s > star2 65.0s' });
    expect(ruleA(row(6, 95_000, 0, undefined, { k: 10 }))).toMatchObject({ ok: false, text: 'gate share 0/10 < 8/10 (80%), median no win' });
    // the desc row is judged on the clock too on 1–16 (as before GD-8f)
    expect(ruleA(row(16, 60_000, 20, 61_000, { tie: 'desc' }))).toMatchObject({ ok: false, bar: 'star2' });
  });

  it('past 16 the asc median is judged against max(star2, naive median + 5 s) when the naive line holds (GD-8f acceptance numbers)', () => {
    expect(RULE_A_CLOCK_STEP_MS).toBe(5000);
    const naive18 = row(18, 60_000, 20, 66_800);
    expect(ruleA(row(18, 60_000, 20, 61_700), naive18)).toEqual({
      ok: true,
      minWins: 16,
      bar: 'naive',
      barMs: 71_800,
      text: 'wins 20/20 >= 16/20 (80%), median 61.7s <= bar 71.8s = max(star2 60.0s, naive 66.8s + 5s) (GDD §3.14)',
    });
    expect(ruleA(row(18, 60_000, 19, 85_500), naive18)).toMatchObject({ ok: false, barMs: 71_800, text: expect.stringContaining('median 85.5s > bar 71.8s') });
    expect(ruleA(row(17, 50_000, 20, 63_600), row(17, 50_000, 20, 54_400))).toMatchObject({ ok: false, barMs: 59_400 });
    expect(ruleA(row(20, 50_000, 20, 49_300), row(20, 50_000, 20, 49_300))).toMatchObject({ ok: true, barMs: 54_300 });
    // the naive line within star2 by more than a step: the bar is star2 itself (22: 63.4 + 5 < 70)
    expect(ruleA(row(22, 70_000, 20, 65_100), row(22, 70_000, 20, 63_400))).toMatchObject({ ok: true, bar: 'naive', barMs: 70_000, text: expect.stringContaining('bar 70.0s = max(star2 70.0s, naive 63.4s + 5s)') });
    // exactly on the bar passes
    expect(ruleA(row(24, 60_000, 20, 71_700), row(24, 60_000, 20, 66_700)).ok).toBe(true);
    expect(ruleA(row(24, 60_000, 20, 77_200), row(24, 60_000, 20, 66_700))).toMatchObject({ ok: false, barMs: 71_700 });
  });

  it('past 16: a naive line under 50 % leaves the bar at star2; the win half is 80 % on both orders; desc is judged on wins only', () => {
    expect(ruleA(row(23, 75_000, 18, 82_300), row(23, 75_000, 7, 86_800))).toEqual({
      ok: false,
      minWins: 16,
      bar: 'star2',
      barMs: 75_000,
      text: 'wins 18/20 >= 16/20 (80%), median 82.3s > bar 75.0s = star2 (naive 7/20 < 50%: the naive line does not hold) (GDD §3.14)',
    });
    expect(ruleA(row(23, 75_000, 20, 74_000), row(23, 75_000, 7, 86_800)).ok).toBe(true);
    // fast but under 80 %: NO, whatever the clock (before GD-8f there was no win half past 16)
    expect(ruleA(row(30, 90_000, 15, 40_000), row(30, 90_000, 20, 60_000))).toMatchObject({ ok: false, minWins: 16, text: expect.stringMatching(/^wins 15\/20 < 16\/20 \(80%\)/) });
    expect(ruleA(row(30, 90_000, 0, undefined), row(30, 90_000, 20, 60_000))).toMatchObject({ ok: false, text: expect.stringContaining('median no win (bar 90.0s = max(star2 90.0s, naive 60.0s + 5s))') });
    // tie desc: wins only, no naive row needed, a slow median does not fail it
    expect(ruleA(row(18, 60_000, 20, 120_000, { tie: 'desc' }))).toEqual({ ok: true, minWins: 16, bar: 'none', barMs: undefined, text: 'wins 20/20 >= 16/20 (80%), clock not judged on tie desc (GDD §3.14: the bar reads asc)' });
    expect(ruleA(row(18, 60_000, 3, 50_000, { k: 5, tie: 'desc' }))).toMatchObject({ ok: false, minWins: 4 });
  });

  it('past 16 the asc verdict needs the plain naive asc row of the same level, K and reaction', () => {
    const f = row(18, 60_000, 20, 61_700);
    expect(() => ruleA(f)).toThrow(/needs the plain naive asc row/);
    expect(() => ruleA(f, row(19, 60_000, 20, 66_800))).toThrow(/same level, K = 20 and react 4000 ms/);
    expect(() => ruleA(f, row(18, 60_000, 10, 66_800, { k: 10 }))).toThrow(/same level/);
    expect(() => ruleA(f, row(18, 60_000, 20, 66_800, { reactMs: 8000 }))).toThrow(/same level/);
    expect(() => ruleA(f, row(18, 60_000, 20, 66_800, { tie: 'desc' }))).toThrow(/same level/);
    expect(() => ruleA(f, row(18, 60_000, 20, 66_800, { follow: parseFollowSpec('prio=e1') }))).toThrow(/same level/);
  });

  it('level 18 at 20 seeds (GD-8f acceptance, real sim): prio=e1,e2 -> NO (85.5 > 71.8), prio=w1,e1,w2 -> ok (61.7 <= 71.8)', async () => {
    const level18 = (await loadLevel(18))!;
    const naive = runNaive(level18, 20);
    expect(naive.medianMs).toBe(66_775); // prints 66.8s; the bar is 71.775 s ("71.8s")
    expect(ruleA(runNaive(level18, 20, 4000, parseFollowSpec('prio=e1,e2')), naive)).toMatchObject({ ok: false, bar: 'naive' });
    const good = ruleA(runNaive(level18, 20, 4000, parseFollowSpec('prio=w1,e1,w2')), naive);
    expect(good).toMatchObject({ ok: true, bar: 'naive' });
    expect(good.barMs).toBe(Math.max(level18.star2, naive.medianMs! + 5000));
    expect(good.text).toMatch(/median 61\.7s <= bar 71\.8s = max\(star2 60\.0s, naive 66\.8s \+ 5s\)/);
  }, 60_000);
});
