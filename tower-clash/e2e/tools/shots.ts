/*
 * AUD-Q15 (2026-10-30): where the e2e milestone screenshots go.
 *
 * The smoke, content, look and WebView specs used to write `e2e/__screenshots__/` (tracked: the committed
 * set is the visual record of the build) whatever the run's `PW_OUTPUT` said, so every agent run on the
 * shared checkout rewrote 13–40+ tracked PNGs and two parallel runs raced on the same files (2026-10-29
 * audit: 13 PNGs modified in one smoke run, restored by hand after each chain).
 *
 * Rule, one place for every spec:
 *   - the default run (`PW_OUTPUT` unset, or resolving to the default `test-results`: the Producer's
 *     `npm run e2e`, CI's `verify` job) writes the tracked `e2e/__screenshots__/`, so a refresh of the
 *     committed baselines stays a deliberate default run;
 *   - any other `PW_OUTPUT` (agents, the CI shards' `test-results/shard-N`) writes
 *     `<PW_OUTPUT>/__screenshots__/` and leaves the tracked folder untouched.
 * `PW_OUTPUT` is resolved like playwright.config.ts `outputDir`: relative to the tower-clash root.
 * Specs import `shotPath` / `SHOTS_DIR` from here; tests/repo/hygiene.test.ts (AUD-Q15) fails when a spec
 * names `__screenshots__` itself.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** playwright.config.ts `outputDir` when `PW_OUTPUT` is unset. */
export const DEFAULT_PW_OUTPUT = 'test-results';
/** tower-clash/ (the config's directory: relative `PW_OUTPUT` values resolve against it). */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** The tracked milestone folder (committed baselines). */
export const TRACKED_SHOTS_DIR = path.join(ROOT, 'e2e', '__screenshots__');

/** The screenshot folder for a given `PW_OUTPUT` value (pure: unit-tested in tests/repo/hygiene.test.ts). */
export function shotsDirFor(pwOutput: string | undefined, root: string = ROOT): string {
  if (!pwOutput) return path.join(root, 'e2e', '__screenshots__');
  const out = path.resolve(root, pwOutput);
  if (out === path.resolve(root, DEFAULT_PW_OUTPUT)) return path.join(root, 'e2e', '__screenshots__');
  return path.join(out, '__screenshots__');
}

/** This run's screenshot folder (test workers inherit the runner's `PW_OUTPUT`). */
export const SHOTS_DIR = shotsDirFor(process.env.PW_OUTPUT);

/** Absolute path of the milestone screenshot `<name>.png` for this run; creates the folder. */
export function shotPath(name: string): string {
  mkdirSync(SHOTS_DIR, { recursive: true });
  return path.join(SHOTS_DIR, `${name}.png`);
}
