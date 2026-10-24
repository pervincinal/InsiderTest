import type { GameState, Tower } from '../sim/types';
import { C } from '../sim/constants';
import type { Palette } from './palette';
import type { Camera } from './camera';
import { BADGE_MIN_SCALE, proj } from './camera';
import { HUD, TOWER_RADIUS, WORLD_ZOOM } from './layout';
import { towerFootprintRadius, towerTop } from './sprites';
import type { Rect } from './widgets';
import { font, roundRect } from './widgets';

/*
 * ART-22: the small chips standing on the world next to the badges — the stream count "→ n" left of
 * a streaming tower's badge (rules v2) and the charge count over a live mine — and where they go.
 *
 * Under the ART-21 camera badges shrink with depth (floored at BADGE_MIN_SCALE so numerals stay
 * ≥ 24 px); the chips used to keep their full size, so a far tower's stream chip reached into a
 * neighbouring mine chip (level 24, top right). Now every chip takes its badge's scale (same floor),
 * a stream chip is anchored to the drawn badge's left edge (measured, so a three-digit or under-fire
 * badge pushes it out instead of being overlapped), and a simple collision nudge runs once per frame:
 * badges stay where they are; each chip in turn, if it overlaps a badge or a chip placed before it,
 * slides up by the overlap (repeatedly, at most 1.5 chip heights and never above `minTop`), and a
 * stream chip whose left side is blocked tries the right of its badge the same way. Mine chips are
 * placed before stream chips, so a stream starting or stopping never moves a mine's chip.
 *
 * ART-26: a mine chip is not a badge — a small spiked-disc mine glyph with the charge on a dark tag
 * beside it (`drawMineChip`), and when a tower badge sits level with the mine (within one chip height
 * above or below the mine's point, in the chip's column; level 24's side mines under the side towers'
 * badges, level 45's mine over the guns) the chip goes beside the mine at the mine's height — right of
 * the mine and that badge, then left — instead of stacking over the badge like a second count.
 *
 * While the lesson card covers the top of the play band (the first 8 s, hud.ts `lessonCardLayout`),
 * badges — and so their chips — are clamped below it (`badgeMinY`), which on 9:16 is where a far
 * tower's badge used to hide (on taller phones the card sits above the far shore and nothing moves).
 *
 * Everything is in the logical frame at projected points; the layout (`placeChips`) is pure.
 */

/** Stream chip at scale 1: 46 × 24, fully rounded; its centre sits 1 px under the badge centre. */
export const STREAM_CHIP = Object.freeze({ w: 46, h: 24, r: 12, dy: 1 });
/**
 * Mine charge chip (ART-26): drawn at `scale` × the badge scale, centred this far (map px × depth × the
 * prop zoom) over the mine; at its scale it is `h` tall — a spiked-disc glyph `h` across, then the
 * charge (`font` px, 900) on a tag `pad` px clear of the glyph and `2 × pad` short of the right end.
 */
export const MINE_CHIP = Object.freeze({ scale: 0.72, rise: 30, h: 36, font: 26, pad: 4 });
/** Half width of the drawn mine body (terrain.ts `drawMineBody`, rx 15) at depth 1, before the prop zoom. */
export const MINE_BODY_R = 15;
/** Clear space (logical px) kept between a chip and any badge / chip. */
export const CHIP_GAP = 3;
/** A chip slides up at most this many of its own heights (further and it would leave its badge / mine). */
export const CHIP_MAX_SLIDE = 1.5;
/**
 * BUG-56: clear margin (logical px) every badge and chip keeps from the map's left and right edges —
 * the visible frame on a 9:16 screen (stroke and shadow included). A candidate spot leaving it is skipped.
 */
export const IN_FRAME = 4;
/** Whether `r` lies inside the map's width less IN_FRAME on both sides. */
export const inFrameX = (r: Rect): boolean => r.x >= IN_FRAME && r.x + r.w <= C.MAP_W - IN_FRAME;
/** `x` for a rect `w` wide slid horizontally to lie inside the map's width less IN_FRAME. */
const slideInX = (x: number, w: number): number => Math.min(Math.max(x, IN_FRAME), C.MAP_W - IN_FRAME - w);
/** Clear space (logical px) between the lesson card's bottom edge and a clamped badge's top. */
export const CARD_CLEAR = 6;
/** The lesson card's clay bottom edge (`drawCard` edge) below its rect. */
const CARD_EDGE = 4;
/** A badge's half height at scale 1 (sprites.ts `badgeSize`). */
const BADGE_HALF_H = 18;

/** The scale a badge (and its chips) is drawn at for depth scale `s`: `s × WORLD_ZOOM.badge`, floored at BADGE_MIN_SCALE (1.15 on the flat map). */
export function badgeScale(s: number): number {
  // ART-24: × WORLD_ZOOM.badge (1.15 on the flat map); the 24 px numeral floor still holds under the camera
  return Math.max(BADGE_MIN_SCALE, s * WORLD_ZOOM.badge);
}

/**
 * Lowest screen y a badge centre may take (the top of the play band, HUD.mapTop + 26). With the lesson
 * card up (`cardBottom` = its rect's bottom in the logical frame, null when not shown), below the card
 * as well: the badge's top edge (half height × `bs`) clears the card's clay edge by CARD_CLEAR.
 */
export function badgeMinY(cardBottom: number | null, bs: number): number {
  const top = HUD.mapTop + 26;
  if (cardBottom === null) return top;
  return Math.max(top, cardBottom + CARD_EDGE + CARD_CLEAR + BADGE_HALF_H * bs);
}

/** Clear space (logical px) between a tower's plinth and a badge flipped below it, or beside it (BUG-42). */
export const BADGE_BELOW_GAP = 6;

/** Whether clamping a badge centre from `naturalY` down to `minY` moves it by more than a third of its height (it would sit on its own tower). */
function clampedOntoTower(naturalY: number, minY: number, bs: number): boolean {
  return minY - naturalY > (2 * BADGE_HALF_H * bs) / 3;
}

/**
 * ART-24: where a lone tower's badge centre goes. Normally above the roof (`naturalY`), clamped down
 * to `minY` (under the top HUD band / the lesson card). When that clamp would move it by more than a
 * third of the badge's height — a tower at the very top of the map, whose clamped badge sat on its own
 * body (level 3's foe) — the badge goes below the tower instead: `plinth` (the zoomed plinth radius,
 * logical px) under the base, plus half its height and BADGE_BELOW_GAP; unless that still leaves it
 * under the lesson card (BUG-43: a long lesson on 9:16), when it just clamps until the card goes.
 * The renderer places all of a level's badges together with `placeBadges` (this is its first and last
 * candidate); chips are laid out against wherever they land (`drawWorldChips`).
 */
export function badgeCentre(naturalY: number, minY: number, baseY: number, plinth: number, bs: number): { y: number; below: boolean } {
  const half = BADGE_HALF_H * bs;
  if (!clampedOntoTower(naturalY, minY, bs)) return { y: Math.max(minY, naturalY), below: false };
  const below = baseY + plinth + half + BADGE_BELOW_GAP;
  return below < minY ? { y: minY, below: false } : { y: below, below: true };
}

/** One tower's badge for `placeBadges`: its drawn base, badge scale and size, and where it would naturally sit. */
export interface BadgeWant {
  id: string;
  /** The tower's drawn base (projected, logical px). */
  x: number;
  y: number;
  /** The badge's scale (`badgeScale`) and size at it (sprites.ts `badgeSize`). */
  bs: number;
  w: number;
  h: number;
  /** The badge centre above the roof before any clamp (draw.ts `badgeLift` × depth). */
  naturalY: number;
  /** The zoomed plinth radius at the base, logical px. */
  plinth: number;
}

/** Which candidate a badge took (`placeBadges`); 'above' is also the clamped fallback. */
export type BadgeSide = 'above' | 'below' | 'right' | 'left';

/** A placed badge: its rect, scale and side. */
export interface BadgePlace extends BadgeBox {
  side: BadgeSide;
}

/**
 * BUG-42 / BUG-43: where every tower's badge goes this frame (pure; the renderer and the layout tests
 * share it). `card` is the lesson card's rect in the logical frame while it shows (null otherwise).
 * Badges whose above-the-roof spot is clamped by at most a third of their height stay there (first,
 * in map order: y, then id), and are obstacles for the rest. Each remaining badge, in the same order,
 * takes the first free spot of: below the base (`badgeCentre`'s flip), then beside the tower — right
 * of the base at base y (its left edge BADGE_BELOW_GAP past the plinth), then left — then the clamped
 * spot above, then (a base under the card / the top band) beside the tower at the clamped height,
 * right then left (level 36's crown on 9:16 while the card is up, whose clamped badge sat on the
 * fortress badge below it), and, with none free, the clamped spot anyway (never hidden behind the
 * HUD), slid sideways into the frame. Free: inside the map's width less IN_FRAME (BUG-56: a beside spot
 * off the frame is skipped) and the play band, CARD_CLEAR from the card's clay edge, CHIP_GAP from
 * every badge placed so far.
 */
export function placeBadges(wants: readonly BadgeWant[], card: Rect | null): Map<string, BadgePlace> {
  const cardBottom = card ? card.y + card.h : null;
  const block = card ? { x: card.x, y: card.y, w: card.w, h: card.h + CARD_EDGE } : null;
  const order = wants.slice().sort((p, q) => p.y - q.y || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  const out = new Map<string, BadgePlace>();
  const taken: Rect[] = [];
  const rest: BadgeWant[] = [];
  const put = (b: BadgeWant, rect: Rect, side: BadgeSide): void => {
    out.set(b.id, { rect, bs: b.bs, side });
    taken.push(rect);
  };
  const at = (b: BadgeWant, x: number, cy: number): Rect => ({ x, y: cy - b.h / 2, w: b.w, h: b.h });
  const free = (r: Rect): boolean =>
    inFrameX(r) &&
    r.y + r.h / 2 >= HUD.mapTop + 26 &&
    r.y + r.h <= HUD.mapBottom - 8 &&
    !(block && overlaps(r, block, CARD_CLEAR)) &&
    !taken.some((t) => overlaps(r, t, CHIP_GAP));
  for (const b of order) {
    const minY = badgeMinY(cardBottom, b.bs);
    if (clampedOntoTower(b.naturalY, minY, b.bs)) rest.push(b);
    else put(b, at(b, slideInX(b.x - b.w / 2, b.w), Math.max(minY, b.naturalY)), 'above');
  }
  for (const b of rest) {
    const minY = badgeMinY(cardBottom, b.bs);
    const clamped: [Rect, BadgeSide] = [at(b, slideInX(b.x - b.w / 2, b.w), Math.max(minY, b.naturalY)), 'above'];
    const beside = (cy: number): [Rect, BadgeSide][] => [
      [at(b, b.x + b.plinth + BADGE_BELOW_GAP, cy), 'right'],
      [at(b, b.x - b.plinth - BADGE_BELOW_GAP - b.w, cy), 'left'],
    ];
    const spots: [Rect, BadgeSide][] = [[at(b, b.x - b.w / 2, b.y + b.plinth + b.h / 2 + BADGE_BELOW_GAP), 'below'], ...beside(b.y), clamped, ...(minY > b.y ? beside(minY) : [])];
    const hit = spots.find(([r]) => free(r)) ?? clamped;
    put(b, hit[0], hit[1]);
  }
  return out;
}

/** Highest screen y a chip may slide to: the top of the badge band (HUD.mapTop + 8), or under the lesson card while it is up. */
export function chipMinTop(cardBottom: number | null): number {
  const top = HUD.mapTop + 26 - BADGE_HALF_H;
  return cardBottom === null ? top : Math.max(top, cardBottom + CARD_EDGE + CARD_CLEAR);
}

/** Where a stream chip wants to be: left of `badge` (its drawn rect) at badge scale `bs`, centred on it. */
export function streamChipRect(badge: Rect, bs: number): Rect {
  const w = STREAM_CHIP.w * bs;
  const h = STREAM_CHIP.h * bs;
  const cy = badge.y + badge.h / 2 + STREAM_CHIP.dy * bs;
  return { x: badge.x - CHIP_GAP - w, y: cy - h / 2, w, h };
}

/** Overlap of two rects, `gap` apart counting as touching. */
export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/** A chip to place: its preferred rect and, for a stream chip, the badge it belongs to (the right side is its fallback). */
export interface ChipRequest {
  rect: Rect;
  badge?: Rect;
  /** A mine chip's mine (ART-26): its drawn point and body half width, logical px. */
  mine?: { x: number; y: number; r: number };
}

/**
 * The charge chip request of a live mine at map (x, y) under `cam`: centred over the zoomed body, carrying
 * the mine for the beside rule, and its chip scale. Size: the glyph (`h` square), then the numerals and
 * three `pad`s.
 */
export function mineChipRequest(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, charges: number): { req: ChipRequest; s: number } {
  const p = proj(cam, x, y);
  const s = MINE_CHIP.scale * badgeScale(p.s);
  const k = p.s * WORLD_ZOOM.prop;
  ctx.font = font(MINE_CHIP.font, '900');
  const h = MINE_CHIP.h * s;
  const w = h + (ctx.measureText(String(charges)).width + 3 * MINE_CHIP.pad) * s;
  const cy = p.y - MINE_CHIP.rise * k;
  return { req: { rect: { x: p.x - w / 2, y: cy - h / 2, w, h }, mine: { x: p.x, y: p.y, r: MINE_BODY_R * k } }, s };
}

/**
 * ART-26: a mine chip's spots beside its mine, right then left, at the mine's height — only when a badge
 * of `fixed` sits level with the mine (overlapping, CHIP_GAP counted, the chip's column from one chip
 * height above the mine's point to one below), where the chip over the mine would stack on that badge.
 * Each spot clears the mine body and every such badge. Empty when no badge is that close.
 */
export function mineBesideSpots(c: ChipRequest, fixed: readonly Rect[], gap = CHIP_GAP): Rect[] {
  const m = c.mine;
  const { x, w, h } = c.rect;
  const near = m ? fixed.filter((b) => overlaps({ x, y: m.y - h, w, h: 2 * h }, b, gap)) : [];
  const out: Rect[] = [];
  if (m && near.length) {
    // right of the mine body and those badges, then left of them
    for (const sx of [Math.max(m.x + m.r, ...near.map((b) => b.x + b.w)) + gap, Math.min(m.x - m.r, ...near.map((b) => b.x)) - gap - w]) {
      if (sx >= IN_FRAME && sx + w <= C.MAP_W - IN_FRAME) out.push({ x: sx, y: m.y - h / 2, w, h });
    }
  }
  return out;
}

/**
 * Slide `r` up over whatever it overlaps (the highest such rect, again and again) until it is free.
 * Null when that takes more than `maxSlide` or would put it above `minTop`. BUG-56: a spot off the
 * frame's width is no candidate (null), and one starting above `minTop` (under the lesson card / the
 * moved select hint) starts at `minTop` instead.
 */
function slideUp(r0: Rect, taken: readonly Rect[], minTop: number, maxSlide: number, gap: number): Rect | null {
  if (!inFrameX(r0)) return null;
  const r = r0.y < minTop ? { ...r0, y: minTop } : r0;
  let y = r.y;
  for (let i = 0; i <= taken.length; i++) {
    const cur = { x: r.x, y, w: r.w, h: r.h };
    let hit: Rect | undefined;
    for (const t of taken) if (overlaps(cur, t, gap) && (!hit || t.y < hit.y)) hit = t;
    if (!hit) return y === r.y || (y >= minTop && r.y - y <= maxSlide) ? cur : null;
    y = hit.y - r.h - gap;
    if (y < minTop || r.y - y > maxSlide) return null;
  }
  return null;
}

/**
 * BUG-56: slide `r` down under whatever it overlaps (the lowest such rect, again and again) until it is
 * free; null when that takes more than `maxSlide`, leaves the play band or the frame's width.
 */
function slideDown(r: Rect, taken: readonly Rect[], maxSlide: number, gap: number): Rect | null {
  if (!inFrameX(r)) return null;
  let y = r.y;
  for (let i = 0; i <= taken.length; i++) {
    const cur = { x: r.x, y, w: r.w, h: r.h };
    if (cur.y + cur.h > HUD.mapBottom) return null;
    let hit: Rect | undefined;
    for (const t of taken) if (overlaps(cur, t, gap) && (!hit || t.y + t.h > hit.y + hit.h)) hit = t;
    if (!hit) return cur;
    y = hit.y + hit.h + gap;
    if (y - r.y > maxSlide) return null;
  }
  return null;
}

/**
 * Collision nudge (pure): `fixed` rects (badges) never move; each chip, in order, takes the first free
 * spot of: (ART-26, a mine chip with a badge level with its mine) beside the mine, right then left
 * (`mineBesideSpots`), slid up the same way; its preferred rect slid up by the overlap, then (stream
 * chips) the right of its badge slid up the same way, then (BUG-56) under its badge, slid down the
 * same way, then (ART-24) the right and then the left of the rect blocking it, slid up the same way;
 * with none free it keeps its preferred rect, moved into the frame and under `minTop`. Every spot lies inside the map's width less
 * IN_FRAME and no higher than `minTop` (level 37 on 360 × 640 with the select hint moved up: the far
 * barracks' badges stood beside their towers at the frame's edges, their stream chips past them).
 * Placed chips block later ones. Returns one rect per request, in order.
 */
export function placeChips(fixed: readonly Rect[], chips: readonly ChipRequest[], minTop: number, gap = CHIP_GAP): Rect[] {
  const taken: Rect[] = fixed.slice();
  const out: Rect[] = [];
  for (const c of chips) {
    const maxSlide = c.rect.h * CHIP_MAX_SLIDE;
    let placed: Rect | null = null;
    for (const r of mineBesideSpots(c, fixed, gap)) placed ??= slideUp(r, taken, minTop, maxSlide, gap);
    placed ??= slideUp(c.rect, taken, minTop, maxSlide, gap);
    if (!placed && c.badge) placed = slideUp({ ...c.rect, x: c.badge.x + c.badge.w + gap }, taken, minTop, maxSlide, gap);
    // BUG-56: a stream chip with no room level with its badge goes under it (not beside a neighbour's badge, where it reads as that one's)
    if (!placed && c.badge) placed = slideDown({ ...c.rect, x: c.badge.x + (c.badge.w - c.rect.w) / 2, y: c.badge.y + c.badge.h + gap }, taken, maxSlide, gap);
    if (!placed) {
      // ART-24: zoomed badges are taller than a chip can slide (a mine just above a keep put its charge
      // chip on the keep's count, levels 40 / 50): beside whatever blocks it, right then left
      const block = taken.find((t) => overlaps(c.rect, t, gap));
      if (block) {
        // only spots inside the frame (a chip never leaves the screen; `slideUp` skips the others)
        for (const x of [block.x + block.w + gap, block.x - gap - c.rect.w]) placed ??= slideUp({ ...c.rect, x }, taken, minTop, maxSlide, gap);
      }
    }
    const r = placed ?? { ...c.rect, x: slideInX(c.rect.x, c.rect.w), y: Math.max(c.rect.y, minTop) };
    out.push(r);
    taken.push(r);
  }
  return out;
}

/** A badge as drawn this frame (rest size, no count pop or jolt) and its scale. */
export interface BadgeBox {
  rect: Rect;
  bs: number;
}

/** A stroked "⇢" (shaft + chevron head) pointing right, centred on (cx, cy). */
export function drawStreamArrow(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, len: number, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - len / 2, cy);
  ctx.lineTo(cx + len / 2, cy);
  ctx.moveTo(cx + len / 2 - len * 0.4, cy - len * 0.4);
  ctx.lineTo(cx + len / 2, cy);
  ctx.lineTo(cx + len / 2 - len * 0.4, cy + len * 0.4);
  ctx.stroke();
}

/**
 * ART-26 mine charge chip in `r` (chip scale `s`): a spiked-disc mine glyph (two metal tones, a paper
 * sticker rim and the red lamp) on the left end of a dark ink tag with a mine-red edge carrying the
 * charge in paper numerals (≥ 12:1) — a different shape and polarity from a paper badge, so it never
 * reads as a second count on a nearby tower.
 */
export function drawMineChip(ctx: CanvasRenderingContext2D, pal: Palette, r: Rect, s: number, text: string): void {
  const R = r.h / 2;
  const gx = r.x + R;
  const gy = r.y + R;
  const th = r.h * 0.78;
  const tag = { x: gx, y: gy - th / 2, w: r.x + r.w - gx, h: th };
  const tr = th * 0.3;
  ctx.fillStyle = pal.groundShadow;
  roundRect(ctx, { ...tag, x: tag.x + s, y: tag.y + 3 * s }, tr);
  ctx.fill();
  roundRect(ctx, tag, tr);
  ctx.fillStyle = pal.ink;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = pal.mine;
  ctx.stroke();
  // the glyph: eight spikes round a disc, sticker-rimmed in paper so it reads on dark ground too
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const d = i % 2 ? R * 0.6 : R - s;
    ctx.lineTo(gx + Math.cos(a) * d, gy + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = pal.paper;
  ctx.stroke();
  ctx.fillStyle = pal.metal.shade;
  ctx.fill();
  ctx.fillStyle = pal.metal.mid;
  ctx.beginPath();
  ctx.arc(gx, gy, R * 0.64, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.mine;
  ctx.beginPath();
  ctx.arc(gx, gy, R * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.paper;
  ctx.font = font(MINE_CHIP.font * s, '900');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, (r.x + 2 * R + r.x + r.w - MINE_CHIP.pad * s) / 2, gy + s);
}

/** The "→ n" chip in `r` (scale `bs`): paper pill, owner-shade stroke, owner-tone arrow, ink count. */
function drawStreamChip(ctx: CanvasRenderingContext2D, pal: Palette, r: Rect, bs: number, n: number, tones: { mid: string; shade: string }): void {
  const rad = STREAM_CHIP.r * bs;
  ctx.fillStyle = pal.groundShadow;
  roundRect(ctx, { x: r.x + bs, y: r.y + 3 * bs, w: r.w, h: r.h }, rad);
  ctx.fill();
  roundRect(ctx, r, rad);
  ctx.fillStyle = pal.paper;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = tones.shade;
  ctx.stroke();
  const cy = r.y + r.h / 2;
  drawStreamArrow(ctx, tones.mid, r.x + 14 * bs, cy, 10 * bs, 2.5 * bs);
  ctx.fillStyle = pal.ink;
  ctx.font = font(16 * bs, '900');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), r.x + 25 * bs, cy + bs);
}

/**
 * One world chip of the frame: a live mine's charge chip (`n` charges, chip scale `s`) or a streaming
 * tower's "→ n" chip (`tower`, `n` streams, its badge's scale `s`), with its request for `placeChips`.
 */
export interface ChipSpec {
  kind: 'mine' | 'stream';
  req: ChipRequest;
  s: number;
  n: number;
  tower?: string;
}

/** A chip where `placeChips` put it this frame. */
export interface PlacedChip extends ChipSpec {
  rect: Rect;
}

/**
 * The frame's chip requests (pure apart from measuring): every live mine's charge chip, then (while
 * `streams`) a stream chip for every streaming tower with a badge in `badges`, far to near, then by id.
 */
export function worldChipSpecs(ctx: CanvasRenderingContext2D, state: GameState, cam: Camera, badges: ReadonlyMap<string, BadgeBox>, streams: boolean): ChipSpec[] {
  const out: ChipSpec[] = [];
  for (const m of state.mines) {
    if (m.charges <= 0) continue;
    const { req, s } = mineChipRequest(ctx, cam, m.x, m.y, m.charges);
    out.push({ kind: 'mine', req, s, n: m.charges });
  }
  if (streams && state.links.length) {
    const counts = new Map<string, number>();
    for (const l of state.links) counts.set(l.from, (counts.get(l.from) ?? 0) + 1);
    // far to near, then by id: a stable order whatever order the links were made in
    const ids = [...counts.keys()].filter((id) => state.towers[id] && badges.has(id));
    ids.sort((a, b) => state.towers[a]!.y - state.towers[b]!.y || (a < b ? -1 : a > b ? 1 : 0));
    for (const id of ids) {
      const b = badges.get(id)!;
      out.push({ kind: 'stream', req: { rect: streamChipRect(b.rect, b.bs), badge: b.rect }, s: b.bs, n: counts.get(id)!, tower: id });
    }
  }
  return out;
}

/** `specs` laid out against `badges` (`placeChips`); `minTop`: no chip slides above this screen y (the top band, or the lesson card while it is up). */
export function layoutWorldChips(badges: ReadonlyMap<string, BadgeBox>, specs: readonly ChipSpec[], minTop: number): PlacedChip[] {
  if (specs.length === 0) return [];
  const fixed: Rect[] = [];
  for (const b of badges.values()) fixed.push(b.rect);
  const placed = placeChips(
    fixed,
    specs.map((c) => c.req),
    minTop,
  );
  return specs.map((c, i) => ({ ...c, rect: placed[i]! }));
}

/** Draw the frame's placed chips (`layoutWorldChips`) over the badges. */
export function drawWorldChips(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, chips: readonly PlacedChip[]): void {
  if (chips.length === 0) return;
  ctx.save();
  for (const c of chips) {
    if (c.kind === 'mine') drawMineChip(ctx, pal, c.rect, c.s, String(c.n));
    else drawStreamChip(ctx, pal, c.rect, c.s, c.n, pal.ownerTones[state.towers[c.tower!]!.owner]);
  }
  ctx.restore();
}

/*
 * GD-5c / GD-5d: what stands on the world this frame, for the overlays drawn over it (the tutorial
 * bubble, the select hint) to keep clear of: every tower's placed badge, every chip, and every tower's
 * drawn body. draw.ts lays it out once per frame (`worldLayout`) and leaves it here.
 */

/** The world's badges, chips and drawn bodies of one frame (logical frame, projected). */
export interface WorldLayout {
  badges: ReadonlyMap<string, BadgePlace>;
  chips: readonly PlacedChip[];
  /** Each tower's drawn body (`towerBodyRect`). */
  bodies: ReadonlyMap<string, Rect>;
}

/**
 * A tower's drawn body standing at projected `p` (depth `s`), as a rect: the zoomed plinth's width (at
 * least TOWER_RADIUS, the round tower's), from the roof apex (`towerTop`) down to the plinth's front
 * edge (sprites.ts `plinth`: its ellipse, 0.4 × r deep, sits 2 px under the anchor). Flags and smoke
 * may poke out of it.
 */
export function towerBodyRect(kind: Tower['kind'], level: number, p: { x: number; y: number; s: number }): Rect {
  const z = WORLD_ZOOM.tower * p.s;
  const r = towerFootprintRadius(kind, level);
  const half = Math.max(r, TOWER_RADIUS) * z;
  const top = p.y - towerTop(kind, level) * z;
  return { x: p.x - half, y: top, w: 2 * half, h: p.y + (2 + 0.42 * r) * z - top };
}

/** draw.ts `selectionRing` at rest (r 54, before its 4 px pulse; the 9 px gold line, centred 10 px under the anchor): what the selected tower adds round its base. */
const SELECT_RING = Object.freeze({ r: 54, dy: 10, line: 4.5 });

/** The selected tower's drawn footprint: its body (`towerBodyRect`) and the selection ring round its base. */
export function selectedFootprint(body: Rect, p: { x: number; y: number; s: number }): Rect {
  const z = WORLD_ZOOM.tower * p.s;
  const rx = (SELECT_RING.r + SELECT_RING.line) * z;
  const bottom = p.y + (SELECT_RING.dy + SELECT_RING.r * 0.42 + SELECT_RING.line) * z;
  const x = Math.min(body.x, p.x - rx);
  return { x, y: body.y, w: Math.max(body.x + body.w, p.x + rx) - x, h: Math.max(body.y + body.h, bottom) - body.y };
}

let frameLayout: { state: GameState; time: number; layout: WorldLayout } | null = null;

/** Keep `layout` as the world layout of the frame being drawn for `state`. */
export function setFrameWorldLayout(state: GameState, layout: WorldLayout): void {
  frameLayout = { state, time: state.time, layout };
}

/** The world layout last drawn for `state` at its current time, or null (another state, or not drawn yet). */
export function frameWorldLayout(state: GameState): WorldLayout | null {
  return frameLayout && frameLayout.state === state && frameLayout.time === state.time ? frameLayout.layout : null;
}
