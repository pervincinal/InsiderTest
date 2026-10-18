import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enCore } from '../../src/ui/locales/enCore';
import { enTutorial } from '../../src/ui/locales/enTutorial';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { Tutorial, tutorialFor } from '../../src/ui/tutorial';
import { needsTutorialSteps } from '../../src/ui/tutorialChunk';

/*
 * PERF-10: the level 2–4 tutorial steps (src/ui/tutorialSteps.ts) with their English hints
 * (src/ui/locales/enTutorial.ts) and the translated level names (src/levels/names.ts) are out of
 * the eager bundle. The split holds while
 *   1. none of those modules is statically reachable from src/main.ts,
 *   2. the eager English part (enCore.ts) carries none of the level 2–4 hint keys and no eagerly
 *      loaded module names one (it would render as its raw key until the chunk lands),
 *   3. the steps chunk has exactly one loader (src/ui/tutorialChunk.ts) and the names one importer
 *      (the lazy level map), and level 1's steps stay eager (a first launch never waits for a fetch).
 * The runtime side (the chunk is fetched only with a level 2–4 start) is e2e/lazy.spec.ts.
 */

const SRC = resolve(new URL('../../src/', import.meta.url).pathname);
const STEPS = join(SRC, 'ui/tutorialSteps.ts');
const EN_TUTORIAL = join(SRC, 'ui/locales/enTutorial.ts');
const NAMES = join(SRC, 'levels/names.ts');

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

const read = (f: string): string => readFileSync(f, 'utf8');

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

const rel = (f: string): string => f.slice(SRC.length + 1);
const eager = graph(join(SRC, 'main.ts'));
const LATE_KEYS = Object.keys(enTutorial);

describe('level 2–4 tutorial chunk (PERF-10)', () => {
  it('the eager graph is found and holds neither the steps, their English hints nor the translated level names', () => {
    expect(eager.size).toBeGreaterThan(50);
    expect(eager.has(join(SRC, 'ui/tutorial.ts'))).toBe(true);
    expect(eager.has(join(SRC, 'ui/tutorialChunk.ts'))).toBe(true);
    expect(eager.has(STEPS)).toBe(false);
    expect(eager.has(EN_TUTORIAL)).toBe(false);
    expect(eager.has(NAMES)).toBe(false);
  });

  it('the eager locale core has none of the level 2–4 hint keys; the other locales keep them (their dictionaries are lazy anyway)', () => {
    expect(LATE_KEYS.sort()).toEqual(
      ['tutorial.fillToUpgrade', 'tutorial.goAround', 'tutorial.grabOther', 'tutorial.stopStream', 'tutorial.stopToGrow', 'tutorial.supplyLine', 'tutorial.tapThenGrey'].sort(),
    );
    expect(LATE_KEYS.filter((k) => k in enCore)).toEqual([]);
    for (const [code, dict] of Object.entries({ az, ru, tr })) for (const k of LATE_KEYS) expect(typeof (dict as Record<string, string>)[k], `${code} ${k}`).toBe('string');
    // level 1's two hints stay eager
    expect(Object.keys(enCore).filter((k) => k.startsWith('tutorial.')).sort()).toEqual(['tutorial.tapGrey', 'tutorial.tapTower']);
  });

  it('no eagerly loaded module names a level 2–4 hint key', () => {
    const offenders: string[] = [];
    for (const f of eager) {
      if (f.includes('/locales/')) continue;
      const src = read(f);
      for (const k of LATE_KEYS) if (src.includes(`'${k}'`) || src.includes(`"${k}"`)) offenders.push(`${rel(f)}: ${k}`);
    }
    expect(offenders).toEqual([]);
  });

  it('one loader of the steps chunk, one importer of the hints and of the level names', () => {
    const files = walkDir(SRC);
    expect(files.filter((f) => /\bimport\(\s*'[^']*tutorialSteps'\s*\)/.test(read(f))).map(rel)).toEqual(['ui/tutorialChunk.ts']);
    expect(files.filter((f) => staticDeps(f).includes(STEPS)).map(rel)).toEqual([]);
    expect(files.filter((f) => staticDeps(f).includes(EN_TUTORIAL)).map(rel).sort()).toEqual(['ui/locales/en.ts', 'ui/tutorialSteps.ts']);
    expect(files.filter((f) => staticDeps(f).includes(NAMES)).map(rel)).toEqual(['ui/levelSelect.ts']);
  });

  it('needsTutorialSteps: a first play of levels 2–4 only', () => {
    expect([1, 2, 3, 4, 5].map((id) => needsTutorialSteps(id, 0))).toEqual([false, true, true, true, false]);
    expect(needsTutorialSteps(3, 1)).toBe(false);
  });

  it('with the chunk registered (tests/setup.ts, as the level start does), levels 1–4 have a tutorial; level 1 without it too', () => {
    for (const id of [1, 2, 3, 4]) expect(tutorialFor(id, 0), `level ${id}`).toBeInstanceOf(Tutorial);
    expect(tutorialFor(1, 0)!.steps).toHaveLength(2);
    // tutorial.ts itself only defines level 1: everything else arrives through registerTutorialSteps
    expect(read(join(SRC, 'ui/tutorial.ts'))).not.toMatch(/^\s*[234]:\s*\(\)\s*=>/m);
  });
});
