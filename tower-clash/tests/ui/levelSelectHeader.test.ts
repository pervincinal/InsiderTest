import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { LEVEL_MAP, levelNodeRect } from '../../src/render/menuLayout';
import type { ShopTab } from '../../src/render/menuLayout';
import type { LevelSelectOpts } from '../../src/render/menusLevels';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { LevelSelectScreen } from '../../src/ui/levelSelect';

/*
 * REV-42: on the level map a press on one header button released over another acted on the release
 * target (`up()` re-read `chromeAt(p)` and never compared it with the pressed rect; `move()` only
 * cancels on vertical travel): finger down on BACK, slide right to the wallet, lift → the shop opened
 * on CRYSTALS. The release must land on the control the press started on (settings.ts / achievements.ts
 * already do this); a header press released on the path starts no level, a path press released on the
 * header leaves nothing.
 */

const drawn = vi.hoisted(() => ({ opts: null as LevelSelectOpts | null }));
vi.mock('../../src/render/menusLevels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/render/menusLevels')>()),
  drawLevelSelect: (_v: unknown, _p: unknown, o: LevelSelectOpts) => void (drawn.opts = o),
}));

const VIEW = { scale: 0.5 } as View;

function fakeApp(save: SaveData) {
  const calls: string[] = [];
  const app: App = {
    view: VIEW,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {
      calls.push('title');
    },
    goLevels() {},
    goShop(tab?: ShopTab) {
      calls.push(`shop:${tab ?? 'browse'}`);
    },
    goAchievements() {},
    startLevel(levelId) {
      calls.push(`level:${levelId}`);
      return Promise.resolve(true);
    },
    go() {},
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-11-24',
    weekKey: () => '2026-11-23',
  };
  return { app, calls };
}

const centre = (r: Rect, timeMs = 0) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, type: 'touch' as const, timeMs });

/** Press on `from`, slide in a few samples and lift on `to`. */
function slide(s: LevelSelectScreen, from: Rect, to: Rect): void {
  const a = centre(from, 0);
  const b = centre(to, 120);
  s.down(a);
  for (let i = 1; i <= 3; i++) s.move({ ...a, x: a.x + ((b.x - a.x) * i) / 4, y: a.y + ((b.y - a.y) * i) / 4, timeMs: i * 30 });
  s.up(b);
}
const tap = (s: LevelSelectScreen, r: Rect): void => slide(s, r, r);

let save: SaveData;
let shell: ReturnType<typeof fakeApp>;
let screen: LevelSelectScreen;
/** The first node where it is drawn right now (the map opens centred on the current level). */
let node0: Rect;

beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  shell = fakeApp(save);
  screen = new LevelSelectScreen(shell.app);
  screen.draw(VIEW, 0);
  node0 = levelNodeRect(0, drawn.opts!.scroll);
});

describe('level map header: a press is acted on only where it started (REV-42)', () => {
  it('down on BACK, lifted on the wallet: no title, no shop', () => {
    slide(screen, LEVEL_MAP.back, LEVEL_MAP.wallet);
    expect(shell.calls).toEqual([]);
  });

  it('down on the wallet, lifted on BACK: nothing', () => {
    slide(screen, LEVEL_MAP.wallet, LEVEL_MAP.back);
    expect(shell.calls).toEqual([]);
  });

  it('down on BACK, lifted on an unlocked node: no level starts (and no title)', () => {
    slide(screen, LEVEL_MAP.back, node0);
    expect(shell.calls).toEqual([]);
  });

  it('down on a node, lifted on BACK: the map stays, nothing starts', () => {
    slide(screen, node0, LEVEL_MAP.back);
    expect(shell.calls).toEqual([]);
  });

  it('plain taps still work: BACK → title, the wallet → shop on Crystals, the commander → Upgrades, a node → the level', () => {
    tap(screen, LEVEL_MAP.back);
    tap(screen, LEVEL_MAP.wallet);
    tap(screen, LEVEL_MAP.commander);
    tap(screen, node0);
    expect(shell.calls).toEqual(['title', 'shop:crystals', 'shop:upgrades', 'level:1']);
  });

  it('a horizontal slide that stays on the same button still counts as its tap', () => {
    const r = LEVEL_MAP.wallet;
    const left: Rect = { x: r.x, y: r.y, w: 20, h: r.h };
    const right: Rect = { x: r.x + r.w - 20, y: r.y, w: 20, h: r.h };
    slide(screen, left, right);
    expect(shell.calls).toEqual(['shop:crystals']);
  });
});
