import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rect } from '../../src/render/widgets';
import { BADGE_MIN_SCALE, playCamera, proj, projAngle, setTilt } from '../../src/render/camera';
import { HUD } from '../../src/render/layout';
import { artilleryMuzzle, badgeSize, badgeY } from '../../src/render/sprites';
import {
  CARD_CLEAR,
  CHIP_GAP,
  CHIP_MAX_SLIDE,
  MINE_CHIP,
  STREAM_CHIP,
  badgeMinY,
  badgeScale,
  chipMinTop,
  overlaps,
  placeChips,
  streamChipRect,
} from '../../src/render/worldChips';
import { LESSON_CARD_MS, lessonCardLayout } from '../../src/render/hud';
import type { PlayUi } from '../../src/render/draw';
import { ParticleSystem } from '../../src/render/particles';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import { createState } from '../../src/sim/create';
import type { GameState } from '../../src/sim/types';
import { makeLevel } from '../helpers';

/** Canvas stand-in: no-op methods, writable properties, 14 px per character for measureText. */
function fakeCtx(): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = {};
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 14 });
      if (key in store) return store[key];
      return () => undefined;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

const centred = (cx: number, cy: number, w: number, h: number): Rect => ({ x: cx - w / 2, y: cy - h / 2, w, h });

function noOverlaps(rects: readonly Rect[]): boolean {
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlaps(rects[i]!, rects[j]!)) return false;
  return true;
}

describe('world chips take their badge scale (ART-22)', () => {
  afterEach(() => setTilt(undefined));

  it('badge scale: 1 on the flat map, the depth scale floored at BADGE_MIN_SCALE, > 1 near the camera', () => {
    expect(badgeScale(1)).toBe(1);
    expect(badgeScale(0.72)).toBe(BADGE_MIN_SCALE);
    expect(badgeScale(0.95)).toBe(0.95);
    expect(badgeScale(1.2)).toBe(1.2);
  });

  it('a stream chip sits CHIP_GAP left of its drawn badge, centred on it, sized by the badge scale', () => {
    const bs = BADGE_MIN_SCALE;
    const badge = centred(500, 200, 64 * bs, 36 * bs); // a two-digit badge is wider than the 50 px minimum
    const c = streamChipRect(badge, bs);
    expect(c.w).toBeCloseTo(STREAM_CHIP.w * bs, 9);
    expect(c.h).toBeCloseTo(STREAM_CHIP.h * bs, 9);
    expect(c.x + c.w).toBeCloseTo(badge.x - CHIP_GAP, 9);
    expect(c.y + c.h / 2).toBeCloseTo(200 + STREAM_CHIP.dy * bs, 9);
    expect(overlaps(c, badge)).toBe(false);
    // the near side: chip and badge grow together
    const near = streamChipRect(centred(360, 900, 50 * 1.2, 36 * 1.2), 1.2);
    expect(near.w).toBeCloseTo(46 * 1.2, 9);
  });
});

describe('chip collision nudge (ART-22 placeChips)', () => {
  const badge = centred(400, 300, 50, 36);
  const chip = streamChipRect(badge, 1);

  it('leaves a chip that touches nothing where it is', () => {
    expect(placeChips([badge, centred(100, 600, 50, 36)], [{ rect: chip, badge }], 0)).toEqual([chip]);
  });

  it('slides a chip up by the overlap: its bottom ends CHIP_GAP over the rect it hit', () => {
    const mine = { x: chip.x - 10, y: chip.y + chip.h - 8, w: 36, h: 26 }; // overlaps the chip's lower 8 px (plus the gap)
    const [r] = placeChips([badge, mine], [{ rect: chip, badge }], 0);
    expect(r!.x).toBe(chip.x);
    expect(r!.y + r!.h).toBeCloseTo(mine.y - CHIP_GAP, 9);
    expect(chip.y - r!.y).toBeCloseTo(8 + CHIP_GAP, 9);
    expect(noOverlaps([badge, mine, r!])).toBe(true);
  });

  it('keeps sliding while the new spot is taken, then goes right of the badge once that is further than CHIP_MAX_SLIDE heights', () => {
    const low = { x: chip.x, y: chip.y + 10, w: chip.w, h: 30 };
    const high = { x: chip.x, y: low.y - 30, w: chip.w, h: 20 }; // stacked: clearing both is > 1.5 chip heights
    expect(chip.y - (high.y - chip.h - CHIP_GAP)).toBeGreaterThan(chip.h * CHIP_MAX_SLIDE);
    const [r] = placeChips([badge, low, high], [{ rect: chip, badge }], 0);
    expect(r!.x).toBeCloseTo(badge.x + badge.w + CHIP_GAP, 9);
    expect(r!.y).toBe(chip.y);
    expect(noOverlaps([badge, low, high, r!])).toBe(true);
  });

  it('never slides above minTop (the top band / the lesson card): the right side instead', () => {
    const mine = { x: chip.x, y: chip.y + 4, w: chip.w, h: 24 };
    const [free] = placeChips([badge, mine], [{ rect: chip, badge }], 0);
    expect(free!.x).toBe(chip.x); // room above: slides up
    const [r] = placeChips([badge, mine], [{ rect: chip, badge }], chip.y - 2);
    expect(r!.x).toBeCloseTo(badge.x + badge.w + CHIP_GAP, 9);
  });

  it('keeps the preferred rect when nothing is free, and placed chips block later ones', () => {
    const wall = { x: 0, y: 0, w: 720, h: 1280 };
    expect(placeChips([wall], [{ rect: chip, badge }], 0)).toEqual([chip]);
    const a = centred(200, 500, 36, 26);
    const [ra, rb] = placeChips([], [{ rect: a }, { rect: { ...a, x: a.x + 10 } }], 0);
    expect(ra).toEqual(a);
    expect(rb!.y + rb!.h).toBeCloseTo(a.y - CHIP_GAP, 9);
  });

  it('level 24 top right at the default tilt: the streaming green tower, its badge and the 4-charge mine chip stay apart', () => {
    const cam = playCamera();
    const ctx = fakeCtx();
    // green barracks (570, 420) streaming; the mine at (465, 330); the neutral crown (360, 240)
    const badges: Rect[] = [];
    for (const [x, y, n] of [
      [570, 420, '14'],
      [360, 240, '12'],
    ] as const) {
      const p = proj(cam, x, y);
      const bs = badgeScale(p.s);
      const by = Math.max(badgeMinY(null, bs), p.y + badgeY('barracks', 1) * p.s);
      const { w, h } = badgeSize(ctx, n, bs);
      badges.push(centred(p.x, by, w, h));
    }
    const m = proj(cam, 465, 330);
    const ms = MINE_CHIP.scale * badgeScale(m.s);
    const mineSize = badgeSize(ctx, '4', ms);
    const mine = centred(m.x, m.y - MINE_CHIP.rise * m.s, mineSize.w, mineSize.h);
    const green = badges[0]!;
    const want = streamChipRect(green, badgeScale(proj(cam, 570, 420).s));
    const placed = placeChips(badges, [{ rect: mine }, { rect: want, badge: green }], chipMinTop(null));
    expect(noOverlaps([...badges, ...placed])).toBe(true);
    const s = placed[1]!;
    // still against its badge: on its left (slid up at most 1.5 heights) or on its right
    const left = Math.abs(s.x + s.w - (green.x - CHIP_GAP)) < 1e-9;
    const right = Math.abs(s.x - (green.x + green.w + CHIP_GAP)) < 1e-9;
    expect(left || right).toBe(true);
    expect(want.y - s.y).toBeLessThanOrEqual(want.h * CHIP_MAX_SLIDE + 1e-9);
  });
});

describe('badges below the lesson card (ART-22)', () => {
  const ui = (outcome: PlayUi['outcome'] = 'playing'): PlayUi =>
    ({ outcome, level: makeLevel({ lesson: 'Everything together: hold your own walls, take the guns from the flank, then break the citadel with every stream you have' }) }) as unknown as PlayUi;
  const at = (time: number): GameState => ({ time }) as GameState;

  it('the card is up for the first LESSON_CARD_MS of a running level, under the top band', () => {
    const ctx = fakeCtx();
    const card = lessonCardLayout(ctx, at(0), ui());
    expect(card).not.toBeNull();
    expect(card!.rect.y).toBe(108);
    expect(card!.rect.y).toBeGreaterThan(HUD.mapTop);
    expect(card!.lines.length).toBeGreaterThanOrEqual(2);
    expect(card!.rect.h).toBe(card!.lines.length * card!.lineH + 18 + card!.captionH);
    expect(lessonCardLayout(ctx, at(LESSON_CARD_MS - 50), ui())).not.toBeNull();
    expect(lessonCardLayout(ctx, at(LESSON_CARD_MS), ui())).toBeNull();
    expect(lessonCardLayout(ctx, at(0), ui('won'))).toBeNull();
  });

  it('clamps a badge centre below the card while it is up, and only then', () => {
    const base = HUD.mapTop + 26;
    expect(badgeMinY(null, 1)).toBe(base);
    expect(badgeMinY(null, BADGE_MIN_SCALE)).toBe(base);
    // 9:16, three-line card: rect bottom 108 + 114 = 222 → badge top clears its 4 px clay edge by CARD_CLEAR
    const bs = BADGE_MIN_SCALE;
    const y = badgeMinY(222, bs);
    expect(y - 18 * bs).toBeCloseTo(222 + 4 + CARD_CLEAR, 9);
    // a card above the play band (taller phones: the top band moved up) does not pull badges up past the band
    expect(badgeMinY(40, 1)).toBe(base);
    expect(chipMinTop(null)).toBe(HUD.mapTop + 8);
    expect(chipMinTop(222)).toBe(222 + 4 + CARD_CLEAR);
  });

  it('on 9:16 a far tower (level 15 citadel) whose badge sat under the card is drawn below it', () => {
    const cam = playCamera();
    const card = lessonCardLayout(fakeCtx(), at(1000), ui())!;
    const cardBottom = card.rect.y + card.rect.h; // 9:16: hudAnchors().top = 0
    const p = proj(cam, 360, 230);
    const bs = badgeScale(p.s);
    const free = p.y + badgeY('fortress', 1) * p.s;
    expect(free - 18 * bs).toBeLessThan(cardBottom + 4); // without the clamp the pill's top is under the card
    const by = Math.max(badgeMinY(cardBottom, bs), free);
    expect(by - 18 * bs).toBeGreaterThanOrEqual(cardBottom + 4 + CARD_CLEAR - 1e-9);
  });
});

describe('artillery shells leave the barrel under the camera (ART-22)', () => {
  afterEach(() => setTilt(undefined));

  for (const [name, y] of [
    ['far', 260],
    ['mid', 640],
    ['near', 1100],
  ] as const) {
    it(`the trace starts at the drawn muzzle (${name} gun)`, () => {
      const level = makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1150, owner: 'player', units: 10, level: 1 },
          { id: 'g', x: 300, y, owner: 'enemy1', units: 10, level: 2, kind: 'artillery' },
        ],
      });
      const state = createState(level, 1);
      const fx = new ParticleSystem(false);
      const shot = vi.spyOn(fx, 'shot');
      const ev = { type: 'unitDied' as const, x: 400, y: y + 60, owner: 'player' as const, cause: 'artillery' as const, roadId: 'g-p' };
      fx.onEvents([ev], state, DEFAULT_PALETTE, 0);
      expect(shot).toHaveBeenCalledTimes(1);
      const [fromX, fromY, toX, toY] = shot.mock.calls[0]!;
      expect([toX, toY]).toEqual([400, y + 54]);
      const cam = playCamera();
      const g = proj(cam, 300, y);
      const aim = fx.aimOf('g')!;
      const m = artilleryMuzzle(2, projAngle(cam, 300, y, aim));
      const o = proj(cam, fromX, fromY);
      expect(o.x).toBeCloseTo(g.x + m.dx * g.s, 6);
      expect(o.y).toBeCloseTo(g.y + m.dy * g.s, 6);
      // on the flat map it is the plain sprite offset
      setTilt(0);
      shot.mockClear();
      fx.onEvents([ev], state, DEFAULT_PALETTE, 0);
      const flat = shot.mock.calls[0]!;
      const mf = artilleryMuzzle(2, aim);
      expect(flat[0]).toBeCloseTo(300 + mf.dx, 9);
      expect(flat[1]).toBeCloseTo(y + mf.dy, 9);
    });
  }

  it('the muzzle is the barrel tip: pivot over the dome by level, length per level, 0.73 perspective', () => {
    expect(artilleryMuzzle(1, 0)).toEqual({ dx: 26, dy: -22 });
    expect(artilleryMuzzle(2, 0)).toEqual({ dx: 30, dy: -36 });
    const up = artilleryMuzzle(3, -Math.PI / 2);
    expect(up.dx).toBeCloseTo(0, 9);
    expect(up.dy).toBeCloseTo(-44 - 36 * 0.73, 9);
  });
});
