import type { Command, GameState, Road, Tower } from '../sim/types';
import { roadIdFor } from '../sim/create';
import { linksFrom, maxLinksOf, roadPointAt } from '../sim/step';
import type { View } from '../render/view';
import { toLogical } from '../render/view';
import { ROAD_HIT_RADIUS, TOWER_HIT_RADIUS } from '../render/layout';

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
 */
export function attachPointer(canvas: HTMLCanvasElement, view: View, handlers: PointerHandlers): () => void {
  let activeId: number | null = null;
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
    handlers.down?.(point(e));
  };
  const onMove = (e: PointerEvent): void => {
    if (activeId !== null && e.pointerId !== activeId) return;
    handlers.move?.(point(e));
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    e.preventDefault();
    handlers.up?.(point(e));
  };
  const onCancel = (e: PointerEvent): void => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    handlers.cancel?.(point(e));
  };
  const onContext = (e: Event): void => e.preventDefault();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('contextmenu', onContext);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('contextmenu', onContext);
  };
}

/* ---------- hit tests (pure) ---------- */

export function hitTower(state: GameState, x: number, y: number, radius: number = TOWER_HIT_RADIUS): Tower | null {
  let best: Tower | null = null;
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

/** Intact bridge whose midpoint is within `radius` of the point. */
export function hitBridgeMidpoint(state: GameState, x: number, y: number, radius: number = ROAD_HIT_RADIUS): Road | null {
  let best: Road | null = null;
  let bestD = radius;
  for (const r of Object.values(state.roads)) {
    if (r.kind !== 'bridge' || r.cut) continue;
    const m = roadPointAt(r, 0.5);
    const d = Math.hypot(m.x - x, m.y - y);
    if (d <= bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

export function connectedRoad(state: GameState, a: string, b: string): Road | null {
  const road = state.roads[roadIdFor(a, b)];
  return road && !road.cut ? road : null;
}

/* ---------- play gestures → commands ---------- */

export const LONG_PRESS_MS = 500;
const DRAG_THRESHOLD = 14; // logical px before a press counts as a drag
/** How long the link-limit refusal (shake + hint bubble) stays on screen. */
export const LIMIT_HINT_MS = 900;

export interface GestureOptions {
  getState(): GameState | null;
  onCommand(cmd: Command): void;
  /** Localised text for the link-limit refusal (`n` = the level that would allow one more stream). */
  limitHintText?(nextLevel: number): string;
}

/** What a tap / drag from `from` onto `to` should do under rules v2 (pure, unit-tested). */
export type LinkDecision = { kind: 'link' } | { kind: 'unlink' } | { kind: 'limit'; nextLevel: number } | { kind: 'none' };

/**
 * Rules v2 (GDD §2.0): an existing `from → to` stream toggles off; otherwise a new one starts,
 * unless `from` is at its per-level link limit (L1 = 1, L2 = 2, L3 = 3), which is refused with a
 * hint. `allowUnlink` is false for drags (a drag always means "link"; dragging onto an existing
 * stream is a no-op).
 */
export function decideLink(state: GameState, from: string, to: string, allowUnlink = true): LinkDecision {
  const src = state.towers[from];
  if (!src || src.owner !== 'player' || from === to || !connectedRoad(state, from, to)) return { kind: 'none' };
  const links = linksFrom(state, from);
  if (links.some((l) => l.to === to)) return allowUnlink ? { kind: 'unlink' } : { kind: 'none' };
  if (links.length >= maxLinksOf(src)) return { kind: 'limit', nextLevel: src.level + 1 };
  return { kind: 'link' };
}

/**
 * Tap own tower = select; tap a connected tower = start a stream to it (or stop it when that
 * stream exists; refused with a hint at the link limit); tap the selected tower again = deselect;
 * tap empty = deselect; drag own tower → tower = link; long-press an intact bridge midpoint = cut.
 * Only ever produces sim commands for owner 'player'.
 */
export class PlayGestures {
  selectedTowerId: string | null = null;
  hoverTowerId: string | null = null;
  pressRoadId: string | null = null;
  pressProgress = 0;
  /**
   * Link-limit refusal for the renderer (`PlayUi.limitHint` / `limitHintText`): a fresh object per
   * refusal (the renderer keys its shake on the object identity), null once it expired.
   */
  limitHint: { until: number } | null = null;
  limitHintText = '';

  private downTowerId: string | null = null;
  private downX = 0;
  private downY = 0;
  private downTime = 0;
  private moved = false;
  private pointerDown = false;
  private longPressFired = false;

  constructor(private readonly opts: GestureOptions) {}

  reset(): void {
    this.selectedTowerId = null;
    this.hoverTowerId = null;
    this.limitHint = null;
    this.limitHintText = '';
    this.clearPress();
  }

  private clearPress(): void {
    this.pressRoadId = null;
    this.pressProgress = 0;
    this.downTowerId = null;
    this.moved = false;
    this.pointerDown = false;
    this.longPressFired = false;
  }

  down(p: PointerPoint): void {
    const state = this.opts.getState();
    if (!state) return;
    this.pointerDown = true;
    this.moved = false;
    this.longPressFired = false;
    this.downX = p.x;
    this.downY = p.y;
    this.downTime = p.timeMs;
    const tower = hitTower(state, p.x, p.y);
    this.downTowerId = tower ? tower.id : null;
    this.pressRoadId = null;
    if (!tower) {
      const bridge = hitBridgeMidpoint(state, p.x, p.y);
      if (bridge) {
        const a = state.towers[bridge.a];
        const b = state.towers[bridge.b];
        if (a?.owner === 'player' || b?.owner === 'player') this.pressRoadId = bridge.id;
      }
    }
  }

  move(p: PointerPoint): void {
    const state = this.opts.getState();
    if (!state) return;
    if (this.pointerDown && Math.hypot(p.x - this.downX, p.y - this.downY) > DRAG_THRESHOLD) {
      this.moved = true;
      if (this.pressRoadId) this.pressRoadId = null;
    }
    // Hover highlight only while dragging from an own tower (the target preview).
    const src = this.downTowerId ? state.towers[this.downTowerId] : undefined;
    if (this.pointerDown && this.moved && src?.owner === 'player') {
      const t = hitTower(state, p.x, p.y);
      this.hoverTowerId = t && t.id !== src.id && connectedRoad(state, src.id, t.id) ? t.id : null;
    } else {
      this.hoverTowerId = null;
    }
  }

  up(p: PointerPoint): void {
    const state = this.opts.getState();
    const wasLongPress = this.longPressFired;
    const downTowerId = this.downTowerId;
    const moved = this.moved;
    this.hoverTowerId = null;
    this.clearPress();
    if (!state || wasLongPress) return;

    const target = hitTower(state, p.x, p.y);
    const src = downTowerId ? state.towers[downTowerId] : undefined;

    // Drag from own tower onto a connected tower → link (the source stays selected).
    if (moved && src && src.owner === 'player') {
      if (target && target.id !== src.id && connectedRoad(state, src.id, target.id)) {
        this.selectedTowerId = src.id;
        this.act(state, src.id, target.id, p.timeMs, false);
      }
      return;
    }
    if (moved) return; // a drag that started on empty ground / foreign tower: no-op

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
      this.selectedTowerId = target.id;
      return;
    }
    // Foreign tower with no usable road from the selection: deselect so the tap has visible feedback.
    this.selectedTowerId = null;
  }

  cancel(): void {
    this.hoverTowerId = null;
    this.clearPress();
  }

  /** Call once per frame so long-presses fire without pointer movement and the limit hint expires. */
  tick(nowMs: number): void {
    if (this.limitHint && nowMs >= this.limitHint.until) {
      this.limitHint = null;
      this.limitHintText = '';
    }
    if (!this.pointerDown || !this.pressRoadId || this.longPressFired) {
      if (!this.pressRoadId) this.pressProgress = 0;
      return;
    }
    const held = nowMs - this.downTime;
    this.pressProgress = Math.min(1, held / LONG_PRESS_MS);
    if (held >= LONG_PRESS_MS) {
      this.longPressFired = true;
      this.opts.onCommand({ type: 'cutBridge', owner: 'player', roadId: this.pressRoadId });
      this.pressRoadId = null;
      this.pressProgress = 0;
    }
  }

  /** Apply `decideLink` for a gesture from `from` onto `to`: emit the command or raise the limit hint. */
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
      case 'none':
        return;
    }
  }
}
