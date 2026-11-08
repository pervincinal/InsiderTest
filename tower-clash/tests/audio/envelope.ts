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

/* ---------- AUD-M1: a sample-level offline render of the fake graph, and the limiter's model ---------- */

/** paramAt's rules for monotonically increasing `t` (one per voice and param: O(1) amortised per sample). */
class Cursor {
  private readonly ev: FakeParam['events'];
  private i = 0;
  private v: number;
  private at = 0;
  constructor(p: FakeParam, initial = p.value) {
    this.ev = [...p.events].sort((a, b) => a.time - b.time);
    this.v = initial;
  }
  value(t: number): number {
    const ev = this.ev;
    while (this.i < ev.length && ev[this.i]!.time <= t) {
      this.v = ev[this.i]!.value;
      this.at = ev[this.i]!.time;
      this.i++;
    }
    const e = ev[this.i];
    if (!e || e.kind === 'set') return this.v;
    const k = (t - this.at) / (e.time - this.at);
    return e.kind === 'linear' ? this.v + (e.value - this.v) * k : this.v * Math.pow(e.value / this.v, k);
  }
}

/** The structural view of the fake nodes the renderer walks (tests/audio/fakeAudio.ts). */
interface RNode {
  connections: RNode[];
  gain?: FakeParam;
  type?: string;
  frequency?: FakeParam;
  Q?: FakeParam;
  buffer?: unknown;
  startAt?: number | null;
  stopAt?: number | null;
}

/** A param nothing was scheduled or written on holds its WebAudio default (the fake's reads 0). */
const defaulted = (p: FakeParam, d: number): FakeParam => {
  if (p.events.length || p.written) return p;
  const q = new (p.constructor as new () => FakeParam)();
  q.value = d;
  return q;
};

/** One second of the recipes' LCG noise (src/audio/recipes.ts `makeNoiseBuffer`) at `sr`. */
const noiseCache = new Map<number, Float64Array>();
function noiseAt(sr: number): Float64Array {
  let d = noiseCache.get(sr);
  if (d) return d;
  d = new Float64Array(sr);
  let s = 0x2545f491;
  for (let i = 0; i < d.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    d[i] = (s / 0xffffffff) * 2 - 1;
  }
  noiseCache.set(sr, d);
  return d;
}

/** A WebAudio biquad (the spec's cookbook: lowpass / highpass Q in dB, bandpass Q linear), coefficients re-read every 32 samples. */
class Biquad {
  private b = [1, 0, 0];
  private a = [0, 0];
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private readonly f: Cursor;
  private readonly q: Cursor;
  constructor(
    private readonly node: RNode,
    private readonly sr: number,
  ) {
    this.f = new Cursor(defaulted(node.frequency!, 350));
    this.q = new Cursor(defaulted(node.Q!, 1));
  }
  coef(t: number): void {
    const f = Math.min(this.sr / 2 - 1, Math.max(1, this.f.value(t)));
    const w = (2 * Math.PI * f) / this.sr;
    const cos = Math.cos(w);
    const q = this.q.value(t);
    const bp = this.node.type === 'bandpass';
    const alpha = Math.sin(w) / (2 * (bp ? Math.max(1e-4, q) : Math.pow(10, q / 20)));
    const a0 = 1 + alpha;
    let b: number[];
    if (bp) b = [alpha, 0, -alpha];
    else if (this.node.type === 'highpass') b = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else b = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    this.b = b.map((x) => x / a0);
    this.a = [(-2 * cos) / a0, (1 - alpha) / a0];
  }
  run(x: number): number {
    const [b0, b1, b2] = this.b as [number, number, number];
    const y = b0 * x + b1 * this.x1 + b2 * this.x2 - this.a[0]! * this.y1 - this.a[1]! * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** The (naive, peak-1) WebAudio waveforms at phase `p` in cycles: every one starts at 0 and rises (sine, triangle, sawtooth) or at +1 (square). */
function wave(type: string, p: number): number {
  const f = p - Math.floor(p);
  if (type === 'square') return f < 0.5 ? 1 : -1;
  if (type === 'sawtooth') return 2 * ((f + 0.5) % 1) - 1;
  if (type === 'triangle') return 1 - 4 * Math.abs(((f + 0.25) % 1) - 0.5);
  return Math.sin(2 * Math.PI * f);
}

export interface Rendered {
  sr: number;
  from: number;
  /** The master gain's output (the limiter's input). */
  master: Float64Array;
  /** Per tap node: the summed signal right after it (a bus gain, the duck). */
  taps: Map<object, Float64Array>;
}

/**
 * Render every voice (started oscillators and buffer sources) over [from, to) at `sr`, through its chain of fake
 * filters and gains up to `master` (included). A voice is rendered from its own start so its filters are warm; the
 * shared music filters are LTI with fixed parameters, so one filter instance per voice sums to the shared one.
 */
export function render(voices: readonly object[], master: object, from: number, to: number, opts: { sr?: number; taps?: readonly object[] } = {}): Rendered {
  const sr = opts.sr ?? 48_000;
  const n = Math.ceil((to - from) * sr);
  const out = new Float64Array(n);
  const taps = new Map<object, Float64Array>((opts.taps ?? []).map((t) => [t, new Float64Array(n)]));
  for (const v of voices as RNode[]) {
    const start = v.startAt!;
    const stop = Math.min(v.stopAt ?? to, to);
    if (start >= to || stop <= from) continue;
    const chain: RNode[] = [];
    let node: RNode | undefined = v.connections[0];
    while (node && node !== master) {
      chain.push(node);
      node = node.connections[0];
    }
    if (node !== master) continue; // disconnected (a stopped music layer)
    chain.push(node);
    const steps = chain.map((c) => (c.gain ? { g: new Cursor(defaulted(c.gain, 1)), tap: taps.get(c) } : { f: new Biquad(c, sr) }));
    const osc = v.frequency ? new Cursor(v.frequency) : null;
    const noise = osc ? null : noiseAt(sr);
    let phase = 0;
    const k0 = Math.ceil((start - from) * sr);
    const k1 = Math.ceil((stop - from) * sr);
    for (let k = k0; k < k1; k++) {
      const t = from + k / sr;
      let x: number;
      if (osc) {
        x = wave(v.type!, phase);
        phase += osc.value(t) / sr;
      } else x = noise![(k - k0) % sr]!;
      const coef = (k - k0) % 32 === 0;
      for (const s of steps) {
        if (s.f) {
          if (coef) s.f.coef(t);
          x = s.f.run(x);
        } else {
          x *= s.g!.value(t);
          if (s.tap && k >= 0) s.tap[k]! += x;
        }
      }
      if (k >= 0) out[k]! += x;
    }
  }
  return { sr, from, master: out, taps };
}

export const peakAbs = (x: Float64Array): { peak: number; at: number } => {
  let peak = 0;
  let at = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]!);
    if (a > peak) {
      peak = a;
      at = i;
    }
  }
  return { peak, at };
};

export const dbfs = (g: number): number => 20 * Math.log10(Math.max(g, 1e-12));

/**
 * The AUD-F6 limiter (src/audio/mixer.ts LIMITER: a hard-knee DynamicsCompressor) as a peak compressor: the
 * static curve (above the threshold the level rises 1/ratio as fast), the gain reduction following its target
 * with one-pole `attackS` / `releaseS` smoothing on |x| per sample, WebAudio's make-up gain (0.6 × the reduction
 * at 0 dBFS) and the trim. No look-ahead (Chromium delays the signal 6 ms, which only lowers the overshoot): an
 * upper bound of what the destination sees. `gain`: the gain the limiter applies (its reduction, make-up and trim
 * left out — they cancel to < 0.01 dB) per sample.
 */
export function limit(x: Float64Array, sr: number, L: { thresholdDb: number; ratio: number; attackS: number; releaseS: number; trimDb: number }): { y: Float64Array; gain: Float64Array; makeupDb: number } {
  const curve = (db: number): number => (db > L.thresholdDb ? L.thresholdDb + (db - L.thresholdDb) / L.ratio : db);
  const makeupDb = -0.6 * curve(0);
  const post = Math.pow(10, (makeupDb + L.trimDb) / 20);
  const ka = 1 - Math.exp(-1 / (L.attackS * sr));
  const kr = 1 - Math.exp(-1 / (L.releaseS * sr));
  const y = new Float64Array(x.length);
  const gain = new Float64Array(x.length);
  let gr = 0;
  for (let i = 0; i < x.length; i++) {
    const db = dbfs(Math.abs(x[i]!));
    const target = curve(db) - db;
    gr += (target - gr) * (target < gr ? ka : kr);
    gain[i] = Math.pow(10, gr / 20);
    y[i] = x[i]! * gain[i]! * post;
  }
  return { y, gain, makeupDb };
}

/**
 * AUD-M1: every voice as a `Path` up to `master` (included): its first gain is the envelope, every gain after it
 * (layer levels, trims, buses, the duck, the master) multiplies in; an unwritten fake gain holds WebAudio's 1.
 */
export function pathsTo(voices: readonly object[], master: object): Path[] {
  return (voices as RNode[]).flatMap((v) => {
    const gains: FakeParam[] = [];
    let n: RNode | undefined = v.connections[0];
    while (n) {
      if (n.gain) gains.push(n.gain);
      if (n === master) break;
      n = n.connections[0];
    }
    if (n !== master || !gains.length) return [];
    const after = gains.slice(1).map((param) => ({ param, initial: param.written || param.events.length ? param.value : 1 }));
    return [{ env: gains[0]!, after, start: v.startAt!, stop: v.stopAt ?? Infinity }];
  });
}
