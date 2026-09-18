/**
 * Shop-only clay glyphs and the skin card preview, split out of sprites.ts so they ride in the lazy
 * shop chunk (src/ui/lazyScreens.ts) instead of the eager bundle. Same recipe as sprites.ts: three
 * tones + rim light, key light upper-left, flat blue-ink drop shadow to the lower-right. Currency
 * coins / crystals, the treasure chest and the video glyph stay in sprites.ts (HUD, title, result).
 */
import type { Palette } from './palette';
import { shade } from './palette';
import { roundRect } from './widgets';
import { drawThemeSwatch } from './terrain';
import { RIM, TAU, clayDisc, drawCrystal, drawGoldCoin, drawTowerShadow, drawTowerSprite, drawUnitSprite, poly } from './sprites';

const PILE: readonly { r: number; at: readonly (readonly [number, number])[] }[] = [
  { r: 0.5, at: [[0, 0]] },
  { r: 0.33, at: [[0.62, -0.12], [-0.62, 0.12]] },
  { r: 0.27, at: [[0, -0.6], [0.98, 0.55], [-0.98, 0.55]] },
  { r: 0.22, at: [[0, -0.8], [1.95, 0.7], [0, 0.7], [-1.95, 0.7]] },
  { r: 0.22, at: [[0.98, -0.75], [-0.98, -0.75], [1.95, 0.7], [0, 0.7], [-1.95, 0.7]] },
];

/** Pile of `count` (1–5) gold coins inside a `size` × `size` tile centred on (x, y). */
export function drawGoldPile(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, size: number, count: number): void {
  const spec = PILE[Math.max(1, Math.min(5, Math.round(count))) - 1]!;
  const r = spec.r * size;
  if (spec.at.length > 1) {
    ctx.fillStyle = pal.groundShadow;
    ctx.beginPath();
    ctx.ellipse(x + size * 0.04, y + size * 0.42, size * 0.5, size * 0.13, 0, 0, TAU);
    ctx.fill();
  }
  for (const [cx, cy] of spec.at) drawGoldCoin(ctx, pal, x + cx * r, y + cy * r, r);
}

/** Gem positions (in gem radii), tilt (radians) and radius (in `size`) for 1–5 gems. */
const CLUSTER: readonly { r: number; at: readonly (readonly [number, number, number])[] }[] = [
  { r: 0.48, at: [[0, 0, 0]] },
  { r: 0.36, at: [[-0.6, 0.1, -0.35], [0.6, 0.05, 0.3]] },
  { r: 0.3, at: [[-0.95, 0.45, -0.45], [0.95, 0.45, 0.45], [0, -0.35, 0]] },
  { r: 0.26, at: [[-1.4, 0.55, -0.55], [1.4, 0.55, 0.55], [-0.45, -0.4, -0.15], [0.55, -0.35, 0.2]] },
  { r: 0.24, at: [[-1.6, 0.7, -0.6], [1.6, 0.7, 0.6], [-0.75, 0.1, -0.3], [0.8, 0.1, 0.3], [0, -0.7, 0]] },
];

/** Cluster of `count` (1–5) crystals inside a `size` × `size` tile centred on (x, y). */
export function drawCrystalCluster(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, size: number, count: number): void {
  const spec = CLUSTER[Math.max(1, Math.min(5, Math.round(count))) - 1]!;
  const r = spec.r * size;
  if (spec.at.length > 1) {
    ctx.fillStyle = pal.groundShadow;
    ctx.beginPath();
    ctx.ellipse(x + size * 0.04, y + size * 0.42, size * 0.5, size * 0.13, 0, 0, TAU);
    ctx.fill();
  }
  for (const [cx, cy, tilt] of spec.at) {
    if (tilt === 0) {
      drawCrystal(ctx, pal, x + cx * r, y + cy * r, r);
      continue;
    }
    ctx.save();
    ctx.translate(x + cx * r, y + cy * r);
    ctx.rotate(tilt);
    drawCrystal(ctx, pal, 0, 0, r);
    ctx.restore();
  }
}

/** Paper disc with an ink television, crossed out in red: "remove ads". */
export function drawNoAdsBadge(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number): void {
  clayDisc(ctx, pal, x, y, r, { lit: '#ffffff', mid: pal.paper, shade: pal.panelBorder });
  // television: antenna, ink body, sky screen, feet
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.28, y - r * 0.62);
  ctx.lineTo(x, y - r * 0.3);
  ctx.lineTo(x + r * 0.28, y - r * 0.62);
  ctx.stroke();
  ctx.fillStyle = pal.ink;
  roundRect(ctx, { x: x - r * 0.52, y: y - r * 0.32, w: r * 1.04, h: r * 0.78 }, r * 0.12);
  ctx.fill();
  ctx.fillStyle = '#bfe8ff';
  roundRect(ctx, { x: x - r * 0.42, y: y - r * 0.22, w: r * 0.84, h: r * 0.58 }, r * 0.08);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  roundRect(ctx, { x: x - r * 0.4, y: y - r * 0.2, w: r * 0.3, h: r * 0.18 }, r * 0.05);
  ctx.fill();
  ctx.fillStyle = pal.ink;
  ctx.fillRect(x - r * 0.3, y + r * 0.46, r * 0.14, r * 0.1);
  ctx.fillRect(x + r * 0.16, y + r * 0.46, r * 0.14, r * 0.1);
  // prohibition ring + slash (shade offset under it for the clay lift)
  const ring = (dx: number, dy: number, color: string): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, r * 0.17);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, r * 0.78, 0, TAU);
    ctx.moveTo(x + dx - r * 0.55, y + dy - r * 0.55);
    ctx.lineTo(x + dx + r * 0.55, y + dy + r * 0.55);
    ctx.stroke();
  };
  ring(r * 0.04, r * 0.07, shade(pal.forbid, -0.35));
  ring(0, 0, pal.forbid);
  ctx.strokeStyle = RIM;
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, Math.PI * 0.95, Math.PI * 1.5);
  ctx.stroke();
}

/** Gold clay crown on a blue disc: the premium bundle. */
export function drawCrownBadge(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number): void {
  clayDisc(ctx, pal, x, y, r, pal.ownerTones.player);
  const g = pal.goldTones;
  const crown: readonly (readonly [number, number])[] = [
    [-0.6, 0.4],
    [-0.6, -0.35],
    [-0.28, -0.05],
    [0, -0.6],
    [0.28, -0.05],
    [0.6, -0.35],
    [0.6, 0.4],
  ];
  ctx.lineJoin = 'round';
  // shade copy offset, then mid, then the lit left third
  ctx.fillStyle = g.shade;
  poly(ctx, crown, x + r * 0.05, y + r * 0.1, r);
  ctx.fill();
  ctx.fillStyle = g.mid;
  poly(ctx, crown, x, y, r);
  ctx.fill();
  ctx.fillStyle = g.lit;
  poly(ctx, [[-0.6, 0.4], [-0.6, -0.35], [-0.28, -0.05], [-0.1, -0.4], [-0.14, 0.4]], x, y, r);
  ctx.fill();
  ctx.fillStyle = g.shade;
  poly(ctx, [[0.6, 0.4], [0.6, -0.35], [0.4, -0.15], [0.42, 0.4]], x, y, r);
  ctx.fill();
  // base band
  ctx.fillStyle = g.shade;
  ctx.fillRect(x - r * 0.6, y + r * 0.22, r * 1.2, r * 0.18);
  ctx.fillStyle = g.lit;
  ctx.fillRect(x - r * 0.6, y + r * 0.2, r * 1.2, r * 0.05);
  // pearls on the points and a crystal in the band
  ctx.fillStyle = g.lit;
  for (const px of [-0.6, 0, 0.6]) {
    ctx.beginPath();
    ctx.arc(x + px * r, y + (px === 0 ? -0.6 : -0.35) * r, r * 0.09, 0, TAU);
    ctx.fill();
  }
  drawCrystal(ctx, pal, x, y + r * 0.03, r * 0.16);
  ctx.strokeStyle = RIM;
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.57, y + r * 0.3);
  ctx.lineTo(x - r * 0.57, y - r * 0.3);
  ctx.stroke();
}

/**
 * Skin card preview inside a `size` × `size` tile centred on (x, y). `roof.*` ids draw a player
 * L2 barracks wearing that roof; `helmet.*` ids draw a large player soldier wearing that helmet;
 * `theme.*` ids draw a miniature island in that theme with a player barracks and two soldiers on
 * it. Unknown ids fall back to the default of their family.
 */
export function drawSkinPreview(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, size: number, skinId: string): void {
  ctx.save();
  if (skinId.startsWith('helmet.')) {
    const s = size / 30;
    ctx.translate(x + size * 0.02, y + size * 0.36);
    ctx.scale(s, s);
    drawUnitSprite(ctx, pal, 0, 0, 'player', 'infantry', 1, 0, 0, 0, false, 1, skinId);
  } else if (skinId.startsWith('unit.')) {
    // a soldier and a tank side by side, since the silhouette skin reshapes both
    const s = size / 40;
    ctx.translate(x - size * 0.2, y + size * 0.36);
    ctx.scale(s, s);
    drawUnitSprite(ctx, pal, 0, 0, 'player', 'infantry', 1, 0, 0, 0, false, 1, skinId);
    drawUnitSprite(ctx, pal, 21, -2, 'player', 'tank', 1, 0, 1, 0, false, 1, skinId);
  } else if (skinId.startsWith('theme.')) {
    drawThemeSwatch(ctx, pal, x, y, size, skinId);
    const s = size / 250;
    ctx.translate(x - size * 0.1, y + size * 0.2);
    ctx.scale(s, s);
    drawTowerShadow(ctx, pal, 0, 0, 'barracks');
    drawTowerSprite(ctx, pal, { x: 0, y: 0, owner: 'player', kind: 'barracks', level: 1 }, { nowMs: 0, motion: false });
    drawUnitSprite(ctx, pal, 58, 26, 'player', 'infantry', 1, 0, 1, 0, false, 1.6);
    drawUnitSprite(ctx, pal, 84, 14, 'player', 'infantry', 1, 0, 2, 0, false, 1.6);
  } else {
    // an L2 barracks (storey ledge + banner) so the roof reads at its full size
    const s = size / 150;
    ctx.translate(x + size * 0.06, y + size * 0.42);
    ctx.scale(s, s);
    drawTowerShadow(ctx, pal, 0, 0, 'barracks', 2);
    drawTowerSprite(ctx, pal, { x: 0, y: 0, owner: 'player', kind: 'barracks', level: 2 }, { nowMs: 0, motion: false, skin: { roof: skinId } });
  }
  ctx.restore();
}
