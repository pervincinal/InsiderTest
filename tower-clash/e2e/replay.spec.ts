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
    setDayKey(key: string | null): void;
    getResult(): { outcome: string } | null;
    economy: {
      setAdsAvailable(on: boolean): void;
      autoLose(): boolean;
      resultAction(action: 'continueAd'): boolean;
      getClock(): { timeMs: number; elapsedMs: number; continued: boolean } | null;
    };
    daily: {
      get(dayKey?: string): { challenge: { dayKey: string; levelId: number; seed: number; twist: { id: string } } };
      start(dayKey?: string): Promise<boolean>;
    };
  };
};
/** SIM-R2: the committed daily fixture's day (level 37 "Tank Country", plain; `scripts/replay.ts --record-daily 2026-11-11`). */
const DAILY_KEY = '2026-11-11';
const DAILY_FIXTURE = readFileSync(new URL(`../tests/fixtures/replay-daily-${DAILY_KEY}.json`, import.meta.url), 'utf8');
type ChallengeRecord = typeof FIXTURE_RECORD & { modifiers: Record<string, number>; challenge?: { kind: string; key: string; twist: string } };

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

/*
 * SIM-R2 (2026-11-11): a Daily Challenge match carries `challenge: { kind: 'daily', key, twist }`; `verifyReplay`
 * rebuilds the day's challenge from the key (src/daily/replayLevel.ts) and verifies the record on it; the
 * node-recorded daily fixture re-runs in the browser; a tampered descriptor is rejected.
 */
test.describe('replay record: daily challenge (SIM-R2)', () => {
  test(`the daily of ${DAILY_KEY} started through the debug surface (autoplay ×10) is captured with its descriptor and verifies`, async ({ page }) => {
    const errors = await boot(page);
    const info = await page.evaluate((key) => {
      const d = (window as unknown as Win).__towerclash;
      d.setDayKey(key);
      const got = JSON.parse(JSON.stringify(d.daily.get())) as ReturnType<Win['__towerclash']['daily']['get']>;
      void d.daily.start();
      d.setSpeed(10);
      d.autoplay();
      return got;
    }, DAILY_KEY);
    expect(info.challenge.dayKey).toBe(DAILY_KEY);
    expect(info.challenge.levelId).toBe(37);
    await expect.poll(() => screen(page), { timeout: 75_000, intervals: [250] }).toBe('result');
    const json = await page.evaluate(() => (window as unknown as Win).__towerclash.getReplay());
    expect(json).not.toBeNull();
    const record = JSON.parse(json!) as ChallengeRecord;
    expect(record.v).toBe(1);
    expect(record.challenge).toEqual({ kind: 'daily', key: DAILY_KEY, twist: info.challenge.twist.id });
    expect(record.levelId).toBe(info.challenge.levelId);
    expect(record.seed).toBe(info.challenge.seed);
    expect(record.outcome.result).toBe('won');
    const v = await verify(page, json!);
    expect(v.matches, `${v.reason ?? ''} ${v.hash} vs ${v.expected}`).toBe(true);
    expect(v.timeMs).toBe(record.outcome.timeMs);

    // a tampered descriptor (another day) is refused before any re-run
    const tampered = JSON.parse(json!) as ChallengeRecord;
    tampered.challenge!.key = '2026-11-12';
    await expect(verify(page, JSON.stringify(tampered))).rejects.toThrow(/does not match the record/);
    expect(errors).toEqual([]);
  });

  test(`the node-recorded daily fixture (${DAILY_KEY}) re-runs in the browser to the recorded hash`, async ({ page }) => {
    const errors = await boot(page);
    const fixture = JSON.parse(DAILY_FIXTURE) as ChallengeRecord;
    expect(fixture.challenge).toEqual({ kind: 'daily', key: DAILY_KEY, twist: 'plain' });
    const v = await verify(page, DAILY_FIXTURE);
    expect(v.rulesMatch, 'the build under test plays the rules the fixture was recorded with (re-record it after a constants change)').toBe(true);
    expect(v.hash, `browser hash ${v.hash} vs node hash ${fixture.outcome.hash} (${v.reason ?? 'ok'})`).toBe(fixture.outcome.hash);
    expect(v.matches).toBe(true);
    expect(errors).toEqual([]);
  });
});

/*
 * SIM-R3 (2026-11-12): a match that used Continue (the rewarded-ad rewind ≈ 20 s back with a free Freeze + infantry,
 * economy.spec's "defeat → CONTINUE" flow is the model) records the rewind as `{ t, r: { toMs, freezeMs, infantry } }`
 * and verifies — `continued` is no longer set, `reason` is never 'continued'. Level 15 seed 1 with the lose bot
 * falls at ≈ 34 s of sim (past the 22 s a full rewind needs).
 */
test.describe('replay record: continued match (SIM-R3)', () => {
  type ContinueRecord = Omit<typeof FIXTURE_RECORD, 'commands'> & { continued?: true; commands: { t: number; c?: unknown; r?: { toMs: number; freezeMs: number; infantry: number } }[] };
  const CONTINUE_REWIND_MS = 20_000; // src/sim/constants.ts CONTINUE_REWIND_MS
  const getReplay = (page: Page) => page.evaluate(() => (window as unknown as Win).__towerclash.getReplay());
  const clock = (page: Page) => page.evaluate(() => (window as unknown as Win).__towerclash.economy.getClock()!);

  test('level 15 (seed 1) lost by the lose bot, continued through the rewarded ad: the record carries the rewind entry and verifies, before and after the match ends', async ({ page }) => {
    const errors = await boot(page);
    await page.evaluate(() => {
      const d = (window as unknown as Win).__towerclash;
      d.economy.setAdsAvailable(true);
      void d.loadLevel(15, 1);
      d.setSpeed(20);
      d.economy.autoLose();
    });
    await expect.poll(() => screen(page), { timeout: 60_000, intervals: [250] }).toBe('result');
    expect((await page.evaluate(() => (window as unknown as Win).__towerclash.getResult()))?.outcome).toBe('lost');
    const lost = await clock(page);
    expect(lost.continued).toBe(false);
    expect(lost.timeMs).toBeGreaterThanOrEqual(CONTINUE_REWIND_MS + 2000);
    const lostJson = (await getReplay(page))!;
    const lostRecord = JSON.parse(lostJson) as ContinueRecord;
    expect(lostRecord.commands.some((e) => e.r)).toBe(false);
    expect(lostRecord.outcome.result).toBe('lost');

    // CONTINUE (rewarded video): back on the play screen ≈ 20 s earlier, with the entry logged
    await page.evaluate(() => (window as unknown as Win).__towerclash.economy.resultAction('continueAd'));
    await expect.poll(() => screen(page), { timeout: 15_000 }).toBe('play');
    const mid = await page.evaluate(() => {
      const d = (window as unknown as Win).__towerclash;
      return { json: d.getReplay()!, clock: d.economy.getClock()! };
    });
    expect(mid.clock.continued).toBe(true);
    const midRecord = JSON.parse(mid.json) as ContinueRecord;
    const entries = midRecord.commands.filter((e) => e.r);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.t).toBe(lost.timeMs);
    expect(entry.c).toBeUndefined();
    expect(lost.timeMs - entry.r!.toMs).toBeGreaterThanOrEqual(CONTINUE_REWIND_MS);
    expect(lost.timeMs - entry.r!.toMs).toBeLessThan(CONTINUE_REWIND_MS + 1000); // the newest snapshot at least 20 s old (1 s ring interval)
    expect(entry.r!.toMs).toBeLessThanOrEqual(mid.clock.timeMs);
    expect(entry.r).toEqual({ toMs: entry.r!.toMs, freezeMs: 5000, infantry: 15 }); // C.CONTINUE_FREEZE_MS / C.CONTINUE_INFANTRY
    expect(midRecord.continued).toBeUndefined();
    expect(midRecord.commands.slice(midRecord.commands.indexOf(entry) + 1).every((e) => e.t >= entry.r!.toMs)).toBe(true);
    // the record closed on the running, rewound match verifies: the re-run lands on the restored + granted state
    const vm = await verify(page, mid.json);
    expect(vm.matches, `${vm.reason ?? ''} ${vm.hash} vs ${vm.expected}`).toBe(true);
    expect(vm.reason).toBeUndefined();
    expect(vm.timeMs).toBe(midRecord.outcome.timeMs);

    // the continued attempt plays to its end (the lose bot is still on: a second defeat, or a win under rules v2)
    await expect.poll(() => screen(page), { timeout: 60_000, intervals: [250] }).toBe('result');
    const json = (await getReplay(page))!;
    const record = JSON.parse(json) as ContinueRecord;
    expect(record.levelId).toBe(15);
    expect(record.seed).toBe(1);
    expect(record.rules).toBe(FIXTURE_RECORD.rules);
    expect(record.continued).toBeUndefined();
    expect(record.commands.filter((e) => e.r)).toEqual([entry]);
    expect(['won', 'lost']).toContain(record.outcome.result);
    expect(record.outcome.timeMs).toBeGreaterThan(entry.r!.toMs);
    const v = await verify(page, json);
    expect(v.matches, `${v.reason ?? ''} ${v.hash} vs ${v.expected}`).toBe(true);
    expect(v.reason).toBeUndefined();
    expect(v.outcome).toBe(record.outcome.result);
    expect(v.timeMs).toBe(record.outcome.timeMs);
    // the rule: the same record without the entry is the pre-SIM-R3 one and does not verify
    const without = { ...record, commands: record.commands.filter((e) => !e.r) };
    expect((await verify(page, JSON.stringify(without))).matches).toBe(false);
    expect(errors).toEqual([]);
  });
});
