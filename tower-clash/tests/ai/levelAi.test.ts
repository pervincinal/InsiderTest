import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { Rng, createState } from '../../src/sim/index';
import type { Command, EnemyAiOptions, EnemyDef, LevelDef, TowerDef } from '../../src/sim/index';
import { enemyCommands } from '../../src/ai/index';
import { runHeadless } from '../../src/ai/headless';
import { loadAllLevels, loadLevel } from '../../src/levels/index';
import { AI_OPTION_KEYS, MAX_FRONT_BIAS_S, validateAi, validateLevel } from '../../scripts/lib/validateLevel';
import { makeNaivePlayer } from '../../scripts/lib/naivePlayer';

/*
 * LV-13 (2026-11-06): the per-level enemy AI switch `LevelDef.ai` (AUD-A3 opponent awareness, memo
 * `docs/reviews/2026-11-05-ai-engagement.md` §6). The level carries the options; the client passes
 * `level.ai` to `enemyCommands` and `runHeadless` defaults `options.ai` to it, so every script reads
 * the same switch. No shipped level sets it today: the hygiene test below fails the day one does —
 * update it on purpose, with a line in the backlog.
 *
 * Fixture (tests/ai/opponentAwareness.test.ts): enemy `e` 600 px from the player's `p` (L1 at 10, falls
 * at 22 s to one L1 stream) and a grey `n` 600 px east (at 10, falls at 16 s). Off, the rusher takes the
 * grey that falls first; on, the player (22 − 20 s < 16 s).
 */

const ON: EnemyAiOptions = { opponentAwareness: true };
const OFF: EnemyAiOptions = { opponentAwareness: false };
const rusher: EnemyDef = { owner: 'enemy1', personality: 'rusher', aggression: 1 };
const link = (from: string, to: string): Command => ({ type: 'link', owner: 'enemy1', from, to });

const FORK: TowerDef[] = [
  { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
  { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 8, level: 1 },
  { id: 'n', x: 960, y: 400, owner: 'neutral', units: 10, level: 1 },
];
/** `id` 3: inside band 1–8 (one barracks enemy, no obstacles), so `validateLevel` has nothing else to say. */
const plain = (): LevelDef => makeLevel({ towers: FORK, enemies: [rusher] });
const valid = (over: Partial<LevelDef> = {}): LevelDef => makeLevel({ id: 3, ...over });
const withAi = (ai: EnemyAiOptions = ON): LevelDef => makeLevel({ towers: FORK, enemies: [rusher], ai });

/** What `ui/play.ts runAi` does for one enemy: the level's own `ai` block, nothing else. */
const clientCommands = (level: LevelDef): Command[] => enemyCommands(createState(level, 1), rusher, new Rng(1), undefined, level.ai);

describe('LevelDef.ai reaches the enemies (LV-13)', () => {
  it('the client call: a level with ai { opponentAwareness: true } makes the rusher take the player; without it, the grey', () => {
    expect(clientCommands(withAi())).toEqual([link('e', 'p')]);
    expect(clientCommands(plain())).toEqual([link('e', 'n')]);
    expect('ai' in plain()).toBe(false);
    // the same block with the flag off, or a smaller bias than the 6 s the grey wins by, is today's enemy
    expect(clientCommands(withAi(OFF))).toEqual([link('e', 'n')]);
    expect(clientCommands(withAi({ opponentAwareness: true, frontBiasS: { rusher: 5, opportunist: 5, turtle: 5 } }))).toEqual([link('e', 'n')]);
  });

  it('runHeadless reads the level block by default: a level 49 with ai on plays exactly runHeadless({ ai: on }) and not today', async () => {
    const level = (await loadLevel(49))!;
    const on: LevelDef = { ...level, ai: ON };
    const today = runHeadless(level, 1, makeNaivePlayer());
    const explicit = runHeadless(level, 1, makeNaivePlayer(), { ai: ON });
    expect(runHeadless(on, 1, makeNaivePlayer())).toEqual(explicit);
    expect(explicit.timeMs === today.timeMs && explicit.outcome === today.outcome).toBe(false);
  });

  it('runHeadless: an explicit option wins over the level block (measurement sweeps)', async () => {
    const level = (await loadLevel(49))!;
    const on: LevelDef = { ...level, ai: ON };
    const today = runHeadless(level, 1, makeNaivePlayer());
    expect(runHeadless(on, 1, makeNaivePlayer(), { ai: OFF })).toEqual(today);
    expect(runHeadless(on, 1, makeNaivePlayer(), { ai: {} })).toEqual(today);
    expect(runHeadless(level, 1, makeNaivePlayer(), { ai: ON })).toEqual(runHeadless(on, 1, makeNaivePlayer(), { ai: ON }));
  });

  it('a level without ai is byte-identical to today on every path', async () => {
    const level = (await loadLevel(49))!;
    const today = runHeadless(level, 1, makeNaivePlayer());
    expect(runHeadless(level, 1, makeNaivePlayer(), {})).toEqual(today);
    expect(runHeadless({ ...level, ai: undefined }, 1, makeNaivePlayer())).toEqual(today);
    expect(runHeadless({ ...level, ai: {} }, 1, makeNaivePlayer())).toEqual(today);
    expect(runHeadless({ ...level, ai: OFF }, 1, makeNaivePlayer())).toEqual(today);
    const state = createState(plain(), 1);
    expect(enemyCommands(state, rusher, new Rng(1), undefined, plain().ai)).toEqual(enemyCommands(state, rusher, new Rng(1)));
  });
});

describe('levels:check validates ai (validateAi)', () => {
  it('accepts no block, an empty block, the flag alone and a full bias record', () => {
    expect(validateLevel(valid())).toEqual([]);
    expect(validateLevel(valid({ ai: {} }))).toEqual([]);
    expect(validateLevel(valid({ ai: ON }))).toEqual([]);
    expect(validateLevel(valid({ ai: OFF }))).toEqual([]);
    expect(validateLevel(valid({ ai: { opponentAwareness: true, frontBiasS: { rusher: 60, opportunist: 30, turtle: 15 } } }))).toEqual([]);
    expect(validateAi(makeLevel({ ai: { frontBiasS: { rusher: 0, opportunist: MAX_FRONT_BIAS_S, turtle: 2.5 } } }))).toEqual([]);
    expect(MAX_FRONT_BIAS_S).toBe(120);
    expect(AI_OPTION_KEYS).toEqual(['opponentAwareness', 'frontBiasS']);
  });

  it('rejects a non-boolean opponentAwareness and a block that is not an object', () => {
    const bad = (ai: unknown): string[] => validateAi({ ...makeLevel(), ai: ai as EnemyAiOptions });
    expect(bad({ opponentAwareness: 'yes' })).toEqual(['ai.opponentAwareness must be a boolean (got yes)']);
    expect(bad({ opponentAwareness: 1 })).toEqual(['ai.opponentAwareness must be a boolean (got 1)']);
    expect(bad(true)).toEqual(['ai must be an object when present']);
    expect(bad([])).toEqual(['ai must be an object when present']);
    expect(bad(null)).toEqual(['ai must be an object when present']);
    expect(validateLevel({ ...valid(), ai: 3 as unknown as EnemyAiOptions })).toEqual(['ai must be an object when present']);
  });

  it('rejects frontBiasS unless every personality is a finite number of seconds in 0..120', () => {
    const bias = (frontBiasS: unknown): string[] => validateAi({ ...makeLevel(), ai: { frontBiasS } as EnemyAiOptions });
    expect(bias({ rusher: 20, opportunist: 10 })).toEqual(['ai.frontBiasS.turtle must be a number of seconds in 0..120 (got undefined)']);
    expect(bias({ rusher: 121, opportunist: 10, turtle: 5 })).toEqual(['ai.frontBiasS.rusher must be a number of seconds in 0..120 (got 121)']);
    expect(bias({ rusher: -1, opportunist: 10, turtle: 5 })).toEqual(['ai.frontBiasS.rusher must be a number of seconds in 0..120 (got -1)']);
    expect(bias({ rusher: Number.NaN, opportunist: Number.POSITIVE_INFINITY, turtle: '5' })).toEqual([
      'ai.frontBiasS.rusher must be a number of seconds in 0..120 (got NaN)',
      'ai.frontBiasS.turtle must be a number of seconds in 0..120 (got 5)',
      'ai.frontBiasS.opportunist must be a number of seconds in 0..120 (got Infinity)',
    ]);
    expect(bias(20)).toEqual(['ai.frontBiasS must be an object of seconds per personality']);
    expect(bias([20, 10, 5])).toEqual(['ai.frontBiasS must be an object of seconds per personality']);
  });

  it('rejects unknown keys in the block and in the bias record', () => {
    expect(validateAi({ ...makeLevel(), ai: { bias: 3 } as EnemyAiOptions })).toEqual(['ai.bias is not an enemy AI option (opponentAwareness, frontBiasS)']);
    expect(validateAi({ ...makeLevel(), ai: { frontBiasS: { rusher: 1, opportunist: 1, turtle: 1, player: 1 } } as EnemyAiOptions })).toEqual([
      'ai.frontBiasS.player is not a personality (rusher, turtle, opportunist)',
    ]);
    expect(validateLevel({ ...valid(), ai: { opponentAwareness: true, awareness: true } as EnemyAiOptions })).toEqual([
      'ai.awareness is not an enemy AI option (opponentAwareness, frontBiasS)',
    ]);
  });
});

describe('no shipped level sets ai (LV-13 hygiene — update on purpose, with a backlog line)', () => {
  it('every loaded level lacks the block', async () => {
    const levels = await loadAllLevels();
    expect(levels.length).toBe(50);
    expect(levels.filter((level) => 'ai' in level).map((level) => level.id)).toEqual([]);
  });

  it('no level JSON carries a top-level "ai" key', () => {
    const dir = new URL('../../src/levels/', import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    expect(files.length).toBe(50);
    const withAi = files.filter((f) => 'ai' in (JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as object));
    expect(withAi).toEqual([]);
  });

  it('the client passes the level block, and nothing else, to enemyCommands (ui/play.ts)', () => {
    const play = readFileSync(new URL('../../src/ui/play.ts', import.meta.url), 'utf8');
    expect(play).toContain('ai.enemyCommands(state, enemy, rng, undefined, this.level.ai)');
  });
});
