import { beforeAll, describe, expect, it } from 'vitest';
import type { LevelDef } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { fromHudSpace, hudAnchors } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { BAND_TOWER_REACH, BOOSTERS, HUD, TOWER_HIT_RADIUS } from '../../src/render/layout';
import type { Rect } from '../../src/render/widgets';
import { hitArea, minHit } from '../../src/render/widgets';
import { hitTower } from '../../src/input/pointer';
import { createAdSession } from '../../src/economy/adsFlow';
import { loadAllLevels } from '../../src/levels/index';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { PlayScreen } from '../../src/ui/play';

/*
 * AUD-U19 (GDD §4, 2026-11-04): `inWorld` sent every press on the HUD bands to the HUD, while a tower's hit
 * disc (TOWER_HIT_RADIUS 57) near the map's edge reaches into a band — level 25's home ring was cut by the
 * bottom band. Now a press in a band's BAND_TOWER_REACH (30) logical px next to the map that is on no HUD
 * tap rect and on a tower's hit area goes to that tower; the HUD rects keep priority.
 *
 * Over every level × both phone shapes (360 × 640 without insets; 430 × 932 with the 59 / 34 Dynamic Island /
 * home-indicator insets, whose bands move out to the safe edges, BUG-34), on the flat default camera:
 *   1. every tower's hit disc takes a press at its lowest point (and the base disc's top), unless a HUD
 *      tap rect covers that point or it lies past the reach;
 *   2. a scan of both 30 px strips: every point on a HUD tap area is still that button's press (no HUD rect
 *      lost a pixel), every other point on a tower's hit area presses that tower, the rest stays a HUD
 *      press that does nothing — exactly as before.
 * The tower a press landed on is the gestures' `downTowerId` (pointer.ts `PlayGestures.down`'s own `hitTower`).
 */

interface Phone {
  name: string;
  w: number;
  h: number;
  top: number;
  bottom: number;
}

const PHONES: readonly Phone[] = [
  { name: '360x640', w: 360, h: 640, top: 0, bottom: 0 },
  { name: '430x932', w: 430, h: 932, top: 59, bottom: 34 },
];

/** src/render/view.ts `resize` for a phone shape (letterboxed inside the safe area). */
function viewFor(p: Phone): View {
  const usableH = p.h - p.top - p.bottom;
  const scale = Math.min(p.w / 720, usableH / 1280);
  return {
    cssW: p.w,
    cssH: p.h,
    dpr: 2,
    scale,
    offsetX: (p.w - 720 * scale) / 2,
    offsetY: p.top + (usableH - 1280 * scale) / 2,
    insets: { top: p.top, right: 0, bottom: p.bottom, left: 0 },
  } as View;
}

function fakeApp(save: SaveData, view: View): App {
  return {
    view,
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

type Press = { kind: string; button?: string | null } | null;
const pressOf = (play: PlayScreen): Press => (play as unknown as { press: Press }).press;

/** The HUD tap areas on the screen (logical px; the bands' rects moved with their anchors). */
function hudAreas(view: View, bare: boolean): { name: string; r: Rect }[] {
  const a = hudAnchors(view);
  const list: [string, Rect][] = [
    ['pause', HUD.pause],
    ['mute', HUD.mute],
    ['menu', HUD.menu],
  ];
  if (!bare) for (const k of ['overdrive', 'freeze', 'airstrike'] as const) list.push([k, BOOSTERS[k]]);
  return list.map(([name, r]) => {
    const h = hitArea(r, minHit(view));
    const p = fromHudSpace(a, h.x, h.y);
    return { name, r: { x: h.x, y: p.y, w: h.w, h: h.h } };
  });
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

let levels: LevelDef[] = [];
beforeAll(async () => {
  setSaveStorageForTests(null);
  levels = await loadAllLevels();
});

const downTower = (play: PlayScreen): string | null => (play.gestures as unknown as { downTowerId: string | null }).downTowerId;

function screenFor(level: LevelDef, view: View, bare: boolean): PlayScreen {
  const save = defaultSave();
  if (!bare) save.gold = 1; // AUD-U9: a first-time save draws no booster bar on levels 1–4
  const play = new PlayScreen(fakeApp(save, view), level, 1, 1);
  expect(play.bare).toBe(bare);
  return play;
}

/** Press at (x, y) and tell what took it: a HUD button, a tower, or nothing (a HUD press on no button). */
function pressAt(play: PlayScreen, x: number, y: number): string {
  play.down({ id: 1, x, y, timeMs: 0 });
  const press = pressOf(play);
  const took = press?.kind === 'world' ? `tower:${downTower(play) ?? '-'}` : press?.kind === 'hud' ? `hud:${press.button ?? '-'}` : `other:${press?.kind}`;
  play.cancel();
  return took;
}

/** What the rule says (x, y) is: a HUD tap area first, then a tower within the reach, else nothing. */
function expected(play: PlayScreen, view: View, areas: { name: string; r: Rect }[], x: number, y: number): string {
  const a = hudAnchors(view);
  const top = HUD.mapTop + a.top;
  const bottom = HUD.mapBottom + a.bottom;
  const inBand = y < top || y > bottom;
  if (!inBand) {
    const t = hitTower(play.state, x, y, TOWER_HIT_RADIUS, (px, py) => ({ x: px, y: py, s: 1 }));
    return `tower:${t ? t.id : '-'}`;
  }
  const hud = areas.find((h) => inside(h.r, x, y));
  if (hud) return `hud:${hud.name}`;
  if (y < top - BAND_TOWER_REACH || y > bottom + BAND_TOWER_REACH) return 'hud:-';
  const t = hitTower(play.state, x, y, TOWER_HIT_RADIUS, (px, py) => ({ x: px, y: py, s: 1 }));
  return t ? `tower:${t.id}` : 'hud:-';
}

describe('AUD-U19: towers at the map edge keep their hit area under the HUD bands', () => {
  it('the probe: level 25 at 360 — the home disc reaches into the bottom band, and a press there beside the booster bar takes it', () => {
    const view = viewFor(PHONES[0]!);
    const level = levels.find((l) => l.id === 25)!;
    const play = screenFor(level, view, false);
    const home = play.state.towers.home ?? Object.values(play.state.towers).sort((a, b) => b.y - a.y)[0]!;
    expect(home.y + TOWER_HIT_RADIUS, 'the disc reaches under the band').toBeGreaterThan(HUD.mapBottom);
    // in the band, above the booster tap areas (their 88-tall areas start at 1186): before AUD-U19 this was a HUD press
    expect(pressAt(play, home.x, HUD.mapBottom + 3)).toBe(`tower:${home.id}`);
    // on FREEZE's tap area the button keeps the press
    const freeze = hudAreas(view, false).find((h) => h.name === 'freeze')!;
    if (inside(freeze.r, home.x, HUD.mapBottom + 20)) expect(pressAt(play, home.x, HUD.mapBottom + 20)).toBe('hud:freeze');
  });

  for (const phone of PHONES) {
    it(`${phone.name}: every level — each tower's disc takes a press at its lowest point (and its top) unless a HUD rect covers it`, () => {
      const view = viewFor(phone);
      let checked = 0;
      let inBand = 0;
      for (const level of levels) {
        for (const bare of level.id < 5 ? [true, false] : [false]) {
          const play = screenFor(level, view, bare);
          const areas = hudAreas(view, bare);
          for (const t of Object.values(play.state.towers)) {
            for (const y of [t.y + TOWER_HIT_RADIUS - 0.5, t.y - TOWER_HIT_RADIUS + 0.5]) {
              const want = expected(play, view, areas, t.x, y);
              const a = hudAnchors(view);
              const band = y > HUD.mapBottom + a.bottom || y < HUD.mapTop + a.top;
              const covered = want.startsWith('hud:') && want !== 'hud:-';
              const past = y > HUD.mapBottom + a.bottom + BAND_TOWER_REACH || y < HUD.mapTop + a.top - BAND_TOWER_REACH;
              if (band) inBand++;
              if (!covered && !past) expect(want, `level ${level.id} ${t.id} y ${y}: the model gives the tower`).toMatch(/^tower:/);
              expect(pressAt(play, t.x, y), `level ${level.id}${bare ? ' (bare)' : ''} ${t.id} at y ${y}`).toBe(want);
              checked++;
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(400);
      if (phone.bottom === 0) expect(inBand, 'some discs do reach under a band at 360').toBeGreaterThan(0);
    });

    it(`${phone.name}: every level — the 30 px strips: HUD tap areas keep every pixel, the rest presses the tower under it or nothing`, () => {
      const view = viewFor(phone);
      const a = hudAnchors(view);
      const rows: number[] = [];
      for (let d = 0.5; d < BAND_TOWER_REACH + 2; d += 3) rows.push(HUD.mapBottom + a.bottom + d, HUD.mapTop + a.top - d);
      let hudPixels = 0;
      let towerPixels = 0;
      for (const level of levels) {
        for (const bare of level.id < 5 ? [true, false] : [false]) {
          const play = screenFor(level, view, bare);
          const areas = hudAreas(view, bare);
          for (const y of rows) {
            for (let x = 2; x < 720; x += 8) {
              const want = expected(play, view, areas, x, y);
              if (want.startsWith('hud:') && want !== 'hud:-') hudPixels++;
              if (want.startsWith('tower:')) towerPixels++;
              expect(pressAt(play, x, y), `level ${level.id}${bare ? ' (bare)' : ''} at ${x},${y}`).toBe(want);
            }
          }
        }
      }
      expect(hudPixels).toBeGreaterThan(0);
      if (phone.bottom === 0) expect(towerPixels, 'the rule gives towers band pixels at 360').toBeGreaterThan(0);
    });
  }
});
