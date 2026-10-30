import { describe, expect, it } from 'vitest';
import type { Command, GameState, Outcome } from '../../src/sim/types';
import { C, applyCommand, createState, getOutcome, step } from '../../src/sim/index';
import { rngsFor, runAiTick } from '../../src/ai/index';
import { isAiTick } from '../../src/ai/common';
import { HEADLESS_MAX_MS } from '../../src/ai/headless';
import { decideLink } from '../../src/input/pointer';
import { getLoadedLevel, loadAllLevels } from '../../src/levels/index';
import type { TutorialStep } from '../../src/ui/tutorial';
import { stepTowerId, tutorialFor } from '../../src/ui/tutorial';
import { t } from '../../src/ui/i18n';
import { makeNaivePlayer } from '../../scripts/lib/naivePlayer';

/*
 * GD-7h (frontend fallback): level 3 "Free Real Estate", the player who taps home → west first. Headless
 * trace of the tutorial state machine + the sim + the level's rusher: the first tap at 3 s (the naive
 * line's first-tap time), then every bubble obeyed from `T` on — one tap on the ringed tower from the
 * selection the step sets (the play screen's `select`, decided by the real gesture rule `decideLink`),
 * `gapMs` apart — and once the tutorial is over, the naive line (scripts/lib/naivePlayer.ts, the
 * backlog's "then naive"). Acceptance (backlog GD-7h): the west-first follower wins ≥ 4/5 at T = 10 s.
 */

await loadAllLevels();

interface TraceOptions {
  /** The first tap at 3 s: home → `first`. */
  first: 'west' | 'east';
  /** No bubble is answered before this sim time, ms. */
  T: number;
  /** A tap per bubble, at least this long after the previous tap and after the bubble came up, ms. */
  gapMs?: number;
  /** Answer only this many bubbles, then play the naive line (1 = west → east alone, the table before GD-7h; 0 = west, then naive). */
  maxAnswers?: number;
}

interface Trace {
  outcome: Outcome;
  timeMs: number;
  /** Hint texts in the order they came up. */
  bubbles: string[];
  /** The tutorial answers, `link:a->b@ms` / `unlink:a->b@ms`. */
  answers: string[];
}

const FIRST_TAP_MS = 3000;

function trace(seed: number, opts: TraceOptions): Trace {
  const gap = opts.gapMs ?? 250;
  const level = getLoadedLevel(3)!;
  const state = createState(level, seed);
  const rngs = rngsFor(seed, level.enemies);
  const tut = tutorialFor(3, 0)!;
  const naive = makeNaivePlayer();
  const bubbles: string[] = [];
  const answers: string[] = [];
  let selected: string | null = null;
  let shown: TutorialStep | null = null;
  let shownAt = 0;
  let answered: TutorialStep | null = null;
  let lastTap = -Infinity;
  const issue = (cmd: Command, s: GameState): void => {
    tut.onCommand(cmd, s);
    applyCommand(s, cmd);
  };
  while (getOutcome(state) === 'playing' && state.time < HEADLESS_MAX_MS) {
    const cur = tut.current(state);
    if (cur !== shown) {
      shown = cur;
      shownAt = state.time;
      if (cur) {
        bubbles.push(cur.text);
        // the play screen applies a step's selection the first frame it is on screen
        if (cur.select) {
          const id = cur.select(state);
          selected = id !== null && state.towers[id]?.owner === 'player' ? id : null;
        }
      }
    }
    const mine: Command[] = [];
    if (state.time === FIRST_TAP_MS) {
      selected = 'home'; // tap home, tap the grey tower: home stays selected
      mine.push({ type: 'link', owner: 'player', from: 'home', to: opts.first });
    }
    const tutorialOver = tut.finished || answers.length >= (opts.maxAnswers ?? Infinity);
    if (!tutorialOver && cur && cur !== answered && state.time > FIRST_TAP_MS && state.time >= Math.max(opts.T, shownAt + gap, lastTap + gap)) {
      answered = cur;
      lastTap = state.time;
      const to = stepTowerId(cur, state);
      const d = selected ? decideLink(state, selected, to) : { kind: 'none' as const };
      if (d.kind === 'link' || d.kind === 'unlink') {
        mine.push({ type: d.kind, owner: 'player', from: selected!, to });
        answers.push(`${d.kind}:${selected}->${to}@${state.time}`);
      } else answers.push(`${d.kind}:${selected}->${to}@${state.time}`);
    }
    const ai = isAiTick(state);
    const naiveCmds = ai ? naive(state, rngs.player) : []; // every AI tick: the bot keeps its memory
    if (tutorialOver) mine.push(...naiveCmds);
    const enemy = ai ? runAiTick(state, rngs.enemies) : [];
    for (const cmd of mine) issue(cmd, state);
    for (const cmd of enemy) applyCommand(state, cmd);
    step(state, C.TICK_MS);
    tut.onSelect(selected, state);
    tut.elapse(C.TICK_MS, state);
  }
  return { outcome: getOutcome(state), timeMs: state.time, bubbles, answers };
}

const SEEDS = [1, 2, 3, 4, 5];
const wins = (opts: TraceOptions): number => SEEDS.filter((seed) => trace(seed, opts).outcome === 'won').length;

describe('GD-7h: level 3, west first — the tutorial steers home → west into a win', () => {
  it('after the west capture: west → east, stop home → west, home → east — one tap each, no refusal', () => {
    const run = trace(1, { first: 'west', T: 10_000 });
    expect(run.bubbles).toEqual([t('tutorial.tapThenGrey'), t('tutorial.grabOther'), t('tutorial.stopStream'), t('tutorial.tapThenGrey')]);
    // each bubble comes up the tick after the previous tap reached the sim, and is tapped 250 ms later
    expect(run.answers).toEqual(['link:west->east@10000', 'unlink:home->west@10300', 'link:home->east@10600']);
    expect(run.outcome).toBe('won');
  });

  /*
   * Since AUD-B9 (2026-10-30, level 3 re-laid: home 12 → 18 u, foe 12 → 7 u and 20 px up) the layout,
   * not the tutorial, cures the west-first start, so the pre-GD-7h contrast "west → east alone ≤ 1/5"
   * is false by design and is no longer asserted. Table on the AUD-B9 tree (QA 2026-10-30, this trace,
   * seeds 1–5 times in s, then 20 seeds won / median / worst):
   *   tutorial T = 10 s           5/5  60.6 52.4 52.4 53.0 51.6   20/20  51.6  60.6
   *   tutorial T = 8 s            5/5  52.6 62.6 54.6 61.3 61.3   20/20  59.3  62.6
   *   tutorial T = 9 s            5/5  52.6 56.6 43.5 50.6 56.6   20/20  51.9  56.6
   *   tutorial T = 10 s, 100 ms   5/5  50.5 53.6 51.6 51.6 51.6   20/20  51.6  56.6
   *   west → east alone (1 tap)   5/5  58.8 57.3 56.6 56.6 56.6   20/20  56.6  58.8   (before GD-7h / AUD-B9: ≤ 1/5)
   *   west, then naive (0 taps)   5/5  57.3 56.6 56.6 63.7 56.6   20/20  57.6  63.7   (the west start of the naive `tie desc` row; the bot's own home → east at 3 s finds no free link)
   *   east first                  5/5  59.4 58.6 49.6 58.6 58.6   20/20  58.6  59.4
   * What stays asserted: the steer still wins ≥ 4/5, the paths without it now win ≥ 4/5 too (the
   * AUD-B9 cure, which is what let `NAIVE_TIE_EXEMPT` go empty), and at the acceptance T = 10 s the
   * steer does not cost time over west → east alone on the 5-seed median (52.4 vs 56.6 s; seed 1 alone
   * is 1.8 s faster, and at T = 8 s the steered median is 61.3 s, so the median at T = 10 s is the claim).
   */
  it('answered at T = 10 s it wins ≥ 4/5, and since AUD-B9 west → east alone and west → naive win ≥ 4/5 as well', () => {
    expect(wins({ first: 'west', T: 10_000 })).toBeGreaterThanOrEqual(4);
    expect(wins({ first: 'west', T: 10_000, maxAnswers: 1 })).toBeGreaterThanOrEqual(4);
    expect(wins({ first: 'west', T: 10_000, maxAnswers: 0 })).toBeGreaterThanOrEqual(4);
  });

  it('since AUD-B9, at T = 10 s the steered line is not slower than west → east alone (5-seed median of the wins)', () => {
    const median = (opts: TraceOptions): number => {
      const ms = SEEDS.map((seed) => trace(seed, opts))
        .filter((r) => r.outcome === 'won')
        .map((r) => r.timeMs)
        .sort((a, b) => a - b);
      expect(ms.length, 'a median needs at least 4 wins of 5').toBeGreaterThanOrEqual(4);
      return ms[Math.floor((ms.length - 1) / 2)]!;
    };
    expect(median({ first: 'west', T: 10_000 })).toBeLessThanOrEqual(median({ first: 'west', T: 10_000, maxAnswers: 1 }));
  });

  it('answered earlier (T = 8 s, 9 s) or a tap every 100 ms it wins ≥ 4/5 too', () => {
    expect(wins({ first: 'west', T: 8_000 })).toBeGreaterThanOrEqual(4);
    expect(wins({ first: 'west', T: 9_000 })).toBeGreaterThanOrEqual(4);
    expect(wins({ first: 'west', T: 10_000, gapMs: 100 })).toBeGreaterThanOrEqual(4);
  });

  it('the east-first line is unchanged: two bubbles, steps 3–4 never show, the tutorial ends', () => {
    for (const seed of SEEDS) {
      const run = trace(seed, { first: 'east', T: 0, gapMs: 1000 });
      expect(run.bubbles, `seed ${seed}`).toEqual([t('tutorial.tapThenGrey'), t('tutorial.grabOther')]);
      expect(run.answers, `seed ${seed}`).toHaveLength(1);
      expect(run.answers[0], `seed ${seed}`).toMatch(/^link:east->west@/);
      expect(run.outcome, `seed ${seed}`).toBe('won');
    }
  });
});
