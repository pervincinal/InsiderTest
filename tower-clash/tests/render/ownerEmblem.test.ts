import { afterEach, describe, expect, it } from 'vitest';
import type { Owner } from '../../src/sim/types';
import type { Palette } from '../../src/render/palette';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE } from '../../src/render/palette';
import { TONE_PALETTES } from '../../src/render/teamTones';
import { badgeSize } from '../../src/render/sprites';
import { setTextScale, worldScale } from '../../src/render/widgets';
import type { Rect } from '../../src/render/widgets';
import { EMBLEM, drawOwnerEmblem, drawOwnerEmblems, emblemBand, emblemBox, emblemTones, lumContrast, ownerEmblem } from '../../src/render/ownerEmblem';

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
    // a chip on badge c's top rim: c's emblem is clipped clear of it (PERF-13: the far chip clips nothing)
    const chips = [{ rect: { x: 0, y: 0, w: 40, h: 20 } }, { rect: { x: r.x + 400 + r.w / 2 + 4, y: r.y - 12, w: 40, h: 20 } }];
    drawOwnerEmblems({ badgeHit: () => 0 }, frame.ctx, pal, { towers }, { badges, chips } as never, 0);
    expect(frame.log.fills).toHaveLength(2); // the star and the three-pip row; neutral none
    expect(frame.log.arc).toBe(3);
    expect(frame.log.clips).toBe(1);
    expect(frame.log.saves).toBe(frame.log.restores);
  });
});

/*
 * PERF-13: the emblems used to be drawn inside one even-odd clip of the whole canvas minus every chip, built on
 * every frame with a chip on screen (≈ 0.8 ms a frame on the level-50 perf sample at DPR 2.75). Now an emblem
 * no chip reaches is drawn unclipped, and one a chip reaches inside an even-odd clip of `emblemBand` (its pill's
 * top-rim band) minus the chips that reach that band: inside the band it is the same clip region, and the band
 * holds every pixel of the emblem — so the pixels are those of the canvas-wide clip.
 */
describe('PERF-13 emblem clip', () => {
  /** Records each clip's rects (the path since the last beginPath) and how many emblems were drawn under it. */
  function clipRecorder() {
    const clips: { rects: number[][]; rule: unknown }[] = [];
    let path: number[][] = [];
    const store: Record<string, unknown> = { globalAlpha: 1 };
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get(_t, key: string) {
        if (key === 'beginPath') return () => void (path = []);
        if (key === 'rect') return (...a: number[]) => void path.push(a);
        if (key === 'clip') return (rule: unknown) => void clips.push({ rects: path, rule });
        if (key in store) return store[key];
        return () => undefined;
      },
      set(_t, key: string, v) {
        store[key] = v;
        return true;
      },
    });
    return { ctx, clips };
  }
  const inside = (a: Rect, b: Rect): boolean => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  const grow = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });

  it('the band holds every emblem with 2 px to spare: every owner, pill text, badge scale and text size', () => {
    try {
      for (const scale of [1, 1.25, 1.5]) {
        setTextScale(scale);
        for (const text of ['0', '7', '42', '199']) {
          for (const s of [0.6, 0.8, 1, 1.15, 1.6, 2]) {
            const { r } = pill(text, s);
            for (const owner of OWNERS) {
              const box = emblemBox(r, owner);
              if (box) expect(inside(grow(box, 2), emblemBand(r)), `${owner} "${text}" × ${s} at text ${scale}`).toBe(true);
            }
          }
        }
      }
    } finally {
      setTextScale(1);
    }
  });

  it('no chip near any emblem: no clip at all (the old pass built one canvas-wide clip whenever a chip was on screen)', () => {
    const { r } = pill('12');
    const towers = { a: { owner: 'player' }, b: { owner: 'enemy1' } } as never;
    const badges = new Map([
      ['a', { rect: r, bs: 1, side: 'above' }],
      ['b', { rect: { ...r, y: r.y + 300 }, bs: 1, side: 'above' }],
    ]) as never;
    // a chip just clear of a's band (1 px cut + the band's own 2 px), and one beside b's pill well below its rim
    const band = emblemBand(r);
    const chips = [{ rect: { x: band.x + band.w + 1.01, y: r.y, w: 60, h: 30 } }, { rect: { x: r.x + r.w + 12, y: r.y + 300 + r.h * 0.6, w: 60, h: 30 } }];
    const { ctx, clips } = clipRecorder();
    drawOwnerEmblems({ badgeHit: () => 0 }, ctx, DEFAULT_PALETTE, { towers }, { badges, chips } as never, 0);
    expect(clips).toHaveLength(0);
  });

  it('a chip reaching an emblem clips only that emblem, by its band minus the chips that reach it (even-odd)', () => {
    const { r } = pill('12');
    const towers = { a: { owner: 'player' }, b: { owner: 'enemy2' }, n: { owner: 'neutral' } } as never;
    const rb = { ...r, x: r.x + 220 };
    const rn = { ...r, x: r.x - 220 };
    const badges = new Map([
      ['a', { rect: r, bs: 1, side: 'above' }],
      ['b', { rect: rb, bs: 1, side: 'above' }],
      ['n', { rect: rn, bs: 1, side: 'above' }],
    ]) as never;
    const onB = { x: rb.x + rb.w / 2 - 10, y: rb.y - 20, w: 40, h: 22 };
    const onN = { x: rn.x + rn.w / 2 - 10, y: rn.y - 20, w: 40, h: 22 }; // a neutral badge has no emblem: nothing to clip
    const { ctx, clips } = clipRecorder();
    drawOwnerEmblems({ badgeHit: (id) => (id === 'b' ? 3 : 0) }, ctx, DEFAULT_PALETTE, { towers }, { badges, chips: [{ rect: onB }, { rect: onN }] } as never, 0);
    expect(clips).toHaveLength(1);
    const band = emblemBand({ ...rb, x: rb.x + 3 }); // follows the under-fire jolt like the emblem
    expect(clips[0]!.rule).toBe('evenodd');
    expect(clips[0]!.rects).toEqual([
      [band.x, band.y, band.w, band.h],
      [onB.x - 1, onB.y - 1, onB.w + 2, onB.h + 2], // the same 1 px cut round the chip as before
    ]);
  });
});
