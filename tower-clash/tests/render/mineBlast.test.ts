import { beforeAll, describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/types';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE } from '../../src/render/palette';
import { FLAT } from '../../src/render/camera';
import { LAND_TOKENS_MAX, ParticleSystem, loadEconomyBursts } from '../../src/render/particles';
import { MINE_MARK_MS, MINE_SHAKE_PX } from '../../src/render/particlesEconomy';
import type { PlacedChip } from '../../src/render/worldChips';
import { mineChipRequest } from '../../src/render/worldChips';

/*
 * AUD-F2: a mine blast reads as a mine — a mine-red flash, ring and sparks at the mine (one token of the
 * shared landing bucket), soot puffs at the victim, a 2 px nudge when the player's unit dies; reduced
 * motion: nothing moves, the mine's chip is outlined for MINE_MARK_MS instead. The blast code is in the
 * lazy particlesEconomy chunk; until it is in, a mine kill is the plain grey death puff.
 */

describe('before the lazy chunk is in', () => {
  it('a mine kill falls back to the 3 grey puffs (never lost, never thrown)', () => {
    const fx = new ParticleSystem(false);
    fx.onEvents([{ type: 'unitDied', x: 362, y: 706, owner: 'player', cause: 'mine', roadId: 'e-p' }], board(), DEFAULT_PALETTE, 1000);
    expect(fx.count).toBe(3);
    expect(fx.shake(1050)).toEqual({ dx: 0, dy: 0 });
  });
});

interface Call {
  fn: string;
  args: unknown[];
  fill: unknown;
  stroke: unknown;
}

/** Canvas stand-in that records every call with the fill / stroke style current at the time. */
function recCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const store: Record<string | symbol, unknown> = {};
  const calls: Call[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (key === 'getTransform') return () => undefined;
      if (key in store) return store[key];
      return (...args: unknown[]) => void calls.push({ fn: String(key), args, fill: store.fillStyle, stroke: store.strokeStyle });
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
  return { ctx, calls };
}

/** p (player) at the bottom, e (enemy1) at the top; mine 0 on their lane, mine 1 far off. */
function board() {
  return createState(
    makeLevel({
      mines: [
        { x: 360, y: 700, charges: 3 },
        { x: 100, y: 200, charges: 2 },
      ],
    }),
    1,
  );
}
const mineDeath = (owner: 'player' | 'enemy1', x = 362, y = 706): SimEvent => ({ type: 'unitDied', x, y, owner, cause: 'mine', roadId: 'e-p' });
const clashDeath: SimEvent = { type: 'unitDied', x: 360, y: 600, owner: 'player', cause: 'clash', roadId: 'e-p' };

describe('mine blast (motion)', () => {
  beforeAll(async () => {
    await loadEconomyBursts();
  });

  it('a clash death is 3 grey puffs; a mine death adds a 7-particle mine-red burst at the mine', () => {
    const state = board();
    const clash = new ParticleSystem(false);
    clash.onEvents([clashDeath], state, DEFAULT_PALETTE, 1000);
    expect(clash.count).toBe(3);
    const mine = new ParticleSystem(false);
    mine.onEvents([mineDeath('enemy1')], state, DEFAULT_PALETTE, 1000);
    expect(mine.count).toBe(10);
  });

  it('the burst sits on the nearest mine, in the mine colour of both palettes, and drains', () => {
    const state = board();
    for (const pal of [DEFAULT_PALETTE, COLOR_BLIND_PALETTE]) {
      const fx = new ParticleSystem(false);
      fx.onEvents([mineDeath('enemy1')], state, pal, 1000);
      const { ctx, calls } = recCtx();
      fx.draw(ctx, 1000);
      const flashes = calls.filter((c) => c.fn === 'arc' && c.fill === pal.mine);
      expect(flashes.length).toBe(1);
      expect(flashes[0]!.args[0]).toBeCloseTo(360, 0); // mine 0's x, not the victim's 362
      const ring = calls.filter((c) => c.fn === 'ellipse' && c.stroke === pal.mine);
      expect(ring.length).toBe(1);
      expect(ring[0]!.args[0]).toBeCloseTo(360, 0);
      for (let t = 1016; t < 2500; t += 16) fx.draw(ctx, t);
      expect(fx.count).toBe(0);
    }
  });

  it('nudges the world by MINE_SHAKE_PX (2 px) only when the player loses the unit, then rests', () => {
    expect(MINE_SHAKE_PX).toBe(2);
    const state = board();
    const enemy = new ParticleSystem(false);
    enemy.onEvents([mineDeath('enemy1')], state, DEFAULT_PALETTE, 1000);
    for (let t = 1000; t < 1400; t += 8) expect(enemy.shake(t)).toEqual({ dx: 0, dy: 0 });
    const own = new ParticleSystem(false);
    own.onEvents([mineDeath('player')], state, DEFAULT_PALETTE, 1000);
    let peak = 0;
    for (let t = 1000; t < 1400; t += 4) peak = Math.max(peak, Math.abs(own.shake(t).dx), Math.abs(own.shake(t).dy));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(MINE_SHAKE_PX);
    expect(own.shake(1400)).toEqual({ dx: 0, dy: 0 });
  });

  it('a mine nudge never cuts a running capture shake short', () => {
    const state = board();
    const fx = new ParticleSystem(false);
    fx.capture(360, 1000, '#3b82f6', 'p', 'neutral', 1000, true);
    fx.onEvents([mineDeath('player')], state, DEFAULT_PALETTE, 1020);
    let peak = 0;
    for (let t = 1020; t < 1080; t += 2) peak = Math.max(peak, Math.abs(fx.shake(t).dx));
    expect(peak).toBeGreaterThan(MINE_SHAKE_PX);
  });

  it('bursts share the landing bucket: a 20-kill instant spawns LAND_TOKENS_MAX bursts, every victim still puffs', () => {
    const state = board();
    const fx = new ParticleSystem(false);
    fx.onEvents(Array.from({ length: 20 }, () => mineDeath('enemy1')), state, DEFAULT_PALETTE, 1000);
    expect(fx.count).toBe(20 * 3 + LAND_TOKENS_MAX * 7);
    for (let i = 0; i < 200; i++) fx.onEvents([mineDeath('enemy1')], state, DEFAULT_PALETTE, 1000 + i * 5);
    expect(fx.count).toBeLessThanOrEqual(700);
  });
});

describe('mine blast (reduced motion)', () => {
  beforeAll(async () => {
    await loadEconomyBursts();
  });

  /** The frame's chip for mine `i` of `state`, as drawWorldChips would get it (flat camera, not moved). */
  function chipOf(state: ReturnType<typeof board>, i: number): PlacedChip {
    const { ctx } = recCtx();
    const m = state.mines[i]!;
    const { req, s } = mineChipRequest(ctx, FLAT, m.x, m.y, m.charges);
    return { kind: 'mine', req, s, n: m.charges, rect: req.rect };
  }

  it('spawns nothing and never shakes; the blasted mine’s chip is outlined for MINE_MARK_MS (300 ms), then not', () => {
    expect(MINE_MARK_MS).toBe(300);
    const state = board();
    const fx = new ParticleSystem(true);
    fx.onEvents([mineDeath('player')], state, DEFAULT_PALETTE, 1000);
    expect(fx.count).toBe(0);
    expect(fx.shake(1050)).toEqual({ dx: 0, dy: 0 });
    const chips = [chipOf(state, 0), chipOf(state, 1)];
    const frame = (t: number) => {
      const { ctx, calls } = recCtx();
      fx.drawMineMarks(ctx, DEFAULT_PALETTE, state.mines, chips, t, FLAT);
      return calls;
    };
    for (const t of [1000, 1150, 1299]) {
      const calls = frame(t);
      expect(calls.filter((c) => c.fn === 'stroke').length).toBe(2); // mine red, then the paper line
      const r = chips[0]!.rect;
      const xs = calls.filter((c) => c.fn === 'moveTo' || c.fn === 'lineTo').map((c) => c.args[0] as number);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(r.x - 4 - 1e-9); // round mine 0's chip, not mine 1's
      expect(Math.max(...xs)).toBeLessThanOrEqual(r.x + r.w + 4 + 1e-9);
      // static: the same outline on every frame of the window
      expect(calls.map((c) => c.args)).toEqual(frame(1000).map((c) => c.args));
    }
    expect(frame(1300).filter((c) => c.fn === 'stroke')).toHaveLength(0);
  });

  it('a spent mine (no chip any more) is outlined on the ground at the mine', () => {
    const state = board();
    const fx = new ParticleSystem(true);
    state.mines[0]!.charges = 0;
    fx.onEvents([mineDeath('enemy1')], state, DEFAULT_PALETTE, 1000);
    const { ctx, calls } = recCtx();
    fx.drawMineMarks(ctx, DEFAULT_PALETTE, state.mines, [], 1100, FLAT);
    const e = calls.find((c) => c.fn === 'ellipse');
    expect(e?.args.slice(0, 2)).toEqual([360, 700]);
    expect(calls.filter((c) => c.fn === 'stroke')).toHaveLength(2);
  });

  it('motion mode never draws the static outline', () => {
    const state = board();
    const fx = new ParticleSystem(false);
    fx.onEvents([mineDeath('player')], state, DEFAULT_PALETTE, 1000);
    const { ctx, calls } = recCtx();
    fx.drawMineMarks(ctx, DEFAULT_PALETTE, state.mines, [chipOf(state, 0)], 1100, FLAT);
    expect(calls).toHaveLength(0);
  });
});
