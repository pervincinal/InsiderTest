import { describe, expect, it } from 'vitest';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { step } from '../../src/sim/step';
import { C } from '../../src/sim/constants';
import { getLoadedLevel, loadAllLevels } from '../../src/levels/index';
import { capacityOf } from '../../src/sim/step';
import { rngsFor, runAiTick } from '../../src/ai/index';
import { isAiTick } from '../../src/ai/common';
import type { Command, GameState } from '../../src/sim/types';
import { TUTORIAL_STEP_TIMEOUT_MS, Tutorial, stepTowerId, streamMidpoint, tutorialFor } from '../../src/ui/tutorial';
// PERF-10: levels 2–4 are the lazy steps chunk (tests/setup.ts registers it, as the level start does in the game)
import { supplyLineTarget } from '../../src/ui/tutorialSteps';

await loadAllLevels();
const stateFor = (id: number) => createState(getLoadedLevel(id)!, 1);

/** English hint texts (src/ui/locales/enTutorial.ts). */
const TXT = {
  tapThenGrey: 'Tap your tower, then the grey tower',
  goAround: 'Now tap the new tower, then the red one',
  stopStream: 'Swipe across the stream so your tower grows',
  supplyLine: 'A full tower passes soldiers on: stream into it',
  grabOther: 'Now take the other grey tower too',
  stopToGrow: "Stop this tower's stream so it can grow",
  fillToUpgrade: `At ${C.CAPACITY[1]} it levels up — L2 runs 2 streams`,
} as const;

const link = (from: string, to: string) => ({ type: 'link', owner: 'player', from, to }) as const;
const unlink = (from: string, to?: string) => ({ type: 'unlink', owner: 'player', from, to }) as const;
/** A player command as the play screen issues it: the tutorial sees it first, then the sim applies it. */
function issue(tut: Tutorial, state: GameState, cmd: Command): void {
  tut.onCommand(cmd, state);
  applyCommand(state, cmd);
}
/** Hand a tower to the player (a capture without the fight). */
function capture(state: GameState, id: string, units = 5): void {
  state.towers[id]!.owner = 'player';
  state.towers[id]!.units = units;
}
const shown = (tut: Tutorial, state: GameState) => tut.current(state)?.text ?? null;

describe('tutorialFor', () => {
  it('exists for levels 1-4 only and is skipped once the level has a star', () => {
    for (const id of [1, 2, 3, 4]) expect(tutorialFor(id, 0), `level ${id}`).toBeInstanceOf(Tutorial);
    expect(tutorialFor(5, 0)).toBeNull();
    expect(tutorialFor(1, 1)).toBeNull();
    expect(tutorialFor(3, 3)).toBeNull();
    expect(tutorialFor(4, 1)).toBeNull();
  });

  it('every step points at a tower that exists in its level, and every stream anchor joins two of them', () => {
    for (const id of [1, 2, 3, 4]) {
      const state = stateFor(id);
      for (const step of tutorialFor(id, 0)!.steps) {
        const at = stepTowerId(step, state);
        expect(state.towers[at], `level ${id}: ${at}`).toBeDefined();
        if (step.anchor) {
          expect(state.towers[step.anchor.from], `level ${id}: anchor ${step.anchor.from}`).toBeDefined();
          expect(state.towers[step.anchor.to], `level ${id}: anchor ${step.anchor.to}`).toBeDefined();
        }
      }
    }
  });

  it('the step lists of levels 2–4 (GD-5a/b)', () => {
    const texts = (id: number) => tutorialFor(id, 0)!.steps.map((s) => s.text);
    expect(texts(2)).toEqual([TXT.tapThenGrey, TXT.goAround, TXT.stopStream, TXT.supplyLine]);
    // GD-7h: steps 3–4 only come up on the west-first line
    expect(texts(3)).toEqual([TXT.tapThenGrey, TXT.grabOther, TXT.stopStream, TXT.tapThenGrey]);
    expect(texts(4)).toEqual([TXT.stopToGrow, TXT.fillToUpgrade]);
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

describe('level 2 tutorial (GD-5a: side first, the cut gated on the capture, conditional supply line)', () => {
  /** Step 1 done by home → side, side captured, step 2 on screen. */
  const atGoAround = () => {
    const state = stateFor(2);
    const tut = tutorialFor(2, 0)!;
    expect(shown(tut, state)).toBe(TXT.tapThenGrey);
    expect(stepTowerId(tut.current(state)!, state)).toBe('side');
    issue(tut, state, link('home', 'side'));
    capture(state, 'side');
    tut.onSelect(null, state);
    expect(shown(tut, state)).toBe(TXT.goAround);
    expect(stepTowerId(tut.current(state)!, state)).toBe('foe');
    return { state, tut };
  };
  /** …then side → foe: step 3 (the stop) on screen. */
  const atStop = () => {
    const { state, tut } = atGoAround();
    issue(tut, state, link('side', 'foe'));
    tut.onSelect(null, state);
    expect(shown(tut, state)).toBe(TXT.stopStream);
    return { state, tut };
  };

  it('step 1 points at side (not mid) and only home → side completes it', () => {
    const state = stateFor(2);
    const tut = tutorialFor(2, 0)!;
    tut.onCommand(link('home', 'mid'), state); // the rusher's bait
    expect(shown(tut, state)).toBe(TXT.tapThenGrey);
    tut.onCommand(link('home', 'side'), state);
    expect(shown(tut, state)).toBeNull(); // step 2 gated on the capture
    expect(tut.finished).toBe(false);
  });

  it('the stop step stays hidden before side is captured, even with home → side streaming', () => {
    const state = stateFor(2);
    const tut = tutorialFor(2, 0)!;
    issue(tut, state, link('home', 'side'));
    expect(state.links.filter((l) => l.owner === 'player')).toHaveLength(1);
    expect(state.towers['side']!.owner).toBe('neutral');
    for (let i = 0; i < 100; i++) {
      tut.onSelect(null, state);
      tut.elapse(1000, state); // 100 s gated: hidden steps never time out
    }
    expect(shown(tut, state)).toBeNull();
    // a cut now is not the lesson (that was the 7 s cut that lost 3/5 seeds): it does not count
    tut.onCommand(unlink('home', 'side'), state);
    capture(state, 'side');
    tut.onSelect(null, state);
    expect(shown(tut, state)).toBe(TXT.goAround);
  });

  it('step 2 completes on side → foe (or when foe falls), then the stop step shows on the home → side ribbon', () => {
    const { state, tut } = atGoAround();
    tut.onCommand(link('home', 'foe'), state); // not from side
    expect(shown(tut, state)).toBe(TXT.goAround);
    issue(tut, state, link('side', 'foe'));
    const stop = tut.current(state)!;
    expect(stop.text).toBe(TXT.stopStream);
    expect(stepTowerId(stop, state)).toBe('side');
    expect(stop.anchor).toEqual({ kind: 'stream', from: 'home', to: 'side' });
    const home = state.towers['home']!;
    const side = state.towers['side']!;
    expect(streamMidpoint(state, stop.anchor)).toEqual({ x: (home.x + side.x) / 2, y: (home.y + side.y) / 2 });

    const other = atGoAround();
    other.state.towers['foe']!.owner = 'player';
    other.tut.onSelect(null, other.state);
    expect(shown(other.tut, other.state)).toBe(TXT.stopStream);
  });

  it('the stop step clears on a swipe cut of home → side, and step 4 then stays hidden without a supply line', () => {
    const { state, tut } = atStop();
    tut.onCommand(unlink('side', 'foe'), state); // a stream out of side, not into it
    tut.onCommand({ type: 'unlink', owner: 'enemy1', from: 'foe', to: 'side' }, state); // not the player's
    expect(shown(tut, state)).toBe(TXT.stopStream);
    issue(tut, state, unlink('home', 'side'));
    expect(shown(tut, state)).toBeNull();
    expect(supplyLineTarget(state)).toBeNull();
    for (let i = 0; i < 100; i++) tut.elapse(1000, state);
    expect(tut.finished).toBe(false); // step 4 hidden: never times out, never shows
  });

  it('the stop step also clears on "all links of home" (the second tap) and when the stream ends on its own', () => {
    const a = atStop();
    a.tut.onCommand(unlink('home'), a.state);
    expect(shown(a.tut, a.state)).toBeNull();

    const b = atStop();
    b.state.links = b.state.links.filter((l) => l.to !== 'side'); // targetFull ended home → side
    b.tut.onSelect(null, b.state);
    expect(shown(b.tut, b.state)).toBeNull(); // on step 4, hidden
    expect(b.tut.finished).toBe(false);
  });

  it('step 4 never shows on the side-first line (follower traces, seeds 1–5, 90 s)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const level = getLoadedLevel(2)!;
      const state = createState(level, seed);
      const rngs = rngsFor(seed, level.enemies);
      const tut = tutorialFor(2, 0)!;
      const seen = new Set<string>();
      let cut = false;
      while (state.time < 90_000 && !tut.finished) {
        const now = shown(tut, state);
        if (now) seen.add(now);
        if (isAiTick(state)) {
          const own = (id: string) => state.towers[id]!.owner === 'player';
          const has = (f: string, t: string) => state.links.some((l) => l.owner === 'player' && l.from === f && l.to === t);
          const cmds: Command[] = [];
          if (state.time >= 3000 && !own('side') && !has('home', 'side')) cmds.push(link('home', 'side'));
          if (own('side') && !own('foe') && !has('side', 'foe')) cmds.push(link('side', 'foe'));
          if (!cut && now === TXT.stopStream) {
            cut = true;
            cmds.push(unlink('home', 'side'));
          }
          const enemy = runAiTick(state, rngs.enemies);
          for (const c of cmds) issue(tut, state, c);
          for (const c of enemy) applyCommand(state, c);
        }
        step(state);
        tut.onSelect(null, state);
        tut.elapse(C.TICK_MS, state);
      }
      expect([...seen], `seed ${seed}`).toEqual([TXT.tapThenGrey, TXT.goAround, TXT.stopStream]);
      expect(cut, `seed ${seed}: the stop step came up`).toBe(true);
    }
  });
});

describe('level 2 step 4: the supply line (GD-5a, rule 13)', () => {
  /** The mid-first line at ≈ 33 s: mid ours and full, streaming onward into side; home free with units. */
  const midFull = () => {
    const state = stateFor(2);
    const mid = state.towers['mid']!;
    capture(state, 'mid');
    mid.units = capacityOf(mid, state);
    applyCommand(state, link('mid', 'side'));
    expect(state.links).toHaveLength(1);
    return state;
  };

  it('supplyLineTarget: the full own tower that relays onward, when another own tower can stream into it', () => {
    const state = midFull();
    expect(supplyLineTarget(state)).toBe('mid');
    state.towers['home']!.units = 0; // no unit to send
    expect(supplyLineTarget(state)).toBeNull();
    state.towers['home']!.units = 5;
    state.towers['mid']!.units -= 1; // not full
    expect(supplyLineTarget(state)).toBeNull();
    state.towers['mid']!.units += 1;
    state.links = []; // full but not streaming onward
    expect(supplyLineTarget(state)).toBeNull();
    // home itself never counts, however full and streaming
    const fresh = stateFor(2);
    fresh.towers['home']!.units = capacityOf(fresh.towers['home']!, fresh);
    capture(fresh, 'side');
    applyCommand(fresh, link('home', 'foe'));
    expect(supplyLineTarget(fresh)).toBeNull();
  });

  it('on the mid-first line it pre-empts the steps before it and points at mid; a relay link into mid clears it', () => {
    const state = midFull();
    const tut = tutorialFor(2, 0)!;
    for (let i = 0; i < 3; i++) tut.onSelect(null, state); // steps 1–3 give way to the supply line, one per frame
    const supply = tut.current(state)!;
    expect(supply.text).toBe(TXT.supplyLine);
    expect(stepTowerId(supply, state)).toBe('mid');
    tut.onCommand(link('home', 'side'), state); // not into mid
    expect(shown(tut, state)).toBe(TXT.supplyLine);
    applyCommand(state, link('home', 'mid'));
    expect(state.links.find((l) => l.from === 'home')?.relay).toBe(true);
    tut.onSelect(null, state); // doneWhen: a player relay link exists
    expect(tut.finished).toBe(true);
  });

  it('the link command into mid completes it as well', () => {
    const state = midFull();
    const tut = tutorialFor(2, 0)!;
    for (let i = 0; i < 3; i++) tut.onSelect(null, state);
    expect(shown(tut, state)).toBe(TXT.supplyLine);
    tut.onCommand(link('home', 'mid'), state);
    expect(tut.finished).toBe(true);
  });
});

describe('streamMidpoint (GD-5c stream anchor)', () => {
  const anchor = { kind: 'stream', from: 'home', to: 'side' } as const;
  it('is null without an anchor or without that player stream', () => {
    const state = stateFor(2);
    expect(streamMidpoint(state, undefined)).toBeNull();
    expect(streamMidpoint(state, anchor)).toBeNull();
    applyCommand(state, link('home', 'mid')); // another stream
    expect(streamMidpoint(state, anchor)).toBeNull();
    state.towers['side']!.owner = 'enemy1';
    state.towers['side']!.units = 5;
    applyCommand(state, { type: 'link', owner: 'enemy1', from: 'side', to: 'home' }); // the lane, but not the player's stream
    expect(streamMidpoint(state, { kind: 'stream', from: 'side', to: 'home' })).toBeNull();
  });

  it('is the lane midpoint while the stream runs', () => {
    const state = stateFor(2);
    applyCommand(state, link('home', 'side'));
    expect(streamMidpoint(state, anchor)).toEqual({ x: 495, y: 1110 }); // (360, 1120) ↔ (630, 1100)
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
    issue(tut, state, link('home', 'side')); // step 1 done; step 2 gated on the capture
    for (let i = 0; i < 100; i++) tut.elapse(1000, state); // 100 s gated
    expect(tut.finished).toBe(false);
    capture(state, 'side');
    expect(shown(tut, state)).toBe(TXT.goAround);
    tut.elapse(60_000, state); // a stalled frame / background return
    expect(shown(tut, state)).toBe(TXT.goAround);
    for (let i = 0; i < 78; i++) tut.elapse(250, state); // 79 × 250 = 19.75 s with the one above
    expect(shown(tut, state)).toBe(TXT.goAround);
    tut.elapse(250, state);
    expect(shown(tut, state)).toBe(TXT.stopStream); // timed out: the stop step (home → side still runs) is next
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

describe('level 3 tutorial (GD-5b: take both free neutrals; GD-7h: the west-first line)', () => {
  it('step 1 points at east and completes only on home → east', () => {
    const state = stateFor(3);
    const tut = tutorialFor(3, 0)!;
    expect(shown(tut, state)).toBe(TXT.tapThenGrey);
    expect(stepTowerId(tut.current(state)!, state)).toBe('east');
    tut.onCommand(link('home', 'foe'), state); // not a grey tower
    expect(shown(tut, state)).toBe(TXT.tapThenGrey);
    issue(tut, state, link('home', 'east'));
    expect(shown(tut, state), 'step 2 waits for the capture').toBeNull();
    tut.onSelect('home', state);
    expect(tut.finished).toBe(false);
  });

  it('GD-7h: home → west does not complete step 1 — it hides while that stream runs, and the west capture hands over to step 2 on east', () => {
    const state = stateFor(3);
    const tut = tutorialFor(3, 0)!;
    issue(tut, state, link('home', 'west'));
    tut.onSelect('home', state);
    expect(shown(tut, state), 'no bubble while home → west takes west (a tap on east is the L1 refusal)').toBeNull();
    // the player cuts it before the capture: step 1 is back, and home → east completes it
    issue(tut, state, unlink('home', 'west'));
    tut.onSelect('home', state);
    expect(shown(tut, state)).toBe(TXT.tapThenGrey);
    issue(tut, state, link('home', 'west'));
    capture(state, 'west');
    tut.onSelect('home', state);
    const grab = tut.current(state)!;
    expect(grab.text).toBe(TXT.grabOther);
    expect(stepTowerId(grab, state)).toBe('east');
    expect(grab.select?.(state), 'BUG-51: west, just taken, has the free slot').toBe('west');
  });

  it('step 2 targets whichever grey tower is left and completes on a link into it', () => {
    for (const [first, other] of [
      ['east', 'west'],
      ['west', 'east'],
    ] as const) {
      const state = stateFor(3);
      const tut = tutorialFor(3, 0)!;
      issue(tut, state, link('home', first));
      capture(state, first);
      tut.onSelect(null, state);
      const grab = tut.current(state)!;
      expect(grab.text).toBe(TXT.grabOther);
      expect(stepTowerId(grab, state), `${first} taken`).toBe(other);
      tut.onCommand(link('home', first), state); // into the one already taken
      tut.onCommand(link('home', 'foe'), state);
      expect(shown(tut, state)).toBe(TXT.grabOther);
      issue(tut, state, link(first, other)); // from any own tower
      expect(shown(tut, state), `${first} → ${other}`).not.toBe(TXT.grabOther);
    }
  });

  it('east first: steps 3–4 settle without showing — the tutorial ends two frames after the link into west', () => {
    const state = stateFor(3);
    const tut = tutorialFor(3, 0)!;
    issue(tut, state, link('home', 'east'));
    capture(state, 'east');
    tut.onSelect(null, state);
    issue(tut, state, link('east', 'west'));
    expect(shown(tut, state), 'no step 3: home → west never ran').toBeNull();
    tut.onSelect(null, state);
    expect(shown(tut, state), 'no step 4: home → east still runs').toBeNull();
    tut.onSelect(null, state);
    expect(tut.finished).toBe(true);
  });

  it('GD-7h, west first: step 3 stops home → west (ring on west, home selected), step 4 then asks home → east', () => {
    const state = stateFor(3);
    const tut = tutorialFor(3, 0)!;
    issue(tut, state, link('home', 'west'));
    capture(state, 'west');
    tut.onSelect(null, state);
    issue(tut, state, link('west', 'east'));
    const stop = tut.current(state)!;
    expect(stop.text).toBe(TXT.stopStream);
    expect(stepTowerId(stop, state), 'the ring on west, the tap target (no ribbon anchor: GD-5c finds no bubble spot there)').toBe('west');
    expect(stop.anchor).toBeUndefined();
    expect(stop.select?.(state), 'the tap on west (the target) cuts, as the swipe does').toBe('home');
    tut.onCommand(unlink('west', 'east'), state); // not home's stream
    tut.onCommand(link('home', 'east'), state); // not a stop
    expect(shown(tut, state)).toBe(TXT.stopStream);
    tut.onCommand(unlink('home', 'west'), state); // seen before the sim applies it
    tut.onSelect('home', state);
    expect(shown(tut, state), 'step 4 waits until the cut reaches the sim').toBeNull();
    expect(tut.finished).toBe(false);
    applyCommand(state, unlink('home', 'west'));
    tut.onSelect('home', state);
    const again = tut.current(state)!;
    expect(again.text).toBe(TXT.tapThenGrey);
    expect(stepTowerId(again, state)).toBe('east');
    expect(again.select?.(state)).toBe('home');
    tut.onCommand(link('west', 'east'), state);
    expect(shown(tut, state)).toBe(TXT.tapThenGrey);
    issue(tut, state, link('home', 'east'));
    expect(tut.finished).toBe(true);
  });

  it('GD-7h: step 3 also accepts "all links of home" and gives way when the stream or west is gone; step 4 when east is ours', () => {
    const setUp = () => {
      const state = stateFor(3);
      const tut = tutorialFor(3, 0)!;
      issue(tut, state, link('home', 'west'));
      capture(state, 'west');
      tut.onSelect(null, state);
      issue(tut, state, link('west', 'east'));
      expect(shown(tut, state)).toBe(TXT.stopStream);
      return { state, tut };
    };
    const a = setUp();
    issue(a.tut, a.state, unlink('home'));
    a.tut.onSelect(null, a.state);
    expect(shown(a.tut, a.state)).toBe(TXT.tapThenGrey);
    capture(a.state, 'east');
    a.tut.onSelect(null, a.state);
    expect(a.tut.finished, 'east is ours: step 4 is moot').toBe(true);

    const b = setUp();
    b.state.towers['west']!.owner = 'enemy1';
    b.tut.onSelect(null, b.state);
    expect(shown(b.tut, b.state), 'west lost: nothing to stop, and home still streams into it').toBeNull();
    expect(b.tut.finished).toBe(false);
  });

  it('step 2 also completes when no grey tower is left (the enemy took the other one)', () => {
    const state = stateFor(3);
    const tut = tutorialFor(3, 0)!;
    issue(tut, state, link('home', 'east'));
    capture(state, 'east');
    tut.onSelect(null, state);
    expect(shown(tut, state)).toBe(TXT.grabOther);
    state.towers['west']!.owner = 'enemy1';
    tut.onSelect(null, state);
    tut.onSelect(null, state);
    tut.onSelect(null, state);
    expect(tut.finished).toBe(true);
  });
});

describe('level 4 tutorial (GD-5b: stop the stream so home fills to 25)', () => {
  /** home → outpost streaming, outpost captured: step 1 on screen. */
  const atStop = () => {
    const state = stateFor(4);
    const tut = tutorialFor(4, 0)!;
    expect(shown(tut, state)).toBeNull(); // gated on the outpost capture
    issue(tut, state, link('home', 'outpost'));
    tut.onSelect(null, state);
    expect(shown(tut, state)).toBeNull(); // still neutral
    tut.onCommand(unlink('home', 'outpost'), state); // a cut before the capture is not the lesson
    capture(state, 'outpost');
    tut.onSelect(null, state);
    const stop = tut.current(state)!;
    expect(stop.text).toBe(TXT.stopToGrow);
    expect(stepTowerId(stop, state)).toBe('home');
    return { state, tut };
  };

  it('stopToGrow completes on an unlink from home (a swipe cut or the second tap), not on other unlinks', () => {
    const { state, tut } = atStop();
    tut.onCommand(unlink('outpost'), state);
    tut.onCommand({ type: 'unlink', owner: 'enemy1', from: 'home' }, state);
    expect(shown(tut, state)).toBe(TXT.stopToGrow);
    issue(tut, state, unlink('home', 'outpost'));
    expect(shown(tut, state)).toBe(TXT.fillToUpgrade);
    expect(TXT.fillToUpgrade).toContain('25');

    const b = atStop();
    issue(b.tut, b.state, unlink('home')); // "all links of home"
    expect(shown(b.tut, b.state)).toBe(TXT.fillToUpgrade);
  });

  it('stopToGrow also gives way when home levels up anyway or its stream ends on its own', () => {
    const a = atStop();
    a.state.towers['home']!.level = 2;
    a.tut.onSelect(null, a.state);
    expect(a.tut.finished).toBe(false);
    a.tut.onSelect(null, a.state); // next frame: fillToUpgrade's doneWhen holds too
    expect(a.tut.finished).toBe(true);

    const b = atStop();
    b.state.links = []; // targetFull ended home → outpost
    b.tut.onSelect(null, b.state);
    expect(shown(b.tut, b.state)).toBe(TXT.fillToUpgrade);
  });

  it('fillToUpgrade is hidden while home streams and completes when a player tower reaches level 2 by filling up', () => {
    const { state, tut } = atStop();
    issue(tut, state, unlink('home', 'outpost'));
    expect(shown(tut, state)).toBe(TXT.fillToUpgrade);
    issue(tut, state, link('home', 'mid'));
    expect(shown(tut, state)).toBeNull(); // streaming again: hidden (and not timing out)
    issue(tut, state, unlink('home', 'mid'));
    expect(shown(tut, state)).toBe(TXT.fillToUpgrade);
    const home = state.towers['home']!;
    home.units = C.CAPACITY[1] - 1;
    for (let i = 0; i < 40 && home.level < 2; i++) step(state); // production tops it up → auto-upgrade
    expect(home.level).toBe(2);
    tut.onSelect(null, state);
    expect(tut.finished).toBe(true);
  });
});
