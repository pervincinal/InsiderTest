import { describe, expect, it, vi } from 'vitest';
import type { TowerClashApp } from '../../src/main';
import { createState } from '../../src/sim/create';
import { hashState, newReplay, serializeReplay } from '../../src/sim/replay';
import { makeLevel } from '../helpers';

/*
 * REV-1 follow-up (2026-11-19): the debug hook `__towerclash.verifyReplay(json)` re-runs a record with a
 * 10-min sim budget, so a finite but huge `outcome.timeMs` on a stalemating level returns `'time'` at once
 * instead of spinning the browser.
 */

// a level nobody can end: no enemy AI and a player who never sends (the record has no commands)
const STALL = makeLevel({ id: 15, enemies: [] });
vi.mock('../../src/daily/replayLevel', () => ({ levelForReplay: () => Promise.resolve(STALL) }));

describe('debug verifyReplay budget (REV-1)', () => {
  it('a record with outcome.timeMs 1e12 stops at 600 s of sim: matches false, reason time', async () => {
    const { installDebug } = await import('../../src/debug');
    const dbg = installDebug({} as unknown as TowerClashApp);
    const state = createState(STALL, 1);
    const replay = newReplay(STALL, state);
    replay.outcome = { result: 'won', timeMs: 1e12, hash: hashState(state) };
    const t0 = Date.now();
    const v = await dbg.verifyReplay(serializeReplay(replay));
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(v).toMatchObject({ matches: false, reason: 'time', outcome: 'playing', timeMs: 600_000 });
    expect(Object.keys(v).sort()).toEqual(['expected', 'hash', 'matches', 'outcome', 'reason', 'rulesMatch', 'timeMs']);
  });
});
