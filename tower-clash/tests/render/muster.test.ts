import { beforeAll, describe, expect, it, vi } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { step } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import type { GameState, TowerDef } from '../../src/sim/types';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import type { Camera } from '../../src/render/camera';
import { FLAT } from '../../src/render/camera';
import { fitCamera } from '../../src/render/fit';
import { ParticleSystem, loadEconomyBursts } from '../../src/render/particles';
import type { MarksLayout } from '../../src/render/particles';
import { towerBodyRect } from '../../src/render/worldChips';
import { MUSTER_DOT_ALPHA, musterBox } from '../../src/render/particlesEconomy';

// AUD-U17's owner emblems ride the same marks pass (src/render/ownerEmblem.ts, tests/render/ownerEmblem.test.ts);
// this file pins the other marks' draw calls, so the emblems are left out here
vi.mock('../../src/render/ownerEmblem', () => ({ drawOwnerEmblems: () => undefined }));

/*
 * AUD-F5b (GDD §2.3 "AUD-F5 2026-10-31"): the sim's first soldier of a new stream leaves one interval after
 * the tap; the renderer covers the wait with a muster at the source's gate — a ground ring closing and a
 * soldier forming with `emitAccMs / streamIntervalMs(from)`, standing until that first soldier is out of the
 * gate, then gone for good. Never drawn for a link that has not come through its first tick (one that dies
 * on it is never seen). Reduced motion: a static dot. Lazy particlesEconomy chunk, `ParticleSystem.drawMarks`.
 */

interface Call {
  fn: string;
  args: unknown[];
  stroke: unknown;
  fill: unknown;
  alpha: number;
}

function recCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const store: Record<string | symbol, unknown> = { globalAlpha: 1 };
  const calls: Call[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key in store) return store[key];
      return (...args: unknown[]) => void calls.push({ fn: String(key), args, stroke: store.strokeStyle, fill: store.fillStyle, alpha: store.globalAlpha as number });
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
  return { ctx, calls };
}

const P = DEFAULT_PALETTE;
const tones = P.ownerTones.player;

/** Player `p` (360, 1000) below enemy `e` (360, 400): one straight lane up. */
function board(p: Partial<TowerDef> = {}, extra: TowerDef[] = []): GameState {
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1, ...p },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
        ...extra,
      ],
    }),
    1,
  );
}

function layoutOf(state: GameState): MarksLayout {
  const bodies = new Map(Object.values(state.towers).map((t) => [t.id, towerBodyRect(t.kind, t.level, { x: t.x, y: t.y, s: 1 })]));
  return { badges: new Map(), chips: [], bodies };
}

function frame(fx: ParticleSystem, state: GameState): Call[] {
  const { ctx, calls } = recCtx();
  fx.drawMarks(ctx, P, state, layoutOf(state), 1000, FLAT);
  return calls;
}

const link = (state: GameState, to = 'e'): void => applyCommand(state, { type: 'link', owner: 'player', from: 'p', to });
const ticks = (state: GameState, n: number): void => {
  for (let i = 0; i < n; i++) step(state, C.TICK_MS);
};
/** The muster's ground ring tracks (one per muster) and its progress arc's sweep (k × 2π). */
const tracks = (calls: Call[]) => calls.filter((c) => c.fn === 'ellipse' && c.args[5] === 0 && c.args[6] === Math.PI * 2);
const sweep = (calls: Call[]): number | null => {
  const arc = calls.find((c) => c.fn === 'ellipse' && c.args[5] === -Math.PI / 2);
  return arc ? ((arc.args[6] as number) - (arc.args[5] as number)) / (Math.PI * 2) : null;
};
const fills = (calls: Call[]) => calls.filter((c) => c.fn === 'fill');

/** The gate: on the plinth rim (rx 44.2 = 34 × 1.3, ry 0.42 × that) toward `e`, i.e. straight up from the plinth centre (y + 2.6). */
const GATE = { x: 360, y: 1000 + 2 * 1.3 - 0.42 * 34 * 1.3 };

describe('before the lazy chunk is in', () => {
  it('a new link draws nothing (and nothing throws)', () => {
    const state = board();
    link(state);
    ticks(state, 2);
    expect(frame(new ParticleSystem(false), state)).toHaveLength(0);
  });
});

describe('muster (motion)', () => {
  beforeAll(async () => {
    await loadEconomyBursts();
  });

  it('appears on the first frame after the link’s first tick, at the gate, and grows with emitAccMs', () => {
    const state = board();
    const fx = new ParticleSystem(false);
    link(state);
    expect(state.links).toHaveLength(1);
    expect(tracks(frame(fx, state))).toHaveLength(0); // not through its first tick yet
    ticks(state, 1); // the `linked` frame: 50 ms of 1 000
    let calls = frame(fx, state);
    expect(tracks(calls)).toHaveLength(1);
    expect(tracks(calls)[0]!.args[0]).toBeCloseTo(GATE.x, 6);
    expect(tracks(calls)[0]!.args[1]).toBeCloseTo(GATE.y, 6);
    expect(sweep(calls)).toBeCloseTo(0.05, 9);
    ticks(state, 9); // 500 ms into an L1 link
    calls = frame(fx, state);
    expect(sweep(calls)).toBeCloseTo(0.5, 9);
    const f = fills(calls);
    expect(f).toHaveLength(2); // body + head, ≤ 2 fills
    expect(f.map((c) => c.alpha)).toEqual([0.5, 0.5]);
    expect(f.map((c) => c.fill)).toEqual([tones.mid, tones.lit]);
    // the head: sprites.ts HEAD_R × SOLDIER_DRAW_SCALE × growth
    const head = calls.filter((c) => c.fn === 'arc').at(-1)!;
    expect(head.args[2]).toBeCloseTo(4.2 * 1.75 * 0.5, 9);
  });

  it('Overdrive grows it ×3, an enemy Freeze holds it', () => {
    const od = board();
    const fx = new ParticleSystem(false);
    link(od);
    applyCommand(od, { type: 'booster', owner: 'player', booster: 'overdrive' });
    ticks(od, 5);
    expect(sweep(frame(fx, od))).toBeCloseTo(0.75, 9);
    const fr = board();
    link(fr);
    ticks(fr, 4);
    applyCommand(fr, { type: 'booster', owner: 'enemy1', booster: 'freeze' });
    ticks(fr, 6);
    expect(sweep(frame(fx, fr))).toBeCloseTo(0.2, 9);
  });

  it('stands at full from the first emission until that soldier is out of the gate, then is gone for good', () => {
    const state = board();
    const fx = new ParticleSystem(false);
    link(state);
    for (let i = 0; i < 19; i++) {
      ticks(state, 1);
      frame(fx, state);
    }
    expect(state.units).toHaveLength(0);
    ticks(state, 1); // 1 000 ms: the first soldier spawns at the tower's centre (inside the building)
    expect(state.units).toHaveLength(1);
    let calls = frame(fx, state);
    expect(sweep(calls)).toBe(1);
    expect(fills(calls).map((c) => c.alpha)).toEqual([1, 1]);
    // the lane leaves straight up behind the tower: the soldier is hidden by the building (within the wall,
    // painted before it) until it clears the roof, and the muster stands exactly that long — never a frame with neither
    const roof = layoutOf(state).bodies.get('p')!.y;
    const unitY = (): number => 1000 - state.units[0]!.progress * state.roads['e-p']!.length;
    let frames = 0;
    for (;;) {
      ticks(state, 1);
      const shown = tracks(frame(fx, state)).length > 0;
      if (!shown) break;
      expect(unitY()).toBeGreaterThanOrEqual(roof);
      frames++;
    }
    expect(unitY()).toBeLessThan(roof);
    expect(frames).toBe(Math.floor((1000 - roof - 6) / 6)); // 6 px a tick (120 px/s), one already walked on the spawn tick
    calls = frame(fx, state);
    expect(calls).toHaveLength(0);
    // later emissions never bring it back (one muster per link)
    for (let i = 0; i < 60; i++) {
      ticks(state, 1);
      expect(frame(fx, state)).toHaveLength(0);
    }
  });

  it('a lane leaving sideways behind the tower hands over once the soldier clears the wall (60 % of the plinth half-width)', () => {
    const state = board({}, [{ id: 'r', x: 700, y: 900, owner: 'neutral', units: 5, level: 1 }]);
    const fx = new ParticleSystem(false);
    link(state, 'r');
    const half = layoutOf(state).bodies.get('p')!.w / 2;
    const road = state.roads['p-r']!;
    const offX = (): number => (700 - 360) * state.units[0]!.progress;
    for (let i = 0; i < 20; i++) {
      ticks(state, 1);
      frame(fx, state);
    }
    expect(state.units).toHaveLength(1);
    let last = -1;
    while (tracks(frame(fx, state)).length) {
      last = offX();
      ticks(state, 1);
    }
    expect(last).toBeLessThanOrEqual(0.6 * half);
    expect(offX()).toBeGreaterThan(0.6 * half);
    expect(road.length).toBeGreaterThan(0);
  });

  it('first seen only after its first emission (a long ×20 frame): hands over at once, no second wait', () => {
    const state = board({}, [{ id: 'd', x: 360, y: 1250, owner: 'neutral', units: 5, level: 1 }]);
    const fx = new ParticleSystem(false);
    link(state, 'd');
    ticks(state, 21); // the soldier is out in front of the tower already
    expect(state.units).toHaveLength(1);
    expect(frame(fx, state)).toHaveLength(0);
    const up = board();
    link(up);
    ticks(up, 20); // just spawned, behind the tower: the muster stands at full until it shows
    const calls = frame(fx, up);
    expect(sweep(calls)).toBe(1);
  });

  it('a lane leaving in front of the tower hands over as soon as the soldier is painted after the tower', () => {
    const state = board({}, [{ id: 'd', x: 360, y: 1250, owner: 'neutral', units: 5, level: 1 }]);
    const fx = new ParticleSystem(false);
    link(state, 'd');
    for (let i = 0; i < 19; i++) {
      ticks(state, 1);
      expect(tracks(frame(fx, state))).toHaveLength(1);
    }
    // the spawn tick also walks it 6 px down the lane: past draw.ts's 4 px line, so it is painted over the
    // plinth on this very frame — and the muster is gone on it
    ticks(state, 1);
    expect(state.units).toHaveLength(1);
    expect(frame(fx, state)).toHaveLength(0);
  });

  it('never drawn for a link that dies on its first tick (targetFull into an own full tower)', () => {
    const state = board({}, [{ id: 'f', x: 700, y: 1000, owner: 'player', units: 100, level: 3 }]); // L3 at its holding cap
    const fx = new ParticleSystem(false);
    link(state, 'f');
    expect(state.links).toHaveLength(1);
    expect(frame(fx, state)).toHaveLength(0); // the command is in, the tick has not run
    ticks(state, 1);
    expect(state.links).toHaveLength(0);
    expect(frame(fx, state)).toHaveLength(0);
  });

  it('one muster per link: an L2 opening two streams shows two', () => {
    const state = board({ level: 2 }, [{ id: 'n', x: 700, y: 1000, owner: 'neutral', units: 5, level: 1 }]);
    const fx = new ParticleSystem(false);
    link(state);
    link(state, 'n');
    expect(state.links).toHaveLength(2);
    ticks(state, 2);
    const calls = frame(fx, state);
    expect(tracks(calls)).toHaveLength(2);
    expect(fills(calls)).toHaveLength(4);
    expect(fx.count).toBe(0); // 0 particles
  });

  it('a tank factory holding ≥ TANK_WEIGHT forms a tank (hull + turret)', () => {
    const state = board({ kind: 'tankFactory', units: 10 });
    const fx = new ParticleSystem(false);
    link(state);
    ticks(state, 1);
    const k = 50 / C.TANK_GEN_MS[1];
    const turret = frame(fx, state).filter((c) => c.fn === 'arc').at(-1)!;
    expect(turret.args[2]).toBeCloseTo(0.5 * 11 * 1.5 * k, 9);
  });
});

describe('muster (reduced motion)', () => {
  beforeAll(async () => {
    await loadEconomyBursts();
  });

  it('a static dot at MUSTER_DOT_ALPHA for the same span: no ring, no growth', () => {
    expect(MUSTER_DOT_ALPHA).toBe(0.6);
    const state = board();
    const fx = new ParticleSystem(true);
    link(state);
    ticks(state, 1);
    const first = frame(fx, state);
    expect(fills(first)).toHaveLength(1);
    expect(fills(first)[0]!.alpha).toBe(MUSTER_DOT_ALPHA);
    expect(tracks(first)).toHaveLength(0);
    // the same span as in motion: the two systems, frame by frame, end on the same frame
    const twin = board();
    const moving = new ParticleSystem(false);
    link(twin);
    ticks(twin, 1);
    frame(moving, twin);
    let n = 0;
    for (;;) {
      ticks(state, 1);
      ticks(twin, 1);
      const dot = frame(fx, state);
      const shown = tracks(frame(moving, twin)).length > 0;
      expect(dot.length > 0).toBe(shown);
      if (!shown) break;
      expect(dot.map((c) => [c.fn, c.args, c.alpha])).toEqual(first.map((c) => [c.fn, c.args, c.alpha])); // static
      n++;
    }
    expect(n).toBeGreaterThan(19); // through the emission at 1 000 ms and the walk out from behind the roof
    expect(fx.count).toBe(0);
  });
});

/*
 * PERF-13: the musters used to be drawn inside one even-odd clip of the whole canvas minus every badge pill,
 * built on every frame a stream was forming (≈ 0.8 ms a frame on the level-50 perf sample at DPR 2.75). Now
 * each muster is clipped only by the pills that reach its `musterBox`, inside that box (none: no clip) — the
 * same pixels, as long as the box holds every pixel the muster draws, which these pin.
 */
describe('PERF-13 muster clip', () => {
  beforeAll(async () => {
    await loadEconomyBursts();
  });

  /** The bounds of everything drawn (paths, grown by half the line width when stroked) and the gate (the ring's / dot's centre). */
  function extents(calls: Call[], lineWidths: number[]): { box: { x0: number; y0: number; x1: number; y1: number } | null } {
    let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
    let path: [number, number, number, number][] = [];
    const add = (x0: number, y0: number, x1: number, y1: number): void => void path.push([x0, y0, x1, y1]);
    let w = 0;
    for (const c of calls) {
      const a = c.args as number[];
      if (c.fn === 'beginPath') path = [];
      else if (c.fn === 'moveTo' || c.fn === 'lineTo') add(a[0]!, a[1]!, a[0]!, a[1]!);
      else if (c.fn === 'quadraticCurveTo') add(Math.min(a[0]!, a[2]!), Math.min(a[1]!, a[3]!), Math.max(a[0]!, a[2]!), Math.max(a[1]!, a[3]!));
      else if (c.fn === 'arc') add(a[0]! - a[2]!, a[1]! - a[2]!, a[0]! + a[2]!, a[1]! + a[2]!);
      else if (c.fn === 'ellipse') add(a[0]! - a[2]!, a[1]! - a[3]!, a[0]! + a[2]!, a[1]! + a[3]!);
      else if (c.fn === 'fill' || c.fn === 'stroke') {
        const g = c.fn === 'stroke' ? (lineWidths[w++] ?? 0) / 2 : 0;
        for (const [x0, y0, x1, y1] of path) {
          box = box ? { x0: Math.min(box.x0, x0 - g), y0: Math.min(box.y0, y0 - g), x1: Math.max(box.x1, x1 + g), y1: Math.max(box.y1, y1 + g) } : { x0: x0 - g, y0: y0 - g, x1: x1 + g, y1: y1 + g };
        }
      }
    }
    return { box };
  }

  /** A recording context that also logs the line width of every stroke. */
  function strokeCtx(): { ctx: CanvasRenderingContext2D; calls: Call[]; widths: number[] } {
    const { ctx: inner, calls } = recCtx();
    const widths: number[] = [];
    const ctx = new Proxy(inner, {
      get(t, key) {
        if (key === 'stroke') return () => void (widths.push(Reflect.get(t, 'lineWidth') as number), calls.push({ fn: 'stroke', args: [], stroke: null, fill: null, alpha: 1 }));
        return Reflect.get(t, key);
      },
      set(t, key, v) {
        return Reflect.set(t, key, v);
      },
    });
    return { ctx, calls, widths };
  }

  it('musterBox holds every pixel a muster draws (+1 px anti-aliasing): soldier, tank, reduced-motion dot, flat and at depth 1.35', () => {
    const z = 1.35;
    const cams: [string, Camera][] = [
      ['flat', FLAT],
      ['fit 1.35', fitCamera({ z, tx: (720 - 720 * z) / 2, ty: -200 })],
    ];
    let checked = 0;
    for (const [name, cam] of cams) {
      for (const [kind, reduced, p] of [
        ['soldier', false, {}],
        ['tank', false, { kind: 'tankFactory', units: 10 }],
        ['dot', true, {}],
      ] as const) {
        const state = board(p as Partial<TowerDef>);
        const fx = new ParticleSystem(reduced);
        link(state);
        const s = cam.proj(360, 1000).s;
        for (let i = 0; i < 40; i++) {
          ticks(state, 1);
          const bodies = new Map(Object.values(state.towers).map((t) => [t.id, towerBodyRect(t.kind, t.level, cam.proj(t.x, t.y))]));
          const { ctx, calls, widths } = strokeCtx();
          fx.drawMarks(ctx, P, state, { badges: new Map(), chips: [], bodies }, 1000, cam);
          if (!calls.length) break;
          const ring = calls.find((c) => c.fn === 'ellipse' || c.fn === 'arc')!;
          const gate = { x: ring.args[0] as number, y: (ring.args[1] as number) + (ring.fn === 'arc' ? 6 * s : 0) };
          const m = musterBox(gate.x, gate.y, s);
          const { box } = extents(calls, widths);
          expect(box, `${name} ${kind}`).not.toBeNull();
          expect(box!.x0 - 1, `${name} ${kind} left`).toBeGreaterThanOrEqual(m.x);
          expect(box!.y0 - 1, `${name} ${kind} top`).toBeGreaterThanOrEqual(m.y);
          expect(box!.x1 + 1, `${name} ${kind} right`).toBeLessThanOrEqual(m.x + m.w);
          expect(box!.y1 + 1, `${name} ${kind} bottom`).toBeLessThanOrEqual(m.y + m.h);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('no badge reaches the muster: no clip; a badge over it: one even-odd clip of the muster box minus that pill', () => {
    const state = board();
    const fx = new ParticleSystem(false);
    link(state);
    ticks(state, 4);
    const bodies = layoutOf(state).bodies;
    const m = musterBox(GATE.x, GATE.y, 1);
    const far = { x: 40, y: 200, w: 60, h: 36 };
    const near = { x: GATE.x - 30, y: m.y - 30, w: 60, h: 36 }; // its pill (3 px out) reaches the box's top edge
    const run = (rects: { x: number; y: number; w: number; h: number }[]): Call[] => {
      const { ctx, calls } = recCtx();
      fx.drawMarks(ctx, P, state, { badges: new Map(rects.map((rect, i) => [`b${i}`, { rect, bs: 1, side: 'above' }])) as never, chips: [], bodies }, 1000, FLAT);
      return calls;
    };
    const free = run([far]);
    expect(tracks(free)).toHaveLength(1);
    expect(free.filter((c) => c.fn === 'clip')).toHaveLength(0);
    const cut = run([far, near]);
    const clips = cut.filter((c) => c.fn === 'clip');
    expect(clips).toHaveLength(1);
    expect(clips[0]!.args).toEqual(['evenodd']);
    const i = cut.indexOf(clips[0]!);
    const begin = cut.slice(0, i).map((c) => c.fn).lastIndexOf('beginPath');
    const path = cut.slice(begin + 1, i);
    expect(path[0]).toMatchObject({ fn: 'rect', args: [m.x, m.y, m.w, m.h] });
    expect(path.filter((c) => c.fn === 'arcTo')).toHaveLength(4); // the one pill that reaches it, not the far one
    expect(path.find((c) => c.fn === 'moveTo')!.args).toEqual([near.x - 3 + (near.h + 6) / 2, near.y - 3]);
    expect(cut.filter((c) => c.fn === 'save').length).toBe(cut.filter((c) => c.fn === 'restore').length);
  });
});
