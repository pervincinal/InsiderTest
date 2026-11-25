import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * REV-47: the select hint's pill memo (`selectHintBox`, hud.ts) is dropped on `document.fonts`
 * "loadingdone" together with widgets.ts's run widths, so a hint first measured in the fallback face
 * is re-measured once the web font lands. widgets.ts registers its listener at import, so the font
 * set is stubbed before the modules load.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function measuringCtx(perChar: { w: number }): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = { font: '', globalAlpha: 1 };
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * perChar.w });
      if (key in store) return store[key];
      return () => undefined;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

describe('REV-47: the select hint is re-measured when a web font finishes loading', () => {
  it('memoised until "loadingdone", then the new metrics give the new pill width', async () => {
    const listeners: (() => void)[] = [];
    vi.stubGlobal('document', { fonts: { addEventListener: (type: string, fn: () => void) => type === 'loadingdone' && listeners.push(fn) } });
    vi.resetModules();
    const { selectHintBox, selectHintText, SELECT_HINT } = await import('../../src/render/hud');
    const metrics = { w: 8 };
    const ctx = measuringCtx(metrics);
    const n = selectHintText(0).length;
    const fallback = selectHintBox(ctx, 0).w;
    expect(fallback).toBe(Math.min(SELECT_HINT.maxW, n * 8 + 2 * SELECT_HINT.padX));
    metrics.w = 9; // the web face is wider
    expect(selectHintBox(ctx, 0).w).toBe(fallback); // still memoised: same font string, same text
    expect(listeners.length).toBeGreaterThan(0);
    for (const fn of listeners) fn();
    expect(selectHintBox(ctx, 0).w).toBe(Math.min(SELECT_HINT.maxW, n * 9 + 2 * SELECT_HINT.padX));
  });
});
