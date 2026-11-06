/**
 * The shipped lesson card of every level past the naive gate as a literal-follower spec (GDD §3 "Star-2 floor after
 * launch", GD-12: "each level's card spec beside `NAIVE_FLOOR_LAST_LEVEL`, so the floor is re-derived after every
 * retune, never hand-set"). `scripts/reclock.ts --gd12` runs each spec through `runNaive` (`--follow` machinery,
 * both tie orders, 4 s reactions) and reports the GD-12 card-reader `star2` floor (LV-12, 2026-11-06).
 *
 * Every spec is the one its GD item verified the card with (`npm run playtest -- --naive --level N --follow "<spec>"
 * --seeds 20 --tie both`, recorded in the GD-8 … GD-11 done notes of docs/BACKLOG.md and GDD §3.14–§3.17); the
 * `source` names that item. Where the card says "level 3" the spec holds at `@3` (GD-11g), as the GDD rule asks.
 * A level without a `spec` (today only 26: §3.15 — "the move each card implies is the naive line's own first tap")
 * falls back to the plain naive line, and the row says so (`naive (no card spec)`).
 *
 * Edit this table together with the card: a rewrite that changes the move changes the spec (and the floor).
 */
import { GD12_FIRST_LEVEL, GD12_LAST_LEVEL } from './reclockRule';

export interface CardSpec {
  /** `--follow` spec of the card's literal reading; absent = the plain naive line. */
  spec?: string;
  /** The GD item (or GDD section) that measured this reading. */
  source: string;
  note?: string;
}

export const CARD_SPECS: Readonly<Record<number, CardSpec>> = Object.freeze({
  17: { spec: 'prio=east,west;noprioFrom=west,east,mid,nw,ne', source: 'GD-8a' },
  18: { spec: 'prio=w1,e1,w2', source: 'GD-8b' },
  19: { spec: 'prio=east,west,gate;noprioFrom=east,west,nw,ne,top', source: 'GD-8c' },
  20: { spec: 'prio=left,right,mid', source: 'GDD §3.14 (a), kept card', note: 'the detour: side towers, then mid from both' },
  21: { spec: 'prio=e,ne', source: 'GDD §3.14 (a), kept card', note: 'the open-side reading (59.5 s)' },
  22: { spec: 'prio=keep', source: 'GDD §3.14 (a), kept card' },
  23: { spec: 'prio=w,mid,e', source: 'GD-8d', note: 'learning level (item 9): the reader stays over star2 by design' },
  24: { spec: 'prio=w,e,fort;noprioFrom=w,e,nw,ne', source: 'GD-8e' },
  25: { spec: 'prio=depot;noprioFrom=home,depot,e,mid,nw,ne,top', source: 'GD-9a', note: '= the naive line' },
  26: { source: 'GDD §3.15, kept card', note: 'no spec: the card\'s move is the naive line\'s first tap (the factory onto its nearest grey)' },
  27: { spec: 'hold=home', source: 'GDD §3.15 / GD-4', note: '"let your home grow to 25 first"' },
  28: { spec: 'prio=e,w,bank;noprioFrom=w,e', source: 'GD-9b' },
  29: { spec: 'prio=islande,islandw;noprioFrom=islande,islandw,mid,nw,ne,crown', source: 'GD-9c' },
  30: { spec: 'hold=w;prio=e,ne', source: 'GD-9d' },
  31: { spec: 'prio=guns;hold=factory', source: 'GD-9e' },
  32: { spec: 'hold=home;prio=nw,ne;noprioFrom=factory', source: 'GD-9f', note: 'learning level (item 9)' },
  33: { spec: 'prio=ne,nw;noprioFrom=home', source: 'GD-10e', note: 'KEEP-pinned level: the floor is reported only' },
  34: { spec: 'hold=w,e,fort,nw,ne', source: 'GD-10e' },
  35: { spec: 'prio=nw,ne;noprioFrom=home', source: 'GD-10e' },
  36: { spec: 'prio=n;noprioFrom=home,mid,nw,ne', source: 'GD-10b' },
  37: { spec: 'prio=fort;noprioFrom=home,factory', source: 'GD-10c' },
  38: { spec: 'prio=gunse,gunsw;after=gunse:3,gunsw:3', source: 'GD-10a' },
  39: { spec: 'hold=home@3', source: 'GD-11g', note: 'the card says "fill to level 3"; GD-10e verified the L2-only runner reading hold=w,e,fort,nw,ne (99.5 s)' },
  40: { spec: 'prio=fort', source: 'GD-10d' },
  41: { spec: 'hold=home;prio=ford;noprioFrom=home,mid,nw,ne', source: 'GD-11a' },
  42: { spec: 'hold=home@3', source: 'GD-11f / GD-11g', note: '"let your home grow to level 3"' },
  43: { spec: 'prio=mid,w;noprioFrom=factory', source: 'GD-11d' },
  44: { spec: 'prio=green;noprioFrom=home,e,w,mid,ne,nw,n,crown', source: 'GD-11f' },
  45: { spec: 'prio=e,w,wall', source: 'GD-11b' },
  46: { spec: 'prio=w,e', source: 'GD-11e' },
  47: { spec: 'prio=n', source: 'GD-11f', note: 'GD-11g\'s hold=home@3 reads the same 67.9 s' },
  48: { spec: 'prio=court', source: 'GD-11f' },
  49: { spec: 'prio=e', source: 'GD-11c' },
  50: { spec: 'prio=fort', source: 'GD-11f' },
});

/** Ids 17–50 with no entry at all (a new level must be added here before `--gd12` can read it). */
export function missingCardSpecs(table: Readonly<Record<number, CardSpec>> = CARD_SPECS): number[] {
  const out: number[] = [];
  for (let id = GD12_FIRST_LEVEL; id <= GD12_LAST_LEVEL; id++) if (!(id in table)) out.push(id);
  return out;
}
