import type { Command, GameState } from '../sim/types';
import { C } from '../sim/constants';
import { capacityOf, linksFrom, maxLinksOf, relaysOnward } from '../sim/step';
import { roadIdFor } from '../sim/geometry';
import type { TutorialStep } from './tutorial';
import { isLink, step } from './tutorial';
import { enTutorial } from './locales/enTutorial';

/*
 * PERF-10: the tutorial steps of levels 2–4 (GD-5a/b) and their English hints (./locales/enTutorial.ts)
 * — a lazy chunk. Only a first play of level 2, 3 or 4 reads them, so the level start loads this chunk
 * beside the level chunk (./tutorialChunk.ts, src/main.ts `startLevel`) and the eager bundle carries
 * level 1's two steps only (./tutorial.ts). Nothing eager imports this module statically
 * (tests/ui/tutorialChunk.test.ts).
 */

/** English hints of these steps (`loadTutorialSteps()` adds them to `t()`'s fallback table). */
export { enTutorial };

const hasLink = (state: GameState, from: string, to: string): boolean =>
  state.links.some((l) => l.owner === 'player' && l.from === from && l.to === to);
/** Some player stream runs into `to`. */
const hasLinkInto = (state: GameState, to: string): boolean => state.links.some((l) => l.owner === 'player' && l.to === to);
/**
 * A player `unlink` that stops a stream into `to`: a named one (`to` given — a swipe cut or the second
 * tap), or "all links of `from`" when one of them runs into `to`. Checked before the sim applies it.
 */
const stopsStreamInto = (cmd: Command, state: GameState, to: string): boolean =>
  cmd.type === 'unlink' && cmd.owner === 'player' && (cmd.to === undefined ? hasLink(state, cmd.from, to) : cmd.to === to);
const ownerIs = (state: GameState, id: string, owner: string): boolean => state.towers[id]?.owner === owner;
/** Some player stream leaves `from`. */
const hasLinkFrom = (state: GameState, from: string): boolean => state.links.some((l) => l.owner === 'player' && l.from === from);
/** A player `link` command into `to` (from any tower). */
const isLinkInto = (cmd: Command, to: string): boolean => cmd.type === 'link' && cmd.owner === 'player' && cmd.to === to;
const anyPlayerL2 = (state: GameState): boolean => Object.values(state.towers).some((tw) => tw.owner === 'player' && tw.level >= 2);

/**
 * GD-5a step 4: the first own tower in id order (not `home`) that is full, streams onward and relays
 * (the sim's `relaysOnward`), when some other own tower with a lane to it, a free link slot and ≥ 1
 * unit could start a supply line into it; null otherwise.
 */
export function supplyLineTarget(state: GameState): string | null {
  for (const id of Object.keys(state.towers).sort()) {
    const tw = state.towers[id]!;
    if (id === 'home' || tw.owner !== 'player' || tw.units < capacityOf(tw, state) || !hasLinkFrom(state, id) || !relaysOnward(state, tw)) continue;
    for (const sid in state.towers) {
      const src = state.towers[sid]!;
      if (sid === id || src.owner !== 'player' || src.units < 1 || !state.roads[roadIdFor(sid, id)]) continue;
      const out = linksFrom(state, sid);
      if (out.length < maxLinksOf(src) && !out.some((l) => l.to === id)) return id;
    }
    return null;
  }
  return null;
}

/** GD-5b level 3: the grey tower still to take (`west` until only `east` is left neutral). */
const otherGrey = (state: GameState): string => (ownerIs(state, 'west', 'neutral') ? 'west' : 'east');
/** GD-7h level 3, west first: west is ours and home's one L1 stream still feeds it. */
const homeFeedsWest = (state: GameState): boolean => hasLink(state, 'home', 'west') && ownerIs(state, 'west', 'player');

/*
 * GDD §3 "first-time line" 11 (GD-5): a step never asks for an action the level's naive line or
 * reference player would not take at that moment, and the first target is the uncontested one.
 *   level 2  go around by the side tower (home → side, then side → foe), then — only once `side` is
 *            ours — swipe across home → side so home grows again (BUG-33; the second tap on the target
 *            still counts; the arrow points at the ribbon); then, only if an own full tower relays
 *            onward (the mid-first line, ≈ 33–35 s), stream into it: a supply line (rule 13). That last
 *            step is hidden otherwise and hidden steps never time out, so on the side-first line it
 *            simply never shows; when it comes up first it also clears the steps before it.
 *   level 3  take both free neutrals (`east`, then whichever grey tower is left). West first (GD-7h, see
 *            the table): three one-tap steps after the west capture — west → east, stop home → west,
 *            home → east — which the east-first line never sees.
 *   level 4  stop home's stream once the outpost is ours so home can grow, then the auto-upgrade at
 *            25 (L2 runs two streams).
 */
export const LATE_STEPS: Readonly<Record<number, () => TutorialStep[]>> = {
  2: () => [
    step('tutorial.tapThenGrey', {
      towerId: 'side',
      onCommand: (cmd) => isLink(cmd, 'home', 'side'),
      // the mid-first line at ×2 reaches a supply line (sim ≈ 33 s) before this step's 20 s timeout
      doneWhen: (s) => supplyLineTarget(s) !== null,
    }),
    step('tutorial.goAround', {
      towerId: 'foe',
      // BUG-50: home is still selected from step 1, so the obeyed "tap the new tower" would be a tap on the
      // target of home → side and cut it. Cleared instead of pre-selecting side: the first tap selects side
      // (a tap on an already selected tower deselects it), the second links side → foe — as the text says
      select: () => null,
      showWhen: (s) => ownerIs(s, 'side', 'player'),
      onCommand: (cmd) => isLink(cmd, 'side', 'foe'),
      // a supply-line situation (step 4) pre-empts the steps before it: the mid-first line reaches it without `side`
      doneWhen: (s) => hasLink(s, 'side', 'foe') || ownerIs(s, 'foe', 'player') || supplyLineTarget(s) !== null,
    }),
    step('tutorial.stopStream', {
      towerId: 'side',
      anchor: { kind: 'stream', from: 'home', to: 'side' },
      // the ring is on the ribbon and the lesson is the swipe: no selection, so a stray tap on side cannot cut
      select: () => null,
      showWhen: (s) => ownerIs(s, 'side', 'player') && hasLink(s, 'home', 'side'),
      // any player stream into side counts, cut by a swipe or by a tap
      onCommand: (cmd, s) => stopsStreamInto(cmd, s, 'side'),
      // the stream may end on its own (target full): nothing left to teach then
      doneWhen: (s) => (ownerIs(s, 'side', 'player') && !hasLinkInto(s, 'side')) || supplyLineTarget(s) !== null,
    }),
    step('tutorial.supplyLine', {
      towerId: (s) => supplyLineTarget(s) ?? 'mid',
      // GD-5f: the relay link this step asks for does not also raise `hint.supplyLine`
      supplyLine: true,
      showWhen: (s) => supplyLineTarget(s) !== null,
      onCommand: (cmd, s) => {
        const to = supplyLineTarget(s);
        return to !== null && isLinkInto(cmd, to);
      },
      doneWhen: (s) => s.links.some((l) => l.owner === 'player' && l.relay),
    }),
  ],
  /*
   * GD-7h (frontend fallback; no layout fixes it): a first tap home → west loses 20/20 on the naive line —
   * the 0.3 rusher keeps `east` (falls 11.45 s, 152 px from home) and home's one L1 stream stays locked
   * into west. The west-first player is steered instead:
   *   - step 1 completes only on home → east; while home → west runs it is hidden (no tap helps before
   *     west falls: a tap on east is the L1 refusal, and cutting home → west before the capture, then
   *     home → east, loses — seeds 1–20: cut at 4 s 0/20, at 5 s 11/20), and the west capture (≈ 7.3 s)
   *     hands over to step 2 at once;
   *   - step 2 (unchanged, BUG-51 selects west): one tap on east makes west → east;
   *   - steps 3–4, west line only: stop home → west (home selected, ring on west: the tap on west, the
   *     stream's target, cuts it, as does the swipe) and then home → east (home still selected: one
   *     tap on east). West → east alone leaves home's only stream locked into west for good.
   * Trace (tests/ui/tutorialWestFirst.test.ts: west tap at 3 s, the bubbles obeyed from T on, one tap per
   * bubble 250 ms after it comes up, then the naive line), seeds 1–20: T = 7.5–10.1 s 20/20, T = 10.2 s
   * 7/20 (the cut must land by ≈ 10.45 s; 500 ms a tap: 20/20 to T = 9.8 s); west → east alone (the table
   * before GD-7h): T = 8 s 20/20, 9 s 5/20, 10 s 0/20. Steps 3–4 settle at once on the east-first line
   * (home → west never ran there; that line stays 20/20).
   */
  3: () => [
    step('tutorial.tapThenGrey', {
      towerId: 'east',
      showWhen: (s) => !hasLink(s, 'home', 'west'),
      onCommand: (cmd) => isLink(cmd, 'home', 'east'),
      // west first: the capture of west hands over to step 2 (pointing at east)
      doneWhen: (s) => ownerIs(s, 'west', 'player'),
    }),
    step('tutorial.grabOther', {
      towerId: otherGrey,
      // BUG-51: home's one L1 stream is busy (a tap on the other grey was the link-limit refusal): the grey
      // just taken has the free slot, so one tap on the ringed tower makes the link
      select: (s) => (ownerIs(s, 'east', 'player') ? 'east' : 'west'),
      showWhen: (s) => (ownerIs(s, 'west', 'player') && ownerIs(s, 'east', 'neutral')) || (ownerIs(s, 'east', 'player') && ownerIs(s, 'west', 'neutral')),
      onCommand: (cmd, s) => isLinkInto(cmd, otherGrey(s)),
      doneWhen: (s) => !ownerIs(s, 'west', 'neutral') && !ownerIs(s, 'east', 'neutral'),
    }),
    // GD-7h, west line: free home's one stream. The ring is on west, the tap target: a ribbon anchor on
    // home → west (GD-5c) finds no clear bubble spot above home on the 430×932 / 360×640 screens
    step('tutorial.stopStream', {
      towerId: 'west',
      // home selected, so the tap on west (the second tap on the target) cuts it as well as the swipe
      select: () => 'home',
      showWhen: homeFeedsWest,
      onCommand: (cmd) => cmd.type === 'unlink' && cmd.owner === 'player' && cmd.from === 'home' && (cmd.to === undefined || cmd.to === 'west'),
      // nothing to stop: the east-first line (settles the frame after step 2), or the stream / west is gone
      doneWhen: (s) => !homeFeedsWest(s),
    }),
    // GD-7h, west line: home, free again, streams into east too
    step('tutorial.tapThenGrey', {
      towerId: 'east',
      select: () => 'home',
      // hidden until the cut lands (the command reaches the sim a tick after the step saw it)
      showWhen: (s) => !hasLinkFrom(s, 'home') && !ownerIs(s, 'east', 'player'),
      onCommand: (cmd) => isLink(cmd, 'home', 'east'),
      // east is ours, or home streams elsewhere (the east-first line: home → east still runs)
      doneWhen: (s) => ownerIs(s, 'east', 'player') || (hasLinkFrom(s, 'home') && !hasLink(s, 'home', 'west')),
    }),
  ],
  4: () => [
    step('tutorial.stopToGrow', {
      towerId: 'home',
      // home selected, so the second tap on its target and the swipe both stop the stream, as the text says
      select: () => 'home',
      showWhen: (s) => ownerIs(s, 'outpost', 'player') && hasLinkFrom(s, 'home'),
      // a swipe cut or the second tap on the target: any player unlink of home's streams
      onCommand: (cmd) => cmd.type === 'unlink' && cmd.owner === 'player' && cmd.from === 'home',
      // home grew anyway, or its stream ended (target full) after the capture: nothing left to stop
      doneWhen: (s) => (s.towers['home']?.level ?? 1) >= 2 || (ownerIs(s, 'outpost', 'player') && !hasLinkFrom(s, 'home')),
    }),
    step('tutorial.fillToUpgrade', { towerId: 'home', showWhen: (s) => !hasLinkFrom(s, 'home'), doneWhen: anyPlayerL2 }, { n: C.CAPACITY[1] }),
  ],
};
