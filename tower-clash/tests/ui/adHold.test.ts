import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LevelDef } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { HudPlayUi } from '../../src/render/hud';
import { HUD, PAUSE } from '../../src/render/layout';
import { loadFit, setPlayFit } from '../../src/render/camera';
import type { Rect } from '../../src/render/widgets';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { PlayScreen } from '../../src/ui/play';
import { makeLevel } from '../helpers';
import level1 from '../../src/levels/001-first-taps.json';

/*
 * REV-4 (Day 63 review): the rewarded "free charge" video is its own hold (like the lesson card /
 * the stalemate card), not a write to `loop.paused`: no tick, no pause card drawn or hit-tested, all
 * input ignored, and a `pause()` during the video (app sent to background) leaves the pause card up
 * afterwards. REV-5: a key's auto-repeat is ignored. REV-9: `fromLayout` / `toLayout` are inverses on
 * the anchored world band of a tall phone.
 */

let resolveAd: ((ok: boolean) => void) | null = null;
vi.mock('../../src/economy/adsFlow', async (orig) => {
  const real = await orig<typeof import('../../src/economy/adsFlow')>();
  return {
    ...real,
    canShowRewarded: () => true,
    showRewarded: () =>
      new Promise<boolean>((res) => {
        resolveAd = res;
      }),
  };
});

function fakeApp(save: SaveData, nav: string[], view: View = {} as View): App {
  return {
    view,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {
      nav.push('levels');
    },
    goShop() {},
    goAchievements() {},
    startLevel: () => Promise.resolve(true),
    go() {},
    openSettings() {
      nav.push('settings');
    },
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-11-20',
    weekKey: () => '2026-11-16',
  };
}

function fixture(): LevelDef {
  return makeLevel({
    id: 12,
    towers: [
      { id: 'p', x: 200, y: 1000, owner: 'player', units: 20, level: 1 },
      { id: 'e', x: 200, y: 400, owner: 'enemy1', units: 10, level: 1 },
    ],
  });
}

const ui = (p: PlayScreen): HudPlayUi => (p as unknown as { buildUi(): HudPlayUi }).buildUi();
const at = (x: number, y: number) => ({ x, y, id: 1, type: 'touch' as const, timeMs: 0 });
const tap = (p: PlayScreen, r: Rect) => {
  p.down(at(r.x + r.w / 2, r.y + r.h / 2));
  p.up(at(r.x + r.w / 2, r.y + r.h / 2));
};
const key = (p: PlayScreen, k: string, repeat = false) => p.key({ key: k, repeat } as KeyboardEvent);
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

let save: SaveData;
let nav: string[];
let play: PlayScreen;

beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  save.gold = 0;
  save.stars[1] = 3; // not bare: the booster bar is up
  nav = [];
  resolveAd = null;
  play = new PlayScreen(fakeApp(save, nav), fixture(), 1, 1);
  play.startMatch();
});

describe('REV-4: the free-charge video holds the match on its own', () => {
  it('no tick, no pause card, and RETRY / MENU / SETTINGS taps, R / Esc / P / Space and the band pause do nothing', async () => {
    const restart = vi.spyOn(play, 'restart').mockImplementation(() => undefined);
    play.update(200, 0);
    const t0 = play.state.time;
    const ad = play.freeCharge('overdrive');
    expect(resolveAd).not.toBeNull();
    play.update(1000, 16);
    expect(play.state.time).toBe(t0); // held: the sim does not run behind the video
    expect(play.loop.paused).toBe(false); // the pause card's focus items (focus.ts) stay off
    expect(ui(play).paused).toBe(false);
    for (const r of [PAUSE.retry, PAUSE.menu, PAUSE.settings, PAUSE.resume, HUD.pause, HUD.menu]) tap(play, r);
    for (const k of ['r', 'R', 'Escape', 'p', 'P', ' ', '1']) key(play, k);
    play.togglePause();
    expect(play.back()).toBe(true); // swallowed
    expect(restart).not.toHaveBeenCalled();
    expect(nav).toEqual([]);
    expect(play.loop.paused).toBe(false);
    expect(ui(play).paused).toBe(false);
    expect(play.useBooster('overdrive')).toBe(false);
    resolveAd!(true);
    expect(await ad).toBe(true);
    expect(save.charges.overdrive).toBe(1);
    // no pause meanwhile: the match simply goes on
    expect(play.loop.paused).toBe(false);
    play.update(1000, 32);
    expect(play.state.time).toBeGreaterThan(t0);
  });

  it('a pause() during the video (app in the background) leaves the real pause card up afterwards', async () => {
    const ad = play.freeCharge('freeze');
    play.pause(); // main.ts visibilitychange
    expect(play.loop.paused).toBe(false);
    expect(ui(play).paused).toBe(false);
    resolveAd!(false);
    expect(await ad).toBe(false);
    expect(save.charges.freeze).toBe(0);
    expect(play.loop.paused).toBe(true);
    expect(ui(play).paused).toBe(true);
    // and the card works again
    const restart = vi.spyOn(play, 'restart').mockImplementation(() => undefined);
    tap(play, PAUSE.retry);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('is offered only from a running match (not under the pause card, not twice)', async () => {
    play.togglePause();
    expect(await play.freeCharge('overdrive')).toBe(false);
    expect(resolveAd).toBeNull();
    play.togglePause();
    const ad = play.freeCharge('overdrive');
    expect(await play.freeCharge('freeze')).toBe(false);
    resolveAd!(true);
    await ad;
    await flush();
    expect(save.charges).toMatchObject({ overdrive: 1, freeze: 0 });
  });
});

describe('REV-5: a held key fires once', () => {
  it('R then R-repeat opens the pause card and does not restart; Space / P / Esc repeats do not flicker it', () => {
    const restart = vi.spyOn(play, 'restart').mockImplementation(() => undefined);
    key(play, 'r');
    expect(play.loop.paused).toBe(true);
    key(play, 'r', true);
    key(play, 'R', true);
    expect(restart).not.toHaveBeenCalled();
    expect(play.loop.paused).toBe(true);
    for (const k of [' ', 'p', 'Escape']) {
      key(play, k, true);
      expect(play.loop.paused, k).toBe(true);
    }
    key(play, 'Escape');
    expect(play.loop.paused).toBe(false);
    key(play, ' ');
    expect(play.loop.paused).toBe(true);
    key(play, ' ', true);
    expect(play.loop.paused).toBe(true);
    key(play, 'R'); // a fresh press on the card still restarts
    expect(restart).toHaveBeenCalledTimes(1);
  });
});

describe('REV-9: fromLayout / toLayout are inverses on the anchored world band (430 × 932)', () => {
  /** view.ts `resize` letterbox for a w × h CSS px screen with safe-area insets (as tests/render/cameraFit.test.ts). */
  const screen = (w: number, h: number, top: number, bottom: number) => {
    const usableH = Math.max(h / 2, h - top - bottom);
    const scale = Math.min(w / 720, usableH / 1280);
    return { cssW: w, cssH: h, scale, offsetX: (w - 720 * scale) / 2, offsetY: Math.min(top, h - usableH) + (usableH - 1280 * scale) / 2, insets: { top, right: 0, bottom, left: 0 } } as unknown as View;
  };
  beforeAll(() => loadFit());
  afterEach(() => setPlayFit(null));

  it('screen points in both extensions and map points projecting into the bottom one round-trip', () => {
    const view = screen(430, 932, 59, 34);
    const p = new PlayScreen(fakeApp(save, nav, view), level1 as unknown as LevelDef, 1, 1);
    const top = HUD.mapTop - 62.419; // hudAnchors(view): ±62.419 (cameraFit.test.ts)
    const bottom = HUD.mapBottom + 62.419;
    // screen → layout → screen, in the band's moved room above and below the 9:16 band (whose map
    // point is a world point too: below screen y 1210 here — the fit zooms the map's lower edge past the band)
    for (const y of [top + 2, (top + HUD.mapTop) / 2, HUD.mapTop - 1, HUD.mapBottom + 1, HUD.mapBottom + 15, HUD.mapBottom + 29]) {
      for (const x of [40, 360, 680]) {
        const l = p.toLayout(x, y);
        expect(l.y, `toLayout(${x}, ${y}) is a camera point`).not.toBeCloseTo(y, 3);
        expect(l.y).toBeGreaterThan(top);
        expect(l.y).toBeLessThan(bottom);
        const back = p.fromLayout(l.x, l.y);
        expect(back.x).toBeCloseTo(x, 6);
        expect(back.y).toBeCloseTo(y, 6);
      }
    }
    // layout → screen → layout for map points in the bottom extension (level 1's fit moves the map up:
    // these land inside the world band; a top-extension map point lands above it, off the world)
    for (const y of [HUD.mapBottom + 1, HUD.mapBottom + 20, HUD.mapBottom + 40]) {
      for (const x of [40, 360, 680]) {
        const s = p.fromLayout(x, y);
        expect(s.y, `fromLayout(${x}, ${y}) goes through the camera`).not.toBeCloseTo(y, 3);
        expect(s.y).toBeGreaterThan(top);
        expect(s.y).toBeLessThan(bottom);
        const back = p.toLayout(s.x, s.y);
        expect(back.x).toBeCloseTo(x, 6);
        expect(back.y).toBeCloseTo(y, 6);
      }
    }
  });
});
