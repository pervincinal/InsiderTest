import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { C, DEFAULT_MODIFIERS, Rng, applyCommand, createState, step } from '../../src/sim/index';
import type { Command, GameState, PlayerModifiers, TowerDef } from '../../src/sim/index';
import { contestHeld, contestOf, isAiTick, referencePlayerCommands, rngsFor, runAiTick } from '../../src/ai/index';
import { flipOwner } from '../../src/ai/common';
import { CONTEST_MARGIN_MS, FINISH_MS, GROW_HOME_MS, growHome, msToNextLevel } from '../../src/ai/referencePlayer';
import { defend, newCtx } from '../../src/ai/tactics';
import { MIN_ATTACK_MS } from '../../src/ai/tactics';

/*
 * AI-8 (2026-09-23, level-designers): under lean the reference player never grew the L2 home (always
 * linked), abandoned a capture one landing from completion to reinforce a threatened tower (level 10
 * lean trace), and the flat +10 s contest penalty ceded every cheap contested neutral. One test per
 * rule on the trace-based fixture the item names — home L2 30 at (360,1100), fort at (360,700), west
 * neutral at (120,900) 4 units, enemy spare at (600,500) 8 units — adapted so the 2026-09-22 bot
 * (whose decision each test states) abandons and this one finishes.
 */

const LEAN: Readonly<PlayerModifiers> = { ...DEFAULT_MODIFIERS, productionMul: 0.9 };
function game(towers: TowerDef[], modifiers: Readonly<PlayerModifiers> = LEAN): GameState {
  return createState(makeLevel({ towers, enemies: [{ owner: 'enemy1', personality: 'rusher', aggression: 0.3 }] }), 1, modifiers);
}
const link = (owner: 'player' | 'enemy1', from: string, to: string): Command => ({ type: 'link', owner, from, to });
const unlink = (from: string, to: string): Command => ({ type: 'unlink', owner: 'player', from, to });
const bot = (state: GameState, trace?: (rule: string, cmd: Command) => void) => referencePlayerCommands(state, new Rng(1), trace);
function run(state: GameState, ms: number): void {
  for (let i = 0; i < ms / C.TICK_MS; i++) step(state, C.TICK_MS);
}
/** Play `ms` of sim time with the reference player and the level's enemies, as the headless runner does. */
function play(state: GameState, ms: number): void {
  const rngs = rngsFor(1, state.enemies);
  const until = state.time + ms;
  while (state.time < until) {
    if (isAiTick(state)) {
      for (const cmd of referencePlayerCommands(state, rngs.player)) applyCommand(state, cmd);
      for (const cmd of runAiTick(state, rngs.enemies)) applyCommand(state, cmd);
    }
    step(state, C.TICK_MS);
  }
}

describe('AI-8c contest: the parity result replaces the flat +10 s penalty', () => {
  it('a fortress at N falls to landing 2N + 2, not 2N + 1 (the level 10 lean cede)', () => {
    // home 120 px from the fort: landings at 2, 3, 4, 5 s; foe 300 px away: 3.5, 4.5 s. A fortress at 1
    // needs four landings (sim: `damage > units` needs the defence accumulator to reach a whole unit
    // beyond the last defender), so the 4th — ours at 4 s — flips it; the 2026-09-22 model handed the
    // 3rd (the foe's at 3.5 s) the flip.
    const state = game([
      { id: 'home', x: 360, y: 1000, owner: 'player', units: 12 },
      { id: 'fort', x: 360, y: 880, owner: 'neutral', units: 1, kind: 'fortress' },
      { id: 'foe', x: 360, y: 580, owner: 'enemy1', units: 8 },
    ], DEFAULT_MODIFIERS);
    applyCommand(state, link('player', 'home', 'fort'));
    applyCommand(state, link('enemy1', 'foe', 'fort'));
    const contest = contestOf(state, state.towers['fort']!);
    expect(contest.winner).toBe('player');
    expect(contest.flipAtMs).toBeCloseTo(4000, 0);
    expect(flipOwner(state, state.towers['fort']!)).toBe('player');
    // Proof in the sim: the fort is ours after the 4th landing.
    run(state, 4100);
    expect(state.towers['fort']!.owner).toBe('player');
    // The same race on a barracks at 1: two landings, ours at 3 s (unchanged by the fix).
    const camp = game([
      { id: 'home', x: 360, y: 1000, owner: 'player', units: 12 },
      { id: 'camp', x: 360, y: 880, owner: 'neutral', units: 1 },
      { id: 'foe', x: 360, y: 580, owner: 'enemy1', units: 8 },
    ], DEFAULT_MODIFIERS);
    applyCommand(camp, link('player', 'home', 'camp'));
    applyCommand(camp, link('enemy1', 'foe', 'camp'));
    expect(contestOf(camp, camp.towers['camp']!)).toMatchObject({ winner: 'player', garrison: 1 });
    expect(contestOf(camp, camp.towers['camp']!).flipAtMs).toBeCloseTo(3000, 0);
  });

  it('keeps a contest lost by a hair when the next landing takes the tower back (level 26: a tank 52 ms behind)', () => {
    // Level 26 geometry under lean: the factory's first tank lands 5 weight at 9.15 s; red's 4th infantry
    // flips the 3-unit camp at 9.09 s with a garrison of 1 — which the tank takes straight back.
    const state = game([
      { id: 'factory', x: 150, y: 1120, owner: 'player', units: 10, kind: 'tankFactory' },
      { id: 'home', x: 360, y: 1170, owner: 'player', units: 18 },
      { id: 'e', x: 570, y: 1000, owner: 'neutral', units: 3 },
      { id: 'red', x: 200, y: 440, owner: 'enemy1', units: 12 },
      { id: 'green', x: 520, y: 440, owner: 'enemy1', units: 12 },
    ]);
    applyCommand(state, link('player', 'factory', 'e'));
    applyCommand(state, link('enemy1', 'red', 'e'));
    run(state, 500);
    const contest = contestOf(state, state.towers['e']!);
    expect(contest.winner).toBe('enemy1');
    expect(contest.garrison).toBe(1);
    expect(contest.retake?.owner).toBe('player');
    expect(contest.retake!.atMs - contest.flipAtMs).toBeLessThan(100);
    expect(CONTEST_MARGIN_MS).toBe(500);
    expect(contestHeld(contest, 'player', CONTEST_MARGIN_MS)).toBe(true);
    expect(contestHeld(contest, 'player', 0)).toBe(false); // pure parity: the 2026-09-22 rule ceded it
    // The bot keeps the stream (the old one issued `unlink factory>e` here) and the sim agrees: e is ours.
    expect(bot(state).some((c) => c.type === 'unlink' && c.from === 'factory')).toBe(false);
    run(state, 9500);
    expect(state.towers['e']!.owner).toBe('player');
  });

  it('a retake that depends on later landings is not a tie: an L2 stream a landing behind an L1 cedes', () => {
    // Ours 1.29/s (lean) v theirs 1/s on a 4-unit camp, theirs 3.5 s ahead: their 5th landing flips it
    // at 4.0 s with 1 unit; our 2nd landing takes it back at 4.9 s — 0.9 s later, beyond the margin, and
    // not a unit already on the lane: time enough for them to react.
    const state = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 30, level: 2 },
      { id: 'camp', x: 360, y: 700, owner: 'neutral', units: 4 },
      { id: 'foe', x: 360, y: 400, owner: 'enemy1', units: 8 },
      { id: 'far', x: 60, y: 300, owner: 'enemy1', units: 8 },
    ]);
    applyCommand(state, link('enemy1', 'foe', 'camp'));
    run(state, 3500);
    applyCommand(state, link('player', 'home', 'camp'));
    const contest = contestOf(state, state.towers['camp']!);
    expect(contest.winner).toBe('enemy1');
    expect(contest.retake?.owner).toBe('player');
    expect(contest.retake!.atMs - contest.flipAtMs).toBeGreaterThan(CONTEST_MARGIN_MS);
    expect(bot(state)).toContainEqual(unlink('home', 'camp'));
  });

  it('takes a cheap contested neutral it wins on parity over a big free one (no flat penalty)', () => {
    // `cheap` (3 units, 240 px) is streamed at by the foe (360 px away: landings from 4.0 s); ours land
    // from 2.8 s every 0.78 s, so the 4th landing — ours at 4.3 s — flips it. `big` (8 units, 300 px)
    // is free but falls at ≈ 10.3 s. The 2026-09-22 bot scored cheap 10 s worse (14.3 s) and took big.
    const state = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 30, level: 2 },
      { id: 'cheap', x: 360, y: 860, owner: 'neutral', units: 3 },
      { id: 'big', x: 60, y: 1100, owner: 'neutral', units: 8 },
      { id: 'foe', x: 360, y: 500, owner: 'enemy1', units: 8 },
      { id: 'far', x: 660, y: 300, owner: 'enemy1', units: 8 },
    ]);
    applyCommand(state, link('enemy1', 'foe', 'cheap'));
    const contest = contestOf(state, state.towers['cheap']!, { planned: [{ owner: 'player', from: 'home', to: 'cheap' }] });
    expect(contest.winner).toBe('player');
    expect(contest.flipAtMs).toBeLessThan(5000);
    expect(bot(state)[0]).toEqual(link('player', 'home', 'cheap'));
  });
});

describe('AI-8b finish the capture (FINISH_MS)', () => {
  /** The trace fixture: home streams into the fort (one landing from falling) and east; spare and west attack home. */
  function fixture(): GameState {
    const state = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 30, level: 2 },
      { id: 'west', x: 120, y: 900, owner: 'enemy1', units: 4 },
      { id: 'fort', x: 360, y: 700, owner: 'enemy1', units: 5, kind: 'fortress' },
      { id: 'spare', x: 600, y: 500, owner: 'enemy1', units: 8 },
      { id: 'east', x: 600, y: 900, owner: 'enemy1', units: 9 },
    ]);
    applyCommand(state, link('player', 'home', 'fort'));
    applyCommand(state, link('player', 'home', 'east'));
    run(state, 1000);
    applyCommand(state, link('enemy1', 'spare', 'home'));
    applyCommand(state, link('enemy1', 'west', 'home'));
    run(state, 10_000);
    // Both enemy columns are on their lanes; the fort is one landing from falling; home is nearly empty.
    state.towers['home']!.units = 1;
    state.towers['fort']!.units = 1;
    state.towers['fort']!.defenceAcc = 0.5;
    return state;
  }

  it('does not reclaim a capture that completes within FINISH_MS for a shield that cannot save the tower in time', () => {
    expect(FINISH_MS).toBe(3000);
    const state = fixture();
    // The 2026-09-22 rule reclaimed the fort stream for a shield on spare's lane (the fort outlives home):
    const old = newCtx(state, 'player');
    defend(old, state.towers['home']!, { counterMs: 30_000, reclaimReinforcement: true });
    expect(old.cmds).toEqual([unlink('home', 'fort'), link('player', 'home', 'spare')]);
    // With FINISH_MS: home falls to west's column before the capture completes even shielded, so the
    // shield saves nothing and the capture is finished instead (nothing to do this tick).
    const rules: string[] = [];
    expect(bot(state, (rule) => rules.push(rule))).toEqual([]);
    expect(rules).toEqual([]);
    // The sim: the fort is ours within FINISH_MS.
    play(state, FINISH_MS);
    expect(state.towers['fort']!.owner).toBe('player');
  });

  it('still reclaims the capture when the shield keeps the tower standing past it', () => {
    const state = fixture();
    // Without west's column home holds behind a shield on spare's lane long enough for the capture to
    // complete — but then home itself outlives the capture, so the capture is kept for that reason; make
    // home fall first (2 s) with the capture 2.5 s away and the shield saving it: the shield wins.
    state.units = state.units.filter((u) => u.from !== 'west');
    applyCommand(state, { type: 'unlink', owner: 'enemy1', from: 'west', to: 'home' });
    state.towers['home']!.units = 1;
    const ctx = newCtx(state, 'player');
    defend(ctx, state.towers['home']!, { counterMs: 30_000, reclaimReinforcement: true, finishMs: FINISH_MS });
    expect(ctx.cmds).toEqual([unlink('home', 'fort'), link('player', 'home', 'spare')]);
  });
});

describe('AI-8a grow home (GROW_HOME_MS)', () => {
  function fixture(): GameState {
    // Home L2 45 under lean: 5 units at 1.29/s = 3.9 s to L3; its stream joins a fort siege west carries alone.
    const state = game([
      { id: 'home', x: 360, y: 1100, owner: 'player', units: 45, level: 2 },
      { id: 'west', x: 120, y: 900, owner: 'player', units: 30, level: 2 },
      { id: 'fort', x: 360, y: 700, owner: 'enemy1', units: 5, kind: 'fortress' },
      { id: 'spare', x: 600, y: 500, owner: 'enemy1', units: 8 },
    ]);
    applyCommand(state, link('player', 'home', 'fort'));
    applyCommand(state, link('player', 'west', 'fort'));
    run(state, 1000);
    return state;
  }

  it('a linked home within reach of its next level drops a siege its neighbour carries and grows to L3', () => {
    expect(GROW_HOME_MS).toBe(8000);
    const state = fixture();
    expect(msToNextLevel(state.towers['home']!, state)).toBeLessThan(GROW_HOME_MS);
    const rules: string[] = [];
    // The 2026-09-22 bot kept the stream and opened a second one (attack home>spare); this one grows.
    expect(bot(state, (rule) => rules.push(rule))).toEqual([unlink('home', 'fort')]);
    expect(rules).toEqual(['grow']);
    // It stays reserved: no capture, attack or stack re-links it while it grows, and it reaches L3.
    play(state, 500);
    expect(state.links.some((l) => l.from === 'home')).toBe(false);
    play(state, 5000);
    expect(state.towers['home']!.level).toBe(3);
    expect(state.links.some((l) => l.from === 'west' && l.to === 'fort')).toBe(true);
  });

  it('never drops a shield, a capture only it carries, or a reinforcement', () => {
    const state = fixture();
    // A hostile stream back down home's lane makes home>fort a shield: not dispensable.
    applyCommand(state, link('enemy1', 'fort', 'home'));
    expect(growHome(newCtx(state, 'player'), new Map(), 60_000)).toBeUndefined();
    applyCommand(state, { type: 'unlink', owner: 'enemy1', from: 'fort', to: 'home' });
    // West leaves the siege: home's stream is the only one on the fort — not dispensable either.
    applyCommand(state, unlink('west', 'fort'));
    expect(growHome(newCtx(state, 'player'), new Map(), 60_000)).toBeUndefined();
    // A supply line that keeps west standing is a reinforcement: not dispensable.
    applyCommand(state, unlink('home', 'fort'));
    applyCommand(state, link('enemy1', 'fort', 'west'));
    state.towers['west']!.units = 2;
    applyCommand(state, link('player', 'home', 'west'));
    run(state, 2000);
    expect(growHome(newCtx(state, 'player'), new Map(), 60_000)).toBeUndefined();
  });

  it('the reserve is sticky: an unlinked tower already growing stays the one, a second is not unlinked', () => {
    const state = fixture();
    // Make west an equal candidate (L2, within reach) that is linked; home is unlinked and growing.
    applyCommand(state, unlink('home', 'fort'));
    state.towers['west']!.units = 46;
    const ctx = newCtx(state, 'player');
    expect(growHome(ctx, new Map(), 60_000)?.id).toBe('home');
    expect(MIN_ATTACK_MS).toBe(5000);
  });
});
