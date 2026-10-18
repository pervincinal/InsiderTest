import type { GameState } from '../sim/types';
import { C } from '../sim/constants';
import type { Palette } from './palette';
import type { Camera } from './camera';
import { FLAT } from './camera';
import type { HudAnchors, View } from './view';
import { hudAnchors } from './view';
import { HUD, TOWER_RADIUS, WORLD_ZOOM } from './layout';
import type { Rect } from './widgets';
import { font, roundRect } from './widgets';
import type { PlayUi } from './draw';
import { playLayout } from './draw';
import { lessonCardLayout, selectHintPill, selectHintShown } from './hud';
import type { WorldLayout } from './worldChips';
import { CARD_CLEAR, CHIP_GAP, frameWorldLayout, selectedFootprint } from './worldChips';
import type { TutorialStep } from '../ui/tutorial';
import { streamMidpoint } from '../ui/tutorial';

/*
 * GD-5c (GDD §3.11 d): where the first-play tutorial's bubble goes. The ring pulses on the step's
 * tower (or on a stream's ribbon, GD-5a); an arrow points at it from a speech bubble with the hint.
 * The bubble + arrow never cover another tower's badge, stream / mine chip or drawn body, nor the
 * target's own badge (BUG-35) — the frame's own layout (draw.ts `worldLayout`: `placeBadges`,
 * `placeChips`, `towerBodyRect`) and the select hint pill are the obstacles, CHIP_GAP clear, for the
 * whole span the bubble bobs over. Candidates, first clear one wins:
 *   above    the arrow points down at the badge (today's spot), one line, two when it is wider than the map;
 *   beside   on the roomier side first, then the other: the arrow points sideways at the body's middle,
 *            the text wrapped to the fewest lines that fit that side;
 *   below    under the base (or the badge flipped below it), arrow up, when that stays above the HUD band;
 *   slid     above again, the bubble slid sideways off what it covers (the arrow stays on the target),
 *            in one line and then two; then the same below;
 * and with none clear, the candidate that intrudes least. The text is never squeezed: every line is
 * measured at the hint size and the bubble is that wide plus its padding. Both cameras use this one
 * placement (the obstacles are projected); `drawTutorialBubble` paints it. A lazy chunk: the play
 * screen reaches it through ./tutorialDraw.ts.
 */

/** The bubble's metrics (logical px). */
export const TUTORIAL_BUBBLE = Object.freeze({
  /** Hint text size, and the line pitch / vertical padding of a wrapped bubble. */
  px: 24,
  lineH: 30,
  padY: 12,
  /** One-line bubble height. */
  h1: 56,
  /** Text inset from either side: the text slot is the bubble's width less twice this. */
  padX: 22,
  radius: 14,
  /** Arrow: head length and half width, then a stem (`stem` long, `stemHalf` half wide) and a gap before the bubble. */
  arrowH: 38,
  arrowHalf: 20,
  stem: 12,
  stemHalf: 7,
  stemGap: 4,
  /** The arrow tip stops this far short of the target's body / badge / ring. */
  tipGap: 8,
  /** The bubble and arrow bob this far away from the target with the ring's pulse. */
  bob: 8,
  /** Kept from the map's left / right edges, and from the top / bottom of the play band. */
  edge: 12,
  bandGap: 6,
  maxLines: 3,
  /** Ring radius on a stream anchor's ribbon (the ribbon is 13 px wide, its glow 21) and its pulse. */
  laneRing: 26,
  lanePulse: 6,
});

const B = TUTORIAL_BUBBLE;
/** From the arrow tip to the bubble's edge along the arrow. */
const REACH = B.arrowH + B.stem + B.stemGap;

/** What the arrow points at: the ring's centre, the box it must stay `tipGap` off, and the height a side arrow aims at. */
export interface BubbleTarget {
  x: number;
  y: number;
  /** A tower: its drawn body with its own badge; a stream: the ring. */
  core: Rect;
  cy: number;
}

export type BubbleSide = 'above' | 'right' | 'left' | 'below' | 'slid-above' | 'slid-below' | 'lifted';

/** A placed bubble (at rest: the pulse moves it up to `bob` px further from the target along `dir`). */
export interface BubblePlace {
  side: BubbleSide;
  rect: Rect;
  lines: string[];
  /** Widest measured line; the text slot is `rect.w − 2 × padX`. */
  textW: number;
  tip: { x: number; y: number };
  /** Unit direction the arrow points (bubble → target). */
  dir: { x: number; y: number };
  /** From the tip to the bubble's edge along the arrow (REACH; longer for a lifted bubble: the stem stretches). */
  reach: number;
  /** The bubble, the arrow's head and its stem, each swept over the bob. */
  hull: Rect[];
  /** 0 when clear of every obstacle and inside the band; else the deepest intrusion, logical px. */
  fault: number;
}

/** The play band the bubble stays in (logical frame): under the top HUD band or the lesson card's clay edge, above the bottom band, inside the map. */
export function tutorialBand(a: HudAnchors, card: Rect | null): { top: number; bottom: number } {
  return {
    top: card ? card.y + card.h + 4 + CARD_CLEAR : Math.max(0, HUD.mapTop + a.top) + B.bandGap,
    bottom: Math.min(C.MAP_H, HUD.mapBottom + a.bottom) - B.bandGap,
  };
}

/** `text` split at spaces into `n` lines with the narrowest widest line (balanced); measured at the current font. */
function balanced(ctx: CanvasRenderingContext2D, words: readonly string[], n: number): { lines: string[]; w: number } {
  const width = (from: number, to: number): number => ctx.measureText(words.slice(from, to).join(' ')).width;
  if (n === 1) return { lines: [words.join(' ')], w: width(0, words.length) };
  let best: { lines: string[]; w: number } | null = null;
  for (let i = 1; i < words.length; i++) {
    if (n === 2) {
      const w = Math.max(width(0, i), width(i, words.length));
      if (!best || w < best.w) best = { lines: [words.slice(0, i).join(' '), words.slice(i).join(' ')], w };
      continue;
    }
    for (let j = i + 1; j < words.length; j++) {
      const w = Math.max(width(0, i), width(i, j), width(j, words.length));
      if (!best || w < best.w) best = { lines: [words.slice(0, i).join(' '), words.slice(i, j).join(' '), words.slice(j).join(' ')], w };
    }
  }
  return best ?? { lines: [words.join(' ')], w: width(0, words.length) };
}

/** The fewest lines (from `min`, at most `maxLines`) whose widest line fits `maxW`, or null. Expects the hint font set. */
export function fitLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, min = 1): { lines: string[]; w: number } | null {
  const words = text.split(' ').filter(Boolean);
  for (let n = min; n <= Math.min(B.maxLines, words.length); n++) {
    const fit = balanced(ctx, words, n);
    if (fit.w <= maxW) return fit;
  }
  return null;
}

/** Bubble height for `n` lines. */
const heightOf = (n: number): number => (n <= 1 ? B.h1 : n * B.lineH + 2 * B.padY);

/** Bounding rect of points. */
function boxOf(pts: readonly { x: number; y: number }[]): Rect {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** `r` stretched `d` px against `dir` (the span it bobs over). */
function swept(r: Rect, dir: { x: number; y: number }, d: number): Rect {
  return { x: r.x - Math.max(0, dir.x) * d, y: r.y - Math.max(0, dir.y) * d, w: r.w + Math.abs(dir.x) * d, h: r.h + Math.abs(dir.y) * d };
}

/** The box of the arrow part from `u0` to `u1` px back from the tip, `half` wide each side. */
function arrowPart(tip: { x: number; y: number }, dir: { x: number; y: number }, u0: number, u1: number, half: number): Rect {
  const px = -dir.y;
  const py = dir.x;
  return boxOf(
    [u0, u1].flatMap((u) => [
      { x: tip.x - dir.x * u + px * half, y: tip.y - dir.y * u + py * half },
      { x: tip.x - dir.x * u - px * half, y: tip.y - dir.y * u - py * half },
    ]),
  );
}

/** How deep `a` (grown by `gap`) overlaps `b`: > 0 = intrudes by that much (the smaller of the two axis overlaps), else 0. */
function intrusion(a: Rect, b: Rect, gap: number): number {
  const ox = Math.min(a.x + a.w + gap, b.x + b.w) - Math.max(a.x - gap, b.x);
  const oy = Math.min(a.y + a.h + gap, b.y + b.h) - Math.max(a.y - gap, b.y);
  return ox > 0 && oy > 0 ? Math.min(ox, oy) : 0;
}

type Draft = Omit<BubblePlace, 'hull' | 'fault'>;

/** The arrow's head and stem at rest for a bubble `reach` px from the tip. */
export function arrowParts(tip: { x: number; y: number }, dir: { x: number; y: number }, reach: number): [Rect, Rect] {
  return [arrowPart(tip, dir, 0, B.arrowH, B.arrowHalf), arrowPart(tip, dir, B.arrowH, reach - B.stemGap, B.stemHalf)];
}

/** A draft's bob hull and fault against `obstacles` and the band; Infinity when the arrow's stem misses the bubble. */
function settle(d: Draft, obstacles: readonly Rect[], band: { top: number; bottom: number }): BubblePlace {
  const hull = [d.rect, ...arrowParts(d.tip, d.dir, d.reach)].map((r) => swept(r, d.dir, B.bob));
  const inset = B.radius + B.stemHalf;
  // the stem meets the bubble's straight edge (not its rounded corner)
  const meets = d.dir.x === 0 ? d.tip.x >= d.rect.x + inset && d.tip.x <= d.rect.x + d.rect.w - inset : d.tip.y >= d.rect.y + inset && d.tip.y <= d.rect.y + d.rect.h - inset;
  let fault = meets ? 0 : Infinity;
  for (const h of hull) {
    fault = Math.max(fault, band.top - h.y, h.y + h.h - band.bottom, -h.x, h.x + h.w - C.MAP_W);
    for (const o of obstacles) fault = Math.max(fault, intrusion(h, o, CHIP_GAP));
  }
  // the bubble keeps its margin from the map's sides
  fault = Math.max(fault, B.edge - d.rect.x, d.rect.x + d.rect.w - (C.MAP_W - B.edge));
  return { ...d, hull, fault: Math.max(0, fault) };
}

const clampX = (x: number, w: number): number => Math.max(B.edge, Math.min(C.MAP_W - B.edge - w, x));

/**
 * Where the bubble for `text` goes around `target` (pure apart from measuring; sets the hint font on
 * `ctx`): the first clear candidate of the order above, else the least intruding one. `obstacles`:
 * every badge, chip and drawn body of the frame (the target's own included) and the select hint pill;
 * `band`: `tutorialBand`.
 */
export function placeTutorialBubble(ctx: CanvasRenderingContext2D, text: string, target: BubbleTarget, obstacles: readonly Rect[], band: { top: number; bottom: number }): BubblePlace {
  ctx.font = font(B.px);
  // drawn every frame while a step shows: the search runs again only when its inputs move (the font follows the language)
  const key = `${ctx.font}|${text}|${JSON.stringify([target, obstacles, band])}`;
  if (lastPlace?.key === key) return lastPlace.place;
  const place = searchBubble(ctx, text, target, obstacles, band);
  lastPlace = { key, place };
  return place;
}

let lastPlace: { key: string; place: BubblePlace } | null = null;

function searchBubble(ctx: CanvasRenderingContext2D, text: string, target: BubbleTarget, obstacles: readonly Rect[], band: { top: number; bottom: number }): BubblePlace {
  const t = target;
  const core = t.core;
  const maxText = C.MAP_W - 2 * B.edge - 2 * B.padX;
  // never null for the game's texts (≤ 3 lines of the map's width); a single line otherwise, as wide as it is
  const full = fitLines(ctx, text, maxText) ?? { lines: [text], w: ctx.measureText(text).width };
  // the bubble is a whole number of px wider than its widest line plus the padding: the text never squeezes
  const widthOf = (fit: { w: number }): number => Math.ceil(fit.w) + 2 * B.padX;
  const vertical = (fit: { lines: string[]; w: number }, up: boolean, side: BubbleSide, x?: number, reach = REACH): Draft => {
    const w = widthOf(fit);
    const h = heightOf(fit.lines.length);
    const tip = { x: t.x, y: up ? core.y - B.tipGap : core.y + core.h + B.tipGap };
    return { side, rect: { x: x ?? clampX(t.x - w / 2, w), y: up ? tip.y - reach - h : tip.y + reach, w, h }, lines: fit.lines, textW: fit.w, tip, dir: { x: 0, y: up ? 1 : -1 }, reach };
  };
  const beside = (right: boolean): Draft | null => {
    const tipX = right ? core.x + core.w + B.tipGap : core.x - B.tipGap;
    const room = right ? C.MAP_W - B.edge - (tipX + REACH) : tipX - REACH - B.edge;
    const fit = fitLines(ctx, text, room - 2 * B.padX - 1);
    if (!fit) return null;
    const w = widthOf(fit);
    const h = heightOf(fit.lines.length);
    const y = Math.max(band.top, Math.min(band.bottom - h, t.cy - h / 2));
    return { side: right ? 'right' : 'left', rect: { x: right ? tipX + REACH : tipX - REACH - w, y, w, h }, lines: fit.lines, textW: fit.w, tip: { x: tipX, y: t.cy }, dir: { x: right ? -1 : 1, y: 0 }, reach: REACH };
  };
  /** One line, and (when that is one line) two: a narrower bubble slides into smaller gaps. */
  const fits = [full];
  if (full.lines.length === 1) {
    const two = fitLines(ctx, text, maxText, 2);
    if (two) fits.push(two);
  }
  /** Bubble x spots for a slide: centred, the map's margins, and just past each obstacle, nearest to the centred spot first. */
  const slideXs = (w: number, from: number): number[] => {
    const xs = [from, B.edge, C.MAP_W - B.edge - w];
    for (const o of obstacles) xs.push(o.x + o.w + CHIP_GAP + 0.5, o.x - CHIP_GAP - 0.5 - w);
    return [...new Set(xs.map((x) => clampX(x, w)))].sort((p, q) => Math.abs(p - from) - Math.abs(q - from));
  };
  const tried: BubblePlace[] = [];
  const attempt = (d: Draft | null): BubblePlace | null => {
    if (!d) return null;
    const p = settle(d, obstacles, band);
    tried.push(p);
    return p.fault === 0 ? p : null;
  };
  const roomRight = C.MAP_W - (core.x + core.w);
  const roomLeft = core.x;
  const sides = roomRight >= roomLeft ? [true, false] : [false, true];
  const found =
    attempt(vertical(full, true, 'above')) ??
    attempt(beside(sides[0]!)) ??
    attempt(beside(sides[1]!)) ??
    attempt(vertical(full, false, 'below')) ??
    slide(true) ??
    slide(false) ??
    lift();
  if (found) return found;
  return tried.reduce((a, b) => (b.fault < a.fault ? b : a));

  /** Above (below) with the bubble slid sideways off what it covers (the arrow stays on the target); one line, then two. */
  function slide(up: boolean): BubblePlace | null {
    for (const fit of fits) {
      const from = vertical(fit, up, 'above').rect.x;
      for (const x of slideXs(widthOf(fit), from)) {
        const p = attempt(vertical(fit, up, up ? 'slid-above' : 'slid-below', x));
        if (p) return p;
      }
    }
    return null;
  }

  /**
   * Last: above, the bubble lifted over the badges standing level with it (a row of towers either side
   * of a stream's ring), the arrow's stem stretched up to `maxLift` px; centred, then slid; one line,
   * then two. Only the bubble moves: an arrow that is itself blocked is not helped.
   */
  function lift(): BubblePlace | null {
    for (const fit of fits) {
      const from = vertical(fit, true, 'lifted').rect.x;
      for (const x of slideXs(widthOf(fit), from)) {
        let reach = REACH;
        for (let i = 0; i < 6 && reach - REACH <= MAX_LIFT; i++) {
          const d = vertical(fit, true, 'lifted', x, reach);
          if (reach > REACH) {
            const p = attempt(d);
            if (p) return p;
          }
          // the lowest top edge among what the bubble covers: lift its bottom CHIP_GAP over it
          const hit = obstacles.filter((o) => intrusion(swept(d.rect, d.dir, B.bob), o, CHIP_GAP) > 0);
          if (!hit.length) break;
          reach = Math.max(reach + 1, d.tip.y - (Math.min(...hit.map((o) => o.y)) - CHIP_GAP - 0.5));
        }
      }
    }
    return null;
  }
}

/** Longest stretch of a lifted bubble's stem beyond its normal reach, logical px. */
const MAX_LIFT = 140;

/** One obstacle of the tutorial layout, labelled for the guard (`tower`: whose it is; a hint pill has none). */
export interface BubbleObstacle {
  rect: Rect;
  kind: 'badge' | 'chip' | 'body' | 'hint';
  tower?: string;
}

/**
 * Everything the bubble keeps clear of this frame: every badge, chip and drawn body of `layout` (the
 * `selected` tower's with its selection ring, worldChips.ts `selectedFootprint`), and the select hint
 * pill (`hint`, when shown).
 */
export function bubbleObstacles(layout: WorldLayout, hint: Rect | null, selected: { id: string; footprint: Rect } | null = null): BubbleObstacle[] {
  const out: BubbleObstacle[] = [];
  for (const [id, b] of layout.badges) out.push({ rect: b.rect, kind: 'badge', tower: id });
  for (const c of layout.chips) out.push({ rect: c.rect, kind: 'chip', tower: c.tower });
  for (const [id, r] of layout.bodies) out.push({ rect: id === selected?.id ? selected.footprint : r, kind: 'body', tower: id });
  if (hint) out.push({ rect: hint, kind: 'hint' });
  return out;
}

/** The tutorial's whole layout for `step` this frame: ring, target and the placed bubble. */
export interface TutorialLayout {
  /** Ring centre (projected) and depth scale; `lane`: on a stream's ribbon. */
  ring: { x: number; y: number; k: number; lane: boolean };
  tower: string;
  target: BubbleTarget;
  obstacles: BubbleObstacle[];
  place: BubblePlace;
}

/**
 * The tutorial layout (pure apart from measuring): `layout` is the frame's world layout, `card` the
 * lesson card (logical frame, null when gone), `hint` the select hint pill (null when not shown), `a`
 * the HUD band anchors. Null when the step's tower does not exist.
 */
export function tutorialLayout(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  step: Pick<TutorialStep, 'text' | 'towerId' | 'anchor'>,
  layout: WorldLayout,
  card: Rect | null,
  hint: Rect | null,
  a: HudAnchors,
  cam: Camera,
  selectedId: string | null = null,
): TutorialLayout | null {
  const id = typeof step.towerId === 'function' ? step.towerId(state) : step.towerId;
  const tower = state.towers[id];
  if (!tower) return null;
  const selTower = selectedId ? state.towers[selectedId] : undefined;
  const selBody = selectedId ? layout.bodies.get(selectedId) : undefined;
  const selected = selTower && selBody ? { id: selTower.id, footprint: selectedFootprint(selBody, cam.proj(selTower.x, selTower.y)) } : null;
  // GD-5a: a stream anchor puts the ring on the ribbon's lane midpoint (the tower while the stream is gone)
  const lane = streamMidpoint(state, step.anchor);
  const at = lane ? cam.proj(lane.x, lane.y) : cam.proj(tower.x, tower.y);
  let target: BubbleTarget;
  if (lane) {
    const r = (B.laneRing + B.lanePulse + 3) * at.s;
    target = { x: at.x, y: at.y, core: { x: at.x - r, y: at.y - r, w: 2 * r, h: 2 * r }, cy: at.y };
  } else {
    const drawn = layout.bodies.get(id) ?? { x: at.x - TOWER_RADIUS * WORLD_ZOOM.tower * at.s, y: at.y - 2 * TOWER_RADIUS * at.s, w: 2 * TOWER_RADIUS * WORLD_ZOOM.tower * at.s, h: 2 * TOWER_RADIUS * at.s };
    // a selected target: the arrow stops short of its selection ring as well
    const body = selected?.id === id ? selected.footprint : drawn;
    const badge = layout.badges.get(id)?.rect;
    const x0 = Math.min(body.x, badge?.x ?? body.x);
    const y0 = Math.min(body.y, badge?.y ?? body.y);
    const x1 = Math.max(body.x + body.w, badge ? badge.x + badge.w : 0);
    const y1 = Math.max(body.y + body.h, badge ? badge.y + badge.h : 0);
    target = { x: at.x, y: at.y, core: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, cy: drawn.y + drawn.h / 2 };
  }
  const obstacles = bubbleObstacles(layout, hint, selected);
  const place = placeTutorialBubble(
    ctx,
    step.text,
    target,
    obstacles.map((o) => o.rect),
    tutorialBand(a, card),
  );
  return { ring: { x: at.x, y: at.y, k: at.s, lane: lane !== null }, tower: id, target, obstacles, place };
}

/**
 * Draw the ring, arrow and hint for `step` (the play screen, after `drawGame` and with the logical-map
 * transform active). The world layout is the frame's (`frameWorldLayout`, laid out again when the
 * frame did not keep one); the lesson card and the select hint pill are those `drawHud` draws.
 */
export function drawTutorialBubble(ctx: CanvasRenderingContext2D, state: GameState, view: View, ui: PlayUi, step: TutorialStep, nowMs: number, cam: Camera = FLAT): void {
  const pal: Palette = ui.palette;
  const a = hudAnchors(view);
  const lc = lessonCardLayout(ctx, state, ui);
  const card = lc ? { ...lc.rect, y: lc.rect.y + a.top } : null;
  const shown = selectHintShown(ui);
  const kept = frameWorldLayout(state);
  const { layout, hint } = kept
    ? { layout: kept, hint: shown && ui.selectedTowerId ? selectHintPill(ctx, state, ui.selectedTowerId, a, card, cam, kept) : null }
    : playLayout(ctx, state, cam, ui.selectedTowerId, card, a, ui.outcome === 'playing', shown);
  const L = tutorialLayout(ctx, state, step, layout, card, hint, a, cam, ui.selectedTowerId);
  if (!L) return;
  const pulse = (Math.sin(nowMs / 220) + 1) / 2; // 0..1
  const { ring, place } = L;
  const ringR = ring.lane ? (B.laneRing + pulse * B.lanePulse) * ring.k : (TOWER_RADIUS + 16 + pulse * 10) * ring.k * WORLD_ZOOM.tower;

  ctx.save();
  ctx.strokeStyle = pal.star;
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.55 + 0.45 * (1 - pulse);
  ctx.beginPath();
  ctx.arc(ring.x, ring.y, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // the arrow and the bubble bob away from the target with the pulse
  const { dir } = place;
  const bob = pulse * B.bob;
  const tip = { x: place.tip.x - dir.x * bob, y: place.tip.y - dir.y * bob };
  const r = { ...place.rect, x: place.rect.x - dir.x * bob, y: place.rect.y - dir.y * bob };
  // arrow: head then stem, in the arrow's frame (u back from the tip, v across)
  const px = -dir.y;
  const py = dir.x;
  const pt = (u: number, v: number): [number, number] => [tip.x - dir.x * u + px * v, tip.y - dir.y * u + py * v];
  const back = place.reach - B.stemGap;
  ctx.fillStyle = pal.star;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  for (const [u, v] of [
    [B.arrowH, -B.arrowHalf],
    [B.arrowH, -B.stemHalf],
    [back, -B.stemHalf],
    [back, B.stemHalf],
    [B.arrowH, B.stemHalf],
    [B.arrowH, B.arrowHalf],
  ] as const)
    ctx.lineTo(...pt(u, v));
  ctx.closePath();
  ctx.fill();

  roundRect(ctx, r, B.radius);
  ctx.fillStyle = pal.panel;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = pal.star;
  ctx.stroke();
  ctx.fillStyle = pal.text;
  ctx.font = font(B.px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = place.lines.length;
  place.lines.forEach((line, i) => ctx.fillText(line, r.x + r.w / 2, n === 1 ? r.y + r.h / 2 + 1 : r.y + B.padY + B.lineH * (i + 0.5) + 1));
  ctx.restore();
}
