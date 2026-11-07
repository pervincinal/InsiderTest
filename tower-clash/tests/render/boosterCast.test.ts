import { describe, expect, it } from "vitest";
import type { PlayUi } from "../../src/render/draw";
import type { HudPlayUi } from "../../src/render/hud";
import { boosterColor } from "../../src/render/hud";
import {
  BOOSTER_WELL,
  CAST_FX,
  HUD_OVERLAYS,
  boosterWell,
  castGlints,
  castPopScale,
} from "../../src/render/hudOverlays";
import { BOOSTERS } from "../../src/render/layout";
import {
  COLOR_BLIND_PALETTE,
  DEFAULT_PALETTE,
  shade,
} from "../../src/render/palette";
import type { Palette } from "../../src/render/palette";
import type { BoosterKind, BoosterStatus } from "../../src/ui/boosters";
import { makeLevel } from "../helpers";

/*
 * FEEL-1-5 (feel pass 2026-11-06): a booster cast has its moment at the button — a 150 ms press-pop
 * (1 → 1.12 → 1) and an 8-glint burst in the booster colour on the cast frame — and a running booster is lit
 * (the disc in its colour, a deep well of it under a paper glyph, the cooldown ring kept), no longer the grey
 * disabled look. Reduced motion: the colour swap alone, no pop, no burst. Drawn by the lazy hudOverlays chunk
 * (`HUD_OVERLAYS.booster`); hud.ts draws the cost chip and its tap rects are BOOSTERS' as before.
 */

interface Call {
  fn: string;
  args: unknown[];
  fill: unknown;
  stroke: unknown;
  alpha: unknown;
}

function recCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const store: Record<string | symbol, unknown> = { globalAlpha: 1 };
  const calls: Call[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === "createLinearGradient" || key === "createRadialGradient")
        return () => ({ addColorStop: () => undefined });
      if (key in store) return store[key];
      return (...args: unknown[]) =>
        void calls.push({
          fn: String(key),
          args,
          fill: store.fillStyle,
          stroke: store.strokeStyle,
          alpha: store.globalAlpha,
        });
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
  return { ctx, calls };
}

const status = (
  kind: BoosterKind,
  o: Partial<BoosterStatus> = {}
): BoosterStatus => ({
  kind,
  cost: 40,
  charges: 0,
  affordable: true,
  adOffer: false,
  active: false,
  remainingMs: 0,
  durationMs: kind === "airstrike" ? 0 : 8000,
  ...o,
});

function ui(
  pal: Palette,
  cast: { kind: BoosterKind; at: number } | null,
  targeting = false
): PlayUi {
  const u: HudPlayUi = {
    level: makeLevel(),
    palette: pal,
    alpha: 0,
    selectedTowerId: null,
    paused: false,
    outcome: "playing",
    stars: 0,
    hasNext: true,
    speed: 1,
    coinsEarned: 0,
    coinsTotal: 0,
    hud: { boosters: [], targeting, muted: false, cast },
  } as unknown as HudPlayUi;
  return u;
}

const CX = BOOSTERS.freeze.x + BOOSTERS.freeze.w / 2;
const CY = BOOSTERS.freeze.y + BOOSTERS.disc / 2;
const R = BOOSTERS.disc / 2;
const T0 = 5000;

function disc(
  kind: BoosterKind,
  st: Partial<BoosterStatus>,
  nowMs: number,
  motion: boolean,
  pal: Palette = DEFAULT_PALETTE,
  cast: { kind: BoosterKind; at: number } | null = { kind, at: T0 }
): Call[] {
  const { ctx, calls } = recCtx();
  HUD_OVERLAYS.booster(
    ctx,
    ui(pal, cast),
    status(kind, st),
    CX,
    CY,
    nowMs,
    motion
  );
  return calls;
}
const scales = (calls: Call[]) =>
  calls.filter((c) => c.fn === "scale").map((c) => c.args[0] as number);
/** `moveTo`s drawn: the snowflake has 18 (6 arms × arm + 2 branches), the bolt 1, every glint 1 more. */
const moves = (calls: Call[]) => calls.filter((c) => c.fn === "moveTo").length;

/** WCAG 2 contrast of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * ch((n >> 16) & 255) +
      0.7152 * ch((n >> 8) & 255) +
      0.0722 * ch(n & 255)
    );
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

describe("FEEL-1-5: the booster cast beat at the button", () => {
  it("press-pop: 1 at the cast frame, 1.12 at 75 ms, back to 1 at 150 ms and after; 1 before the cast", () => {
    expect(CAST_FX.popMs).toBe(150);
    expect(castPopScale(-1)).toBe(1);
    expect(castPopScale(0)).toBe(1);
    expect(castPopScale(75)).toBeCloseTo(1.12, 6);
    expect(castPopScale(40)).toBeGreaterThan(1.07);
    expect(castPopScale(149)).toBeLessThan(1.01);
    expect(castPopScale(150)).toBe(1);
    expect(castPopScale(400)).toBe(1);
  });

  it("burst: 8 glints spawn at the rim on the cast frame, fly out ≤ 30 px, fade over their last 60 % and are gone at 360 ms", () => {
    const at0 = castGlints(0, R);
    expect(at0).toHaveLength(8);
    for (const g of at0) {
      expect(Math.hypot(g.dx, g.dy)).toBeCloseTo(R + 2, 6);
      expect(g.alpha).toBe(1);
    }
    // eight directions, 45° apart
    const angles = at0.map((g) =>
      Math.round((Math.atan2(g.dy, g.dx) * 180) / Math.PI)
    );
    expect(new Set(angles).size).toBe(8);
    const mid = castGlints(180, R);
    expect(mid).toHaveLength(8);
    expect(Math.hypot(mid[0]!.dx, mid[0]!.dy)).toBeGreaterThan(R + 20);
    expect(
      Math.max(...castGlints(359, R).map((g) => Math.hypot(g.dx, g.dy)))
    ).toBeLessThanOrEqual(R + 2 + CAST_FX.travel);
    expect(castGlints(100, R)[0]!.alpha).toBe(1);
    expect(castGlints(300, R)[0]!.alpha).toBeLessThan(0.3);
    expect(castGlints(CAST_FX.burstMs, R)).toEqual([]);
    expect(castGlints(-5, R)).toEqual([]);
  });

  it("on the cast frame (before the sim tick): popped, lit and bursting in the booster colour", () => {
    const calls = disc("freeze", { active: false }, T0 + 40, true);
    expect(scales(calls)[0]).toBeCloseTo(castPopScale(40), 6);
    expect(moves(calls)).toBe(18 + 8);
    const sky = boosterColor(DEFAULT_PALETTE, "freeze");
    expect(
      calls.some((c) => c.fn === "fill" && c.fill === sky && c.alpha === 1)
    ).toBe(true); // the glints
    expect(
      calls.some((c) => c.fn === "fill" && c.fill === boosterWell(sky))
    ).toBe(true); // lit before the sim's tick
  });

  it("the burst and the pop end: at 400 ms nothing is scaled and no glint is drawn, the button stays lit while running", () => {
    const calls = disc(
      "overdrive",
      { active: true, remainingMs: 7600 },
      T0 + 400,
      true
    );
    expect(scales(calls).every((k) => k === 1)).toBe(true);
    expect(moves(calls)).toBe(1); // the bolt only
    expect(
      calls.some(
        (c) => c.fn === "fill" && c.fill === boosterWell(DEFAULT_PALETTE.gold)
      )
    ).toBe(true);
  });

  it("active: booster-colour disc, deep well, paper glyph, the cooldown ring kept — not the disabled grey", () => {
    for (const kind of ["overdrive", "freeze"] as const) {
      const calls = disc(
        kind,
        { active: true, remainingMs: 4000 },
        T0 + 2000,
        true,
        DEFAULT_PALETTE,
        null
      );
      const color = boosterColor(DEFAULT_PALETTE, kind);
      const grey = shade(DEFAULT_PALETTE.panel, -0.45);
      expect(
        calls.some(
          (c) =>
            (c.fill === grey || c.stroke === grey) &&
            (c.fn === "fill" || c.fn === "stroke")
        ),
        kind
      ).toBe(false);
      expect(
        calls.some((c) => c.fn === "fill" && c.fill === boosterWell(color)),
        kind
      ).toBe(true);
      const glyph =
        kind === "overdrive"
          ? calls.filter(
              (c) => c.fn === "fill" && c.fill === DEFAULT_PALETTE.paper
            )
          : calls.filter(
              (c) => c.fn === "stroke" && c.stroke === DEFAULT_PALETTE.paper
            );
      expect(glyph.length, kind).toBeGreaterThan(0);
      // the ring: the track, then the remaining half in the booster colour
      const ring = calls.filter((c) => c.fn === "arc" && c.args[2] === R + 2);
      expect(ring.length, kind).toBe(2);
      expect(
        calls.some((c) => c.fn === "stroke" && c.stroke === color),
        kind
      ).toBe(true);
      // no alpha dimming of the disc (the disabled style is 45 %)
      expect(
        calls.filter((c) => c.fn === "fill").every((c) => c.alpha !== 0.45),
        kind
      ).toBe(true);
    }
  });

  it("idle and unaffordable keep their looks; airstrike targeting is still the red disc with a paper crosshair, no well", () => {
    const idle = disc("freeze", {}, T0, true, DEFAULT_PALETTE, null);
    expect(
      idle.some((c) => c.fn === "stroke" && c.stroke === DEFAULT_PALETTE.sky)
    ).toBe(true);
    const poor = disc(
      "freeze",
      { affordable: false },
      T0,
      true,
      DEFAULT_PALETTE,
      null
    );
    expect(
      poor.some(
        (c) =>
          c.fn === "stroke" && c.stroke === shade(DEFAULT_PALETTE.panel, -0.45)
      )
    ).toBe(true);
    const { ctx, calls } = recCtx();
    HUD_OVERLAYS.booster(
      ctx,
      ui(DEFAULT_PALETTE, null, true),
      status("airstrike"),
      CX,
      CY,
      T0,
      true
    );
    const red = DEFAULT_PALETTE.owners.enemy1;
    expect(
      calls.some((c) => c.fn === "stroke" && c.stroke === DEFAULT_PALETTE.paper)
    ).toBe(true);
    expect(
      calls.some((c) => c.fn === "fill" && c.fill === boosterWell(red))
    ).toBe(false);
  });

  it("reduced motion: the colour swap only — no pop, no burst, the ring at full strength", () => {
    const calls = disc(
      "freeze",
      { active: true, remainingMs: 7950 },
      T0 + 40,
      false
    );
    expect(scales(calls).every((k) => k === 1)).toBe(true);
    expect(moves(calls)).toBe(18); // the snowflake's strokes, no glints
    expect(
      calls.some(
        (c) => c.fn === "fill" && c.fill === boosterWell(DEFAULT_PALETTE.sky)
      )
    ).toBe(true);
    expect(
      calls
        .filter((c) => c.fn === "stroke" && c.stroke === DEFAULT_PALETTE.sky)
        .every((c) => c.alpha === 1)
    ).toBe(true);
  });

  it("a cast of another booster leaves this one alone", () => {
    const calls = disc("overdrive", {}, T0 + 40, true, DEFAULT_PALETTE, {
      kind: "freeze",
      at: T0,
    });
    expect(scales(calls).every((k) => k === 1)).toBe(true);
    expect(
      calls.some(
        (c) => c.fn === "fill" && c.fill === boosterWell(DEFAULT_PALETTE.gold)
      )
    ).toBe(false);
  });

  it("active glyph contrast: paper on the well ≥ 4.5 : 1 for overdrive and freeze on both palettes; the well ≥ 3 : 1 on the paper band", () => {
    expect(BOOSTER_WELL.shade).toBe(-0.5);
    for (const pal of [DEFAULT_PALETTE, COLOR_BLIND_PALETTE]) {
      for (const kind of ["overdrive", "freeze"] as const) {
        const well = boosterWell(boosterColor(pal, kind));
        expect(
          contrast(pal.paper, well),
          `${kind} ${well}`
        ).toBeGreaterThanOrEqual(4.5);
        expect(contrast(pal.paper, well)).toBeGreaterThanOrEqual(3);
      }
    }
    expect(boosterWell(DEFAULT_PALETTE.gold)).toBe("#806820");
    expect(boosterWell(DEFAULT_PALETTE.sky)).toBe("#104861");
  });
});
