import type { Owner, Road, TowerKind } from '../sim/types';
import { C } from '../sim/constants';
import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import { applyTransform, bleed } from './view';
import type { SeaColors } from './sea';
import { drawSea, menuSea, terrainSea } from './sea';
import type { Rect } from './widgets';
import { FONT, drawButton, drawExtrudedText, drawGearGlyph, drawPill, drawRoundButton, drawSpeakerGlyph, drawTrophyGlyph, font, withShadow } from './widgets';
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
 * share `beginFrame`, `drawWater` and `motion` from here.
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

/**
 * Full-bleed sea (BUG-34) + logical transform; the caller ends the frame with `ctx.restore()`. No map
 * clip: the screen's content may run on into the margins of a tall / wide screen (the level map's
 * path, the shop list), which `toLogical` maps linearly, so whatever shows there is tappable too.
 */
export function beginFrame(view: View, pal: Palette, sea: SeaColors = menuSea(pal)): CanvasRenderingContext2D {
  const ctx = view.ctx;
  ctx.save();
  applyTransform(view);
  drawSea(ctx, view, sea);
  return ctx;
}

/** A menu's glass header band of layout height `h`, grown up to the screen's top edge and across its width (BUG-34). */
export function headerBand(view: View, h: number): Rect {
  const b = bleed(view);
  const pad = b.right > C.MAP_W ? 1 / (view.scale > 0 ? view.scale : 1) : 0;
  return { x: b.left, y: b.top, w: b.right - b.left + pad, h: h - b.top };
}

function drawDemoWorld(ctx: CanvasRenderingContext2D, pal: Palette, nowMs: number, withBadges: boolean, scene: DemoScene = DEMO_SCENE): void {
  const anim = motion();
  const towers = scene.towers;
  for (const t of towers) drawTowerShadow(ctx, pal, t.x, t.y, t.kind, t.level);
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
  if (withBadges) for (const t of towers) drawBadge(ctx, pal, t.x, t.y + badgeY(t.kind, t.level), String(t.units));
}

/** Gradient water with drifting sparkles (menus background; `scroll` parallaxes the sparkles). */
export function drawWater(ctx: CanvasRenderingContext2D, pal: Palette, nowMs: number, scroll: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, C.MAP_H);
  g.addColorStop(0, pal.waterTop);
  g.addColorStop(1, pal.waterBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
  // drifting sparkle dots (parallax: half the scroll speed)
  const drift = motion() ? nowMs / 1000 : 0;
  ctx.fillStyle = pal.waterSparkle;
  for (let i = 0; i < 26; i++) {
    const seed = i * 97.31;
    const x = ((seed * 7.3 + drift * (6 + (i % 4) * 3)) % 760) - 20;
    const y = (((seed * 3.7 - scroll * 0.5) % 1320) + 1320) % 1320 - 20;
    const w = 10 + (i % 3) * 6;
    ctx.beginPath();
    ctx.ellipse(x, y, w, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
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

export function drawTitle(view: View, pal: Palette, o: TitleOpts): void {
  const ctx = beginFrame(view, pal, terrainSea(pal, o.theme));
  const sh = titleShifts(view);
  drawTitleGround(ctx, view, pal, demoTerrain(o.theme), sh);
  drawDemoWorld(ctx, pal, o.nowMs, true, demoScene(sh));
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
  // floating logo: the ground shadow shrinks as the letters lift
  ctx.save();
  ctx.fillStyle = pal.groundShadow;
  ctx.beginPath();
  ctx.ellipse(370, 540, 250 - bob * 3, 22 - bob * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  withShadow(
    ctx,
    () => {
      // the wordmark is the brand: Fredoka in every UI language (FONT), like the share card's header
      drawExtrudedText(ctx, 'TOWER', 360, 372 + bob, 112, { face: pal.paper, side: shade(blue, -0.25), outline: pal.ink, depth: 8, family: FONT });
      drawExtrudedText(ctx, 'CLASH', 360, 474 + bob2, 112, { face: blue, side: shade(blue, -0.45), outline: pal.ink, depth: 8, family: FONT });
    },
    14,
    18,
    0.22,
  );
  const tagline = t('title.tagline');
  ctx.font = font(22, '500');
  const subW = Math.min(600, Math.max(292, ctx.measureText(tagline).width + 44));
  const sub: Rect = { x: 360 - subW / 2, y: 548, w: subW, h: 46 };
  drawPill(ctx, sub, pal.paper);
  ctx.fillStyle = pal.ink;
  ctx.font = font(22, '500');
  ctx.fillText(tagline, 360, sub.y + sub.h / 2 + 1, subW - 24);

  shiftTo(titleRectShift(sh, o.playRect));
  drawButton(ctx, pal, o.playRect, t('title.play'), { fill: blue, fontPx: 46, pressed: o.pressed === o.playRect });

  // settings row: gear · sound
  drawButton(ctx, pal, o.settingsRect, '', { pressed: o.pressed === o.settingsRect });
  drawGearGlyph(ctx, pal.ink, o.settingsRect.x + 38, o.settingsRect.y + o.settingsRect.h / 2 - 1, 14);
  ctx.textAlign = 'left';
  ctx.fillStyle = pal.ink;
  ctx.font = font(19);
  ctx.fillText(t('title.settings'), o.settingsRect.x + 68, o.settingsRect.y + o.settingsRect.h / 2 - 1, o.settingsRect.w - 78);
  drawButton(ctx, pal, o.soundRect, '', { pressed: o.pressed === o.soundRect });
  drawSpeakerGlyph(ctx, o.soundOn ? pal.ink : pal.textDim, o.soundRect.x + 38, o.soundRect.y + o.soundRect.h / 2 - 1, 17, o.soundOn);
  ctx.fillStyle = o.soundOn ? pal.ink : pal.textDim;
  ctx.font = font(19);
  ctx.fillText(o.soundOn ? t('title.soundOn') : t('title.soundOff'), o.soundRect.x + 68, o.soundRect.y + o.soundRect.h / 2 - 1, o.soundRect.w - 78);

  // shop: crystal glyph + label
  drawButton(ctx, pal, o.shopRect, '', { pressed: o.pressed === o.shopRect });
  drawCrystal(ctx, pal, o.shopRect.x + 40, o.shopRect.y + o.shopRect.h / 2 - 1, 15);
  ctx.fillStyle = pal.ink;
  ctx.font = font(24);
  ctx.textAlign = 'center';
  ctx.fillText(t('title.shop'), o.shopRect.x + o.shopRect.w / 2 + 12, o.shopRect.y + o.shopRect.h / 2 - 1);

  // daily reward chest (bottom-right): open + pulsing when claimable, closed once claimed
  shiftTo(titleRectShift(sh, o.dailyRect));
  drawDailyChest(ctx, pal, o.dailyRect, o.daily, o.nowMs, o.pressed === o.dailyRect);
  // trophy (bottom-left): achievements
  drawTrophyButton(ctx, pal, o.achievementsRect, o.achievements, o.pressed === o.achievementsRect);

  // wallet footer: stars · gold · crystals (tap → shop)
  drawWallet(ctx, pal, o.walletRect, o.gold, o.crystals, { stars: o.totalStars, pressed: o.pressed === o.walletRect });
  // language chip (top-right): "EN" · tap → next language
  const lr = o.langRect;
  shiftTo(titleRectShift(sh, lr));
  drawButton(ctx, pal, lr, o.language.toUpperCase(), { fontPx: 19, flat: true, pressed: o.pressed === lr });
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
  const tag: Rect = { x: r.x + 14, y: r.y + r.h - 34, w: r.w - 28, h: 30 };
  drawPill(ctx, tag, hot ? pal.gold : pal.paper, hot ? pal.goldShade : undefined, 2);
  ctx.fillStyle = pal.ink;
  ctx.font = font(15);
  const label = d.adChest ? `+${d.crystals}` : d.claimable ? t('title.day', { n: d.day }) : t('title.done');
  ctx.fillText(label, tag.x + tag.w / 2 + (d.adChest ? 8 : 0), tag.y + tag.h / 2 + 1, tag.w - 8);
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
  const tag: Rect = { x: r.x + 14, y: r.y + r.h - 34, w: r.w - 28, h: 30 };
  const done = a.total > 0 && a.unlocked >= a.total;
  drawPill(ctx, tag, done ? pal.gold : pal.paper, done ? pal.goldShade : undefined, 2);
  ctx.fillStyle = pal.ink;
  ctx.font = font(15);
  ctx.fillText(`${a.unlocked}/${a.total}`, tag.x + tag.w / 2, tag.y + tag.h / 2 + 1, tag.w - 8);
}
