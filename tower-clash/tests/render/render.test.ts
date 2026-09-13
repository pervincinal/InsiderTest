import { describe, expect, it } from 'vitest';
import type { Road } from '../../src/sim/types';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE, shade } from '../../src/render/palette';
import { formatTime, isLight, wrapText } from '../../src/render/widgets';
import { roadPoseAt } from '../../src/render/draw';
import { ParticleSystem } from '../../src/render/particles';
import { badgeY, towerTop } from '../../src/render/sprites';

/** Canvas context stand-in: every method is a no-op, every property is writable. */
function fakeCtx(): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = {};
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (key in store) return store[key];
      return () => undefined;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

describe('palette', () => {
  it('shade lightens and darkens within #rrggbb', () => {
    expect(shade('#000000', 1)).toBe('#ffffff');
    expect(shade('#ffffff', -1)).toBe('#000000');
    expect(shade('#3b82f6', 0)).toBe('#3b82f6');
    expect(shade('#3b82f6', -0.5)).toBe('#1e417b');
  });
  it('owner colours are unique in both palettes and the terrain colours are shared', () => {
    for (const pal of [DEFAULT_PALETTE, COLOR_BLIND_PALETTE]) {
      const owners = Object.values(pal.owners);
      expect(new Set(owners).size).toBe(owners.length);
    }
    expect(COLOR_BLIND_PALETTE.grass).toBe(DEFAULT_PALETTE.grass);
    expect(COLOR_BLIND_PALETTE.owners.enemy1).not.toBe(DEFAULT_PALETTE.owners.enemy1);
  });
});

describe('widgets', () => {
  it('wrapText breaks on the measured width and caps the line count', () => {
    const ctx = fakeCtx();
    expect(wrapText(ctx, 'one two three four', 90)).toEqual(['one two', 'three', 'four']);
    expect(wrapText(ctx, 'one two three four five six', 90, 2)).toEqual(['one two', 'three…']);
    expect(wrapText(ctx, '', 90)).toEqual([]);
  });
  it('isLight picks dark text for light faces and white for owner colours', () => {
    expect(isLight('#ffffff')).toBe(true);
    expect(isLight(DEFAULT_PALETTE.owners.player)).toBe(false);
    expect(isLight(DEFAULT_PALETTE.owners.enemy1)).toBe(false);
  });
  it('formatTime pads minutes and seconds', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(61_500)).toBe('01:01');
  });
});

describe('roadPoseAt', () => {
  const road: Road = {
    id: 'a-b',
    a: 'a',
    b: 'b',
    kind: 'road',
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ],
    length: 200,
    mine: 0,
    barrier: 0,
    cut: false,
  };
  it('returns the point and the unit tangent of the segment', () => {
    expect(roadPoseAt(road, 0.25)).toEqual({ x: 50, y: 0, dx: 1, dy: 0 });
    expect(roadPoseAt(road, 0.75)).toEqual({ x: 100, y: 50, dx: 0, dy: 1 });
  });
  it('clamps outside 0..1', () => {
    expect(roadPoseAt(road, -1)).toMatchObject({ x: 0, y: 0 });
    expect(roadPoseAt(road, 2)).toMatchObject({ x: 100, y: 100 });
  });
});

describe('sprites layout', () => {
  it('keeps the badge above every building kind', () => {
    for (const kind of ['barracks', 'artillery', 'tankFactory', 'fortress'] as const) {
      expect(badgeY(kind)).toBeLessThan(-towerTop(kind));
    }
  });
});

describe('particles', () => {
  it('spawns bursts and drains them over time', () => {
    const ps = new ParticleSystem(false);
    ps.capture(100, 100, '#3b82f6');
    ps.death(10, 10);
    ps.shot(0, 0, 50, 50, '#ef4444');
    expect(ps.count).toBeGreaterThan(30);
    const ctx = fakeCtx();
    ps.draw(ctx, 1000);
    for (let t = 1016; t < 4000; t += 16) ps.draw(ctx, t);
    expect(ps.count).toBe(0);
  });
  it('spawns nothing under prefers-reduced-motion', () => {
    const ps = new ParticleSystem(true);
    ps.capture(100, 100, '#3b82f6');
    ps.death(10, 10);
    ps.upgrade('t', 0, 0, '#fff', 0);
    ps.bridgeCut([{ x: 0, y: 0 }, { x: 10, y: 0 }], '#000', '#111');
    expect(ps.count).toBe(0);
    expect(ps.towerPulse('t', 100)).toBe(0);
  });
  it('caps the particle count', () => {
    const ps = new ParticleSystem(false);
    for (let i = 0; i < 100; i++) ps.capture(0, 0, '#fff');
    expect(ps.count).toBeLessThanOrEqual(700);
  });
});
