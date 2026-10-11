import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { step } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import { getLoadedLevel, loadAllLevels } from '../../src/levels/index';
import { TUTORIAL_STEP_TIMEOUT_MS, Tutorial, tutorialFor } from '../../src/ui/tutorial';

await loadAllLevels();
const stateFor = (id: number) => createState(getLoadedLevel(id)!, 1);

describe('tutorialFor', () => {
  it('exists for levels 1-3 only and is skipped once the level has a star', () => {
    expect(tutorialFor(1, 0)).toBeInstanceOf(Tutorial);
    expect(tutorialFor(2, 0)).toBeInstanceOf(Tutorial);
    expect(tutorialFor(3, 0)).toBeInstanceOf(Tutorial);
    expect(tutorialFor(4, 0)).toBeNull();
    expect(tutorialFor(1, 1)).toBeNull();
    expect(tutorialFor(3, 3)).toBeNull();
  });

  it('every step points at a tower that exists in its level', () => {
    for (const id of [1, 2, 3]) {
      const state = stateFor(id);
      for (const step of tutorialFor(id, 0)!.steps) expect(state.towers[step.towerId], `level ${id}: ${step.towerId}`).toBeDefined();
    }
  });
});

describe('level 1 tutorial (rules v2: start a stream)', () => {
  it('select home → link home→camp → done', () => {
    const state = stateFor(1);
    const tut = tutorialFor(1, 0)!;
    expect(tut.current(state)?.text).toBe('Tap your tower');
    tut.onSelect('camp', state); // wrong tower: stays
    expect(tut.current(state)?.text).toBe('Tap your tower');
    tut.onSelect('home', state);
    expect(tut.current(state)?.text).toBe('Now tap the grey tower — the stream keeps flowing');
    tut.onCommand({ type: 'link', owner: 'player', from: 'home', to: 'foe' }, state); // not the grey one
    expect(tut.current(state)?.text).toBe('Now tap the grey tower — the stream keeps flowing');
    tut.onCommand({ type: 'unlink', owner: 'player', from: 'home', to: 'camp' }, state); // wrong verb
    expect(tut.finished).toBe(false);
    tut.onCommand({ type: 'link', owner: 'player', from: 'home', to: 'camp' }, state);
    expect(tut.current(state)).toBeNull();
    expect(tut.finished).toBe(true);
  });
});

describe('level 2 tutorial (rules v2: stop a stream)', () => {
  const link = { type: 'link', owner: 'player', from: 'home', to: 'mid' } as const;

  it('stop hint is gated until the home→mid stream exists, then clears on the unlink', () => {
    const state = stateFor(2);
    const tut = tutorialFor(2, 0)!;
    expect(tut.current(state)?.text).toBe('Tap your tower, then the grey tower');
    tut.onCommand(link, state);
    expect(tut.current(state)).toBeNull(); // gated: no stream in the state yet
    expect(tut.finished).toBe(false);
    tut.onCommand({ type: 'unlink', owner: 'player', from: 'home', to: 'mid' }, state); // unlinks while gated do not count
    expect(tut.finished).toBe(false);
    applyCommand(state, link);
    expect(state.links).toHaveLength(1);
    expect(tut.current(state)?.text).toBe('Swipe across the stream to stop it');
    tut.onCommand({ type: 'unlink', owner: 'player', from: 'home' }, state); // "all links of home" counts too
    expect(tut.finished).toBe(true);
  });

  it('also completes when the stream ends on its own after the capture (target full)', () => {
    const state = stateFor(2);
    const tut = tutorialFor(2, 0)!;
    tut.onCommand(link, state);
    applyCommand(state, link);
    expect(tut.current(state)?.text).toBe('Swipe across the stream to stop it');
    // the sim ended the supply line: mid is ours and no link remains
    state.towers['mid']!.owner = 'player';
    state.links = [];
    tut.onSelect(null, state);
    expect(tut.finished).toBe(true);
  });
});

describe('level 2 stop step accepts any stop of a stream into mid (BUG-33)', () => {
  const homeMid = { type: 'link', owner: 'player', from: 'home', to: 'mid' } as const;
  const atStop = () => {
    const state = stateFor(2);
    const tut = tutorialFor(2, 0)!;
    tut.onCommand(homeMid, state);
    applyCommand(state, homeMid);
    expect(tut.current(state)?.text).toBe('Swipe across the stream to stop it');
    return { state, tut };
  };

  it('a swipe cut of home→mid completes it', () => {
    const { state, tut } = atStop();
    tut.onCommand({ type: 'unlink', owner: 'player', from: 'home', to: 'mid' }, state);
    expect(tut.finished).toBe(true);
  });

  it('a cut of another player stream into mid (side→mid) completes it; streams elsewhere and foreign unlinks do not', () => {
    const { state, tut } = atStop();
    state.towers['side']!.owner = 'player';
    state.towers['side']!.units = 5;
    applyCommand(state, { type: 'link', owner: 'player', from: 'side', to: 'mid' });
    expect(state.links.filter((l) => l.to === 'mid')).toHaveLength(2);
    tut.onCommand({ type: 'unlink', owner: 'player', from: 'side', to: 'foe' }, state); // not into mid
    tut.onCommand({ type: 'unlink', owner: 'enemy1', from: 'foe', to: 'mid' }, state); // not the player's
    tut.onCommand({ type: 'unlink', owner: 'player', from: 'foe' }, state); // "all links of foe": none into mid of the player's
    expect(tut.finished).toBe(false);
    tut.onCommand({ type: 'unlink', owner: 'player', from: 'side', to: 'mid' }, state);
    expect(tut.finished).toBe(true);
  });

  it('shows while any player stream runs into mid, even when home→mid is gone', () => {
    const { state, tut } = atStop();
    state.towers['side']!.owner = 'player';
    state.towers['side']!.units = 5;
    applyCommand(state, { type: 'link', owner: 'player', from: 'side', to: 'mid' });
    state.links = state.links.filter((l) => l.from !== 'home');
    expect(tut.current(state)?.text).toBe('Swipe across the stream to stop it');
    state.links = [];
    expect(tut.current(state)).toBeNull(); // gated again (mid still neutral: not done)
    expect(tut.finished).toBe(false);
  });
});

describe('tutorial step timeout (BUG-33: no overlay softlock)', () => {
  it('a step visible for TUTORIAL_STEP_TIMEOUT_MS without completion gives way to the next one', () => {
    expect(TUTORIAL_STEP_TIMEOUT_MS).toBe(20_000);
    const state = stateFor(1);
    const tut = tutorialFor(1, 0)!;
    const first = tut.current(state)!.text;
    for (let ms = 0; ms < TUTORIAL_STEP_TIMEOUT_MS - 16; ms += 16) tut.elapse(16, state);
    expect(tut.current(state)?.text).toBe(first); // 19.98 s: still on
    tut.elapse(16, state);
    expect(tut.current(state)?.text).not.toBe(first);
    expect(tut.finished).toBe(false);
    // the next step gets its own full 20 s
    for (let ms = 0; ms < TUTORIAL_STEP_TIMEOUT_MS - 16; ms += 16) tut.elapse(16, state);
    expect(tut.finished).toBe(false);
    tut.elapse(16, state);
    expect(tut.finished).toBe(true);
    expect(tut.current(state)).toBeNull();
  });

  it('only visible time counts: a gated step does not time out, and one huge frame counts at most 250 ms', () => {
    const state = stateFor(2);
    const tut = tutorialFor(2, 0)!;
    const homeMid = { type: 'link', owner: 'player', from: 'home', to: 'mid' } as const;
    tut.onCommand(homeMid, state); // step 1 done; step 2 gated on the link
    for (let i = 0; i < 100; i++) tut.elapse(1000, state); // 100 s gated
    expect(tut.finished).toBe(false);
    applyCommand(state, homeMid);
    expect(tut.current(state)?.text).toBe('Swipe across the stream to stop it');
    tut.elapse(60_000, state); // a stalled frame / background return
    expect(tut.current(state)).not.toBeNull();
    for (let i = 0; i < 78; i++) tut.elapse(250, state); // 79 × 250 = 19.75 s with the one above
    expect(tut.finished).toBe(false);
    tut.elapse(250, state);
    expect(tut.finished).toBe(true);
  });

  it('a completed step resets the clock for the next', () => {
    const state = stateFor(1);
    const tut = tutorialFor(1, 0)!;
    for (let i = 0; i < 76; i++) tut.elapse(250, state); // 19 s on step 1
    tut.onSelect('home', state); // completes step 1
    expect(tut.current(state)?.text).toBe('Now tap the grey tower — the stream keeps flowing');
    for (let i = 0; i < 76; i++) tut.elapse(250, state); // 19 s on step 2
    expect(tut.finished).toBe(false);
  });
});

describe('level 3 tutorial (rules v2: auto-upgrade)', () => {
  it('mentions the L1 capacity and completes when a player tower reaches level 2 by filling up', () => {
    const state = stateFor(3);
    const tut = tutorialFor(3, 0)!;
    expect(tut.current(state)?.text).toBe(`Let a tower fill to ${C.CAPACITY[1]} to upgrade it — L2 can attack 2 targets`);
    expect(C.CAPACITY[1]).toBe(25);
    tut.onSelect('home', state);
    expect(tut.finished).toBe(false); // selecting is not the lesson
    const home = state.towers['home']!;
    home.units = C.CAPACITY[1] - 1;
    step(state); // production tops it up → auto-upgrade
    for (let i = 0; i < 40 && home.level < 2; i++) step(state);
    expect(home.level).toBe(2);
    tut.onSelect(null, state);
    expect(tut.finished).toBe(true);
  });
});
