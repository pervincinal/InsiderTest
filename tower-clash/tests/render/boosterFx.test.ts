import { beforeAll, describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { step } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import type { GameState } from '../../src/sim/types';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE, composite } from '../../src/render/palette';
import type { Palette } from '../../src/render/palette';
import { FLAT } from '../../src/render/camera';
import { ParticleSystem, loadEconomyBursts } from '../../src/render/particles';
import type { MarksLayout } from '../../src/render/particles';
import { towerBodyRect } from '../../src/render/worldChips';
import { BADGE_HALO_GAP, BOOSTER_FADE_MS, CHEVRON_MAX, CHEVRON_MS, FROST_CRYSTALS, boosterLook } from '../../src/render/particlesEconomy';

/*
 * AUD-F3 (GDD §2.6): Freeze and Overdrive show on the towers they hold — a frost rim with ice ticks and
 * slow orbiting crystals / a gold rim with chevrons and chevrons rising at the stream rate, the badge
 * tinted cold / warm with a halo — fading over the last BOOSTER_FADE_MS; reduced motion: the static rims
 * only. Drawn from the lazy particlesEconomy chunk through `ParticleSystem.drawMarks`, from the clock:
 * nothing is spawned.
 */

interface Call {
  fn: string;
  args: unknown[];
  stroke: unknown;
  fill: unknown;
  alpha: number;
  op: unknown;
}

/** Canvas stand-in recording every call with the stroke / fill / alpha / composite current at the time. */
function recCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const store: Record<string | symbol, unknown> = { globalAlpha: 1, globalCompositeOperation: 'source-over' };
  const calls: Call[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key in store) return store[key];
      return (...args: unknown[]) =>
        void calls.push({ fn: String(key), args, stroke: store.strokeStyle, fill: store.fillStyle, alpha: store.globalAlpha as number, op: store.globalCompositeOperation });
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
  return { ctx, calls };
}

/** Player `p` (L1) and `p3` (L3), enemy `e`, neutral `n`. */
function board(): GameState {
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 200, y: 1000, owner: 'player', units: 10, level: 1 },
        { id: 'p3', x: 520, y: 1000, owner: 'player', units: 10, level: 3 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
        { id: 'n', x: 360, y: 700, owner: 'neutral', units: 5, level: 1 },
      ],
    }),
    1,
  );
}

const cast = (state: GameState, booster: 'freeze' | 'overdrive'): void => applyCommand(state, { type: 'booster', owner: 'player', booster });

/** A badge rect above every tower (the layout's shape; the exact place does not matter here) and its drawn body. */
function layoutOf(state: GameState): MarksLayout {
  const towers = Object.values(state.towers);
  const badges = new Map(towers.map((t) => [t.id, { rect: { x: t.x - 30, y: t.y - 120, w: 60, h: 40 }, bs: 1, side: 'above' as const }]));
  const bodies = new Map(towers.map((t) => [t.id, towerBodyRect(t.kind, t.level, { x: t.x, y: t.y, s: 1 })]));
  return { badges, chips: [], bodies };
}

function frame(fx: ParticleSystem, state: GameState, nowMs: number, pal: Palette = DEFAULT_PALETTE): Call[] {
  const { ctx, calls } = recCtx();
  fx.drawMarks(ctx, pal, state, layoutOf(state), nowMs, FLAT);
  return calls;
}

/** Rim ellipses (the ground rings) by centre x. */
const rimXs = (calls: Call[]): number[] => [...new Set(calls.filter((c) => c.fn === 'ellipse').map((c) => c.args[0] as number))].sort((a, b) => a - b);
const strokesIn = (calls: Call[], colours: string[]): number => calls.filter((c) => c.fn === 'stroke' && colours.includes(c.stroke as string)).length;

describe('before the lazy chunk is in', () => {
  it('an active booster draws nothing (and nothing throws)', () => {
    const state = board();
    cast(state, 'freeze');
    expect(frame(new ParticleSystem(false), state, 1000)).toHaveLength(0);
  });
});

describe('who carries which look (boosterLook)', () => {
  it('Freeze holds every non-neutral tower of another owner, Overdrive the caster’s towers', () => {
    const state = board();
    cast(state, 'freeze');
    const t = state.towers;
    expect(boosterLook(state.boosters, state.time, t.e!)).toEqual({ freeze: 1, overdrive: 0 });
    expect(boosterLook(state.boosters, state.time, t.p!)).toEqual({ freeze: 0, overdrive: 0 });
    expect(boosterLook(state.boosters, state.time, t.n!)).toEqual({ freeze: 0, overdrive: 0 }); // neutrals never produce
    cast(state, 'overdrive');
    expect(boosterLook(state.boosters, state.time, t.p!).overdrive).toBe(1);
    expect(boosterLook(state.boosters, state.time, t.e!).overdrive).toBe(0);
  });

  it('fades 1 → 0 over the last BOOSTER_FADE_MS (1 s) of sim time, gone when the sim drops the booster', () => {
    expect(BOOSTER_FADE_MS).toBe(1000);
    const state = board();
    cast(state, 'overdrive');
    const p = state.towers.p!;
    const until = state.boosters[0]!.untilMs;
    expect(until - state.time).toBe(C.OVERDRIVE_MS);
    const at = (left: number) => boosterLook(state.boosters, until - left, p).overdrive;
    expect(at(5000)).toBe(1);
    expect(at(1000)).toBe(1);
    expect(at(500)).toBeCloseTo(0.5, 9);
    expect(at(250)).toBeCloseTo(0.25, 9);
    expect(at(0)).toBe(0);
    // the sim drops it on the tick after `time` reaches `untilMs`; on that tick the look is already 0
    for (let i = 0; i < C.OVERDRIVE_MS / C.TICK_MS; i++) step(state, C.TICK_MS);
    expect(state.time).toBe(until);
    expect(boosterLook(state.boosters, state.time, p).overdrive).toBe(0);
    step(state, C.TICK_MS);
    expect(state.boosters).toHaveLength(0);
  });
});

describe('the looks (motion)', () => {
  beforeAll(async () => {
    await loadEconomyBursts();
  });

  it('draws nothing with no booster active', () => {
    expect(frame(new ParticleSystem(false), board(), 1000)).toHaveLength(0);
  });

  it('Freeze: frost rims only round the frozen towers, gone once the sim drops it', () => {
    for (const pal of [DEFAULT_PALETTE, COLOR_BLIND_PALETTE]) {
      const state = board();
      cast(state, 'freeze');
      const fx = new ParticleSystem(false);
      const calls = frame(fx, state, 1000, pal);
      expect(rimXs(calls)).toEqual([360]); // e only: not the caster's towers, not the neutral
      expect(strokesIn(calls, [pal.sky])).toBeGreaterThan(0);
      expect(strokesIn(calls, [pal.goldShade])).toBe(0);
      for (let i = 0; i < C.FREEZE_MS / C.TICK_MS; i++) step(state, C.TICK_MS);
      expect(frame(fx, state, 9000, pal)).toHaveLength(0);
    }
  });

  it('Overdrive: gold rims round every tower of the caster, none on the enemy or the neutral', () => {
    const state = board();
    cast(state, 'overdrive');
    const calls = frame(new ParticleSystem(false), state, 1000);
    expect(rimXs(calls)).toEqual([200, 520]);
    expect(strokesIn(calls, [DEFAULT_PALETTE.goldShade])).toBeGreaterThan(0);
    expect(strokesIn(calls, [DEFAULT_PALETTE.sky])).toBe(0);
  });

  it('the badge is tinted inside its owner stroke, then rims and halo are clipped clear of every badge (even-odd)', () => {
    const state = board();
    cast(state, 'freeze');
    const calls = frame(new ParticleSystem(false), state, 1000);
    const clip = calls.findIndex((c) => c.fn === 'clip');
    expect(calls[clip]!.args).toEqual(['evenodd']);
    const world = calls.findIndex((c) => c.fn === 'rect');
    expect(calls[world]!.args).toEqual([-1e4, -1e4, 2e4, 2e4]);
    // then each of the 4 badges as a pill 3 px clear (round ends, so the halo's ends are not nicked)
    const cut = calls.slice(world, clip);
    expect(cut.filter((c) => c.fn === 'arcTo')).toHaveLength(4 * 4);
    expect(cut.filter((c) => c.fn === 'moveTo')[0]!.args).toEqual([200 - 33 + 23, 1000 - 123]); // p's pill: 66 × 46, radius 23
    // the multiplied wash first, 1.5 px inside e's pill (x 330…390) so its coral stroke keeps its hue
    const tint = calls.filter((c) => c.fn === 'fill');
    expect(tint).toHaveLength(1);
    expect(tint[0]!.op).toBe('multiply');
    expect(tint[0]!.fill).toBe(DEFAULT_PALETTE.crystal.lit);
    const at = calls.indexOf(tint[0]!);
    expect(at).toBeLessThan(clip);
    const washXs = calls.slice(0, at).filter((c) => c.fn === 'moveTo' || c.fn === 'lineTo').map((c) => c.args[0] as number);
    expect(Math.min(...washXs)).toBeGreaterThanOrEqual(330 + 1.5 - 1e-9);
    expect(Math.max(...washXs)).toBeLessThanOrEqual(390 - 1.5 + 1e-9);
    // rims and the halo (BADGE_HALO_GAP off the pill) inside the clip
    expect(calls.findIndex((c) => c.fn === 'ellipse')).toBeGreaterThan(clip);
    // e's badge spans y 280…320: the only path points near it after the clip are the halo's
    const halo = calls.slice(clip).filter((c) => (c.fn === 'moveTo' || c.fn === 'lineTo') && Math.abs((c.args[1] as number) - 300) <= 30);
    expect(halo.length).toBeGreaterThan(0);
    expect(Math.min(...halo.map((c) => c.args[0] as number))).toBe(330 - BADGE_HALO_GAP);
    expect(Math.max(...halo.map((c) => c.args[0] as number))).toBe(390 + BADGE_HALO_GAP);
    expect(calls.slice(clip).filter((c) => c.fn === 'stroke' && c.op === 'multiply')).toHaveLength(0);
  });

  it('a tinted badge keeps its ink numerals ≥ 4.5:1 on its paper (multiply darkens ink, tints paper)', () => {
    const mul = (a: string, b: string): string => {
      const x = parseInt(a.slice(1), 16);
      const y = parseInt(b.slice(1), 16);
      const ch = (s: number) => Math.round((((x >> s) & 255) * ((y >> s) & 255)) / 255);
      return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
    };
    const lum = (hex: string): number => {
      const n = parseInt(hex.slice(1), 16);
      const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(((n >> 16) & 255) / 255) + 0.7152 * f(((n >> 8) & 255) / 255) + 0.0722 * f((n & 255) / 255);
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const p = DEFAULT_PALETTE;
    for (const wash of [p.crystal.lit, composite(p.paper, p.gold, 0.35)])
      for (const paper of [p.paper, p.badgeFull, p.badgeAlert]) expect(ratio(mul(p.ink, wash), mul(paper, wash))).toBeGreaterThanOrEqual(4.5);
  });

  it('fades: every stroke and fill at ≤ the fade factor in the last second, full before it', () => {
    const state = board();
    cast(state, 'freeze');
    cast(state, 'overdrive');
    const fx = new ParticleSystem(false);
    const full = frame(fx, state, 1000);
    expect(Math.max(...full.filter((c) => c.fn === 'stroke').map((c) => c.alpha))).toBe(1);
    state.time = state.boosters[0]!.untilMs - 400; // freeze ends first (5 s < 10 s)
    const fading = frame(fx, state, 1000);
    const frost = fading.filter((c) => (c.fn === 'stroke' && c.stroke === DEFAULT_PALETTE.sky) || (c.fn === 'fill' && c.fill === DEFAULT_PALETTE.crystal.lit));
    expect(frost.length).toBeGreaterThan(0);
    for (const c of frost) expect(c.alpha).toBeLessThanOrEqual(0.4 + 1e-9);
    const gold = fading.filter((c) => c.fn === 'stroke' && c.stroke === DEFAULT_PALETTE.goldShade);
    expect(Math.max(...gold.map((c) => c.alpha))).toBe(1); // overdrive still has 5.4 s
  });

  it('Freeze crystals orbit (FROST_CRYSTALS, slow) and Overdrive chevrons rise, both from the clock', () => {
    expect(FROST_CRYSTALS).toBe(3);
    const state = board();
    cast(state, 'freeze');
    const fx = new ParticleSystem(false);
    const moves = (t: number) => frame(fx, state, t).filter((c) => c.fn === 'moveTo').map((c) => c.args.join(','));
    expect(moves(1000)).not.toEqual(moves(1500));
    expect(moves(1000)).toEqual(moves(1000));
    expect(fx.count).toBe(0);
  });

  it('chevrons come at the effective stream rate, ≤ CHEVRON_MAX up at once, each living ≤ CHEVRON_MS', () => {
    expect([CHEVRON_MAX, CHEVRON_MS]).toEqual([4, 900]);
    const state = board();
    cast(state, 'overdrive');
    const one = (id: string): GameState => ({ ...state, towers: { [id]: state.towers[id]! } });
    // a chevron is a 3-point "^" stroked alone: moveTo + 2 lineTo, then its two strokes
    const chevrons = (calls: Call[]): number => calls.filter((c, i) => c.fn === 'moveTo' && calls[i + 3]?.fn === 'stroke' && calls[i - 1]?.fn === 'beginPath').length;
    const counts = (id: string): number[] => {
      const fx = new ParticleSystem(false);
      const out: number[] = [];
      for (let t = 10_000; t < 12_000; t += 10) out.push(chevrons(frame(fx, one(id), t)));
      return out;
    };
    // L1 barracks: 1000 / 3 = 333 ms apart, 900 ms each → 2–3 up; L3: 500 / 3 = 167 ms → capped at 4 (life 667 ms)
    const l1 = counts('p');
    expect(Math.min(...l1)).toBe(2);
    expect(Math.max(...l1)).toBe(3);
    const l3 = counts('p3');
    expect(Math.max(...l3)).toBe(CHEVRON_MAX);
    expect(Math.min(...l3)).toBeGreaterThanOrEqual(CHEVRON_MAX - 1);
  });

  it('budget: nothing spawned, ≤ 15 strokes and 1 fill per held tower however many frames', () => {
    const state = board();
    cast(state, 'freeze');
    cast(state, 'overdrive');
    const fx = new ParticleSystem(false);
    for (let t = 0; t < 6000; t += 16) {
      const calls = frame(fx, state, t);
      // 3 towers held (e frozen; p and p3 overdriven)
      expect(calls.filter((c) => c.fn === 'stroke').length).toBeLessThanOrEqual(3 * 15);
      expect(calls.filter((c) => c.fn === 'fill').length).toBe(3);
    }
    expect(fx.count).toBe(0);
  });
});

describe('the looks (reduced motion)', () => {
  beforeAll(async () => {
    await loadEconomyBursts();
  });

  it('static rims only: the same frame at any time, full strength into the last second, no crystals or chevrons', () => {
    const state = board();
    cast(state, 'freeze');
    cast(state, 'overdrive');
    const fx = new ParticleSystem(true);
    const a = frame(fx, state, 1000);
    expect(frame(fx, state, 4321).map((c) => [c.fn, c.args, c.alpha])).toEqual(a.map((c) => [c.fn, c.args, c.alpha]));
    // per tower: back + front rim (2 × 2 strokes), the cue (2), the badge halo (2) — no motion extras
    expect(a.filter((c) => c.fn === 'stroke')).toHaveLength(3 * 8);
    state.time = state.boosters[0]!.untilMs - 300;
    const late = frame(fx, state, 1000);
    expect(rimXs(late)).toEqual([200, 360, 520]);
    expect(Math.min(...late.filter((c) => c.fn === 'stroke' || c.fn === 'fill').map((c) => c.alpha))).toBeGreaterThanOrEqual(0.5); // the back rim's half strength, no fade
    expect(fx.count).toBe(0);
  });
});
