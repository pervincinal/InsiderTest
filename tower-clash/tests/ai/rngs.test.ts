import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { Rng, createState } from '../../src/sim/index';
import type { EnemyDef } from '../../src/sim/index';
import { ENEMY_RNG_STRIDE, PLAYER_RNG_SALT, rngsFor, runAiTick } from '../../src/ai/index';

const enemies: EnemyDef[] = [
  { owner: 'enemy1', personality: 'rusher', aggression: 0.5 },
  { owner: 'enemy2', personality: 'opportunist', aggression: 0.5 },
];

describe('rngsFor', () => {
  it('derives the player and per-enemy streams exactly as the game client does', () => {
    const seed = 123456789;
    const rngs = rngsFor(seed, enemies);
    expect(rngs.player.state).toBe((seed ^ 0x9e3779b9) >>> 0);
    expect(rngs.enemies.get('enemy1')!.state).toBe((seed + 1013904223 * 1) >>> 0);
    expect(rngs.enemies.get('enemy2')!.state).toBe((seed + 1013904223 * 2) >>> 0);
    expect(rngs.enemies.size).toBe(2);
    expect(PLAYER_RNG_SALT).toBe(0x9e3779b9);
    expect(ENEMY_RNG_STRIDE).toBe(1013904223);
  });

  it('gives every enemy its own stream, unsigned 32-bit even for large seeds', () => {
    const rngs = rngsFor(0xffffffff, enemies);
    for (const rng of [rngs.player, ...rngs.enemies.values()]) {
      expect(rng.state).toBeGreaterThanOrEqual(0);
      expect(rng.state).toBeLessThanOrEqual(0xffffffff);
    }
    expect(rngs.enemies.get('enemy1')!.state).not.toBe(rngs.enemies.get('enemy2')!.state);
  });

  it('runAiTick with a stream map matches running each enemy on its own stream, and skips unmapped owners', () => {
    const level = makeLevel({
      enemies,
      towers: [
        { id: 'p', x: 360, y: 1100, owner: 'player', units: 3 },
        { id: 'e1', x: 150, y: 400, owner: 'enemy1', units: 20 },
        { id: 'e2', x: 570, y: 400, owner: 'enemy2', units: 20 },
      ],
    });
    const a = runAiTick(createState(level, 7), rngsFor(7, enemies).enemies);
    const b = runAiTick(createState(level, 7), rngsFor(7, enemies).enemies);
    expect(a).toEqual(b);
    expect(new Set(a.map((c) => c.owner))).toEqual(new Set(['enemy1', 'enemy2']));
    const onlyFirst = new Map([['enemy1' as const, new Rng(1)]]);
    for (const cmd of runAiTick(createState(level, 7), onlyFirst)) expect(cmd.owner).toBe('enemy1');
  });
});
