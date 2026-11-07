import type { FakeParam } from './fakeAudio';

/*
 * FEEL-1-3 / FEEL-1-4: an offline render of the scheduled envelopes. `paramAt` evaluates a FakeParam's recorded
 * automation at `t` with WebAudio's rules (a ramp is defined by its end event and runs from the previous event;
 * `set` holds); `peakOf` sums the envelopes of every voice — each a unit-amplitude oscillator or noise into its
 * gain — times the gains behind it, so the result is an upper bound of the summed signal's peak (filters ignored).
 */

export function paramAt(p: FakeParam, t: number, initial = p.value): number {
  const ev = [...p.events].sort((a, b) => a.time - b.time);
  let v = initial;
  let at = 0;
  for (const e of ev) {
    if (e.time <= t) {
      v = e.value;
      at = e.time;
      continue;
    }
    if (e.kind === 'set') return v;
    const k = (t - at) / (e.time - at);
    if (e.kind === 'linear') return v + (e.value - v) * k;
    return v * Math.pow(e.value / v, k);
  }
  return v;
}

export interface Path {
  /** The voice's own envelope gain. */
  env: FakeParam;
  /** Further gains on its way to the master (layer levels, trims), evaluated at the same time. */
  after?: { param: FakeParam; initial?: number }[];
  start: number;
  stop: number;
}

/** The summed envelope at `t`. */
export function sumAt(paths: readonly Path[], t: number): number {
  let sum = 0;
  for (const p of paths) {
    if (t < p.start || t >= p.stop) continue;
    let g = paramAt(p.env, t, 0);
    for (const a of p.after ?? []) g *= paramAt(a.param, t, a.initial);
    sum += Math.abs(g);
  }
  return sum;
}

/** The peak of the summed envelope over [from, to), sampled every `stepS`, and where it is. */
export function peakOf(paths: readonly Path[], from: number, to: number, stepS = 0.0005): { peak: number; at: number } {
  let peak = 0;
  let at = from;
  for (let t = from; t < to; t += stepS) {
    const v = sumAt(paths, t);
    if (v > peak) {
      peak = v;
      at = t;
    }
  }
  return { peak, at };
}
