import { afterEach, describe, expect, it, vi } from 'vitest';
import { INSET_PROBE_FRAMES, createView, insetProbe, refreshSafeInsets } from '../../src/render/view';
import type { SafeInsets } from '../../src/render/view';
import { C } from '../../src/sim/constants';

/*
 * MM-7: WKWebView may deliver env(safe-area-inset-*) (Dynamic Island, home indicator) after the
 * first layout without a resize event. The renderer re-reads the insets on the first frames and
 * when the page becomes visible again; a changed value triggers the same relayout as `resize`.
 */

/** The custom properties index.html sets on #app from env(safe-area-inset-*), in CSS px. */
let env: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
let reads = 0;

function stubDom(innerWidth = 390, innerHeight = 844): void {
  vi.stubGlobal('window', { innerWidth, innerHeight, devicePixelRatio: 2 });
  vi.stubGlobal('getComputedStyle', () => {
    reads++;
    const vars: Record<string, string> = {
      '--safe-top': `${env.top}px`,
      '--safe-right': `${env.right}px`,
      '--safe-bottom': `${env.bottom}px`,
      '--safe-left': `${env.left}px`,
    };
    return { getPropertyValue: (name: string) => vars[name] ?? '' };
  });
}

function fakeCanvas(): HTMLCanvasElement {
  const ctx = new Proxy({} as CanvasRenderingContext2D, { get: () => () => undefined });
  return {
    width: 0,
    height: 0,
    style: {} as CSSStyleDeclaration,
    parentElement: {} as Element, // #app; only handed to the stubbed getComputedStyle
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

afterEach(() => {
  env = { top: 0, right: 0, bottom: 0, left: 0 };
  reads = 0;
  vi.unstubAllGlobals();
});

describe('safe insets arriving after the first layout', () => {
  it('moves the map below a Dynamic Island inset that appears on frame 2, without a resize event', () => {
    stubDom();
    const view = createView(fakeCanvas());
    expect(view.insets.top).toBe(0);
    const firstOffsetY = view.offsetY;
    const firstScale = view.scale;

    const probe = insetProbe(view);
    expect(probe.tick()).toBe(false); // frame 1: still nothing reported

    env = { top: 59, right: 0, bottom: 34, left: 0 }; // iPhone 15 Pro portrait
    expect(probe.tick()).toBe(true); // frame 2: relayout
    expect(view.insets).toEqual(env);
    // the logical map now starts at or below the island and ends above the home indicator
    expect(view.offsetY).toBeGreaterThanOrEqual(59);
    expect(view.offsetY + C.MAP_H * view.scale).toBeLessThanOrEqual(844 - 34 + 1e-6);
    expect(view.offsetY).not.toBe(firstOffsetY);
    expect(view.scale).toBeLessThanOrEqual(firstScale);

    expect(probe.tick()).toBe(false); // unchanged value: no further relayout
  });

  it('stops reading after INSET_PROBE_FRAMES frames and rearm() opens a new window', () => {
    stubDom();
    const view = createView(fakeCanvas());
    const probe = insetProbe(view);
    for (let i = 0; i < INSET_PROBE_FRAMES; i++) probe.tick();
    const readsInWindow = reads;
    env = { top: 47, right: 0, bottom: 34, left: 0 };
    expect(probe.tick()).toBe(false);
    expect(reads).toBe(readsInWindow); // no getComputedStyle once the window closed
    expect(view.insets.top).toBe(0);

    probe.rearm(); // page became visible again
    expect(probe.tick()).toBe(true);
    expect(view.insets.top).toBe(47);
  });

  it('refreshSafeInsets is a single style read and a no-op when nothing changed', () => {
    stubDom();
    const view = createView(fakeCanvas());
    const before = { scale: view.scale, offsetX: view.offsetX, offsetY: view.offsetY };
    reads = 0;
    expect(refreshSafeInsets(view)).toBe(false);
    expect(reads).toBe(1);
    expect({ scale: view.scale, offsetX: view.offsetX, offsetY: view.offsetY }).toEqual(before);
  });
});
