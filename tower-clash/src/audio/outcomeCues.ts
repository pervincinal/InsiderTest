/**
 * FEEL-1-3 outcome stings: the first sound that says "won" / "lost", on the sim's outcome tick (the
 * `won` / `lost` call without a `step`, sfxRules.ts). Before them the winning capture sounded like any
 * capture and the first win-specific sound was the first star chord at ≈ +1 177 ms.
 *   won   a rising dyad over the capture chime (E5 → C6): two sines a fifth apart glide up a fifth,
 *         F6 + C7 → C7 + G7, in 90 ms and ring to 250 ms — an open fifth an octave over the chime's
 *         C6, gliding and on sines, on none of the star chords' notes (static triangle dyads, C5–G6).
 *   lost  the falling mirror: two triangles a fifth apart sigh down a minor second, F5 + C6 → E5 + B5
 *         (into the A minor of the music and the defeat chord), 250 ms, entering at +150 ms — after the
 *         AUD-F15 loss thud (60–180 Hz, its triangle ends at 150 ms) so the impact is heard first and
 *         the sting is not smeared into it; it ends at 400 ms, long before the defeat chord (≈ 770 ms).
 * Lazy: imported by src/audio/recipes.ts only (the SFX chunk); plays into the bus `playRecipe` routed
 * (`Synth.route`, the SFX bus under the limiter), so the Effects setting gates it. Never varied (AUD-F7
 * `UNVARIED`). Nothing here touches the DOM.
 */
import type { Synth } from './synth';

/** One sting voice: wave, start Hz, end Hz (reached after `glideS`), peak gain. */
export type StingVoice = readonly [OscillatorType, number, number, number];

export interface Sting {
  /** Seconds after the outcome tick. */
  delayS: number;
  /** Total length (attack, hold, release) in seconds. */
  durS: number;
  /** The pitch glide's length. */
  glideS: number;
  /** The level holds until here, then falls exponentially to the end. */
  holdS: number;
  voices: readonly StingVoice[];
}

export const OUTCOME_STING: Readonly<Record<'won' | 'lost', Sting>> = Object.freeze({
  won: {
    delayS: 0,
    durS: 0.25,
    glideS: 0.09,
    holdS: 0.12,
    voices: [
      ['sine', 1396.9, 2093, 0.14],
      ['sine', 2093, 3136, 0.14],
    ],
  },
  lost: {
    delayS: 0.15,
    durS: 0.25,
    glideS: 0.12,
    holdS: 0.12,
    voices: [
      ['triangle', 698.5, 659.3, 0.14],
      ['triangle', 1046.5, 987.8, 0.14],
    ],
  },
});

const ATTACK_S = 0.004;
const FLOOR = 0.0001;

/** Schedule the sting of `outcome` on `s` (the caller, recipes.ts `playRecipe`, has routed the bus). */
export function playSting(s: Synth, outcome: 'won' | 'lost'): void {
  const live = s.live();
  if (!live) return;
  const { ctx, master } = live;
  const st = OUTCOME_STING[outcome];
  const t0 = ctx.currentTime + st.delayS;
  const t1 = t0 + st.durS;
  for (const [type, from, to, gain] of st.voices) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + ATTACK_S);
    g.gain.setValueAtTime(gain, t0 + st.holdS);
    g.gain.exponentialRampToValueAtTime(FLOOR, t1);
    g.connect(master);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t0);
    o.frequency.exponentialRampToValueAtTime(to, t0 + st.glideS);
    o.connect(g);
    o.start(t0);
    o.stop(t1);
  }
}
