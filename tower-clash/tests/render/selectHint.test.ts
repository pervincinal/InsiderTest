import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Rect } from '../../src/render/widgets';
import { FONT_RU, font } from '../../src/render/widgets';
import { HUD } from '../../src/render/layout';
import { FLAT, playCamera, proj, setTilt } from '../../src/render/camera';
import { C } from '../../src/sim/constants';
import { hudAnchors } from '../../src/render/view';
import type { HudAnchors } from '../../src/render/view';
import type { PlayUi } from '../../src/render/draw';
import { playLayout } from '../../src/render/draw';
import { SELECT_HINT, lessonCardLayout, selectHintPill } from '../../src/render/hud';
import { selectedFootprint } from '../../src/render/worldChips';
import { loadAllLevels } from '../../src/levels/index';
import { createState } from '../../src/sim/create';
import { currentLanguage, setLanguage, t } from '../../src/ui/i18n';
import type { Language } from '../../src/ui/i18n';
import { ADVANCES, ADVANCE_CHARS, ADVANCE_ERROR } from './fontAdvances';

/*
 * BUG-57 guard (QA-24 style, GD-5d): the select hint pill ("Tap a tower to start a stream · …") never
 * covers a tower. Laid out with the renderer's own `playLayout` (draw.ts) for every level × both phone
 * shapes × the lesson card up (t = 0) and gone (t = 10 s) × every own tower selected × four languages
 * (the pill is the measured text + 40, so its width follows the language). Text is measured with the
 * game's fonts (fontAdvances.ts, widened by its error).
 *
 *   body     ≥ 3 px from every tower's drawn body (draw.ts `worldLayout` bodies: the zoomed plinth's
 *            width, roof apex to plinth front edge), the selected one's with its selection ring
 *   badge    ≥ 3 px from every tower's badge of the frame's final layout
 *   band     inside the map band: under the top HUD band / the lesson card's clay edge, above the bottom
 *            band, inside the map's width
 *   pill     its size and text unchanged (h 38, w = text + 40 ≤ 700), and the pill drawHud draws
 *            (`selectHintPill` against the final layout) is the one the world was laid out round
 * Stream / mine chips are reported with BUG57_TABLE=1 (closest calls), and asserted ≥ 0 (never under it).
 * Level 43 on 360 × 640 with the card up put the moved pill over both top enemy towers (BUG-57).
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

const LEVELS = await loadAllLevels();
const LANGS: readonly Language[] = ['en', 'az', 'ru', 'tr'];
/** Clear space the pill keeps from every tower body / ring / badge. */
const GAP = 3;

interface Finding {
  level: number;
  where: string;
  check: 'body' | 'badge' | 'chip' | 'band' | 'pill';
  what: string;
  /** Clear px (≥ GAP required for body / badge, ≥ 0 for chip / band / pill). */
  px: number;
}

const NEED: Record<Finding['check'], number> = { body: GAP, badge: GAP, chip: 0, band: 0, pill: 0 };

async function survey(): Promise<{ rows: Finding[]; cases: number; spots: Map<string, number> }> {
  const ctx = measuringCtx();
  const rows: Finding[] = [];
  const spots = new Map<string, number>();
  let cases = 0;
  for (const lang of LANGS) {
    await setLanguage(lang);
    ctx.font = font(19, '500');
    const pillW = Math.min(700, ctx.measureText(t('hud.selectHint')).width + 40);
    for (const level of LEVELS) {
      for (const shape of SHAPES) {
        const a = anchorsOf(shape);
        for (const time of [0, 10_000]) {
          const state = { ...createState(level, 1), time };
          const ui = { outcome: 'playing', level } as unknown as PlayUi;
          const lc = lessonCardLayout(ctx, state, ui);
          const card = lc ? { ...lc.rect, y: lc.rect.y + a.top } : null;
          for (const sel of Object.values(state.towers).filter((tw) => tw.owner === 'player')) {
            cases++;
            const { layout, hint } = playLayout(ctx, state, FLAT, sel.id, card, a, true, true);
            const pill = hint!;
            const low = SELECT_HINT.y + a.bottom;
            const top = card ? card.y + card.h + 4 + SELECT_HINT.gap : Math.max(0, HUD.mapTop + a.top) + SELECT_HINT.gap;
            const spot = pill.y === low && pill.x === 360 - pill.w / 2 ? 'low' : pill.y === top && pill.x === 360 - pill.w / 2 ? 'top' : `at ${Math.round(pill.x)},${Math.round(pill.y)}`;
            spots.set(spot.startsWith('at') ? 'other' : spot, (spots.get(spot.startsWith('at') ? 'other' : spot) ?? 0) + 1);
            const where = `${shape.name} ${lang} t=${time / 1000}s sel=${sel.id} pill ${spot}`;
            const add = (check: Finding['check'], what: string, px: number): void => void rows.push({ level: level.id, where, check, what, px });
            for (const [id, body] of layout.bodies) {
              const tw = state.towers[id]!;
              const r = id === sel.id ? selectedFootprint(body, proj(FLAT, tw.x, tw.y)) : body;
              add('body', `${id === sel.id ? 'selected ' : ''}body ${id}`, clearance(pill, r));
            }
            for (const [id, b] of layout.badges) add('badge', `badge ${id}`, clearance(pill, b.rect));
            for (const c of layout.chips) add('chip', `${c.kind} chip ${c.tower ?? ''}`.trim(), clearance(pill, c.rect));
            const bandTop = card ? card.y + card.h + 4 : HUD.mapTop + a.top;
            add('band', 'under the HUD / card', pill.y - bandTop);
            add('band', 'above the bottom band', HUD.mapBottom + a.bottom - (pill.y + pill.h));
            add('band', 'in the map width', Math.min(pill.x, C.MAP_W - (pill.x + pill.w)));
            add('pill', 'size', pill.h === SELECT_HINT.h && Math.abs(pill.w - pillW) < 1e-6 ? 0 : -1);
            const drawn = selectHintPill(ctx, state, sel.id, a, card, FLAT, layout);
            add('pill', 'drawn = laid out', drawn.x === pill.x && drawn.y === pill.y && drawn.w === pill.w ? 0 : -1);
          }
        }
      }
    }
  }
  await setLanguage('en');
  return { rows, cases, spots };
}

function worst(rows: readonly Finding[], n = 15): string {
  return rows
    .slice()
    .sort((p, q) => p.px - q.px)
    .slice(0, n)
    .map((f) => `${f.px.toFixed(1).padStart(7)} | L${String(f.level).padEnd(3)} | ${f.what.padEnd(28)} | ${f.where}`)
    .join('\n');
}

describe('BUG-57: the select hint never covers a tower, every level', () => {
  let lang: Language;
  let res: Awaited<ReturnType<typeof survey>>;
  beforeAll(async () => {
    lang = currentLanguage();
    setTilt(undefined);
    expect(playCamera()).toBe(FLAT);
    res = await survey();
  });
  afterAll(() => void setLanguage(lang));

  it('covers every level on both screens, card up and gone, every own tower selected, four languages', () => {
    const own = LEVELS.reduce((n, l) => n + l.towers.filter((tw) => tw.owner === 'player').length, 0);
    expect(new Set(res.rows.map((r) => r.level)).size).toBe(50);
    expect(own).toBeGreaterThanOrEqual(51); // one home on every level, two on level 8 (homeW, homeE), more where a level starts with an own outpost
    expect(res.cases).toBe(own * SHAPES.length * 2 * LANGS.length);
    if (process.env.BUG57_TABLE) console.log(`select hint spots: ${JSON.stringify(Object.fromEntries(res.spots))}`);
  });

  for (const check of ['body', 'badge', 'chip', 'band', 'pill'] as const) {
    it(`${check}: ≥ ${NEED[check]} px everywhere`, () => {
      const mine = res.rows.filter((r) => r.check === check);
      const bad = mine.filter((r) => r.px < NEED[check]);
      if (process.env.BUG57_TABLE) console.log(`${check}: closest calls\n${worst(mine, 5)}`);
      const levels = [...new Set(bad.map((r) => r.level))].sort((p, q) => p - q);
      expect(bad.length, `\nlevels: ${levels.join(', ')}\n${worst(bad)}`).toBe(0);
    });
  }
});
