import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { Fingers } from './helpers/fingers';
import type { XY } from './helpers/fingers';
import { clientPoint } from './helpers/tap';

/*
 * QA-23: regression net for the ART-21 perspective play camera (build 13, docs/ART_DIRECTION.md §3
 * "Camera"). The camera is a plane homography of the ground: a map point (x, y) is drawn at
 * X = 360 + (x − 360)·s(y), Y = horizon + span·s(y), standing things scale by s, and a tower's hit area
 * is a screen capsule around the drawn building (base up to roof top, radius TOWER_HIT_RADIUS × max(1, s)). Input unprojects exactly and the
 * debug hooks `toClient` / `layoutToClient` project map points of the play band while not paused.
 * ART-24 (build 15): the default play view is the flat map again, with buildings / units / badges drawn
 * larger (layout.ts WORLD_ZOOM; hit radius 57, the roof capsule on the flat map too); the perspective
 * camera is the `?tilt=0.72` override, so every perspective case below boots with it.
 *
 * On both phone shapes the stakeholder's testers use — the 430 × 932 iPhone-class screen (DPR 3,
 * Dynamic Island / home-indicator insets 59 / 34, the native shell's `?dprcap=2` backing store, as in
 * e2e/gestures430.spec.ts) and a small 360 × 640 Android (DPR 2.75, no insets) — this file checks:
 *   1. every tower of level 15 (spread far to near) and level 49 takes a REAL touch tap at the point
 *      `toClient(tower)` gives, and it is that tower that took it (see `provesHit`); a tap on the far
 *      tower's drawn roof takes it (the hit area is a capsule from the base up to the roof top, radius
 *      TOWER_HIT_RADIUS × max(1, s): never below the flat 44 px), one 1.25 × (roof + radius) above its
 *      base (toward the horizon sea) takes nothing;
 *      `toClient` is monotone in y, the centre column stays put, the far shore and every badge (even
 *      the tallest building's) are drawn inside the play band;
 *   2. a drag home → outpost (a far tower) under the camera links; a swipe through the stream's
 *      map-space midpoint (projected) cuts it, a swipe that stops short of it does not;
 *   3. `?tilt=0` and the default are the old letterbox mapping exactly (computed here from the
 *      viewport), and on the flat default a tap TOWER_HIT_RADIUS − 4 px beside a tower takes it, + 6
 *      px does not;
 * and on the 430 phone only:
 *   5. the walking soldiers (ART-20) really change pose between two frames 80 ms apart with the sim
 *      paused, and under `prefers-reduced-motion` hold one pose (pixel-identical).
 * (Item 4 — frame time and the ground-image build time with the camera on — is in e2e/perf.spec.ts.)
 *
 * Every touch is raw CDP touch input (e2e/helpers/fingers.ts); points are converted inside a
 * requestAnimationFrame (QA-20). The sim runs at ×0.1 during the tap sweeps so the AI barely moves in
 * the ~20 s a sweep takes (owners stay as the level file has them) — a link still lands on the next
 * tick, which every assertion polls for. Like the other specs this file imports nothing from src/:
 * the constants below mirror their source of truth.
 */

const SAVE_KEY = 'towerclash.save.v3';
const SEED = 1;
// src/render/layout.ts — ART-24 WORLD_ZOOM (towers × 1.3, badges × 1.15) and TOWER_HIT_RADIUS = round(44 × 1.3)
const ZOOM_TOWER = 1.3;
const ZOOM_BADGE = 1.15;
const TOWER_HIT_RADIUS = 57;
// src/render/camera.ts TILT_PERSPECTIVE: the perspective camera is an override since ART-24 (the default is the flat map)
const PERSPECTIVE = 'tilt=0.72';
// src/render/sprites.ts TOWER_TOP.fortress[0]: both far towers (level 15 citadel, level 49 crown) are level-1 fortresses
const FAR_ROOF = 74;
const MAP_TOP = 96;
const MAP_BOTTOM = 1180;
const MAP_W = 720;
const MAP_H = 1280;
const PAUSE_CARD = { x: 100, y: 376, w: 520, h: 690 };
// src/render/camera.ts — ISLAND_FAR_Y (terrain.ts plateau top: HUD.mapTop + 12), BADGE_MIN_SCALE (24 px numerals)
const ISLAND_FAR_Y = MAP_TOP + 12;
const BADGE_MIN_SCALE = 24 / 26;
// src/render/sprites.ts — TOWER_TOP.barracks[2] (the tallest building), badgeY = −top − 18, drawBadge height 36 × scale;
// 1.15 covers the badge pop (badgePop) when a count changes
const TALLEST_TOWER_TOP = 136;
const BADGE_ABOVE_TOP = 18;
const BADGE_HALF_H = 18 * 1.15;

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

interface Shape {
  name: string;
  viewport: { width: number; height: number };
  dpr: number;
  safe: { top: number; bottom: number };
  /** URL query of the boot (the native shell's DPR cap on the iPhone-class screen). */
  query: string;
  userAgent?: string;
}
const SHAPES: readonly Shape[] = [
  { name: '430x932 iPhone-class, DPR 3, insets 59/34, ?dprcap=2', viewport: { width: 430, height: 932 }, dpr: 3, safe: { top: 59, bottom: 34 }, query: 'dprcap=2', userAgent: IPHONE_UA },
  { name: '360x640 small Android, DPR 2.75, no insets', viewport: { width: 360, height: 640 }, dpr: 2.75, safe: { top: 0, bottom: 0 }, query: '' },
];

interface LevelJson {
  id: number;
  towers: { id: string; x: number; y: number; owner: string }[];
}
const level = (file: string) => JSON.parse(readFileSync(new URL(`../src/levels/${file}.json`, import.meta.url), 'utf8')) as LevelJson;
const LEVELS = { 15: level('015-the-citadel'), 49: level('049-last-light') } as const;
type LevelId = keyof typeof LEVELS;
/** The far tower of each level (smallest map y) and an own tower to select before tapping near it. */
const FAR = { 15: { id: 'citadel', selector: 'bastion' }, 49: { id: 'crown', selector: 'lamp' } } as const;

function towerAt(levelId: LevelId, id: string): XY {
  const t = LEVELS[levelId].towers.find((tw) => tw.id === id);
  if (!t) throw new Error(`level ${levelId} has no tower "${id}"`);
  return { x: t.x, y: t.y };
}

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const drag = (page: Page) => page.evaluate(() => window.__towerclash.getDrag());
const playerLinks = (page: Page) =>
  page.evaluate(() =>
    (window.__towerclash.getState()?.links ?? [])
      .filter((l) => l.owner === 'player')
      .map((l) => ({ from: l.from, to: l.to }))
      .sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to)),
  );
/** Every refusal bubble the page showed (`getLimitHint`), recorded page-side: a bubble lives 900 ms of wall clock. */
const limitHintsSeen = (page: Page) => page.evaluate(() => (window as unknown as { __limitHints?: string[] }).__limitHints?.slice() ?? []);
/** Owners now and the lanes (rules v3: a lane exists iff the two towers see each other; static per level). */
const world = (page: Page) =>
  page.evaluate(() => {
    const st = window.__towerclash.getState();
    if (!st) throw new Error('no level running');
    const owners: Record<string, string> = {};
    for (const t of Object.values(st.towers)) owners[t.id] = t.owner;
    return { owners, lanes: Object.values(st.roads).map((r) => [r.a, r.b] as const) };
  });
/** Wait (on the sim clock, not the wall clock) until `ticks` more sim ticks have run. */
async function ticksPass(page: Page, ticks: number): Promise<void> {
  const t0 = await simTime(page);
  await expect.poll(() => simTime(page), { message: `${ticks} sim ticks` }).toBeGreaterThanOrEqual(t0 + ticks * 50);
}

/** Seed the save, simulate the insets, record refusal bubbles, boot to the title (as gestures430.spec.ts). */
async function boot(page: Page, shape: Shape, extraQuery = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.addInitScript(
    ([key, inset]) => {
      // levels 1–3 cleared: no tutorial anywhere
      localStorage.setItem(key, JSON.stringify({ version: 3, gold: 0, stars: { '1': 3, '2': 3, '3': 3 } }));
      const apply = (): boolean => {
        const app = document.getElementById('app');
        if (!app) return false;
        app.style.setProperty('--safe-top', `${inset.top}px`);
        app.style.setProperty('--safe-bottom', `${inset.bottom}px`);
        return true;
      };
      if (!apply()) {
        new MutationObserver((_, obs) => {
          if (apply()) obs.disconnect();
        }).observe(document, { childList: true, subtree: true });
      }
      const seen: string[] = [];
      (window as unknown as { __limitHints: string[] }).__limitHints = seen;
      let prev: string | null = null;
      setInterval(() => {
        const h = (window as { __towerclash?: { getLimitHint?: () => string | null } }).__towerclash?.getLimitHint?.() ?? null;
        if (h !== null && h !== prev) seen.push(h);
        prev = h;
      }, 16);
    },
    [SAVE_KEY, shape.safe] as const,
  );
  const query = [shape.query, extraQuery].filter(Boolean).join('&');
  await page.goto(query ? `/?${query}` : '/');
  await page.waitForFunction(() => typeof window.__towerclash?.getDrag === 'function');
  await expect.poll(() => screen(page)).toBe('title');
  expect(await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio }))).toEqual({ w: shape.viewport.width, h: shape.viewport.height, dpr: shape.dpr });
  return errors;
}

async function startLevel(page: Page, id: number, speed?: number): Promise<void> {
  expect(await page.evaluate(([lid, seed]) => window.__towerclash.loadLevel(lid, seed), [id, SEED] as const), `loadLevel(${id})`).toBe(true);
  await expect.poll(() => screen(page)).toBe('play');
  expect(await page.evaluate(() => window.__towerclash.getState()?.levelId)).toBe(id);
  if (speed !== undefined) await page.evaluate((n) => window.__towerclash.setSpeed(n), speed);
  await expect.poll(() => simTime(page), { message: `level ${id} sim should tick` }).toBeGreaterThan(0);
}

/** The letterbox (the pre-camera mapping): the 720×1280 map fitted into the viewport minus the safe insets, centred. */
function letterbox(shape: Shape, x: number, y: number): XY {
  const usableW = shape.viewport.width;
  const usableH = shape.viewport.height - shape.safe.top - shape.safe.bottom;
  const scale = Math.min(usableW / MAP_W, usableH / MAP_H);
  return { x: (usableW - MAP_W * scale) / 2 + x * scale, y: shape.safe.top + (usableH - MAP_H * scale) / 2 + y * scale };
}

/**
 * Where map point `p` is drawn and how big things are there, read from the running page after a
 * painted frame: client point, CSS px per logical px (`v`, the letterbox scale — a HUD-band point is
 * never projected) and the depth scale s (the client x-scale at that depth over v).
 */
async function drawnAt(page: Page, p: XY): Promise<{ c: XY; v: number; s: number }> {
  return page.evaluate(
    ([x, y]) =>
      new Promise<{ c: XY; v: number; s: number }>((resolve) =>
        requestAnimationFrame(() => {
          const tc = window.__towerclash;
          const v = (tc.layoutToClient(100, 50).x - tc.layoutToClient(0, 50).x) / 100;
          const s = (tc.toClient(x + 10, y).x - tc.toClient(x - 10, y).x) / 20 / v;
          resolve({ c: tc.toClient(x, y), v, s });
        }),
      ),
    [p.x, p.y] as const,
  );
}

/**
 * Tap tower `id` at `toClient(tower)` and prove that tower took the tap. Only an own tower can be
 * selected (pointer.ts PlayGestures.up), so the proof is the link the gesture rules make:
 *   - own tower T: tap T (selects it), tap a lane neighbour U → the link T → U appears (from = T);
 *   - foreign tower T: tap an own tower H with a lane to T, tap T → H → T appears (to = T);
 *   - foreign tower with no own tower seeing it (level 15's citadel): select an own tower H that sees
 *     every other tower, tap T → the "no clear lane" refusal (`hint.blocked`) and no link: T is the
 *     only tower H has no lane to, so only a hit on T can refuse.
 * Each proof is undone (a second tap on the target stops the stream, a tap on the selection
 * deselects it) so the next one starts from no selection and no player stream.
 */
async function provesHit(page: Page, f: Fingers, levelId: LevelId, id: string, blocked: string): Promise<string> {
  const { owners, lanes } = await world(page);
  const sees = (a: string, b: string) => lanes.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  const own = Object.keys(owners).filter((t) => owners[t] === 'player');
  const at = (t: string) => towerAt(levelId, t);
  expect(await playerLinks(page), 'each proof starts with no player stream').toEqual([]);

  const linkAndUndo = async (first: string, from: string, to: string, why: string): Promise<void> => {
    await f.tap(at(first));
    await f.tap(at(to));
    await expect.poll(() => playerLinks(page), { message: why }).toEqual([{ from, to }]);
    await f.tap(at(to)); // the selection is still `from`: a second tap on the target stops the stream
    await expect.poll(() => playerLinks(page), { message: `${why}: undone` }).toEqual([]);
    await f.tap(at(from)); // deselect
  };

  if (owners[id] === 'player') {
    const u = Object.keys(owners).find((t) => t !== id && owners[t] !== 'player' && sees(id, t)) ?? Object.keys(owners).find((t) => t !== id && sees(id, t));
    if (!u) throw new Error(`level ${levelId}: own tower ${id} sees nothing`);
    await linkAndUndo(id, id, u, `tap ${id} then ${u}: the stream starts at ${id} (${id} took the first tap)`);
    return `own: ${id} → ${u}`;
  }
  const h = own.find((o) => sees(o, id));
  if (h) {
    await f.tap(at(h));
    await f.tap(at(id));
    await expect.poll(() => playerLinks(page), { message: `tap ${h} then ${id}: the stream ends at ${id} (${id} took the tap)` }).toEqual([{ from: h, to: id }]);
    await f.tap(at(id));
    await expect.poll(() => playerLinks(page), { message: `${h} → ${id} undone` }).toEqual([]);
    await f.tap(at(h));
    return `foreign: ${h} → ${id}`;
  }
  const blind = own.find((o) => Object.keys(owners).filter((t) => t !== o && !sees(o, t)).join() === id);
  if (!blind) throw new Error(`level ${levelId}: no own tower proves a hit on ${id} (none sees it, none sees all but it)`);
  const before = (await limitHintsSeen(page)).length;
  await f.tap(at(blind));
  await f.tap(at(id));
  await expect.poll(async () => (await limitHintsSeen(page)).slice(before), { message: `tap ${blind} then ${id}: refused as blocked — ${id} is the only tower ${blind} has no lane to` }).toEqual([blocked]);
  await f.tap(at(blind));
  await ticksPass(page, 2);
  expect(await playerLinks(page), `a refused tap on ${id} links nothing`).toEqual([]);
  return `blocked: ${blind} ✗ ${id}`;
}

for (const shape of SHAPES) {
  test.describe(`perspective camera (ART-21) on ${shape.name} (QA-23)`, () => {
    test.use({ viewport: shape.viewport, deviceScaleFactor: shape.dpr, isMobile: true, hasTouch: true, ...(shape.userAgent ? { userAgent: shape.userAgent } : {}) });

    test('toClient is monotone down the band, keeps the centre column, puts the far shore and every badge inside the play band (levels 15, 49)', async ({ page }) => {
      const errors = await boot(page, shape, PERSPECTIVE);
      for (const id of [15, 49] as const) {
        await startLevel(page, id);
        const geo = await page.evaluate(
          ([top, bottom]) =>
            new Promise<{ ys: number[]; xs: number[]; edgeYs: number[]; bandTop: number; bandBottom: number }>((resolve) =>
              requestAnimationFrame(() => {
                const tc = window.__towerclash;
                const ys: number[] = [];
                const xs: number[] = [];
                const edgeYs: number[] = [];
                for (let y = top; y <= bottom; y += 4) {
                  const c = tc.toClient(360, y);
                  ys.push(c.y);
                  xs.push(c.x);
                  edgeYs.push(tc.toClient(40, y).y);
                }
                // the play band as drawn: under the (safe-edge anchored) top HUD band, above the bottom one
                resolve({ ys, xs, edgeYs, bandTop: tc.hudToClient(360, top - 1e-6).y, bandBottom: tc.hudToClient(360, bottom).y });
              }),
            ),
          [MAP_TOP, MAP_BOTTOM] as const,
        );
        for (let i = 1; i < geo.ys.length; i++) {
          expect(geo.ys[i]!, `level ${id}: toClient y strictly increases with map y (sample ${i})`).toBeGreaterThan(geo.ys[i - 1]!);
          expect(geo.edgeYs[i]!, 'and the same at the left edge (rows are rows)').toBeCloseTo(geo.ys[i]!, 6);
          expect(geo.xs[i]!, 'the centre column does not move').toBeCloseTo(geo.xs[0]!, 6);
        }
        const far = await drawnAt(page, { x: 360, y: ISLAND_FAR_Y });
        expect(far.c.y, `level ${id}: the far shore is drawn inside the play band`).toBeGreaterThan(geo.bandTop);
        const near = await drawnAt(page, { x: 360, y: MAP_BOTTOM });
        expect(near.s, 'the near edge keeps the flat scale').toBeCloseTo(1, 3);
        expect(far.s, 'the camera is on: the far shore is drawn smaller').toBeLessThan(0.8);
        for (const t of LEVELS[id].towers) {
          const d = await drawnAt(page, t);
          // the tallest building's badge centre is (TOWER_TOP × 1.3 + 18 × 1.15) × s above the base (ART-24 zoom, draw.ts
          // badgeLift), its half height 18 × max(s × 1.15, BADGE_MIN_SCALE)
          const badgeTop = d.c.y - ((TALLEST_TOWER_TOP * ZOOM_TOWER + BADGE_ABOVE_TOP * ZOOM_BADGE) * d.s + BADGE_HALF_H * Math.max(d.s * ZOOM_BADGE, BADGE_MIN_SCALE)) * d.v;
          expect(badgeTop, `level ${id} ${t.id}: even a level-3 barracks' badge would sit under the top HUD band`).toBeGreaterThan(geo.bandTop);
          expect(d.c.y, `level ${id} ${t.id}: base above the bottom band`).toBeLessThan(geo.bandBottom);
        }
      }
      expect(errors).toEqual([]);
    });

    for (const id of [15, 49] as const) {
      test(`level ${id}: every tower takes a real touch tap at toClient(tower), and it is that tower that takes it`, async ({ page }) => {
        test.setTimeout(120_000);
        const errors = await boot(page, shape, PERSPECTIVE);
        await startLevel(page, id, 0.1);
        const blocked = await page.evaluate(() => window.__towerclash.getText('hint.blocked'));
        const f = new Fingers(page, await page.context().newCDPSession(page));
        const proofs: string[] = [];
        // far to near
        for (const t of [...LEVELS[id].towers].sort((a, b) => a.y - b.y)) proofs.push(await provesHit(page, f, id, t.id, blocked));
        test.info().annotations.push({ type: 'hits', description: `level ${id}: ${proofs.join('; ')}` });
        expect(proofs).toHaveLength(LEVELS[id].towers.length);
        expect(errors).toEqual([]);
      });
    }

    test("a tap on the far tower's drawn roof takes it; one 1.25 × (roof height + hit radius) above its base (toward the sea) takes nothing (levels 15, 49)", async ({ page }) => {
      test.setTimeout(120_000);
      const errors = await boot(page, shape, PERSPECTIVE);
      const blocked = await page.evaluate(() => window.__towerclash.getText('hint.blocked'));
      for (const id of [15, 49] as const) {
        await startLevel(page, id, 0.1);
        const f = new Fingers(page, await page.context().newCDPSession(page));
        const far = FAR[id];
        const farAt = towerAt(id, far.id);
        expect(Math.min(...LEVELS[id].towers.map((t) => t.y)), `${far.id} is level ${id}'s far tower`).toBe(farAt.y);
        const { owners, lanes } = await world(page);
        const sees = (a: string, b: string) => lanes.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
        expect(owners[far.selector]).toBe('player');
        expect(owners[far.id]).not.toBe('player');
        const d = await drawnAt(page, farAt);
        expect(d.s, `the far tower is drawn at depth < 0.8 (s = ${d.s.toFixed(3)})`).toBeLessThan(0.8);
        // BUG-40 follow-up (pointer.ts hitTower): the hit area is a capsule around the drawn building, from its base
        // up to its roof top (towerTop × s), of radius TOWER_HIT_RADIUS × max(1, s) — never below the flat 44 px
        const roof = FAR_ROOF * ZOOM_TOWER * d.s * d.v; // client px, base → roof top of the zoomed building (ART-24)
        const r = TOWER_HIT_RADIUS * Math.max(1, d.s) * d.v; // client px
        const onRoof: XY = { x: d.c.x, y: d.c.y - 0.85 * roof };
        const overRoof: XY = { x: d.c.x, y: d.c.y - 1.25 * (roof + r) };

        // on the drawn roof (0.85 × its height above the base, far outside the base circle): the far tower takes the tap
        expect(0.85 * roof, 'the roof tap is outside the old base circle').toBeGreaterThan(TOWER_HIT_RADIUS * d.s * d.v);
        const before = (await limitHintsSeen(page)).length;
        await f.tap(towerAt(id, far.selector));
        await f.tapClient(onRoof);
        if (sees(far.selector, far.id)) {
          await expect.poll(() => playerLinks(page), { message: `a tap on ${far.id}'s roof: ${far.selector} → ${far.id}` }).toEqual([{ from: far.selector, to: far.id }]);
          await f.tap(farAt);
          await expect.poll(() => playerLinks(page)).toEqual([]);
        } else {
          await expect.poll(async () => (await limitHintsSeen(page)).slice(before), { message: `a tap on ${far.id}'s roof: refused as blocked (a hit on ${far.id})` }).toEqual([blocked]);
        }
        await f.tap(towerAt(id, far.selector)); // deselect

        // 1.25 × (roof + r) above the base (still on the world band, under the top HUD band): nothing takes it — the selection
        // drops (a tap on empty ground) and nothing is refused or linked.
        // Proven positively: the next own tower tapped is selected afresh and streams to its neighbour.
        const hintsBefore = (await limitHintsSeen(page)).length;
        await f.tap(towerAt(id, far.selector));
        await f.tapClient(overRoof);
        const other = Object.keys(owners).find((t) => t !== far.selector && owners[t] === 'player')!;
        const u = Object.keys(owners).find((t) => owners[t] !== 'player' && sees(other, t))!;
        await f.tap(towerAt(id, other));
        await f.tap(towerAt(id, u));
        await expect
          .poll(() => playerLinks(page), { message: `1.25 × (roof + r) above ${far.id} hit nothing: ${far.selector} was deselected, so ${other} got selected and streams to ${u}` })
          .toEqual([{ from: other, to: u }]);
        expect((await limitHintsSeen(page)).slice(hintsBefore), 'the tap over the roof refused nothing (it hit no tower)').toEqual([]);
        await f.tap(towerAt(id, u));
        await expect.poll(() => playerLinks(page)).toEqual([]);
        await f.tap(towerAt(id, other));
      }
      expect(errors).toEqual([]);
    });

    test("drag home → outpost (far) links under the camera; a swipe through the stream's projected midpoint cuts it, one that stops short does not (level 15)", async ({ page }) => {
      const errors = await boot(page, shape, PERSPECTIVE);
      await startLevel(page, 15);
      const f = new Fingers(page, await page.context().newCDPSession(page));
      const home = towerAt(15, 'home');
      const outpost = towerAt(15, 'outpost');

      await f.start(home);
      await f.slide(home, outpost, 10);
      await expect.poll(() => drag(page), { message: 'over the outpost the band snaps onto it' }).toMatchObject({ fromId: 'home', hoverTowerId: 'outpost' });
      await f.end();
      await expect.poll(() => playerLinks(page), { message: 'release on the outpost opens home → outpost' }).toEqual([{ from: 'home', to: 'outpost' }]);

      // the stream's midpoint in map space, and the lane's unit normal
      const mid = { x: (home.x + outpost.x) / 2, y: (home.y + outpost.y) / 2 };
      const len = Math.hypot(outpost.x - home.x, outpost.y - home.y);
      const n = { x: -(outpost.y - home.y) / len, y: (outpost.x - home.x) / len };
      const along = (k: number): XY => ({ x: mid.x + n.x * k, y: mid.y + n.y * k });
      // end to end through the page: the projected midpoint lies on the drawn chord (a homography keeps lines
      // straight) but not at its middle (the projection is not affine) — the swipe below needs the real camera
      const [cHome, cOut, cMid] = await Promise.all([home, outpost, mid].map((p) => clientPoint(page, p.x, p.y)));
      const cross = (cOut!.x - cHome!.x) * (cMid!.y - cHome!.y) - (cOut!.y - cHome!.y) * (cMid!.x - cHome!.x);
      expect(Math.abs(cross) / Math.hypot(cOut!.x - cHome!.x, cOut!.y - cHome!.y), 'the projected midpoint is on the drawn lane (px)').toBeLessThan(0.5);
      expect(Math.hypot(cMid!.x - (cHome!.x + cOut!.x) / 2, cMid!.y - (cHome!.y + cOut!.y) / 2), 'and away from the chord middle (px)').toBeGreaterThan(5);

      // a swipe from the east side that stops 30 map px short of the stream: nothing is cut. (ART-24: the west side
      // 120 px out is on the bastion's roof capsule now — a press there is a drag from an own tower, not a swipe;
      // the east start may touch the neutral east tower's capsule, and a press on a neutral tower is still a swipe.)
      await f.start(along(150));
      await f.slide(along(150), along(30), 6);
      await f.end();
      await ticksPass(page, 3);
      expect(await playerLinks(page), 'a swipe that stops short cuts nothing').toEqual([{ from: 'home', to: 'outpost' }]);
      // through the midpoint: cut
      await f.start(along(150));
      await f.slide(along(150), along(-120), 8);
      await f.end();
      await expect.poll(() => playerLinks(page), { message: 'the swipe across the projected midpoint cuts home → outpost' }).toEqual([]);
      expect(await screen(page)).toBe('play');
      expect(errors).toEqual([]);
    });

    test('?tilt=0 and the default (ART-24) are the old flat map: toClient is the letterbox of the viewport (three points); ?tilt=0.72 is not', async ({ page }) => {
      const pts: XY[] = [
        { x: 360, y: ISLAND_FAR_Y },
        { x: 100, y: 640 },
        { x: 650, y: 1170 },
      ];
      for (const q of ['tilt=0', '']) {
        const errors = await boot(page, shape, q);
        await startLevel(page, 15);
        for (const p of pts) {
          const c = await clientPoint(page, p.x, p.y);
          const e = letterbox(shape, p.x, p.y);
          expect(c.x, `${q || 'default'} (${p.x}, ${p.y}) x`).toBeCloseTo(e.x, 6);
          expect(c.y, `${q || 'default'} (${p.x}, ${p.y}) y`).toBeCloseTo(e.y, 6);
        }
        expect(errors).toEqual([]);
      }

      // control: the same far point under the perspective override moves well off the letterbox
      const errors2 = await boot(page, shape, PERSPECTIVE);
      await startLevel(page, 15);
      const c = await clientPoint(page, 360, ISLAND_FAR_Y);
      const e = letterbox(shape, 360, ISLAND_FAR_Y);
      expect(c.y - e.y, '?tilt=0.72: the far shore is drawn lower than on the flat map (CSS px)').toBeGreaterThan(20);
      expect(errors2).toEqual([]);
    });
  });

  test.describe(`flat default with the ART-24 zoom on ${shape.name}`, () => {
    test.use({ viewport: shape.viewport, deviceScaleFactor: shape.dpr, isMobile: true, hasTouch: true, ...(shape.userAgent ? { userAgent: shape.userAgent } : {}) });

    test('a tap TOWER_HIT_RADIUS − 4 px beside a tower takes it, + 6 px takes nothing (level 15 citadel)', async ({ page }) => {
      test.setTimeout(90_000);
      const errors = await boot(page, shape);
      const blocked = await page.evaluate(() => window.__towerclash.getText('hint.blocked'));
      await startLevel(page, 15, 0.1);
      const f = new Fingers(page, await page.context().newCDPSession(page));
      const far = FAR[15];
      const farAt = towerAt(15, far.id);
      const { owners, lanes } = await world(page);
      const sees = (a: string, b: string) => lanes.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
      const d = await drawnAt(page, farAt);
      expect(d.s, 'the default camera is flat').toBeCloseTo(1, 6);
      const r = TOWER_HIT_RADIUS * d.v; // client px

      // r − 4 px right of the base: the citadel takes the tap
      const before = (await limitHintsSeen(page)).length;
      await f.tap(towerAt(15, far.selector));
      await f.tapClient({ x: d.c.x + r - 4, y: d.c.y });
      if (sees(far.selector, far.id)) {
        await expect.poll(() => playerLinks(page), { message: `r − 4 beside ${far.id}: ${far.selector} → ${far.id}` }).toEqual([{ from: far.selector, to: far.id }]);
        await f.tap(farAt);
        await expect.poll(() => playerLinks(page)).toEqual([]);
      } else {
        await expect.poll(async () => (await limitHintsSeen(page)).slice(before), { message: `r − 4 beside ${far.id}: refused as blocked (a hit on ${far.id})` }).toEqual([blocked]);
      }
      await f.tap(towerAt(15, far.selector)); // deselect

      // r + 6 px right of the base: nothing takes it — the selection drops; proven by the next own tower being selected afresh
      const hintsBefore = (await limitHintsSeen(page)).length;
      await f.tap(towerAt(15, far.selector));
      await f.tapClient({ x: d.c.x + r + 6, y: d.c.y });
      const other = Object.keys(owners).find((t) => t !== far.selector && owners[t] === 'player')!;
      const u = Object.keys(owners).find((t) => owners[t] !== 'player' && sees(other, t))!;
      await f.tap(towerAt(15, other));
      await f.tap(towerAt(15, u));
      await expect.poll(() => playerLinks(page), { message: `r + 6 beside ${far.id} hit nothing, so ${other} got selected and streams to ${u}` }).toEqual([{ from: other, to: u }]);
      expect((await limitHintsSeen(page)).slice(hintsBefore), 'the r + 6 tap refused nothing').toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

/*
 * ART-20 walking soldiers × ART-21: a marching soldier's legs swing on a 6.5 Hz stride driven by the
 * frame clock (`stridePhase(id, nowMs)`), not by the sim. With the sim paused (the soldier stands
 * still) two frames 80 ms apart (≈ half a stride) must show a different pose in a small box around
 * him, while an empty patch of ground next to him stays the same; under `prefers-reduced-motion` the
 * soldier holds one mid-stride pose and the box is pixel-identical.
 */
const PHONE = SHAPES[0]!;
// src/render/layout.ts SOLDIER_DRAW_SCALE: a soldier is ≈ 8 × 18 CSS px on the 430 phone ≈ 13 × 30 logical; the box
// (logical px around his feet) holds him with margin, the dust puff behind him included
const SOLDIER_BOX = { left: -18, right: 18, top: -44, bottom: 10 };
/** Empty ground between level 49's lamp (150, 1100) and keep (360, 1170): the control patch (map). */
const CONTROL_GROUND = { x: 255, y: 1128 };

interface BoxDiff {
  /** Device px whose colour changed by more than PIXEL_DELTA in some channel between the two frames. */
  soldier: number;
  control: number;
  /** Ink-dark device px (luma < 90) in each box on the first frame: the soldier's outline / eyes are in his box. */
  soldierDark: number;
  controlDark: number;
  /** Wall-clock ms between the two frames read. */
  gapMs: number;
}
const PIXEL_DELTA = 32;

/**
 * Link keep → e on level 49 (×0.25), stop the stream once soldiers are out (no ribbon or chevrons over
 * them; the soldiers already out keep walking), then — inside one requestAnimationFrame callback, so
 * no frame runs in between — find a lone soldier drawn below the pause card, read where he and the
 * control patch are drawn, and pause the game ('p'). Returns their client points.
 */
async function soldierPaused(page: Page): Promise<{ soldier: XY; control: XY }> {
  await startLevel(page, 49, 0.25);
  const f = new Fingers(page, await page.context().newCDPSession(page));
  await f.tap(towerAt(49, 'keep'));
  await f.tap(towerAt(49, 'e'));
  await expect.poll(() => playerLinks(page)).toEqual([{ from: 'keep', to: 'e' }]);
  await expect
    .poll(() => page.evaluate(() => (window.__towerclash.getState()?.units ?? []).filter((u) => u.owner === 'player' && u.from === 'keep').length), {
      message: 'soldiers march out of the keep',
    })
    .toBeGreaterThanOrEqual(2);
  await f.tap(towerAt(49, 'e')); // stop the stream
  await expect.poll(() => playerLinks(page)).toEqual([]);
  const lowest = PAUSE_CARD.y + PAUSE_CARD.h - SOLDIER_BOX.top + 4; // the whole box below the card (screen logical)
  const handle = await page.waitForFunction(
    ([minY, control]) => {
      const tc = window.__towerclash;
      const st = tc.getState();
      if (!st) return null;
      const o = tc.layoutToClient(0, 50);
      const v = (tc.layoutToClient(100, 50).x - o.x) / 100;
      for (const u of st.units) {
        if (u.owner !== 'player' || u.from !== 'keep' || u.progress < 0.2) continue;
        const road = st.roads[u.roadId]!;
        const [a, b] = road.a === u.from ? [road.points[0]!, road.points[1]!] : [road.points[1]!, road.points[0]!];
        const m = { x: a.x + (b.x - a.x) * u.progress, y: a.y + (b.y - a.y) * u.progress };
        const c = tc.toClient(m.x, m.y);
        if (50 + (c.y - o.y) / v < minY) continue;
        const crowded = st.units.some((w) => w !== u && w.roadId === u.roadId && Math.abs(w.progress - u.progress) * road.length < 40);
        if (crowded) continue;
        const k = tc.toClient(control.x, control.y);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' })); // pause in this very task
        return { soldier: c, control: k };
      }
      return null;
    },
    [lowest, CONTROL_GROUND] as const,
    { polling: 'raf', timeout: 20_000 },
  );
  const at = (await handle.jsonValue()) as { soldier: XY; control: XY };
  // paused: the hooks pass map points through untouched (fromLayout), the sim clock stands
  const t0 = await simTime(page);
  await expect.poll(() => clientPoint(page, 360, ISLAND_FAR_Y), { message: 'paused: toClient no longer projects' }).toEqual(letterbox(PHONE, 360, ISLAND_FAR_Y));
  expect(await simTime(page), 'paused: the sim does not tick').toBe(t0);
  return at;
}

/** Compare the soldier box and the control box on two painted frames at least 80 ms apart (device px of the game canvas). */
function boxDiff(page: Page, at: { soldier: XY; control: XY }): Promise<BoxDiff> {
  return page.evaluate(
    ([soldier, control, box, delta]) =>
      new Promise<BoxDiff>((resolve) => {
        const canvas = document.getElementById('game') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d')!;
        const r = canvas.getBoundingClientRect();
        const tc = window.__towerclash;
        const v = (tc.layoutToClient(100, 50).x - tc.layoutToClient(0, 50).x) / 100;
        const fx = canvas.width / r.width;
        const grab = (p: { x: number; y: number }) => {
          const x0 = Math.round((p.x + box.left * v - r.left) * fx);
          const y0 = Math.round((p.y + box.top * v - r.top) * fx);
          const w = Math.round((box.right - box.left) * v * fx);
          const h = Math.round((box.bottom - box.top) * v * fx);
          return ctx.getImageData(x0, y0, w, h).data;
        };
        const changed = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
          let n = 0;
          for (let i = 0; i < a.length; i += 4) {
            if (Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!)) > delta) n++;
          }
          return n;
        };
        const dark = (a: Uint8ClampedArray) => {
          let n = 0;
          for (let i = 0; i < a.length; i += 4) if (0.299 * a[i]! + 0.587 * a[i + 1]! + 0.114 * a[i + 2]! < 90) n++;
          return n;
        };
        requestAnimationFrame((t1) => {
          const s1 = grab(soldier);
          const c1 = grab(control);
          const next = (t: number): void => {
            if (t - t1 < 80) {
              requestAnimationFrame(next);
              return;
            }
            const s2 = grab(soldier);
            const c2 = grab(control);
            resolve({ soldier: changed(s1, s2), control: changed(c1, c2), soldierDark: dark(s1), controlDark: dark(c1), gapMs: t - t1 });
          };
          requestAnimationFrame(next);
        });
      }),
    [at.soldier, at.control, SOLDIER_BOX, PIXEL_DELTA] as const,
  );
}

test.describe(`walking soldiers under the camera on ${PHONE.name} (QA-23, ART-20)`, () => {
  test.use({ viewport: PHONE.viewport, deviceScaleFactor: PHONE.dpr, isMobile: true, hasTouch: true, userAgent: PHONE.userAgent });

  test('with the sim paused a marching soldier changes pose between two frames 80 ms apart; the ground next to him does not', async ({ page }) => {
    const errors = await boot(page, PHONE, PERSPECTIVE);
    const at = await soldierPaused(page);
    const d = await boxDiff(page, at);
    test.info().annotations.push({ type: 'stride', description: JSON.stringify(d) });
    expect(d.soldierDark, 'the soldier (ink outline, eyes) is in his box').toBeGreaterThan(d.controlDark + 20);
    expect(d.gapMs).toBeGreaterThanOrEqual(80);
    expect(d.soldier, 'his legs / bob / spear moved between the frames').toBeGreaterThanOrEqual(40);
    expect(d.control, 'the empty ground next to him did not change').toBeLessThanOrEqual(4);
    expect(errors).toEqual([]);
  });

  test.describe('prefers-reduced-motion', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('with the sim paused the soldier holds one pose: the box is pixel-identical 80 ms later', async ({ page }) => {
      const errors = await boot(page, PHONE, PERSPECTIVE);
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
      const at = await soldierPaused(page);
      const d = await boxDiff(page, at);
      test.info().annotations.push({ type: 'stride', description: JSON.stringify(d) });
      expect(d.soldierDark, 'the soldier is in his box').toBeGreaterThan(d.controlDark + 20);
      expect(d.gapMs).toBeGreaterThanOrEqual(80);
      expect(d.soldier, 'reduced motion: no stride, the soldier box is identical').toBe(0);
      expect(d.control).toBe(0);
      expect(errors).toEqual([]);
    });
  });
});
