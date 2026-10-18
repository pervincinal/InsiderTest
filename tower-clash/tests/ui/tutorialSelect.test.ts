import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Command } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { PlayScreen } from '../../src/ui/play';
import { getLoadedLevel, loadAllLevels } from '../../src/levels/index';
import { t } from '../../src/ui/i18n';

/*
 * BUG-50 / BUG-51 (publisher, build-18 test plan): a tutorial step's instruction must work from the
 * selection the previous step left. The step's `select` (src/ui/tutorialSteps.ts) is applied by the
 * play screen the frame the step comes up:
 *   level 2 "now tap the new tower, then the red one" — home stayed selected after home → side, so a
 *     tap on side cut that stream (and the swipe step then cleared unseen): the selection is cleared,
 *     tap side → tap foe makes side → foe and home → side keeps flowing;
 *   level 2 "swipe across the stream" — no selection, so a stray tap on side does not cut;
 *   level 3 "now take the other grey tower too" — home's one L1 stream is busy (a tap on west was the
 *     link-limit refusal): east, just taken, is selected, one tap on west makes east → west;
 *   level 4 "stop this tower's stream" — home is selected, so a tap on its target stops the stream.
 */

await loadAllLevels();

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

let now: number;
let commands: Command[];

beforeEach(() => {
  setSaveStorageForTests(null);
  now = 1000;
  commands = [];
});

function start(levelId: number): PlayScreen {
  const play = new PlayScreen(fakeApp(defaultSave()), getLoadedLevel(levelId)!, 1, 1);
  const enqueue = play.loop.enqueue.bind(play.loop);
  vi.spyOn(play.loop, 'enqueue').mockImplementation((cmd: Command) => {
    commands.push(cmd);
    enqueue(cmd);
  });
  return play;
}

function frame(play: PlayScreen): void {
  now += 50;
  play.update(50, now);
}

/** A real tap (down + up) on a tower, where the play screen draws it. */
function tap(play: PlayScreen, id: string): void {
  const tw = play.state.towers[id]!;
  const p = { ...play.fromLayout(tw.x, tw.y), id: 1, type: 'touch' as const, timeMs: now };
  play.down(p);
  play.up(p);
}

/** Hand a tower to the player (the capture without the fight). */
function capture(play: PlayScreen, id: string, units = 5): void {
  play.state.towers[id]!.owner = 'player';
  play.state.towers[id]!.units = units;
}

const playerLinks = (play: PlayScreen) => play.state.links.filter((l) => l.owner === 'player').map((l) => `${l.from}->${l.to}`);
const sentLinks = () => commands.filter((c) => c.type === 'link' || c.type === 'unlink').map((c) => `${c.type}:${c.from}->${c.type === 'link' ? c.to : (c.to ?? '*')}`);

describe('tutorial steps set the selection their instruction assumes (BUG-50 / BUG-51)', () => {
  it('BUG-50, level 2: "tap the new tower, then the red one" starts from no selection — side → foe links, home → side keeps flowing', () => {
    const play = start(2);
    frame(play);
    expect(play.tutorialStep()?.text).toBe(t('tutorial.tapThenGrey'));
    tap(play, 'home');
    tap(play, 'side');
    frame(play);
    expect(playerLinks(play)).toEqual(['home->side']);
    expect(play.gestures.selectedTowerId, 'the source stays selected after a tap link').toBe('home');
    capture(play, 'side');
    frame(play);
    expect(play.tutorialStep()?.text).toBe(t('tutorial.goAround'));
    expect(play.gestures.selectedTowerId, 'step 2 clears the selection').toBeNull();
    // the player does exactly what the bubble says
    tap(play, 'side');
    expect(play.gestures.selectedTowerId).toBe('side');
    tap(play, 'foe');
    frame(play);
    expect(sentLinks()).toEqual(['link:home->side', 'link:side->foe']);
    expect(playerLinks(play)).toEqual(['home->side', 'side->foe']);
    // step 3 (the swipe) now shows — with no selection, so a stray tap on side only selects it
    expect(play.tutorialStep()?.text).toBe(t('tutorial.stopStream'));
    expect(play.gestures.selectedTowerId).toBeNull();
  });

  it('level 2: the selection is applied once — a tap after the step came up is the player\'s own', () => {
    const play = start(2);
    tap(play, 'home');
    tap(play, 'side');
    frame(play);
    capture(play, 'side');
    frame(play);
    expect(play.gestures.selectedTowerId).toBeNull();
    tap(play, 'home');
    for (let i = 0; i < 5; i++) frame(play);
    expect(play.gestures.selectedTowerId).toBe('home');
  });

  it('BUG-51, level 3: "take the other grey tower too" selects the grey just taken — one tap on west makes east → west, no link-limit refusal', () => {
    const play = start(3);
    frame(play);
    tap(play, 'home');
    tap(play, 'east');
    frame(play);
    expect(playerLinks(play)).toEqual(['home->east']);
    capture(play, 'east');
    frame(play);
    expect(play.tutorialStep()?.text).toBe(t('tutorial.grabOther'));
    expect(play.gestures.selectedTowerId).toBe('east');
    tap(play, 'west');
    expect(play.gestures.limitHint, 'no "L2 needed" refusal').toBeNull();
    frame(play);
    expect(sentLinks()).toEqual(['link:home->east', 'link:east->west']);
    expect(play.tutorialStep(), 'the link into west completes the step').toBeNull();
  });

  it('level 3, west first: the step selects west and one tap on east makes west → east', () => {
    const play = start(3);
    tap(play, 'home');
    tap(play, 'west');
    frame(play);
    capture(play, 'west');
    frame(play);
    expect(play.tutorialStep()?.text).toBe(t('tutorial.grabOther'));
    expect(play.gestures.selectedTowerId).toBe('west');
    tap(play, 'east');
    frame(play);
    expect(sentLinks()).toContain('link:west->east');
  });

  it('level 4: "stop this tower\'s stream" selects home — a tap on its target stops the stream', () => {
    const play = start(4);
    tap(play, 'home');
    tap(play, 'outpost');
    frame(play);
    expect(playerLinks(play)).toEqual(['home->outpost']);
    tap(play, 'home'); // the player deselects home meanwhile
    expect(play.gestures.selectedTowerId).toBeNull();
    capture(play, 'outpost');
    frame(play);
    expect(play.tutorialStep()?.text).toBe(t('tutorial.stopToGrow'));
    expect(play.gestures.selectedTowerId).toBe('home');
    tap(play, 'outpost');
    frame(play);
    expect(playerLinks(play)).toEqual([]);
    expect(play.tutorialStep()?.text).toBe(t('tutorial.fillToUpgrade', { n: 25 }));
  });
});
