import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
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

describe('level 1 tutorial', () => {
  it('select home → send home→camp → done', () => {
    const state = stateFor(1);
    const tut = tutorialFor(1, 0)!;
    expect(tut.current(state)?.text).toBe('Tap your tower');
    tut.onSelect('camp', state); // wrong tower: stays
    expect(tut.current(state)?.text).toBe('Tap your tower');
    tut.onSelect('home', state);
    expect(tut.current(state)?.text).toBe('Now tap the grey tower');
    tut.onCommand({ type: 'sendUnits', owner: 'player', from: 'home', to: 'foe', ratio: 1 }, state); // not the grey one
    expect(tut.current(state)?.text).toBe('Now tap the grey tower');
    tut.onCommand({ type: 'sendUnits', owner: 'player', from: 'home', to: 'camp', ratio: 1 }, state);
    expect(tut.current(state)).toBeNull();
    expect(tut.finished).toBe(true);
  });
});

describe('level 2 tutorial', () => {
  it('reinforce hint is gated until mid is captured, then clears on the next send', () => {
    const state = stateFor(2);
    const tut = tutorialFor(2, 0)!;
    const send = { type: 'sendUnits', owner: 'player', from: 'home', to: 'mid', ratio: 1 } as const;
    tut.onCommand(send, state);
    expect(tut.current(state)).toBeNull(); // gated: mid still neutral
    expect(tut.finished).toBe(false);
    tut.onCommand(send, state); // sends while gated do not count
    state.towers['mid']!.owner = 'player';
    expect(tut.current(state)?.text).toMatch(/Reinforce/);
    tut.onCommand(send, state);
    expect(tut.finished).toBe(true);
  });
});

describe('level 3 tutorial', () => {
  it('mentions the real upgrade cost and completes on an upgrade command', () => {
    const state = stateFor(3);
    const tut = tutorialFor(3, 0)!;
    tut.onSelect('home', state);
    expect(tut.current(state)?.text).toBe('Tap your selected tower again to upgrade (costs 10)');
    const cmd = { type: 'upgrade', owner: 'player', towerId: 'home' } as const;
    tut.onCommand(cmd, state);
    applyCommand(state, cmd);
    expect(state.towers['home']!.level).toBe(2);
    expect(tut.finished).toBe(true);
  });
});
