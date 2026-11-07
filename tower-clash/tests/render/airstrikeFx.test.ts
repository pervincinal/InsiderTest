import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState, Tower } from '../../src/sim/types';
import { C } from '../../src/sim/constants';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import { playCamera } from '../../src/render/camera';
import { ParticleSystem, loadEconomyBursts } from '../../src/render/particles';
import { boosterColor } from '../../src/render/hud';
import type { Rect } from '../../src/render/widgets';
import { STRIKE_COUNT_MS, STRIKE_FALL_MS, STRIKE_RING_PX, STRIKE_RM_MS, STRIKE_SHAKE_PX } from '../../src/render/combatFx';
import type { App } from '../../src/ui/screens';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import { PlayScreen } from '../../src/ui/play';

/*
 * FEEL-1-2: the airstrike's own chain (render/combatFx.ts, lazy). From the tap: STRIKE_FALL_MS of anticipation
 * (falling shell + darkening shadow, draw-only — the sim applies −10 on its next tick), then the impact (flash,
 * 1.5 × ring, sparks, soot, a STRIKE_SHAKE_PX downward slam through the world shake, the haptic) and the badge
 * counting the loss down until STRIKE_COUNT_MS — never below the sim's number, never after 250 ms, snapping on
 * an owner change. Reduced motion: a static flash + ring for STRIKE_RM_MS, the number at once, no shell, no shake.
 */

const haptic = vi.hoisted(() => ({ calls: [] as boolean[] }));
vi.mock('../../src/native/index', async (orig) => ({
  ...(await orig<typeof import('../../src/native/index')>()),
  hapticCapture: (medium = false) => {
    haptic.calls.push(medium);
  },
}));

interface Call {
  fn: string;
  fill: unknown;
  stroke: unknown;
  alpha: unknown;
}
function recCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const store: Record<string | symbol, unknown> = { globalAlpha: 1 };
  const calls: Call[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key in store) return store[key];
      return () => void calls.push({ fn: String(key), fill: store.fillStyle, stroke: store.strokeStyle, alpha: store.globalAlpha });
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
  return { ctx, calls };
}

const pal = DEFAULT_PALETTE;
const RED = boosterColor(pal, 'airstrike');
function board(units = 16): GameState {
  const s = createState(makeLevel(), 1);
  s.towers.e!.units = units;
  return s;
}
const BADGE: Rect = { x: 330, y: 240, w: 60, h: 30 };
const layout = () => ({ chips: [], badges: new Map([['e', { rect: BADGE, bs: 1, side: 'above' as const }]]), bodies: new Map([['e', { x: 322, y: 300, w: 76, h: 110 }]]) });
function frame(fx: ParticleSystem, s: GameState, nowMs: number): Call[] {
  const { ctx, calls } = recCtx();
  fx.drawMarks(ctx, pal, s, layout(), nowMs, playCamera());
  return calls;
}
const fills = (calls: Call[], color: string) => calls.filter((c) => c.fn === 'fill' && c.fill === color);
const strokes = (calls: Call[], color: string) => calls.filter((c) => c.fn === 'stroke' && c.stroke === color);
/** The sim's tick: the −AIRSTRIKE_DAMAGE lands (commands.ts). */
const apply = (t: Tower) => void (t.units = Math.max(0, t.units - C.AIRSTRIKE_DAMAGE));

beforeAll(async () => {
  await loadEconomyBursts();
});

describe('the chain (motion)', () => {
  it('anticipation for 150 ms (shell + shadow, nothing spawned, no buzz), then the impact once', () => {
    const fx = new ParticleSystem(false);
    const s = board();
    let buzz = 0;
    fx.airstrike(s.towers.e!, pal, 1000, () => buzz++);
    expect(fx.count).toBe(0);
    const early = frame(fx, s, 1000);
    const late = frame(fx, s, 1140);
    for (const f of [early, late]) {
      expect(fills(f, pal.metal.mid)).toHaveLength(1); // the shell
      expect(fills(f, pal.ink)).toHaveLength(1); // its shadow
    }
    // the shadow darkens as the shell falls
    expect(fills(late, pal.ink)[0]!.alpha as number).toBeGreaterThan(fills(early, pal.ink)[0]!.alpha as number);
    expect(buzz).toBe(0);
    expect(fx.shake(1140)).toEqual({ dx: 0, dy: 0 });
    const hit = frame(fx, s, 1000 + STRIKE_FALL_MS);
    expect(fills(hit, pal.metal.mid)).toHaveLength(0); // the shell is gone
    expect(buzz).toBe(1);
    expect(fx.count).toBe(2 + 1 + 6 + 6); // two flashes, the ring, 6 sparks, 6 soot puffs
    frame(fx, s, 1300);
    expect(buzz).toBe(1);
  });

  it('the impact: a 1.5 × landing ring in the booster colour and a 3 px downward slam through the world shake', () => {
    expect(STRIKE_RING_PX).toBe(1.5 * 18);
    const fx = new ParticleSystem(false);
    const s = board();
    fx.airstrike(s.towers.e!, pal, 1000, () => undefined);
    frame(fx, s, 1150);
    const { ctx, calls } = recCtx();
    fx.draw(ctx, 1150);
    expect(strokes(calls, RED).length).toBeGreaterThanOrEqual(1); // the ring
    expect(fills(calls, pal.gold).length).toBeGreaterThanOrEqual(1); // the flash
    expect([fx.shakeAmp, fx.shakeDir]).toEqual([STRIKE_SHAKE_PX, { x: 0, y: 1 }]);
    let peak = 0;
    for (let t = 1150; t < 1500; t += 4) {
      const d = fx.shake(t);
      expect(Math.abs(d.dx)).toBe(0);
      peak = Math.max(peak, Math.abs(d.dy));
    }
    expect(peak).toBeGreaterThan(2);
    expect(peak).toBeLessThanOrEqual(STRIKE_SHAKE_PX);
    expect(fx.shake(1150 + 320)).toEqual({ dx: 0, dy: 0 }); // settles with the capture shake's 320 ms
  });

  it('never cuts a stronger capture shake short', () => {
    const fx = new ParticleSystem(false);
    const s = board();
    fx.capture(0, 0, '#fff', 'x', 'neutral', 1140, true);
    fx.airstrike(s.towers.e!, pal, 1000, () => undefined);
    frame(fx, s, 1150);
    expect([fx.shakeAt, fx.shakeAmp]).toEqual([1140, 6]);
  });
});

describe('the badge count-down (display only)', () => {
  it('shows the cast count until the impact, counts down to the sim number by 250 ms, then the sim number', () => {
    const fx = new ParticleSystem(false);
    const s = board(16);
    const t = s.towers.e!;
    fx.airstrike(t, pal, 1000, () => undefined);
    expect(fx.shown(t, 1000)).toBe(16);
    apply(t); // the next sim tick
    expect(fx.shown(t, 1050)).toBe(16);
    expect(fx.shown(t, 1150)).toBe(16);
    expect(fx.shown(t, 1200)).toBe(11);
    expect(fx.shown(t, 1000 + STRIKE_COUNT_MS)).toBe(6);
    let prev = Infinity;
    for (let ms = 1000; ms <= 1600; ms += 5) {
      const n = fx.shown(t, ms);
      expect(n).toBeGreaterThanOrEqual(t.units);
      expect(n).toBeLessThanOrEqual(t.units + C.AIRSTRIKE_DAMAGE);
      expect(n).toBeLessThanOrEqual(prev);
      if (ms >= 1000 + STRIKE_COUNT_MS) expect(n).toBe(t.units);
      prev = n;
    }
  });

  it('follows the sim number as it moves, never hides more than the strike took, and snaps on an owner change', () => {
    const fx = new ParticleSystem(false);
    const s = board(6);
    const t = s.towers.e!;
    fx.airstrike(t, pal, 1000, () => undefined);
    apply(t); // 6 → 0
    expect(fx.shown(t, 1100)).toBe(6);
    t.units = 3; // a landing reinforced it
    expect(fx.shown(t, 1100)).toBe(6);
    expect(fx.shown(t, 1200)).toBe(5);
    const big = board(30);
    fx.airstrike(big.towers.e!, pal, 2000, () => undefined);
    big.towers.e!.units = 2; // the strike and a clash on the same tick
    expect(fx.shown(big.towers.e!, 2100)).toBe(2 + C.AIRSTRIKE_DAMAGE);
    big.towers.e!.owner = 'player'; // captured mid count
    expect(fx.shown(big.towers.e!, 2100)).toBe(2);
  });

  it('is the real count with no strike, and on a tower never struck', () => {
    const fx = new ParticleSystem(false);
    const s = board(9);
    expect(fx.shown(s.towers.e!, 0)).toBe(9);
    fx.airstrike(s.towers.e!, pal, 0, () => undefined);
    expect(fx.shown(s.towers.p!, 100)).toBe(s.towers.p!.units);
  });
});

describe('reduced motion', () => {
  it('a static flash + ring from the tap for 300 ms, the number at once, the haptic at once; no shell, no shake, no particles', () => {
    const fx = new ParticleSystem(true);
    const s = board(16);
    const t = s.towers.e!;
    let buzz = 0;
    fx.airstrike(t, pal, 1000, () => buzz++);
    expect(buzz).toBe(1);
    apply(t);
    expect(fx.shown(t, 1000)).toBe(6);
    const looks = [1000, 1150, 1299].map((ms) => frame(fx, s, ms));
    for (const f of looks) {
      expect(fills(f, pal.metal.mid)).toHaveLength(0);
      expect(fills(f, pal.ink)).toHaveLength(0);
      expect(fills(f, pal.gold)).toHaveLength(1);
      expect(strokes(f, RED)).toHaveLength(1);
      expect(f.filter((c) => c.fn === 'fill' || c.fn === 'stroke').map((c) => c.alpha)).toEqual(looks[0]!.filter((c) => c.fn === 'fill' || c.fn === 'stroke').map((c) => c.alpha)); // static
    }
    expect(strokes(frame(fx, s, 1000 + STRIKE_RM_MS), RED)).toHaveLength(0);
    expect(fx.count).toBe(0);
    expect(fx.shake(1150)).toEqual({ dx: 0, dy: 0 });
    expect(buzz).toBe(1);
  });
});

describe('play.ts: the cast (Settings → Vibration, the sound)', () => {
  function fakeApp(save: SaveData): App {
    return {
      view: {} as View,
      save,
      ads: createAdSession(),
      palette: () => getPalette(false),
      goTitle() {},
      goLevels() {},
      goShop() {},
      goAchievements() {},
      startLevel: () => Promise.resolve(true),
      go() {},
      openSettings() {},
      openHowTo() {},
      setSpeed() {},
      setLanguage() {},
      dayKey: () => '2026-11-04',
      weekKey: () => '2026-11-03',
    };
  }
  const cast = (save: SaveData): void => {
    save.gold = 500;
    const play = new PlayScreen(fakeApp(save), makeLevel(), 1, 1);
    expect(play.airstrike('e')).toBe(true);
    const ps = (play as unknown as { particles: ParticleSystem; state: GameState }).particles;
    const st = (play as unknown as { state: GameState }).state;
    const { ctx } = recCtx();
    for (const ms of [0, 100, 160]) ps.drawMarks(ctx, pal, st, layout(), ms, playCamera());
  };

  beforeEach(() => {
    setSaveStorageForTests(null);
    haptic.calls = [];
  });

  it('a medium haptic at the impact with Vibration on (default), none with it off', () => {
    const save = defaultSave();
    cast(save);
    expect(haptic.calls).toEqual([true]);
    save.settings.haptics = false;
    cast(save);
    expect(haptic.calls).toEqual([true]);
  });
});
