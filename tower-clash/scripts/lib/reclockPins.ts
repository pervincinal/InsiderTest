/**
 * The two pin tables `scripts/reclock.ts` reads (LV-12, 2026-11-06). Both are hand-edited after a sign-off, never
 * generated: `KEEP` pins a whole level (reported, never written); `HUMAN` pins one clock of a level to a value the
 * human playtest set (docs/reviews/2026-11-05-human-playtest-sheet.md §C.1 / §C.2 — a `DECISION` row the stakeholder
 * signed off, transcribed here by the Level Designer together with the JSON edit), so a later `--write` never puts
 * the bot's clock back over it. There is deliberately no `--human <file.csv>` option: QA's decision helper
 * (`scripts/playtestDecide.ts`, `npm run playtest:decide`, QA-36 — it imports `KEEP` and checks its HUMAN JSON with
 * `validateHumanPins`, so keep both exports' names and shapes stable or update `tests/scripts/playtestDecide.test.ts`
 * in the same change) prints *proposals* from a filled sheet, and a proposal becomes a pin only by hand, after the
 * sign-off, as one entry below with its sheet date in `source`. `tests/scripts/reclock.test.ts` pins `HUMAN` as empty
 * today, so adding the first entry is a deliberate test update as well.
 */
import { RECLOCK_CAP_MS, RECLOCK_STEP_MS } from './reclockRule';

/** Whole-level pins: reported, never written (level 1 = tutorial clock, level 33 = the first shipped weekly target). */
export const KEEP: Readonly<Record<number, string>> = Object.freeze({ 1: 'tutorial clock', 33: 'weekly pin 2026-09-21' });

export interface HumanPin {
  /** Pinned `star3` in ms (a 5 s step, ≤ 180 s); absent = the bot's proposal stands for that clock. */
  star3?: number;
  /** Pinned `star2` in ms; absent = the bot's proposal (base, tie floor, GD-12 floor) stands. */
  star2?: number;
  /** `sheet YYYY-MM-DD`: the filled sheet (`docs/reviews/<date>-playtest.md`) whose `DECISION` row set it. */
  source: string;
  /** Why: the §C.1 zone and the inputs, e.g. `zone S, H 48 s / B 33.1 s, r 1.45` — so the next reader can re-derive it. */
  note: string;
}

/**
 * Human-clock pins, id → pin. Empty until the first signed-off sheet row. A pinned clock is printed as
 * `human-pinned` in the reclock row next to what the bot would propose, is excluded from `CHANGED`, and is what
 * `--write` writes; a pinned `star2` also blocks the GD-12 floor on that level (the human number wins).
 */
export const HUMAN: Readonly<Record<number, HumanPin>> = Object.freeze({});

const SOURCE_RE = /^sheet \d{4}-\d{2}-\d{2}$/;

/** Throws on a malformed pin (a hand-edited table deserves a loud failure): ms on the step, ≤ cap, star3 < star2, `sheet YYYY-MM-DD`. */
export function validateHumanPin(id: number, pin: HumanPin): void {
  const where = `reclock: HUMAN[${id}]`;
  if (pin.star3 === undefined && pin.star2 === undefined) throw new Error(`${where} pins neither star3 nor star2`);
  for (const [name, ms] of [['star3', pin.star3], ['star2', pin.star2]] as const) {
    if (ms === undefined) continue;
    if (!Number.isInteger(ms) || ms <= 0 || ms % RECLOCK_STEP_MS !== 0 || ms > RECLOCK_CAP_MS) {
      throw new Error(`${where} ${name} ${String(ms)} is not a positive multiple of ${RECLOCK_STEP_MS} ms up to ${RECLOCK_CAP_MS}`);
    }
  }
  if (pin.star3 !== undefined && pin.star2 !== undefined && pin.star3 >= pin.star2) throw new Error(`${where} star3 ${pin.star3} must be under star2 ${pin.star2}`);
  if (!SOURCE_RE.test(pin.source)) throw new Error(`${where} source "${pin.source}" is not "sheet YYYY-MM-DD"`);
  if (pin.note.trim() === '') throw new Error(`${where} needs a note (zone and inputs)`);
}

/** Validates every entry of a pin table; returns it for chaining. */
export function validateHumanPins<T extends Readonly<Record<number, HumanPin>>>(table: T): T {
  for (const [id, pin] of Object.entries(table)) validateHumanPin(Number(id), pin);
  return table;
}
