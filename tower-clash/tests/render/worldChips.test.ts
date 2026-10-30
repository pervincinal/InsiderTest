import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Rect } from '../../src/render/widgets';
import { BADGE_MIN_SCALE, FLAT, playCamera, proj, projAngle, setTilt } from '../../src/render/camera';
import { HUD, WORLD_ZOOM } from '../../src/render/layout';
import { artilleryMuzzle, badgeSize, badgeY, towerFootprintRadius, towerTop } from '../../src/render/sprites';
import { hudAnchors } from '../../src/render/view';
import {
  CARD_CLEAR,
  CHIP_GAP,
  CHIP_MAX_SLIDE,
  MINE_BODY_R,
  MINE_CHIP,
  STREAM_CHIP,
  BADGE_BELOW_GAP,
  badgeCentre,
  badgeMinY,
  badgeScale,
  chipMinTop,
  mineBesideSpots,
  mineChipRequest,
  overlaps,
  placeBadges,
  placeChips,
  streamChipRect,
} from '../../src/render/worldChips';
import type { BadgeWant } from '../../src/render/worldChips';
import { lessonCardLayout } from '../../src/render/hud';
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

  it('badge scale: the ART-24 badge zoom on the flat map, the zoomed depth scale floored at BADGE_MIN_SCALE, > 1 near the camera', () => {
    const z = WORLD_ZOOM.badge;
    expect(badgeScale(1)).toBe(z);
    expect(badgeScale(0.72)).toBe(BADGE_MIN_SCALE);
    expect(badgeScale(0.95)).toBeCloseTo(0.95 * z, 12);
    expect(badgeScale(1.2)).toBeCloseTo(1.2 * z, 12);
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
    const mine = mineChipRequest(ctx, cam, 465, 330, 4).req;
    const green = badges[0]!;
    const want = streamChipRect(green, badgeScale(proj(cam, 570, 420).s));
    const placed = placeChips(badges, [mine, { rect: want, badge: green }], chipMinTop(null));
    expect(noOverlaps([...badges, ...placed])).toBe(true);
    const s = placed[1]!;
    // still against its badge: on its left (slid up at most 1.5 heights) or on its right
    const left = Math.abs(s.x + s.w - (green.x - CHIP_GAP)) < 1e-9;
    const right = Math.abs(s.x - (green.x + green.w + CHIP_GAP)) < 1e-9;
    expect(left || right).toBe(true);
    expect(want.y - s.y).toBeLessThanOrEqual(want.h * CHIP_MAX_SLIDE + 1e-9);
  });
});

describe('mine chips are a mine glyph with the charge, beside the mine when a badge is level with it (ART-26)', () => {
  const ctx = fakeCtx();
  const bs = badgeScale(1);
  const s = MINE_CHIP.scale * bs;
  // draw.ts badgeLift on the flat default (not selected): the badge centre above the zoomed roof
  const badgeAt = (x: number, y: number, kind: 'barracks' | 'artillery', level: number, n: string): Rect => {
    const { w, h } = badgeSize(ctx, n, bs);
    return centred(x, y + (badgeY(kind, level) + 18) * WORLD_ZOOM.tower - 18 * WORLD_ZOOM.badge, w, h);
  };

  it('the chip is a glyph square plus a numeral tag: MINE_CHIP.h tall at its scale, never the badge pill', () => {
    const { req, s: scale } = mineChipRequest(ctx, FLAT, 150, 560, 8);
    expect(scale).toBeCloseTo(s, 12);
    expect(req.rect.h).toBeCloseTo(MINE_CHIP.h * s, 9);
    expect(req.rect.w).toBeCloseTo(req.rect.h + (14 + 3 * MINE_CHIP.pad) * s, 9); // fakeCtx: 14 px per character at the 26 px font
    expect(mineChipRequest(ctx, FLAT, 150, 560, 12).req.rect.w - req.rect.w).toBeCloseTo(14 * s, 9);
    expect(req.rect.x + req.rect.w / 2).toBeCloseTo(150, 9);
    expect(req.rect.y + req.rect.h / 2).toBeCloseTo(560 - MINE_CHIP.rise * WORLD_ZOOM.prop, 9);
    expect(req.mine).toEqual({ x: 150, y: 560, r: MINE_BODY_R * WORLD_ZOOM.prop });
  });

  it('level 24 west side: the 8-charge mine under the nw tower badge goes right of that badge at the mine height, not on top of it', () => {
    const nw = badgeAt(150, 700, 'barracks', 1, '6');
    const { req } = mineChipRequest(ctx, FLAT, 150, 560, 8);
    // before ART-26 the chip over the mine was free (no overlap) but stood right on the badge's top edge
    expect(overlaps(req.rect, nw, CHIP_GAP)).toBe(false);
    expect(nw.y - (req.rect.y + req.rect.h)).toBeLessThan(req.rect.h);
    const spots = mineBesideSpots(req, [nw]);
    expect(spots).toHaveLength(2);
    const [r] = placeChips([nw], [req], chipMinTop(null));
    expect(r).toEqual(spots[0]);
    expect(r!.x).toBeCloseTo(nw.x + nw.w + CHIP_GAP, 9);
    expect(r!.y + r!.h / 2).toBeCloseTo(560, 9);
    expect(overlaps(r!, nw, CHIP_GAP)).toBe(false);
    // the east side mirrors it, still inside the map's width
    const ne = badgeAt(570, 700, 'barracks', 1, '6');
    const [e] = placeChips([ne], [mineChipRequest(ctx, FLAT, 570, 560, 8).req], chipMinTop(null));
    expect(e!.x).toBeCloseTo(ne.x + ne.w + CHIP_GAP, 9);
    expect(e!.x + e!.w).toBeLessThanOrEqual(720);
  });

  it('level 45: the mine just over the guns badge goes beside it too; the left side when the right is off the map or taken', () => {
    const guns = badgeAt(360, 700, 'artillery', 2, '6');
    const { req } = mineChipRequest(ctx, FLAT, 360, 580, 6);
    expect(guns.y).toBeGreaterThan(580); // the badge is under the mine's point, within a chip height
    const [r] = placeChips([guns], [req], chipMinTop(null));
    expect(r!.x).toBeCloseTo(Math.max(360 + req.mine!.r, guns.x + guns.w) + CHIP_GAP, 9);
    // right taken by another badge: the left
    const blocker = { x: guns.x + guns.w + 2, y: 540, w: 120, h: 80 };
    const [l] = placeChips([guns, blocker], [req], chipMinTop(null));
    expect(l!.x + l!.w).toBeCloseTo(Math.min(360 - req.mine!.r, guns.x) - CHIP_GAP, 9);
    // at the map's right edge only the left spot is offered
    const edge = mineChipRequest(ctx, FLAT, 700, 580, 6).req;
    const edgeBadge = badgeAt(700, 700, 'artillery', 2, '6');
    expect(mineBesideSpots(edge, [edgeBadge]).map((q) => q.x < 700)).toEqual([true]);
  });

  it('a mine with no badge level with it keeps its chip over the mine', () => {
    const { req } = mineChipRequest(ctx, FLAT, 360, 580, 6);
    const far = badgeAt(360, 800, 'barracks', 1, '6'); // more than a chip height under the mine
    expect(mineBesideSpots(req, [far])).toEqual([]);
    expect(placeChips([far], [req], chipMinTop(null))).toEqual([req.rect]);
    const aside = badgeAt(520, 700, 'barracks', 1, '6'); // level with it but out of the chip's column
    expect(mineBesideSpots(req, [aside])).toEqual([]);
  });
});

describe('badges below the lesson card (ART-22)', () => {
  const ui = (outcome: PlayUi['outcome'] = 'playing'): PlayUi =>
    ({ outcome, level: makeLevel({ lesson: 'Everything together: hold your own walls, take the guns from the flank, then break the citadel with every stream you have' }) }) as unknown as PlayUi;
  const at = (time: number): GameState => ({ time }) as GameState;

  it('the card is up until the first input (AUD-B11: no time-out), under the top band', () => {
    const ctx = fakeCtx();
    const card = lessonCardLayout(ctx, at(0), ui());
    expect(card).not.toBeNull();
    expect(card!.rect.y).toBe(108);
    expect(card!.rect.y).toBeGreaterThan(HUD.mapTop);
    expect(card!.lines.length).toBeGreaterThanOrEqual(2);
    expect(card!.rect.h).toBe(card!.lines.length * card!.lineH + 18 + card!.captionH);
    const held = { ...ui(), cardUp: true } as PlayUi;
    expect(lessonCardLayout(ctx, at(0), held)).not.toBeNull(); // held: no time-out any more
    expect(lessonCardLayout(ctx, at(1000), ui())).toBeNull(); // a frame that does not say: up only at sim time 0
    const gone = { ...ui(), cardUp: false, cardFade: 0 } as PlayUi;
    expect(lessonCardLayout(ctx, at(0), gone)).toBeNull();
    expect(lessonCardLayout(ctx, at(0), { ...gone, cardFade: 0.5 } as PlayUi)).not.toBeNull(); // fading
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
    const card = lessonCardLayout(fakeCtx(), at(0), ui())!;
    const cardBottom = card.rect.y + card.rect.h; // 9:16: hudAnchors().top = 0
    const p = proj(cam, 360, 230);
    const bs = badgeScale(p.s);
    const free = p.y + badgeY('fortress', 1) * p.s;
    expect(free - 18 * bs).toBeLessThan(cardBottom + 4); // without the clamp the pill's top is under the card
    const by = Math.max(badgeMinY(cardBottom, bs), free);
    expect(by - 18 * bs).toBeGreaterThanOrEqual(cardBottom + 4 + CARD_CLEAR - 1e-9);
  });
});

describe('a badge that would be clamped onto its own tower goes below it (ART-24)', () => {
  // draw.ts badgeLift / badgeSpot on the flat default: badge centre above the zoomed roof, plinth radius × tower zoom
  const lift = (kind: 'barracks', level: number): number => (badgeY(kind, level) + 18) * WORLD_ZOOM.tower - 18 * WORLD_ZOOM.badge;
  const plinth = (kind: 'barracks', level: number): number => towerFootprintRadius(kind, level) * WORLD_ZOOM.tower;
  // level 3 "Free Real Estate": the foe barracks at the very top of the map, the neutral west tower mid-low
  const foe = { x: 360, y: 150 };
  const west = { x: 255, y: 1040 };
  const lesson = 'Neutral towers are free production: grab both before you fight';
  const card = lessonCardLayout(fakeCtx(), { time: 0 } as GameState, { outcome: 'playing', level: makeLevel({ lesson }) } as unknown as PlayUi)!;
  // the two phone shapes (view.ts resize): 430 × 932 with 59 / 34 insets, 360 × 640 with none
  const shapes = [
    { name: '430x932', cssW: 430, cssH: 932, insets: { top: 59, right: 0, bottom: 34, left: 0 } },
    { name: '360x640', cssW: 360, cssH: 640, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  ].map((s) => {
    const usableH = s.cssH - s.insets.top - s.insets.bottom;
    const scale = Math.min(s.cssW / 720, usableH / 1280);
    const offsetY = s.insets.top + (usableH - 1280 * scale) / 2;
    return { ...s, a: hudAnchors({ cssW: s.cssW, cssH: s.cssH, scale, offsetX: (s.cssW - 720 * scale) / 2, offsetY, insets: s.insets }) };
  });

  for (const s of shapes) {
    it(`level 3 foe on ${s.name}: the badge sits fully below the base, clear of the sprite — unless the card still covers that spot (BUG-43), then it clamps under the card`, () => {
      const bs = badgeScale(1);
      const natural = foe.y + lift('barracks', 1);
      const flipped = foe.y + plinth('barracks', 1) + 18 * bs + BADGE_BELOW_GAP;
      // card up: this two-line card reaches the flipped spot on 9:16 (no inset: the card sits lower on the map) but not on the tall phone
      const cardBottom = card.rect.y + card.rect.h + s.a.top;
      const minY = badgeMinY(cardBottom, bs);
      const withCard = badgeCentre(natural, minY, foe.y, plinth('barracks', 1), bs);
      expect(withCard.below, s.name).toBe(s.name === '430x932');
      expect(withCard).toEqual(withCard.below ? { y: flipped, below: true } : { y: minY, below: false });
      expect(withCard.y - 18 * bs).toBeGreaterThanOrEqual(cardBottom + 4 + CARD_CLEAR - 1e-9);
      // card gone: below the base
      const spot = badgeCentre(natural, badgeMinY(null, bs), foe.y, plinth('barracks', 1), bs);
      expect(spot).toEqual({ y: flipped, below: true });
      const top = spot.y - 18 * bs;
      // the drawn plinth reaches ≈ (r × 0.42 + 8) × zoom under the anchor; the badge's top edge is below all of it
      expect(top).toBeGreaterThan(foe.y + (towerFootprintRadius('barracks', 1) * 0.42 + 8) * WORLD_ZOOM.tower);
      // and nowhere near the roof (the sprite's top is towerTop × zoom above the base)
      expect(top).toBeGreaterThan(foe.y - towerTop('barracks', 1) * WORLD_ZOOM.tower);
    });

    it(`a mid-map tower (level 3 west) on ${s.name} keeps its badge above the roof`, () => {
      const bs = badgeScale(1);
      const natural = west.y + lift('barracks', 1);
      const spot = badgeCentre(natural, badgeMinY(card.rect.y + card.rect.h + s.a.top, bs), west.y, plinth('barracks', 1), bs);
      expect(spot).toEqual({ y: natural, below: false });
      expect(spot.y + 18 * bs).toBeLessThan(west.y - towerTop('barracks', 1) * WORLD_ZOOM.tower + 1);
    });
  }

  it('a small clamp (≤ a third of the badge height) still just clamps', () => {
    const bs = 1.15;
    const minY = 200;
    expect(badgeCentre(minY - 11.9 * bs, minY, 400, 40, bs)).toEqual({ y: minY, below: false });
    expect(badgeCentre(minY - 13 * bs, minY, 400, 40, bs).below).toBe(true);
  });
});

describe('all badges placed together (BUG-42 / BUG-43 placeBadges)', () => {
  const bs = badgeScale(1);
  const h = 36 * bs;
  const w = 50 * bs;
  const lift = (kind: 'barracks' | 'tankFactory'): number => (badgeY(kind, 1) + 18) * WORLD_ZOOM.tower - 18 * WORLD_ZOOM.badge;
  const plinth = towerFootprintRadius('barracks', 1) * WORLD_ZOOM.tower;
  const want = (id: string, x: number, y: number, kind: 'barracks' | 'tankFactory' = 'barracks'): BadgeWant => ({ id, x, y, bs, w, h, naturalY: y + lift(kind), plinth });
  // a lesson card as drawn on the tall phone (the top band moved up by the inset) and on 9:16
  const cardTall: Rect = { x: 15, y: 46, w: 690, h: 110 };
  const card916: Rect = { x: 15, y: 108, w: 690, h: 114 };
  const centreOf = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  it('a tower whose badge is not clamped onto itself keeps it above the roof, whatever the others do', () => {
    const out = placeBadges([want('a', 300, 800), want('b', 300, 1000)], null);
    expect(out.get('a')).toEqual({ rect: centred(300, 800 + lift('barracks'), w, h), bs, side: 'above' });
    expect(out.get('b')!.side).toBe('above');
  });

  it('level 43 green over greenfactory: the flip would land on the badge below, so the badge goes right of the tower instead', () => {
    const green = want('green', 570, 260);
    const factory = want('greenfactory', 570, 440, 'tankFactory');
    const out = placeBadges([factory, green], cardTall);
    const below = centred(570, 260 + plinth + h / 2 + BADGE_BELOW_GAP, w, h);
    expect(overlaps(below, out.get('greenfactory')!.rect, CHIP_GAP), 'the flipped spot is taken by the factory badge').toBe(true);
    const g = out.get('green')!;
    expect(g.side).toBe('right');
    expect(g.rect).toEqual({ x: 570 + plinth + BADGE_BELOW_GAP, y: 260 - h / 2, w, h });
    expect(overlaps(g.rect, out.get('greenfactory')!.rect, CHIP_GAP)).toBe(false);
    expect(overlaps(g.rect, { ...cardTall, h: cardTall.h + 4 }, CARD_CLEAR)).toBe(false);
    // the same tower at the map's right edge: the right spot would leave the map, so the left one
    const edge = placeBadges([want('greenfactory', 690, 440, 'tankFactory'), want('green', 690, 260)], cardTall).get('green')!;
    expect(edge.side).toBe('left');
    expect(edge.rect.x + edge.rect.w).toBeCloseTo(690 - plinth - BADGE_BELOW_GAP, 9);
    // and with nothing in the way below, the flip
    expect(placeBadges([green], cardTall).get('green')).toEqual({ rect: below, bs, side: 'below' });
  });

  it('a tower at the top of the map under the card (level 3 foe on 9:16): clamped under the card while every other spot is covered, below once it is gone', () => {
    const foe = want('foe', 360, 150);
    const up = placeBadges([foe, want('home', 360, 1150)], card916).get('foe')!;
    expect(up.side).toBe('above');
    expect(centreOf(up.rect).y).toBeCloseTo(badgeMinY(card916.y + card916.h, bs), 9);
    expect(overlaps(up.rect, { ...card916, h: card916.h + 4 }, CARD_CLEAR)).toBe(false);
    const gone = placeBadges([foe, want('home', 360, 1150)], null).get('foe')!;
    expect(gone.side).toBe('below');
    expect(centreOf(gone.rect).y).toBeCloseTo(150 + plinth + h / 2 + BADGE_BELOW_GAP, 9);
  });

  it('level 36 crown over the yellow fortress on 9:16 with the card up: the clamped spot is on the fortress badge, so the crown badge goes beside its tower at the clamped height', () => {
    const crown = want('crown', 360, 180);
    const yellow: BadgeWant = { ...want('yellow', 360, 400), naturalY: 400 + (badgeY('fortress', 1) + 18) * WORLD_ZOOM.tower - 18 * WORLD_ZOOM.badge };
    const out = placeBadges([crown, yellow], card916);
    const minY = badgeMinY(card916.y + card916.h, bs);
    expect(overlaps(centred(360, minY, w, h), out.get('yellow')!.rect, CHIP_GAP), 'the clamped spot is taken').toBe(true);
    const c = out.get('crown')!;
    expect(c.side).toBe('right');
    expect(c.rect).toEqual({ x: 360 + plinth + BADGE_BELOW_GAP, y: minY - h / 2, w, h });
    expect(overlaps(c.rect, out.get('yellow')!.rect, CHIP_GAP)).toBe(false);
    // card gone: the flip is still on the fortress badge, so beside the tower at base height
    const later = placeBadges([crown, yellow], null).get('crown')!;
    expect(later).toEqual({ rect: { x: 360 + plinth + BADGE_BELOW_GAP, y: 180 - h / 2, w, h }, bs, side: 'right' });
  });

  it('is deterministic in the input order and keeps every badge on the map, in the band and apart', () => {
    const towers = [want('n', 360, 180), want('w', 150, 460), want('e', 570, 460), want('mid', 360, 400), want('s', 360, 1170)];
    const a = placeBadges(towers, card916);
    const b = placeBadges(towers.slice().reverse(), card916);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
    const rects = [...a.values()].map((p) => p.rect);
    expect(noOverlaps(rects)).toBe(true);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(720);
      expect(r.y).toBeGreaterThanOrEqual(HUD.mapTop);
      expect(r.y + r.h).toBeLessThanOrEqual(HUD.mapBottom);
    }
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
