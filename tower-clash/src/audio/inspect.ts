/**
 * AUD-F6 read-only views of the mixer and the music loop for the debug surface (src/debug.ts,
 * `window.__towerclash.audio`) and the tests. Type-only imports, so the debug chunk that every page
 * loads at idle never pulls the mixer or music chunks in; both answer "nothing yet" until those are built.
 */
import type { Mix } from './mixer';
import type { Synth } from './synth';

export interface BusLevels {
  master: number;
  sfx: number;
  ui: number;
  music: number;
  duck: number;
  limiter: { thresholdDb: number; ratio: number } | null;
  /** AUD-M1: SFX / UI voices scheduled or ringing now, the most at once since the mixer was built, and the plays the voice cap skipped. */
  voices: number;
  peakVoices: number;
  capped: number;
}

const mixOf = (s: Synth): Mix | null => s.mix as Mix | null;

/** The live gains and the limiter, or null until the first sound or music start built the mixer. */
export function busLevels(s: Synth): BusLevels | null {
  const m = mixOf(s);
  const g = s.graph();
  if (!m || !g) return null;
  return {
    master: g.master.gain.value,
    sfx: m.sfx.gain.value,
    ui: m.ui.gain.value,
    music: m.music.gain.value,
    duck: m.duck.gain.value,
    limiter: m.limiter ? { thresholdDb: m.limiter.threshold.value, ratio: m.limiter.ratio.value } : null,
    voices: m.ends.filter((e) => e > g.ctx.currentTime).length,
    peakVoices: m.peak,
    capped: m.capped,
  };
}

/** Whether the music loop runs, its next step, whether the pulse and (FEEL-1-4) tension layers are on, and the smoothed intensity. */
export function musicState(s: Synth): { playing: boolean; step: number; pulse: boolean; tension: boolean; intensity: number } {
  const l = mixOf(s)?.loop ?? null;
  return { playing: l !== null, step: l?.step ?? 0, pulse: l?.pulse ?? false, tension: l?.tension ?? false, intensity: l?.intensity ?? 0 };
}
