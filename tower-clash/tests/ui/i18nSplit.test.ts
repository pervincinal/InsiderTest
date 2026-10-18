import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enCore } from '../../src/ui/locales/enCore';
import { enMenus } from '../../src/ui/locales/enMenus';
import { enTutorial } from '../../src/ui/locales/enTutorial';
import { en } from '../../src/ui/locales/en';

/*
 * PERF-8: English is split into the eager part (src/ui/locales/enCore.ts) and the menu part
 * (enMenus.ts), a chunk of its own that `loadEnglishMenus()` (src/ui/i18n.ts) fetches together with
 * every lazy chunk that draws those strings. The split is only safe while
 *   1. nothing statically reachable from src/main.ts imports enMenus.ts (or en.ts, which joins both),
 *   2. no eagerly loaded module names a menu key (as a string literal, or as a `prefix.${…}` family):
 *      such a string would render as its raw key until a lazy chunk happens to load,
 *   3. no game module imports enMenus.ts statically (a lazy chunk depending on it would stay broken
 *      after one failed download — the module map pins it), and every `import()` of a chunk whose
 *      static graph uses a menu key is loaded in the same `Promise.all` as `loadEnglishMenus()`.
 * The scan is deliberately conservative: any string literal equal to a key counts as a use.
 */

const SRC = resolve(new URL('../../src/', import.meta.url).pathname);
const MENUS = join(SRC, 'ui/locales/enMenus.ts');
const EN = join(SRC, 'ui/locales/en.ts');

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

const source = new Map<string, string>();
const read = (f: string): string => {
  let s = source.get(f);
  if (s === undefined) source.set(f, (s = readFileSync(f, 'utf8')));
  return s;
};

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

const MENU_KEYS = new Set(Object.keys(enMenus));

/** Menu keys a module names: string literals equal to a key, and `prefix.${…}` key families. */
function menuKeysUsed(f: string): string[] {
  if (f.includes('/locales/')) return [];
  const src = read(f);
  const used = new Set<string>();
  for (const m of src.matchAll(/['"]([\w.]+)['"]/g)) if (MENU_KEYS.has(m[1]!)) used.add(m[1]!);
  for (const m of src.matchAll(/`([\w.]+\.)\$\{/g)) for (const k of MENU_KEYS) if (k.startsWith(m[1]!)) used.add(`${m[1]!}*`);
  return [...used];
}

const rel = (f: string): string => f.slice(SRC.length + 1);
const eager = graph(join(SRC, 'main.ts'));

describe('English split (PERF-8)', () => {
  it('the parts are disjoint and together are the whole dictionary', () => {
    const core = Object.keys(enCore);
    // PERF-10: the level 2–4 tutorial hints are a third part (tests/ui/tutorialChunk.test.ts guards it)
    const tutorial = Object.keys(enTutorial);
    expect(core.filter((k) => MENU_KEYS.has(k))).toEqual([]);
    expect(tutorial.filter((k) => MENU_KEYS.has(k) || k in enCore)).toEqual([]);
    expect(Object.keys(en).sort()).toEqual([...core, ...MENU_KEYS, ...tutorial].sort());
    // both parts are real (a regression that moves everything to one side fails here)
    expect(core.length).toBeGreaterThan(50);
    expect(MENU_KEYS.size).toBeGreaterThan(100);
  });

  it('the eager graph is found, and neither enMenus.ts nor en.ts is in it', () => {
    expect(eager.size).toBeGreaterThan(50);
    expect(eager.has(join(SRC, 'ui/locales/enCore.ts'))).toBe(true);
    expect(eager.has(MENUS)).toBe(false);
    expect(eager.has(EN)).toBe(false);
  });

  it('no eagerly loaded module names a menu key (move the key to enCore.ts)', () => {
    const offenders = [...eager].flatMap((f) => menuKeysUsed(f).map((k) => `${rel(f)}: ${k}`));
    expect(offenders).toEqual([]);
  });

  it('only en.ts imports enMenus.ts statically; its one loader is loadEnglishMenus()', () => {
    const importers = walkDir(SRC).filter((f) => staticDeps(f).includes(MENUS));
    expect(importers.map(rel)).toEqual(['ui/locales/en.ts']);
    const loaders = walkDir(SRC).filter((f) => /\bimport\(\s*'[^']*enMenus'\s*\)/.test(read(f)));
    expect(loaders.map(rel)).toEqual(['ui/i18n.ts']);
  });

  it('every lazy chunk that draws menu strings is loaded together with loadEnglishMenus()', () => {
    const sites: { file: string; line: string; entry: string }[] = [];
    for (const f of walkDir(SRC)) {
      for (const line of read(f).split('\n')) {
        if (/^\s*(\*|\/\/|\/\*)/.test(line)) continue; // doc comments name the chunks too
        for (const m of line.matchAll(/(?<!typeof )\bimport\(\s*'([^']+)'\s*\)/g)) {
          const t = resolveSpec(f, m[1]!);
          if (t) sites.push({ file: f, line, entry: t });
        }
      }
    }
    const users = sites.filter(({ entry }) => [...graph(entry)].some((g) => !eager.has(g) && menuKeysUsed(g).length > 0));
    // the scan sees the three known users (a new one shows up here too)
    expect([...new Set(users.map((u) => rel(u.entry)))].sort()).toEqual(['render/hudOverlays.ts', 'ui/lazyScreens.ts', 'ui/share.ts']);
    const bare = users.filter(({ line }) => !/Promise\.all\(\[.*loadEnglishMenus\(\)/.test(line)).map(({ file, entry }) => `${rel(file)} → ${rel(entry)}`);
    expect(bare).toEqual([]);
  });
});
