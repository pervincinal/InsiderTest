import { afterEach, describe, expect, it, vi } from 'vitest';
import { DPR_CAP, canvasBytes, createView, effectiveDpr, setDprCap } from '../../src/render/view';
import { C } from '../../src/sim/constants';

/*
 * MM-4 device-pixel-ratio cap. The three viewport canvases (PERF-3) cost cssW × cssH × dpr² × 4
 * bytes each, so the cap is the one knob that bounds canvas memory on DPR-3 phones.
 */

/** Minimal canvas stand-in for `createView` / `resize` (no DOM in vitest's node environment). */
function fakeCanvas(): HTMLCanvasElement {
  const ctx = new Proxy({} as CanvasRenderingContext2D, { get: () => () => undefined });
  return {
    width: 0,
    height: 0,
    style: {} as CSSStyleDeclaration,
    parentElement: null,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

function stubWindow(innerWidth: number, innerHeight: number, devicePixelRatio: number): void {
  vi.stubGlobal('window', { innerWidth, innerHeight, devicePixelRatio });
}

afterEach(() => {
  setDprCap(undefined);
  vi.unstubAllGlobals();
});

describe('effectiveDpr', () => {
  it('caps a Capacitor shell at DPR_CAP.native and the web at DPR_CAP.web', () => {
    expect(DPR_CAP.native).toBe(2);
    expect(DPR_CAP.web).toBe(2.5);
    expect(effectiveDpr(3, true)).toBe(2);
    expect(effectiveDpr(2.75, true)).toBe(2);
    expect(effectiveDpr(3, false)).toBe(2.5);
    expect(effectiveDpr(2.625, false)).toBe(2.5);
  });
  it('never upscales a low-DPR device and never goes below 1', () => {
    expect(effectiveDpr(2, true)).toBe(2);
    expect(effectiveDpr(1.5, false)).toBe(1.5);
    expect(effectiveDpr(1, true)).toBe(1);
    expect(effectiveDpr(0.5, false)).toBe(1);
    expect(effectiveDpr(NaN, false)).toBe(1);
  });
  it('honours an explicit override up to DPR_CAP.max', () => {
    expect(effectiveDpr(3, true, 3)).toBe(3);
    expect(effectiveDpr(3, true, 2.5)).toBe(2.5);
    expect(effectiveDpr(3.5, false, 5)).toBe(DPR_CAP.max);
    setDprCap(1.5);
    expect(effectiveDpr(3, false)).toBe(1.5);
    setDprCap(9);
    expect(effectiveDpr(3.5, true)).toBe(DPR_CAP.max);
    setDprCap(undefined);
    expect(effectiveDpr(3, true)).toBe(DPR_CAP.native);
  });
  it('reads ?dprcap= from the page URL when no code override is set', () => {
    vi.stubGlobal('location', { search: '?dprcap=3' });
    expect(effectiveDpr(3, true)).toBe(3);
    vi.stubGlobal('location', { search: '?x=1&dprcap=abc' });
    expect(effectiveDpr(3, true)).toBe(2);
  });
});

describe('resize with the cap', () => {
  it('sizes an iPhone-class 390×844 DPR-3 viewport to 975×2110 on the web (≈ 7.8 MB per layer)', () => {
    stubWindow(390, 844, 3);
    const view = createView(fakeCanvas());
    expect(view.dpr).toBe(2.5);
    expect([view.canvas.width, view.canvas.height]).toEqual([975, 2110]);
    expect(view.canvas.style.width).toBe('390px');
    // Logical map still fits width-first: 390 / 720 CSS px per logical px.
    expect(view.scale).toBeCloseTo(390 / C.MAP_W, 6);
    const perLayer = canvasBytes(390, 844, view.dpr);
    expect(perLayer).toBe(975 * 2110 * 4);
    expect((3 * perLayer) / 1048576).toBeLessThan(24);
  });
  it('keeps the three layers under 20 MB at DPR 2 (native cap) versus 33.9 MB uncapped', () => {
    const uncapped = 3 * canvasBytes(390, 844, 3);
    const native = 3 * canvasBytes(390, 844, effectiveDpr(3, true));
    expect(uncapped).toBe(1170 * 2532 * 4 * 3);
    expect(uncapped / 1048576).toBeCloseTo(33.9, 1);
    expect(native / 1048576).toBeLessThan(20);
    // Even at DPR 2 a 390 px wide phone draws > 1 device px per logical px (no downsampling).
    expect((390 / C.MAP_W) * 2).toBeGreaterThan(1);
  });
  it('leaves DPR ≤ 2 devices untouched (SE-class iPhones, most tablets)', () => {
    stubWindow(375, 667, 2);
    const view = createView(fakeCanvas());
    expect(view.dpr).toBe(2);
    expect([view.canvas.width, view.canvas.height]).toEqual([750, 1334]);
  });
});
