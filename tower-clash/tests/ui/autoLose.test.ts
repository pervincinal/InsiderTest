import { describe, expect, it } from 'vitest';
import { loadLevel } from '../../src/levels/index';
import { C, DEFAULT_MODIFIERS, applyCommand, createState, getOutcome, step } from '../../src/sim/index';
import type { GameState, LevelDef } from '../../src/sim/index';
import { rngsFor, runAiTick } from '../../src/ai/index';
import { isAiTick } from '../../src/ai/common';
import { runHeadless } from '../../src/ai/headless';
import { LOSE_BOT_MARGIN, emitsWithinAiTick, suicideCommands } from '../../src/debug';
import { makeLevel } from '../helpers';

/*
 * AUD-F19 (2026-11-04): the debug "auto lose" bot (`economy.autoLose()`, src/debug.ts `suicideCommands`)
 * must lose. The old line streamed into neutrals and the strongest hostile tower; under rules v3 a stream
 * never drains its source, so it won levels 2, 4, 6, 7, 8 (and 22, 44, 50) and froze 5 — e2e loss tests
 * had to hunt for a level it happened to lose (15). The new line holds every tower on a ribbon that is
 * re-opened each AI tick and so never emits; the enemy does the rest.
 */
const LOSS_BUDGET_MS = 90_000;
const SEEDS = [1, 2, 3] as const;

const levels = new Map<number, LevelDef>();
for (let id = 1; id <= 8; id++) levels.set(id, (await loadLevel(id))!);

describe('auto-lose bot (AUD-F19)', () => {
  for (let id = 1; id <= 8; id++) {
    it(`loses level ${id} within 90 s sim on seeds ${SEEDS.join(', ')}`, () => {
      const level = levels.get(id)!;
      const rows = SEEDS.map((seed) => ({ seed, ...runHeadless(level, seed, (s) => suicideCommands(s), { maxMs: LOSS_BUDGET_MS + 1 }) }));
      for (const r of rows) {
        expect(r.outcome, `level ${id} seed ${r.seed}: ${r.outcome} at ${r.timeMs} ms`).toBe('lost');
        expect(r.timeMs, `level ${id} seed ${r.seed}`).toBeLessThan(LOSS_BUDGET_MS);
      }
    });
  }

  it('a held tower (L1 / L2) stays linked and sends nothing: no player unit ever walks a lane on level 2 until it falls', () => {
    const level = levels.get(2)!;
    const state = createState(level, 1, DEFAULT_MODIFIERS);
    const rngs = rngsFor(1, level.enemies);
    let unheld = 0; // ticks the home was ours with a soldier in it and no ribbon out
    let heldTicks = 0;
    while (getOutcome(state) === 'playing' && state.time < LOSS_BUDGET_MS) {
      if (isAiTick(state)) {
        const mine = suicideCommands(state);
        const theirs = runAiTick(state, rngs.enemies);
        for (const c of mine) applyCommand(state, c);
        for (const c of theirs) applyCommand(state, c);
      }
      step(state, C.TICK_MS);
      const home = state.towers['home']!;
      expect(emitsWithinAiTick(state, home)).toBe(false); // home starts L1 and never grows past L2 while held
      expect(state.units.filter((u) => u.owner === 'player'), `t=${state.time}`).toEqual([]);
      const linked = state.links.some((l) => l.owner === 'player' && l.from === 'home');
      if (linked) heldTicks++;
      else if (home.owner === 'player' && home.units >= 1) unheld++;
    }
    expect(getOutcome(state)).toBe('lost');
    // linked whenever it holds a soldier (an emptied tower drops its ribbon, rule 6): growth stays paused
    expect(unheld).toBe(0);
    expect(heldTicks).toBeGreaterThan(400);
    expect(state.towers['home']!.level).toBe(1);
  });

  it('never links into a neutral it would race, and re-opens the held ribbon every AI tick', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 20, level: 1 },
        { id: 'n', x: 160, y: 600, owner: 'neutral', units: 8, level: 1 },
        { id: 'e', x: 560, y: 600, owner: 'enemy1', units: 10, level: 1 },
      ],
    });
    const state: GameState = createState(level, 1, DEFAULT_MODIFIERS);
    // with an enemy lane the held ribbon goes to the enemy, not the neutral
    expect(suicideCommands(state)).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'e' }]);
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    const to = 'e';
    // next AI tick: unlink, then the same link again (a fresh, empty emission timer)
    expect(suicideCommands(state)).toEqual([
      { type: 'unlink', owner: 'player', from: 'p', to },
      { type: 'link', owner: 'player', from: 'p', to },
    ]);
    // no enemy left, and a rival taking the neutral n: the held ribbon goes to the quiet neutral e, never to n
    state.towers['e']!.owner = 'neutral';
    state.links.length = 0;
    state.links.push({ owner: 'enemy2', from: 'x', to: 'n', roadId: 'r', createdMs: 0, emitAccMs: 0, relay: false });
    expect(suicideCommands(state)).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'e' }]);
  });

  it('an L3 tower (its ribbon would emit within one AI tick) streams for real, into enemies only, and stops short of a capture', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 60, level: 3 },
        { id: 'n', x: 160, y: 600, owner: 'neutral', units: 40, level: 1 },
        { id: 'e', x: 560, y: 600, owner: 'enemy1', units: 30, level: 1 },
      ],
    });
    const state = createState(level, 1, DEFAULT_MODIFIERS);
    const p = state.towers['p']!;
    expect(emitsWithinAiTick(state, p)).toBe(true);
    const lanes = Object.values(state.roads).filter((r) => r.a === 'p' || r.b === 'p').map((r) => (r.a === 'p' ? r.b : r.a));
    expect(lanes).toContain('e');
    expect(suicideCommands(state)).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'e' }]);
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    // kept while the enemy holds enough …
    expect(suicideCommands(state)).toEqual([]);
    // … cut once it is within the margin of what our ribbon lands next (never a flip), and not re-opened into the neutral
    state.towers['e']!.units = LOSE_BOT_MARGIN;
    expect(suicideCommands(state)).toEqual([{ type: 'unlink', owner: 'player', from: 'p', to: 'e' }]);
    // the target turned neutral: cut
    state.towers['e']!.units = 30;
    state.towers['e']!.owner = 'neutral';
    expect(suicideCommands(state)).toEqual([{ type: 'unlink', owner: 'player', from: 'p', to: 'e' }]);
  });
});
