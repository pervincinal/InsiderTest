import { describe, expect, it, vi } from 'vitest';

/*
 * QA-30 `--tie-exempt` context guards, since AUD-B9 (2026-10-30). With `NAIVE_TIE_EXEMPT` empty the
 * registry refuses every id before parseArgs reaches its context checks (tests/scripts/naiveTie.test.ts
 * pins that), so those checks would go untested until a tutorial-cured level is registered again. Here
 * the option's parser sees a synthetic registry (3 and 9, as GD-7h's level 3 once was) so the guards of
 * scripts/lib/playtestArgs.ts keep their test: only with `--gate a-b --tie both`, ids inside the range,
 * unique and ascending. Ids outside the synthetic registry still go to the real parser and its refusal.
 */
const SYNTHETIC: Readonly<Record<number, string>> = { 3: 'SYNTH-1: test only', 9: 'SYNTH-2: test only' };

vi.mock('../../scripts/lib/naivePlayer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../scripts/lib/naivePlayer')>();
  return {
    ...actual,
    parseTieExempt: (spec: string): number[] => {
      const parts = spec.split(',').map((p) => p.trim());
      const ids = parts.map(Number);
      const known = parts.every((p) => /^\d+$/.test(p)) && new Set(ids).size === ids.length && ids.every((id) => SYNTHETIC[id] !== undefined);
      return known ? [...ids].sort((a, b) => a - b) : actual.parseTieExempt(spec);
    },
  };
});

const { parseArgs } = await import('../../scripts/lib/playtestArgs');

describe('--tie-exempt context guards with a synthetic registry (QA-30, since AUD-B9)', () => {
  it('a registered id parses only with --gate … --tie both, inside the range, in both flag forms', () => {
    expect(parseArgs(['--naive', '--gate', '1-16', '--tie', 'both', '--tie-exempt', '3']).tieExempt).toEqual([3]);
    expect(parseArgs(['--naive', '--gate=1-16', '--tie=both', '--tie-exempt=9,3']).tieExempt).toEqual([3, 9]);
    expect(parseArgs(['--naive', '--gate', '1-16', '--tie', 'both']).tieExempt).toBeUndefined();
    expect(() => parseArgs(['--naive', '--tie-exempt', '3'])).toThrow(/only applies to --naive --gate a-b --tie both/);
    expect(() => parseArgs(['--naive', '--gate', '1-16', '--tie-exempt', '3'])).toThrow(/only applies to --naive --gate a-b --tie both/);
    expect(() => parseArgs(['--naive', '--tie', 'both', '--tie-exempt', '3'])).toThrow(/only applies to --naive --gate a-b --tie both/);
    expect(() => parseArgs(['--naive', '--gate', '4-16', '--tie', 'both', '--tie-exempt', '3'])).toThrow('--tie-exempt 3 is outside --gate 4-16');
    expect(() => parseArgs(['--naive', '--gate', '4-8', '--tie', 'both', '--tie-exempt', '3,9'])).toThrow('--tie-exempt 3,9 is outside --gate 4-8');
  });

  it('ids outside the registry and malformed specs still reach the real parser and its refusal', () => {
    expect(() => parseArgs(['--naive', '--gate', '1-16', '--tie', 'both', '--tie-exempt', '5'])).toThrow(/--tie-exempt 5: not in NAIVE_TIE_EXEMPT/);
    expect(() => parseArgs(['--naive', '--gate', '1-16', '--tie', 'both', '--tie-exempt', '3,3'])).toThrow(/bad --tie-exempt/);
    expect(() => parseArgs(['--naive', '--gate', '1-16', '--tie', 'both', '--tie-exempt', 'x'])).toThrow(/bad --tie-exempt/);
  });
});
