import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import type { Rect } from '../../src/render/widgets';
import { getPalette } from '../../src/render/palette';
import { SETTINGS, settingsAboutLayout } from '../../src/render/menuLayout';
import { DIAG_ABOUT, withDiagnostics } from '../../src/render/menusSettings';
import { createAdSession } from '../../src/economy/adsFlow';
import { CRYSTAL_SERVICES } from '../../src/economy/catalog';
import type { SaveData, SaveStorage } from '../../src/ui/save';
import { SAVE_KEY, defaultSave, normalizeSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { appVersion } from '../../src/ui/screens';
import type { ResultInfo } from '../../src/ui/result';
import { ResultScreen } from '../../src/ui/result';
import '../registerResult'; // PERF-11: the lazy result chunk is in (the play screen books the row through it)
import { PlayScreen } from '../../src/ui/play';
import { SettingsScreen } from '../../src/ui/settings';
import type { DiagEvent, DiagRow } from '../../src/ui/diagnostics';
import { DIAG_CAP, DIAG_COLUMNS, DIAG_COLUMNS_V1_0, DIAG_KEY, clearDiag, diagRows, diagText, isoMinute, logLevelEnd, parseDiagText, recordDiag, resetDiag } from '../../src/ui/diagnostics';
import { en } from '../../src/ui/locales/en';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { makeLevel } from '../helpers';

/*
 * AUD-B6: the opt-in on-device diagnostics log (src/ui/diagnostics.ts). Off by default and then it
 * writes nothing; on, every booked result (win / loss / retreat, and a bought skip) appends one
 * `level_end` row under `towerclash.diag.v1` — never inside the save — capped at the newest 400;
 * CLEAR LOG empties it, RESET PROGRESS wipes it with its attempt counters; COPY LOG's text round-trips.
 */

const memory = (): SaveStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

function fakeApp(save: SaveData) {
  let current: Screen | null = null;
  const app: App = {
    view: { scale: 0.5 } as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel: () => Promise.resolve(true),
    go(s: Screen) {
      current = s;
    },
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-11-01',
    weekKey: () => '2026-10-26',
  };
  return { app, current: () => current };
}

/** The result chunk's `.then` (the row is booked in a microtask after the outcome). */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Play level `id` to `outcome` on the next tick (every tower handed to the winner). */
async function playTo(save: SaveData, id: number, outcome: 'won' | 'lost' | 'retreat', boosters = 0): Promise<PlayScreen> {
  const shell = fakeApp(save);
  const play = new PlayScreen(shell.app, makeLevel({ id }), 1, 1);
  shell.app.go(play);
  play.startMatch();
  play.update(50, 100); // a tick of sim time
  for (let i = 0; i < boosters; i++) {
    save.charges.overdrive += 1;
    (play.state.boosters as unknown[]).length = 0; // one active at a time: let the next one fire
    expect(play.useBooster('overdrive')).toBe(true);
  }
  if (outcome === 'retreat') {
    (play as unknown as { stallUp: boolean }).stallUp = true;
    play.retreat();
  } else {
    for (const tw of Object.values(play.state.towers)) tw.owner = outcome === 'won' ? 'player' : 'enemy1';
    play.state.units = [];
    play.state.links = [];
  }
  play.update(50, 200);
  expect(play.over).toBe(true);
  await flush();
  return play;
}

let store: ReturnType<typeof memory>;
let save: SaveData;
beforeEach(() => {
  store = memory();
  setSaveStorageForTests(store);
  save = defaultSave();
});
afterEach(() => {
  setSaveStorageForTests(undefined);
  vi.unstubAllGlobals();
});

const ev = (over: Partial<DiagEvent> = {}): DiagEvent => ({ lvl: 1, mode: 'campaign', key: '1', outcome: 'won', timeMs: 30_000, stars: 3, first: false, continued: false, boosters: 0, ...over });

describe('off by default', () => {
  it('a fresh save has no switch; a win, a loss and a retreat write nothing (no key at all)', async () => {
    expect(save.settings.diagnostics).toBeUndefined();
    await playTo(save, 5, 'won');
    await playTo(save, 5, 'lost');
    await playTo(save, 6, 'retreat');
    expect(store.data.has(DIAG_KEY)).toBe(false);
    expect(diagRows()).toEqual([]);
    expect(recordDiag(save, ev())).toBeNull();
    expect(store.data.has(DIAG_KEY)).toBe(false);
  });

  it('settings migration: only `true` survives a load; the log is never inside the save', async () => {
    const base = { colorBlind: false, sound: true, reducedMotion: 'auto' };
    expect(normalizeSave({ settings: { ...base, diagnostics: true } }).settings.diagnostics).toBe(true);
    for (const v of [false, 'yes', 1, null, {}]) expect(normalizeSave({ settings: { ...base, diagnostics: v } }).settings.diagnostics, String(v)).toBeUndefined();
    expect(normalizeSave({}).settings.diagnostics).toBeUndefined();
    save.settings.diagnostics = true;
    await playTo(save, 5, 'won');
    const saved = store.data.get(SAVE_KEY)!;
    expect(JSON.parse(saved).settings.diagnostics).toBe(true);
    expect(saved).not.toContain('"rows"');
    expect(saved).not.toContain('"attempt"');
    expect(store.data.get(DIAG_KEY)).toBeDefined();
  });
});

describe('on: one row per booked result', () => {
  beforeEach(() => {
    save.settings.diagnostics = true;
    save.settings.textScale = 1.25;
  });

  it('a win: every field, as booked', async () => {
    const before = Date.now();
    const play = await playTo(save, 5, 'won', 1);
    const rows = diagRows();
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(Object.keys(r).sort()).toEqual([...DIAG_COLUMNS, 'replay'].sort()); // DIAG-2: + the match's replay record
    expect(r).toMatchObject({ v: 1, build: appVersion(), lvl: 5, mode: 'campaign', attempt: 1, outcome: 'won', first: true, continued: false, boosters: 1, textScale: 1.25 });
    expect(r.timeMs).toBe(play.elapsedMs());
    expect(r.timeMs).toBeGreaterThan(0);
    expect(r.stars).toBe(save.stars['5']);
    expect(r.stars).toBeGreaterThanOrEqual(1);
    expect(r.t).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/); // to the minute, no seconds
    expect([isoMinute(before), isoMinute(Date.now())]).toContain(r.t);
    // the second win of the level is attempt 2 and no first clear
    await playTo(save, 5, 'won');
    expect(diagRows()[1]).toMatchObject({ lvl: 5, attempt: 2, outcome: 'won', first: false, boosters: 0 });
  });

  it('a loss: no stars, no first clear', async () => {
    await playTo(save, 5, 'lost');
    expect(diagRows()).toEqual([expect.objectContaining({ lvl: 5, mode: 'campaign', attempt: 1, outcome: 'lost', stars: 0, first: false, continued: false })]);
    expect(diagRows()[0]!.timeMs).toBeGreaterThan(0);
  });

  it('a retreat from the stalemate card is its own outcome', async () => {
    await playTo(save, 6, 'retreat');
    expect(diagRows()).toEqual([expect.objectContaining({ lvl: 6, attempt: 1, outcome: 'retreat', stars: 0, first: false })]);
  });

  it('a level skip bought on the defeat result: `skip`, 1★, first clear, the same try as the loss', async () => {
    save.crystals = CRYSTAL_SERVICES.levelSkip.costCrystals;
    save.defeats['5'] = CRYSTAL_SERVICES.levelSkip.offerAfterDefeats - 1;
    const play = await playTo(save, 5, 'lost'); // the third defeat: the skip is offered
    const shell = fakeApp(save);
    const info = (play as unknown as { pendingResult: { info: ResultInfo } }).pendingResult.info;
    const result = new ResultScreen(shell.app, info);
    result.skipLevel();
    const rows = diagRows();
    expect(rows.map((r) => r.outcome)).toEqual(['lost', 'skip']);
    expect(rows[1]).toMatchObject({ lvl: 5, mode: 'campaign', attempt: 1, outcome: 'skip', timeMs: 0, stars: CRYSTAL_SERVICES.levelSkip.starsGranted, first: true });
  });

  it('attempt counts per level; a result after a continue belongs to its try', async () => {
    await playTo(save, 5, 'lost');
    await playTo(save, 6, 'lost');
    await playTo(save, 5, 'won');
    expect(diagRows().map((r) => [r.lvl, r.attempt])).toEqual([
      [5, 1],
      [6, 1],
      [5, 2],
    ]);
    recordDiag(save, ev({ lvl: 6, key: '6', outcome: 'lost' }));
    recordDiag(save, ev({ lvl: 6, key: '6', outcome: 'won', continued: true }));
    expect(diagRows().slice(-2).map((r) => [r.attempt, r.continued])).toEqual([
      [2, false],
      [2, true],
    ]);
  });

  it('daily and weekly: their own mode and counters (per day / week), first = the first win of it', () => {
    const base = { level: makeLevel({ id: 7 }), ui: { outcome: 'won' }, earnings: { stars: 2 }, continued: false } as unknown as ResultInfo;
    const daily = { ...base, challenge: { dayKey: '2026-11-01', levelId: 7 }, daily: { firstWin: true } } as unknown as ResultInfo;
    const weekly = { ...base, weekly: { weekKey: '2026-10-26', levelId: 7 }, weeklyOutcome: { firstWin: false } } as unknown as ResultInfo;
    const practice = { ...daily, daily: { firstWin: false, practice: true } } as unknown as ResultInfo;
    const play = { match: { timeMs: 41_000 }, boosters: 0 };
    expect(logLevelEnd(save, daily, play)).toMatchObject({ mode: 'daily', lvl: 7, attempt: 1, first: true, stars: 2, timeMs: 41_000 });
    expect(logLevelEnd(save, daily, play)).toMatchObject({ mode: 'daily', attempt: 2 });
    expect(logLevelEnd(save, weekly, play)).toMatchObject({ mode: 'weekly', lvl: 7, attempt: 1, first: false });
    expect(logLevelEnd(save, practice, play), "yesterday's map books nothing").toBeNull();
    expect(diagRows()).toHaveLength(3);
  });
});

describe('the ring, CLEAR and reset', () => {
  beforeEach(() => {
    save.settings.diagnostics = true;
  });

  it(`keeps the newest ${DIAG_CAP}`, () => {
    expect(DIAG_CAP).toBe(400);
    for (let i = 0; i < DIAG_CAP + 5; i++) recordDiag(save, ev({ timeMs: i }));
    const rows = diagRows();
    expect(rows).toHaveLength(DIAG_CAP);
    expect(rows[0]!.timeMs).toBe(5);
    expect(rows[DIAG_CAP - 1]!.timeMs).toBe(DIAG_CAP + 4);
    expect(rows[DIAG_CAP - 1]!.attempt).toBe(DIAG_CAP + 5); // the counter is not the ring
  });

  it('CLEAR LOG: no rows; the next try of a level keeps its number', () => {
    recordDiag(save, ev());
    recordDiag(save, ev());
    clearDiag();
    expect(diagRows()).toEqual([]);
    expect(recordDiag(save, ev())!.attempt).toBe(3);
  });

  it('RESET PROGRESS on the settings screen wipes the log and its counters (TF-28); the switch stays', () => {
    recordDiag(save, ev());
    const screen = new SettingsScreen(fakeApp(save).app, () => {});
    expect(screen.diagInfo.rows).toBe(1);
    const tap = (r: Rect) => {
      const p = { x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, timeMs: 0 };
      screen.down(p);
      screen.up(p);
    };
    tap(SETTINGS.reset);
    expect(screen.isConfirming).toBe(true);
    tap(SETTINGS.confirm.yes);
    expect(store.data.has(DIAG_KEY)).toBe(false);
    expect(screen.diagInfo.rows).toBe(0);
    expect(save.settings.diagnostics).toBe(true);
    expect(recordDiag(save, ev())!.attempt).toBe(1);
    resetDiag(); // idempotent
    expect(diagRows()).toEqual([]);
  });

  it('an unreadable or foreign value is an empty log (bad rows dropped), and recording goes on', () => {
    store.data.set(DIAG_KEY, '{not json');
    expect(diagRows()).toEqual([]);
    store.data.set(DIAG_KEY, JSON.stringify({ v: 1, n: { 1: 2, x: -1 }, rows: [{ v: 1, t: 'x' }, null, 'row'] }));
    expect(diagRows()).toEqual([]);
    expect(recordDiag(save, ev())!.attempt).toBe(3);
    expect(diagRows()).toHaveLength(1);
  });
});

describe('the settings screen (About card)', () => {
  const tap = (screen: SettingsScreen, r: Rect) => {
    const p = { x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, timeMs: 0 };
    screen.down(p);
    screen.up(p);
  };

  it('the switch persists only `true`; COPY LOG / CLEAR LOG appear while it is on or the log holds rows', () => {
    const screen = new SettingsScreen(fakeApp(save).app, () => {});
    expect(screen.diagInfo).toMatchObject({ on: false, rows: 0, copy: null, clear: null });
    tap(screen, screen.diagInfo.toggle);
    expect(save.settings.diagnostics).toBe(true);
    expect(JSON.parse(store.data.get(SAVE_KEY)!).settings.diagnostics).toBe(true);
    expect(screen.diagInfo.copy).not.toBeNull();
    expect(screen.diagInfo.clear).not.toBeNull();
    tap(screen, screen.diagInfo.toggle);
    expect(save.settings.diagnostics).toBeUndefined();
    expect('diagnostics' in JSON.parse(store.data.get(SAVE_KEY)!).settings).toBe(false);
    expect(screen.diagInfo.copy).toBeNull();
  });

  it('COPY LOG puts the CSV text on the clipboard; CLEAR LOG empties the log', async () => {
    save.settings.diagnostics = true;
    recordDiag(save, ev({ lvl: 3, key: '3' }));
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText }, userAgent: 'TestUA/1.0 (iPhone; like Mac)' });
    const screen = new SettingsScreen(fakeApp(save).app, () => {});
    expect(screen.diagInfo.rows).toBe(1);
    tap(screen, screen.diagInfo.copy!);
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text.split('\n')[0]).toContain('ua TestUA/1.0 (iPhone; like Mac)');
    expect(parseDiagText(text)).toEqual(diagRows());
    await flush();
    expect(screen.toast.opts(0)?.text).toBe(en['settings.logCopied']);
    tap(screen, screen.diagInfo.clear!);
    expect(diagRows()).toEqual([]);
    expect(screen.diagInfo.rows).toBe(0);
  });

  it('the block sits under the About rows with tap areas clear of COPY / PRIVACY OPTIONS above (88 layout px = 44 pt at 360 wide)', () => {
    for (const [sid, priv] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      const about = settingsAboutLayout(sid, priv);
      const d = withDiagnostics(about, true);
      expect(d.diagToggle.y).toBe(about.card.y + about.card.h - 22 + DIAG_ABOUT.toggleTop);
      const above = [about.copy, about.privacy].filter((r): r is Rect => r !== null);
      const cy = (r: Rect) => r.y + r.h / 2;
      for (const r of above) expect(cy(d.diagToggle) - cy(r), `${sid} ${priv}`).toBeGreaterThanOrEqual(88);
      expect(cy(d.diagCopy!) - cy(d.diagToggle)).toBeGreaterThanOrEqual(88);
      expect(d.diagClear!.x - (d.diagCopy!.x + d.diagCopy!.w)).toBeGreaterThan(0);
      expect(d.diagClear!.x + d.diagClear!.w).toBeLessThanOrEqual(about.card.x + about.card.w - 30);
      expect(d.card.y + d.card.h).toBe(d.diagCopy!.y + d.diagCopy!.h + 22);
      expect(withDiagnostics(about, false).diagCopy).toBeNull();
    }
  });

  it('strings in four languages', () => {
    const keys = ['settings.diagnostics', 'settings.diagnosticsSub', 'settings.diagCount', 'settings.copyLog', 'settings.clearLog', 'settings.logCopied', 'settings.logCopyFailed', 'settings.logCleared'] as const;
    expect(en['settings.diagnosticsSub']).toBe('Kept on this phone, never sent');
    for (const dict of [en, az, ru, tr] as Record<string, string>[]) for (const k of keys) expect(dict[k], k).toBeTruthy();
  });
});

describe('COPY LOG text', () => {
  const hints = { build: '1.0.0 (build 27)', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)\nX', viewport: '393x852', dpr: 3, textScale: 1.5, language: 'az' };
  const row = (over: Partial<DiagRow> = {}): DiagRow => ({ v: 1, t: '2026-11-01T10:23Z', build: '1.0.0 (build 27)', lvl: 1, mode: 'campaign', attempt: 1, outcome: 'won', timeMs: 41_250, stars: 3, first: true, continued: false, boosters: 0, textScale: 1, ...over });

  it('one hints line, the column line, one CSV row per event; round-trips (quoted fields too)', () => {
    const rows = [row({ speed: 1 }), row({ lvl: 12, mode: 'daily', attempt: 4, outcome: 'retreat', stars: 0, first: false, continued: true, boosters: 2, textScale: 1.25, speed: 2 }), row({ build: 'odd, "build"', outcome: 'skip', timeMs: 0 })];
    const text = diagText(rows, hints);
    const lines = text.split('\n');
    expect(lines).toHaveLength(2 + rows.length);
    expect(lines[0]).toBe('# Tower Clash diagnostics v1 | build 1.0.0 (build 27) | ua Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) X | viewport 393x852 | dpr 3 | text 150% | lang az | events 3');
    expect(lines[1]).toBe('v,t,build,lvl,mode,attempt,outcome,timeMs,stars,first,continued,boosters,textScale,speed');
    expect(lines[2]).toBe('1,2026-11-01T10:23Z,1.0.0 (build 27),1,campaign,1,won,41250,3,1,0,0,1,1');
    expect(lines[3]).toBe('1,2026-11-01T10:23Z,1.0.0 (build 27),12,daily,4,retreat,41250,0,0,1,2,1.25,2');
    expect(lines[4]).toBe('1,2026-11-01T10:23Z,"odd, ""build""",1,campaign,1,skip,0,3,1,0,0,1,'); // a skip: no speed
    expect(parseDiagText(text)).toEqual(rows);
    expect(parseDiagText(diagText([], hints))).toEqual([]);
  });

  it('QA-39-1: a log from before the speed column still parses (rows without speed); a mixed paste follows each column line', () => {
    expect(DIAG_COLUMNS_V1_0).toEqual(DIAG_COLUMNS.filter((c) => c !== 'speed'));
    const old = ['# Tower Clash diagnostics v1 | build 1.0.0 (build 26)', DIAG_COLUMNS_V1_0.join(','), '1,2026-11-01T10:23Z,1.0.0 (build 26),3,campaign,1,won,41250,3,1,0,0,1'].join('\n');
    const r = row({ build: '1.0.0 (build 26)', lvl: 3 });
    expect(parseDiagText(old)).toEqual([r]);
    expect('speed' in parseDiagText(old)[0]!).toBe(false);
    const fresh = diagText([row({ speed: 20 })], hints);
    expect(parseDiagText(`${old}\n${fresh}`)).toEqual([r, row({ speed: 20 })]);
    // a 13-field row under the 14-column line is a cut line: skipped
    expect(parseDiagText(`${DIAG_COLUMNS.join(',')}\n1,2026-11-01T10:23Z,b,3,campaign,1,won,41250,3,1,0,0,1`)).toEqual([]);
  });
});

describe("QA-39-1: the speed column is the match's highest game speed", () => {
  beforeEach(() => {
    save.settings.diagnostics = true;
  });

  /** Win level 5 after one 50 ms frame at each of `speeds` in turn (the pause card's toggle / the debug setSpeed). */
  async function winAt(speeds: number[]): Promise<PlayScreen> {
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, makeLevel({ id: 5 }), 1, 1);
    shell.app.go(play);
    play.startMatch();
    let now = 100;
    for (const sp of speeds) {
      play.setSpeed(sp);
      play.update(50, (now += 50));
    }
    for (const tw of Object.values(play.state.towers)) tw.owner = 'player';
    play.state.units = [];
    play.state.links = [];
    play.update(50, (now += 50));
    expect(play.over).toBe(true);
    await flush();
    return play;
  }

  it('×1 all match: 1; ×2 then back to ×1 mid-match: 2 (the max, not the speed at the result)', async () => {
    await winAt([1, 1]);
    const p = await winAt([1, 2, 1]);
    expect(p.loop.speed).toBe(1);
    expect(diagRows().map((r) => r.speed)).toEqual([1, 2]);
  });

  it('the debug setSpeed(20) shows up as 20; a speed set while no tick ran does not count', async () => {
    await winAt([20, 1]);
    expect(diagRows().at(-1)!.speed).toBe(20);
    // the app's persisted ×2 at the start, switched to ×1 before the first tick: a ×1 match
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, makeLevel({ id: 5 }), 1, 2);
    expect(play.loop.speedMax).toBeUndefined();
    play.setSpeed(1);
    play.startMatch();
    play.update(50, 100);
    expect(play.loop.speedMax).toBe(1);
  });

  it('a skip row has no speed (empty in the CSV); a stored row with a bad speed is dropped on read', () => {
    recordDiag(save, ev({ outcome: 'skip', stars: 1 }));
    expect('speed' in diagRows()[0]!).toBe(false);
    recordDiag(save, ev({ speed: 2 }));
    expect(diagRows()[1]!.speed).toBe(2);
    const raw = JSON.parse(store.data.get(DIAG_KEY)!) as { rows: Record<string, unknown>[] };
    raw.rows[1]!.speed = 'fast';
    store.data.set(DIAG_KEY, JSON.stringify(raw));
    expect(diagRows()).toHaveLength(1);
  });
});

describe('lazy chunk', () => {
  const SRC = resolve(new URL('../../src/', import.meta.url).pathname);
  const read = (f: string): string => readFileSync(f, 'utf8');
  const resolveSpec = (from: string, spec: string): string | null => {
    if (!spec.startsWith('.')) return null;
    const base = resolve(dirname(from), spec);
    for (const c of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(c)) return c;
    return null;
  };
  const graph = (entry: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length) {
      const f = stack.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      for (const m of read(f).matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^;'"]*?\s+from\s+)?'([^']+)'/gm)) {
        const t = resolveSpec(f, m[1]!);
        if (t) stack.push(t);
      }
    }
    return seen;
  };

  it('src/ui/diagnostics.ts is not statically reachable from src/main.ts; the play screen books through the result chunk', () => {
    const eager = graph(join(SRC, 'main.ts'));
    expect(eager.has(join(SRC, 'ui/play.ts'))).toBe(true);
    expect(eager.has(join(SRC, 'ui/diagnostics.ts'))).toBe(false);
    expect(read(join(SRC, 'ui/play.ts'))).toMatch(/if \(this\.app\.save\.settings\.diagnostics\) void loadResultChunk\(\)\.then\(\(m\) => m\.logLevelEnd\(this\.app\.save, info, this\), \(\) => undefined\);/);
    expect(read(join(SRC, 'ui/result.ts'))).toMatch(/export \{ logLevelEnd \} from '\.\/diagnostics';/);
  });

  it('no network: the module names no fetch / beacon / XHR / socket', () => {
    const src = read(join(SRC, 'ui/diagnostics.ts'));
    for (const api of ['fetch(', 'sendBeacon', 'XMLHttpRequest', 'WebSocket', 'EventSource']) expect(src.includes(api), api).toBe(false);
  });
});
