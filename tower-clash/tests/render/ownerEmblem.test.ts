import { afterEach, describe, expect, it } from 'vitest';
import type { Owner } from '../../src/sim/types';
import type { Palette } from '../../src/render/palette';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE } from '../../src/render/palette';
import { TONE_PALETTES } from '../../src/render/teamTones';
import { badgeSize } from '../../src/render/sprites';
import { setTextScale, worldScale } from '../../src/render/widgets';
import type { Rect } from '../../src/render/widgets';
import { EMBLEM, drawOwnerEmblem, drawOwnerEmblems, emblemBox, emblemTones, lumContrast, ownerEmblem } from '../../src/render/ownerEmblem';

/*
 * AUD-U17 (docs/reviews/2026-10-29-audit-ux.md): ownership survives grayscale. Every badge carries an owner
 * emblem on the middle of its top rim — the player a star, enemy k k pips, neutral nothing — in paper or ink,
 * whichever stands ≥ 3:1 off the rim's owner shade in luminance, on every palette and tone set. The emblem
 * stays on the pill's rim, above the numerals' cap height, and the pill / numeral box is unchanged.
 */

const OWNERS: Owner[] = ['neutral', 'player', 'enemy1', 'enemy2', 'enemy3'];
const PALETTES: [string, Palette][] = [
  ['default', DEFAULT_PALETTE],
  ['colour-blind', COLOR_BLIND_PALETTE],
  ...Object.entries(TONE_PALETTES).flatMap(([set, [a, b]]) => [
    [set, a],
    [`${set} colour-blind`, b],
  ] as [string, Palette][]),
];

/** Records paths (lineTo / arc counts), fills and strokes with their colours. */
function recorder() {
  const log = { lineTo: 0, arc: 0, fills: [] as string[], strokes: [] as string[], clips: 0, saves: 0, restores: 0 };
  const store: Record<string, unknown> = { globalAlpha: 1, font: '10px sans-serif' };
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key: string) {
      if (key === 'lineTo') return () => void log.lineTo++;
      if (key === 'arc') return () => void log.arc++;
      if (key === 'fill') return () => void log.fills.push(String(store.fillStyle));
      if (key === 'stroke') return () => void log.strokes.push(String(store.strokeStyle));
      if (key === 'clip') return () => void log.clips++;
      if (key === 'save') return () => void log.saves++;
      if (key === 'restore') return () => void log.restores++;
      if (key === 'measureText') return (s: string) => ({ width: s.length * 15 });
      if (key in store) return store[key];
      return () => undefined;
    },
    set(_t, key: string, v) {
      store[key] = v;
      return true;
    },
  });
  return { ctx, log };
}

/** A badge pill as drawBadge draws it for `text` at `s`, centred on (cx, cy), and its numeral box. */
function pill(text: string, s = 1, cx = 300, cy = 400): { r: Rect; numerals: Rect } {
  const { ctx } = recorder();
  const { w, h } = badgeSize(ctx, text, s);
  const px = 26 * worldScale() * s;
  const tw = text.length * 15 * s;
  // drawBadge: middle baseline at cy + 1; digits stand ≈ 0.72 em tall round it
  return { r: { x: cx - w / 2, y: cy - h / 2, w, h }, numerals: { x: cx - tw / 2, y: cy + 1 - 0.36 * px, w: tw, h: 0.72 * px } };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

afterEach(() => setTextScale(1));

describe('AUD-U17 owner emblems', () => {
  it('one emblem per owner: player star, enemy k k pips, neutral none', () => {
    expect(ownerEmblem('player')).toEqual({ kind: 'star' });
    expect(ownerEmblem('enemy1')).toEqual({ kind: 'pips', n: 1 });
    expect(ownerEmblem('enemy2')).toEqual({ kind: 'pips', n: 2 });
    expect(ownerEmblem('enemy3')).toEqual({ kind: 'pips', n: 3 });
    expect(ownerEmblem('neutral')).toBeNull();
    const { r } = pill('12');
    const count = (o: Owner) => {
      const { ctx, log } = recorder();
      drawOwnerEmblem(ctx, DEFAULT_PALETTE, o, r);
      return log;
    };
    expect(count('player').lineTo).toBe(10); // five points, five notches
    expect(count('player').arc).toBe(0);
    for (const [o, n] of [['enemy1', 1], ['enemy2', 2], ['enemy3', 3]] as const) expect(count(o).arc).toBe(n);
    const neutral = count('neutral');
    expect(neutral.fills.length + neutral.strokes.length).toBe(0); // a plain rim
  });

  it('every emblem sits on the pill top rim, inside its ends, clear of the numerals; the pill is unchanged', () => {
    for (const scale of [1, 1.25, 1.5]) {
      setTextScale(scale);
      for (const s of [0.7, 1, 1.3]) {
        for (const text of ['0', '7', '42', '199']) {
          const { r, numerals } = pill(text, s);
          // the AUD-U2 pill: no emblem changes badgeSize (≥ 26 px numerals, 10 + 26 × world scale tall)
          expect(r.h).toBeCloseTo((10 + 26 * worldScale()) * s, 6);
          expect(r.w).toBeCloseTo(Math.max(50, text.length * 15 + 24) * s, 6);
          for (const o of OWNERS) {
            const e = emblemBox(r, o);
            if (o === 'neutral') {
              expect(e).toBeNull();
              continue;
            }
            const box = e!;
            const label = `${o} "${text}" ×${s} @${scale}`;
            expect(box.x, label).toBeGreaterThanOrEqual(r.x);
            expect(box.x + box.w, label).toBeLessThanOrEqual(r.x + r.w);
            // on the rim: straddles the pill's top edge, never reaches past a quarter of the pill above it
            expect(box.y, label).toBeLessThan(r.y);
            expect(box.y + box.h, label).toBeGreaterThan(r.y);
            expect(box.y, label).toBeGreaterThan(r.y - r.h / 4);
            expect(overlaps(box, numerals), label).toBe(false);
            expect(numerals.y - (box.y + box.h), label).toBeGreaterThanOrEqual(1.5 * s);
          }
        }
      }
    }
  });

  it('legible at 360 px wide (≈ 2.5 map px per CSS px): star ≥ 5 CSS px, pip ≥ 3 CSS px', () => {
    const { r } = pill('9');
    const star = emblemBox(r, 'player')!;
    expect(star.w / 2.5).toBeGreaterThanOrEqual(5);
    expect((2 * EMBLEM.pipR) / 2.5).toBeGreaterThanOrEqual(3);
    expect(EMBLEM.pipGap).toBeGreaterThan(2 * EMBLEM.pipR + EMBLEM.edge); // pips never merge
  });

  it('grayscale: the emblem fill stands ≥ 3:1 off the rim (owner shade) on every palette and tone set', () => {
    for (const [name, pal] of PALETTES) {
      for (const o of OWNERS) {
        if (o === 'neutral') continue;
        const { fill, edge, rim } = emblemTones(pal, o);
        expect(rim).toBe(pal.ownerTones[o].shade);
        expect([pal.paper, pal.ink]).toContain(fill);
        expect(edge).not.toBe(fill);
        expect(lumContrast(fill, rim), `${name} ${o}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('the drawn emblem uses those tones; the frame pass draws one per non-neutral badge, clipped clear of the chips', () => {
    const pal = DEFAULT_PALETTE;
    const { r } = pill('5');
    const { ctx, log } = recorder();
    drawOwnerEmblem(ctx, pal, 'enemy2', r);
    const t = emblemTones(pal, 'enemy2');
    expect(log.fills).toEqual([t.fill]);
    expect(log.strokes).toEqual([t.edge]);
    const towers = { a: { owner: 'player' }, b: { owner: 'neutral' }, c: { owner: 'enemy3' } } as never;
    const badges = new Map([
      ['a', { rect: r, bs: 1, side: 'above' }],
      ['b', { rect: { ...r, x: r.x + 200 }, bs: 1, side: 'above' }],
      ['c', { rect: { ...r, x: r.x + 400 }, bs: 1, side: 'above' }],
    ]) as never;
    const frame = recorder();
    drawOwnerEmblems({ badgeHit: () => 0 }, frame.ctx, pal, { towers }, { badges, chips: [{ rect: { x: 0, y: 0, w: 40, h: 20 } }] as never }, 0);
    expect(frame.log.fills).toHaveLength(2); // the star and the three-pip row; neutral none
    expect(frame.log.arc).toBe(3);
    expect(frame.log.clips).toBe(1);
    expect(frame.log.saves).toBe(frame.log.restores);
  });
});
