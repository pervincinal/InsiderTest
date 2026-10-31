import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PerfHost } from '../../src/ui/perfOverlay';
import { PERF_CHIP, createPerfOverlay, perfLines, placeOnMap } from '../../src/ui/perfOverlay';
import type { View } from '../../src/render/view';
import { PERF_STATS } from '../../src/ui/perfStats';
import { VERSION_TAPS, VERSION_TAP_WINDOW_MS, versionRowOf } from '../../src/ui/settings';
import { SETTINGS, settingsAboutLayout } from '../../src/render/menuLayout';
import { hitArea } from '../../src/render/widgets';
import { normalizeSave } from '../../src/ui/save';
import { enMenus } from '../../src/ui/locales/enMenus';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';

/*
 * AUD-Q8: the frame-time overlay for TF-13 (src/ui/perfOverlay.ts + its stats ring src/ui/perfStats.ts) is
 * a lazy chunk — the eager bundle (84 kB budget, 0.6 kB headroom when it was added) only carries the flag
 * check — so the split holds while
 *   1. neither module is statically reachable from src/main.ts (types only),
 *   2. src/main.ts `import()`s it exactly once, in `setPerfOverlay`, and nothing else in src/ imports it,
 *   3. it names no translated string (a menu key would need the English menus chunk alongside).
 * Plus the pieces around it: the 5-tap switch on the About card's version row, the persisted setting, the
 * toast in four languages and where the chip goes on the map. The runtime side (no request without the
 * flag; `?perf=1` and the five taps) is e2e/perf.spec.ts "frame-time overlay".
 */

const SRC = resolve(new URL('../../src/', import.meta.url).pathname);
const MAIN = join(SRC, 'main.ts');
const OVERLAY = join(SRC, 'ui/perfOverlay.ts');
const STATS = join(SRC, 'ui/perfStats.ts');
const read = (f: string): string => readFileSync(f, 'utf8');

function walkDir(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walkDir(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

function resolveSpec(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  for (const c of [`${base}.ts`, join(base, 'index.ts')]) if (existsSync(c)) return c;
  return null;
}

/** Value imports / re-exports / side-effect imports (not `import type`, not dynamic `import()`). */
function staticDeps(f: string): string[] {
  const deps: string[] = [];
  for (const m of read(f).matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^;'"]*?\s+from\s+)?'([^']+)'/gm)) {
    const t = resolveSpec(f, m[1]!);
    if (t) deps.push(t);
  }
  return deps;
}

function graph(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...staticDeps(f));
  }
  return seen;
}

describe('frame-time overlay chunk (AUD-Q8)', () => {
  it('is not statically reachable from src/main.ts', () => {
    const eager = graph(MAIN);
    expect(eager.has(OVERLAY), 'src/ui/perfOverlay.ts is in the eager graph').toBe(false);
    expect(eager.has(STATS), 'src/ui/perfStats.ts is in the eager graph').toBe(false);
  });

  it('main.ts imports it once, behind the switch; nothing else in src/ imports it', () => {
    const main = read(MAIN);
    expect([...main.matchAll(/import\('\.\/ui\/perfOverlay'\)/g)]).toHaveLength(1);
    expect(main).toMatch(/setPerfOverlay\(on: boolean\): void \{\s*this\.perfOverlayOn = on;\s*if \(!on\) this\.perf = null;\s*else if \(!this\.perf\) void loadChunk\('perfOverlay', \(\) => import\('\.\/ui\/perfOverlay'\)\)/);
    // the flag: the persisted setting or the URL, read once at boot
    expect(main).toMatch(/this\.setPerfOverlay\(save\.settings\.perfOverlay === true \|\| query\.get\('perf'\) === '1'\);/);
    expect(main).toContain('this.perf?.frame(this, now);');
    const importers = walkDir(SRC).filter((f) => f !== OVERLAY && f !== STATS && staticDeps(f).some((d) => d === OVERLAY || d === STATS));
    expect(importers.map((f) => f.slice(SRC.length))).toEqual([]);
    const dynamic = walkDir(SRC).filter((f) => /import\(['"][./]*(ui\/)?perf(Overlay|Stats)['"]\)/.test(read(f)));
    expect(dynamic.map((f) => f.slice(SRC.length))).toEqual(['/main.ts']);
  });

  it('names no translated string (it would need the English menus chunk) and pulls in no lazy locale', () => {
    // its own code: numbers and fixed labels only; what it reaches statically besides itself is the eager bundle
    expect(read(OVERLAY)).not.toMatch(/\bt\(/);
    expect(read(STATS)).not.toMatch(/\bt\(/);
    const eager = graph(MAIN);
    const extra = [...graph(OVERLAY)].filter((f) => !eager.has(f)).map((f) => f.slice(SRC.length)).sort();
    expect(extra, 'the chunk adds only the overlay and its stats ring').toEqual(['/ui/perfOverlay.ts', '/ui/perfStats.ts']);
  });

  it('the toast says on / off in all four languages', () => {
    for (const [code, dict] of [['en', enMenus], ['az', az], ['ru', ru], ['tr', tr]] as const) {
      expect(dict['settings.perfOn'], code).toBeTruthy();
      expect(dict['settings.perfOff'], code).toBeTruthy();
      expect(dict['settings.perfOn'], code).not.toBe(dict['settings.perfOff']);
    }
    expect(enMenus['settings.perfOn']).toBe('Frame-time overlay on');
    expect(enMenus['settings.perfOff']).toBe('Frame-time overlay off');
  });
});

describe('the 5-tap switch and the setting (AUD-Q8)', () => {
  it('five taps within 2 s', () => {
    expect(VERSION_TAPS).toBe(5);
    expect(VERSION_TAP_WINDOW_MS).toBe(2000);
  });

  it('the version row is the About card\'s first row, below RESET\'s tap area, in every About layout', () => {
    const reset = hitArea(SETTINGS.reset, 88);
    for (const [id, privacy] of [[false, false], [true, false], [true, true], [false, true]] as const) {
      const about = settingsAboutLayout(id, privacy);
      const row = versionRowOf(about);
      expect(row.x).toBe(about.card.x);
      expect(row.y).toBe(about.card.y);
      expect(row.w).toBe(about.card.w);
      expect(row.y + row.h).toBe(about.versionY + SETTINGS.aboutRowH / 2);
      expect(row.y + row.h).toBeLessThanOrEqual(about.card.y + about.card.h);
      // at the 88-px tap area it still starts below RESET's
      expect(hitArea(row, 88).y).toBeGreaterThanOrEqual(reset.y + reset.h);
    }
    // COPY's tap area reaches up into the row: the settings screen tests COPY first
    const src = read(join(SRC, 'ui/settings.ts'));
    expect(src.indexOf('list.push(this.versionRect)')).toBeGreaterThan(src.indexOf('if (this.about.copy) list.push(this.about.copy);'));
  });

  it('settings.perfOverlay: only true survives a load; absent = off', () => {
    const on = normalizeSave({ settings: { colorBlind: false, sound: true, reducedMotion: 'auto', perfOverlay: true } });
    expect(on.settings.perfOverlay).toBe(true);
    for (const v of [false, 'yes', 1, null]) expect(normalizeSave({ settings: { colorBlind: false, sound: true, reducedMotion: 'auto', perfOverlay: v } }).settings.perfOverlay).toBeUndefined();
    expect(normalizeSave({}).settings.perfOverlay).toBeUndefined();
  });
});

describe('the chip (AUD-Q8)', () => {
  it('two lines: fps · p95, then long frames · seconds · units (no units off the play screen)', () => {
    expect(perfLines({ fps: 59.6, p95Ms: 16.73, longFrames: 2, sinceMs: 31_900, units: 37 })).toEqual(['60 fps · p95 16.7 ms', 'long 2 · 31 s · 37 units']);
    expect(perfLines({ fps: 30, p95Ms: 33.3, longFrames: 0, sinceMs: 999, units: null })).toEqual(['30 fps · p95 33.3 ms', 'long 0 · 0 s']);
  });

  it('text at the 22 px floor; the sparkline is one bar per frame of the last 60', () => {
    expect(PERF_CHIP.textPx).toBeGreaterThanOrEqual(22);
    expect(PERF_STATS.sparkFrames).toBe(60);
    expect(PERF_STATS.windowMs).toBe(2000);
  });

  it('on the map: the first row from the top with a clear spot, its leftmost spot; never on an obstacle while a clear spot exists', () => {
    const w = 280;
    const h = 114;
    // nothing in the way: top left
    expect(placeOnMap(w, h, 104, 1172, [])).toEqual({ x: 4, y: 104, w, h });
    // a tower top left: same row, right of it
    const tower = { x: 0, y: 100, w: 300, h: 120 };
    const r1 = placeOnMap(w, h, 104, 1172, [tower]);
    expect(r1.y).toBe(104);
    expect(r1.x).toBeGreaterThanOrEqual(tower.x + tower.w);
    // the whole top row blocked: the first row under it
    const wall = { x: 0, y: 100, w: 720, h: 200 };
    const r2 = placeOnMap(w, h, 104, 1172, [wall]);
    expect(r2.y).toBeGreaterThanOrEqual(wall.y + wall.h);
    expect(r2.x).toBe(4);
    // a dense band: whatever it picks touches none of them
    const dense = Array.from({ length: 30 }, (_, i) => ({ x: (i * 97) % 640, y: 104 + ((i * 151) % 900), w: 80, h: 110 }));
    const r3 = placeOnMap(w, h, 104, 1172, dense);
    for (const o of dense) {
      const overlap = Math.min(r3.x + r3.w, o.x + o.w) > Math.max(r3.x, o.x) && Math.min(r3.y + r3.h, o.y + o.h) > Math.max(r3.y, o.y);
      expect(overlap, JSON.stringify({ r3, o })).toBe(false);
    }
    expect(r3.y + r3.h).toBeLessThanOrEqual(1172);
  });
});

describe('createPerfOverlay frames (AUD-Q8)', () => {
  /** A canvas context that records text and swallows every other call. */
  function fakeCtx(): CanvasRenderingContext2D & { texts: string[] } {
    const store: Record<string | symbol, unknown> = {};
    const texts: string[] = [];
    return new Proxy({} as CanvasRenderingContext2D & { texts: string[] }, {
      get(_t, key) {
        if (key === 'texts') return texts;
        if (key === 'measureText') return (s: string) => ({ width: s.length * 11 });
        if (key === 'fillText') return (s: string) => void texts.push(s);
        if (key in store) return store[key];
        return () => undefined;
      },
      set(_t, key, value) {
        store[key] = value;
        return true;
      },
    });
  }

  it('records every frame, hides the chip while the lesson card is up and restarts the count when it shows; menus get it top left under the safe area', () => {
    const ctx = fakeCtx();
    const view = { ctx, dpr: 1, cssW: 360, cssH: 640, scale: 0.5, offsetX: 0, offsetY: 0, insets: { top: 20, right: 0, bottom: 0, left: 0 } } as unknown as View;
    const play = { name: 'play', cardUp: true, tutorialStep: () => null, state: { units: [1, 2, 3], towers: {}, time: 0 } };
    const title = { name: 'title' };
    const host = { view, current: title, play: null } as unknown as PerfHost;
    const o = createPerfOverlay();
    let t = 1000;
    for (let i = 0; i < 30; i++) o.frame(host, (t += 1000 / 60));
    let s = o.stats();
    expect(s.screen).toBe('title');
    expect(s.units).toBeNull();
    expect(s.totalFrames).toBe(29); // the first frame on a screen only sets the clock
    expect(s.chip).toEqual(expect.objectContaining({ x: PERF_CHIP.gap, y: 20 / 0.5 + PERF_CHIP.gap })); // under the 20 px inset
    expect(ctx.texts.some((x) => /^\d+ fps · p95 \d+\.\d ms$/.test(x))).toBe(true);

    const onPlay = { ...host, current: play, play } as unknown as PerfHost;
    for (let i = 0; i < 20; i++) o.frame(onPlay, (t += 1000 / 60));
    s = o.stats();
    expect(s.screen).toBe('play');
    expect(s.chip, 'hidden under the lesson card').toBeNull();
    expect(s.units).toBe(3);
    expect(s.totalFrames).toBe(19);
    play.cardUp = false;
    for (let i = 0; i < 10; i++) o.frame(onPlay, (t += 1000 / 60));
    s = o.stats();
    expect(s.chip, 'shown once the card is gone').not.toBeNull();
    expect(s.chip!.y).toBeGreaterThanOrEqual(96 + PERF_CHIP.gap); // under the top HUD band (no anchors on this 9:16 view)
    expect(s.totalFrames, 'the count restarted with the chip').toBe(9);
    expect(s.sinceMs).toBeCloseTo((9 * 1000) / 60, 6);
  });
});
