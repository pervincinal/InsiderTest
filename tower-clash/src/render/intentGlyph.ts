/**
 * AUD-A10 (GDD §4 "AUD-A10 2026-11-04"): the enemy personalities made visible. For the first
 * INTENT_MS of sim time each enemy's starting tower shows a small intent glyph over its badge — a
 * forward arrow (rusher, pointed at the nearest player tower), a shield (turtle), an eye
 * (opportunist) — owner-coloured with the ink outline, fading out over the last INTENT_FADE_MS
 * (reduced motion: static, then gone). The personality is the level's (`LevelDef.enemies`, the play
 * screen's level), the starting tower the level's: the one that enemy starts with the most units on
 * (first listed on a tie). Nothing shows while the lesson card holds the match (AUD-B11: `cardUp`),
 * on a starting tower that has changed hands, or on a neutral / player tower. Render only: the sim is
 * read, never changed. Lazy: drawn from the particlesEconomy chunk's `marks` hook.
 */
import type { EnemyOwner, LevelDef, Personality, Tower } from '../sim/types';
import type { BurstHost, MarksLayout } from './particles';
import type { Palette } from './palette';
import type { BadgePlace } from './worldChips';
import type { Rect } from './widgets';
import { pillPath } from './particlesEconomy';

/** How long the glyphs show (ms of sim time from the start of the match)… */
export const INTENT_MS = 5000;
/** …the last part of which they fade out over (motion only). */
export const INTENT_FADE_MS = 1000;
/** The glyph's size (px at badge scale 1) and its gap from the badge (clear of the AUD-U17 owner emblem on its top rim). */
export const INTENT_PX = 26;
export const INTENT_GAP = 8;

/** What the glyphs read of the frame's play UI (draw.ts passes its `PlayUi`; `cardUp` is the HUD's). */
export interface IntentUi {
  level: Pick<LevelDef, 'enemies' | 'towers'>;
  cardUp?: boolean;
}

export interface IntentGlyph {
  towerId: string;
  owner: EnemyOwner;
  personality: Personality;
  /** 0…1 opacity this frame. */
  alpha: number;
}

/**
 * The glyphs of this frame: one per enemy of the level on its starting tower while that tower is
 * still its own, for sim time 0 ≤ t < INTENT_MS once the lesson card no longer holds the match.
 */
export function intentGlyphs(ui: IntentUi, state: { time: number; towers: Readonly<Record<string, Pick<Tower, 'owner'>>> }, reducedMotion: boolean): IntentGlyph[] {
  const t = state.time;
  if (ui.cardUp || t >= INTENT_MS) return [];
  const alpha = reducedMotion ? 1 : Math.min(1, (INTENT_MS - t) / INTENT_FADE_MS);
  const out: IntentGlyph[] = [];
  for (const e of ui.level.enemies) {
    let start: LevelDef['towers'][number] | undefined;
    for (const d of ui.level.towers) if (d.owner === e.owner && (!start || (d.units ?? 0) > (start.units ?? 0))) start = d;
    if (start && state.towers[start.id]?.owner === e.owner) out.push({ towerId: start.id, owner: e.owner, personality: e.personality, alpha });
  }
  return out;
}

/** Where a glyph goes for badge `b`: on the badge's far side from its tower (above an above-the-roof badge), INTENT_GAP clear. */
export function intentGlyphRect(b: Pick<BadgePlace, 'rect' | 'bs' | 'side'>): Rect {
  const d = INTENT_PX * b.bs;
  const g = INTENT_GAP * b.bs;
  const r = b.rect;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  if (b.side === 'below') return { x: cx - d / 2, y: r.y + r.h + g, w: d, h: d };
  if (b.side === 'right') return { x: r.x + r.w + g, y: cy - d / 2, w: d, h: d };
  if (b.side === 'left') return { x: r.x - g - d, y: cy - d / 2, w: d, h: d };
  return { x: cx - d / 2, y: r.y - g - d, w: d, h: d };
}

const centre = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The glyph's path for `p` round (0, 0), radius `R` (the arrow points along +x; the caller rotates it). */
function glyphPath(ctx: CanvasRenderingContext2D, p: Personality, R: number): void {
  ctx.beginPath();
  if (p === 'rusher') {
    ctx.moveTo(-0.85 * R, -0.28 * R);
    ctx.lineTo(0.05 * R, -0.28 * R);
    ctx.lineTo(0.05 * R, -0.75 * R);
    ctx.lineTo(0.9 * R, 0);
    ctx.lineTo(0.05 * R, 0.75 * R);
    ctx.lineTo(0.05 * R, 0.28 * R);
    ctx.lineTo(-0.85 * R, 0.28 * R);
  } else if (p === 'turtle') {
    ctx.moveTo(-0.78 * R, -0.85 * R);
    ctx.quadraticCurveTo(0, -0.6 * R, 0.78 * R, -0.85 * R);
    ctx.lineTo(0.78 * R, -0.1 * R);
    ctx.quadraticCurveTo(0.72 * R, 0.6 * R, 0, 0.95 * R);
    ctx.quadraticCurveTo(-0.72 * R, 0.6 * R, -0.78 * R, -0.1 * R);
  } else {
    ctx.moveTo(-R, 0);
    ctx.quadraticCurveTo(0, -1.15 * R, R, 0);
    ctx.quadraticCurveTo(0, 1.15 * R, -R, 0);
  }
  ctx.closePath();
}

/**
 * Draw this frame's glyphs (`intentGlyphs`) at `intentGlyphRect` of each tower's badge, clipped clear
 * of every badge (the AUD-F3 / F5b even-odd pill cut-outs) and chip, so no numeral is crossed. Per
 * glyph: the shape in the owner's colour with a 2 px ink outline (the eye adds an ink pupil); ≤ 3
 * fills / strokes, nothing spawned.
 */
export function drawIntentGlyphs(host: Pick<BurstHost, 'reducedMotion'>, ctx: CanvasRenderingContext2D, pal: Palette, state: { time: number; towers: Readonly<Record<string, Tower>> }, layout: MarksLayout, ui: IntentUi): void {
  const glyphs = intentGlyphs(ui, state, host.reducedMotion);
  if (!glyphs.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-1e4, -1e4, 2e4, 2e4);
  for (const { rect: r } of layout.badges.values()) pillPath(ctx, r, 3);
  for (const { rect: r } of layout.chips) ctx.rect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
  ctx.clip('evenodd');
  ctx.lineJoin = 'round';
  for (const g of glyphs) {
    const b = layout.badges.get(g.towerId);
    if (!b) continue;
    const at = centre(intentGlyphRect(b));
    const R = (INTENT_PX / 2) * b.bs;
    ctx.save();
    ctx.globalAlpha = g.alpha;
    ctx.translate(at.x, at.y);
    if (g.personality === 'rusher') ctx.rotate(rusherAngle(state, layout, g.towerId));
    glyphPath(ctx, g.personality, R);
    ctx.fillStyle = pal.owners[g.owner];
    ctx.fill();
    ctx.lineWidth = 2 * b.bs;
    ctx.strokeStyle = pal.ink;
    ctx.stroke();
    if (g.personality === 'opportunist') {
      ctx.beginPath();
      ctx.arc(0, 0, 0.36 * R, 0, Math.PI * 2);
      ctx.fillStyle = pal.ink;
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

/** The rusher's arrow: from its tower toward the nearest player tower on the screen (drawn bodies), else straight down. */
export function rusherAngle(state: { towers: Readonly<Record<string, Pick<Tower, 'owner'>>> }, layout: Pick<MarksLayout, 'bodies'>, towerId: string): number {
  const from = layout.bodies.get(towerId);
  if (!from) return Math.PI / 2;
  const a = centre(from);
  let best = Infinity;
  let angle = Math.PI / 2;
  for (const id in state.towers) {
    const body = layout.bodies.get(id);
    if (state.towers[id]!.owner !== 'player' || !body) continue;
    const b = centre(body);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < best) [best, angle] = [d, Math.atan2(b.y - a.y, b.x - a.x)];
  }
  return angle;
}
