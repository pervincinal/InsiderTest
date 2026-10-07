import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE, getPalette } from '../../src/render/palette';
import type { HudPlayUi } from '../../src/render/hud';
import { resultShareLayout } from '../../src/render/hud';
import { RESULT } from '../../src/render/layout';
import { HUD_OVERLAYS } from '../../src/render/hudOverlays';
import type { ShareCardSpec } from '../../src/render/shareCard';
import { SHARE_CYRILLIC_FACE, SHARE_H, SHARE_ROW_H, SHARE_W, drawShareCard, loadShareFonts, shareCardTexts, shareFontFamily, shareInfoRows } from '../../src/render/shareCard';
import { FONT } from '../../src/render/widgets';
import { createAdSession } from '../../src/economy/adsFlow';
import { createState } from '../../src/sim/create';
import type { DailyChallenge, WeeklyChallenge } from '../../src/daily/challenge';
import { TWISTS } from '../../src/daily/challenge';
import type { DailyOutcome } from '../../src/ui/daily';
import type { WeeklyOutcome } from '../../src/ui/weekly';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, ResultInfo } from '../../src/ui/screens';
import { ResultScreen, appVersion, resetDefeatStreakForTests } from '../../src/ui/screens';
import type { ShareEnv, ShareNavigator } from '../../src/ui/share';
import { SHARE_TITLE, downloadFile, shareFileName, sharePng, shareSpecOf, shareText, shareToastText } from '../../src/ui/share';
import { shareImage } from '../../src/native/share';
import { setLanguage, t } from '../../src/ui/i18n';
import { makeLevel } from '../helpers';

/*
 * Share card (SHARE-1, GDD §7.6): the payload text per result kind, the PNG file name, the fallback
 * chain (native hook → Web Share with the file → Web Share text-only → download) with a mocked
 * navigator, the SHARE button's visibility (hidden on Yesterday's-map practice) and the card drawing
 * itself (recording context: every label, the version footer, colour-blind owner colours).
 */

const DAY = '2026-10-05';
const WEEK = '2026-09-28';
const lean = TWISTS.find((tw) => tw.id === 'lean')!;
const thin = TWISTS.find((tw) => tw.id === 'thinWalls')!;

interface Recording extends CanvasRenderingContext2D {
  texts: string[];
  stops: string[];
  /** `ctx.font` at every fillText, keyed by the text (the last draw wins). */
  fonts: Map<string, string>;
}

/** Canvas stand-in that records drawn text and gradient colours; every other call is a no-op. */
function recordingCtx(): Recording {
  const store: Record<string | symbol, unknown> = {};
  const texts: string[] = [];
  const stops: string[] = [];
  const fonts = new Map<string, string>();
  return new Proxy({} as Recording, {
    get(_t, key) {
      if (key === 'texts') return texts;
      if (key === 'stops') return stops;
      if (key === 'fonts') return fonts;
      if (key === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (key === 'fillText')
        return (s: string) => {
          texts.push(s);
          fonts.set(s, String(store['font']));
        };
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: (_o: number, c: string) => void stops.push(c) });
      if (key in store) return store[key];
      return () => undefined;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

const LEVEL = makeLevel({ id: 12, name: 'Crossfire' });

function uiFor(outcome: 'won' | 'lost', stars: number, clockMs: number, share?: boolean): HudPlayUi {
  return {
    level: LEVEL,
    palette: DEFAULT_PALETTE,
    alpha: 0,
    selectedTowerId: null,
    hoverTowerId: null,
    paused: false,
    outcome,
    stars,
    hasNext: true,
    speed: 1,
    coinsEarned: 0,
    coinsTotal: 0,
    clockMs,
    hud: {
      boosters: [],
      targeting: false,
      muted: false,
      result: { crystalsEarned: 0, notes: [], replayCapped: false, doubleGold: null, doubled: false, continueCrystals: null, continueAd: false, skipCrystals: null, pending: false, tip: null, howto: false, share },
    },
  };
}

function info(over: Partial<ResultInfo> & { outcome?: 'won' | 'lost'; stars?: number; clockMs?: number } = {}): ResultInfo {
  const { outcome = 'won', stars = 3, clockMs = 72_000, ...rest } = over;
  return {
    state: createState(LEVEL, 1),
    level: LEVEL,
    ui: uiFor(outcome, stars, clockMs),
    earnings: { stars, gold: 0, crystals: 0, notes: [], replayCapped: false },
    continued: false,
    achievements: { unlocked: [], crystals: 0 },
    ...rest,
  };
}

const daily: DailyChallenge = { dayKey: DAY, levelId: 12, seed: 4242, twist: lean };
const weekly: WeeklyChallenge = { weekKey: WEEK, levelId: 12, seed: 99, twist: thin, targetMs: 30_000 };
const dailyOutcome = (practice: boolean): DailyOutcome => ({ dayKey: DAY, won: true, stars: 3, firstWin: !practice, gold: 0, crystals: 0, milestone: 0, streak: 1, best: null, ...(practice ? { practice: true as const } : {}) });
const weeklyOutcome: WeeklyOutcome = { weekKey: WEEK, won: true, stars: 2, firstWin: true, gold: 50, targetHit: false, crystals: 0, milestone: 0, streak: 1, best: null, targetMs: 30_000 };

afterEach(async () => {
  await setLanguage('en');
});

describe('share payload (text, spec, file name)', () => {
  it('campaign win: brand, level number + name, stars and the star clock (clockMs, not state.time)', () => {
    const spec = shareSpecOf(info(), '1.2.3')!;
    expect(spec).toEqual({ levelId: 12, levelName: 'Crossfire', won: true, stars: 3, timeMs: 72_000, challenge: null, version: '1.2.3' });
    expect(shareText(spec)).toBe('Tower Clash · Level 12 · Crossfire · 3★ in 01:12');
    expect(shareFileName(spec)).toBe('towerclash-level-12.png');
  });

  it('campaign defeat: no stars, the defeat line', () => {
    const spec = shareSpecOf(info({ outcome: 'lost', stars: 0, clockMs: 139_000 }), 'dev')!;
    expect(spec.won).toBe(false);
    expect(spec.stars).toBe(0);
    expect(shareText(spec)).toBe('Tower Clash · Level 12 · Crossfire · Defeated at 02:19 — can you win it?');
  });

  it('daily: the day key and the twist name make it verifiable', () => {
    const spec = shareSpecOf(info({ challenge: daily, daily: dailyOutcome(false) }), 'dev')!;
    expect(spec.challenge).toEqual({ kind: 'daily', key: DAY, twist: 'Lean rations' });
    expect(shareText(spec)).toBe(`Tower Clash · Daily ${DAY} · Lean rations · Level 12 · Crossfire · 3★ in 01:12`);
    expect(shareFileName(spec)).toBe(`towerclash-daily-${DAY}.png`);
  });

  it('weekly: the Monday key and the twist name', () => {
    const spec = shareSpecOf(info({ stars: 2, weekly, weeklyOutcome }), 'dev')!;
    expect(spec.challenge).toEqual({ kind: 'weekly', key: WEEK, twist: 'Thin walls' });
    expect(shareText(spec)).toBe(`Tower Clash · Weekly ${WEEK} · Thin walls · Level 12 · Crossfire · 2★ in 01:12`);
    expect(shareFileName(spec)).toBe(`towerclash-weekly-${WEEK}.png`);
  });

  it("Yesterday's map (practice) has nothing to share", () => {
    expect(shareSpecOf(info({ challenge: daily, daily: dailyOutcome(true) }), 'dev')).toBeNull();
  });

  it('follows the UI language (labels and the twist name; the brand and the key stay)', async () => {
    await setLanguage('ru');
    const spec = shareSpecOf(info({ challenge: daily, daily: dailyOutcome(false) }), 'dev')!;
    expect(shareText(spec)).toBe(`Tower Clash · Ежедневный ${DAY} · ${t('daily.twist.lean')} · Уровень 12 · Crossfire · 3★ за 01:12`);
    expect(t('daily.twist.lean')).not.toBe('Lean rations');
  });

  it('toast texts: Shared / Saved / Sharing not available; nothing for a dismissed sheet', () => {
    expect(shareToastText('shared')).toBe('Shared');
    expect(shareToastText('saved')).toBe('Saved');
    expect(shareToastText('unavailable')).toBe('Sharing not available');
    expect(shareToastText('cancelled')).toBeNull();
  });
});

/* ---------- fallback chain ---------- */

const png = (): File => new File([new Uint8Array([137, 80, 78, 71])], 'towerclash-level-12.png', { type: 'image/png' });

function env(over: Partial<ShareEnv> & { nav?: ShareNavigator } = {}) {
  const downloads: File[] = [];
  const natives: { file: File; text: string }[] = [];
  const e: ShareEnv = {
    native: over.native ?? false,
    navigator: over.nav,
    shareNative:
      over.shareNative ??
      ((file, text) => {
        natives.push({ file, text });
        return Promise.resolve('unavailable');
      }),
    download:
      over.download ??
      ((file) => {
        downloads.push(file);
      }),
  };
  return { env: e, downloads, natives };
}

const abort = () => Object.assign(new Error('dismissed'), { name: 'AbortError' });
const notAllowed = () => Object.assign(new Error('no activation'), { name: 'NotAllowedError' });

describe('fallback chain (sharePng)', () => {
  it('1. canShare accepts the file → navigator.share({ files, title, text }) → shared, no download', async () => {
    const share = vi.fn((_d: ShareData) => Promise.resolve());
    const canShare = vi.fn((d: ShareData) => (d.files?.length ?? 0) > 0);
    const file = png();
    const { env: e, downloads } = env({ nav: { share, canShare } });
    expect(await sharePng(file, 'hello', e)).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0]![0]).toEqual({ files: [file], title: SHARE_TITLE, text: 'hello' });
    expect(downloads).toEqual([]);
  });

  it('2. canShare refuses files (or is missing) → text-only share', async () => {
    for (const canShare of [() => false, undefined]) {
      const share = vi.fn((_d: ShareData) => Promise.resolve());
      const { env: e, downloads } = env({ nav: { share, canShare } });
      expect(await sharePng(png(), 'hello', e)).toBe('shared');
      expect(share.mock.calls.map((c) => c[0])).toEqual([{ title: SHARE_TITLE, text: 'hello' }]);
      expect(downloads).toEqual([]);
    }
  });

  it('a file share that fails (not an abort) retries text-only; a canShare that throws counts as "no files"', async () => {
    const share = vi.fn((d: ShareData) => (d.files ? Promise.reject(notAllowed()) : Promise.resolve()));
    const { env: e } = env({ nav: { share, canShare: () => true } });
    expect(await sharePng(png(), 'hello', e)).toBe('shared');
    expect(share).toHaveBeenCalledTimes(2);
    const share2 = vi.fn((_d: ShareData) => Promise.resolve());
    const { env: e2 } = env({ nav: { share: share2, canShare: () => { throw new TypeError('bad'); } } });
    expect(await sharePng(png(), 'hello', e2)).toBe('shared');
    expect(share2.mock.calls[0]![0].files).toBeUndefined();
  });

  it('a dismissed sheet (AbortError) is "cancelled": no second attempt, no download', async () => {
    const share = vi.fn(() => Promise.reject(abort()));
    const { env: e, downloads } = env({ nav: { share, canShare: () => true } });
    expect(await sharePng(png(), 'hello', e)).toBe('cancelled');
    expect(share).toHaveBeenCalledTimes(1);
    expect(downloads).toEqual([]);
  });

  it('3. no navigator.share → the PNG is downloaded → saved', async () => {
    const file = png();
    for (const nav of [undefined, {}, { canShare: () => true }] as (ShareNavigator | undefined)[]) {
      const { env: e, downloads } = env({ nav });
      expect(await sharePng(file, 'hello', e)).toBe('saved');
      expect(downloads).toEqual([file]);
    }
  });

  it('every share attempt failing falls through to the download', async () => {
    const share = vi.fn(() => Promise.reject(notAllowed()));
    const { env: e, downloads } = env({ nav: { share, canShare: () => true } });
    expect(await sharePng(png(), 'hello', e)).toBe('saved');
    expect(share).toHaveBeenCalledTimes(2);
    expect(downloads).toHaveLength(1);
  });

  it('4. a download that throws → unavailable', async () => {
    const { env: e } = env({
      download: () => {
        throw new Error('no document');
      },
    });
    expect(await sharePng(png(), 'hello', e)).toBe('unavailable');
  });

  it('native: the hook is asked first; "shared" / "cancelled" end the chain', async () => {
    for (const r of ['shared', 'cancelled'] as const) {
      const share = vi.fn(() => Promise.resolve());
      const { env: e } = env({ native: true, nav: { share }, shareNative: () => Promise.resolve(r) });
      expect(await sharePng(png(), 'hello', e)).toBe(r);
      expect(share).not.toHaveBeenCalled();
    }
  });

  it('native "unavailable" (or a rejecting hook) tries Web Share, never the download', async () => {
    const share = vi.fn(() => Promise.resolve());
    const { env: e, natives } = env({ native: true, nav: { share } });
    expect(await sharePng(png(), 'hello', e)).toBe('shared');
    expect(natives).toHaveLength(1);
    const { env: e2, downloads } = env({ native: true, nav: undefined, shareNative: () => Promise.reject(new Error('plugin missing')) });
    expect(await sharePng(png(), 'hello', e2)).toBe('unavailable');
    expect(downloads).toEqual([]);
  });

  it('the native hook stub answers "unavailable" on the web (the Mobile Engineer wires the native branch)', async () => {
    expect(await shareImage(png(), 'hello')).toBe('unavailable');
  });

  it('downloadFile clicks an <a download> on an object URL named after the file', () => {
    const clicks: { href: string; download: string }[] = [];
    const anchor = {
      href: '',
      download: '',
      rel: '',
      style: {} as Record<string, string>,
      click() {
        clicks.push({ href: this.href, download: this.download });
      },
      remove: vi.fn(),
    };
    const appended: unknown[] = [];
    vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'a' ? anchor : null), body: { appendChild: (n: unknown) => void appended.push(n) } });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:towerclash/1');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.useFakeTimers();
    try {
      downloadFile(png());
      expect(clicks).toEqual([{ href: 'blob:towerclash/1', download: 'towerclash-level-12.png' }]);
      expect(appended).toEqual([anchor]);
      expect(anchor.remove).toHaveBeenCalled();
      vi.runAllTimers();
      expect(revoke).toHaveBeenCalledWith('blob:towerclash/1');
    } finally {
      vi.useRealTimers();
      create.mockRestore();
      revoke.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

/* ---------- the button on the result screen ---------- */

function fakeApp(save: SaveData): App {
  return {
    view: {} as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel: () => Promise.resolve(true),
    go() {},
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => DAY,
    weekKey: () => WEEK,
  };
}

describe('SHARE button (result screen)', () => {
  beforeEach(() => {
    setSaveStorageForTests({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    resetDefeatStreakForTests();
  });
  afterEach(() => setSaveStorageForTests(null));

  it('offered on campaign wins and defeats, daily and weekly results; hidden on practice', async () => {
    const app = fakeApp(defaultSave());
    const cases: [ResultInfo, boolean][] = [
      [info(), true],
      [info({ outcome: 'lost', stars: 0 }), true],
      [info({ challenge: daily, daily: dailyOutcome(false) }), true],
      [info({ weekly, weeklyOutcome }), true],
      [info({ challenge: daily, daily: dailyOutcome(true) }), false],
    ];
    for (const [i, offered] of cases) {
      const screen = new ResultScreen(app, i);
      expect(screen.shareOffered()).toBe(offered);
      expect(screen.extras().share).toBe(offered);
    }
    // practice: tapping where SHARE would be does nothing, and share() refuses
    const practice = new ResultScreen(app, info({ challenge: daily, daily: dailyOutcome(true) }));
    expect(await practice.share()).toBeNull();
    const at = { x: RESULT.shareInline.x + 10, y: RESULT.shareInline.y + 10, id: 1, timeMs: 0 };
    practice.down(at);
    practice.up(at);
    expect(practice.toast.opts(performance.now())).toBeNull();
  });

  it('the result card draws SHARE only when offered', () => {
    const state = createState(LEVEL, 1);
    for (const [share, expected] of [
      [true, true],
      [false, false],
      [undefined, false],
    ] as const) {
      const ctx = recordingCtx();
      HUD_OVERLAYS.result(ctx, state, uiFor('won', 3, 72_000, share), 10_000);
      expect(ctx.texts.includes('SHARE')).toBe(expected);
    }
  });

  it('SHARE takes the free ×2 gold / skip slot, else its own row on the taller card', () => {
    const ex = { share: true, doubleGold: null, doubled: false, skipCrystals: null };
    expect(resultShareLayout({ ...ex, share: false }, true)).toEqual({ card: RESULT.card, share: null });
    expect(resultShareLayout(undefined, true)).toEqual({ card: RESULT.card, share: null });
    expect(resultShareLayout(ex, true)).toEqual({ card: RESULT.card, share: RESULT.shareInline });
    expect(resultShareLayout(ex, false)).toEqual({ card: RESULT.card, share: RESULT.shareInline });
    expect(resultShareLayout({ ...ex, doubleGold: 30 }, true)).toEqual({ card: RESULT.cardShare, share: RESULT.share });
    expect(resultShareLayout({ ...ex, doubled: true }, true)).toEqual({ card: RESULT.cardShare, share: RESULT.share }); // "Gold doubled" note
    expect(resultShareLayout({ ...ex, skipCrystals: 25 }, false)).toEqual({ card: RESULT.cardShare, share: RESULT.share });
    expect(resultShareLayout({ ...ex, skipCrystals: 25 }, true)).toEqual({ card: RESULT.card, share: RESULT.shareInline }); // skip is defeat-only
    // geometry: the inline button sits in the slot, the own row clears it and stays inside the taller card
    expect(RESULT.shareInline.y).toBe(RESULT.extra.y);
    expect(RESULT.share.y).toBeGreaterThan(RESULT.extra.y + RESULT.extra.h);
    expect(RESULT.cardShare.y + RESULT.cardShare.h).toBeGreaterThan(RESULT.share.y + RESULT.share.h + 20);
    expect(RESULT.card.y + RESULT.card.h).toBeGreaterThan(RESULT.shareInline.y + RESULT.shareInline.h + 20);
    expect(RESULT.share.h).toBeGreaterThanOrEqual(44);
  });
});

/* ---------- the card ---------- */

describe('share card drawing (1080 × 1350)', () => {
  const spec = (over: Partial<ShareCardSpec> = {}): ShareCardSpec => ({ levelId: 12, levelName: 'Crossfire', won: true, stars: 2, timeMs: 72_000, challenge: null, version: appVersion(), ...over });

  it('is 4:5 at 1080 × 1350', () => {
    expect([SHARE_W, SHARE_H]).toEqual([1080, 1350]);
  });

  it('campaign win: title, outcome, level line, time and the version footer; no challenge line', () => {
    const ctx = recordingCtx();
    drawShareCard(ctx, DEFAULT_PALETTE, spec());
    expect(ctx.texts).toContain('TOWER CLASH');
    expect(ctx.texts).toContain('VICTORY');
    expect(ctx.texts).toContain('Level 12 · Crossfire');
    expect(ctx.texts).toContain('Time 01:12');
    expect(ctx.texts).toContain(`towerclash · v${appVersion()}`);
    expect(ctx.texts.some((s) => s.startsWith('Daily') || s.startsWith('Weekly'))).toBe(false);
  });

  it('daily / weekly: the key + twist line is on the card', () => {
    const d = recordingCtx();
    drawShareCard(d, DEFAULT_PALETTE, spec({ challenge: { kind: 'daily', key: DAY, twist: 'Lean rations' } }));
    expect(d.texts).toContain(`Daily ${DAY} · Lean rations`);
    const w = recordingCtx();
    drawShareCard(w, DEFAULT_PALETTE, spec({ challenge: { kind: 'weekly', key: WEEK, twist: 'Thin walls' } }));
    expect(w.texts).toContain(`Weekly ${WEEK} · Thin walls`);
  });

  it('defeat uses the first enemy colour of the palette — orange in the colour-blind one', () => {
    const def = recordingCtx();
    drawShareCard(def, DEFAULT_PALETTE, spec({ won: false, stars: 0 }));
    expect(def.texts).toContain('DEFEAT');
    expect(def.stops).toContain(DEFAULT_PALETTE.owners.enemy1);
    const cb = recordingCtx();
    drawShareCard(cb, COLOR_BLIND_PALETTE, spec({ won: false, stars: 0 }));
    expect(cb.stops).toContain(COLOR_BLIND_PALETTE.owners.enemy1);
    expect(cb.stops).not.toContain(DEFAULT_PALETTE.owners.enemy1);
  });

  it('labels follow the UI language', async () => {
    await setLanguage('az');
    const ctx = recordingCtx();
    drawShareCard(ctx, DEFAULT_PALETTE, spec());
    expect(ctx.texts).toContain(t('result.victory'));
    expect(ctx.texts).toContain('Səviyyə 12 · Crossfire');
  });
});

describe('share card ART-12: defeat rows and one family per line', () => {
  const spec = (over: Partial<ShareCardSpec> = {}): ShareCardSpec => ({ levelId: 3, levelName: 'Free Real Estate', won: false, stars: 0, timeMs: 54_000, challenge: null, version: appVersion(), ...over });
  const count = (xs: string[], x: string) => xs.filter((y) => y === x).length;
  const familyOf = (cssFont: string) => cssFont.replace(/^\S+ \d+(?:\.\d+)?px /, '');

  it('a defeat shows level, three empty star slots and the clock — the campaign-win rhythm, not two rows in an empty card', () => {
    expect(shareInfoRows(spec())).toEqual(['level', 'stars', 'time']);
    expect(shareInfoRows(spec({ won: true, stars: 2 }))).toEqual(['level', 'stars', 'time']);
    expect(shareInfoRows(spec({ challenge: { kind: 'daily', key: DAY, twist: 'Lean rations' } }))).toEqual(['level', 'challenge', 'stars', 'time']);
    // 74 + 140 + 70 = 284 of the 368 px under the banner (500 − 8 − 124): 42 px above and below
    const h = shareInfoRows(spec()).reduce((a, r) => a + SHARE_ROW_H[r], 0);
    expect(h).toBe(284);
    expect((500 - 8 - 124 - h) / 2).toBe(42);
  });

  it('the defeat stars are drawn, all three off (palette starOff); a 2★ win has one off, a 3★ win none', () => {
    const lost = recordingCtx();
    drawShareCard(lost, DEFAULT_PALETTE, spec());
    expect(count(lost.stops, DEFAULT_PALETTE.starOff)).toBe(3);
    // a defeat never lights a star, whatever the spec says (pal.star = pal.gold is also the header / title face, so
    // the off-star colour is the one counted)
    const odd = recordingCtx();
    drawShareCard(odd, DEFAULT_PALETTE, spec({ stars: 3 }));
    expect(count(odd.stops, DEFAULT_PALETTE.starOff)).toBe(3);
    const won = recordingCtx();
    drawShareCard(won, DEFAULT_PALETTE, spec({ won: true, stars: 2 }));
    expect(count(won.stops, DEFAULT_PALETTE.starOff)).toBe(1);
    const won3 = recordingCtx();
    drawShareCard(won3, COLOR_BLIND_PALETTE, spec({ won: true, stars: 3 }));
    expect(count(won3.stops, COLOR_BLIND_PALETTE.starOff)).toBe(0);
    // the defeat card still draws exactly its text rows: no new string, so no new locale key
    expect(lost.texts.filter((s, i, a) => a.indexOf(s) === i)).toEqual(['TOWER CLASH', 'DEFEAT', 'Level 3 · Free Real Estate', 'Time 00:54', `towerclash · v${appVersion()}`]);
  });

  it('font rule: a line with Cyrillic → Nunito (the share face first), any other line → Fredoka (the game stack)', () => {
    expect(shareFontFamily('Уровень 3 · Ничейная земля')).toBe(`'Nunito Share', 'Nunito', ${FONT}`);
    expect(shareFontFamily('Время 00:54')).toMatch(/^'Nunito Share', 'Nunito', 'Fredoka'/);
    for (const latin of ['TOWER CLASH', 'Level 3 · Free Real Estate', 'Səviyyə 3 · Sahibsiz Torpaq', 'YENİLGİ', 'MƏĞLUBİYYƏT', 'Time 00:54', 'towerclash · v1.0.0 (build 7)']) {
      expect(shareFontFamily(latin), latin).toBe(FONT);
      expect(FONT.startsWith("'Fredoka'")).toBe(true);
    }
    // the share face: the bundled Cyrillic file, at wght 900 (matches Fredoka 700's stroke), Cyrillic only
    expect(SHARE_CYRILLIC_FACE).toEqual({ family: 'Nunito Share', url: './fonts/nunito-cyrillic.woff2', unicodeRange: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116', weight: '900' });
  });

  it('Russian card: every Cyrillic line is set in the Nunito stack at weight 700, the Latin header / footer in Fredoka', async () => {
    await setLanguage('ru');
    const ctx = recordingCtx();
    const s = spec({ levelName: 'Ничейная земля', challenge: { kind: 'daily', key: DAY, twist: 'Быстрые ноги' } });
    drawShareCard(ctx, DEFAULT_PALETTE, s);
    const texts = shareCardTexts(s);
    expect(texts).toEqual(['TOWER CLASH', t('result.defeat'), 'Уровень 3 · Ничейная земля', `Ежедневный ${DAY} · Быстрые ноги`, 'Время 00:54', `towerclash · v${appVersion()}`]);
    for (const text of texts) {
      const f = ctx.fonts.get(text);
      expect(f, text).toBeDefined();
      expect(familyOf(f!), text).toBe(/[А-Яа-яЁё]/.test(text) ? `'Nunito Share', 'Nunito', ${FONT}` : FONT);
      // the weight stays one of Fredoka's two bundled faces (the digits in a Russian line come from Fredoka 700)
      expect(f!.split(' ')[0], text).toBe(text.startsWith('towerclash') ? '500' : '700');
    }
  });

  it('English / Azerbaijani cards draw no line in the Nunito stack', async () => {
    for (const lang of ['en', 'az'] as const) {
      await setLanguage(lang);
      const ctx = recordingCtx();
      drawShareCard(ctx, DEFAULT_PALETTE, spec({ challenge: { kind: 'weekly', key: WEEK, twist: 'Thin walls' } }));
      expect([...ctx.fonts.values()].every((f) => familyOf(f) === FONT), lang).toBe(true);
    }
  });

  describe('loadShareFonts (faces loaded before the card is drawn)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function fakeFonts(loadImpl: () => Promise<unknown> = () => Promise.resolve([])) {
      const loads: { font: string; text: string }[] = [];
      const added: { family: string; source: string; desc: FontFaceDescriptors; loaded: boolean }[] = [];
      class FakeFace {
        loaded = false;
        constructor(
          public family: string,
          public source: string,
          public desc: FontFaceDescriptors
        ) {}
        load() {
          this.loaded = true;
          return Promise.resolve(this);
        }
      }
      vi.stubGlobal('FontFace', FakeFace);
      vi.stubGlobal('document', {
        baseURI: 'https://example.test/game/index.html',
        fonts: {
          load: (font: string, text: string) => {
            loads.push({ font, text });
            return loadImpl();
          },
          add: (f: FakeFace) => void added.push(f),
        },
      });
      return { loads, added };
    }

    it('Latin card: loads each line in its Fredoka face (500 for the footer), registers no extra face', async () => {
      const { loads, added } = fakeFonts();
      const s = spec();
      await loadShareFonts(s);
      expect(added).toEqual([]);
      expect(loads.map((l) => l.text)).toEqual([...shareCardTexts(s), `towerclash · v${appVersion()}`]);
      expect(loads.every((l) => familyOf(l.font) === FONT)).toBe(true);
      expect(loads.filter((l) => l.font.startsWith('500 ')).map((l) => l.text)).toEqual([`towerclash · v${appVersion()}`]);
    });

    it('Russian card: registers the share face once (absolute URL, wght 900, Cyrillic range) and loads it before drawing', async () => {
      await setLanguage('ru');
      const { loads, added } = fakeFonts();
      const s = spec({ levelName: 'Ничейная земля' });
      await loadShareFonts(s);
      await loadShareFonts(s);
      expect(added).toHaveLength(1);
      expect(added[0]!.family).toBe('Nunito Share');
      expect(added[0]!.source).toBe("url('https://example.test/game/fonts/nunito-cyrillic.woff2') format('woff2')");
      expect(added[0]!.desc).toMatchObject({ weight: '900', unicodeRange: SHARE_CYRILLIC_FACE.unicodeRange, display: 'block' });
      expect(added[0]!.loaded).toBe(true);
      expect(loads.filter((l) => l.text === 'Уровень 3 · Ничейная земля').map((l) => familyOf(l.font))).toEqual([`'Nunito Share', 'Nunito', ${FONT}`, `'Nunito Share', 'Nunito', ${FONT}`]);
    });

    it('a font that never loads does not block the share (bounded wait); no Font Loading API → no-op', async () => {
      fakeFonts(() => new Promise(() => undefined));
      vi.useFakeTimers();
      try {
        const done = loadShareFonts(spec(), 2000);
        let settled = false;
        void done.then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(1999);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(settled).toBe(true);
      } finally {
        vi.useRealTimers();
      }
      vi.unstubAllGlobals();
      vi.stubGlobal('document', {});
      await expect(loadShareFonts(spec())).resolves.toBeUndefined();
    });
  });
});
