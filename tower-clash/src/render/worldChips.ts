import type { GameState } from '../sim/types';
import { C } from '../sim/constants';
import type { Palette } from './palette';
import type { Camera } from './camera';
import { BADGE_MIN_SCALE, proj } from './camera';
import { HUD, WORLD_ZOOM } from './layout';
import { badgeSize, drawBadge } from './sprites';
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
 * While the lesson card covers the top of the play band (the first 8 s, hud.ts `lessonCardLayout`),
 * badges — and so their chips — are clamped below it (`badgeMinY`), which on 9:16 is where a far
 * tower's badge used to hide (on taller phones the card sits above the far shore and nothing moves).
 *
 * Everything is in the logical frame at projected points; the layout (`placeChips`) is pure.
 */

/** Stream chip at scale 1: 46 × 24, fully rounded; its centre sits 1 px under the badge centre. */
export const STREAM_CHIP = Object.freeze({ w: 46, h: 24, r: 12, dy: 1 });
/** Mine charge chip: a badge pill at this fraction of the badge scale, this far (map px × depth) over the mine. */
export const MINE_CHIP = Object.freeze({ scale: 0.72, rise: 30 });
/** Clear space (logical px) kept between a chip and any badge / chip. */
export const CHIP_GAP = 3;
/** A chip slides up at most this many of its own heights (further and it would leave its badge / mine). */
export const CHIP_MAX_SLIDE = 1.5;
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
 * HUD). Free: inside the map's width and the play band, CARD_CLEAR from the card's clay edge,
 * CHIP_GAP from every badge placed so far.
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
    r.x >= 0 &&
    r.x + r.w <= C.MAP_W &&
    r.y + r.h / 2 >= HUD.mapTop + 26 &&
    r.y + r.h <= HUD.mapBottom - 8 &&
    !(block && overlaps(r, block, CARD_CLEAR)) &&
    !taken.some((t) => overlaps(r, t, CHIP_GAP));
  for (const b of order) {
    const minY = badgeMinY(cardBottom, b.bs);
    if (clampedOntoTower(b.naturalY, minY, b.bs)) rest.push(b);
    else put(b, at(b, b.x - b.w / 2, Math.max(minY, b.naturalY)), 'above');
  }
  for (const b of rest) {
    const minY = badgeMinY(cardBottom, b.bs);
    const clamped: [Rect, BadgeSide] = [at(b, b.x - b.w / 2, Math.max(minY, b.naturalY)), 'above'];
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
}

/**
 * Slide `r` up over whatever it overlaps (the highest such rect, again and again) until it is free.
 * Null when that takes more than `maxSlide` or would put it above `minTop`.
 */
function slideUp(r: Rect, taken: readonly Rect[], minTop: number, maxSlide: number, gap: number): Rect | null {
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
 * Collision nudge (pure): `fixed` rects (badges) never move; each chip, in order, takes the first free
 * spot of: its preferred rect slid up by the overlap, then (stream chips) the right of its badge slid
 * up the same way, then (ART-24) the right and then the left of the rect blocking it, slid up the same
 * way; with none free it keeps its preferred rect. Placed chips block later ones.
 * Returns one rect per request, in order.
 */
export function placeChips(fixed: readonly Rect[], chips: readonly ChipRequest[], minTop: number, gap = CHIP_GAP): Rect[] {
  const taken: Rect[] = fixed.slice();
  const out: Rect[] = [];
  for (const c of chips) {
    const maxSlide = c.rect.h * CHIP_MAX_SLIDE;
    let placed = slideUp(c.rect, taken, minTop, maxSlide, gap);
    if (!placed && c.badge) placed = slideUp({ ...c.rect, x: c.badge.x + c.badge.w + gap }, taken, minTop, maxSlide, gap);
    if (!placed) {
      // ART-24: zoomed badges are taller than a chip can slide (a mine just above a keep put its charge
      // chip on the keep's count, levels 40 / 50): beside whatever blocks it, right then left
      const block = taken.find((t) => overlaps(c.rect, t, gap));
      if (block) {
        // only spots on the map's width (a chip never leaves the screen)
        for (const x of [block.x + block.w + gap, block.x - gap - c.rect.w]) {
          if (placed || x < 0 || x + c.rect.w > C.MAP_W) continue;
          placed = slideUp({ ...c.rect, x }, taken, minTop, maxSlide, gap);
        }
      }
    }
    const r = placed ?? c.rect;
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

/** The rect of a badge for `text` centred on (x, y) at scale `bs` (sprites.ts `badgeSize`). */
export function badgeBox(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bs: number, underFire: boolean): BadgeBox {
  const { w, h } = badgeSize(ctx, text, bs, underFire);
  return { rect: { x: x - w / 2, y: y - h / 2, w, h }, bs };
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
 * Mine charge chips and (while `streams`) the stream chips of every streaming tower, laid out against
 * `badges` (this frame's badge rects by tower id) and drawn over them. `minTop`: no chip slides above
 * this screen y (the top band, or the lesson card while it is up).
 */
export function drawWorldChips(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  state: GameState,
  cam: Camera,
  badges: ReadonlyMap<string, BadgeBox>,
  minTop: number,
  streams: boolean,
): void {
  const reqs: ChipRequest[] = [];
  const draws: ((r: Rect) => void)[] = [];
  for (const m of state.mines) {
    if (m.charges <= 0) continue;
    const p = proj(cam, m.x, m.y);
    const s = MINE_CHIP.scale * badgeScale(p.s);
    const text = String(m.charges);
    const box = badgeBox(ctx, p.x, p.y - MINE_CHIP.rise * p.s * WORLD_ZOOM.prop, text, s, false);
    reqs.push({ rect: box.rect });
    draws.push((r) => drawBadge(ctx, pal, r.x + r.w / 2, r.y + r.h / 2, text, false, { stroke: pal.mine, scale: s }));
  }
  if (streams && state.links.length) {
    const counts = new Map<string, number>();
    for (const l of state.links) counts.set(l.from, (counts.get(l.from) ?? 0) + 1);
    // far to near, then by id: a stable order whatever order the links were made in
    const ids = [...counts.keys()].filter((id) => state.towers[id] && badges.has(id));
    ids.sort((a, b) => state.towers[a]!.y - state.towers[b]!.y || (a < b ? -1 : a > b ? 1 : 0));
    for (const id of ids) {
      const b = badges.get(id)!;
      const n = counts.get(id)!;
      const tones = pal.ownerTones[state.towers[id]!.owner];
      reqs.push({ rect: streamChipRect(b.rect, b.bs), badge: b.rect });
      draws.push((r) => drawStreamChip(ctx, pal, r, b.bs, n, tones));
    }
  }
  if (reqs.length === 0) return;
  const fixed: Rect[] = [];
  for (const b of badges.values()) fixed.push(b.rect);
  const placed = placeChips(fixed, reqs, minTop);
  ctx.save();
  placed.forEach((r, i) => draws[i]!(r));
  ctx.restore();
}
