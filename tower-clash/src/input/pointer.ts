import type { Command, GameState, Road, Tower } from '../sim/types';
import { roadIdFor } from '../sim/create';
import { capacityOf, linksFrom, maxLevelOf, maxLinksOf, relaysOnward } from '../sim/step';
import type { View } from '../render/view';
import { toLogical } from '../render/view';
import { SWIPE_TRAIL_MS, TOWER_HIT_RADIUS, TOWER_RADIUS } from '../render/layout';
import { towerTop } from '../render/sprites';

/* ---------- generic pointer adapter ---------- */

export interface PointerPoint {
  id: number;
  x: number; // logical
  y: number;
  timeMs: number; // performance.now()
}

export interface PointerHandlers {
  down?(p: PointerPoint): void;
  move?(p: PointerPoint): void;
  up?(p: PointerPoint): void;
  cancel?(p: PointerPoint): void;
}

/**
 * Attach Pointer Events (mouse + touch + pen) to the canvas and forward them in logical coords.
 * Only the first active pointer is tracked so multi-touch never produces phantom taps.
 * Returns a detach function.
 *
 * BUG-33 (iOS WKWebView): `touch-action: none` (index.html) is the declarative way to keep a pan on
 * the canvas from becoming a scroll, but WebKit can still hand a touch sequence to the web view's
 * own scroll view, and then it fires `pointercancel` mid-drag. Non-passive `touchstart` /
 * `touchmove` listeners that call `preventDefault()` are the imperative guarantee every WebKit
 * honours: the touch sequence stays with the page. Pointer Events still fire (only the legacy
 * compatibility mouse events and `click` are suppressed — every screen is canvas-drawn and driven by
 * the pointer handlers below, there is no DOM UI to click). `touchend` is left alone, so it keeps its
 * user-activation role (audio unlock, Web Share).
 *
 * `cancel` receives the pointer's LAST KNOWN position (from down / move), not the cancel event's
 * own coordinates: WebKit / Chromium report a `pointercancel` at 0,0 or at a stale spot, and the
 * play screen may finish a drag at the point the finger really was (`PlayGestures.cancel`).
 */
export function attachPointer(canvas: HTMLCanvasElement, view: View, handlers: PointerHandlers): () => void {
  let activeId: number | null = null;
  let last: PointerPoint | null = null;
  const point = (e: PointerEvent): PointerPoint => {
    const l = toLogical(view, e.clientX, e.clientY);
    return { id: e.pointerId, x: l.x, y: l.y, timeMs: performance.now() };
  };
  const onDown = (e: PointerEvent): void => {
    if (activeId !== null) return;
    activeId = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    e.preventDefault();
    last = point(e);
    handlers.down?.(last);
  };
  const onMove = (e: PointerEvent): void => {
    if (activeId !== null && e.pointerId !== activeId) return;
    const p = point(e);
    if (activeId !== null) last = p;
    handlers.move?.(p);
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    last = null;
    e.preventDefault();
    handlers.up?.(point(e));
  };
  const onCancel = (e: PointerEvent): void => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    const p = last ? { ...last, timeMs: performance.now() } : point(e);
    last = null;
    handlers.cancel?.(p);
  };
  const onContext = (e: Event): void => e.preventDefault();
  const onTouch = (e: TouchEvent): void => {
    if (e.cancelable) e.preventDefault();
  };
  const touchOpts: AddEventListenerOptions = { passive: false };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('contextmenu', onContext);
  canvas.addEventListener('touchstart', onTouch, touchOpts);
  canvas.addEventListener('touchmove', onTouch, touchOpts);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('contextmenu', onContext);
    canvas.removeEventListener('touchstart', onTouch, touchOpts);
    canvas.removeEventListener('touchmove', onTouch, touchOpts);
  };
}

/* ---------- hit tests (pure) ---------- */

/** Map point → where it is drawn and its depth scale (the play camera, ART-21 camera.ts `proj`). */
export type HitProjection = (x: number, y: number) => { x: number; y: number; s: number };

/**
 * The tower whose base is nearest to the map point (x, y) within `radius`.
 *
 * With the play camera's `project` (ART-21) the test runs on the screen, against what is drawn: a
 * capsule of radius `radius × max(1, depth)` around the segment from the tower's drawn base up to its
 * drawn roof top (`towerTop × depth` above it), so a tap on the roof of a tall far building selects it
 * and a far tower's target never shrinks below the flat map's 44 pt (Apple HIG minimum) even though
 * its sprite does. Where two capsules overlap, the tower whose base is nearest the tap wins.
 */
export function hitTower(state: GameState, x: number, y: number, radius: number = TOWER_HIT_RADIUS, project?: HitProjection): Tower | null {
  let best: Tower | null = null;
  if (!project) {
    let bestD = radius;
    for (const t of Object.values(state.towers)) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d <= bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }
  const tap = project(x, y);
  let bestBase = Infinity;
  for (const t of Object.values(state.towers)) {
    const p = project(t.x, t.y);
    const roof = p.y - towerTop(t.kind, t.level) * p.s;
    // distance from the tap to the vertical segment roof..base at the tower's drawn column
    const dy = tap.y > p.y ? tap.y - p.y : tap.y < roof ? roof - tap.y : 0;
    if (Math.hypot(tap.x - p.x, dy) > radius * Math.max(1, p.s)) continue;
    const base = Math.hypot(tap.x - p.x, tap.y - p.y);
    if (base < bestBase) {
      bestBase = base;
      best = t;
    }
  }
  return best;
}

/** The lane joining two towers (rules v3: exists iff the straight segment between them is clear), or null. */
export function connectedRoad(state: GameState, a: string, b: string): Road | null {
  return state.roads[roadIdFor(a, b)] ?? null;
}

/* ---------- swipe-to-cut (BUG-33, GDD §2.0b rule 8) ---------- */

export interface XY {
  x: number;
  y: number;
}

/**
 * Part of a stream's lane at each end that a swipe does not cut: the tower body (`TOWER_RADIUS`)
 * — a swipe that merely grazes a tower is not "across the stream".
 */
export const SWIPE_LANE_TRIM = TOWER_RADIUS;

/** Twice the signed area of triangle o-a-b (> 0: b is left of o→a). */
function orient(o: XY, a: XY, b: XY): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Whether `p`, known to be collinear with a–b, lies within their bounding box. */
function within(a: XY, b: XY, p: XY): boolean {
  return Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
}

/** Whether the closed segments a–b and c–d share a point (touching ends and collinear overlap count). */
export function segmentsIntersect(a: XY, b: XY, c: XY, d: XY): boolean {
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (d1 === 0 && within(c, d, a)) || (d2 === 0 && within(c, d, b)) || (d3 === 0 && within(a, b, c)) || (d4 === 0 && within(a, b, d));
}

/** A player stream, as the `unlink` command names it. */
export interface StreamRef {
  from: string;
  to: string;
}

/**
 * The player's streams whose lane the swipe segment a–b crosses (pure, unit-tested). Lanes are
 * straight (rules v3), so each stream is the segment between its towers' centres, trimmed by
 * `SWIPE_LANE_TRIM` at both ends. Only `owner: 'player'` links are ever returned.
 */
export function streamsCrossed(state: GameState, a: XY, b: XY): StreamRef[] {
  const out: StreamRef[] = [];
  for (const l of state.links) {
    if (l.owner !== 'player') continue;
    const s = state.towers[l.from];
    const t = state.towers[l.to];
    if (!s || !t) continue;
    const len = Math.hypot(t.x - s.x, t.y - s.y);
    if (len <= SWIPE_LANE_TRIM * 2) continue;
    const ux = (t.x - s.x) / len;
    const uy = (t.y - s.y) / len;
    const p = { x: s.x + ux * SWIPE_LANE_TRIM, y: s.y + uy * SWIPE_LANE_TRIM };
    const q = { x: t.x - ux * SWIPE_LANE_TRIM, y: t.y - uy * SWIPE_LANE_TRIM };
    if (segmentsIntersect(a, b, p, q)) out.push({ from: l.from, to: l.to });
  }
  return out;
}

/** One point of the swipe slash trail (logical px; `t` on the pointer clock, `performance.now()`). */
export interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

/** Most trail points kept at once (a fast swipe at 120 Hz over `SWIPE_TRAIL_MS` stays well under). */
const TRAIL_MAX = 48;

/* ---------- play gestures → commands ---------- */

const DRAG_THRESHOLD = 14; // logical px before a press counts as a drag
/** How long a refusal (shake + hint bubble: link limit or blocked lane) stays on screen. */
export const LIMIT_HINT_MS = 900;

export interface GestureOptions {
  getState(): GameState | null;
  onCommand(cmd: Command): void;
  /** Localised text for the link-limit refusal (`n` = the level that would allow one more stream). */
  limitHintText?(nextLevel: number): string;
  /** Localised text for a tap on a tower with no clear lane from the selection (`hint.blocked`). */
  blockedHintText?(): string;
  /** Localised text for a stream from a selected tower with no soldiers (`hint.empty`, BUG-10). */
  emptyHintText?(): string;
  /** Localised text for a stream into an own full tower at its top level (`hint.fullTop`, BUG-38). */
  fullTopHintText?(): string;
  /** The play camera (ART-21) while it is on: tower hit areas follow the drawn buildings (`hitTower`). Undefined = the flat map. */
  hitProjection?(): HitProjection | undefined;
}

/** Where a drag from an own tower is right now (for the renderer's rubber-band line). */
export interface DragPreview {
  fromId: string;
  /** The finger, logical px. */
  x: number;
  y: number;
}

/** What a tap / drag from `from` onto `to` should do (pure, unit-tested). */
export type LinkDecision =
  | { kind: 'link' }
  | { kind: 'unlink' }
  | { kind: 'limit'; nextLevel: number }
  | { kind: 'blocked' }
  | { kind: 'empty' }
  | { kind: 'fullTop' }
  | { kind: 'none' };

/**
 * Rules v2 / v3 (GDD §2.0, §2.0b): an existing `from → to` stream toggles off; otherwise a new
 * one starts, unless `from` is at its per-level link limit (L1 = 1, L2 = 2, L3 = 3), which is
 * refused with a hint. A target with no clear lane from `from` is `blocked` (shake + hint); a
 * source with no soldiers is `empty` (shake + hint — the sim would drop the link silently under
 * rules v3 rule 6, BUG-10); stopping an existing stream never needs soldiers.
 * `allowUnlink` is false for drags (a drag always means "link"; dragging onto an existing stream
 * is a no-op).
 */
export function decideLink(state: GameState, from: string, to: string, allowUnlink = true): LinkDecision {
  const src = state.towers[from];
  if (!src || src.owner !== 'player' || from === to || !state.towers[to]) return { kind: 'none' };
  if (!connectedRoad(state, from, to)) return { kind: 'blocked' };
  const links = linksFrom(state, from);
  if (links.some((l) => l.to === to)) return allowUnlink ? { kind: 'unlink' } : { kind: 'none' };
  if (src.units < 1) return { kind: 'empty' }; // same guard as sim `link()` (rules v3 rule 6)
  if (links.length >= maxLinksOf(src)) return { kind: 'limit', nextLevel: src.level + 1 };
  // RELAY-1 (GDD §2.0b rule 13): an own full tower that streams onward relays every arrival, so a
  // stream into it is a supply line through it (`link`; it replaced BUG-35's `hint.full` refusal).
  // BUG-38: a full tower at its top level with no onward stream has nothing to grow into and would
  // end the stream on the sim's next tick (`targetFull`) — refused with its own text. A full tower
  // below its top level without a stream upgrades on its next tick, so a stream into it is fine.
  const dst = state.towers[to]!;
  if (dst.owner === 'player' && dst.units >= capacityOf(dst, state) && dst.level >= maxLevelOf(dst) && !relaysOnward(state, dst)) {
    return { kind: 'fullTop' };
  }
  return { kind: 'link' };
}

/**
 * Tap own tower = select; tap a tower with a clear lane from it = start a stream (or stop it when
 * that stream exists; refused with a hint at the link limit); tap a blocked tower = shake + hint;
 * tap the selected tower again = deselect; tap empty = deselect; drag own tower → tower = link;
 * a drag that starts anywhere else (empty ground, a neutral or enemy tower) is a swipe: every player
 * stream its path crosses is cut on the spot (`unlink`, once per stream per swipe — BUG-33).
 * Only ever produces sim commands for owner 'player'.
 */
export class PlayGestures {
  selectedTowerId: string | null = null;
  hoverTowerId: string | null = null;
  /**
   * A drag from an own tower in progress: the renderer draws a line from that tower to the finger
   * (snapping onto `hoverTowerId` when the finger is over a reachable target). Null otherwise.
   */
  drag: DragPreview | null = null;
  /**
   * Refusal for the renderer (`PlayUi.limitHint` / `limitHintText`): a fresh object per refusal
   * (the renderer keys its shake on the object identity), null once it expired.
   */
  limitHint: { until: number } | null = null;
  limitHintText = '';
  /**
   * Swipe-to-cut slash trail for the renderer (`PlayUi.swipeTrail`), oldest first. Points older than
   * `SWIPE_TRAIL_MS` are dropped by `tick`, so the trail fades out on its own after the finger lifts.
   */
  readonly trail: TrailPoint[] = [];

  private downTowerId: string | null = null;
  private downX = 0;
  private downY = 0;
  private moved = false;
  private pointerDown = false;
  /** The press started off an own tower: once it moves past the threshold it is a swipe (cuts streams). */
  private swipe = false;
  /** End of the swipe polyline so far (the down point until the first move past the threshold). */
  private swipeX = 0;
  private swipeY = 0;
  /** Streams (`from>to`) this swipe already cut: the sim applies the `unlink` on its next tick. */
  private readonly cut = new Set<string>();

  constructor(private readonly opts: GestureOptions) {}

  reset(): void {
    this.selectedTowerId = null;
    this.hoverTowerId = null;
    this.drag = null;
    this.limitHint = null;
    this.limitHintText = '';
    this.trail.length = 0;
    this.clearPress();
  }

  private clearPress(): void {
    this.downTowerId = null;
    this.drag = null;
    this.moved = false;
    this.pointerDown = false;
    this.swipe = false;
    this.cut.clear();
  }

  /** A press is under way and has moved past the drag threshold. */
  get dragging(): boolean {
    return this.pointerDown && this.moved;
  }

  down(p: PointerPoint): void {
    const state = this.opts.getState();
    if (!state) return;
    this.pointerDown = true;
    this.moved = false;
    this.downX = p.x;
    this.downY = p.y;
    const tower = hitTower(state, p.x, p.y, TOWER_HIT_RADIUS, this.opts.hitProjection?.());
    this.downTowerId = tower ? tower.id : null;
    this.swipe = tower?.owner !== 'player';
    this.swipeX = p.x;
    this.swipeY = p.y;
    this.cut.clear();
  }

  /** Extend the swipe polyline to `p`: cut every player stream the new piece crosses (live), grow the trail. */
  private swipeTo(state: GameState, p: PointerPoint): void {
    for (const s of streamsCrossed(state, { x: this.swipeX, y: this.swipeY }, p)) {
      const key = `${s.from}>${s.to}`;
      if (this.cut.has(key)) continue;
      this.cut.add(key);
      this.opts.onCommand({ type: 'unlink', owner: 'player', from: s.from, to: s.to });
    }
    if (this.trail.length === 0) this.trail.push({ x: this.swipeX, y: this.swipeY, t: p.timeMs });
    this.trail.push({ x: p.x, y: p.y, t: p.timeMs });
    if (this.trail.length > TRAIL_MAX) this.trail.splice(0, this.trail.length - TRAIL_MAX);
    this.swipeX = p.x;
    this.swipeY = p.y;
  }

  move(p: PointerPoint): void {
    const state = this.opts.getState();
    if (!state) return;
    if (this.pointerDown && Math.hypot(p.x - this.downX, p.y - this.downY) > DRAG_THRESHOLD) this.moved = true;
    if (this.pointerDown && this.moved && this.swipe) {
      this.hoverTowerId = null;
      this.swipeTo(state, p);
      return;
    }
    // Hover highlight only while dragging from an own tower (the target preview).
    const src = this.downTowerId ? state.towers[this.downTowerId] : undefined;
    if (this.pointerDown && this.moved && src?.owner === 'player') {
      const t = hitTower(state, p.x, p.y, TOWER_HIT_RADIUS, this.opts.hitProjection?.());
      this.hoverTowerId = t && t.id !== src.id && connectedRoad(state, src.id, t.id) ? t.id : null;
      this.drag = { fromId: src.id, x: p.x, y: p.y };
    } else {
      this.hoverTowerId = null;
      this.drag = null;
    }
  }

  up(p: PointerPoint): void {
    const state = this.opts.getState();
    const downTowerId = this.downTowerId;
    const moved = this.moved;
    // the last piece of a swipe (the finger may lift without a final move event at this point)
    if (state && this.pointerDown && moved && this.swipe && (p.x !== this.swipeX || p.y !== this.swipeY)) this.swipeTo(state, p);
    this.hoverTowerId = null;
    this.clearPress();
    if (!state) return;

    const target = hitTower(state, p.x, p.y, TOWER_HIT_RADIUS, this.opts.hitProjection?.());
    const src = downTowerId ? state.towers[downTowerId] : undefined;

    // Drag from own tower onto another tower → link (blocked lane: shake + hint); the source stays selected.
    if (moved && src && src.owner === 'player') {
      if (target && target.id !== src.id) {
        this.selectedTowerId = src.id;
        this.act(state, src.id, target.id, p.timeMs, false);
      }
      return;
    }
    if (moved) return; // a swipe (started on empty ground / a foreign tower): its cuts already happened live

    // Tap.
    if (!target) {
      this.selectedTowerId = null;
      return;
    }
    const selected = this.selectedTowerId ? state.towers[this.selectedTowerId] : undefined;
    if (selected && selected.owner !== 'player') this.selectedTowerId = null;
    const sel = this.selectedTowerId ? state.towers[this.selectedTowerId] : undefined;

    if (sel && sel.id === target.id) {
      this.selectedTowerId = null; // rules v2: no manual upgrade — the second tap just deselects
      return;
    }
    if (sel && connectedRoad(state, sel.id, target.id)) {
      this.act(state, sel.id, target.id, p.timeMs, true);
      return;
    }
    if (target.owner === 'player') {
      // another own tower (connected or not): the tap moves the selection there
      this.selectedTowerId = target.id;
      return;
    }
    if (sel) {
      // foreign tower with no clear lane from the selection: refuse visibly, keep the selection
      this.act(state, sel.id, target.id, p.timeMs, true);
      return;
    }
    this.selectedTowerId = null;
  }

  /**
   * The press ends without a regular `up`: pause, a HUD takeover, or a `pointercancel` from the
   * platform. `at` (only passed for a platform cancel: the pointer's last known position) finishes a
   * drag from an own tower as if the finger had lifted there (BUG-33): iOS WKWebView may cancel a
   * touch it decided to treat as a system gesture / scroll after the player already dragged onto
   * the target, and dropping that drag made "drag to attack" fail silently. A swipe's cuts already
   * happened live, a tap that never moved stays cancelled (a cancel is not a tap).
   */
  cancel(at?: PointerPoint): void {
    const state = this.opts.getState();
    const src = state && this.downTowerId ? state.towers[this.downTowerId] : undefined;
    if (at && this.pointerDown && this.moved && src?.owner === 'player') {
      this.up(at);
      return;
    }
    this.hoverTowerId = null;
    this.clearPress();
  }

  /** Call once per frame so the refusal hint expires and the swipe trail fades. */
  tick(nowMs: number): void {
    if (this.limitHint && nowMs >= this.limitHint.until) {
      this.limitHint = null;
      this.limitHintText = '';
    }
    let old = 0;
    while (old < this.trail.length && nowMs - this.trail[old]!.t >= SWIPE_TRAIL_MS) old++;
    if (old > 0) this.trail.splice(0, old);
  }

  /** Apply `decideLink` for a gesture from `from` onto `to`: emit the command or raise a refusal hint. */
  private act(state: GameState, from: string, to: string, nowMs: number, allowUnlink: boolean): void {
    const d = decideLink(state, from, to, allowUnlink);
    switch (d.kind) {
      case 'link':
        this.opts.onCommand({ type: 'link', owner: 'player', from, to });
        return;
      case 'unlink':
        this.opts.onCommand({ type: 'unlink', owner: 'player', from, to });
        return;
      case 'limit':
        this.limitHint = { until: nowMs + LIMIT_HINT_MS };
        this.limitHintText = this.opts.limitHintText?.(d.nextLevel) ?? `L${d.nextLevel}`;
        return;
      case 'blocked':
        this.limitHint = { until: nowMs + LIMIT_HINT_MS };
        this.limitHintText = this.opts.blockedHintText?.() ?? 'Blocked';
        return;
      case 'empty':
        this.limitHint = { until: nowMs + LIMIT_HINT_MS };
        this.limitHintText = this.opts.emptyHintText?.() ?? 'No soldiers';
        return;
      case 'fullTop':
        this.limitHint = { until: nowMs + LIMIT_HINT_MS };
        this.limitHintText = this.opts.fullTopHintText?.() ?? 'Full';
        return;
      case 'none':
        return;
    }
  }
}
