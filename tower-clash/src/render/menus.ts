import type { Owner, Road, TowerKind } from '../sim/types';
import { C } from '../sim/constants';
import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import { applyTransform } from './view';
import { drawSea, terrainSea } from './sea';
import type { Rect } from './widgets';
import { FONT, clipText, drawButton, drawExtrudedText, drawGearGlyph, drawGlyphLabel, drawPill, drawRoundButton, drawSpeakerGlyph, drawTrophyGlyph, fitFontPx, font, withShadow } from './widgets';
import type { TerrainSpec } from './terrain';
import { drawTerrain, getTerrain } from './terrain';
import type { TitleGroup, TitleShifts } from './titleLayout';
import { NO_TITLE_SHIFTS, TITLE_GROUND_BANDS, TITLE_ISLAND, titleRectShift, titleShifts } from './titleLayout';
import type { ToastOpts } from './economyWidgets';
import { drawToast, drawWallet } from './economyWidgets';
import { badgeY, drawBadge, drawCrystal, drawTowerShadow, drawTowerSprite, drawTreasureChest, drawUnitSprite, drawVideoGlyph } from './sprites';
import { roadPoseAt } from './draw';
import { prefersReducedMotion } from './particles';
import { reducedMotionOverride } from '../ui/motion';
import { t } from '../ui/i18n';

/*
 * Title and level-select visuals (ART_DIRECTION §4). Title: the game's island with three demo
 * towers and marching columns under an extruded clay logo. Level select: a long clay island with
 * a winding cream path and round level nodes that scroll under a glass header. Hit rectangles are
 * owned by src/render/layout.ts + src/ui/screens.ts and passed in.
 *
 * This module is part of the eager bundle (the title is the first frame). The level-select,
 * settings, shop and achievements drawings live in menusLevels.ts / menusSettings.ts /
 * menusShop.ts / menusAchievements.ts, which are loaded lazily with their screens (PERF-1); they
 * share `motion` from here and `beginFrame`, `headerBand`, `drawWater` from menuFrame.ts (PERF-12).
 */

interface DemoTower {
  x: number;
  y: number;
  owner: Owner;
  kind: TowerKind;
  level: number;
  units: number;
}

const DEMO_TOWERS: DemoTower[] = [
  { x: 130, y: 250, owner: 'player', kind: 'barracks', level: 2, units: 24 },
  { x: 590, y: 250, owner: 'enemy1', kind: 'fortress', level: 1, units: 18 },
  { x: 360, y: 1040, owner: 'neutral', kind: 'barracks', level: 1, units: 7 },
];

function demoRoad(towers: readonly DemoTower[], a: number, b: number): Road {
  const p = towers[a]!;
  const q = towers[b]!;
  return {
    id: `d${a}-d${b}`,
    a: `d${a}`,
    b: `d${b}`,
    points: [
      { x: p.x, y: p.y },
      { x: q.x, y: q.y },
    ],
    length: Math.hypot(q.x - p.x, q.y - p.y),
    mineHits: [],
  };
}

function demoRoads(towers: readonly DemoTower[]): Road[] {
  return [demoRoad(towers, 0, 1), demoRoad(towers, 0, 2), demoRoad(towers, 1, 2)];
}

interface DemoScene {
  towers: readonly DemoTower[];
  roads: readonly Road[];
}

const DEMO_SCENE: DemoScene = { towers: DEMO_TOWERS, roads: demoRoads(DEMO_TOWERS) };
let movedScene: { top: number; bottom: number; scene: DemoScene } | null = null;

/**
 * The demo towers where a tall screen draws them (FE-12): the two top ones move with the island's
 * top edge, the bottom one with its foot; the marching columns follow the longer roads between them.
 */
function demoScene(sh: TitleShifts): DemoScene {
  if (sh.top === 0 && sh.bottom === 0) return DEMO_SCENE;
  if (movedScene?.top !== sh.top || movedScene.bottom !== sh.bottom) {
    const towers = DEMO_TOWERS.map((t) => ({ ...t, y: t.y + (t.y < 640 ? sh.top : sh.bottom) }));
    movedScene = { top: sh.top, bottom: sh.bottom, scene: { towers, roads: demoRoads(towers) } };
  }
  return movedScene.scene;
}

const DEMO_TERRAIN: TerrainSpec = {
  key: 'title',
  seed: 42,
  obstacles: [],
  mines: [],
  towers: DEMO_TOWERS,
  top: TITLE_ISLAND.top,
  bottom: TITLE_ISLAND.bottom,
};

/** The title island re-lit by the equipped terrain theme (`TerrainSpec.theme`); memoised per theme id. */
const themedDemoTerrain = new Map<string, TerrainSpec>();
function demoTerrain(theme: string | undefined): TerrainSpec {
  if (!theme) return DEMO_TERRAIN;
  let spec = themedDemoTerrain.get(theme);
  if (!spec) {
    spec = { ...DEMO_TERRAIN, theme };
    themedDemoTerrain.set(theme, spec);
  }
  return spec;
}

/** Marching columns: (road index, forward?, owner, count, phase). */
const DEMO_COLUMNS: { road: number; forward: boolean; owner: Owner; count: number; phase: number }[] = [
  { road: 0, forward: true, owner: 'player', count: 7, phase: 0 },
  { road: 1, forward: true, owner: 'player', count: 6, phase: 0.4 },
  { road: 2, forward: true, owner: 'enemy1', count: 6, phase: 0.2 },
];

let reduced: boolean | null = null;
/** Animations allowed (reduced-motion override, else the OS media query; cached). */
export function motion(): boolean {
  const override = reducedMotionOverride();
  if (override !== null) return !override;
  if (reduced === null) reduced = prefersReducedMotion();
  return !reduced;
}

/** The demo battle's moving part (the tower shadows under it are static: `drawTitle`'s ground). */
function drawDemoWorld(ctx: CanvasRenderingContext2D, pal: Palette, nowMs: number, scene: DemoScene): void {
  const anim = motion();
  const towers = scene.towers;
  const t0 = anim ? nowMs / 1000 : 0;
  for (const col of DEMO_COLUMNS) {
    const road = scene.roads[col.road]!;
    const speed = C.UNIT_SPEED / road.length;
    for (let i = 0; i < col.count; i++) {
      const f = (((t0 * speed + col.phase + i * 0.06) % 1) + 1) % 1;
      const p = roadPoseAt(road, col.forward ? f : 1 - f);
      const s = col.forward ? 1 : -1;
      drawUnitSprite(ctx, pal, p.x, p.y, col.owner, 'infantry', p.dx * s, p.dy * s, i + col.road * 10, nowMs, anim);
    }
  }
  for (const t of towers) drawTowerSprite(ctx, pal, t, { nowMs, motion: anim });
  for (const t of towers) drawBadge(ctx, pal, t.x, t.y + badgeY(t.kind, t.level), String(t.units));
}

/* ---------- Title ---------- */

export interface DailyChestOpts {
  /** Streak reward not yet claimed today. */
  claimable: boolean;
  /** Day 1..7 of the reward on offer (or claimed today). */
  day: number;
  gold: number;
  crystals: number;
  /** Streak claimed; a rewarded video for the crystal chest is on offer instead. */
  adChest: boolean;
}

export interface TitleOpts {
  playRect: Rect;
  settingsRect: Rect;
  soundRect: Rect;
  shopRect: Rect;
  dailyRect: Rect;
  /** Trophy button (achievements screen). */
  achievementsRect: Rect;
  /** Unlocked / total achievements shown on the trophy tag. */
  achievements: { unlocked: number; total: number };
  walletRect: Rect;
  /** Language chip (I18N): rect and the code it shows ("EN"). */
  langRect: Rect;
  language: string;
  soundOn: boolean;
  totalStars: number;
  gold: number;
  crystals: number;
  daily: DailyChestOpts;
  nowMs: number;
  /** Rect currently held down (pressed look), if any. */
  pressed?: Rect | null;
  toast?: ToastOpts | null;
  /** Equipped terrain theme sprite id (`theme.*`); undefined = untinted. */
  theme?: string;
  /** The app draws over this frame (the frame-time overlay): titleIdle.ts paints it whole, every frame (AUD-Q11). */
  over?: boolean;
}

/**
 * The title island's ground (FE-12): on 9:16 the cached terrain as it is; on a taller screen cut into
 * the groups' rigid pieces, each moved by its shift, and the plain-grass bands between them stretched
 * over the room that opens (`TITLE_GROUND_BANDS`). The bands are drawn first, 2 px past each end, so
 * the rigid pieces cover their joins and no sea shows through a sub-pixel seam.
 */
function drawTitleGround(ctx: CanvasRenderingContext2D, view: View, pal: Palette, spec: TerrainSpec, sh: TitleShifts): void {
  if (sh === NO_TITLE_SHIFTS) {
    drawTerrain(ctx, view, pal, spec);
    return;
  }
  const img = getTerrain(view, pal, spec);
  const ky = img.height / C.MAP_H;
  const piece = (y0: number, y1: number, d0: number, d1: number): void => ctx.drawImage(img, 0, y0 * ky, img.width, (y1 - y0) * ky, 0, d0, C.MAP_W, d1 - d0);
  for (const b of TITLE_GROUND_BANDS) piece(b.y0 - 2, b.y1 + 2, b.y0 + sh[b.from] - 2, b.y1 + sh[b.to] + 2);
  let y = 0;
  let g: TitleGroup = 'top';
  for (const b of TITLE_GROUND_BANDS) {
    piece(y, b.y0, y + sh[g], b.y0 + sh[g]);
    y = b.y1;
    g = b.to;
  }
  piece(y, C.MAP_H, y + sh[g], C.MAP_H + sh[g]);
}

/**
 * The title frame (ART_DIRECTION §4). `parts` (AUD-Q11, bits): 1 the static ground (full-bleed sea,
 * island, tower shadows), 2 what moves (marching columns, towers, badges, the wordmark's ground shadow,
 * the daily chest), 4 the static UI, 8 the bobbing wordmark. All four on one context paint the
 * single-canvas frame call for call, in its order; titleIdle.ts `paintTitle` spreads them over the
 * ground / game / HUD canvases (the wordmark baked, titleIdle.ts `drawWord`).
 */
export function drawTitle(view: View, pal: Palette, o: TitleOpts, parts = 15, ctx = view.ctx): void {
  ctx.save();
  applyTransform(view, ctx);
  const sh = titleShifts(view);
  const scene = demoScene(sh);
  const world = parts & 2;
  const ui = parts & 4;
  if (parts & 1) {
    drawSea(ctx, view, terrainSea(pal, o.theme));
    drawTitleGround(ctx, view, pal, demoTerrain(o.theme), sh);
    for (const t of scene.towers) drawTowerShadow(ctx, pal, t.x, t.y, t.kind, t.level);
  }
  if (world) drawDemoWorld(ctx, pal, o.nowMs, scene);
  // FE-12: each group is drawn moved by its shift (a tall screen); on 9:16 the matrix is never touched
  const moved = sh !== NO_TITLE_SHIFTS;
  const base = moved ? ctx.getTransform() : null;
  const shiftTo = (dy: number): void => {
    if (!base) return;
    ctx.setTransform(base);
    if (dy) ctx.translate(0, dy);
  };
  shiftTo(sh.logo);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const anim = motion();
  const bob = anim ? Math.sin(o.nowMs / 900) * 6 : 0;
  const bob2 = anim ? Math.sin(o.nowMs / 900 + 0.8) * 6 : 0;
  const blue = pal.owners.player;
  if (world) {
    // floating logo: the ground shadow shrinks as the letters lift
    ctx.save();
    ctx.fillStyle = pal.groundShadow;
    ctx.beginPath();
    ctx.ellipse(370, 540, 250 - bob * 3, 22 - bob * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (parts & 8) {
    withShadow(
      ctx,
      () => {
        // the wordmark is the brand: Fredoka in every UI language (FONT), like the share card's header
        drawExtrudedText(ctx, 'TOWER', 360, 372 + bob, 112, { face: pal.paper, side: shade(blue, -0.25), outline: pal.ink, depth: 8, family: FONT, exempt: 'wordmark' });
        drawExtrudedText(ctx, 'CLASH', 360, 474 + bob2, 112, { face: blue, side: shade(blue, -0.45), outline: pal.ink, depth: 8, family: FONT, exempt: 'wordmark' });
      },
      14,
      18,
      0.22,
    );
  }
  if (ui) {
    const tagline = t('title.tagline');
    // AUD-U2: fitted to the 600 px pill (never squeezed), ≤ 32 px in its 46 px height
    const taglineFont = font(fitFontPx(ctx, tagline, 22, 600 - 44, '500'), '500', undefined, 32);
    ctx.font = taglineFont;
    const subW = Math.min(600, Math.max(292, ctx.measureText(tagline).width + 44));
    const sub: Rect = { x: 360 - subW / 2, y: 548, w: subW, h: 46 };
    drawPill(ctx, sub, pal.paper);
    ctx.fillStyle = pal.ink;
    ctx.font = taglineFont;
    ctx.fillText(tagline, 360, sub.y + sub.h / 2 + 1);

    shiftTo(titleRectShift(sh, o.playRect));
    drawButton(ctx, pal, o.playRect, t('title.play'), { fill: blue, fontPx: 46, pressed: o.pressed === o.playRect });

    // settings row: gear · sound
    // AUD-U2: glyph + 22 px label centred as a group, the label fitted (never squeezed; "…" only past the floor)
    drawButton(ctx, pal, o.settingsRect, '', { pressed: o.pressed === o.settingsRect });
    const rowY = (r: Rect): number => r.y + r.h / 2 - 1;
    drawGlyphLabel(ctx, o.settingsRect, t('title.settings'), 28, (cx, cy) => drawGearGlyph(ctx, pal.ink, cx, cy, 14), pal.ink, 22, 32, rowY(o.settingsRect));
    drawButton(ctx, pal, o.soundRect, '', { pressed: o.pressed === o.soundRect });
    drawGlyphLabel(ctx, o.soundRect, o.soundOn ? t('title.soundOn') : t('title.soundOff'), 32, (cx, cy) => drawSpeakerGlyph(ctx, o.soundOn ? pal.ink : pal.textDim, cx - 3, cy, 17, o.soundOn), o.soundOn ? pal.ink : pal.textDim, 22, 32, rowY(o.soundRect));

    // shop: crystal glyph + label
    drawButton(ctx, pal, o.shopRect, '', { pressed: o.pressed === o.shopRect });
    drawCrystal(ctx, pal, o.shopRect.x + 40, o.shopRect.y + o.shopRect.h / 2 - 1, 15);
    ctx.fillStyle = pal.ink;
    ctx.font = font(24);
    ctx.textAlign = 'center';
    ctx.fillText(t('title.shop'), o.shopRect.x + o.shopRect.w / 2 + 12, o.shopRect.y + o.shopRect.h / 2 - 1);
  }
  // daily reward chest (bottom-right): open + pulsing when claimable, closed once claimed. Clear of every
  // other UI rect, so it moves with the world on the game canvas, under the HUD layer (AUD-Q11).
  shiftTo(titleRectShift(sh, o.dailyRect));
  if (world) drawDailyChest(ctx, pal, o.dailyRect, o.daily, o.nowMs, o.pressed === o.dailyRect);
  if (ui) {
    // trophy (bottom-left): achievements
    drawTrophyButton(ctx, pal, o.achievementsRect, o.achievements, o.pressed === o.achievementsRect);
    // wallet footer: stars · gold · crystals (tap → shop)
    drawWallet(ctx, pal, o.walletRect, o.gold, o.crystals, { stars: o.totalStars, pressed: o.pressed === o.walletRect });
    // language chip (top-right): "EN" · tap → next language
    const lr = o.langRect;
    shiftTo(titleRectShift(sh, lr));
    drawButton(ctx, pal, lr, o.language.toUpperCase(), { fontPx: 22, flat: true, pressed: o.pressed === lr });
  }
  shiftTo(0);
  if (o.toast) drawToast(ctx, pal, o.toast);
  ctx.restore();
}


/** Treasure chest button with a "DAY n" tag and the reward on offer underneath. */
function drawDailyChest(ctx: CanvasRenderingContext2D, pal: Palette, r: Rect, d: DailyChestOpts, nowMs: number, pressed: boolean): void {
  const anim = motion();
  const hot = d.claimable || d.adChest;
  const bob = hot && anim ? Math.sin(nowMs / 320) * 3 : 0;
  const cx = r.x + r.w / 2;
  if (hot) {
    // gold pulse halo behind the chest
    const pulse = anim ? (Math.sin(nowMs / 300) + 1) / 2 : 0.5;
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.2 * pulse;
    ctx.fillStyle = pal.gold;
    ctx.beginPath();
    ctx.arc(cx, r.y + 58, 46 + pulse * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  if (pressed) ctx.translate(0, 3);
  drawTreasureChest(ctx, pal, cx, r.y + 58 + bob, 84, d.claimable);
  if (d.adChest) drawVideoGlyph(ctx, pal, cx + 30, r.y + 26 + bob, 14);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tag: Rect = { x: r.x + 6, y: r.y + r.h - 34, w: r.w - 12, h: 30 }; // AUD-U2: 116 wide (was 100) for a 22 px "ДЕНЬ 7"
  drawPill(ctx, tag, hot ? pal.gold : pal.paper, hot ? pal.goldShade : undefined, 2);
  ctx.fillStyle = pal.ink;
  const label = d.adChest ? `+${d.crystals}` : d.claimable ? t('title.day', { n: d.day }) : t('title.done');
  ctx.font = font(fitFontPx(ctx, label, 22, tag.w - (d.adChest ? 28 : 10)), 'bold', undefined, 26); // AUD-U2 (was 15 px)
  ctx.fillText(clipText(ctx, label, tag.w - (d.adChest ? 28 : 10)), tag.x + tag.w / 2 + (d.adChest ? 8 : 0), tag.y + tag.h / 2 + 1);
  if (d.adChest) drawCrystal(ctx, pal, tag.x + tag.w / 2 - 18, tag.y + tag.h / 2, 8);
}

/** Round clay button with a gold trophy and an "n/total" tag underneath (tap → achievements). */
function drawTrophyButton(ctx: CanvasRenderingContext2D, pal: Palette, r: Rect, a: { unlocked: number; total: number }, pressed: boolean): void {
  const cx = r.x + r.w / 2;
  const cy = r.y + 58;
  ctx.save();
  if (pressed) ctx.translate(0, 3);
  drawRoundButton(ctx, pal, cx, cy, 42, { pressed });
  drawTrophyGlyph(ctx, pal.gold, cx, cy - 4, 21, pal.goldShade);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tag: Rect = { x: r.x + 6, y: r.y + r.h - 34, w: r.w - 12, h: 30 }; // AUD-U2: 116 wide (was 100) for a 22 px "ДЕНЬ 7"
  const done = a.total > 0 && a.unlocked >= a.total;
  drawPill(ctx, tag, done ? pal.gold : pal.paper, done ? pal.goldShade : undefined, 2);
  ctx.fillStyle = pal.ink;
  const count = `${a.unlocked}/${a.total}`;
  ctx.font = font(fitFontPx(ctx, count, 22, tag.w - 10), 'bold', undefined, 26); // AUD-U2 (was 15 px)
  ctx.fillText(count, tag.x + tag.w / 2, tag.y + tag.h / 2 + 1);
}
