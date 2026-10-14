import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * PERF-9: the enemy AI is a lazy chunk (src/ui/ai.ts). main.ts `startLevel` awaits `loadAi()` beside
 * the level chunk, so a play screen is only built once it is in; before that `aiModule()` refuses
 * loudly (a match without its AI would not be the deterministic game), and a failed download is
 * forgotten so the next level start retries it. tests/setup.ts registers the real module for the
 * other suites; this one starts from a fresh module registry.
 */

const AI = '../../src/ai/index';

afterEach(() => {
  vi.doUnmock(AI);
  vi.resetModules();
});

describe('AI chunk (PERF-9)', () => {
  it('is required before a level runs, loads once, and a failed download is retried', async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock(AI, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return vi.importActual(AI);
    });
    const loader = await import('../../src/ui/ai');
    expect(loader.aiLoaded()).toBe(false);
    expect(() => loader.aiModule()).toThrow(/not loaded/);
    await expect(loader.loadAi()).rejects.toThrow();
    expect(loader.aiLoaded()).toBe(false);
    const ai = await loader.loadAi();
    expect(attempts).toBe(2);
    expect(loader.aiLoaded()).toBe(true);
    expect(loader.aiModule()).toBe(ai);
    expect(typeof ai.enemyCommands).toBe('function');
    expect(typeof ai.isAiTick).toBe('function');
    expect(await loader.loadAi()).toBe(ai); // cached
    expect(attempts).toBe(2);
  });
});
