import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { levelMapMaxScroll, levelNodeRect } from '../../src/render/menuLayout';
import type { LevelSelectOpts } from '../../src/render/menusLevels';
import { createAdSession } from '../../src/economy/adsFlow';
import { LEVEL_META } from '../../src/levels/index';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { LevelSelectScreen } from '../../src/ui/levelSelect';
import { FLING, Fling, SHAKE_MS, flingDistance, shakeOffset } from '../../src/ui/fling';
import { setReducedMotionOverride } from '../../src/ui/motion';
import { registerDictionary, setLanguage, t } from '../../src/ui/i18n';
import { az } from '../../src/ui/locales/az';
import { en } from '../../src/ui/locales/en';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';

/*
 * AUD-U18: the level map flings. On lift the velocity of the finger's last 100 ms carries the map on,
 * decaying × 0.95 per 16 ms (frame-rate independent) until it is under 20 CSS px/s; either end stops
 * it (hard clamp); a press while it glides stops it and starts nothing. A locked node shakes for 200 ms
 * and toasts "Clear level N to unlock" (N = the node before it). Reduced motion: no fling, no shake —
 * the toast only. The map's drawing is mocked: `opts` records what it was asked to paint.
 */

const drawn = vi.hoisted(() => ({ opts: null as LevelSelectOpts | null }));
vi.mock('../../src/render/menusLevels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/render/menusLevels')>()), // AUD-U23: CHALLENGE_PLAY_HIT
  drawLevelSelect: (_v: unknown, _p: unknown, o: LevelSelectOpts) => void (drawn.opts = o),
}));

/** 360-wide phone: 0.5 CSS px per layout px. */
const SCALE = 0.5;
const VIEW = { scale: SCALE } as View;

function fakeApp(save: SaveData) {
  const starts: number[] = [];
  const app: App = {
    view: VIEW,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel(levelId) {
      starts.push(levelId);
      return Promise.resolve(true);
    },
    go() {},
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-11-03',
    weekKey: () => '2026-11-02',
  };
  return { app, starts };
}

const pt = (x: number, y: number, timeMs: number) => ({ x, y, id: 1, type: 'touch' as const, timeMs });

/** A drag from y0 by `dy` over `ms` in 8 ms steps, lifted at the end (at the last sample's time). */
function drag(s: LevelSelectScreen, y0: number, dy: number, ms: number, t0 = 1000): number {
  s.down(pt(360, y0, t0));
  const n = Math.round(ms / 8);
  for (let i = 1; i <= n; i++) s.move(pt(360, y0 + (dy * i) / n, t0 + i * 8));
  s.up(pt(360, y0 + dy, t0 + n * 8));
  return t0 + n * 8;
}

/** Run frames every 16 ms from `t` until the fling stops (or `maxMs`); returns the time reached. */
function frames(s: LevelSelectScreen, t: number, maxMs = 10_000): number {
  const end = t + maxMs;
  while (t < end) {
    t += 16;
    s.draw(VIEW, t);
    if (!s.flinging) break;
  }
  return t;
}

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  for (let i = 1; i <= 30; i++) save.stars[String(i)] = 3; // 31 open: a long scrollable map
  drawn.opts = null;
});
afterEach(() => {
  setReducedMotionOverride(null);
  void setLanguage('en');
});

describe('Fling (src/ui/fling.ts)', () => {
  it('velocity of the last 100 ms; samples before the window do not count', () => {
    const f = new Fling();
    f.press(1000, 0);
    f.track(1000, 300); // the finger rested for 300 ms …
    for (let i = 1; i <= 10; i++) f.track(1000 - 10 * i, 300 + i * 10); // … then 1 px / ms upwards
    expect(f.release(900, 400, SCALE, false)).toBe(true);
    expect(f.v).toBeCloseTo(1, 6); // finger up → the offset grows, 1 layout px / ms
  });

  it('a finger that stopped before lifting does not fling', () => {
    const f = new Fling();
    f.press(1000, 0);
    for (let i = 1; i <= 10; i++) f.track(1000 - 30 * i, i * 10);
    f.track(700, 260); // held still for 160 ms
    expect(f.release(700, 260, SCALE, false)).toBe(false);
    expect(f.v).toBe(0);
  });

  it('sparse events (moves > 100 ms apart, the lift on the last move’s point) still fling', () => {
    const f = new Fling();
    f.press(1000, 0);
    f.track(850, 120);
    f.track(700, 240);
    expect(f.release(700, 260, SCALE, false)).toBe(true);
    expect(f.v).toBeCloseTo(150 / 140, 6);
  });

  it('decays × 0.95 per 16 ms, frame-rate independent; the distance is v / k', () => {
    for (const dt of [8, 16, 33]) {
      const f = new Fling();
      f.press(0, 0);
      f.track(-16, 16);
      f.release(-32, 32, SCALE, false); // 1 px / ms
      let travelled = 0;
      let t = 32;
      let v16 = 0;
      while (f.moving) {
        t += dt;
        travelled += f.step(t, SCALE);
        if (t === 32 + 48) v16 = f.v; // 48 ms in: 0.95³
      }
      if (dt === 8 || dt === 16) expect(v16).toBeCloseTo(0.95 ** 3, 6);
      const k = -Math.log(FLING.decay16) / 16;
      expect(flingDistance(1)).toBeCloseTo(1 / k, 6);
      // stopped at 20 CSS px/s = 0.04 layout px / ms at 0.5: the tail it skips is 0.04 / k ≈ 12 px
      expect(travelled).toBeGreaterThan(flingDistance(1) - flingDistance(0.04) - 1);
      expect(travelled).toBeLessThan(flingDistance(1));
    }
  });

  it('stops under 20 CSS px/s; never starts under it; reduced motion never starts', () => {
    const f = new Fling();
    f.press(0, 0);
    expect(f.release(-1.5, 100, SCALE, false)).toBe(false); // 0.015 px/ms = 7.5 CSS px/s
    f.press(0, 0);
    expect(f.release(-100, 100, SCALE, true)).toBe(false);
    f.press(0, 0);
    expect(f.release(-100, 100, SCALE, false)).toBe(true);
    f.step(5000, SCALE); // a long gap is capped at 100 ms per step, then the speed floor stops it eventually
    expect(f.moving).toBe(true);
    for (let t = 5000; f.moving && t < 20_000; t += 16) f.step(t, SCALE);
    expect(Math.abs(f.v)).toBe(0);
  });

  it('a press on a moving fling stops it and reports the catch', () => {
    const f = new Fling();
    f.press(0, 0);
    f.release(-100, 100, SCALE, false);
    expect(f.press(10, 120)).toBe(true);
    expect(f.moving).toBe(false);
    expect(f.press(10, 130)).toBe(false);
  });

  it('shake: three swings over 200 ms, ≤ 10 px, still after', () => {
    expect(shakeOffset(0)).toBe(0);
    expect(Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(shakeOffset(i))))).toBeLessThanOrEqual(10);
    expect(Math.abs(shakeOffset(SHAKE_MS / 12))).toBeGreaterThan(5);
    expect(shakeOffset(SHAKE_MS)).toBe(0);
    expect(shakeOffset(-1)).toBe(0);
  });
});

describe('level map momentum', () => {
  it('a quick upward drag keeps scrolling after the lift, slows down and stops', () => {
    const { app } = fakeApp(save);
    const map = new LevelSelectScreen(app);
    map.setScroll(1000);
    const t = drag(map, 1000, -200, 96); // ≈ 2 px / ms, finger up
    expect(map.getScroll()).toBeCloseTo(1200, 6);
    expect(map.flinging).toBe(true);
    map.draw(VIEW, t + 16);
    const a = map.getScroll();
    map.draw(VIEW, t + 32);
    const b = map.getScroll();
    expect(a).toBeGreaterThan(1200);
    expect(b - a).toBeLessThan(a - 1200 + 1e-9); // decaying
    frames(map, t + 32);
    expect(map.flinging).toBe(false);
    const end = map.getScroll();
    // ≈ v / k past the lift (v ≈ 2.08 px / ms)
    expect(end - 1200).toBeGreaterThan(flingDistance(2) * 0.9);
    expect(end - 1200).toBeLessThan(flingDistance(2.2));
    map.draw(VIEW, t + 20_000);
    expect(map.getScroll()).toBe(end);
  });

  it('the map clamps hard at its end and the fling stops there', () => {
    const { app } = fakeApp(save);
    const map = new LevelSelectScreen(app);
    map.setScroll(-1e9);
    const min = map.getScroll(); // 0, or below it while the "Yesterday's map" row is up
    map.setScroll(min + 80);
    const t = drag(map, 600, 60, 48); // finger down → towards the top end
    expect(map.flinging).toBe(true);
    frames(map, t);
    expect(map.getScroll()).toBe(min);
    expect(map.flinging).toBe(false);
    // and the far end (the screen's own maximum: the last node clears the commander chip)
    map.setScroll(1e9);
    const max = map.getScroll();
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(levelMapMaxScroll(LEVEL_META.length, 1280));
    map.setScroll(max - 50);
    frames(map, drag(map, 900, -60, 48, 50_000));
    expect(map.getScroll()).toBe(max);
    expect(map.flinging).toBe(false);
  });

  it('a tap during the fling stops it and does not start the level under it', () => {
    const { app, starts } = fakeApp(save);
    const map = new LevelSelectScreen(app);
    map.setScroll(1000);
    let t = drag(map, 1000, -200, 96);
    t += 16;
    map.draw(VIEW, t);
    expect(map.flinging).toBe(true);
    const at = map.getScroll();
    // an open level's node on screen now
    const i = LEVEL_META.findIndex((_, k) => {
      const r = levelNodeRect(k, at);
      return k < 30 && r.y > 500 && r.y < 900;
    });
    expect(i).toBeGreaterThanOrEqual(0);
    const r = levelNodeRect(i, at);
    map.down(pt(r.x + r.w / 2, r.y + r.h / 2, t + 1));
    map.up(pt(r.x + r.w / 2, r.y + r.h / 2, t + 40));
    expect(map.flinging).toBe(false);
    map.draw(VIEW, t + 200);
    expect(map.getScroll()).toBe(at);
    expect(starts).toEqual([]);
    // the next tap acts
    map.down(pt(r.x + r.w / 2, r.y + r.h / 2, t + 300));
    map.up(pt(r.x + r.w / 2, r.y + r.h / 2, t + 340));
    expect(starts).toEqual([LEVEL_META[i]!.id]);
  });

  it('reduced motion: the map stops where the finger left it', () => {
    setReducedMotionOverride(true);
    const { app } = fakeApp(save);
    const map = new LevelSelectScreen(app);
    map.setScroll(1000);
    const t = drag(map, 1000, -200, 96);
    expect(map.flinging).toBe(false);
    map.draw(VIEW, t + 16);
    map.draw(VIEW, t + 500);
    expect(map.getScroll()).toBeCloseTo(1200, 6);
  });

  it('a slow drag (released at rest) does not fling', () => {
    const { app } = fakeApp(save);
    const map = new LevelSelectScreen(app);
    map.setScroll(1000);
    map.down(pt(360, 1000, 0));
    for (let i = 1; i <= 10; i++) map.move(pt(360, 1000 - 20 * i, i * 16));
    map.move(pt(360, 800, 400)); // held still
    map.up(pt(360, 800, 400));
    expect(map.flinging).toBe(false);
  });
});

describe('locked node tap', () => {
  /** The first locked node (index 31 = level 32 after 30 clears and level 31 open) brought on screen. */
  function lockedOnScreen() {
    const { app, starts } = fakeApp(save);
    const map = new LevelSelectScreen(app);
    const i = 31;
    map.setScroll(levelNodeRect(i, 0).y - 700);
    const r = levelNodeRect(i, map.getScroll());
    return { map, starts, i, p: (t: number) => pt(r.x + r.w / 2, r.y + r.h / 2, t) };
  }

  it('shakes the node for 200 ms and toasts the level that opens it; nothing starts', () => {
    const { map, starts, i, p } = lockedOnScreen();
    map.draw(VIEW, 1000);
    map.down(p(1001));
    map.up(p(1050));
    expect(starts).toEqual([]);
    map.draw(VIEW, 1100);
    expect(map.toast.opts(1100)?.text).toBe(t('map.locked', { n: LEVEL_META[i - 1]!.id }));
    expect(map.toast.opts(1100)?.text).toBe('Clear level 31 to unlock');
    expect(drawn.opts?.shake?.index).toBe(i);
    expect(drawn.opts?.shake?.dx).toBeCloseTo(shakeOffset(100), 6); // the shake runs on the frame clock (last frame 1000)
    map.draw(VIEW, 1000 + SHAKE_MS + 1);
    expect(drawn.opts?.shake ?? null).toBeNull();
  });

  it('reduced motion: the toast only, no shake', () => {
    setReducedMotionOverride(true);
    const { map, p } = lockedOnScreen();
    map.draw(VIEW, 1000);
    map.down(p(1001));
    map.up(p(1050));
    map.draw(VIEW, 1050);
    expect(map.toast.opts(1050)?.text).toBe('Clear level 31 to unlock');
    expect(drawn.opts?.shake ?? null).toBeNull();
  });

  it('map.locked exists in all four languages with the {n} slot', () => {
    for (const d of [en, az, ru, tr]) expect(d['map.locked']).toContain('{n}');
    registerDictionary('az', az);
    return setLanguage('az').then(() => expect(t('map.locked', { n: 7 })).toBe('Səviyyə 7 keçiləndə açılır'));
  });
});
