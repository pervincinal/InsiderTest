import type { Owner } from '../sim/types';
import type { Palette } from './palette';
import type { Rect } from './widgets';
import type { BurstHost, MarksLayout, MarksState } from './particles';

/*
 * AUD-U17 (ART_DIRECTION §badges): ownership by shape, not colour only. Roof, flag, badge rim and stream
 * share the owner colour, and in grayscale the mint enemy and a neutral tower matched (L 0.41 vs 0.37) —
 * the colour-blind set fixes dichromacy, not low vision or achromatopsia. Every tower badge carries an
 * emblem on the middle of its top rim: the player a five-point star, enemy k (enemy1..3) k round pips,
 * neutral none (a plain rim). The emblem is filled with whichever of paper / ink stands further from the
 * rim's owner shade in luminance (≥ 3:1 whatever the tone set) and edged in the other, so it reads in
 * grayscale on every rim. It sits on the rim line, above the numerals' cap height: the pill and its
 * numeral box are those of `badgeSize` / `drawBadge` (AUD-U2 floor untouched). Drawn by the lazy
 * particlesEconomy marks hook after the badges and chips (0 eager bytes), clipped clear of the chips.
 */

export type Emblem = { kind: 'star' } | { kind: 'pips'; n: number } | null;

/** The emblem of `owner`'s badges. */
export function ownerEmblem(owner: Owner): Emblem {
  if (owner === 'player') return { kind: 'star' };
  if (owner === 'neutral') return null;
  return { kind: 'pips', n: Number(owner.slice(5)) };
}

/**
 * Emblem geometry per 36 px of pill height (the badge at 100 % text size; it scales with the pill): its
 * centre `dy` under the pill's top edge, the star's outer / inner radii, the pips' radius and pitch, and the
 * edge stroke. At 360 CSS px wide (≈ 2.5 map px per CSS px) the star is ≈ 5.5 CSS px across, a pip ≈ 3.5.
 */
export const EMBLEM = Object.freeze({ basePx: 36, dy: 1, starR: 6.6, starIn: 2.9, pipR: 3.8, pipGap: 10, edge: 1.6 });

const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};

/** WCAG contrast ratio of two #rrggbb colours (the grayscale luminance difference the emblem keeps). */
export function lumContrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Fill and edge of `owner`'s emblem: paper or ink, whichever is further from the rim (the owner shade). */
export function emblemTones(pal: Palette, owner: Owner): { fill: string; edge: string; rim: string } {
  const rim = pal.ownerTones[owner].shade;
  const paper = lumContrast(pal.paper, rim) >= lumContrast(pal.ink, rim);
  return { fill: paper ? pal.paper : pal.ink, edge: paper ? pal.ink : pal.paper, rim };
}

/** Bounds of the emblem `drawOwnerEmblem` draws on the pill `r` (its edge stroke included), or null. */
export function emblemBox(r: Rect, owner: Owner): Rect | null {
  const e = ownerEmblem(owner);
  if (!e) return null;
  const k = r.h / EMBLEM.basePx;
  const cx = r.x + r.w / 2;
  const cy = r.y + EMBLEM.dy * k;
  const pad = (EMBLEM.edge / 2) * k;
  if (e.kind === 'star') {
    const R = EMBLEM.starR * k;
    const hw = R * Math.sin((2 * Math.PI) / 5) + pad;
    return { x: cx - hw, y: cy - R - pad, w: 2 * hw, h: R + R * Math.cos(Math.PI / 5) + 2 * pad };
  }
  const half = ((e.n - 1) / 2) * EMBLEM.pipGap * k + EMBLEM.pipR * k + pad;
  return { x: cx - half, y: cy - EMBLEM.pipR * k - pad, w: 2 * half, h: 2 * (EMBLEM.pipR * k + pad) };
}

/** `owner`'s emblem on the top rim of the badge pill `r` (nothing for a neutral tower). */
export function drawOwnerEmblem(ctx: CanvasRenderingContext2D, pal: Palette, owner: Owner, r: Rect): void {
  const e = ownerEmblem(owner);
  if (!e) return;
  const k = r.h / EMBLEM.basePx;
  const cx = r.x + r.w / 2;
  const cy = r.y + EMBLEM.dy * k;
  const { fill, edge } = emblemTones(pal, owner);
  ctx.beginPath();
  if (e.kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const rad = (i % 2 ? EMBLEM.starIn : EMBLEM.starR) * k;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
  } else {
    for (let i = 0; i < e.n; i++) {
      const x = cx + (i - (e.n - 1) / 2) * EMBLEM.pipGap * k;
      ctx.moveTo(x + EMBLEM.pipR * k, cy);
      ctx.arc(x, cy, EMBLEM.pipR * k, 0, Math.PI * 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.lineJoin = 'round';
  ctx.lineWidth = EMBLEM.edge * k;
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * Every tower's emblem on its placed badge (`layout.badges`, following the under-fire jolt like the
 * booster tint), clipped clear of the chips so a chip stacked over a badge keeps its edge.
 */
export function drawOwnerEmblems(host: Pick<BurstHost, 'badgeHit'>, ctx: CanvasRenderingContext2D, pal: Palette, state: Pick<MarksState, 'towers'>, layout: Pick<MarksLayout, 'badges' | 'chips'>, nowMs: number): void {
  ctx.save();
  if (layout.chips.length) {
    ctx.beginPath();
    ctx.rect(-1e4, -1e4, 2e4, 2e4);
    for (const { rect: c } of layout.chips) ctx.rect(c.x - 1, c.y - 1, c.w + 2, c.h + 2);
    ctx.clip('evenodd');
  }
  for (const id in state.towers) {
    const t = state.towers[id]!;
    const b = layout.badges.get(id);
    if (b) drawOwnerEmblem(ctx, pal, t.owner, { ...b.rect, x: b.rect.x + host.badgeHit(id, nowMs) });
  }
  ctx.restore();
}
