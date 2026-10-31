import { describe, expect, it } from 'vitest';
import { BOOSTERS, CONFIRM, HUD, PAUSE, RESULT, TITLE } from '../../src/render/layout';
import {
  ACHIEVEMENTS_LAYOUT,
  HOWTO,
  HOWTO_BANDS,
  LEVEL_MAP,
  SETTINGS,
  SETTINGS_BANDS,
  SHOP,
  levelMapBands,
  levelNodeRect,
  settingsAboutLayout,
  shopBuyRect,
  shopConvertSegRect,
  shopPackRect,
  shopRowRect,
  shopSkinRect,
  shopTabsFor,
} from '../../src/render/menuLayout';
import { resultShareLayout } from '../../src/render/hud';
import type { ResultExtras } from '../../src/render/hud';
import type { Rect } from '../../src/render/widgets';
import { hitArea, hitRect, minHit } from '../../src/render/widgets';
import { LANGUAGE_SEGMENTS, MOTION_SEGMENTS, TEXT_SIZE_SEGMENTS, TONE_SEGMENTS } from '../../src/render/menusSettings';
import { CONVERSION_PACKS } from '../../src/economy/purchases';
import { UPGRADE_DEFS } from '../../src/ui/upgrades';

/*
 * AUD-U1 / AUD-Q6 guard: every tap target is at least 44 CSS px (= pt) both ways on a 360 × 640 and a
 * 430 × 932 phone, and no two tap areas of one screen overlap. The layout is 720 × 1280 drawn at
 * `view.scale` CSS px per layout px (0.50 at 360 wide, 0.597 at 430), so a tap area is the drawn rect
 * padded about its centre to `minHit(view)` = 44 / scale layout px (`hitArea`; every screen hit-tests
 * through `hitRect`). Each list below is the screen's own hit list, built from the real layout rects
 * and helpers. A rect with a `band` is only routed to it inside that layout y range (the play HUD
 * bands, a menu's header / bottom chrome), so its tap area is measured clipped to the band.
 * `nestedIn` marks a button drawn on a larger tappable card (the DAILY / WEEKLY tabs on the challenge
 * card): the screen tests it first, so the overlap with its card is the button's.
 */

interface Target {
  name: string;
  r: Rect;
  /** Layout y range in which a point is routed to this rect (default: the 720 × 1280 frame). */
  band?: readonly [number, number];
  /** Name of the card it is drawn on (overlap with that one is allowed; the screen tests the button first). */
  nestedIn?: string;
}

const PHONES = [
  { w: 360, h: 640 },
  { w: 430, h: 932 },
] as const;

/** `src/render/view.ts resize` without insets: the 720 × 1280 frame letterboxed by width on a phone. */
const scaleOf = (w: number, h: number): number => Math.min(w / 720, h / 1280);

/** Tap area of `t` at view scale `s`, clipped to its band and to the 720-wide frame. */
function area(t: Target, s: number): Rect {
  const a = hitArea(t.r, minHit({ scale: s }));
  const [lo, hi] = t.band ?? [-Infinity, Infinity];
  const x0 = Math.max(0, a.x);
  const x1 = Math.min(720, a.x + a.w);
  const y0 = Math.max(lo, a.y);
  const y1 = Math.min(hi, a.y + a.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const overlap = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** The segments of a segmented control (menuWidgets `segmentAt` geometry: 4 px inset each side). */
function segments(name: string, r: Rect, n: number, band?: readonly [number, number]): Target[] {
  const w = (r.w - 8) / n;
  return Array.from({ length: n }, (_, i) => ({ name: `${name}[${i}]`, r: { x: r.x + 4 + i * w, y: r.y, w, h: r.h }, band }));
}

const t = (name: string, r: Rect, band?: readonly [number, number], nestedIn?: string): Target => ({ name, r, band, nestedIn });

/* ---------- the screens ---------- */

const TOP: readonly [number, number] = [0, HUD.mapTop];
const BOTTOM: readonly [number, number] = [HUD.mapBottom, 1280];
const playHud = (): Target[] => [
  t('HUD.pause', HUD.pause, TOP),
  t('HUD.mute', HUD.mute, TOP),
  t('BOOSTERS.overdrive', BOOSTERS.overdrive, BOTTOM),
  t('BOOSTERS.freeze', BOOSTERS.freeze, BOTTOM),
  t('BOOSTERS.airstrike', BOOSTERS.airstrike, BOTTOM),
  t('HUD.menu', HUD.menu, BOTTOM),
];

const pauseCard = (): Target[] => [
  t('HUD.pause', HUD.pause, TOP),
  t('HUD.mute', HUD.mute, TOP),
  t('HUD.menu', HUD.menu, BOTTOM),
  ...(['resume', 'speed', 'sound', 'settings', 'retry', 'menu', 'howto'] as const).map((k) => t(`PAUSE.${k}`, PAUSE[k])),
];

type ResultCase = Pick<ResultExtras, 'share' | 'doubleGold' | 'doubled' | 'skipCrystals' | 'continueCrystals' | 'continueAd' | 'howto'>;

/** ResultScreen.rects() for a result with these offers. */
function result(won: boolean, hasNext: boolean, ex: ResultCase): Target[] {
  const list: Target[] = [t('RESULT.retry', RESULT.retry), t('RESULT.menu', RESULT.menu), t('HUD.wallet', HUD.wallet, BOTTOM), t('HUD.menu', HUD.menu, BOTTOM)];
  if (won && hasNext) list.push(t('RESULT.next', RESULT.next));
  if ((won && ex.doubleGold !== null && !ex.doubled) || (!won && ex.skipCrystals !== null)) list.push(t('RESULT.extra', RESULT.extra));
  const both = ex.continueCrystals !== null && ex.continueAd;
  if (ex.continueCrystals !== null) list.push(t('continueCrystals', both ? RESULT.continueCrystals : RESULT.continueSolo));
  if (ex.continueAd) list.push(t('continueAd', both ? RESULT.continueAd : RESULT.continueSolo));
  if (ex.howto) list.push(t('RESULT.howto', RESULT.howto));
  const share = resultShareLayout(ex, won).share;
  if (share) list.push(t('share', share));
  return list;
}

const confirmCard = (): Target[] => [t('CONFIRM.yes', CONFIRM.yes), t('CONFIRM.no', CONFIRM.no)];

const title = (): Target[] => (['play', 'settings', 'sound', 'shop', 'daily', 'achievements', 'wallet', 'lang'] as const).map((k) => t(`TITLE.${k}`, TITLE[k]));

function levelMap(yesterday: boolean): Target[] {
  const b = levelMapBands(yesterday);
  const top: readonly [number, number] = [0, b.topEnd];
  const bottom: readonly [number, number] = [b.bottomStart, 1280];
  const list = [
    t('BACK', LEVEL_MAP.back, top),
    t('LEVEL_MAP.wallet', LEVEL_MAP.wallet, top),
    t('dailyTabDaily', LEVEL_MAP.dailyTabDailyHit, top, 'LEVEL_MAP.daily'),
    t('dailyTabWeekly', LEVEL_MAP.dailyTabWeeklyHit, top, 'LEVEL_MAP.daily'),
    t('LEVEL_MAP.daily', LEVEL_MAP.daily, top),
    t('LEVEL_MAP.commander', LEVEL_MAP.commander, bottom),
  ];
  if (yesterday) list.push(t('LEVEL_MAP.yesterdayHit', LEVEL_MAP.yesterdayHit, top));
  return list;
}

/** The path's nodes (content band; the map scrolls, so sizes and spacing only). */
const levelNodes = (): Target[] => Array.from({ length: 12 }, (_, i) => t(`node ${i + 1}`, levelNodeRect(i, 0)));

function settings(): Target[] {
  const top: readonly [number, number] = [0, SETTINGS_BANDS.topEnd];
  // AUD-U2: the body scrolls when it is taller than the screen (About with both rows ends at 1400 since AUD-F6): its band is the content
  const body: readonly [number, number] = [SETTINGS_BANDS.topEnd, 2000];
  const about = settingsAboutLayout(true, true);
  return [
    t('SETTINGS.back', SETTINGS.back, top),
    t('SETTINGS.music', SETTINGS.music, body), // AUD-F6
    t('SETTINGS.sound', SETTINGS.sound, body),
    t('SETTINGS.colorBlind', SETTINGS.colorBlind, body),
    ...segments('SETTINGS.motion', SETTINGS.motion, MOTION_SEGMENTS.length, body),
    t('SETTINGS.howto', SETTINGS.howto, body),
    ...segments('SETTINGS.language', SETTINGS.language, LANGUAGE_SEGMENTS.length, body),
    ...segments('SETTINGS.tones', SETTINGS.tones, TONE_SEGMENTS.length, body),
    ...segments('SETTINGS.textSize', SETTINGS.textSize, TEXT_SIZE_SEGMENTS.length, body),
    t('SETTINGS.reset', SETTINGS.reset, body),
    t('about.copy', about.copy!, body),
    t('about.privacy', about.privacy!, body),
  ];
}

const settingsConfirm = (): Target[] => [t('SETTINGS.confirm.yes', SETTINGS.confirm.yes), t('SETTINGS.confirm.no', SETTINGS.confirm.no)];

function shopHeader(storeOn: boolean): Target[] {
  const top: readonly [number, number] = [0, SHOP.contentTop];
  return [t('SHOP.back', SHOP.back, top), t('SHOP.wallet', SHOP.wallet, top), ...segments('SHOP.tabs', SHOP.tabs, shopTabsFor(storeOn).length, top)];
}

/** Content-space hit regions of each shop tab (ShopScreen.layout): sizes and overlaps in content space. */
function shopTab(tab: 'crystals' | 'bundles' | 'skins' | 'upgrades'): Target[] {
  const out: Target[] = [];
  let bottom = 0;
  const add = (x: Target): void => {
    out.push(x);
    bottom = Math.max(bottom, x.r.y + x.r.h);
  };
  if (tab === 'crystals') {
    for (let i = 0; i < 5; i++) add(t(`pack ${i}`, shopPackRect(i)));
    const card = shopPackRect(5);
    for (const s of segments('convert', shopConvertSegRect(card), CONVERSION_PACKS.length)) add(s);
    add(t('convert.buy', shopBuyRect(card, card.w - 48)));
    bottom = Math.max(bottom, card.y + card.h);
  } else if (tab === 'bundles') {
    for (let i = 0; i < 4; i++) add(t(`row ${i}`, shopRowRect(i)));
  } else if (tab === 'skins') {
    // two categories of seven cards (the longest list today), the second under its header
    for (let i = 0; i < 7; i++) add(t(`roof ${i}`, shopSkinRect(SHOP.row.y0 - 6, i)));
    const next = bottom + 22;
    for (let i = 0; i < 7; i++) add(t(`helmet ${i}`, shopSkinRect(next, i)));
  } else {
    UPGRADE_DEFS.forEach((_, i) => add(t(`upgrade ${i}`, shopRowRect(i))));
  }
  if (tab === 'crystals' || tab === 'bundles') out.push(t('restore', { x: 160, y: bottom + 24, w: 400, h: SHOP.restoreH }));
  return out;
}

const OFFERS_NONE: ResultCase = { share: true, doubleGold: null, doubled: false, skipCrystals: null, continueCrystals: null, continueAd: false, howto: false };

const SCREENS: Record<string, Target[]> = {
  'play HUD': playHud(),
  'pause card': pauseCard(),
  'result: win, ×2 gold, share row': result(true, true, { ...OFFERS_NONE, doubleGold: 40 }),
  'result: win, share inline': result(true, true, OFFERS_NONE),
  'result: defeat, both continues, skip, share row, HOW TO PLAY': result(false, false, { ...OFFERS_NONE, continueCrystals: 10, continueAd: true, skipCrystals: 30, howto: true }),
  'result: defeat, crystal continue only, share inline, HOW TO PLAY': result(false, false, { ...OFFERS_NONE, continueCrystals: 10, howto: true }),
  'result: practice run (no share)': result(true, true, { ...OFFERS_NONE, share: false }),
  'spend confirm card (result / shop)': confirmCard(),
  title: title(),
  'level map + yesterday row': levelMap(true),
  'level map': levelMap(false),
  'level map nodes': levelNodes(),
  settings: settings(),
  'settings: reset confirm': settingsConfirm(),
  'shop header (store)': shopHeader(true),
  'shop header (no store)': shopHeader(false),
  'shop: crystals': shopTab('crystals'),
  'shop: bundles': shopTab('bundles'),
  'shop: skins': shopTab('skins'),
  'shop: upgrades': shopTab('upgrades'),
  achievements: [t('ACHIEVEMENTS.back', ACHIEVEMENTS_LAYOUT.back, [0, ACHIEVEMENTS_LAYOUT.contentTop])],
  'how to play': [t('HOWTO.back', HOWTO.back, [0, HOWTO_BANDS.topEnd]), t('HOWTO.close', HOWTO.close, [HOWTO_BANDS.bottomStart, 1280])],
};

describe('touch targets ≥ 44 pt, no overlapping tap areas (AUD-U1 / AUD-Q6)', () => {
  it('minHit = 44 / scale layout px (88 at 360 wide, ≈ 74 at 430), capped at 88; hitRect tests the padded area', () => {
    expect(minHit({ scale: 0.5 })).toBe(88);
    expect(minHit({ scale: scaleOf(430, 932) })).toBeCloseTo(73.7, 1);
    expect(minHit({ scale: 1 })).toBe(44);
    expect(minHit({ scale: 0.4 })).toBe(88);
    const r = { x: 100, y: 100, w: 40, h: 20 };
    const a = hitArea(r, 88);
    expect(a).toEqual({ x: 76, y: 66, w: 88, h: 88 });
    expect(hitArea({ x: 0, y: 0, w: 300, h: 100 }, 88)).toEqual({ x: 0, y: 0, w: 300, h: 100 }); // never shrunk
    const view = { scale: 0.5 };
    expect(hitRect(view, r, a.x, a.y)).toBe(true);
    expect(hitRect(view, r, a.x + a.w, a.y + a.h)).toBe(true);
    expect(hitRect(view, r, a.x - 0.5, 120)).toBe(false);
    expect(hitRect(view, r, 120, a.y + a.h + 0.5)).toBe(false);
  });

  for (const phone of PHONES) {
    const s = scaleOf(phone.w, phone.h);
    for (const [screen, targets] of Object.entries(SCREENS)) {
      it(`${phone.w}×${phone.h} · ${screen}: every tap area ≥ 44 pt both ways, none overlapping`, () => {
        for (const x of targets) {
          const a = area(x, s);
          expect(a.w * s, `${x.name} width (pt)`).toBeGreaterThanOrEqual(44 - 1e-9);
          expect(a.h * s, `${x.name} height (pt)`).toBeGreaterThanOrEqual(44 - 1e-9);
        }
        for (let i = 0; i < targets.length; i++) {
          for (let j = i + 1; j < targets.length; j++) {
            const p = targets[i]!;
            const q = targets[j]!;
            if (p.nestedIn === q.name || q.nestedIn === p.name) continue;
            expect(overlap(area(p, s), area(q, s)), `${p.name} × ${q.name}`).toBeLessThan(1e-6);
          }
        }
      });
    }
  }

  it('a nested button (the DAILY / WEEKLY tabs) takes no more of its card than its own drawn row: the card body and centre stay the card\'s', () => {
    const drawn: Record<string, Rect> = { dailyTabDaily: LEVEL_MAP.dailyTabDaily, dailyTabWeekly: LEVEL_MAP.dailyTabWeekly };
    const card = LEVEL_MAP.daily;
    for (const s of [0.5, scaleOf(430, 932)]) {
      for (const x of levelMap(true)) {
        if (!x.nestedIn) continue;
        const d = drawn[x.name]!;
        const a = area(x, s);
        // inside the card the tap area is the drawn tab (its frame row), not the level · twist line under it
        expect(a.y + a.h, `${x.name} bottom`).toBeLessThanOrEqual(d.y + d.h);
        expect(a.x, x.name).toBeGreaterThanOrEqual(d.x);
        expect(a.x + a.w, x.name).toBeLessThanOrEqual(d.x + d.w);
        const c = { x: card.x + card.w / 2, y: card.y + card.h / 2 };
        expect(c.x >= a.x && c.x <= a.x + a.w && c.y >= a.y && c.y <= a.y + a.h, `card centre outside ${x.name}`).toBe(false);
      }
    }
  });

  it('before → after at 360 × 640 (the audit\'s list): the worst offenders are now ≥ 44 pt', () => {
    const pt = (r: Rect) => {
      const a = hitArea(r, minHit({ scale: 0.5 }));
      return [a.w / 2, a.h / 2];
    };
    for (const r of [HUD.pause, HUD.mute, BOOSTERS.overdrive, HUD.menu, LEVEL_MAP.back, LEVEL_MAP.dailyTabDaily, TITLE.lang, RESULT.howto, SETTINGS.sound, SHOP.back, PAUSE.retry]) {
      const [w, h] = pt(r);
      expect(w).toBeGreaterThanOrEqual(44);
      expect(h).toBeGreaterThanOrEqual(44);
    }
  });
});
