import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * FE-1 / FE-2 (BUG-13): the stalemate hint — src/ui/play.ts `StalemateWatch` — is a toast that fires
 * once per player link after STALEMATE_HINT_MS (8 s) of sim time in which nothing of the player's
 * landed on the link's target while the lane carries an opposing enemy stream (sim `laneStalemate`:
 * opposing streams cancel 1:1, so the link lands nothing). Level 1 never shows it.
 *
 * The stalemate is built on level 2 (seed 1) from what the rusher does on its own, verified headlessly
 * (sim + src/ai ticks, 2026-09-25) over every opening time 200–2950 ms and reaction 50–5000 ms: the
 * player streams home → side from the first seconds (side falls at ≈ 4 s and the stream keeps home at
 * 12–13 units); the rusher takes mid with foe → mid from t = 1 s and, at its 12 000 ms tick, attacks
 * the weak home from mid. Unlinking home → side and linking home → mid then puts the two 1/s streams
 * on one lane in opposite directions: they cancel, nothing lands on mid, and the hint fires exactly
 * 8 s after the counter-stream was created. The enemy keeps the attack (it shields mid) until ≈ 36 s,
 * then the player's stream lands on mid — the same link, so no second hint; home is never lost.
 * An opening stream into mid instead would race the rusher's own stream for mid, and whether the
 * enemy then ever attacks home depends on the tap's phase against its 500 ms ticks — not testable.
 *
 * Sim speed is ×10 for the waits; the taps are placed at ×1 so a tap lands in a known state.
 * Every timing assertion reads sim time (`getState().time`, ms) next to the toast in one evaluate,
 * never the wall clock. Nothing is imported from src/ (see smoke.spec.ts for why); the hint text is
 * read from the running page via `getText('hint.stalemate')`, level JSON only for tower coordinates.
 */

const SEED = 1;
/** src/ui/play.ts — STALEMATE_HINT_MS. */
const HINT_MS = 8000;
/** src/sim/constants.ts — TICK_MS and src/ui/loop.ts — MAX_TICKS_PER_FRAME: the sim moves at most this much between two frames. */
const MAX_SIM_MS_PER_FRAME = 50 * 10;
/**
 * Observation slack on the fire time, sim ms: the toast is checked once per frame (after up to
 * MAX_SIM_MS_PER_FRAME of ticks) and this test polls the page every ~25 ms of wall clock at ×10,
 * so the first sighting can trail the fire tick by a few frames. 10 s of sim time is 1 s wall at ×10.
 */
const FIRE_SLACK_MS = 10_000;
/** Sim ms the lane must stay silent after the hint's toast has gone (≈ 52 s): spans the enemy dropping the attack at ≈ 36 s and the stream then landing on mid. */
const SILENT_AFTER_MS = 20_000;
/** Validated opening window (sim ms) for the home → side link: the rusher's plan is the same for any tap inside it. */
const OPENING_DEADLINE_MS = 2950;
/** Sim ms at which the rusher's mid → home attack is created for any opening inside the window (its 12 s AI tick). */
const ATTACK_AT_MS = 12_000;
/**
 * Validated reaction window: the counter-stream must follow the attack within this much sim time.
 * The player's first unit leaves 1 s after the link and clashes with the oldest enemy unit still on
 * the lane; inside this window that is the enemy's first unit (spawned at 13 s), so the player's
 * units walk ≥ 550 ms before the clash and the sim sees the lane as a stalemate every tick. Placed
 * later (≥ 2.65 s after the attack, at a 900–950 ms phase) the clash lands inside the spawn tick,
 * no outbound unit ever exists at a tick end and the hint never fires — a sim/FE-1 blind spot, not
 * this test's subject. The spec drops to ×1 before the attack so the reaction stays ≈ 0.1–0.5 s.
 */
const REACTION_WINDOW_MS = 1900;
/**
 * Sim ms at which the spec returns to ×1 (so the taps follow the 12 s attack within a few ticks of
 * sim time). Reached at ×10, so the sim overshoots it by up to ~1 s (poll interval + the speed change).
 */
const SLOW_DOWN_AT_MS = 8000;

interface LevelJson {
  id: number;
  towers: { id: string; x: number; y: number; owner: string }[];
}
const LEVELS_DIR = new URL('../src/levels/', import.meta.url);
const LEVELS = new Map<number, LevelJson>();
for (const f of readdirSync(LEVELS_DIR).filter((f) => /^\d{3}-.*\.json$/.test(f))) {
  const level = JSON.parse(readFileSync(new URL(f, LEVELS_DIR), 'utf8')) as LevelJson;
  LEVELS.set(level.id, level);
}
function towerAt(levelId: number, towerId: string): { x: number; y: number } {
  const tower = LEVELS.get(levelId)?.towers.find((t) => t.id === towerId);
  if (!tower) throw new Error(`level ${levelId} has no tower "${towerId}" (src/levels/*.json)`);
  return { x: tower.x, y: tower.y };
}

/** Touch-tap a logical (720×1280) point (the chromium project is a Pixel 5 with hasTouch). */
async function tap(page: Page, p: { x: number; y: number }): Promise<void> {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [p.x, p.y] as const);
  await page.touchscreen.tap(c.x, c.y);
}

interface LinkView {
  owner: string;
  from: string;
  to: string;
  createdMs: number;
}
interface Probe {
  screen: string;
  time: number;
  toast: string | null;
  links: LinkView[];
  towers: Record<string, { owner: string; units: number }>;
}

/** One evaluate: screen, sim time, the toast and the links, so a toast is always paired with the sim time it was seen at. */
const probe = (page: Page): Promise<Probe> =>
  page.evaluate(() => {
    const d = window.__towerclash;
    const s = d.getState();
    const towers: Record<string, { owner: string; units: number }> = {};
    for (const t of Object.values(s?.towers ?? {})) towers[t.id] = { owner: t.owner, units: t.units };
    return {
      screen: d.getScreen(),
      time: s?.time ?? -1,
      toast: d.getToast(),
      links: (s?.links ?? []).map((l) => ({ owner: l.owner, from: l.from, to: l.to, createdMs: l.createdMs })),
      towers,
    };
  });

const link = (p: Probe, owner: string, from: string, to: string): LinkView | undefined => p.links.find((l) => l.owner === owner && l.from === from && l.to === to);
const playerLinks = (p: Probe): { from: string; to: string }[] => p.links.filter((l) => l.owner === 'player').map((l) => ({ from: l.from, to: l.to }));

async function setSpeed(page: Page, n: number): Promise<void> {
  await page.evaluate((s) => window.__towerclash.setSpeed(s), n);
  await expect.poll(() => page.evaluate(() => window.__towerclash.getSpeed())).toBe(n);
}

/** Load a level with the fixed seed at ×1 and wait until it is really running (sim time advancing). */
async function startLevel(page: Page, id: number): Promise<void> {
  expect(await page.evaluate(([lid, seed]) => window.__towerclash.loadLevel(lid, seed), [id, SEED] as const), `loadLevel(${id})`).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__towerclash.getScreen())).toBe('play');
  expect(await page.evaluate(() => window.__towerclash.getState()?.levelId)).toBe(id);
  await setSpeed(page, 1);
  await expect.poll(() => page.evaluate(() => window.__towerclash.getState()?.time ?? -1), { message: `level ${id} sim should tick` }).toBeGreaterThan(0);
}

/** Fresh save (new context = empty localStorage) → title → debug surface up; returns the page-error sink and the hint text. */
async function boot(page: Page): Promise<{ pageErrors: string[]; hint: string }> {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.getToast === 'function');
  expect(await page.evaluate(() => window.__towerclash.getScreen())).toBe('title');
  expect(await page.evaluate(() => window.__towerclash.getLanguage())).toBe('en');
  const hint = await page.evaluate(() => window.__towerclash.getText('hint.stalemate'));
  expect(hint, 'hint.stalemate must be translated').not.toBe('hint.stalemate');
  expect(hint.length).toBeGreaterThan(0);
  return { pageErrors, hint };
}

/**
 * Sample the page every ~25 ms of wall clock until `untilSimMs` (or `stop` says so), asserting the
 * stalemate toast is never up; returns the last probe. Used for "not before 8 s" and "not again".
 */
async function expectNoHintUntil(page: Page, hint: string, untilSimMs: number, label: string, stop: (p: Probe) => boolean = () => false): Promise<Probe> {
  let p = await probe(page);
  let samples = 0;
  while (p.time < untilSimMs && !stop(p)) {
    expect(p.toast, `${label}: no stalemate toast at sim ${p.time} ms`).not.toBe(hint);
    samples++;
    await page.waitForTimeout(25);
    p = await probe(page);
  }
  expect(samples, `${label}: the window was actually sampled`).toBeGreaterThan(0);
  return p;
}

test.describe('stalemate hint (FE-1 / FE-2)', () => {
  test('level 2: a counter-stream against the enemy attack fires the hint once, 8 s of sim time after the link', async ({ page }) => {
    const { pageErrors, hint } = await boot(page);

    await startLevel(page, 2);
    // the opening the trace is based on: home → side from the first seconds (keeps home weak; does not race the rusher for mid)
    await tap(page, towerAt(2, 'home'));
    await tap(page, towerAt(2, 'side'));
    await expect.poll(async () => playerLinks(await probe(page))).toEqual([{ from: 'home', to: 'side' }]);
    const opening = await probe(page);
    expect(link(opening, 'player', 'home', 'side')!.createdMs, `the opening stream starts inside the validated window (≤ ${OPENING_DEADLINE_MS})`).toBeLessThanOrEqual(OPENING_DEADLINE_MS);

    // ×10 until just before the enemy's attack, then ×1 so the attack (mid → home, created at its
    // 12 s tick) is answered within a few ticks of sim time
    await setSpeed(page, 10);
    await expect.poll(async () => (await probe(page)).time, { message: 'approaching the 12 s attack', timeout: 20_000, intervals: [50] }).toBeGreaterThanOrEqual(SLOW_DOWN_AT_MS);
    await setSpeed(page, 1);
    const pre = await probe(page);
    expect(pre.time, 'back at ×1 with sim time still well before the 12 s attack').toBeLessThan(ATTACK_AT_MS - 1000);
    expect(pre.links.some((l) => l.owner === 'enemy1' && l.to === 'home'), 'no attack on home before its 12 s tick').toBe(false);
    await expect
      .poll(async () => (await probe(page)).links.some((l) => l.owner === 'enemy1' && l.to === 'home'), { message: 'the rusher attacks home', timeout: 20_000, intervals: [25] })
      .toBe(true);
    const attack = await probe(page);
    const enemyAttack = attack.links.find((l) => l.owner === 'enemy1' && l.to === 'home')!;
    expect(enemyAttack, 'the attack comes from mid at the 12 s AI tick, whatever the opening tap\'s exact time').toMatchObject({ from: 'mid', createdMs: ATTACK_AT_MS });
    expect(attack.towers['home'], 'home is the player\'s, still at its starting garrison (the stream stopped its growth)').toMatchObject({ owner: 'player' });
    expect(attack.towers['side']?.owner, 'the opening took side').toBe('player');
    expect(attack.toast, 'no stalemate toast so far: every unit of home → side landed').not.toBe(hint);

    // home is still selected: a tap on side unlinks (one link per L1 barracks), the next tap on mid links home → mid against mid → home
    await tap(page, towerAt(2, 'side'));
    await expect.poll(async () => playerLinks(await probe(page))).toEqual([]);
    await tap(page, towerAt(2, 'mid'));
    await expect.poll(async () => playerLinks(await probe(page))).toEqual([{ from: 'home', to: 'mid' }]);
    const placed = await probe(page);
    const counter = link(placed, 'player', 'home', 'mid')!;
    expect(link(placed, 'enemy1', 'mid', 'home'), 'the enemy still streams mid → home: the lane is contested both ways').toBeDefined();
    expect(
      counter.createdMs - ATTACK_AT_MS,
      `the counter-stream follows the attack inside the validated reaction window (${REACTION_WINDOW_MS} ms; see the constant: later placements can hit the spawn-tick clash blind spot)`,
    ).toBeLessThanOrEqual(REACTION_WINDOW_MS);
    const fireAt = counter.createdMs + HINT_MS;

    // not before 8 s of sim time since the link (sampled at ×10: 0.8 s wall)
    await setSpeed(page, 10);
    const before = await expectNoHintUntil(page, hint, fireAt, 'before 8 s');
    expect(before.time).toBeGreaterThanOrEqual(fireAt);

    // then it fires, promptly: first seen at ≥ fireAt and within a few frames of it
    await expect.poll(async () => (await probe(page)).toast, { message: 'the stalemate toast appears', timeout: 10_000, intervals: [25] }).toBe(hint);
    const seen = await probe(page);
    expect(seen.toast).toBe(hint);
    expect(seen.time, 'seen no earlier than 8 s after the link was created').toBeGreaterThanOrEqual(fireAt);
    expect(seen.time - fireAt, `seen within ${FIRE_SLACK_MS} ms of sim time after the fire tick (≥ ${MAX_SIM_MS_PER_FRAME} ms per frame)`).toBeLessThan(FIRE_SLACK_MS);
    expect(link(seen, 'player', 'home', 'mid')?.createdMs, 'the link that fired is the one placed above').toBe(counter.createdMs);

    // the toast goes away (3.2 s wall) and never comes back for this link — not while the lane is
    // still a stalemate, not after the enemy drops mid → home (≈ 36 s in the trace) and the stream
    // starts landing on mid
    await expect.poll(async () => (await probe(page)).toast, { message: 'the toast expires', timeout: 10_000, intervals: [50] }).not.toBe(hint);
    const gone = await probe(page);
    const last = await expectNoHintUntil(page, hint, gone.time + SILENT_AFTER_MS, 'after the hint');
    expect(last.screen, 'the match is still running').toBe('play');
    expect(link(last, 'player', 'home', 'mid')?.createdMs, 'same link the whole time (no re-creation, so no second window)').toBe(counter.createdMs);
    expect(last.towers['home']?.owner, 'home was never lost').toBe('player');

    expect(pageErrors).toEqual([]);
  });

  test('level 1 never shows it: a whole match of the tutorial level with a live stream, no stalemate toast at any sample', async ({ page }) => {
    const { pageErrors, hint } = await boot(page);

    // the level-1 enemy (turtle) never streams toward home (traced over 180 s, seeds 1–8), so no lane
    // is ever contested both ways there; the hint is off for level 1 regardless (StalemateWatch(false),
    // unit-tested in tests/ui/stalemate.test.ts). The e2e assertion is the whole match: from the first
    // tap to the result screen the stalemate toast is never up. The stream home → foe wins at ≈ 11 s.
    await startLevel(page, 1);
    await tap(page, towerAt(1, 'home'));
    await tap(page, towerAt(1, 'foe'));
    await expect.poll(async () => playerLinks(await probe(page))).toEqual([{ from: 'home', to: 'foe' }]);
    const placed = await probe(page);
    const createdMs = link(placed, 'player', 'home', 'foe')!.createdMs;
    await setSpeed(page, 10);
    const last = await expectNoHintUntil(page, hint, createdMs + HINT_MS + SILENT_AFTER_MS, 'level 1', (p) => p.screen !== 'play');
    expect(last.screen, 'the stream wins level 1').toBe('result');
    expect(last.time, 'the match ran past the 8 s window with the stream up').toBeGreaterThan(createdMs + HINT_MS);
    expect((await page.evaluate(() => window.__towerclash.getResult()))?.outcome).toBe('won');
    expect(await page.evaluate(() => window.__towerclash.getToast()), 'no toast on the result screen either').not.toBe(hint);

    expect(pageErrors).toEqual([]);
  });
});
