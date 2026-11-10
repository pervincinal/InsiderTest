import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import type { Rect } from '../../src/render/widgets';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData, SaveStorage } from '../../src/ui/save';
import { SAVE_KEY, defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import '../registerResult';
import { PlayScreen } from '../../src/ui/play';
import { SettingsScreen } from '../../src/ui/settings';
import type { DiagEvent, DiagReplay, DiagRow } from '../../src/ui/diagnostics';
import {
  DIAG_KEY,
  DIAG_REPLAY_KEEP,
  DIAG_REPLAY_MAX,
  DIAG_SHARE_MAX,
  diagReplayOf,
  diagRows,
  diagShare,
  diagText,
  logLevelEnd,
  parseDiagReplays,
  parseDiagText,
  recordDiag,
} from '../../src/ui/diagnostics';
import type { Replay } from '../../src/sim/replay';
import { hashState, parseReplay, runReplay, serializeReplay, verifyReplay } from '../../src/sim/replay';
import { createState } from '../../src/sim/create';
import type { LevelDef } from '../../src/sim/types';
import { loadLevel } from '../../src/levels/index';
import { en } from '../../src/ui/locales/en';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { makeLevel } from '../helpers';

/*
 * DIAG-2 (2026-11-10): the diagnostics row of a played result carries the match's SIM-R1 replay record
 * (src/ui/diagnostics.ts `diagReplayOf`), bounded (≤ 32 kB per record, else a size marker; the newest 5
 * rows keep theirs); COPY LOG appends `#replay <row> <json>` lines, newest first, within 100 kB; off, nothing
 * is built. The record stays outside the save, and src/sim/replay.ts stays out of the eager chunk.
 */

const memory = (limit = Infinity): SaveStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (v.length > limit) throw new DOMException('quota', 'QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
};

function fakeApp(save: SaveData) {
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
    go(_s: Screen) {},
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-11-01',
    weekKey: () => '2026-10-26',
  };
  return app;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Play `level` a tick, then hand every tower to the winner (as tests/ui/diagnostics.test.ts). */
async function playTo(save: SaveData, outcome: 'won' | 'lost'): Promise<PlayScreen> {
  const app = fakeApp(save);
  const play = new PlayScreen(app, makeLevel({ id: 5 }), 1, 1);
  app.go(play);
  play.startMatch();
  play.update(50, 100);
  for (const tw of Object.values(play.state.towers)) tw.owner = outcome === 'won' ? 'player' : 'enemy1';
  play.state.units = [];
  play.state.links = [];
  play.update(50, 200);
  expect(play.over).toBe(true);
  await flush();
  return play;
}

const fixture = (): Replay => parseReplay(readFileSync(new URL('../fixtures/replay-l15-s1.json', import.meta.url), 'utf8'));
const ev = (over: Partial<DiagEvent> = {}): DiagEvent => ({ lvl: 1, mode: 'campaign', key: '1', outcome: 'lost', timeMs: 30_000, stars: 0, first: false, continued: false, boosters: 0, ...over });
const hints = { build: '1.0.0 (build 27)', ua: 'TestUA', viewport: '393x852', dpr: 3, textScale: 1, language: 'az' };

/** A record of `n` commands on `level` (≈ 60 chars each), closed on a fresh state. */
function fatReplay(level: LevelDef, n: number): DiagReplay {
  const state = createState(level, 1);
  const replayLog = Array.from({ length: n }, (_, i) => ({ t: i * 50, c: { type: 'sendUnits' as const, owner: 'enemy1' as const, from: 't1', to: 't2' }, a: 1 as const }));
  return diagReplayOf({ match: { timeMs: 0 }, boosters: 0, level, state, replayLog }, Infinity)!;
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

describe('the row carries the replay record', () => {
  it('on: a played result books the match record (level, seed, every logged command, outcome hash of the final state)', async () => {
    save.settings.diagnostics = true;
    const play = await playTo(save, 'lost');
    const [row] = diagRows();
    const rep = row!.replay as Replay;
    expect(rep).toMatchObject({ v: 1, levelId: 5, seed: 1 });
    expect(rep.commands).toEqual(play.replayLog.map((e) => (e.a ? e : { t: e.t, c: e.c })));
    expect(rep.outcome).toEqual({ result: 'lost', timeMs: play.state.time, hash: hashState(play.state) });
    expect(rep.continued).toBeUndefined();
    // the save never holds a record (the log has its own key)
    expect(store.data.get(SAVE_KEY)).not.toContain('"commands"');
    expect(store.data.get(DIAG_KEY)).toContain('"commands"');
  });

  it('off: no row, no key — and the play screen is not even read for its log (no record is built)', async () => {
    await playTo(save, 'won');
    expect(store.data.has(DIAG_KEY)).toBe(false);
    const play = await playTo(save, 'lost');
    const probe = {
      match: { timeMs: 1 },
      boosters: 0,
      level: play.level,
      state: play.state,
      get replayLog(): never {
        throw new Error('read while off');
      },
    };
    const info = { ui: { outcome: 'lost' }, level: play.level, earnings: { stars: 0 }, continued: false } as unknown as Parameters<typeof logLevelEnd>[1];
    expect(logLevelEnd(save, info, probe)).toBeNull();
    expect(store.data.has(DIAG_KEY)).toBe(false);
  });

  it('a real match round-trips: the row record verifies (fixture level 15, seed 1)', async () => {
    const level = (await loadLevel(15))!;
    const rec = fixture();
    const state = runReplay(level, rec);
    const rep = diagReplayOf({ match: { timeMs: state.time }, boosters: 0, level, state, replayLog: rec.commands }) as Replay;
    expect(rep.outcome!.hash).toBe(rec.outcome!.hash);
    expect(verifyReplay(level, parseReplay(serializeReplay(rep))).matches).toBe(true);
    // through the store and COPY LOG's text
    save.settings.diagnostics = true;
    recordDiag(save, ev({ lvl: 15, key: '15', replay: rep }));
    const [line] = parseDiagReplays(diagText(diagRows(), hints));
    expect(line!.row).toBe(1);
    expect(verifyReplay(level, line!.replay as Replay).matches).toBe(true);
  });

  it(`size cap: a record over ${DIAG_REPLAY_MAX} chars is kept as { dropped: 'size', bytes }`, () => {
    const level = makeLevel({ id: 5 });
    const small = fatReplay(level, 10);
    expect('commands' in small).toBe(true);
    const big = fatReplay(level, 1000);
    const bytes = serializeReplay(big as Replay).length;
    expect(bytes).toBeGreaterThan(DIAG_REPLAY_MAX);
    const state = createState(level, 1);
    const capped = diagReplayOf({ match: { timeMs: 0 }, boosters: 0, level, state, replayLog: (big as Replay).commands });
    expect(capped).toEqual({ dropped: 'size', bytes });
    expect(diagReplayOf({ match: { timeMs: 0 }, boosters: 0 })).toBeUndefined(); // no match (a skip's path)
  });

  it(`last-${DIAG_REPLAY_KEEP} rule: older rows drop the field, every row stays`, () => {
    save.settings.diagnostics = true;
    const rep = fatReplay(makeLevel({ id: 5 }), 3);
    for (let i = 0; i < 8; i++) recordDiag(save, ev({ replay: rep }));
    recordDiag(save, ev({ outcome: 'skip' })); // a skip carries none and does not push one out
    const rows = diagRows();
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => 'replay' in r)).toEqual([false, false, false, true, true, true, true, true, false]);
    expect(rows.map((r) => r.attempt)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8]);
  });

  it('a stored field that is not a record is dropped on read; storage refusing the records keeps the rows', () => {
    store.data.set(DIAG_KEY, JSON.stringify({ v: 1, n: {}, rows: [{ ...ev(), v: 1, t: 'x', build: 'b', attempt: 1, textScale: 1, replay: 'junk' }] }));
    expect(diagRows()).toHaveLength(1);
    expect('replay' in diagRows()[0]!).toBe(false);
    store = memory(8_000);
    setSaveStorageForTests(store);
    save.settings.diagnostics = true;
    recordDiag(save, ev({ replay: fatReplay(makeLevel({ id: 5 }), 400) }));
    expect(diagRows()).toHaveLength(1);
    expect('replay' in diagRows()[0]!).toBe(false);
  });
});

describe('COPY LOG with replays', () => {
  const row = (over: Partial<DiagRow> = {}): DiagRow => ({ v: 1, t: '2026-11-01T10:23Z', build: '1.0.0 (build 27)', lvl: 5, mode: 'campaign', attempt: 1, outcome: 'lost', timeMs: 41_250, stars: 0, first: false, continued: false, boosters: 0, textScale: 1, ...over });

  it('one `#replay <row> <json>` line per record after the CSV rows; CSV readers still see only the rows', () => {
    const rep = fatReplay(makeLevel({ id: 5 }), 3);
    const rows = [row(), row({ attempt: 2, replay: rep }), row({ attempt: 3, replay: { dropped: 'size', bytes: 40_000 } })];
    const s = diagShare(rows, hints);
    const lines = s.text.split('\n');
    expect(lines).toHaveLength(2 + 3 + 2);
    expect(lines[5]).toBe(`#replay 2 ${JSON.stringify(rep)}`);
    expect(lines[6]).toBe('#replay 3 {"dropped":"size","bytes":40000}');
    expect(s).toMatchObject({ replays: 2, omitted: 0 });
    expect(parseDiagText(s.text)).toEqual(rows.map(({ replay: _r, ...r }) => r));
    expect(parseDiagReplays(s.text)).toEqual([
      { row: 2, replay: rep },
      { row: 3, replay: { dropped: 'size', bytes: 40_000 } },
    ]);
  });

  it(`share-size fallback: over ${DIAG_SHARE_MAX} chars the oldest records go first (a note line says so); the newest always fits`, () => {
    const rep = fatReplay(makeLevel({ id: 5 }), 370); // ≈ 30 kB each
    const json = JSON.stringify(rep).length;
    expect(json).toBeGreaterThan(28_000);
    expect(json).toBeLessThanOrEqual(DIAG_REPLAY_MAX);
    // 400 rows (the log's cap) + 5 records ≈ 190 kB untrimmed
    const rows = Array.from({ length: 400 }, (_, i) => row({ attempt: i + 1, build: '1.0.0 (build 999)', textScale: 1.25, ...(i >= 395 ? { replay: rep } : {}) }));
    const s = diagShare(rows, hints);
    expect(s.text.length).toBeLessThanOrEqual(DIAG_SHARE_MAX);
    expect(s.replays).toBeGreaterThanOrEqual(1);
    expect(s.replays + s.omitted).toBe(5);
    expect(s.text.split('\n').at(-1)).toBe(`# replays omitted ${s.omitted} (size)`);
    const kept = parseDiagReplays(s.text).map((r) => r.row);
    expect(kept).toEqual(Array.from({ length: s.replays }, (_, i) => 401 - s.replays + i)); // the newest, in row order
    expect(parseDiagText(s.text)).toHaveLength(400);
  });

  it('the settings COPY LOG copies the replays and says so when older ones were left out', async () => {
    save.settings.diagnostics = true;
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText }, userAgent: 'TestUA' });
    const tap = (screen: SettingsScreen, r: Rect) => {
      const p = { x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, timeMs: 0 };
      screen.down(p);
      screen.up(p);
    };
    const small = fatReplay(makeLevel({ id: 5 }), 3);
    recordDiag(save, ev({ replay: small }));
    let screen = new SettingsScreen(fakeApp(save), () => {});
    tap(screen, screen.diagInfo.copy!);
    await flush();
    expect(parseDiagReplays((writeText.mock.calls[0] as unknown as [string])[0])).toHaveLength(1);
    expect(screen.toast.opts(0)?.text).toBe(en['settings.logCopied']);
    const big = fatReplay(makeLevel({ id: 5 }), 370);
    for (let i = 0; i < 5; i++) recordDiag(save, ev({ replay: big }));
    screen = new SettingsScreen(fakeApp(save), () => {});
    tap(screen, screen.diagInfo.copy!);
    await flush();
    const text = (writeText.mock.calls[1] as unknown as [string])[0];
    expect(text.length).toBeLessThanOrEqual(DIAG_SHARE_MAX);
    expect(parseDiagReplays(text).at(-1)!.row).toBe(6);
    expect(screen.toast.opts(0)?.text).toBe(en['settings.logCopiedTrimmed']);
  });

  it('the toast string in four languages (AZ first-class)', () => {
    expect(az['settings.logCopiedTrimmed']).toBe('Jurnal kopyalandı; köhnə matç qeydləri sığmadı');
    for (const dict of [en, az, ru, tr] as Record<string, string>[]) expect(dict['settings.logCopiedTrimmed']).toBeTruthy();
    expect(new Set([en, az, ru, tr].map((d) => d['settings.logCopiedTrimmed'])).size).toBe(4);
  });
});

describe('bundle hygiene', () => {
  const SRC = resolve(new URL('../../src/', import.meta.url).pathname);
  const read = (f: string): string => readFileSync(f, 'utf8');
  const resolveSpec = (from: string, spec: string): string | null => {
    if (!spec.startsWith('.')) return null;
    const base = resolve(dirname(from), spec);
    for (const c of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(c)) return c;
    return null;
  };
  /** Static import graph of `entry`; `barrel`'s own `export … from` edges are not followed (its names are checked instead). */
  const graph = (entry: string, barrel?: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length) {
      const f = stack.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      if (f === barrel) {
        for (const m of read(f).matchAll(/^\s*import\s+(?!type\b)(?:[^;'"]*?\s+from\s+)?'([^']+)'/gm)) {
          const t = resolveSpec(f, m[1]!);
          if (t) stack.push(t);
        }
        continue;
      }
      for (const m of read(f).matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^;'"]*?\s+from\s+)?'([^']+)'/gm)) {
        const t = resolveSpec(f, m[1]!);
        if (t) stack.push(t);
      }
    }
    return seen;
  };

  // the sim barrel re-exports the module (src/sim/index.ts); tree-shaking drops it unless an eager module uses a name
  const REPLAY_VALUES = ['replayOf', 'serializeReplay', 'parseReplay', 'verifyReplay', 'runReplay', 'rulesId', 'hashState', 'newReplay', 'recordInto', 'finishReplay', 'fnv1a', 'REPLAY_VERSION'];

  it('src/sim/replay.ts is reachable from the lazy chunks only (diagnostics, debug), never statically from src/main.ts', () => {
    const replay = join(SRC, 'sim/replay.ts');
    const barrel = join(SRC, 'sim/index.ts');
    const eager = graph(join(SRC, 'main.ts'), barrel);
    expect(eager.has(join(SRC, 'ui/play.ts'))).toBe(true);
    expect(eager.has(replay), 'a direct static import of src/sim/replay.ts').toBe(false);
    expect(eager.has(join(SRC, 'ui/diagnostics.ts'))).toBe(false);
    for (const f of eager) {
      for (const m of read(f).matchAll(/^\s*import\s+(?!type\b)\{([^}]*)\}\s+from\s+'([^']+)'/gm)) {
        if (resolveSpec(f, m[2]!) !== barrel) continue;
        const names = m[1]!.split(',').map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]);
        for (const n of REPLAY_VALUES) expect(names.includes(n), `${f} imports ${n} from the sim barrel`).toBe(false);
      }
    }
    expect(graph(join(SRC, 'ui/diagnostics.ts')).has(replay)).toBe(true);
  });
});
