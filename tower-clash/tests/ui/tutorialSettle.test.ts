import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Command, GameState } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { PlayScreen } from '../../src/ui/play';
import type { TutorialStep } from '../../src/ui/tutorial';
import { TUTORIAL_STEP_TIMEOUT_MS, Tutorial, reached, tutorialFor } from '../../src/ui/tutorial';
import { getLoadedLevel, loadAllLevels } from '../../src/levels/index';

/*
 * REV-19 (2026-11-21): the tutorial skips every step whose `doneWhen` already holds in one call, so an
 * already-done intermediate step is never `current()` for a frame — never drawn, and the play screen
 * never applies its `select` (level 1: no "tap the grey tower" flash after a drag link, FEEL-1-1).
 */

await loadAllLevels();

const plain = (name: string, rest: Omit<TutorialStep, 'text'>): TutorialStep => ({ text: name, ...rest });

describe('Tutorial settles consecutive done steps at once', () => {
  it('two consecutive already-done steps are skipped in one onSelect', () => {
    let aDone = false;
    const tut = new Tutorial([
      plain('a', { towerId: 'x', doneWhen: () => aDone }),
      plain('b', { towerId: 'x', doneWhen: () => true }),
      plain('c', { towerId: 'x', doneWhen: () => true }),
      plain('d', { towerId: 'x', doneWhen: () => false }),
    ]);
    const state = {} as GameState;
    tut.onSelect(null, state);
    expect(tut.current(state)?.text).toBe('a');
    aDone = true;
    tut.onSelect(null, state);
    expect(tut.stepIndex).toBe(3);
    expect(tut.current(state)?.text).toBe('d');
  });

  it('bounded by the step count: every step done finishes in one call', () => {
    const tut = new Tutorial([1, 2, 3].map((i) => plain(`s${i}`, { towerId: 'x', doneWhen: () => true })));
    tut.onSelect(null, {} as GameState);
    expect(tut.finished).toBe(true);
    expect(tut.stepIndex).toBe(3);
  });

  it('a step completed by onSelect / onCommand / the timeout also skips the done steps after it', () => {
    const mk = () =>
      new Tutorial([
        plain('a', { towerId: 'x', onSelect: (s) => s === 'x', onCommand: (c) => c.type === 'unlink' }),
        plain('b', { towerId: 'x', doneWhen: () => true }),
        plain('c', { towerId: 'x' }),
      ]);
    const state = {} as GameState;
    const bySelect = mk();
    bySelect.onSelect('x', state);
    expect(bySelect.current(state)?.text).toBe('c');
    const byCommand = mk();
    byCommand.onCommand({ type: 'unlink', owner: 'player', from: 'x' }, state);
    expect(byCommand.current(state)?.text).toBe('c');
    const byTimeout = mk();
    for (let ms = 0; ms < TUTORIAL_STEP_TIMEOUT_MS; ms += 250) byTimeout.elapse(250, state);
    expect(byTimeout.current(state)?.text).toBe('c');
  });

  it('level 1: a link home → camp made under step 0 ends the tutorial in one call ("tap the grey tower" never current)', () => {
    const state = createState(getLoadedLevel(1)!, 1);
    const tut = tutorialFor(1, 0)!;
    applyCommand(state, { type: 'link', owner: 'player', from: 'home', to: 'camp' });
    expect(reached(state, 'home', 'camp')).toBe(true);
    tut.onSelect('home', state);
    expect(tut.finished).toBe(true);
    expect(tut.current(state)).toBeNull();
  });
});

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
    dayKey: () => '2026-11-21',
    weekKey: () => '2026-11-16',
  };
}

let now: number;
beforeEach(() => {
  setSaveStorageForTests(null);
  now = 1000;
});

describe('PlayScreen never applies the select of a step that is already done (REV-19)', () => {
  it('a step with `select` whose doneWhen holds when it comes up leaves the selection alone', () => {
    const play = new PlayScreen(fakeApp(defaultSave()), getLoadedLevel(1)!, 1, 1);
    vi.spyOn(play.loop, 'enqueue').mockImplementation((_cmd: Command) => undefined);
    const select = vi.fn(() => null);
    (play as unknown as { tutorial: Tutorial }).tutorial = new Tutorial([
      plain('tap home', { towerId: 'home', onSelect: (sel) => sel === 'home' }),
      plain('deselect, then camp', { towerId: 'camp', select, doneWhen: (s) => reached(s, 'home', 'camp') }),
      plain('open end', { towerId: 'home' }),
    ]);
    play.startMatch();
    play.update(0, now);
    play.gestures.selectedTowerId = 'home';
    applyCommand(play.state, { type: 'link', owner: 'player', from: 'home', to: 'camp' }); // e.g. a drag link landed
    for (let i = 0; i < 5; i++) {
      now += 50;
      play.update(50, now);
    }
    expect(play.tutorialStep()?.text).toBe('open end');
    expect(select).not.toHaveBeenCalled();
    expect(play.gestures.selectedTowerId).toBe('home');
  });
});
