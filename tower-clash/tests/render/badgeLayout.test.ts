import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Rect } from '../../src/render/widgets';
import { FONT_RU } from '../../src/render/widgets';
import { FLAT, playCamera, proj, setTilt } from '../../src/render/camera';
import type { Camera } from '../../src/render/camera';
import { HUD, TOWER_HIT_RADIUS, WORLD_ZOOM } from '../../src/render/layout';
import { badgeSize, badgeY, towerFootprintRadius, towerTop } from '../../src/render/sprites';
import { hudAnchors } from '../../src/render/view';
import type { HudAnchors } from '../../src/render/view';
import { badgeScale, chipMinTop, mineChipRequest, placeBadges, placeChips, streamChipRect } from '../../src/render/worldChips';
import type { BadgeWant, ChipRequest } from '../../src/render/worldChips';
import { lessonCardLayout } from '../../src/render/hud';
import type { PlayUi } from '../../src/render/draw';
import { playLayout } from '../../src/render/draw';
import { hitTower } from '../../src/input/pointer';
import { loadAllLevels } from '../../src/levels/index';
import { createState } from '../../src/sim/create';
import { isUnderFire } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import type { GameState, LevelDef, Tower } from '../../src/sim/types';
import { currentLanguage, setLanguage } from '../../src/ui/i18n';
import type { Language } from '../../src/ui/i18n';
import { ADVANCES, ADVANCE_CHARS, ADVANCE_ERROR } from './fontAdvances';

/*
 * QA-24 (build 15, ART-24 zoom): badge / chip overlap guard for every level. Towers draw ×1.3, badges
 * and chips ×1.15 and chips are laid out against the badge rects (worldChips.ts); this rebuilds the
 * rects the renderer uses (draw.ts's badge loop → `placeBadges`, then `drawWorldChips` → `placeChips`)
 * from the same pure helpers for every level's opening position, on the default flat camera, on the two
 * phone shapes, with the lesson card up (t = 0, in every UI language: a longer lesson pushes clamped
 * badges lower) and gone (t = 10 s). It found BUG-42 / 43 / 44 (fixed 2026-10-14: `placeBadges`
 * candidate search, the card guard, `hitTower` base circle first).
 *
 * Chips: every live mine's charge chip, and a stream chip for every tower that can stream (player and
 * enemy towers with a lane) — the worst case of the first seconds, when every side has its links up.
 * Text is measured with the game's fonts (fontAdvances.ts, Chromium ±1.8 %, widened by that error).
 *
 * BUG-56 (2026-10-24): also with each home selected (its badge rides 4 px higher, and where the select
 * hint moves up under the lesson card — GD-5d, draw.ts `playLayout` — the badges clear card + hint),
 * card up and gone, in all four languages; and every badge and chip rect lies inside the map's width
 * less IN_FRAME (level 37 on 360 × 640 put both top enemy badges beside their barracks, off the frame).
 * BUG-57 (2026-10-29): where the hint sits between the rows of towers instead, the badges and chips are
 * laid out round it (`playLayout`'s `avoid`) and every one keeps clear of it (checked as badge/card, chip/card).
 */

/** worldChips.ts `IN_FRAME`: the clear margin a badge / chip keeps from the map's left and right edges. */
const MARGIN = 4;

const SHAPES = [
  // iPhone 17 Pro Max class: 430 × 932 CSS px, Dynamic Island / home indicator insets, DPR 3 (the layout is in logical px; DPR only sharpens it)
  { name: '430x932', cssW: 430, cssH: 932, insets: { top: 59, right: 0, bottom: 34, left: 0 } },
  // small Android 9:16, no insets
  { name: '360x640', cssW: 360, cssH: 640, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
] as const;

/** view.ts `resize` for a shape: the letterbox fit inside the safe area, then the HUD band anchors. */
function anchorsOf(s: (typeof SHAPES)[number]): HudAnchors {
  const usableW = Math.max(s.cssW / 2, s.cssW - s.insets.left - s.insets.right);
  const usableH = Math.max(s.cssH / 2, s.cssH - s.insets.top - s.insets.bottom);
  const scale = Math.min(usableW / C.MAP_W, usableH / C.MAP_H);
  const offsetX = Math.min(s.insets.left, s.cssW - usableW) + (usableW - C.MAP_W * scale) / 2;
  const offsetY = Math.min(s.insets.top, s.cssH - usableH) + (usableH - C.MAP_H * scale) / 2;
  return hudAnchors({ cssW: s.cssW, cssH: s.cssH, scale, offsetX, offsetY, insets: s.insets });
}

const pxOf = (f: string): number => Number(/(\d+(?:\.\d+)?)px/.exec(f)?.[1] ?? 10);

/** Canvas stand-in whose measureText uses the game's font advances (+ the table's worst error); everything else is a no-op. */
function measuringCtx(): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = { font: '700 10px sans-serif' };
  const measure = (text: string): number => {
    const f = String(store.font);
    const table = ADVANCES[`${f.includes(FONT_RU) ? 'ru' : 'latin'}${/^700/.test(f) ? 700 : 500}` as keyof typeof ADVANCES];
    let em = 0;
    for (const c of text) {
      const i = ADVANCE_CHARS.indexOf(c);
      em += i < 0 ? 0.6 : table[i]!;
    }
    return em * pxOf(f) * (1 + ADVANCE_ERROR);
  };
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'measureText') return (s: string) => ({ width: measure(String(s)) });
      if (key in store) return store[key];
      return () => undefined;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

/** draw.ts `badgeLift` (`raise` 4 for the selected tower) — the badge centre's offset above the anchor at depth 1. */
const badgeLift = (t: Tower, raise: number): number => (badgeY(t.kind, t.level) + 18 - raise) * WORLD_ZOOM.tower - 18 * WORLD_ZOOM.badge;

interface Item {
  label: string;
  rect: Rect;
  /** Tower id a chip belongs to (stream chip: its tower; badge: itself; mine chip: none). */
  owner?: string;
  kind: 'badge' | 'mine' | 'stream';
}

interface Layout {
  badges: Item[];
  chips: Item[];
  /** The lesson card in the logical frame (with its clay edge) — and the select hint under it when it moved up — or null with neither. */
  card: Rect | null;
  /** BUG-57: the select hint between the rows of towers (the badges and chips keep clear of it), or null. */
  hint: Rect | null;
}

/**
 * The badge + chip rects draw.ts would lay out for `state` under `cam` with `sel` selected, with the
 * lesson card as `lessonCardLayout` gives it and, when the select hint moves up (`playLayout`), card + hint
 * (or, BUG-57, the hint between the rows as a rect to keep clear of).
 */
function layout(state: GameState, level: LevelDef, a: HudAnchors, cam: Camera, sel: string | null): Layout {
  const ctx = measuringCtx();
  const ui = { outcome: 'playing', level } as unknown as PlayUi;
  const lc = lessonCardLayout(ctx, state, ui);
  // draw.ts: the card's rect moved with the top band; `placeBadges` adds the clay edge and CARD_CLEAR itself
  const lessonRect = lc ? { ...lc.rect, y: lc.rect.y + a.top } : null;
  // GD-5d / BUG-57: the renderer's own pill for this selection; at the top of the map band the badges clear
  // card + pill as one block (`block`), between the rows of towers they keep clear of the pill (`avoid`)
  const placed = sel ? playLayout(ctx, state, cam, sel, lessonRect, a, true, true) : null;
  const cardRect = placed ? placed.block : lessonRect;
  const avoid = placed?.avoid ?? null;
  const card = cardRect ? { ...cardRect, h: cardRect.h + 4 } : null;
  const towers = Object.values(state.towers).sort((p, q) => p.y - q.y || (p.id < q.id ? -1 : 1));
  // draw.ts's badge loop (not selected: raise 0): measured width incl. the under-fire pip, natural spot above the roof, zoomed plinth
  const wants: BadgeWant[] = towers.map((t) => {
    const p = proj(cam, t.x, t.y);
    const bs = badgeScale(p.s);
    const { w, h } = badgeSize(ctx, String(t.units), bs, isUnderFire(state, t));
    return { id: t.id, x: p.x, y: p.y, bs, w, h, naturalY: p.y + badgeLift(t, sel === t.id ? 4 : 0) * p.s, plinth: towerFootprintRadius(t.kind, t.level) * WORLD_ZOOM.tower * p.s };
  });
  const boxes = placeBadges(wants, cardRect, avoid);
  const badges: Item[] = towers.map((t) => ({ label: `badge ${t.id}`, rect: boxes.get(t.id)!.rect, owner: t.id, kind: 'badge' }));
  // drawWorldChips: mine chips first, then stream chips far to near, then by id
  const reqs: ChipRequest[] = [];
  const meta: Omit<Item, 'rect'>[] = [];
  state.mines.forEach((m, i) => {
    if (m.charges <= 0) return;
    // ART-26: the renderer's own request (glyph + tag size, the mine for the beside rule)
    reqs.push(mineChipRequest(ctx, cam, m.x, m.y, m.charges).req);
    meta.push({ label: `mine#${i}`, kind: 'mine' });
  });
  const streaming = towers.filter((t) => t.owner !== 'neutral' && Object.values(state.roads).some((r) => r.a === t.id || r.b === t.id));
  for (const t of streaming) {
    const b = boxes.get(t.id)!;
    reqs.push({ rect: streamChipRect(b.rect, b.bs), badge: b.rect });
    meta.push({ label: `chip ${t.id}`, owner: t.id, kind: 'stream' });
  }
  const chipRects = placeChips(
    [...badges.map((b) => b.rect), ...(avoid ? [avoid] : [])],
    reqs,
    chipMinTop(cardRect ? cardRect.y + cardRect.h : null),
  );
  return { badges, chips: chipRects.map((rect, i) => ({ ...meta[i]!, rect })), card, hint: avoid };
}

/**
 * Overlap of two rects in logical px: > 0 = how deep they overlap (the smaller of the x / y overlaps),
 * ≤ 0 = apart, by minus the clear gap along the axis that separates them (touching = 0).
 */
function depthOf(a: Rect, b: Rect): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return Math.min(ox, oy);
}

/** pointer.ts `hitTower`'s shapes at tower `t` under `cam`: drawn base, roof top, and the capsule / base-circle radius. */
function tapShape(cam: Camera, t: Tower): { x: number; y: number; roof: number; r: number } {
  const p = proj(cam, t.x, t.y);
  return { x: p.x, y: p.y, roof: p.y - towerTop(t.kind, t.level) * WORLD_ZOOM.tower * p.s, r: TOWER_HIT_RADIUS * Math.max(1, p.s) };
}

/** How far the screen point `q` is outside tower `t`'s hit capsule (base..roof at the drawn column, radius r); negative = inside. */
function outsideCapsule(cam: Camera, t: Tower, q: { x: number; y: number }): number {
  const c = tapShape(cam, t);
  const dy = q.y > c.y ? q.y - c.y : q.y < c.roof ? c.roof - q.y : 0;
  return Math.hypot(q.x - c.x, dy) - c.r;
}

interface Finding {
  level: number;
  screen: string;
  when: string;
  check: string;
  pair: string;
  /** Pixels of overlap / intrusion (logical px; > 0 = failing). */
  px: number;
}

const LEVELS = await loadAllLevels();
const LANGS: readonly Language[] = ['en', 'az', 'ru', 'tr'];

/** Everything measured, failing or not (margins: the closest call of each check per screen). */
function survey(cam: Camera): Finding[] {
  const out: Finding[] = [];
  for (const level of LEVELS) {
    const state = createState(level, 1);
    for (const shape of SHAPES) {
      const a = anchorsOf(shape);
      // BUG-56: nothing selected, or a home (every own tower at the start: level 8 has two), card up / gone, every language
      const sels = [null, ...Object.values(state.towers).filter((t) => t.owner === 'player').map((t) => t.id)];
      const moments: { when: string; time: number; lang: Language; sel: string | null }[] = [];
      for (const sel of sels) for (const time of [0, 10_000]) for (const lang of LANGS) moments.push({ when: `t=${time / 1000}${time ? 's' : ''} ${lang}${sel ? ` sel=${sel}` : ''}`, time, lang, sel });
      for (const m of moments) {
        void setLanguage(m.lang);
        const L = layout({ ...state, time: m.time }, level, a, cam, m.sel);
        const base = { level: level.id, screen: shape.name, when: m.when };
        const all = [...L.badges, ...L.chips];
        for (let i = 0; i < all.length; i++) {
          for (let j = i + 1; j < all.length; j++) {
            const p = all[i]!;
            const q = all[j]!;
            // a stream chip against its own badge is laid out CHIP_GAP from it; any other pair must be apart
            const own = p.owner !== undefined && p.owner === q.owner;
            if (own) continue;
            const check = p.kind === 'badge' && q.kind === 'badge' ? 'badge/badge' : 'chip/other';
            out.push({ ...base, check, pair: `${p.label} x ${q.label}`, px: depthOf(p.rect, q.rect) });
          }
        }
        for (const b of L.badges) {
          const r = b.rect;
          out.push({ ...base, check: 'badge in band', pair: b.label, px: Math.max(HUD.mapTop - r.y, r.y + r.h - HUD.mapBottom) });
          out.push({ ...base, check: 'badge in map x', pair: b.label, px: Math.max(MARGIN - r.x, r.x + r.w - (C.MAP_W - MARGIN)) });
          if (L.card) out.push({ ...base, check: 'badge/card', pair: `${b.label} x lesson card / hint`, px: depthOf(r, L.card) });
          if (L.hint) out.push({ ...base, check: 'badge/card', pair: `${b.label} x select hint`, px: depthOf(r, L.hint) });
        }
        for (const c of L.chips) {
          const r = c.rect;
          out.push({ ...base, check: 'chip in band', pair: c.label, px: Math.max(HUD.mapTop - r.y, r.y + r.h - HUD.mapBottom) });
          out.push({ ...base, check: 'chip in map x', pair: c.label, px: Math.max(MARGIN - r.x, r.x + r.w - (C.MAP_W - MARGIN)) });
          if (L.card) out.push({ ...base, check: 'chip/card', pair: `${c.label} x lesson card / hint`, px: depthOf(r, L.card) });
          if (L.hint) out.push({ ...base, check: 'chip/card', pair: `${c.label} x select hint`, px: depthOf(r, L.hint) });
        }
      }
    }
  }
  void setLanguage('en');
  return out;
}

/** Findings grouped by level / check / pair: the worst px, and on which screens and at which moments. */
interface Group {
  level: number;
  check: string;
  pair: string;
  px: number;
  screens: Set<string>;
  whens: Set<string>;
}

function grouped(rows: readonly Finding[]): Group[] {
  const by = new Map<string, Group>();
  for (const f of rows) {
    const key = `${f.level}|${f.check}|${f.pair}`;
    let g = by.get(key);
    if (!g) by.set(key, (g = { level: f.level, check: f.check, pair: f.pair, px: f.px, screens: new Set(), whens: new Set() }));
    g.px = Math.max(g.px, f.px);
    g.screens.add(f.screen);
    g.whens.add(f.when);
  }
  return [...by.values()].sort((p, q) => q.px - p.px);
}

/** Compact table of the worst `n` level / pair groups of `rows`. */
function table(rows: readonly Finding[], n = 15): string {
  const groups = grouped(rows);
  const lines = groups.slice(0, n).map((g) => {
    const whens = [...g.whens].join(',').replace(/t=(\S+) en( sel=\S+)?,t=\1 az\2,t=\1 ru\2,t=\1 tr\2/g, 't=$1 all langs$2');
    return `${String(g.level).padStart(5)} | ${g.check.padEnd(14)} | ${g.pair.padEnd(36)} | ${g.px.toFixed(1).padStart(6)} | ${[...g.screens].join(',').padEnd(15)} | ${whens}`;
  });
  if (groups.length > n) lines.push(`  ... ${groups.length - n} more`);
  return ['level | check          | pair                                 | px     | screens         | when', ...lines].join('\n');
}

describe('QA-24: badges, chips and tap targets after the ART-24 zoom, every level', () => {
  let lang: Language;
  let rows: Finding[];
  beforeAll(() => {
    lang = currentLanguage();
    setTilt(undefined);
    expect(playCamera()).toBe(FLAT); // the default camera is the flat map (TILT_DEFAULT = 1)
    rows = survey(playCamera());
  });
  afterAll(() => void setLanguage(lang));

  it('covers every level on both screens, with the card up and gone, nothing or a home selected, in every language', () => {
    expect(LEVELS.length).toBe(50);
    expect(new Set(rows.map((r) => r.level)).size).toBe(50);
    expect(new Set(rows.map((r) => r.screen))).toEqual(new Set(SHAPES.map((s) => s.name)));
    const whens = new Set(rows.map((r) => r.when));
    for (const w of ['t=0 tr', 't=10s ru', 't=0 az sel=home', 't=10s tr sel=home', 't=0 en sel=homeW', 't=10s ru sel=homeE']) expect(whens.has(w), w).toBe(true);
  });

  for (const check of ['badge/badge', 'chip/other', 'badge in band', 'badge in map x', 'badge/card', 'chip in band', 'chip in map x', 'chip/card'] as const) {
    it(`${check}: no level fails`, () => {
      const bad = rows.filter((f) => f.check === check && f.px > 0);
      const msg = bad.length ? `\n${table(bad, process.env.QA24_TABLE ? 999 : 15)}` : '';
      // QA24_TABLE=1: the closest calls of every check per screen (the margins for the daily report)
      if (process.env.QA24_TABLE) for (const sh of SHAPES) console.log(`${check} closest calls on ${sh.name}\n${table(rows.filter((f) => f.check === check && f.screen === sh.name), 3)}`);
      expect(bad.length, msg).toBe(0);
    });
  }

  /*
   * Taps (pointer.ts `hitTower` with the play camera's projection, as play.ts passes it). The hit areas
   * are in the logical frame, which the letterbox maps linearly onto both phones (the CSS → logical half
   * is covered with real touches on both shapes by e2e/camera.spec.ts and e2e/gestures430.spec.ts); the
   * loop over SHAPES keeps the per-screen bookkeeping of the layout checks above.
   */
  interface TapMiss {
    level: number;
    screen: string;
    tap: string;
    want: string;
    got: string;
  }
  const taps = (probe: (state: GameState, cam: Camera, t: Tower, hit: (x: number, y: number) => string, miss: (tap: string, want: string, got: string) => void) => void): TapMiss[] => {
    const cam = playCamera();
    const out: TapMiss[] = [];
    for (const shape of SHAPES) {
      for (const level of LEVELS) {
        const state = createState(level, 1);
        const hit = (x: number, y: number): string => hitTower(state, x, y, TOWER_HIT_RADIUS, (mx, my) => proj(cam, mx, my))?.id ?? 'nothing';
        for (const t of Object.values(state.towers)) probe(state, cam, t, hit, (tap, want, got) => out.push({ level: level.id, screen: shape.name, tap, want, got }));
      }
    }
    return out;
  };
  const missTable = (rows: readonly TapMiss[]): string =>
    ['level | screen  | tap                       | want         | got', ...rows.slice(0, 20).map((m) => `${String(m.level).padStart(5)} | ${m.screen} | ${m.tap.padEnd(25)} | ${m.want.padEnd(12)} | ${m.got}`)].join('\n');

  it('a tap on any base centre resolves to that tower', () => {
    const bad = taps((_s, _c, t, hit, miss) => {
      const got = hit(t.x, t.y);
      if (got !== t.id) miss(`base ${t.id}`, t.id, got);
    });
    expect(bad.length, `\n${missTable(bad)}`).toBe(0);
  });

  it("a tap on a roof top resolves to that tower, or to the tower whose base circle it lies in (BUG-44: nearest such base)", () => {
    let inOther = 0;
    const bad = taps((state, cam, t, hit, miss) => {
      const c = tapShape(cam, t);
      // flat map: screen = map, so the roof top's map point is the drawn one
      const q = { x: c.x, y: c.roof };
      let want = t.id;
      let bestD = Infinity;
      for (const o of Object.values(state.towers)) {
        const oc = tapShape(cam, o);
        const d = Math.hypot(q.x - oc.x, q.y - oc.y);
        if (d <= oc.r && d < bestD) {
          bestD = d;
          want = o.id;
        }
      }
      if (want !== t.id) inOther++;
      const got = hit(q.x, q.y);
      if (got !== want) miss(`roof ${t.id} (${q.x}, ${Math.round(q.y)})`, want, got);
    });
    if (process.env.QA24_TABLE) console.log(`roof taps inside another tower's base circle (per screen x level x tower): ${inOther}`);
    expect(bad.length, `\n${missTable(bad)}`).toBe(0);
  });

  it('a tap 8 px outside every capsule resolves to nothing', () => {
    let probes = 0;
    const perLevel = new Map<number, number>();
    const bad = taps((state, cam, t, hit, miss) => {
      const c = tapShape(cam, t);
      const d = c.r + 8;
      // left / right of the base, under the base, over the roof: 8 px past this tower's capsule
      for (const [name, q] of [
        ['left', { x: c.x - d, y: c.y }],
        ['right', { x: c.x + d, y: c.y }],
        ['below', { x: c.x, y: c.y + d }],
        ['above', { x: c.x, y: c.roof - d }],
      ] as const) {
        if (Object.values(state.towers).some((o) => outsideCapsule(cam, o, q) < 8 - 1e-9)) continue; // inside or within 8 px of some capsule
        probes++;
        perLevel.set(state.levelId, (perLevel.get(state.levelId) ?? 0) + 1);
        const got = hit(q.x, q.y);
        if (got !== 'nothing') miss(`${name} of ${t.id} (${Math.round(q.x)}, ${Math.round(q.y)})`, 'nothing', got);
      }
    });
    if (process.env.QA24_TABLE) console.log(`8 px outside probes: ${probes}`);
    expect(perLevel.size, 'every level has probes outside all capsules').toBe(50);
    expect(bad.length, `\n${missTable(bad)}`).toBe(0);
  });
});
