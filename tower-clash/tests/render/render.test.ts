import { describe, expect, it } from 'vitest';
import type { LevelDef, Road } from '../../src/sim/types';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE, shade } from '../../src/render/palette';
import { formatTime, isLight, wrapText } from '../../src/render/widgets';
import { drawGuideLines, roadPoseAt } from '../../src/render/draw';
import type { TerrainSpec } from '../../src/render/terrain';
import { getTerrain } from '../../src/render/terrain';
import type { View } from '../../src/render/view';
import { ParticleSystem, hostileAttackers } from '../../src/render/particles';
import { badgeY, drawBadge, towerTop } from '../../src/render/sprites';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { isUnderFire, step } from '../../src/sim/step';
import { C } from '../../src/sim/constants';

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

describe('roadPoseAt (rules v3: lanes are straight)', () => {
  const road: Road = {
    id: 'a-b',
    a: 'a',
    b: 'b',
    points: [
      { x: 0, y: 0 },
      { x: 300, y: 400 },
    ],
    length: 500,
    mineHits: [],
  };
  it('returns the point and the unit tangent of the lane', () => {
    expect(roadPoseAt(road, 0.5)).toEqual({ x: 150, y: 200, dx: 0.6, dy: 0.8 });
    expect(roadPoseAt(road, 0)).toEqual({ x: 0, y: 0, dx: 0.6, dy: 0.8 });
  });
  it('clamps outside 0..1', () => {
    expect(roadPoseAt(road, -1)).toMatchObject({ x: 0, y: 0 });
    expect(roadPoseAt(road, 2)).toMatchObject({ x: 300, y: 400 });
  });
});

/* Rules v3 §2.0b(8): guide lines from the selected tower to every tower it has a clear lane to. */
describe('drawGuideLines', () => {
  /** Recording context: every call is logged; properties are writable. */
  function recCtx(): { ctx: CanvasRenderingContext2D; calls: [string, unknown[]][]; props: Record<string | symbol, unknown> } {
    const calls: [string, unknown[]][] = [];
    const props: Record<string | symbol, unknown> = {};
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get(_t, key) {
        if (key in props) return props[key];
        return (...args: unknown[]) => {
          calls.push([String(key), args]);
          return undefined;
        };
      },
      set(_t, key, value) {
        props[key] = value;
        return true;
      },
    });
    return { ctx, calls, props };
  }
  /** p (player) sees e and n; a wall between p and x blocks that lane; p already streams into e. */
  const level: LevelDef = {
    id: 998,
    name: 'guide',
    lesson: 'guide',
    star3: 30_000,
    star2: 60_000,
    enemies: [{ owner: 'enemy1', personality: 'rusher', aggression: 0.5 }],
    towers: [
      { id: 'p', x: 200, y: 1000, owner: 'player', units: 10, level: 2 },
      { id: 'e', x: 200, y: 400, owner: 'enemy1', units: 10, level: 1 },
      { id: 'n', x: 520, y: 700, owner: 'neutral', units: 5 },
      { id: 'x', x: 520, y: 300, owner: 'neutral', units: 5 },
    ],
    obstacles: [{ kind: 'wall', points: [{ x: 410, y: 450 }, { x: 470, y: 500 }], width: 28 }],
  };

  it('draws one thin 30 % owner-coloured line per reachable, not-yet-linked tower and nothing for blocked ones', () => {
    const state = createState(level, 1);
    expect(state.roads['p-x']).toBeUndefined();
    expect(state.roads['e-p']).toBeDefined();
    applyCommand(state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    const { ctx, calls, props } = recCtx();
    drawGuideLines(ctx, DEFAULT_PALETTE, state, state.towers.p!);
    const lines = calls.filter(([k]) => k === 'lineTo');
    expect(lines).toHaveLength(1); // only n: e is already linked, x is blocked, p is itself
    const [lx, ly] = lines[0]![1] as [number, number];
    // ends short of n's footprint, on the p → n segment
    const n = state.towers.n!;
    expect(Math.hypot(lx - n.x, ly - n.y)).toBeGreaterThan(20);
    expect(Math.hypot(lx - n.x, ly - n.y)).toBeLessThan(80);
    expect(Math.abs((lx - 200) * (n.y - 1000) - (ly - 1000) * (n.x - 200))).toBeLessThan(1e-6);
    expect(props.globalAlpha).toBe(0.3);
    expect(props.lineWidth).toBe(2);
    expect(props.strokeStyle).toBe(DEFAULT_PALETTE.owners.player);
  });

  it('draws nothing for a foreign selection', () => {
    const state = createState(level, 1);
    const { ctx, calls } = recCtx();
    drawGuideLines(ctx, DEFAULT_PALETTE, state, state.towers.e!);
    expect(calls.filter(([k]) => k === 'lineTo')).toHaveLength(0);
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
    expect(ps.count).toBe(0);
    expect(ps.towerPulse('t', 100)).toBe(0);
  });
  it('caps the particle count', () => {
    const ps = new ParticleSystem(false);
    for (let i = 0; i < 100; i++) ps.capture(0, 0, '#fff');
    expect(ps.count).toBeLessThanOrEqual(700);
  });
});

/* Rules v2.1 "under fire" presentation: attacker lookup, landing → impact ring + badge jolt, static tint under reduced motion. */
describe('under fire', () => {
  /** p (player, 100 units, L3) and e (enemy1) 240 px apart; e streams into p. */
  function siege() {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 100, level: 3 },
          { id: 'e', x: 360, y: 760, owner: 'enemy1', units: 30, level: 1 },
        ],
      }),
      1,
    );
    applyCommand(state, { type: 'link', owner: 'enemy1', from: 'e', to: 'p' });
    return state;
  }

  it('hostileAttackers names the link owner, then units still on the road, never friends', () => {
    const state = siege();
    expect(hostileAttackers(state).get('p')).toBe('enemy1');
    expect(hostileAttackers(state).has('e')).toBe(false);
    while (state.units.length === 0) step(state);
    applyCommand(state, { type: 'unlink', owner: 'enemy1', from: 'e' });
    expect(state.links).toHaveLength(0);
    expect(hostileAttackers(state).get('p')).toBe('enemy1'); // the units already marching
    // a friendly reinforcement is not an attacker
    for (const u of state.units) u.owner = 'player';
    expect(hostileAttackers(state).has('p')).toBe(false);
  });

  it('a hostile landing spawns an impact ring and jolts the badge, then both settle', () => {
    const state = siege();
    const fx = new ParticleSystem(false);
    const ctx = fakeCtx();
    let now = 1000;
    const frame = () => {
      fx.landings(state, hostileAttackers(state), DEFAULT_PALETTE, now);
      fx.draw(ctx, now);
    };
    frame();
    expect(fx.count).toBe(0); // nothing has landed yet
    while (!isUnderFire(state, state.towers.p!)) {
      step(state);
      now += 50;
      frame();
    }
    expect(fx.count).toBeGreaterThan(0);
    expect(Math.abs(fx.badgeHit('p', now + 30))).toBeGreaterThan(0);
    expect(fx.badgeHit('p', now + 400)).toBe(0);
    expect(fx.badgeHit('e', now + 30)).toBe(0);
    // the same deadline seen again is not a second landing
    const n = fx.count;
    fx.landings(state, hostileAttackers(state), DEFAULT_PALETTE, now + 10);
    expect(fx.count).toBe(n);
    // an expired deadline (production resumes) does not spawn either
    state.time = state.towers.p!.underFireUntilMs + C.UNDER_FIRE_MS;
    state.towers.p!.underFireUntilMs = 0;
    fx.landings(state, hostileAttackers(state), DEFAULT_PALETTE, now + 20);
    for (let t = now + 36; t < now + 1500; t += 16) fx.draw(ctx, t);
    expect(fx.count).toBe(0);
  });

  it('spawns nothing and never jolts under prefers-reduced-motion; the badge still draws the static tint', () => {
    const state = siege();
    const fx = new ParticleSystem(true);
    while (!isUnderFire(state, state.towers.p!)) step(state);
    fx.landings(state, hostileAttackers(state), DEFAULT_PALETTE, 5000);
    expect(fx.count).toBe(0);
    expect(fx.badgeHit('p', 5010)).toBe(0);
    const ctx = fakeCtx();
    for (const pal of [DEFAULT_PALETTE, COLOR_BLIND_PALETTE]) {
      expect(pal.badgeAlert).toMatch(/^#[0-9a-f]{6}$/);
      expect(() => drawBadge(ctx, pal, 100, 100, '100', true, { underFire: pal.owners.enemy1, shake: 0 })).not.toThrow();
    }
  });
});

/* Rules v3 §2.0b(9): obstacles and mines live in the cached ground; a spent mine re-keys the cache. */
describe('terrain obstacles and mines', () => {
  /** Counting context: gradients and measureText are stubbed, every other method call is tallied. */
  function countingCtx(): { ctx: CanvasRenderingContext2D; calls: Map<string, number> } {
    const calls = new Map<string, number>();
    const props: Record<string | symbol, unknown> = {};
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get(_t, key) {
        if (key in props) return props[key];
        if (key === 'measureText') return (s: string) => ({ width: s.length * 10 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
        return () => {
          const k = String(key);
          calls.set(k, (calls.get(k) ?? 0) + 1);
          return undefined;
        };
      },
      set(_t, key, value) {
        props[key] = value;
        return true;
      },
    });
    return { ctx, calls };
  }
  const view = { dpr: 1, scale: 0.5, offsetX: 0, offsetY: 0, cssW: 360, cssH: 640 } as View;
  const spec: TerrainSpec = {
    key: 'level:terrain-test',
    variant: '',
    seed: 5,
    biome: 'grass',
    towers: [{ x: 200, y: 1000 }],
    obstacles: [
      { kind: 'wall', points: [{ x: 100, y: 300 }, { x: 400, y: 320 }, { x: 420, y: 500 }], width: 28 },
      { kind: 'water', points: [{ x: 40, y: 700 }, { x: 360, y: 760 }, { x: 700, y: 700 }], width: 40 },
      { kind: 'rock', points: [{ x: 560, y: 1000 }], width: 80 },
      { kind: 'rock', points: [{ x: 100, y: 1150 }, { x: 300, y: 1160 }], width: 40 },
    ],
    mines: [{ x: 360, y: 640, charges: 3 }],
  };

  it('renders every obstacle kind plus a live mine, caches the canvas, and re-renders once a mine is spent', () => {
    const made: Map<string, number>[] = [];
    const doc = {
      createElement: () => {
        const r = countingCtx();
        made.push(r.calls);
        return { width: 0, height: 0, getContext: () => r.ctx };
      },
    };
    (globalThis as { document?: unknown }).document = doc;
    try {
      const a = getTerrain(view, DEFAULT_PALETTE, spec);
      expect(made).toHaveLength(1);
      const first = made[0]!;
      expect(first.get('stroke')).toBeGreaterThan(30); // wall bands + merlon edges + river bands + ripple
      expect(first.get('strokeRect')).toBeGreaterThan(10); // battlement merlons along the wall
      expect(first.get('setLineDash')).toBe(2); // the live mine's dashed stripe ring (on / off)
      expect(getTerrain(view, DEFAULT_PALETTE, spec)).toBe(a); // same spec → cache hit
      const spent: TerrainSpec = { ...spec, variant: '0,', mines: [{ x: 360, y: 640, charges: 0 }] };
      const b = getTerrain(view, DEFAULT_PALETTE, spent);
      expect(b).not.toBe(a);
      expect(made).toHaveLength(2);
      expect(made[1]!.get('setLineDash') ?? 0).toBe(0); // a crater has no stripe ring
      expect(made[1]!.get('strokeRect')).toBe(first.get('strokeRect')); // the wall is unchanged
    } finally {
      delete (globalThis as { document?: unknown }).document;
    }
  });
});
