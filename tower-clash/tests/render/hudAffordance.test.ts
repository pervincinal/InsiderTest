import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState, LevelDef, Outcome } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { MIN_TEXT_PX } from '../../src/render/widgets';
import { BOOSTERS, HUD, RESULT } from '../../src/render/layout';
import type { HudPlayUi } from '../../src/render/hud';
import { drawHud } from '../../src/render/hud';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { ResultScreen } from '../../src/ui/result';
import { PlayScreen } from '../../src/ui/play';
import { t } from '../../src/ui/i18n';
import { makeLevel } from '../helpers';

/*
 * AUD-U10 guard (false affordances): what does nothing must not look pressable.
 *   - the STREAMS pill and the coin pill are read-outs: drawn as label pills (`drawPill`: no clay edge,
 *     no press state), never with the button widget; the STREAMS caption keeps the 22 px floor;
 *   - the pause, mute and MENU buttons stay buttons while playing;
 *   - under a result (the dimmed world, card up) the bands take no tap, so the bottom band's MENU and the
 *     top band's pause and mute are drawn in the disabled style and the wallet at the disabled alpha
 *     (0.45) with no press state — and the result screen ignores a press there (only the card's own MENU
 *     leaves).
 * The widget drawers are wrapped (vi.mock) to record which drawer painted which layout rect.
 */

const calls = vi.hoisted(() => ({
  buttons: [] as { r: Rect; disabled: boolean }[],
  pills: [] as Rect[],
  wallets: [] as { alpha: number; pressed: boolean }[],
}));

vi.mock('../../src/render/widgets', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/render/widgets')>();
  return {
    ...m,
    drawButton: (...a: Parameters<typeof m.drawButton>) => {
      calls.buttons.push({ r: a[2], disabled: !!a[4]?.disabled });
      m.drawButton(...a);
    },
    drawPill: (...a: Parameters<typeof m.drawPill>) => {
      calls.pills.push(a[1]);
      m.drawPill(...a);
    },
  };
});

vi.mock('../../src/render/economyWidgets', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/render/economyWidgets')>();
  return {
    ...m,
    drawWallet: (...a: Parameters<typeof m.drawWallet>) => {
      calls.wallets.push({ alpha: a[0].globalAlpha, pressed: !!a[5]?.pressed });
      m.drawWallet(...a);
    },
  };
});

/** Canvas stand-in: state with save / restore, gradients that take colour stops, every fillText recorded with its font. */
function recordingCtx(texts: { text: string; font: string }[]): CanvasRenderingContext2D {
  let store: Record<string | symbol, unknown> = { font: '700 10px sans-serif', globalAlpha: 1 };
  const stack: Record<string | symbol, unknown>[] = [];
  const stub = { addColorStop: () => undefined };
  const fns: Record<string, (...a: unknown[]) => unknown> = {
    save: () => void stack.push({ ...store }),
    restore: () => void (store = stack.pop() ?? store),
    measureText: (s: unknown) => ({ width: String(s).length * 12 }),
    fillText: (s: unknown) => void texts.push({ text: String(s), font: String(store.font) }),
  };
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (typeof key === 'string' && key in fns) return fns[key];
      if (key in store) return store[key];
      return () => stub;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

/** 360 × 640, no insets: the 9:16 frame at scale 0.5 (the HUD anchors are the layout's). */
const VIEW = { cssW: 360, cssH: 640, scale: 0.5, offsetX: 0, offsetY: 0, dpr: 1, insets: { top: 0, right: 0, bottom: 0, left: 0 } } as unknown as View;

function uiFor(lvl: LevelDef, outcome: Outcome): HudPlayUi {
  return {
    level: lvl,
    palette: getPalette(false),
    alpha: 0,
    selectedTowerId: null,
    hoverTowerId: null,
    paused: false,
    outcome,
    stars: outcome === 'won' ? 2 : 0,
    hasNext: true,
    speed: 1,
    coinsEarned: 0,
    coinsTotal: 120,
    hud: { boosters: [], targeting: false, muted: false, streams: 2, wallet: { gold: 120, crystals: 7 }, pressed: HUD.wallet },
  };
}

function frame(outcome: Outcome): { state: GameState; texts: { text: string; font: string }[] } {
  const lvl = makeLevel({ id: 5 });
  const state = { ...createState(lvl, 1), time: 10_000 };
  const texts: { text: string; font: string }[] = [];
  drawHud(recordingCtx(texts), state, VIEW, uiFor(lvl, outcome), 0);
  return { state, texts };
}

const drawnAsButton = (r: Rect) => calls.buttons.filter((b) => b.r === r);

beforeEach(() => {
  calls.buttons.length = 0;
  calls.pills.length = 0;
  calls.wallets.length = 0;
});

describe('AUD-U10: read-outs are labels, live buttons look live, the band under a result looks off', () => {
  it('playing: STREAMS and coins are label pills (never the button widget); pause, mute and MENU are enabled buttons', () => {
    const { texts } = frame('playing');
    for (const r of [HUD.streams, HUD.coins]) {
      expect(drawnAsButton(r), 'no button bevel / press state').toEqual([]);
      expect(calls.pills).toContain(r);
    }
    for (const r of [HUD.pause, HUD.mute, HUD.menu]) expect(drawnAsButton(r)).toEqual([{ r, disabled: false }]);
    expect(calls.wallets).toEqual([]);
    // the same text, at the 22 px floor
    const caption = texts.find((x) => x.text === t('hud.streams'));
    expect(caption).toBeDefined();
    expect(Number(/(\d+(?:\.\d+)?)px/.exec(caption!.font)?.[1])).toBeGreaterThanOrEqual(MIN_TEXT_PX);
    expect(texts.some((x) => x.text === '2')).toBe(true); // the stream count
  });

  for (const outcome of ['won', 'lost'] as const) {
    it(`${outcome}: the bands' MENU, pause and mute are drawn disabled, the wallet at the disabled alpha with no press state; STREAMS stays a label`, () => {
      frame(outcome);
      for (const r of [HUD.menu, HUD.pause, HUD.mute]) expect(drawnAsButton(r)).toEqual([{ r, disabled: true }]);
      expect(calls.wallets).toEqual([{ alpha: 0.45, pressed: false }]); // even with the result's `pressed` on HUD.wallet
      expect(drawnAsButton(HUD.streams)).toEqual([]);
      expect(calls.pills).toContain(HUD.streams);
    });
  }
});

describe('AUD-U10: the result screen ignores the dimmed band', () => {
  function app() {
    const went: string[] = [];
    const a: App = {
      view: VIEW,
      save: defaultSave(),
      ads: createAdSession(),
      palette: () => getPalette(false),
      goTitle() {},
      goLevels: () => void went.push('levels'),
      goShop: () => void went.push('shop'),
      goAchievements() {},
      startLevel: () => Promise.resolve(true),
      go() {},
      openSettings() {},
      openHowTo() {},
      setSpeed() {},
      setLanguage() {},
      dayKey: () => '2026-11-01',
      weekKey: () => '2026-10-26',
    };
    return { app: a, went };
  }
  const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, type: 'mouse' as const, timeMs: 0 });

  it('a tap on the band\'s MENU or wallet does nothing; the card\'s MENU still leaves', async () => {
    setSaveStorageForTests(null);
    const { app: a, went } = app();
    const lvl = makeLevel({ id: 5 });
    const ui = uiFor(lvl, 'lost');
    const screen = new ResultScreen(a, {
      state: createState(lvl, 1),
      level: lvl,
      ui,
      earnings: { stars: 0, gold: 0, crystals: 0, notes: [], replayCapped: false },
      continued: false,
      achievements: { unlocked: [], crystals: 0 },
    });
    for (const r of [HUD.menu, HUD.wallet]) {
      screen.down(centre(r));
      screen.up(centre(r));
    }
    await new Promise((r) => setTimeout(r, 0));
    expect(went).toEqual([]);
    screen.down(centre(RESULT.loss.menu)); // AUD-U14: a defeat's MENU is on the top row
    screen.up(centre(RESULT.loss.menu));
    await expect.poll(() => went).toEqual(['levels']);
  });
});

/*
 * AUD-U9 (GDD §4 "AUD-U9 2026-11-02"): progressive disclosure. Levels 1–4 on a save that never had gold
 * (0 gold, level 1 not cleared) show no booster bar and no coin pill, and
 * the booster rects take no tap (a hotkey neither); level 1 shows no STREAMS pill on any save (one
 * stream is all it teaches). From level 5, or with any gold or level 1 cleared, everything is back.
 */
describe('AUD-U9: the play HUD discloses boosters, coins and STREAMS progressively', () => {
  function playApp(save: SaveData): App {
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
      dayKey: () => '2026-11-02',
      weekKey: () => '2026-10-27',
    };
  }
  const play = (id: number, edit: (s: SaveData) => void = () => undefined): PlayScreen => {
    setSaveStorageForTests(null);
    const save = defaultSave();
    edit(save);
    return new PlayScreen(playApp(save), makeLevel({ id }), 1, 1);
  };
  const hudOf = (p: PlayScreen) => (p as unknown as { buildUi(): HudPlayUi }).buildUi().hud!;

  it('a fresh save: levels 1–4 are bare (the HUD draws no bar), level 5 is not and lists all three', () => {
    for (const id of [1, 2, 3, 4]) {
      const p = play(id);
      expect(p.bare, `level ${id}`).toBe(true);
      expect(hudOf(p).bare).toBe(true);
    }
    const p5 = play(5);
    expect(p5.bare).toBe(false);
    expect(hudOf(p5).bare).toBe(false);
    expect(hudOf(p5).boosters.map((b) => b.kind)).toEqual(['overdrive', 'freeze', 'airstrike']);
  });

  it('any gold, or level 1 cleared (its gold earned, then spent on boosters), shows the bar on 1–4', () => {
    expect(play(2, (s) => void (s.gold = 10)).bare).toBe(false);
    expect(play(3, (s) => void (s.stars['1'] = 1)).bare).toBe(false);
    expect(play(2, (s) => void (s.stars['2'] = 3)).bare).toBe(true); // a skip past level 1 earned no gold
    expect(hudOf(play(2, (s) => void (s.gold = 10))).bare).toBe(false);
  });

  it('bare: a tap on a booster rect or a booster hotkey does nothing (no command, no free-charge video, no targeting)', () => {
    const p = play(1);
    const sent: string[] = [];
    vi.spyOn(p.loop, 'enqueue').mockImplementation((cmd) => void sent.push(cmd.type));
    for (const k of ['overdrive', 'freeze', 'airstrike'] as const) {
      const r = BOOSTERS[k];
      const c = { x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, type: 'touch' as const, timeMs: 0 };
      p.down(c);
      p.up(c);
      expect(p.useBooster(k)).toBe(false);
    }
    for (const key of ['1', '2', '3']) p.key({ key } as KeyboardEvent);
    expect(sent).toEqual([]);
    expect(p.loop.paused).toBe(false); // a rewarded video would hold the sim
    expect(p.targeting).toBe(false);
  });

  /** The pills drawn and whether the booster bar was (its OVERDRIVE price chip text, 37 gold here). */
  function hudFrame(id: number, bare: boolean): { pills: Rect[]; bar: boolean } {
    calls.pills.length = 0;
    const lvl = makeLevel({ id });
    const ui = uiFor(lvl, 'playing');
    const overdrive = { kind: 'overdrive' as const, cost: 37, charges: 0, affordable: false, adOffer: false, active: false, remainingMs: 0, durationMs: 0 };
    ui.hud = { ...ui.hud!, boosters: [overdrive], bare };
    const texts: { text: string; font: string }[] = [];
    drawHud(recordingCtx(texts), { ...createState(lvl, 1), time: 10_000 }, VIEW, ui, 0);
    return { pills: [...calls.pills], bar: texts.some((x) => x.text === '37') };
  }

  it('drawn: level 1 bare has no STREAMS pill, booster bar or coin pill; levels 2–4 bare keep STREAMS; level 5 draws all three', () => {
    let f = hudFrame(1, true);
    expect(f.pills).not.toContain(HUD.streams);
    expect(f.pills).not.toContain(HUD.coins);
    expect(f.bar).toBe(false);
    f = hudFrame(1, false); // a replay of level 1 with gold: bar and coins back, still no STREAMS
    expect(f.pills).not.toContain(HUD.streams);
    expect(f.pills).toContain(HUD.coins);
    expect(f.bar).toBe(true);
    f = hudFrame(4, true);
    expect(f.pills).toContain(HUD.streams);
    expect(f.pills).not.toContain(HUD.coins);
    expect(f.bar).toBe(false);
    f = hudFrame(5, false);
    expect(f.pills).toContain(HUD.streams);
    expect(f.pills).toContain(HUD.coins);
    expect(f.bar).toBe(true);
  });
});
