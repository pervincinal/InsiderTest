import { beforeEach, describe, expect, it } from 'vitest';
import type { Command, LevelDef } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { PlayScreen } from '../../src/ui/play';
import { LIMIT_HINT_MS, NOTICE_HINT_MS, PlayGestures } from '../../src/input/pointer';
import { t } from '../../src/ui/i18n';
import { enCore } from '../../src/ui/locales/enCore';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { makeLevel } from '../helpers';

/*
 * GD-5f (GDD §3.11 b): the first player supply line of a match — a `link` the sim marks `relay`
 * (rule 13: into an own full tower that streams onward) — is confirmed once through the limit-hint
 * bubble (`hint.supplyLine`), standing over the full tower and without the refusal shake. Plain links
 * never raise it, a second supply line in the same match does not either, and on level 2 the link that
 * completes the tutorial's supply-line step (GD-5a step 4) raises nothing: the step was the lesson.
 */

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
    dayKey: () => '2026-10-18',
    weekKey: () => '2026-10-12',
  };
}

/**
 * `relay` (L1, full at 25) streams on into the neutral `n`; `src` can stream into it — a supply line.
 * The enemy sits far off (it only keeps the match running).
 */
function fixture(id = 999): LevelDef {
  return makeLevel({
    id,
    towers: [
      { id: 'src', x: 360, y: 1120, owner: 'player', units: 20, level: 1 },
      { id: 'relay', x: 360, y: 840, owner: 'player', units: 25, level: 1 },
      { id: 'n', x: 360, y: 560, owner: 'neutral', units: 40 },
      { id: 'e', x: 640, y: 160, owner: 'enemy1', units: 10, level: 1 },
    ],
  });
}

const link = (from: string, to: string): Command => ({ type: 'link', owner: 'player', from, to });
const unlink = (from: string, to: string): Command => ({ type: 'unlink', owner: 'player', from, to });

let save: SaveData;
let now: number;

beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  now = 1000;
});

/** One 50 ms sim tick at a wall clock advanced by `dt`. */
function frame(play: PlayScreen, dt = 50): void {
  now += dt;
  play.update(50, now);
}

const relayLinks = (play: PlayScreen) => play.state.links.filter((l) => l.owner === 'player' && l.relay).map((l) => `${l.from}->${l.to}`);

describe('supply-line confirmation (GD-5f)', () => {
  it('the text is the backlog wording; a confirmation outlasts a refusal', () => {
    expect(enCore['hint.supplyLine']).toBe('Supply line: your full tower passes soldiers on');
    expect(az['hint.supplyLine']).toBe('Təchizat xətti: dolu qüllə əsgərləri irəli ötürür');
    expect(ru['hint.supplyLine']).toBe('Линия снабжения: полная башня передаёт бойцов');
    expect(tr['hint.supplyLine']).toBe('İkmal hattı: dolu kule askerleri aktarır');
    expect(NOTICE_HINT_MS).toBeGreaterThan(LIMIT_HINT_MS);
    const g = new PlayGestures({ getState: () => null, onCommand: () => {} });
    g.notify('x', 'relay', 100);
    expect(g.limitHint).toEqual({ until: 100 + NOTICE_HINT_MS, towerId: 'relay' });
    expect(g.limitHintText).toBe('x');
    g.tick(100 + NOTICE_HINT_MS);
    expect(g.limitHint).toBeNull();
  });

  it('a relay link raises hint.supplyLine once per match, over the full tower; plain links never do', () => {
    const play = new PlayScreen(fakeApp(save), fixture(), 1, 1);
    play.startMatch(); // AUD-B11: commands below bypass the gestures, so the hold ends here
    play.loop.enqueue(link('relay', 'n')); // a plain attack
    frame(play);
    expect(play.state.links.map((l) => `${l.from}->${l.to}:${l.relay}`)).toEqual(['relay->n:false']);
    expect(play.gestures.limitHint).toBeNull();

    play.loop.enqueue(link('src', 'relay')); // into the full tower that streams onward: a supply line
    frame(play);
    expect(relayLinks(play)).toEqual(['src->relay']);
    expect(play.gestures.limitHintText).toBe(t('hint.supplyLine'));
    expect(play.gestures.limitHint).toEqual({ until: now + NOTICE_HINT_MS, towerId: 'relay' });

    // the bubble expires; stopping and re-opening the supply line does not show it again
    frame(play, NOTICE_HINT_MS);
    expect(play.gestures.limitHint).toBeNull();
    play.loop.enqueue(unlink('src', 'relay'));
    frame(play);
    expect(relayLinks(play)).toEqual([]);
    play.loop.enqueue(link('src', 'relay'));
    frame(play);
    expect(relayLinks(play)).toEqual(['src->relay']);
    expect(play.gestures.limitHint).toBeNull();
    expect(play.gestures.limitHintText).toBe('');
  });

  it('a new match shows it again', () => {
    for (let i = 0; i < 2; i++) {
      const play = new PlayScreen(fakeApp(save), fixture(), 1, 1);
      play.startMatch(); // AUD-B11: commands below bypass the gestures, so the hold ends here
      play.loop.enqueue(link('relay', 'n'));
      frame(play);
      play.loop.enqueue(link('src', 'relay'));
      frame(play);
      expect(play.gestures.limitHintText, `match ${i + 1}`).toBe(t('hint.supplyLine'));
    }
  });

  it("level 2: the link that completes the tutorial's supply-line step raises no hint", () => {
    const play = new PlayScreen(fakeApp(save), fixture(2), 1, 1);
    play.startMatch(); // AUD-B11: commands below bypass the gestures, so the hold ends here
    play.loop.enqueue(link('relay', 'n'));
    // the first steps give way to the supply-line situation (doneWhen), one per frame
    for (let i = 0; i < 4 && !play.tutorialStep()?.supplyLine; i++) frame(play);
    const step = play.tutorialStep();
    expect(step?.supplyLine).toBe(true);
    expect(step?.text).toBe(t('tutorial.supplyLine'));
    // the player taps src, then the full tower: the step completes on that command
    const tap = (x: number, y: number): void => {
      const p = { ...play.fromLayout(x, y), id: 1, type: 'touch' as const, timeMs: now };
      play.down(p);
      play.up(p);
    };
    tap(360, 1120);
    tap(360, 840);
    expect(play.tutorialStep()).toBeNull();
    frame(play);
    expect(relayLinks(play)).toEqual(['src->relay']);
    expect(play.gestures.limitHint).toBeNull();
    // and it counts as this match's confirmation
    play.loop.enqueue(unlink('src', 'relay'));
    frame(play);
    play.loop.enqueue(link('src', 'relay'));
    frame(play);
    expect(relayLinks(play)).toEqual(['src->relay']);
    expect(play.gestures.limitHint).toBeNull();
  });
});
