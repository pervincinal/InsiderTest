import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE, getPalette } from '../../src/render/palette';
import type { HudPlayUi } from '../../src/render/hud';
import { resultShareLayout } from '../../src/render/hud';
import { RESULT } from '../../src/render/layout';
import { HUD_OVERLAYS } from '../../src/render/hudOverlays';
import type { ShareCardSpec } from '../../src/render/shareCard';
import { SHARE_H, SHARE_W, drawShareCard } from '../../src/render/shareCard';
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
}

/** Canvas stand-in that records drawn text and gradient colours; every other call is a no-op. */
function recordingCtx(): Recording {
  const store: Record<string | symbol, unknown> = {};
  const texts: string[] = [];
  const stops: string[] = [];
  return new Proxy({} as Recording, {
    get(_t, key) {
      if (key === 'texts') return texts;
      if (key === 'stops') return stops;
      if (key === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (key === 'fillText') return (s: string) => void texts.push(s);
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
const weeklyOutcome: WeeklyOutcome = { weekKey: WEEK, won: true, stars: 2, firstWin: true, gold: 50, targetHit: false, crystals: 0, streak: 1, best: null, targetMs: 30_000 };

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
