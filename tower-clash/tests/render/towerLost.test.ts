import { beforeAll, describe, expect, it } from 'vitest';
import type { GameState, SimEvent } from '../../src/sim/types';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import { playCamera } from '../../src/render/camera';
import { ParticleSystem, loadEconomyBursts } from '../../src/render/particles';
import type { Rect } from '../../src/render/widgets';
import { HALO_RM_MS, LOST_MS, LOST_SHAKE_PX, attackerTower } from '../../src/render/combatFx';

/*
 * AUD-F15: losing one of your towers has its own damage-taken visual — a LOST_MS red-rimmed crack flash on
 * the tower and a LOST_SHAKE_PX world jolt along the line to the attacker (never cutting a stronger capture
 * shake). Reduced motion: the rim only, static, no shake. AUD-F13: reduced motion keeps the capture's badge
 * halo as an opacity-only fade over HALO_RM_MS (no particles, no squash / wipe).
 */

interface Call {
  fn: string;
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
      if (key in store) return store[key];
      return () => void calls.push({ fn: String(key), fill: store.fillStyle, stroke: store.strokeStyle, alpha: store.globalAlpha, width: store.lineWidth });
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
  return { ctx, calls };
}

/** p (player) at the bottom, e (enemy1) straight above it with a link e → p, f (enemy1) far right. */
function board(): GameState {
  const s = createState(
    makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
        { id: 'f', x: 700, y: 1000, owner: 'enemy1', units: 10, level: 1 },
      ],
    }),
    1,
  );
  const roadId = Object.keys(s.roads).find((id) => id.includes('e') && id.includes('p') && !id.includes('f')) ?? Object.keys(s.roads)[0]!;
  s.links.push({ owner: 'enemy1', from: 'e', to: 'p', roadId, createdMs: 0, emitAccMs: 0, relay: false } as GameState['links'][number]);
  return s;
}

const lose = (s: GameState): SimEvent[] => {
  s.towers.p!.owner = 'enemy1';
  return [{ type: 'capture', towerId: 'p', by: 'enemy1', from: 'player' }];
};
const BODY: Rect = { x: 322, y: 900, w: 76, h: 110 };
const BADGE: Rect = { x: 330, y: 840, w: 60, h: 30 };
const layout = () => ({ chips: [], badges: new Map([['p', { rect: BADGE, bs: 1, side: 'above' as const }]]), bodies: new Map([['p', BODY]]) });
function frame(fx: ParticleSystem, s: GameState, nowMs: number): Call[] {
  const { ctx, calls } = recCtx();
  fx.drawMarks(ctx, DEFAULT_PALETTE, s, layout(), nowMs, playCamera());
  return calls;
}
const strokes = (calls: Call[], color: string) => calls.filter((c) => c.fn === 'stroke' && c.stroke === color);

beforeAll(async () => {
  await loadEconomyBursts();
});

describe('a lost tower (AUD-F15)', () => {
  it('the attacker is the source of its link into the tower, else its nearest tower', () => {
    const s = board();
    expect(attackerTower(s, s.towers.p!, 'enemy1')!.id).toBe('e');
    s.links.length = 0;
    expect(attackerTower(s, s.towers.p!, 'enemy1')!.id).toBe('f');
  });

  it('a red-rimmed crack flash over LOST_MS: mine-red rim on an ink edge, a paper-edged crack, fading out', () => {
    const s = board();
    const fx = new ParticleSystem(false);
    fx.onEvents(lose(s), s, DEFAULT_PALETTE, 1000);
    const first = frame(fx, s, 1000);
    expect(strokes(first, DEFAULT_PALETTE.mine)).toHaveLength(1);
    expect(strokes(first, DEFAULT_PALETTE.ink).length).toBeGreaterThanOrEqual(2); // rim edge + crack
    expect(strokes(first, '#fffaf0')).toHaveLength(1); // the crack's paper edge
    const rimAlpha = (calls: Call[]) => strokes(calls, DEFAULT_PALETTE.mine)[0]!.alpha as number;
    expect(rimAlpha(first)).toBeCloseTo(1, 9);
    const mid = frame(fx, s, 1000 + LOST_MS / 2);
    expect(rimAlpha(mid)).toBeLessThan(1);
    expect(rimAlpha(mid)).toBeGreaterThan(0.5);
    expect(strokes(frame(fx, s, 1000 + LOST_MS), DEFAULT_PALETTE.mine)).toHaveLength(0);
  });

  it(`jolts the world ${LOST_SHAKE_PX} px along the line to the attacker (here straight up), then rests`, () => {
    expect(LOST_SHAKE_PX).toBe(2);
    const s = board();
    const fx = new ParticleSystem(false);
    fx.onEvents(lose(s), s, DEFAULT_PALETTE, 1000);
    let peak = 0;
    for (let t = 1000; t < 1320; t += 2) {
      const d = fx.shake(t);
      expect(Math.abs(d.dx)).toBeLessThan(1e-9);
      peak = Math.max(peak, Math.abs(d.dy));
    }
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(LOST_SHAKE_PX);
    expect(fx.shake(1010).dy).toBeLessThan(0); // the first swing goes toward the attacker (up)
    expect(fx.shake(1320)).toEqual({ dx: 0, dy: 0 });
  });

  it('never cuts a running capture shake short', () => {
    const s = board();
    const fx = new ParticleSystem(false);
    fx.capture(700, 1000, '#3b82f6', 'f', 'enemy1', 1000, true);
    fx.onEvents(lose(s), s, DEFAULT_PALETTE, 1020);
    expect(fx.shakeDir).toBeNull();
    let peak = 0;
    for (let t = 1020; t < 1080; t += 2) peak = Math.max(peak, Math.abs(fx.shake(t).dx));
    expect(peak).toBeGreaterThan(LOST_SHAKE_PX);
  });

  it('only for the player: an enemy losing a tower to the player gets no rim and no jolt', () => {
    const s = board();
    const fx = new ParticleSystem(false);
    s.towers.e!.owner = 'player';
    fx.onEvents([{ type: 'capture', towerId: 'e', by: 'player', from: 'enemy1' }], s, DEFAULT_PALETTE, 1000);
    expect(fx.shakeDir).toBeNull(); // the player's own capture shake (the loop)
    const { ctx, calls } = recCtx();
    fx.drawMarks(ctx, DEFAULT_PALETTE, s, { chips: [], badges: new Map(), bodies: new Map([['e', BODY]]) }, 1000, playCamera());
    expect(strokes(calls, DEFAULT_PALETTE.mine)).toHaveLength(0);
  });

  it('reduced motion: the rim only — static at full strength for LOST_MS, no crack, no wash, no shake', () => {
    const s = board();
    const fx = new ParticleSystem(true);
    fx.onEvents(lose(s), s, DEFAULT_PALETTE, 1000);
    for (const t of [1000, 1100, 1000 + LOST_MS - 1]) {
      const calls = frame(fx, s, t);
      const rim = strokes(calls, DEFAULT_PALETTE.mine);
      expect(rim).toHaveLength(1);
      expect(rim[0]!.alpha).toBe(1);
      expect(strokes(calls, '#fffaf0')).toHaveLength(0);
      expect(calls.filter((c) => c.fn === 'fill' && c.fill === DEFAULT_PALETTE.mine)).toHaveLength(0);
    }
    expect(strokes(frame(fx, s, 1000 + LOST_MS), DEFAULT_PALETTE.mine)).toHaveLength(0);
    for (let t = 1000; t < 1400; t += 10) expect(fx.shake(t)).toEqual({ dx: 0, dy: 0 });
    expect(fx.count).toBe(0);
  });
});

describe('reduced motion keeps the capture halo (AUD-F13)', () => {
  const capture = (s: GameState): SimEvent[] => {
    s.towers.e!.owner = 'player';
    return [{ type: 'capture', towerId: 'e', by: 'player', from: 'enemy1' }];
  };
  const haloLayout = () => ({ chips: [], badges: new Map([['e', { rect: BADGE, bs: 1, side: 'above' as const }]]), bodies: new Map() });
  const halo = (fx: ParticleSystem, s: GameState, t: number) => {
    const { ctx, calls } = recCtx();
    fx.drawMarks(ctx, DEFAULT_PALETTE, s, haloLayout(), t, playCamera());
    return strokes(calls, DEFAULT_PALETTE.ownerTones.player.lit);
  };

  it(`the badge halo in the new owner's lit tone fades out over HALO_RM_MS (${HALO_RM_MS} ms) — opacity only, constant width`, () => {
    expect(HALO_RM_MS).toBe(400);
    const s = board();
    const fx = new ParticleSystem(true);
    fx.onEvents(capture(s), s, DEFAULT_PALETTE, 1000);
    const at = [1000, 1100, 1200, 1300, 1399].map((t) => halo(fx, s, t));
    for (const h of at) expect(h).toHaveLength(1);
    const alphas = at.map((h) => h[0]!.alpha as number);
    expect(alphas[0]).toBe(1);
    expect(alphas[2]).toBeCloseTo(0.5, 9);
    for (let i = 1; i < alphas.length; i++) expect(alphas[i]!).toBeLessThan(alphas[i - 1]!);
    expect(new Set(at.map((h) => h[0]!.width))).toEqual(new Set([5]));
    expect(halo(fx, s, 1000 + HALO_RM_MS)).toHaveLength(0);
  });

  it('…and still nothing moves: no particles, no shake, no squash, no wipe', () => {
    const s = board();
    const fx = new ParticleSystem(true);
    fx.onEvents(capture(s), s, DEFAULT_PALETTE, 1000);
    expect(fx.count).toBe(0);
    expect(fx.shake(1100)).toEqual({ dx: 0, dy: 0 });
    expect(fx.towerSquash('e', 1100)).toBe(1);
    expect(fx.towerWipe('e', 1100)).toBeNull();
  });

  it('with motion the halo stays draw.ts `captureFlash` (the marks draw none of their own)', () => {
    const s = board();
    const fx = new ParticleSystem(false);
    fx.onEvents(capture(s), s, DEFAULT_PALETTE, 1000);
    expect(fx.captureFlash('e', 1000)).toBe(1);
    expect(halo(fx, s, 1100)).toHaveLength(0);
  });
});
