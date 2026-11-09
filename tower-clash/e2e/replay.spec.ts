import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * SIM-R1 replay record v1 (src/sim/replay.ts) through the debug surface, on Chromium (the `chromium` project;
 * e2e/webkit.spec.ts runs the same fixture check on WebKit under PW_WEBKIT=1 in CI):
 *   1. cross-engine determinism — the committed fixture tests/fixtures/replay-l15-s1.json was recorded headless
 *      in node (V8); `verifyReplay(json)` re-runs it in the page and must land on the recorded hash. The sim calls
 *      `Math.hypot` in five places and the spec does not require it correctly rounded, so an engine that rounds it
 *      differently would show up here as a hash mismatch (docs/reviews/2026-11-09-icebox-1.1.md §1 risk 1);
 *   2. the capture path — an autoplay match recorded by the play screen (`getReplay()`) verifies on the same page.
 *
 * Imports nothing from src/ (Node's native TS loader cannot import the JSON-backed level index): the hooks are
 * typed here (`QaDebugExtras` in src/debug.ts is their source of truth).
 */

const FIXTURE = readFileSync(new URL('../tests/fixtures/replay-l15-s1.json', import.meta.url), 'utf8');
const FIXTURE_RECORD = JSON.parse(FIXTURE) as { v: number; levelId: number; seed: number; rules: string; commands: unknown[]; outcome: { result: string; timeMs: number; hash: string } };

interface Verify {
  hash: string;
  expected?: string;
  matches: boolean;
  rulesMatch: boolean;
  outcome: string;
  timeMs: number;
  reason?: string;
}
type Win = Window & {
  __towerclash: {
    getScreen(): string;
    loadLevel(id: number, seed?: number): Promise<boolean>;
    setSpeed(n: number): void;
    autoplay(): boolean;
    getReplay(): string | null;
    verifyReplay(json: string): Promise<Verify>;
  };
};

const screen = (page: Page) => page.evaluate(() => (window as unknown as Win).__towerclash.getScreen());
const verify = (page: Page, json: string) => page.evaluate((j) => (window as unknown as Win).__towerclash.verifyReplay(j), json);

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as unknown as Win).__towerclash?.verifyReplay === 'function');
  return errors;
}

test.describe('replay record v1 (SIM-R1)', () => {
  test('the node-recorded fixture (level 15, seed 1) re-runs in the browser to the recorded hash — cross-engine determinism', async ({ page }) => {
    const errors = await boot(page);
    expect(FIXTURE_RECORD.v).toBe(1);
    expect(FIXTURE_RECORD.levelId).toBe(15);
    const v = await verify(page, FIXTURE);
    expect(v.rulesMatch, 'the build under test plays the rules the fixture was recorded with (re-record it after a constants change)').toBe(true);
    expect(v.timeMs).toBe(FIXTURE_RECORD.outcome.timeMs);
    expect(v.outcome).toBe(FIXTURE_RECORD.outcome.result);
    expect(v.hash, `browser hash ${v.hash} vs node hash ${FIXTURE_RECORD.outcome.hash} (${v.reason ?? 'ok'})`).toBe(FIXTURE_RECORD.outcome.hash);
    expect(v.matches).toBe(true);
    expect(errors).toEqual([]);
  });

  test('a mutated fixture does not verify (the check can fail)', async ({ page }) => {
    await boot(page);
    const bad = JSON.parse(FIXTURE) as typeof FIXTURE_RECORD;
    bad.commands.splice(1, 1);
    const v = await verify(page, JSON.stringify(bad));
    expect(v.matches).toBe(false);
    expect(v.hash).not.toBe(FIXTURE_RECORD.outcome.hash);
  });

  test('an autoplay match on level 15 (seed 1, ×10) is captured by the play screen and verifies on the same engine', async ({ page }) => {
    const errors = await boot(page);
    await page.evaluate(() => {
      const d = (window as unknown as Win).__towerclash;
      void d.loadLevel(15, 1);
      d.setSpeed(10);
      d.autoplay();
    });
    await expect.poll(() => screen(page), { timeout: 75_000, intervals: [250] }).toBe('result');
    const json = await page.evaluate(() => (window as unknown as Win).__towerclash.getReplay());
    expect(json).not.toBeNull();
    const record = JSON.parse(json!) as typeof FIXTURE_RECORD & { continued?: true };
    expect(record.levelId).toBe(15);
    expect(record.seed).toBe(1);
    expect(record.rules).toBe(FIXTURE_RECORD.rules);
    expect(record.continued).toBeUndefined();
    expect(record.outcome.result).toBe('won');
    expect(record.commands.length).toBeGreaterThan(5);
    const v = await verify(page, json!);
    expect(v.matches, `${v.reason ?? ''} ${v.hash} vs ${v.expected}`).toBe(true);
    expect(v.timeMs).toBe(record.outcome.timeMs);
    expect(errors).toEqual([]);
  });
});
