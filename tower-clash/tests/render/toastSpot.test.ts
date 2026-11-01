import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Rect } from '../../src/render/widgets';
import { FONT_RU, setTextScale } from '../../src/render/widgets';
import { HUD } from '../../src/render/layout';
import { FLAT, playCamera, proj, setTilt } from '../../src/render/camera';
import { C } from '../../src/sim/constants';
import { hudAnchors } from '../../src/render/view';
import type { HudAnchors } from '../../src/render/view';
import type { PlayUi } from '../../src/render/draw';
import { playLayout } from '../../src/render/draw';
import { lessonCardLayout, playToastObstacles, playToastY, selectHintLowY } from '../../src/render/hud';
import { TOAST, toastBox } from '../../src/render/economyWidgets';
import { selectedFootprint } from '../../src/render/worldChips';
import { loadAllLevels } from '../../src/levels/index';
import { createState } from '../../src/sim/create';
import { currentLanguage, setLanguage, t } from '../../src/ui/i18n';
import type { Language } from '../../src/ui/i18n';
import { ADVANCES, ADVANCE_CHARS, ADVANCE_ERROR } from './fontAdvances';

/*
 * AUD-U11 guard (the BUG-57 select-hint guard's sibling, tests/render/selectHint.test.ts): the toasts the
 * play screen shows (`toast.show` in src/ui/play.ts: the stalemate hint, booster refusals in a challenge,
 * a free charge, Yesterday's-map practice, a chunk that failed to load) never land on a tower. The
 * stalemate toast used to sit at y 1090 over the bottom band on every map, and on a full map (level 25 at
 * 430 × 932) it covered the player's home tower and its selection ring.
 *
 * Laid out with the renderer's own `playLayout` (draw.ts), as drawHud places the toast (`playToastY`
 * against `playToastObstacles` + the select hint pill), for every level × both phone shapes × nothing
 * selected and each own tower selected × the lesson card up (t = 0) and gone (t = 10 s) × four
 * languages × 100 / 150 % text. The pill — at rest and at the top of its 12 px fade-in rise — is either
 *   clear    ≥ 3 px from every tower's drawn body, every badge, the selected tower's selection ring and
 *            the select hint, inside the map band (over the bottom band's top edge, under the top band /
 *            lesson card), or
 *   docked   on the top HUD band (the fallback), which holds no tower: the pill's foot above the band's
 *            lower edge plus what a wrapped toast cannot help (asserted clear of every tower all the same).
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

/** Canvas stand-in whose measureText uses the game's font advances (+ the table's worst error). */
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

/** Clear distance between two rects (≥ 0 apart by that much, < 0 overlapping). */
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
const SCALES = [1, 1.5] as const;
const GAP = 3;
/** The texts src/ui/play.ts shows with `toast.show`. */
const toasts = (): string[] => [
  t('hint.stalemate'),
  t('daily.noBoosters'),
  t('weekly.noBoosters'),
  t('play.freeCharge', { kind: t('booster.overdrive') }),
  t('daily.yesterdayNoReward'),
  t('common.loadFailed'),
];

interface Bad {
  where: string;
  what: string;
  px: number;
}

async function survey(): Promise<{ bad: Bad[]; cases: number; spots: Record<string, number>; l25: string[]; spill: number }> {
  const ctx = measuringCtx();
  const bad: Bad[] = [];
  const spots: Record<string, number> = { low: 0, high: 0, docked: 0 };
  const l25: string[] = [];
  let cases = 0;
  let spill = 0;
  for (const k of SCALES)
  for (const lang of LANGS) {
    setTextScale(k);
    await setLanguage(lang);
    const texts = toasts();
    for (const level of LEVELS) {
      for (const shape of SHAPES) {
        const a = anchorsOf(shape);
        for (const time of [0, 10_000]) {
          const state = { ...createState(level, 1), time };
          const ui = { outcome: 'playing', level } as unknown as PlayUi;
          const lc = lessonCardLayout(ctx, state, ui);
          const card = lc ? { ...lc.rect, y: lc.rect.y + a.top } : null;
          const sels: (string | null)[] = [null, ...Object.values(state.towers).filter((tw) => tw.owner === 'player').map((tw) => tw.id)];
          for (const sel of sels) {
            const { layout, hint } = playLayout(ctx, state, FLAT, sel, card, a, true, true);
            // the truth the pill is checked against, built here: bodies (the selected one with its ring), badges, the hint
            const towers: [string, Rect][] = [];
            for (const [id, body] of layout.bodies) {
              const tw = state.towers[id]!;
              towers.push([`body ${id}`, id === sel ? selectedFootprint(body, proj(FLAT, tw.x, tw.y)) : body]);
            }
            for (const [id, b] of layout.badges) towers.push([`badge ${id}`, b.rect]);
            const others: [string, Rect][] = hint ? [['select hint', hint]] : [];
            const obstacles = playToastObstacles(state, sel, layout); // the select hint included (`layout.hint`)
            if (hint) expect(obstacles).toContain(hint);
            for (const text of texts) {
              const box = toastBox(ctx, text);
              const y = playToastY(box, a, card, obstacles);
              const bottom = y + TOAST.h / 2;
              const rest = { x: 360 - box.w / 2, y: bottom - box.h, w: box.w, h: box.h };
              const bandTop = HUD.topBar.y + HUD.topBar.h + a.top;
              const spot = rest.y === selectHintLowY(box.h, a) ? 'low' : rest.y < bandTop ? 'docked' : 'high';
              spots[spot] = (spots[spot] ?? 0) + 1;
              const ks = `${k * 100}% ${spot}`;
              spots[ks] = (spots[ks] ?? 0) + 1;
              cases++;
              const where = `L${level.id} ${shape.name} ${lang} ${k * 100}% t=${time / 1000}s sel=${sel ?? '-'} ${spot} "${text}"`;
              if (level.id === 25 && sel === 'home' && shape.name === '430x932' && lang === 'en' && k === 1 && time === 10_000 && text === texts[0]) l25.push(spot);
              // a roof drawn under a glass HUD band is HUD territory already: only the part in the map band counts
              const mapTop = HUD.mapTop + a.top;
              const mapBottom = HUD.mapBottom + a.bottom;
              const inMap = (o: Rect): Rect | null => {
                const y0 = Math.max(o.y, mapTop);
                const y1 = Math.min(o.y + o.h, mapBottom);
                return y1 > y0 ? { ...o, y: y0, h: y1 - y0 } : null;
              };
              if (spot === 'docked' && box.h > HUD.topBar.h - 8) {
                // taller than the band (a wrapped toast at 150 %): top-aligned in it, the rest is counted
                if (rest.y !== a.top + 4) bad.push({ where, what: 'docked at the band top', px: -1 });
                if (towers.some(([, o]) => { const m = inMap(o); return m !== null && clearance(rest, m) < GAP; })) spill++;
                continue;
              }
              for (const [what, o] of towers) {
                const m = inMap(o);
                const px = m ? clearance(rest, m) : Infinity;
                if (px < GAP) bad.push({ where, what, px });
              }
              if (spot === 'docked') continue;
              for (const [what, o] of others) {
                const px = clearance(rest, o);
                if (px < GAP) bad.push({ where, what, px });
              }
              const top = card && spot === 'high' ? card.y + card.h + 4 : mapTop;
              if (rest.y < top) bad.push({ where, what: 'under the HUD / card', px: rest.y - top });
              if (rest.y + rest.h > mapBottom) bad.push({ where, what: 'above the bottom band', px: mapBottom - rest.y - rest.h });
            }
          }
        }
      }
    }
  }
  setTextScale(1);
  await setLanguage('en');
  return { bad, cases, spots, l25, spill };
}

describe('AUD-U11: play toasts never land on a tower, every level', () => {
  let lang: Language;
  let res: Awaited<ReturnType<typeof survey>>;
  beforeAll(async () => {
    lang = currentLanguage();
    setTilt(undefined);
    expect(playCamera()).toBe(FLAT);
    res = await survey();
  });
  afterAll(() => void setLanguage(lang));

  it('covers every level on both screens, nothing / each own tower selected, card up and gone, four languages, 100 / 150 % text', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(50);
    const own = LEVELS.reduce((n, l) => n + 1 + l.towers.filter((tw) => tw.owner === 'player').length, 0);
    expect(res.cases).toBe(own * SHAPES.length * 2 * LANGS.length * SCALES.length * toasts().length);
    if (process.env.U11_TABLE) console.log(`toast spots: ${JSON.stringify(res.spots)}, docked taller than the band and over a tower: ${res.spill}`);
    expect(res.spots.low).toBeGreaterThan(0);
  });

  it('the audit frame: level 25, home selected, 430 × 932 — the stalemate toast leaves the bottom spot', () => {
    expect(res.l25).toHaveLength(1);
    expect(res.l25[0]).not.toBe('low');
  });

  it(`clear of every tower body, badge, selection ring (and the select hint) by ≥ ${GAP} px, inside the map band unless docked`, () => {
    const worst = res.bad
      .slice()
      .sort((p, q) => p.px - q.px)
      .slice(0, 15)
      .map((b) => `${b.px.toFixed(1).padStart(7)} | ${b.what.padEnd(22)} | ${b.where}`)
      .join('\n');
    if (process.env.U11_TABLE) {
      const by: Record<string, number> = {};
      for (const x of res.bad) {
        const m = / (\d+)% .* (low|high|docked) "/.exec(x.where);
        const key = `${m?.[1]}% ${m?.[2]} ${x.what.split(' ')[0]}`;
        by[key] = (by[key] ?? 0) + 1;
      }
      console.log(JSON.stringify(by));
      for (const x of res.bad.filter((b) => b.where.includes(' 100% ')).slice(0, 8)) console.log(x.px.toFixed(1), x.what, x.where);
    }
    expect(res.bad.length, `\n${worst}`).toBe(0);
  });
});
