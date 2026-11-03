import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { GameState, SimEvent, Unit } from '../../src/sim/types';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { unitPosition } from '../../src/sim/step';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import { playCamera, proj } from '../../src/render/camera';
import { ParticleSystem, loadEconomyBursts } from '../../src/render/particles';
import type { Particle } from '../../src/render/particles';
import { AIM_MS, LATE_RAD, RECOIL_MS, RECOIL_NUDGE_PX, RECOIL_PX, TRACER_MS, TRACER_PX, aimAngle, drawTracer, nextTarget } from '../../src/render/combatFx';

/*
 * AUD-F11: an artillery shot has anticipation and weight (render only; the sim still kills on the firing
 * tick). The barrel turns onto the unit the gun will shoot once its cooldown is within AIM_MS; the shot is a
 * muzzle flash, a TRACER_MS owner-lit tracer with an ink edge, an impact ring + flash + 4 sparks at the victim
 * (no grey puff) and a RECOIL_MS recoil; an unanticipated shot turns first and fires AIM_MS later. Reduced
 * motion: a static aim and a one-frame flash at the muzzle and the victim. All of it is the lazy chunk's.
 */

interface Call {
  fn: string;
  args: unknown[];
  fill: unknown;
  stroke: unknown;
  alpha: unknown;
  width: unknown;
}

function recCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const store: Record<string | symbol, unknown> = { globalAlpha: 1 };
  const calls: Call[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'getTransform') return () => undefined;
      if (key in store) return store[key];
      return (...args: unknown[]) => void calls.push({ fn: String(key), args, fill: store.fillStyle, stroke: store.strokeStyle, alpha: store.globalAlpha, width: store.lineWidth });
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
  return { ctx, calls };
}

const NO_LAYOUT = { chips: [], badges: new Map(), bodies: new Map() };
const marks = (fx: ParticleSystem, s: GameState, nowMs: number, ctx = recCtx().ctx): void => fx.drawMarks(ctx, DEFAULT_PALETTE, s, NO_LAYOUT, nowMs, playCamera());

/** p (player) below g (an enemy1 artillery post, 300 px up the lane); `progress` puts a player soldier on the lane. */
function board(progress?: number, cooldownMs = 0): GameState {
  const s = createState(
    makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'g', x: 360, y: 700, owner: 'enemy1', units: 10, level: 1, kind: 'artillery' },
      ],
    }),
    1,
  );
  s.towers.g!.artilleryCooldownMs = cooldownMs;
  if (progress !== undefined) {
    const roadId = Object.keys(s.roads)[0]!;
    // `progress` runs along the unit's way, p → g
    const u: Unit = { id: 1, owner: 'player', kind: 'infantry', weight: 1, roadId, from: 'p', to: 'g', progress, speed: 120 };
    s.units.push(u);
  }
  return s;
}

function kill(s: GameState): Extract<SimEvent, { type: 'unitDied' }> {
  const p = unitPosition(s, s.units[0]!);
  return { type: 'unitDied', x: p.x, y: p.y, owner: 'player', cause: 'artillery', roadId: s.units[0]!.roadId };
}

beforeAll(async () => {
  await loadEconomyBursts();
});

describe('anticipation: the barrel turns onto the next target before the shot', () => {
  it('the sim rule widened by AIM_MS of walking: in range or about to be', () => {
    const near = board(0.6); // 120 px off the gun: in range (140)
    expect(nextTarget(near, near.towers.g!)).not.toBeNull();
    const coming = board(0.5); // 150 px: within 140 + 120 px/s × 120 ms
    expect(nextTarget(coming, coming.towers.g!)).not.toBeNull();
    const far = board(0.2);
    expect(nextTarget(far, far.towers.g!)).toBeNull();
  });

  it('eases over AIM_MS (ease-out) once the cooldown is within AIM_MS; not before', () => {
    const s = board(0.6, AIM_MS);
    const u = unitPosition(s, s.units[0]!);
    const target = aimAngle(s.towers.g!, u.x, u.y);
    const fx = new ParticleSystem(false);
    marks(fx, s, 1000);
    const start = fx.aimOf('g')!;
    expect(start).toBeCloseTo(-0.6, 9); // from the sprite's resting aim
    marks(fx, s, 1000 + AIM_MS / 2);
    const mid = fx.aimOf('g')!;
    // ease-out: past half way at half time, not there yet
    expect(Math.abs(mid - target)).toBeLessThan(Math.abs(start - target) / 2);
    expect(Math.abs(mid - target)).toBeGreaterThan(0.01);
    marks(fx, s, 1000 + AIM_MS);
    expect(fx.aimOf('g')).toBeCloseTo(target, 9);

    const idle = board(0.6, AIM_MS + 50);
    const fx2 = new ParticleSystem(false);
    marks(fx2, idle, 1000);
    expect(fx2.aimOf('g')).toBeUndefined();
  });
});

describe('the shot', () => {
  it('an anticipated shot fires at once: tracer, impact ring, flash and 4 sparks at the victim (8 particles, no grey puff), recoil RECOIL_PX', () => {
    const s = board(0.6, AIM_MS);
    const fx = new ParticleSystem(false);
    marks(fx, s, 1000);
    marks(fx, s, 1000 + AIM_MS);
    const make = vi.spyOn(fx, 'make');
    const ev = kill(s);
    fx.onEvents([ev], s, DEFAULT_PALETTE, 1000 + AIM_MS + 10);
    const kinds = make.mock.calls.map((c) => c[0]);
    expect(kinds.sort()).toEqual(['flash', 'flash', 'impact', 'spark', 'spark', 'spark', 'spark', 'tracer']);
    expect(fx.count).toBe(8);
    const tracer = make.mock.results[make.mock.calls.findIndex((c) => c[0] === 'tracer')]!.value as Particle;
    expect(tracer.life).toBe(TRACER_MS);
    expect(tracer.color).toBe(DEFAULT_PALETTE.ownerTones.enemy1.lit);
    expect(tracer.color2).toBe(DEFAULT_PALETTE.ink);
    expect(tracer.size).toBeCloseTo(TRACER_PX * proj(playCamera(), 360, 700).s, 9);
    const impact = make.mock.calls.find((c) => c[0] === 'impact')!;
    expect(impact.slice(1, 4)).toEqual([ev.x, ev.y, DEFAULT_PALETTE.owners.enemy1]);
    // recoil: full at the shot, settling over RECOIL_MS; the tower nudge at most RECOIL_NUDGE_PX; never a world shake
    const at = 1000 + AIM_MS + 10;
    expect(fx.recoil.get('g')!.r).toBeCloseTo(RECOIL_PX, 9);
    marks(fx, s, at + RECOIL_MS / 2);
    const half = fx.recoil.get('g')!;
    expect(half.r).toBeCloseTo(RECOIL_PX / 2, 9);
    expect(Math.hypot(half.dx, half.dy)).toBeLessThanOrEqual(RECOIL_NUDGE_PX);
    marks(fx, s, at + RECOIL_MS);
    expect(fx.recoil.has('g')).toBe(false);
    for (let t = at; t < at + 400; t += 10) expect(fx.shake(t)).toEqual({ dx: 0, dy: 0 });
  });

  it('an unanticipated shot (barrel more than LATE_RAD off) turns first and fires AIM_MS later', () => {
    const s = board(0.6, 800); // the cooldown never came near: nothing tracked
    const fx = new ParticleSystem(false);
    const make = vi.spyOn(fx, 'make');
    fx.onEvents([kill(s)], s, DEFAULT_PALETTE, 1000);
    expect(make).not.toHaveBeenCalled();
    expect(fx.recoil.has('g')).toBe(false);
    marks(fx, s, 1000 + AIM_MS - 1);
    expect(make).not.toHaveBeenCalled();
    marks(fx, s, 1000 + AIM_MS);
    expect(make.mock.calls.filter((c) => c[0] === 'tracer')).toHaveLength(1);
    expect(fx.recoil.get('g')!.r).toBeCloseTo(RECOIL_PX, 9);
    expect(LATE_RAD).toBeGreaterThan(0.3);
  });

  it('stays inside the particle cap under a barrage', () => {
    const s = board(0.6, 0);
    const fx = new ParticleSystem(false);
    marks(fx, s, 0);
    for (let i = 0; i < 200; i++) {
      fx.onEvents([kill(s)], s, DEFAULT_PALETTE, AIM_MS + i);
      marks(fx, s, AIM_MS + i);
    }
    expect(fx.count).toBeLessThanOrEqual(700);
  });

  it('the tracer: its head reaches the victim at 40 %, the trail follows it in, gone at the end', () => {
    const p = { x: 0, y: 0, x2: 100, y2: 0, size: 4, color: '#f00', color2: '#000' };
    const at = (t: number) => {
      const { ctx, calls } = recCtx();
      drawTracer(ctx, p, t);
      return calls;
    };
    const early = at(0.2);
    const ends = early.filter((c) => c.fn === 'lineTo').map((c) => c.args[0] as number);
    expect(Math.max(...ends)).toBeCloseTo(50, 9); // head half way at 20 %
    expect(early.filter((c) => c.fn === 'stroke').map((c) => [c.stroke, c.width])).toContainEqual(['#000', 4 * 1.8]);
    const late = at(0.6);
    expect(Math.min(...late.filter((c) => c.fn === 'moveTo').map((c) => c.args[0] as number))).toBeCloseTo(50, 9); // tail half way at 60 %
    expect(at(1).filter((c) => c.fn === 'stroke')).toHaveLength(0);
  });
});

describe('reduced motion', () => {
  it('a static aim, no particles, no recoil; the muzzle and the victim flash for exactly one frame', () => {
    const s = board(0.6, AIM_MS);
    const fx = new ParticleSystem(true);
    marks(fx, s, 1000);
    expect(fx.aimOf('g')).toBeUndefined(); // no anticipation turn
    const ev = kill(s);
    fx.onEvents([ev], s, DEFAULT_PALETTE, 1000);
    expect(fx.count).toBe(0);
    expect(fx.aimOf('g')).toBeCloseTo(aimAngle(s.towers.g!, ev.x, ev.y), 9);
    const first = recCtx();
    marks(fx, s, 1016, first.ctx);
    const arcs = first.calls.filter((c) => c.fn === 'arc');
    expect(arcs).toHaveLength(2);
    expect(first.calls.filter((c) => c.fn === 'fill').every((c) => c.alpha === 1)).toBe(true);
    expect(fx.recoil.has('g')).toBe(false);
    const second = recCtx();
    marks(fx, s, 1032, second.ctx);
    expect(second.calls.filter((c) => c.fn === 'arc')).toHaveLength(0);
  });
});
