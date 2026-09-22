import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/create';
import type { GameState } from '../../src/sim/types';
import { scenarioLevel, scriptedTick } from './util';

function scenario(seed: number, ticks = 600): GameState {
  const state = createState(scenarioLevel(), seed);
  for (let tick = 0; tick < ticks; tick++) scriptedTick(state, tick);
  return state;
}

describe('determinism', () => {
  it('two runs with the same seed and command script produce deep-equal states', () => {
    const a = scenario(42);
    const b = scenario(42);
    expect(a).toEqual(b);
    expect(a.time).toBe(30_000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('120 s (2400 ticks) with mines, links of both owners, overdrive, freeze and an airstrike: byte-identical states', () => {
    const a = scenario(42, 2400);
    const b = scenario(42, 2400);
    expect(a.time).toBe(120_000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).toEqual(b);
    expect(JSON.stringify(scenario(43, 2400))).not.toBe(JSON.stringify(a)); // the seed is part of the state
    expect(a.mines.map((m) => m.charges)).toEqual([0, 0]);
    expect(a.links.length).toBeGreaterThan(0); // streams still running at 120 s
  });

  it('the scenario actually exercised the rules (lanes, obstacles, mines, streams, boosters)', () => {
    const s = scenario(42);
    expect(Object.keys(s.roads).sort()).toEqual(['a-e', 'a-p', 'a-t', 'e-t']); // p–e blocked by a, p–t by the wall
    expect(s.obstacles.length).toBe(1);
    expect(s.mines.map((m) => m.charges)).toEqual([0, 0]); // both mines spent by the streams
    expect(s.towers['p']!.level).toBe(1); // the `upgrade` and `sendUnits` commands are ignored; p streamed most of the match
    expect(s.towers['p']!.units).toBe(23); // 20 kept by the stream + 3 grown while unlinked (17.0 s → 20.0 s)
    expect(s.towers['a']!).toMatchObject({ owner: 'enemy1', level: 1 }); // enemy1's tank and fortress streams took the hub at 9.65 s
    expect(s.towers['t']!).toMatchObject({ owner: 'enemy1', units: 10 }); // airstruck to 0 at 18 s, two tanks regrown since
    expect(s.links).toEqual([
      { owner: 'enemy1', from: 'e', to: 'a', roadId: 'a-e', createdMs: 2000, emitAccMs: 0 }, // supply line into the captured hub
      { owner: 'player', from: 'p', to: 'a', roadId: 'a-p', createdMs: 20_000, emitAccMs: 0 }, // the [440] a → e link was refused: not the player's
    ]);
    expect(s.boosters).toEqual([]);
  });

  it('the airstrike on the linked tank factory ends its stream with sourceEmpty (event trace)', () => {
    const state = createState(scenarioLevel(), 42);
    const trace: string[] = [];
    for (let tick = 0; tick < 600; tick++) {
      scriptedTick(state, tick);
      for (const e of state.events) if (e.type === 'capture' || e.type === 'unlinked') trace.push(`${state.time}:${e.type}:${'towerId' in e ? e.towerId : `${e.from}>${e.to}:${e.reason}`}`);
    }
    expect(trace).toEqual(['9650:capture:a', '18050:unlinked:t>a:sourceEmpty']);
  });
});
