import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * PERF-9: the perspective camera (src/render/perspective.ts: the homography, the tilted ground warp,
 * horizon haze, islets, the tutorial's side bubble) is a lazy chunk. Until it lands a requested tilt
 * draws the flat map — no throw, no await — and the request starts the load; a failed download is
 * retried on a later call (src/lazyChunk.ts). The flat default never asks for it.
 */

const PERSPECTIVE = '../../src/render/perspective';

afterEach(() => {
  vi.doUnmock(PERSPECTIVE);
  vi.resetModules();
});

describe('perspective camera chunk (PERF-9)', () => {
  it('the flat default never loads it; a tilt answers FLAT until the chunk is in, then the perspective camera', async () => {
    vi.resetModules();
    let loads = 0;
    vi.doMock(PERSPECTIVE, async () => {
      loads += 1;
      return vi.importActual(PERSPECTIVE);
    });
    const camera = await import('../../src/render/camera');
    expect(camera.playCamera()).toBe(camera.FLAT);
    expect(camera.preloadCamera()).toBeNull(); // nothing asked for
    expect(loads).toBe(0);

    camera.setTilt(camera.TILT_PERSPECTIVE);
    expect(camera.playCamera()).toBe(camera.FLAT); // not in yet: the flat map, the load is under way
    const pending = camera.preloadCamera();
    expect(pending).not.toBeNull();
    await pending;
    expect(loads).toBe(1);
    const cam = camera.playCamera();
    expect(cam.k).toBe(camera.TILT_PERSPECTIVE);
    expect(cam.flat).toBe(false);
    expect(cam.tilt).toBeDefined();
    expect(camera.playCamera()).toBe(cam); // stable per value
    expect(camera.preloadCamera()).toBeNull(); // already in
    camera.setTilt(0);
    expect(camera.playCamera()).toBe(camera.FLAT);
    expect(camera.FLAT.tilt).toBeUndefined();
  });

  it('a failed download keeps the flat map and is retried on the next load', async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock(PERSPECTIVE, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return vi.importActual(PERSPECTIVE);
    });
    const camera = await import('../../src/render/camera');
    camera.setTilt(0.72);
    await expect(camera.loadCamera()).rejects.toThrow();
    expect(camera.playCamera()).toBe(camera.FLAT); // no throw: drawn flat (backing off from the network for a few seconds)
    await camera.loadCamera();
    expect(attempts).toBe(2);
    expect(camera.playCamera().k).toBe(0.72);
  });
});

/*
 * The split only holds while nothing statically reachable from src/main.ts imports the lazy modules
 * (a value import would pull them back into the entry chunk): the perspective camera and src/ai/*
 * (src/ui/ai.ts loads the AI before a level starts). `import type` and `import()` do not count.
 */
const SRC = resolve(new URL('../../src/', import.meta.url).pathname);

function staticDeps(f: string): string[] {
  const deps: string[] = [];
  for (const m of readFileSync(f, 'utf8').matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^;'"]*?\s+from\s+)?'([^']+)'/gm)) {
    if (!m[1]!.startsWith('.')) continue;
    const base = resolve(dirname(f), m[1]!);
    const hit = [`${base}.ts`, join(base, 'index.ts')].find((c) => existsSync(c));
    if (hit) deps.push(hit);
  }
  return deps;
}

describe('eager graph (PERF-9)', () => {
  it('src/main.ts reaches neither render/perspective.ts nor any src/ai module statically', () => {
    const seen = new Set<string>();
    const stack = [join(SRC, 'main.ts')];
    while (stack.length) {
      const f = stack.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      stack.push(...staticDeps(f));
    }
    expect(seen.size).toBeGreaterThan(50);
    expect(seen.has(join(SRC, 'render/camera.ts'))).toBe(true);
    const lazy = [...seen].filter((f) => f === join(SRC, 'render/perspective.ts') || f.startsWith(join(SRC, 'ai') + '/')).map((f) => f.slice(SRC.length + 1));
    expect(lazy).toEqual([]);
  });
});
