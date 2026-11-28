import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COUNTER_PLAN_MS as REF_COUNTER_PLAN_MS, HOPELESS_MS as REF_HOPELESS_MS } from '../../src/ai/referencePlayer';
import { COUNTER_PLAN_MS, HOPELESS_MS } from '../../src/ai/personalities';

/*
 * REV-82 (code review 2026-11-28, nit): `referencePlayer.ts` redeclared `HOPELESS_MS` and `COUNTER_PLAN_MS`
 * with the same values `personalities.ts` exports — two places to edit, one of which the enemies read.
 * The reference player now imports the shared constants (and re-exports them for its callers).
 */
describe('REV-82: the reference player shares HOPELESS_MS / COUNTER_PLAN_MS with the personalities', () => {
  const src = readFileSync(new URL('../../src/ai/referencePlayer.ts', import.meta.url), 'utf8');

  it('does not redeclare the two constants', () => {
    expect(src).not.toMatch(/export const HOPELESS_MS\b/);
    expect(src).not.toMatch(/export const COUNTER_PLAN_MS\b/);
    expect(src).toMatch(/import \{[^}]*\bHOPELESS_MS\b[^}]*\} from '\.\/personalities'/);
  });

  it('still exports them, with the shared values (behaviour-neutral by construction)', () => {
    expect(REF_HOPELESS_MS).toBe(HOPELESS_MS);
    expect(REF_COUNTER_PLAN_MS).toBe(COUNTER_PLAN_MS);
    expect(HOPELESS_MS).toBe(60_000);
    expect(COUNTER_PLAN_MS).toBe(30_000);
  });
});
