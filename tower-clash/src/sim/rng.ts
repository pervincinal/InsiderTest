/** mulberry32 — small, fast, seedable. State is a plain number so it can live inside GameState. */
export function nextRandom(state: number): { value: number; state: number } {
  const t = (state + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, state: t };
}

/** Convenience wrapper around a mutable seed (use inside sim only through state.rngState). */
export class Rng {
  constructor(public state: number) {}
  next(): number {
    const r = nextRandom(this.state);
    this.state = r.state;
    return r.value;
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}
