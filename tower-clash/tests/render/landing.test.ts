import { beforeAll, describe, expect, it } from 'vitest';
import type { Particle } from '../../src/render/particles';
import { ParticleSystem, hostileAttackers, loadEconomyBursts } from '../../src/render/particles';
import { FRIEND_RING_PX, LAND_RING_PX, TANK_PULSE_MS, TANK_PULSE_SCALE, TANK_RING_PX, landingPulses, landingRingPx } from '../../src/render/particlesEconomy';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import { createState } from '../../src/sim/create';
import type { SimEvent } from '../../src/sim/types';
import { makeLevel } from '../helpers';

/*
 * AUD-F10: a tank landing used to burst exactly like one soldier (the 18 px ring). The ring now scales with
 * the landing unit's weight — 18 → 26 px hostile, 9 → 13 px friendly — and a tank sends one extra, slower
 * ring pulse out behind it (src/render/particlesEconomy.ts `tank`, the lazy chunk; until it is in a tank
 * bursts like a soldier). One burst per tank: the soldier-sized ring of the same landing stays out.
 */

const pal = DEFAULT_PALETTE;

beforeAll(async () => {
  await loadEconomyBursts();
});

function level() {
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 20 },
        { id: 'n', x: 360, y: 700, owner: 'neutral', units: 10 },
        { id: 'e', x: 360, y: 300, owner: 'enemy1', units: 10 },
      ],
    }),
    1,
  );
}

/** A particle system that records what it spawns. */
function recorder(reduced = false): { fx: ParticleSystem; spawned: Particle[] } {
  const fx = new ParticleSystem(reduced);
  const spawned: Particle[] = [];
  const push = fx.push.bind(fx);
  fx.push = (p) => {
    spawned.push(p);
    push(p);
  };
  return { fx, spawned };
}

const landed = (towerId: string, owner: 'player' | 'enemy1', weight: number, hostile: boolean): SimEvent => ({ type: 'landed', towerId, owner, weight, hostile });
const rings = (ps: Particle[]) => ps.filter((p) => p.kind === 'impact').map((p) => ({ size: p.size, life: p.life }));

describe('landingRingPx / landingPulses', () => {
  it('18 px for a soldier, 26 px for a tank (weight 5), linear between, capped; friendly 9 → 13 px', () => {
    expect([LAND_RING_PX, TANK_RING_PX, FRIEND_RING_PX]).toEqual([18, 26, 9]);
    expect(landingRingPx(1)).toBe(18);
    expect(landingRingPx(5)).toBe(26);
    expect(landingRingPx(3)).toBeCloseTo(22, 9);
    expect(landingRingPx(12)).toBe(26);
    expect(landingRingPx(0)).toBe(18);
    expect(landingRingPx(1, FRIEND_RING_PX)).toBe(9);
    expect(landingRingPx(5, FRIEND_RING_PX)).toBeCloseTo(13, 9);
  });

  it('a tank sends one extra ring pulse, a soldier none', () => {
    expect([landingPulses(1), landingPulses(4), landingPulses(5), landingPulses(9)]).toEqual([1, 1, 2, 2]);
  });
});

describe('a landing\'s burst by weight', () => {
  it('hostile on a neutral: a soldier gets the 18 px ring + flash + 4 sparks; a tank 26 px + a trailing pulse + a bigger flash + 6 sparks', () => {
    const state = level();
    const soldier = recorder();
    soldier.fx.onEvents([landed('n', 'player', 1, true)], state, pal, 1000);
    expect(rings(soldier.spawned)).toEqual([{ size: 18, life: 380 }]);
    expect(soldier.spawned).toHaveLength(6);

    const tank = recorder();
    tank.fx.onEvents([landed('n', 'player', 5, true)], state, pal, 1000);
    expect(rings(tank.spawned)).toEqual([
      { size: 26, life: 380 },
      { size: 26 * TANK_PULSE_SCALE, life: TANK_PULSE_MS },
    ]);
    expect(tank.spawned.filter((p) => p.kind === 'impact')[0]!.color).toBe(pal.owners.player); // the attacker's colour
    expect(tank.spawned.filter((p) => p.kind === 'spark')).toHaveLength(6);
    expect(tank.spawned.find((p) => p.kind === 'flash')!.size).toBeGreaterThan(soldier.spawned.find((p) => p.kind === 'flash')!.size);
    expect(tank.spawned).toHaveLength(9);
  });

  it('the trailing pulse stays inside the first ring all its life (it reads as a second ring, not a bigger one)', () => {
    // impact ring radius = size + 30 × age / life (particles.ts)
    for (let age = 0; age < 380; age += 20) expect(26 * TANK_PULSE_SCALE + (30 * age) / TANK_PULSE_MS).toBeLessThan(26 + (30 * age) / 380);
  });

  it('hostile on an owned tower: one 26 px burst — the "under fire" watcher still jolts the badge but adds no 18 px ring', () => {
    const state = level();
    const { fx, spawned } = recorder();
    state.towers['e']!.underFireUntilMs = state.time + 500; // the sim marks the landing
    fx.onEvents([landed('e', 'player', 5, true)], state, pal, 1000);
    fx.landings(state, hostileAttackers(state), pal, 1000);
    expect(rings(spawned).map((r) => r.size)).toEqual([26, 26 * TANK_PULSE_SCALE]);
    expect(fx.badgeHit('e', 1050)).not.toBe(0);
    // a soldier's landing on the same tower right after (outside the 90 ms ring interval) is its usual 18 px
    state.towers['e']!.underFireUntilMs = state.time + 600;
    fx.landings(state, hostileAttackers(state), pal, 1200);
    expect(rings(spawned).at(-1)!.size).toBe(18);
  });

  it('one burst per tank: a soldier\'s ring 30 ms before does not swallow the tank\'s', () => {
    const state = level();
    const { fx, spawned } = recorder();
    fx.onEvents([landed('n', 'player', 1, true)], state, pal, 1000);
    fx.onEvents([landed('n', 'player', 5, true)], state, pal, 1030);
    expect(rings(spawned).map((r) => r.size)).toEqual([18, 26, 26 * TANK_PULSE_SCALE]);
  });

  it('friendly (a reinforcement): the faint ring at 13 px instead of 9, the trailing pulse and 5 sparks', () => {
    const state = level();
    const soldier = recorder();
    soldier.fx.onEvents([landed('p', 'player', 1, false)], state, pal, 1000);
    expect(rings(soldier.spawned)).toEqual([{ size: 9, life: 240 }]);
    const tank = recorder();
    tank.fx.onEvents([landed('p', 'player', 5, false)], state, pal, 1000);
    expect(rings(tank.spawned).map((r) => r.size)).toEqual([landingRingPx(5, FRIEND_RING_PX), landingRingPx(5, FRIEND_RING_PX) * TANK_PULSE_SCALE]);
    expect(tank.spawned.filter((p) => p.kind === 'spark')).toHaveLength(5);
    expect(tank.spawned.every((p) => p.kind !== 'impact' || p.color === pal.ownerTones.player.lit)).toBe(true);
  });

  it('reduced motion: nothing spawns for a tank either', () => {
    const state = level();
    const { fx, spawned } = recorder(true);
    fx.onEvents([landed('n', 'player', 5, true), landed('p', 'player', 5, false)], state, pal, 1000);
    expect(spawned).toEqual([]);
  });
});
