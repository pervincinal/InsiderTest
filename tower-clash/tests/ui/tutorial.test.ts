import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { step } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import { getLevel } from '../../src/levels/index';
import { Tutorial, tutorialFor } from '../../src/ui/tutorial';

const stateFor = (id: number) => createState(getLevel(id)!, 1);

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
    expect(tut.current(state)?.text).toBe('Tap the target again to stop the stream');
    tut.onCommand({ type: 'unlink', owner: 'player', from: 'home' }, state); // "all links of home" counts too
    expect(tut.finished).toBe(true);
  });

  it('also completes when the stream ends on its own after the capture (target full)', () => {
    const state = stateFor(2);
    const tut = tutorialFor(2, 0)!;
    tut.onCommand(link, state);
    applyCommand(state, link);
    expect(tut.current(state)?.text).toBe('Tap the target again to stop the stream');
    // the sim ended the supply line: mid is ours and no link remains
    state.towers['mid']!.owner = 'player';
    state.links = [];
    tut.onSelect(null, state);
    expect(tut.finished).toBe(true);
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
