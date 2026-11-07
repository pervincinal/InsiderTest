import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayUi } from "../../src/render/draw";
import { drawGame } from "../../src/render/draw";
import type { HudPlayUi } from "../../src/render/hud";
import { DEFAULT_PALETTE } from "../../src/render/palette";
import type { View } from "../../src/render/view";
import type { Outcome } from "../../src/sim/types";
import { createState } from "../../src/sim/create";
import { setReducedMotionOverride } from "../../src/ui/motion";
import { makeLevel } from "../helpers";

/*
 * FEEL-1-7 (feel pass 2026-11-06): on a defeat the world's grey veil (draw.ts, rgba(120,130,150,·)) used to
 * cover the 600 ms result beat from its first frame (+38 ms), muting the lost home's F15 crack rim, while
 * a win's beat stayed undimmed. Now: no veil during the beat (`resultBeat`), then from the result card's
 * first frame it ramps 0 → 0.28 over 300 ms under the dim; reduced motion: full at once after the beat.
 * The win path is unchanged (no veil; its dim only after the beat). The card's own timeline (`since`) is
 * untouched: same first frame, same clock.
 */

const VEIL = /^rgba\(120, ?130, ?150, ?([\d.]+)\)$/;
const DIM_LOST = "rgba(70, 80, 100, 0.58)";
const DIM_WON = "rgba(26, 58, 90, 0.5)";

function recordingCtx(fills: string[]): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = {};
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === "measureText")
        return (s: string) => ({
          width: s.length * 10,
          actualBoundingBoxAscent: 8,
          actualBoundingBoxDescent: 2,
        });
      if (key === "getImageData")
        return () => ({ data: new Uint8ClampedArray(4) });
      if (
        key === "createLinearGradient" ||
        key === "createRadialGradient" ||
        key === "createPattern"
      )
        return () => ({ addColorStop: () => undefined });
      if (key in store) return store[key];
      return () => {
        if (key === "fillRect") fills.push(String(store.fillStyle));
      };
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

vi.stubGlobal("document", {
  createElement: () => ({
    width: 0,
    height: 0,
    style: {},
    getContext: () => recordingCtx([]),
  }),
});
let clock = 0;
vi.spyOn(performance, "now").mockImplementation(() => clock);
const level = makeLevel();

afterEach(() => setReducedMotionOverride(null));

/** A result sequence on one state: `frame(nowMs, beat)` draws one frame and returns its full-screen fills. */
function match(outcome: Outcome) {
  const state = createState(level, 1);
  return (nowMs: number, beat: boolean): string[] => {
    clock += 1000; // draw.ts re-reads the motion preference at most every 500 ms
    const fills: string[] = [];
    const ctx = recordingCtx(fills);
    const view = {
      canvas: { width: 360, height: 640 },
      ctx,
      dpr: 1,
      cssW: 360,
      cssH: 640,
      scale: 0.5,
      offsetX: 0,
      offsetY: 0,
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    } as unknown as View;
    const ui: HudPlayUi = {
      level,
      palette: DEFAULT_PALETTE,
      alpha: 0,
      selectedTowerId: null,
      paused: false,
      outcome,
      stars: outcome === "won" ? 3 : 0,
      hasNext: true,
      speed: 1,
      coinsEarned: 0,
      coinsTotal: 0,
      resultBeat: beat || undefined,
      hud: { boosters: [], targeting: false, muted: false },
    } as unknown as HudPlayUi;
    drawGame(ctx, state, view, ui as PlayUi, nowMs);
    return fills;
  };
}
const veilOf = (fills: string[]): number | null => {
  const v = fills.map((f) => VEIL.exec(f)).find((m) => m);
  return v ? Number(v[1]) : null;
};

const OUT = 10_000; // the outcome's frame clock; the beat runs OUT … OUT + 600
const CARD = OUT + 600; // the result card's first frame

describe("FEEL-1-7: the defeat veil waits for the result beat", () => {
  it("defeat: no veil and no dim through the 600 ms beat (the crack flash reads in colour)", () => {
    const frame = match("lost");
    for (const t of [OUT + 16, OUT + 38, OUT + 300, OUT + 590]) {
      const fills = frame(t, true);
      expect(veilOf(fills), `+${t - OUT} ms`).toBeNull();
      expect(fills).not.toContain(DIM_LOST);
    }
  });

  it("defeat: after the beat the veil ramps 0 → 0.28 over 300 ms under the dim, then holds", () => {
    const frame = match("lost");
    frame(OUT + 300, true);
    const first = frame(CARD, false);
    expect(first).toContain(DIM_LOST);
    expect(veilOf(first) ?? 0).toBe(0);
    expect(veilOf(frame(CARD + 75, false))).toBeCloseTo(0.07, 6);
    expect(veilOf(frame(CARD + 150, false))).toBeCloseTo(0.14, 6);
    expect(veilOf(frame(CARD + 300, false))).toBeCloseTo(0.28, 6);
    expect(veilOf(frame(CARD + 2000, false))).toBeCloseTo(0.28, 6);
    // the veil is under the dim (the world, not the card)
    const f = frame(CARD + 2100, false);
    expect(f.findIndex((x) => VEIL.test(x))).toBeLessThan(f.indexOf(DIM_LOST));
  });

  it("reduced motion: an immediate cut to the full veil after the beat, none during it", () => {
    setReducedMotionOverride(true);
    const frame = match("lost");
    expect(veilOf(frame(OUT + 100, true))).toBeNull();
    frame(CARD, false);
    expect(veilOf(frame(CARD + 16, false))).toBeCloseTo(0.28, 6);
  });

  it("win: unchanged — never a veil; no dim during the beat, its dim after", () => {
    const frame = match("won");
    for (const t of [OUT + 38, OUT + 590]) {
      const fills = frame(t, true);
      expect(veilOf(fills)).toBeNull();
      expect(fills).not.toContain(DIM_WON);
    }
    for (const t of [CARD, CARD + 150, CARD + 2000]) {
      const fills = frame(t, false);
      expect(veilOf(fills)).toBeNull();
      expect(fills).toContain(DIM_WON);
    }
  });
});
