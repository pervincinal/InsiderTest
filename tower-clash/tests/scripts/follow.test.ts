import { describe, expect, it } from 'vitest';
import { loadLevel } from '../../src/levels/index';
import { DEFAULT_MODIFIERS, createState } from '../../src/sim/index';
import { Rng } from '../../src/sim/rng';
import {
  NAIVE_FIRST_MS,
  followTarget,
  formatFollowSpec,
  makeNaivePlayer,
  naiveGate,
  naiveTarget,
  parseFollowSpec,
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
    expect(spec).toEqual({ prio: ['west', 'east', 'outpost'], hold: ['home'], noprioFrom: ['x'] });
    expect(formatFollowSpec(spec)).toBe('prio=west,east,outpost;hold=home;noprioFrom=x');
    expect(parseFollowSpec('prio=fwd')).toEqual({ prio: ['fwd'], hold: [], noprioFrom: [] });
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
    expect(long.follow).toEqual({ prio: ['west', 'east', 'outpost'], hold: ['home'], noprioFrom: [] });
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
