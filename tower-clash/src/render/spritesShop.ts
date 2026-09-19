/**
 * Shop-only clay glyphs and the skin card preview, split out of sprites.ts so they ride in the lazy
 * shop chunk (src/ui/lazyScreens.ts) instead of the eager bundle. Same recipe as sprites.ts: three
 * tones + rim light, key light upper-left, flat blue-ink drop shadow to the lower-right. Currency
 * coins / crystals, the treasure chest and the video glyph stay in sprites.ts (HUD, title, result).
 */
import type { Palette, Tones } from './palette';
import { shade, themeFor, themedBiome } from './palette';
import { drawBoltGlyph, roundRect } from './widgets';
import { drawBush, drawDots, makeRng } from './terrain';
import type { UpgradeKind } from './sprites';
import { RIM, TAU, clayDisc, cone, drawCrystal, drawGoldCoin, drawTowerShadow, drawTowerSprite, drawUnitSprite, poly } from './sprites';

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

/* ---------- theme swatch (moved from terrain.ts: only the shop preview draws it) ---------- */
/* ---------- shop swatch ---------- */

/**
 * Miniature island inside a rounded `size` × `size` tile centred on (x, y), coloured by a theme
 * (`drawSkinPreview` for `theme.*` ids): water, island bevel, one road, a bush, the theme's
 * sparkles / specks and its ambient wash. Sprites are added by the caller so they stay untinted.
 */
export function drawThemeSwatch(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, size: number, themeId: string): void {
  const theme = themeFor(themeId);
  const biome = themedBiome(pal.biomes.grass, theme, 'grass');
  const half = size / 2;
  const rad = size * 0.16;
  const rng = makeRng(77);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - half + rad, y - half);
  ctx.arcTo(x + half, y - half, x + half, y + half, rad);
  ctx.arcTo(x + half, y + half, x - half, y + half, rad);
  ctx.arcTo(x - half, y + half, x - half, y - half, rad);
  ctx.arcTo(x - half, y - half, x + half, y - half, rad);
  ctx.closePath();
  ctx.clip();
  const g = ctx.createLinearGradient(0, y - half, 0, y + half);
  g.addColorStop(0, theme.waterTop);
  g.addColorStop(1, theme.waterBottom);
  ctx.fillStyle = g;
  ctx.fillRect(x - half, y - half, size, size);
  // island: drop shadow, foam, cliff bands, grass lip, plateau
  const ix = x;
  const iy = y + size * 0.1;
  const irx = size * 0.4;
  const iry = size * 0.26;
  const cliff = size * 0.07;
  const blob = (dy: number, color: string, k = 1): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(ix, iy + dy, irx * k, iry * k, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(cliff + size * 0.06, pal.groundShadow, 1.04);
  ctx.strokeStyle = pal.foam;
  ctx.lineWidth = size * 0.03;
  ctx.beginPath();
  ctx.ellipse(ix, iy + cliff, irx, iry, 0, 0, Math.PI * 2);
  ctx.stroke();
  blob(cliff, shade(biome.cliff.shade, -0.28));
  blob(cliff * 0.66, biome.cliff.shade);
  blob(cliff * 0.3, biome.cliff.lit);
  blob(size * 0.012, biome.grass.shade);
  blob(0, biome.grass.mid);
  ctx.fillStyle = biome.grass.lit;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(ix - irx * 0.3, iy - iry * 0.3, irx * 0.45, iry * 0.4, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // road across the island
  const road: { x: number; y: number }[] = [
    { x: ix - irx * 0.75, y: iy + iry * 0.35 },
    { x: ix - irx * 0.2, y: iy - iry * 0.1 },
    { x: ix + irx * 0.35, y: iy + iry * 0.05 },
    { x: ix + irx * 0.8, y: iy - iry * 0.35 },
  ];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  road.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = biome.path.shade;
  ctx.lineWidth = size * 0.1;
  ctx.stroke();
  ctx.strokeStyle = biome.path.lit;
  ctx.lineWidth = size * 0.072;
  ctx.stroke();
  drawBush(ctx, pal, biome.bush, ix + irx * 0.45, iy + iry * 0.5, size * 0.07);
  drawDots(ctx, biome.dots, ix - irx * 0.55, iy - iry * 0.3, rng);
  // sparkles on the water, specks on the island (static: the shop never animates them)
  ctx.fillStyle = theme.waterSparkle;
  for (let i = 0; i < 7; i++) {
    const sx = x - half + rng() * size;
    const sy = y - half + (i < 4 ? rng() * size * 0.16 : size * 0.86 + rng() * size * 0.1);
    ctx.fillRect(sx, sy, size * 0.06, size * 0.014);
  }
  if (theme.glow) {
    ctx.fillStyle = theme.glow;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(ix + (rng() - 0.5) * irx * 1.5, iy + (rng() - 0.5) * iry * 1.5, size * 0.012 + rng() * size * 0.01, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (theme.ambient) {
    ctx.fillStyle = theme.ambient;
    ctx.fillRect(x - half, y - half, size, size);
  }
  ctx.restore();
}

/* ---------- upgrade glyphs (moved from sprites.ts: only the level map and the shop draw them) ---------- */
/** Small cone-roof icon (level tiles, legend). */
export function drawRoofIcon(ctx: CanvasRenderingContext2D, pal: Palette, color: string, x: number, y: number, s: number): void {
  const st = pal.stoneTones;
  ctx.fillStyle = st.mid;
  ctx.fillRect(x - s * 0.5, y - s * 0.2, s, s * 0.9);
  ctx.fillStyle = st.shade;
  ctx.fillRect(x + s * 0.15, y - s * 0.2, s * 0.35, s * 0.9);
  ctx.fillStyle = st.lit;
  ctx.fillRect(x - s * 0.5, y - s * 0.2, s * 0.2, s * 0.9);
  cone(ctx, { lit: shade(color, 0.3), mid: color, shade: shade(color, -0.3) }, x, y - s * 0.2, y - s * 1.1, s * 0.7, s * 0.2);
}

/** Small gold "+" bubble (upper-right of an upgrade glyph). */
function plusBubble(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number): void {
  const g = pal.goldTones;
  ctx.fillStyle = g.shade;
  ctx.beginPath();
  ctx.arc(x + r * 0.08, y + r * 0.12, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = g.mid;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(1.5, r * 0.28);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y);
  ctx.lineTo(x + r * 0.5, y);
  ctx.moveTo(x, y - r * 0.5);
  ctx.lineTo(x, y + r * 0.5);
  ctx.stroke();
}

/** Thick clay arrow pointing up (shade offset, mid, lit edge). */
function upArrow(ctx: CanvasRenderingContext2D, tones: Tones, x: number, y: number, r: number): void {
  const pts: readonly (readonly [number, number])[] = [
    [0, -0.5],
    [0.5, 0.05],
    [0.2, 0.05],
    [0.2, 0.5],
    [-0.2, 0.5],
    [-0.2, 0.05],
    [-0.5, 0.05],
  ];
  ctx.lineJoin = 'round';
  ctx.fillStyle = tones.shade;
  poly(ctx, pts, x + r * 0.08, y + r * 0.12, r);
  ctx.fill();
  ctx.fillStyle = tones.mid;
  poly(ctx, pts, x, y, r);
  ctx.fill();
  ctx.fillStyle = tones.lit;
  poly(ctx, [[0, -0.5], [-0.5, 0.05], [-0.2, 0.05], [-0.2, 0.5], [-0.05, 0.5], [-0.05, -0.2]], x, y, r);
  ctx.fill();
}

/**
 * Commander upgrade icons on a paper disc: production = cog with a gold up-arrow, capacity = tower
 * with a "+" bubble, garrison = three soldiers, booster = gold bolt, speed = double chevron.
 */
export function drawUpgradeGlyph(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number, kind: UpgradeKind): void {
  clayDisc(ctx, pal, x, y, r, { lit: '#ffffff', mid: pal.paper, shade: pal.panelBorder });
  const blue = pal.ownerTones.player;
  switch (kind) {
    case 'production': {
      // cog: 8 teeth as thick radial strokes, shade copy offset, then the wheel
      const m = pal.metal;
      const teeth = (dx: number, dy: number, color: string): void => {
        ctx.strokeStyle = color;
        ctx.lineWidth = r * 0.26;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + Math.PI / 8;
          ctx.moveTo(x + dx + Math.cos(a) * r * 0.42, y + dy + Math.sin(a) * r * 0.42);
          ctx.lineTo(x + dx + Math.cos(a) * r * 0.66, y + dy + Math.sin(a) * r * 0.66);
        }
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r * 0.5, 0, TAU);
        ctx.fill();
      };
      teeth(r * 0.06, r * 0.1, m.shade);
      teeth(0, 0, m.mid);
      ctx.strokeStyle = m.lit;
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.42, Math.PI * 0.9, Math.PI * 1.6);
      ctx.stroke();
      ctx.fillStyle = pal.paper;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.3, 0, TAU);
      ctx.fill();
      upArrow(ctx, pal.goldTones, x, y, r * 0.5);
      break;
    }
    case 'capacity':
      drawRoofIcon(ctx, pal, blue.mid, x - r * 0.12, y + r * 0.2, r * 0.62);
      plusBubble(ctx, pal, x + r * 0.42, y - r * 0.4, r * 0.26);
      break;
    case 'garrison': {
      const s = r / 17;
      drawUnitSprite(ctx, pal, x - r * 0.42, y + r * 0.42, 'player', 'infantry', 1, 0, 1, 0, false, s);
      drawUnitSprite(ctx, pal, x + r * 0.42, y + r * 0.42, 'player', 'infantry', 1, 0, 2, 0, false, s);
      drawUnitSprite(ctx, pal, x, y + r * 0.55, 'player', 'infantry', 1, 0, 3, 0, false, s);
      break;
    }
    case 'booster':
      drawBoltGlyph(ctx, pal.gold, x + r * 0.05, y + r * 0.1, r * 0.62, pal.goldShade);
      drawBoltGlyph(ctx, pal.gold, x, y, r * 0.62, pal.goldShade);
      break;
    case 'speed': {
      // double chevron: shade copy, mid, thin lit edge
      const chev = (dx: number, dy: number, color: string, wdt: number): void => {
        ctx.strokeStyle = color;
        ctx.lineWidth = wdt;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (const ox of [-0.42, 0.1]) {
          ctx.moveTo(x + dx + ox * r, y + dy - r * 0.45);
          ctx.lineTo(x + dx + (ox + 0.4) * r, y + dy);
          ctx.lineTo(x + dx + ox * r, y + dy + r * 0.45);
        }
        ctx.stroke();
      };
      chev(r * 0.06, r * 0.1, blue.shade, r * 0.26);
      chev(0, 0, blue.mid, r * 0.26);
      chev(-r * 0.04, -r * 0.05, blue.lit, r * 0.08);
      break;
    }
  }
}
