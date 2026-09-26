import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LevelDef, Link } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { t } from '../../src/ui/i18n';
import { PlayScreen } from '../../src/ui/play';
import type { StalemateWatch } from '../../src/ui/play';
import { playSfx } from '../../src/audio/index';
import { makeLevel } from '../helpers';

/*
 * ART-9 (rules v3): src/ui/play.ts plays `refuse` once for every refused tap (link limit, blocked
 * lane, empty source — all three raise `PlayGestures.limitHint`) and `stalemate` when the stalemate
 * toast shows. The audio facade is mocked: only the calls are checked, the recipes have their own
 * tests in tests/audio/sfx.test.ts.
 */

vi.mock('../../src/audio/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/audio/index')>();
  return { ...actual, playSfx: vi.fn(actual.playSfx) };
});

const played = vi.mocked(playSfx);
const calls = (name: string): number => played.mock.calls.filter((c) => c[0] === name).length;

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
    dayKey: () => '2026-09-26',
    weekKey: () => '2026-09-21',
  };
}

/**
 * Same map as tests/ui/pointer.test.ts: player `p` (L1), enemy `e`, neutral `n`, and a neutral `x`
 * behind a wall so `p`–`x` has no lane. All towers sit inside the HUD's map band (y 96..1180).
 */
function fixture(playerUnits = 10): LevelDef {
  return makeLevel({
    towers: [
      { id: 'p', x: 200, y: 1000, owner: 'player', units: playerUnits, level: 1 },
      { id: 'e', x: 200, y: 400, owner: 'enemy1', units: 10, level: 1 },
      { id: 'n', x: 520, y: 700, owner: 'neutral', units: 5 },
      { id: 'x', x: 520, y: 300, owner: 'neutral', units: 5 },
    ],
    obstacles: [{ kind: 'wall', points: [{ x: 410, y: 450 }, { x: 470, y: 500 }], width: 28 }],
  });
}

const tap = (play: PlayScreen, x: number, y: number, timeMs: number): void => {
  const p = { x, y, id: 1, type: 'mouse' as const, timeMs };
  play.down(p);
  play.up(p);
};

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  played.mockClear();
});

describe('refused taps play one `refuse` thud (ART-9)', () => {
  it('blocked lane and link limit, through the one limitHint hook; plain selects and links stay silent', () => {
    const play = new PlayScreen(fakeApp(save), fixture(), 1, 1);
    tap(play, 200, 1000, 0); // select p
    expect(play.gestures.selectedTowerId).toBe('p');
    expect(calls('refuse')).toBe(0);

    tap(play, 520, 300, 10); // x: no lane from p → blocked
    expect(play.gestures.limitHintText).toBe(t('hint.blocked'));
    expect(calls('refuse')).toBe(1);

    tap(play, 520, 300, 20); // again: a fresh refusal, a second thud (the rate limit lives in the player)
    expect(calls('refuse')).toBe(2);

    tap(play, 200, 400, 30); // e: link (a send tick, no thud)
    play.update(50, 100); // apply the link command
    expect(play.state.links.map((l) => `${l.from}->${l.to}`)).toEqual(['p->e']);
    expect(calls('refuse')).toBe(2);

    tap(play, 520, 700, 110); // n: second stream at L1 → limit
    expect(play.gestures.limitHintText).toBe(t('hint.linkLimit', { n: 2 }));
    expect(calls('refuse')).toBe(3);
  });

  it('empty source', () => {
    const play = new PlayScreen(fakeApp(save), fixture(0), 1, 1);
    tap(play, 200, 1000, 0);
    tap(play, 200, 400, 10);
    expect(play.gestures.limitHintText).toBe(t('hint.empty'));
    expect(calls('refuse')).toBe(1);
    expect(play.state.links).toEqual([]);
  });
});

describe('stalemate hint plays the `stalemate` chime with the toast (ART-9)', () => {
  it('once, when StalemateWatch.check fires', () => {
    const play = new PlayScreen(fakeApp(save), fixture(), 1, 1);
    // The watch's own numbers are tested in tests/ui/stalemate.test.ts; here it is stubbed to fire
    // on the first check after the link exists.
    let fired = false;
    const stub: Pick<StalemateWatch, 'check' | 'onLanded' | 'onClash'> = {
      check: (state): Link | null => {
        if (fired || !state.links.length) return null;
        fired = true;
        return state.links[0]!;
      },
      onLanded() {},
      onClash() {},
    };
    (play as unknown as { stalemate: typeof stub }).stalemate = stub;

    play.update(50, 100); // no link yet: nothing
    expect(calls('stalemate')).toBe(0);
    expect(play.toast.opts(100)).toBeNull();

    play.loop.enqueue({ type: 'link', owner: 'player', from: 'p', to: 'e' });
    play.update(50, 200);
    expect(calls('stalemate')).toBe(1);
    expect(play.toast.opts(200)).toMatchObject({ text: t('hint.stalemate'), kind: 'error' });

    play.update(50, 300);
    expect(calls('stalemate')).toBe(1);
  });
});
