/**
 * AUD-F9: the result card's sounds on the card's own timeline (src/render/resultTimeline.ts), so the ear
 * gets what the eye gets — they used to start on the `won` tick, 600 ms of result beat before the card:
 *   win   one chord per earned star as it lands (≈ 561 / 821 / 1 081 ms; 1★ = one chord), then a soft
 *         `tally` tick per step of the gold count-up (900–1 700 ms), at most one per TALLY_GAP_MS;
 *   loss  a single low chord as the card lands (≈ 170 ms).
 * The outcome tick keeps the capture's chime (sfxRules.ts). The result screen (src/ui/result.ts, a lazy
 * chunk) drives `ResultCuePlayer.tick` from its draw with the card's clock — or `Infinity` when the card
 * appears settled (reduced motion): every chord at once, no gold ticks. Leaving the screen stops them.
 * Pure: no DOM, no WebAudio (it calls the `play` it is given).
 */
import type { SfxName, SfxOptions } from './sfx';
import { CARD_LAND_MS, goldStepMs, starLandMs } from '../render/resultTimeline';

export interface ResultCue {
  /** Milliseconds on the card's clock. */
  atMs: number;
  name: SfxName;
  opts: SfxOptions;
}

/** Gold ticks at least this far apart: ≤ 8 a second (sfxRules.ts `RATE_LIMIT_S.tally` guards it again). */
export const TALLY_GAP_MS = 125;
/** A gold tick due more than this long ago (a stalled frame, a card first seen settled) is dropped, never bunched. */
export const TALLY_LATE_MS = 100;

/** The cues of one result, in time order. */
export function resultCues(r: { won: boolean; stars: number; coins: number }): ResultCue[] {
  if (!r.won) return [{ atMs: CARD_LAND_MS, name: 'lost', opts: { step: 0 } }];
  const out: ResultCue[] = [];
  const stars = Math.max(0, Math.min(3, Math.round(r.stars)));
  for (let i = 0; i < stars; i++) out.push({ atMs: starLandMs(i), name: 'won', opts: { step: i, count: stars } });
  const coins = Math.max(0, Math.floor(r.coins));
  let last = -Infinity;
  let k = 0;
  for (let n = 1; n <= coins; n++) {
    const at = goldStepMs(n, coins);
    if (at - last < TALLY_GAP_MS) continue;
    out.push({ atMs: at, name: 'tally', opts: { step: k++ } });
    last = at;
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** Plays a result's cues as the card's clock passes them, each once. */
export class ResultCuePlayer {
  private next = 0;

  constructor(readonly cues: readonly ResultCue[]) {}

  /** Play every cue due at `since` (card ms; `Infinity` = settled) through `play`; returns how many were played. */
  tick(since: number, play: (name: SfxName, opts: SfxOptions) => unknown): number {
    let n = 0;
    while (this.next < this.cues.length && this.cues[this.next]!.atMs <= since) {
      const c = this.cues[this.next++]!;
      // a chord always sounds (late or together); a gold tick only while it is the count's current step
      if (c.name === 'tally' && since - c.atMs > TALLY_LATE_MS) continue;
      play(c.name, c.opts);
      n++;
    }
    return n;
  }
}
