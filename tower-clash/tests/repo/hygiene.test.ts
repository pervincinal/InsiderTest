import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Repository hygiene guards (QA). Regression test for BUG-2: the Android/iOS workflows write
 * `tower-clash/.env.production` from repository secrets (store keys, ad unit ids); Vite also
 * reads that file locally, so it must stay ignored or a developer can commit live keys.
 */
const GITIGNORE = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

describe('tower-clash/.gitignore (BUG-2)', () => {
  it('ignores the env files CI writes from secrets', () => {
    expect(GITIGNORE).toContain('.env.production');
    expect(GITIGNORE).toContain('.env*.local');
  });

  it('ignores build and test artefacts', () => {
    for (const entry of ['node_modules', 'dist', 'test-results', 'playwright-report']) expect(GITIGNORE).toContain(entry);
  });
});
