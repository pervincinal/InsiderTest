import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import type { View } from '../../src/render/view';
import { drawTutorial, loadTutorialBubble, preloadTutorialBubble, tutorialBubbleLoaded } from '../../src/render/tutorialDraw';
import type { Rect } from '../../src/render/widgets';
import { FONT_RU, font } from '../../src/render/widgets';
import { HUD } from '../../src/render/layout';
import type { Camera } from '../../src/render/camera';
import { FLAT, playCamera, proj, setTilt } from '../../src/render/camera';
import { makeCamera } from '../../src/render/perspective';
import { C } from '../../src/sim/constants';
import { hudAnchors } from '../../src/render/view';
import type { HudAnchors } from '../../src/render/view';
import type { PlayUi } from '../../src/render/draw';
import { playLayout, worldLayout } from '../../src/render/draw';
import { SELECT_HINT, lessonCardLayout, selectHintAvoid, selectHintMoved, selectHintPill } from '../../src/render/hud';
import { CARD_CLEAR, selectedFootprint, setFrameWorldLayout } from '../../src/render/worldChips';
import { TUTORIAL_BUBBLE, tutorialBand, tutorialLayout } from '../../src/render/tutorialBubble';
import type { TutorialLayout } from '../../src/render/tutorialBubble';
import { loadAllLevels } from '../../src/levels/index';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { capacityOf } from '../../src/sim/step';
import type { GameState, LevelDef } from '../../src/sim/types';
import { currentLanguage, setLanguage, t } from '../../src/ui/i18n';
import type { Language } from '../../src/ui/i18n';
import type { TutorialStep } from '../../src/ui/tutorial';
import { stepTowerId, tutorialFor } from '../../src/ui/tutorial';
import { ADVANCES, ADVANCE_CHARS, ADVANCE_ERROR } from './fontAdvances';

/*
 * GD-5c / GD-5d guard (QA-24 style): the first-play tutorial bubble of levels 1–4 and the select hint,
 * laid out with the renderer's own functions (draw.ts `playLayout` → render/tutorialBubble.ts
 * `tutorialLayout`) for every step of each level, in states where the step is
 * on screen (its `showWhen` holds), on both phone shapes, in all four languages, with the lesson card
 * up (t = 0) and gone (t = 10 s), with nothing selected and with home selected (the select hint pill
 * is an obstacle then). Text is measured with the game's fonts (fontAdvances.ts, widened by its error).
 *
 *   bubble   the bubble and its arrow, over the whole span they bob over, keep ≥ 3 px from every other
 *            tower's badge, stream / mine chip and drawn body, from the target's own badge (BUG-35) and
 *            from the select hint; they stay inside the play band (under the HUD / lesson card) and the
 *            map's width; every line fits the bubble's text slot (no squeeze).
 *   hint     the select hint never overlaps the selected tower's footprint (body + ring) or badge; on
 *            360 × 640 it moves up off the homes of levels 1–5, on 430 × 932 it stays where it was (but
 *            for levels 3 and 5). GD-6g: levels 1–10 × every own tower selected (level 8's homeW / homeE)
 *            × both screens × card up / gone × four languages — the homes of 6–10 move it too on
 *            360 × 640, and a moved hint clears every badge and chip. BUG-57: where it goes (never on
 *            any tower) is guarded for every level by tests/render/selectHint.test.ts; with a step on
 *            screen the renderer passes the step's tower, and the hint leaves the bubble room round it.
 * The perspective camera (`?tilt=0.72`) uses the same placement: it must lay every case out without
 * throwing (its clearances are reported with GD5C_TABLE=1, not asserted).
 */

const SHAPES = [
  { name: '430x932', cssW: 430, cssH: 932, insets: { top: 59, right: 0, bottom: 34, left: 0 } },
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

/** Clear distance between two rects (logical px): ≥ 0 = apart by that much along the separating axis, < 0 = overlapping by that much. */
function clearance(a: Rect, b: Rect): number {
  const sx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const sy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  if (sx >= 0 || sy >= 0) return Math.max(sx, sy);
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return -Math.min(ox, oy);
}

const LEVELS = (await loadAllLevels()).filter((l) => l.id <= 5);
const LANGS: readonly Language[] = ['en', 'az', 'ru', 'tr'];

const link = (state: GameState, from: string, to: string): void => applyCommand(state, { type: 'link', owner: 'player', from, to });
const capture = (state: GameState, id: string, units = 5): void => {
  state.towers[id]!.owner = 'player';
  state.towers[id]!.units = units;
};

/** States in which step `i` of `level`'s tutorial is on screen (its `showWhen` holds), each with a label. */
function scenarios(level: LevelDef, i: number): { label: string; state: GameState }[] {
  const fresh = (): GameState => createState(level, 1);
  const with_ = (label: string, set: (s: GameState) => void): { label: string; state: GameState } => {
    const s = fresh();
    set(s);
    return { label, state: s };
  };
  const key = `${level.id}.${i + 1}`;
  switch (key) {
    case '1.1':
    case '1.2':
    case '2.1':
    case '3.1':
      return [with_('start', () => undefined)];
    case '2.2':
      return [with_('side ours', (s) => capture(s, 'side')), with_('side ours, home → side', (s) => (capture(s, 'side'), link(s, 'home', 'side')))];
    case '2.3':
      return [with_('home → side', (s) => (capture(s, 'side'), link(s, 'home', 'side'))), with_('home → side, side → foe', (s) => (capture(s, 'side'), link(s, 'home', 'side'), link(s, 'side', 'foe')))];
    case '2.4':
      // the mid-first line: mid ours, full, streaming at the foe — home can start a supply line into it
      return [
        with_('mid full → foe', (s) => {
          capture(s, 'mid');
          s.towers['mid']!.units = capacityOf(s.towers['mid']!, s);
          link(s, 'mid', 'foe');
        }),
      ];
    case '3.2':
      return [
        with_('east ours', (s) => capture(s, 'east')),
        with_('west ours', (s) => capture(s, 'west')),
        with_('east ours, home → east', (s) => (capture(s, 'east'), link(s, 'home', 'east'))),
        with_('west ours, home → west', (s) => (capture(s, 'west'), link(s, 'home', 'west'))),
      ];
    case '3.3':
      // GD-7h, west first: stop home → west (the ring on west), before and after west → east
      return [
        with_('west ours, home → west', (s) => (capture(s, 'west'), link(s, 'home', 'west'))),
        with_('west ours, home → west, west → east', (s) => (capture(s, 'west'), link(s, 'home', 'west'), link(s, 'west', 'east'))),
      ];
    case '3.4':
      return [with_('west ours, west → east, home free', (s) => (capture(s, 'west'), link(s, 'west', 'east')))];
    case '4.1':
      return [with_('outpost ours, home → outpost', (s) => (capture(s, 'outpost'), link(s, 'home', 'outpost'))), with_('outpost ours, home → mid', (s) => (capture(s, 'outpost'), link(s, 'home', 'mid')))];
    case '4.2':
      return [with_('start', () => undefined), with_('outpost ours', (s) => capture(s, 'outpost'))];
    default:
      throw new Error(`no scenario for step ${key}`);
  }
}

interface Finding {
  where: string;
  check: 'bubble/other' | 'bubble/own badge' | 'bubble/hint' | 'band' | 'text slot';
  what: string;
  /** Clear px (≥ 3 required for the obstacle checks, ≥ 0 for band / text slot). */
  px: number;
}

/** The world + tutorial layout the renderer draws for `step` in `state` (`sel` selected, at `time`). */
function lay(state: GameState, level: LevelDef, step: TutorialStep, a: HudAnchors, cam: Camera, sel: string | null): { L: TutorialLayout; hint: Rect | null; band: { top: number; bottom: number } } {
  const ctx = measuringCtx();
  const ui = { outcome: 'playing', level, selectedTowerId: sel } as unknown as PlayUi;
  const lc = lessonCardLayout(ctx, state, ui);
  const card = lc ? { ...lc.rect, y: lc.rect.y + a.top } : null;
  // BUG-57: the renderer passes the step's tower (play.ts `tutorialTowerId`): the hint leaves its bubble room
  const { layout, hint } = playLayout(ctx, state, cam, sel, card, a, true, sel !== null, stepTowerId(step, state));
  setFrameWorldLayout(state, layout);
  const L = tutorialLayout(ctx, state, step, layout, card, hint, a, cam, sel);
  expect(L, `${level.id}: tutorial layout`).not.toBeNull();
  return { L: L!, hint, band: tutorialBand(a, card) };
}

/** Every case on `cam`: findings (all measured, failing or not) and the number of placements. */
async function survey(cam: Camera): Promise<{ rows: Finding[]; cases: number; sides: Map<string, number> }> {
  const rows: Finding[] = [];
  const sides = new Map<string, number>();
  let cases = 0;
  for (const level of LEVELS.filter((l) => l.id <= 4)) {
    const steps = tutorialFor(level.id, 0)!.steps;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      for (const sc of scenarios(level, i)) {
        expect(step.showWhen?.(sc.state) ?? true, `level ${level.id} step ${i + 1} (${sc.label}) is on screen`).toBe(true);
        for (const shape of SHAPES) {
          const a = anchorsOf(shape);
          for (const lang of LANGS) {
            await setLanguage(lang);
            expect(step.text.startsWith('tutorial.'), `${lang} text of level ${level.id} step ${i + 1}`).toBe(false);
            for (const time of [0, 10_000]) {
              for (const sel of [null, 'home']) {
                const state = { ...sc.state, time };
                const { L, hint, band } = lay(state, level, step, a, cam, sel);
                cases++;
                const where = `L${level.id} s${i + 1} ${sc.label} | ${shape.name} ${lang} t=${time / 1000}s sel=${sel ?? '-'}`;
                const p = L.place;
                sides.set(p.side, (sides.get(p.side) ?? 0) + 1);
                for (const h of p.hull) {
                  for (const o of L.obstacles) {
                    // the target's own body (the arrow points at it) and own stream chip are not guarded; on a stream anchor every tower is "other"
                    const own = !L.ring.lane && o.tower === L.tower;
                    if (own && o.kind !== 'badge') continue;
                    const check = o.kind === 'hint' ? 'bubble/hint' : own ? 'bubble/own badge' : 'bubble/other';
                    rows.push({ where, check, what: `${o.kind} ${o.tower ?? ''}`.trim(), px: clearance(h, o.rect) });
                  }
                  rows.push({ where, check: 'band', what: 'bubble in band', px: Math.min(h.y - band.top, band.bottom - (h.y + h.h), h.x, C.MAP_W - (h.x + h.w)) });
                }
                if (hint) rows.push({ where, check: 'bubble/hint', what: 'hint', px: Math.min(...p.hull.map((h) => clearance(h, hint))) });
                // measured again at the hint font of this language (the RU stack measures wider)
                const ctx = measuringCtx();
                ctx.font = font(TUTORIAL_BUBBLE.px);
                const widest = Math.max(...p.lines.map((l) => ctx.measureText(l).width));
                rows.push({ where, check: 'text slot', what: `${p.lines.length} line(s), ${widest.toFixed(0)} / ${(p.rect.w - 2 * TUTORIAL_BUBBLE.padX).toFixed(0)} px`, px: p.rect.w - 2 * TUTORIAL_BUBBLE.padX - widest });
                if (p.lines.join(' ') !== step.text.split(' ').filter(Boolean).join(' ')) rows.push({ where, check: 'text slot', what: 'lines lose text', px: -1 });
              }
            }
          }
        }
      }
    }
  }
  await setLanguage('en');
  return { rows, cases, sides };
}

const NEED: Record<Finding['check'], number> = { 'bubble/other': 3, 'bubble/own badge': 3, 'bubble/hint': 3, band: 0, 'text slot': 0 };

function worst(rows: readonly Finding[], n = 12): string {
  return rows
    .slice()
    .sort((p, q) => p.px - q.px)
    .slice(0, n)
    .map((f) => `${f.px.toFixed(1).padStart(7)} | ${f.check.padEnd(16)} | ${f.what.padEnd(26)} | ${f.where}`)
    .join('\n');
}

describe('GD-5c: the tutorial bubble never covers a tower, levels 1–4', () => {
  let lang: Language;
  let flat: Awaited<ReturnType<typeof survey>>;
  beforeAll(async () => {
    lang = currentLanguage();
    setTilt(undefined);
    expect(playCamera()).toBe(FLAT);
    flat = await survey(FLAT);
  });
  afterAll(() => void setLanguage(lang));

  it('covers every step of levels 1–4 on both screens, in four languages, card up and gone, with and without a selection', () => {
    // steps: L1 2 + L2 4 + L3 4 + L4 2 = 12; scenarios: 1 + 1 + 1 + 2 + 2 + 1 + 1 + 4 + 2 + 1 + 2 + 2 = 20; × 2 shapes × 4 languages × 2 times × 2 selections
    expect(flat.cases).toBe(20 * 2 * 4 * 2 * 2);
    if (process.env.GD5C_TABLE) console.log(`sides taken (flat): ${JSON.stringify(Object.fromEntries(flat.sides))}`);
  });

  for (const check of ['bubble/other', 'bubble/own badge', 'bubble/hint', 'band', 'text slot'] as const) {
    it(`${check}: ≥ ${NEED[check]} px everywhere`, () => {
      const mine = flat.rows.filter((r) => r.check === check);
      const bad = mine.filter((r) => r.px < NEED[check]);
      if (process.env.GD5C_TABLE) console.log(`${check}: closest calls\n${worst(mine, 5)}`);
      expect(bad.length, `\n${worst(bad)}`).toBe(0);
    });
  }

  it('the perspective camera (?tilt=0.72) lays out every case with the same placement, without throwing', async () => {
    const tilted = await survey(makeCamera(0.72));
    expect(tilted.cases).toBe(flat.cases);
    if (process.env.GD5C_TABLE) {
      console.log(`sides taken (tilt 0.72): ${JSON.stringify(Object.fromEntries(tilted.sides))}`);
      for (const check of Object.keys(NEED) as Finding['check'][]) console.log(`tilt ${check}: closest calls\n${worst(tilted.rows.filter((r) => r.check === check), 3)}`);
    }
  });
});

describe('GD-5d: the select hint never sits on the selected tower', () => {
  const ctx = measuringCtx();
  /** draw.ts `playLayout` for `sel` on `state`: the hint pill, the selected tower's footprint / badge, and every badge / chip of the final layout. */
  const hintFor = (level: LevelDef, state: GameState, sel: string, a: HudAnchors): { pill: Rect; avoid: Rect[]; world: { label: string; rect: Rect }[] } => {
    const ui = { outcome: 'playing', level } as unknown as PlayUi;
    const lc = lessonCardLayout(ctx, state, ui);
    const card = lc ? { ...lc.rect, y: lc.rect.y + a.top } : null;
    const { layout, hint } = playLayout(ctx, state, FLAT, sel, card, a, true, true);
    const world = [...[...layout.badges].map(([id, b]) => ({ label: `badge ${id}`, rect: b.rect })), ...layout.chips.map((c) => ({ label: `${c.kind} chip ${c.tower ?? ''}`, rect: c.rect }))];
    return { pill: hint!, avoid: selectHintAvoid(state, sel, FLAT, layout), world };
  };

  it('levels 1–5, home selected: on 360 × 640 the hint moves up off the home; on 430 × 932 it stays above the bottom band', async () => {
    for (const lang of LANGS) {
      await setLanguage(lang);
      expect(t('hud.selectHint').startsWith('hud.')).toBe(false);
      for (const level of LEVELS) {
        for (const shape of SHAPES) {
          const a = anchorsOf(shape);
          const { pill, avoid } = hintFor(level, { ...createState(level, 1), time: 10_000 }, 'home', a);
          for (const r of avoid) expect(clearance(pill, r), `L${level.id} ${shape.name} ${lang}`).toBeGreaterThanOrEqual(0);
          // BUG-57: up to the top of the map band, or — where that covers a far tower (levels 2–5) — between the rows (tests/render/selectHint.test.ts)
          const up = (): void => {
            expect(selectHintMoved(pill, a), `L${level.id} ${shape.name} ${lang}: moved up`).toBe(true);
            expect(pill.y + pill.h, `L${level.id} ${shape.name} ${lang}: over the home`).toBeLessThan(avoid[0]!.y);
            expect(pill.y, `L${level.id} ${shape.name} ${lang}: under the top band`).toBeGreaterThanOrEqual(Math.max(0, HUD.mapTop + a.top));
          };
          if (shape.name === '360x640') up();
          // 430 × 932: unchanged, but for level 3 (home at y 1150: its selection ring reaches 8 px under the pill) and,
          // with BUG-57's 3 px clearance, level 5 (home at y 1140: the ring ends 2 px over it), so the rule moves it too
          else if (level.id !== 3 && level.id !== 5) expect(pill.y, `L${level.id} ${lang}: unchanged`).toBe(SELECT_HINT.y + a.bottom);
          else up();
        }
      }
    }
    await setLanguage('en');
  });

  it('every level, any own tower selected, both screens, card up and gone: the hint clears the selected tower, and a moved hint every badge and chip (they clamp under it like under the lesson card)', async () => {
    const all = await loadAllLevels();
    const bad: string[] = [];
    let moved = 0;
    for (const level of all) {
      for (const shape of SHAPES) {
        const a = anchorsOf(shape);
        for (const time of [0, 10_000]) {
          const state = { ...createState(level, 1), time };
          for (const t0 of Object.values(state.towers).filter((tw) => tw.owner === 'player')) {
            const { pill, avoid, world } = hintFor(level, state, t0.id, a);
            const where = `L${level.id} ${shape.name} t=${time / 1000}s sel=${t0.id}`;
            for (const r of avoid) if (clearance(pill, r) < 0) bad.push(`${where}: on the selected tower (${clearance(pill, r).toFixed(1)})`);
            if (pill.y === SELECT_HINT.y + a.bottom) continue;
            moved++;
            for (const w of world) if (clearance(pill, w.rect) < 0) bad.push(`${where}: moved hint on ${w.label} (${clearance(pill, w.rect).toFixed(1)})`);
          }
        }
      }
    }
    if (process.env.GD5C_TABLE) console.log(`select hint moved up in ${moved} of the cases`);
    expect(bad, bad.slice(0, 15).join('\n')).toEqual([]);
  });

  it('GD-6g: levels 1–10, every own tower selected, both screens, card up and gone, four languages: the hint clears the selected tower, a moved hint every badge and chip, and the drawn pill is the laid-out one', async () => {
    const levels = (await loadAllLevels()).filter((l) => l.id <= 10);
    const bad: string[] = [];
    let cases = 0;
    let moved = 0;
    let worstSel = { px: Infinity, where: '' };
    let worstWorld = { px: Infinity, where: '' };
    let worstBody = { px: Infinity, where: '' };
    const homes = new Set<string>();
    const textW: string[] = [];
    for (const lang of LANGS) {
      await setLanguage(lang);
      ctx.font = font(19, '500');
      textW.push(`${lang} ${ctx.measureText(t('hud.selectHint')).width.toFixed(0)}`);
      for (const level of levels) {
        for (const shape of SHAPES) {
          const a = anchorsOf(shape);
          for (const time of [0, 10_000]) {
            const state = { ...createState(level, 1), time };
            for (const t0 of Object.values(state.towers).filter((tw) => tw.owner === 'player')) {
              const ui = { outcome: 'playing', level } as unknown as PlayUi;
              const lc = lessonCardLayout(ctx, state, ui);
              const card = lc ? { ...lc.rect, y: lc.rect.y + a.top } : null;
              const { layout, hint } = playLayout(ctx, state, FLAT, t0.id, card, a, true, true);
              const pill = hint!;
              cases++;
              const where = `L${level.id} ${shape.name} ${lang} t=${time / 1000}s sel=${t0.id}`;
              // drawHud measures the pill again against the frame's final layout: it must be the one the badges were laid out round
              const drawn = selectHintPill(ctx, state, t0.id, a, card, FLAT, layout);
              if (drawn.x !== pill.x || drawn.y !== pill.y || drawn.w !== pill.w) bad.push(`${where}: drawn pill ${JSON.stringify(drawn)} ≠ laid-out ${JSON.stringify(pill)}`);
              if (pill.x < 0 || pill.x + pill.w > C.MAP_W) bad.push(`${where}: pill outside the map width`);
              for (const r of selectHintAvoid(state, t0.id, FLAT, layout)) {
                const px = clearance(pill, r);
                if (px < 0) bad.push(`${where}: on the selected tower (${px.toFixed(1)})`);
                if (px < worstSel.px) worstSel = { px, where };
              }
              // GD-6 (f): every home of 6–10 (both of level 8's) stands under the low spot on 360 × 640
              if (level.id >= 6 && shape.name === '360x640') {
                homes.add(`${level.id}:${t0.id}`);
                if (!selectHintMoved(pill, a)) bad.push(`${where}: not moved`);
              }
              if (!selectHintMoved(pill, a)) continue;
              moved++;
              // BUG-57: at the top of the map band, or lower where that covers a tower — never over the card / top band
              const bandTop = card ? card.y + card.h + 4 : Math.max(0, HUD.mapTop + a.top);
              if (pill.y < bandTop + CARD_CLEAR) bad.push(`${where}: moved hint at y ${pill.y}, over ${bandTop + CARD_CLEAR}`);
              const world = [...[...layout.badges].map(([id, b]) => ({ label: `badge ${id}`, rect: b.rect })), ...layout.chips.map((c) => ({ label: `${c.kind} chip ${c.tower ?? ''}`, rect: c.rect }))];
              for (const w of world) {
                const px = clearance(pill, w.rect);
                if (px < 0) bad.push(`${where}: moved hint on ${w.label} (${px.toFixed(1)})`);
                if (px < worstWorld.px) worstWorld = { px, where: `${where} ${w.label}` };
              }
              // reported here: how close the moved pill comes to a drawn tower body (asserted ≥ 3 px by tests/render/selectHint.test.ts, BUG-57)
              for (const [id, b] of layout.bodies) {
                const px = clearance(pill, b);
                if (px < worstBody.px) worstBody = { px, where: `${where} body ${id}` };
              }
            }
          }
        }
      }
    }
    await setLanguage('en');
    if (process.env.GD5C_TABLE) {
      console.log(`GD-6g: ${cases} cases, hint moved in ${moved}; hint text at 19 px (pill = text + 40, ≤ 700): ${textW.join(', ')}`);
      console.log(`closest: selected ${worstSel.px.toFixed(1)} px (${worstSel.where}); moved hint / badge or chip ${worstWorld.px.toFixed(1)} px (${worstWorld.where}); moved hint / body ${worstBody.px.toFixed(1)} px (${worstBody.where})`);
    }
    // own towers at start: one home on every level but 8 (homeW, homeE) → 11 × 2 shapes × 2 times × 4 languages
    expect(cases).toBe(11 * 2 * 2 * 4);
    expect([...homes].sort()).toEqual(['10:home', '6:home', '7:home', '8:homeE', '8:homeW', '9:home']);
    expect(bad, bad.slice(0, 15).join('\n')).toEqual([]);
  });

  it('with the lesson card up the moved hint sits under the card', () => {
    const level = LEVELS[1]!;
    const a = anchorsOf(SHAPES[1]);
    const state = createState(level, 1);
    const ui = { outcome: 'playing', level } as unknown as PlayUi;
    const lc = lessonCardLayout(ctx, state, ui)!;
    const card = { ...lc.rect, y: lc.rect.y + a.top };
    const { pill } = hintFor(level, state, 'home', a);
    // BUG-57: level 2's foe stands under the card's top spot, so the hint goes under the foe's row
    expect(pill.y).toBeGreaterThanOrEqual(card.y + card.h + 4 + CARD_CLEAR);
    expect(pill.y).toBeLessThan(SELECT_HINT.y);
  });

  it('a selected tower away from the hint keeps it above the bottom band (level 2, mid; 430 × 932) — unless another tower stands there (360 × 640: home, BUG-57)', () => {
    const level = LEVELS[1]!;
    const tall = anchorsOf(SHAPES[0]);
    const a = anchorsOf(SHAPES[1]);
    const state = { ...createState(level, 1), time: 10_000 };
    capture(state, 'mid');
    expect(hintFor(level, state, 'mid', tall).pill.y).toBe(SELECT_HINT.y + tall.bottom);
    const small = hintFor(level, state, 'mid', a).pill;
    expect(selectHintMoved(small, a)).toBe(true);
    expect(clearance(small, worldLayout(ctx, state, FLAT, 'mid', null, true).bodies.get('home')!)).toBeGreaterThanOrEqual(3);
    // the footprint grows round the base with the selection ring
    const layout = worldLayout(ctx, state, FLAT, 'mid', null, true);
    const tw = state.towers['home']!;
    const body = layout.bodies.get('home')!;
    const fp = selectedFootprint(body, proj(FLAT, tw.x, tw.y));
    expect(fp.y + fp.h).toBeGreaterThan(body.y + body.h);
  });
});

describe('GD-5c: the bubble is a lazy chunk (render/tutorialDraw.ts → render/tutorialBubble.ts)', () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : []));

  it('only tutorialDraw.ts imports it, dynamically; nothing imports it statically (type imports aside)', () => {
    const all = files(SRC);
    const statics = all.filter((f) => /^import\s+(?!type\b)[^;]*from\s+'[^']*\/tutorialBubble'/m.test(readFileSync(f, 'utf8')));
    expect(statics.map((f) => f.slice(SRC.length + 1))).toEqual([]);
    const dynamic = all.filter((f) => /\bimport\(\s*'[^']*\/tutorialBubble'\s*\)/.test(readFileSync(f, 'utf8')));
    expect(dynamic.map((f) => f.slice(SRC.length + 1))).toEqual(['render/tutorialDraw.ts']);
  });

  it('draws nothing (and does not throw) until the chunk is in, then the ring, arrow and bubble; preloads only first plays of levels 1–4', async () => {
    let fills = 0;
    const ctx = new Proxy(measuringCtx(), {
      get(target, key) {
        if (key === 'fill') return () => void fills++;
        return Reflect.get(target, key) as unknown;
      },
    });
    const level = LEVELS[0]!;
    const state = createState(level, 1);
    const view = { cssW: 360, cssH: 640, scale: 0.5, offsetX: 0, offsetY: 0, insets: { top: 0, right: 0, bottom: 0, left: 0 } } as unknown as View;
    const ui = { outcome: 'playing', level, selectedTowerId: null, palette: DEFAULT_PALETTE } as unknown as PlayUi;
    const step = tutorialFor(1, 0)!.steps[0]!;
    expect(tutorialBubbleLoaded()).toBe(false);
    expect(preloadTutorialBubble(5, 0)).toBeNull();
    expect(preloadTutorialBubble(1, 1)).toBeNull();
    expect(() => drawTutorial(ctx, state, view, ui, step, 0)).not.toThrow(); // starts the load
    expect(fills).toBe(0);
    await loadTutorialBubble();
    expect(tutorialBubbleLoaded()).toBe(true);
    expect(preloadTutorialBubble(1, 0)).toBeNull(); // already in
    drawTutorial(ctx, state, view, ui, step, 0);
    expect(fills).toBe(2); // the arrow and the bubble (the ring is stroked)
  });
});
