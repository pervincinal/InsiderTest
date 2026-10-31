/**
 * AUD-Q8: the on-screen frame-time overlay for the on-device check TF-13
 * (docs/publishing/TESTFLIGHT_TEST_PLAN.md). A lazy chunk: main.ts only checks the flag (`?perf=1`, or
 * `settings.perfOverlay`, toggled by five taps on the version line of Settings → About within 2 s) and
 * `import()`s this module when it is on, so a player who never turns it on downloads none of it.
 *
 * A small chip, top left: fps and the p95 frame interval of the last 2 s, the marching units on the map
 * and the long frames since the screen opened (with how many seconds that count covers), over a
 * 60-frame sparkline (one bar per frame, the 16.7 ms line drawn across). Text at the 22 px floor
 * (`font`, scaled by the text size). On the play screen it sits just under the top HUD band and keeps
 * clear of every tower body, badge, stream / mine chip and the select hint the way the select hint does
 * (BUG-57's rules: the candidate rows and columns of hud.ts `selectHintScan` — the band's edges and
 * SELECT_HINT.clear beside each obstacle — plus the map's left edge, scored by `selectHintCover`; the first
 * clear row from the top, its leftmost spot), re-placed once a second; it is not drawn while the lesson card or a tutorial bubble is
 * up (both sit on the top of the map) — its count restarts when it shows again, so on a level with a
 * lesson card the seconds are seconds of play. Other screens: top left, under the safe area. It draws only: a
 * tap on it lands on whatever is under it.
 *
 * Its numbers are `window.__towerclash.perf.getStats()` (src/debug.ts) for the e2e.
 */
import type { View } from '../render/view';
import { applyTransform, bleed, hudAnchors } from '../render/view';
import { HUD } from '../render/layout';
import type { Rect } from '../render/widgets';
import { font, roundRect, textPx } from '../render/widgets';
import { SELECT_HINT, selectHintCover } from '../render/hud';
import { C } from '../sim/constants';
import { frameWorldLayout } from '../render/worldChips';
import type { FrameStatsSnapshot } from './perfStats';
import { FrameStats, PERF_STATS } from './perfStats';
import type { PlayScreen } from './play';
import type { Screen } from './screens';

/** What the overlay reads from the app each frame (main.ts `TowerClashApp`). */
export interface PerfHost {
  readonly view: View;
  readonly current: Screen;
  readonly play: PlayScreen | null;
}

/** `getStats()`: the frame statistics, the units on the map (null off the play screen), the screen and where the chip was drawn. */
export interface PerfOverlayStats extends FrameStatsSnapshot {
  units: number | null;
  screen: string;
  /** The chip in logical px at the last frame, or null when it was not drawn. */
  chip: Rect | null;
}

export interface PerfOverlay {
  /** Record the frame at rAF time `nowMs` and draw the chip over it (after the screen drew). */
  frame(host: PerfHost, nowMs: number): void;
  stats(): PerfOverlayStats;
}

/** Chip geometry (logical px): padding, gap to the band / screen edge, sparkline bar pitch and height, text refresh. */
export const PERF_CHIP = Object.freeze({ pad: 12, gap: 8, bar: 4, sparkH: 30, textPx: 22, refreshMs: 250, placeMs: 1000 });

/** The p95 colour: green within the 60 Hz budget (+ vsync jitter), amber up to a long frame, red past it. */
export function p95Colour(ms: number): string {
  return ms <= 17 ? '#7be08a' : ms <= PERF_STATS.longFrameMs ? '#ffd23f' : '#ff7a6b';
}

/** The chip's two lines for `s` (numbers only besides fps / p95 / ms / units / long / s, the same in every language). */
export function perfLines(s: Pick<PerfOverlayStats, 'fps' | 'p95Ms' | 'longFrames' | 'sinceMs' | 'units'>): [string, string] {
  const units = s.units === null ? '' : ` · ${s.units} units`;
  return [`${Math.round(s.fps)} fps · p95 ${s.p95Ms.toFixed(1)} ms`, `long ${s.longFrames} · ${Math.floor(s.sinceMs / 1000)} s${units}`];
}

/**
 * Where a `w` × `h` chip goes on the play screen: the first row from the top of the map band (under the
 * top HUD band) with a spot clear of `obstacles`, its leftmost such spot; else the spot that covers the least.
 */
export function placeOnMap(w: number, h: number, topY: number, bottomY: number, obstacles: readonly Rect[]): Rect {
  const g = SELECT_HINT.clear;
  const y1 = bottomY - h;
  const edges = obstacles.flatMap((o) => [Math.ceil(o.y + o.h + g), Math.floor(o.y - g - h)]);
  const ys = [...new Set([topY, y1, ...edges])].filter((y) => y >= topY && y <= y1).sort((p, q) => p - q);
  let best: Rect | null = null;
  let bestCover = Infinity;
  for (const y of ys) {
    const row = obstacles.filter((o) => o.y < y + h + g && y - g < o.y + o.h);
    const xs = [...new Set([4, ...row.flatMap((o) => [Math.ceil(o.x + o.w + g), Math.floor(o.x - g - w)])])].filter((x) => x >= 4 && x + w <= C.MAP_W - 4).sort((p, q) => p - q);
    for (const x of xs) {
      const r = { x, y, w, h };
      const cover = selectHintCover(r, obstacles);
      if (cover === 0) return r;
      if (cover < bestCover) {
        best = r;
        bestCover = cover;
      }
    }
  }
  return best ?? { x: 4, y: topY, w, h };
}

export function createPerfOverlay(): PerfOverlay {
  const ring = new FrameStats();
  const spark = new Float32Array(PERF_STATS.sparkFrames);
  let screen: Screen | null = null;
  let lastNow = 0;
  let shown: FrameStatsSnapshot | null = null;
  let shownAt = -Infinity;
  let lines: [string, string] = ['', ''];
  let units: number | null = null;
  let chip: Rect | null = null;
  let placed: { key: string; at: number; rect: Rect } | null = null;
  let widthFor: { key: string; w: number } | null = null;
  let hidden = false;

  const place = (host: PerfHost, w: number, h: number, nowMs: number): Rect => {
    const view = host.view;
    const s = view.scale > 0 ? view.scale : 1;
    const b = bleed(view);
    const play = host.current === host.play ? host.play : null;
    const key = `${play ? 'play' : 'menu'}|${w}|${h}|${view.cssW}x${view.cssH}`;
    if (placed && placed.key === key && nowMs - placed.at < PERF_CHIP.placeMs) return placed.rect;
    let rect: Rect;
    if (play) {
      const a = hudAnchors(view);
      const layout = frameWorldLayout(play.state);
      const obstacles: Rect[] = [];
      if (layout) {
        for (const r of layout.bodies.values()) obstacles.push(r);
        for (const p of layout.badges.values()) obstacles.push(p.rect);
        for (const c of layout.chips) obstacles.push(c.rect);
        if (layout.hint) obstacles.push(layout.hint.rect);
      }
      rect = placeOnMap(w, h, HUD.mapTop + a.top + PERF_CHIP.gap, HUD.mapBottom + a.bottom - PERF_CHIP.gap, obstacles);
    } else {
      const safeTop = Math.max(b.top, (view.insets.top - view.offsetY) / s);
      const safeLeft = Math.max(b.left, (view.insets.left - view.offsetX) / s);
      rect = { x: safeLeft + PERF_CHIP.gap, y: safeTop + PERF_CHIP.gap, w, h };
    }
    placed = { key, at: nowMs, rect };
    return rect;
  };

  const draw = (host: PerfHost, nowMs: number): void => {
    const view = host.view;
    const ctx = view.ctx;
    ctx.save();
    applyTransform(view);
    const f = font(PERF_CHIP.textPx, '700');
    ctx.font = f;
    const lineH = Math.round(textPx(PERF_CHIP.textPx) * 1.25);
    const sparkW = PERF_STATS.sparkFrames * PERF_CHIP.bar;
    // sized for the widest numbers, so the chip (and its spot) does not change with every reading
    const wide = `${f}|${units === null}`;
    if (widthFor?.key !== wide) {
      const t = perfLines({ fps: 888, p95Ms: 88.8, longFrames: 888, sinceMs: 888_000, units: units === null ? null : 888 });
      widthFor = { key: wide, w: Math.max(ctx.measureText(t[0]).width, ctx.measureText(t[1]).width) };
    }
    const textW = Math.max(widthFor.w, ctx.measureText(lines[0]).width, ctx.measureText(lines[1]).width);
    const w = Math.ceil(Math.max(textW, sparkW) + 2 * PERF_CHIP.pad);
    const h = 2 * lineH + PERF_CHIP.sparkH + 2 * PERF_CHIP.pad + 4;
    const r = place(host, w, h, nowMs);
    chip = r;
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = '#0e1422';
    roundRect(ctx, r, 14);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = shown ? p95Colour(shown.p95Ms) : '#ffffff';
    ctx.fillText(lines[0], r.x + PERF_CHIP.pad, r.y + PERF_CHIP.pad);
    ctx.fillStyle = shown && shown.longFrames > 0 ? '#ffd23f' : '#ffffff';
    ctx.fillText(lines[1], r.x + PERF_CHIP.pad, r.y + PERF_CHIP.pad + lineH);
    // sparkline: one bar per frame, 0–50 ms tall, the 60 Hz budget as a line
    const x0 = r.x + PERF_CHIP.pad;
    const base = r.y + r.h - PERF_CHIP.pad;
    const n = ring.spark(spark);
    const scale = PERF_CHIP.sparkH / 50;
    for (let i = spark.length - n; i < spark.length; i++) {
      const d = spark[i]!;
      ctx.fillStyle = d > PERF_STATS.longFrameMs ? '#ff7a6b' : d > 17 ? '#ffd23f' : '#7be08a';
      const bh = Math.max(1, Math.min(PERF_CHIP.sparkH, d * scale));
      ctx.fillRect(x0 + i * PERF_CHIP.bar, base - bh, PERF_CHIP.bar - 1, bh);
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(x0, base - PERF_STATS.budgetMs * scale, sparkW, 1.5);
    ctx.restore();
  };

  return {
    frame(host, nowMs) {
      if (host.current !== screen) {
        screen = host.current;
        hidden = false;
        ring.reset(nowMs);
        shownAt = -Infinity;
        placed = null;
      }
      ring.frame(nowMs);
      lastNow = nowMs;
      const play = host.current === host.play ? host.play : null;
      units = play ? play.state.units.length : null;
      if (nowMs - shownAt >= PERF_CHIP.refreshMs) {
        shown = ring.stats(nowMs);
        shownAt = nowMs;
        lines = perfLines({ ...shown, units });
      }
      // the lesson card and the tutorial bubble own the top of the map while they are up; the count starts
      // afresh when the chip comes back, so "long N · 30 s" on a level is 30 s of play (TF-13)
      if (play && (play.cardUp || play.tutorialStep() !== null)) {
        chip = null;
        hidden = true;
        return;
      }
      if (hidden) {
        hidden = false;
        ring.reset(nowMs);
        ring.frame(nowMs);
        shownAt = -Infinity;
      }
      draw(host, nowMs);
    },
    stats() {
      return { ...ring.stats(lastNow), units, screen: screen?.name ?? '', chip };
    },
  };
}
