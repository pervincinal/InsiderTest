import type { Command, GameState, Road, Tower } from '../sim/types';
import { roadIdFor } from '../sim/create';
import { roadPointAt } from '../sim/step';
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

export interface GestureOptions {
  getState(): GameState | null;
  getSendRatio(): number;
  onCommand(cmd: Command): void;
}

/**
 * Tap own tower = select; tap a connected tower = send (source stays selected);
 * tap the selected tower = upgrade; tap empty = deselect;
 * drag own tower → tower = send; long-press an intact bridge midpoint = cut.
 * Only ever produces sim commands for owner 'player'.
 */
export class PlayGestures {
  selectedTowerId: string | null = null;
  hoverTowerId: string | null = null;
  pressRoadId: string | null = null;
  pressProgress = 0;

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

    // Drag from own tower onto another tower → send.
    if (moved && src && src.owner === 'player') {
      if (target && target.id !== src.id && connectedRoad(state, src.id, target.id)) {
        this.send(src.id, target.id);
        this.selectedTowerId = src.id;
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
      this.opts.onCommand({ type: 'upgrade', owner: 'player', towerId: sel.id });
      return;
    }
    if (sel && connectedRoad(state, sel.id, target.id)) {
      this.send(sel.id, target.id);
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

  /** Call once per frame so long-presses fire without pointer movement. */
  tick(nowMs: number): void {
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

  private send(from: string, to: string): void {
    this.opts.onCommand({ type: 'sendUnits', owner: 'player', from, to, ratio: this.opts.getSendRatio() });
  }
}
