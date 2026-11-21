import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Command, GameState, LevelDef } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import type { PointerHandlers } from '../../src/input/pointer';
import { PlayGestures, attachPointer } from '../../src/input/pointer';
import type { View } from '../../src/render/view';

/*
 * REV-16 (2026-11-21): pointer capture is best-effort; when it fails a mouse released outside the canvas
 * delivers its `pointerup` elsewhere. A `lostpointercapture`, a window `blur` or a `pointerup` /
 * `pointercancel` reaching `window` for the active (non-touch) pointer abandons the press — no command,
 * state cleared — so the next press is accepted. Touch is unchanged.
 * REV-17: a right / middle mouse button starts no gesture (touch and pen unaffected).
 */

type Listener = (e: unknown) => void;
function target() {
  const listeners = new Map<string, Listener[]>();
  return {
    listeners,
    addEventListener(type: string, fn: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((l) => l !== fn),
      );
    },
    fire(type: string, e: Record<string, unknown> = {}) {
      for (const fn of listeners.get(type) ?? []) fn({ preventDefault() {}, ...e });
    },
  };
}

let win: ReturnType<typeof target>;
let canvas: ReturnType<typeof target> & { setPointerCapture(): void; getBoundingClientRect(): { left: number; top: number } };

beforeEach(() => {
  win = target();
  vi.stubGlobal('window', win);
  canvas = Object.assign(target(), {
    setPointerCapture() {
      throw new Error('capture refused'); // the case REV-16 is about
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const view = (): View => ({ canvas, scale: 1, offsetX: 0, offsetY: 0 }) as unknown as View;

/** A canvas event that bubbles to `window` afterwards, as the DOM does. */
function onCanvas(type: string, e: Record<string, unknown>): void {
  canvas.fire(type, e);
  win.fire(type, e);
}

const mouse = (pointerId: number, x: number, y: number, button = 0) => ({ pointerId, pointerType: 'mouse', button, clientX: x, clientY: y });
const touch = (pointerId: number, x: number, y: number) => ({ pointerId, pointerType: 'touch', button: 0, clientX: x, clientY: y });

function recorder(): { seen: string[]; handlers: PointerHandlers } {
  const seen: string[] = [];
  return {
    seen,
    handlers: {
      down: (p) => seen.push(`down ${p.id}`),
      up: (p) => seen.push(`up ${p.id}`),
      cancel: (p) => seen.push(p ? `cancel ${p.id} at ${p.x},${p.y}` : 'cancel'),
    },
  };
}

describe('REV-16: an active pointer whose release never reaches the canvas', () => {
  it('a pointerup on window (released outside the canvas) clears it: cancel without a point, the next pointerdown is accepted', () => {
    const { seen, handlers } = recorder();
    attachPointer(canvas as unknown as HTMLCanvasElement, view(), handlers);
    onCanvas('pointerdown', mouse(1, 10, 10));
    win.fire('pointerup', mouse(1, 900, 900)); // released over another element: never on the canvas
    onCanvas('pointerdown', mouse(1, 20, 20));
    onCanvas('pointerup', mouse(1, 20, 20));
    expect(seen).toEqual(['down 1', 'cancel', 'down 1', 'up 1']);
  });

  it('a pointercancel on window and a lostpointercapture on the canvas clear it too', () => {
    const { seen, handlers } = recorder();
    attachPointer(canvas as unknown as HTMLCanvasElement, view(), handlers);
    onCanvas('pointerdown', mouse(1, 10, 10));
    win.fire('pointercancel', mouse(1, 0, 0));
    onCanvas('pointerdown', mouse(1, 10, 10));
    canvas.fire('lostpointercapture', mouse(1, 0, 0));
    win.fire('pointerup', mouse(2, 0, 0)); // another pointer: ignored
    onCanvas('pointerdown', mouse(1, 10, 10));
    expect(seen).toEqual(['down 1', 'cancel', 'down 1', 'cancel', 'down 1']);
  });

  it('a window blur clears it; a blur with no press does nothing', () => {
    const { seen, handlers } = recorder();
    attachPointer(canvas as unknown as HTMLCanvasElement, view(), handlers);
    win.fire('blur');
    expect(seen).toEqual([]);
    onCanvas('pointerdown', mouse(1, 10, 10));
    win.fire('blur');
    onCanvas('pointerdown', mouse(1, 10, 10));
    expect(seen).toEqual(['down 1', 'cancel', 'down 1']);
  });

  it('a normal canvas pointerup still reaches `up` once (the bubbled window copy and the later lostpointercapture are no-ops)', () => {
    const { seen, handlers } = recorder();
    attachPointer(canvas as unknown as HTMLCanvasElement, view(), handlers);
    onCanvas('pointerdown', mouse(1, 10, 10));
    onCanvas('pointerup', mouse(1, 10, 10));
    canvas.fire('lostpointercapture', mouse(1, 10, 10));
    win.fire('blur');
    expect(seen).toEqual(['down 1', 'up 1']);
  });

  it('touch is unchanged: blur / lostpointercapture do not cancel, its pointercancel still reports the last point', () => {
    const { seen, handlers } = recorder();
    attachPointer(canvas as unknown as HTMLCanvasElement, view(), handlers);
    onCanvas('pointerdown', touch(5, 10, 20));
    win.fire('blur');
    canvas.fire('lostpointercapture', touch(5, 0, 0));
    onCanvas('pointerdown', touch(6, 99, 99)); // a second finger: still ignored
    onCanvas('pointercancel', touch(5, 0, 0));
    expect(seen).toEqual(['down 5', 'cancel 5 at 10,20']);
  });

  it('detach removes the window and lostpointercapture listeners', () => {
    const detach = attachPointer(canvas as unknown as HTMLCanvasElement, view(), {});
    expect(win.listeners.get('pointerup')).toHaveLength(1);
    expect(win.listeners.get('blur')).toHaveLength(1);
    detach();
    for (const type of ['pointerup', 'pointercancel', 'blur']) expect(win.listeners.get(type), type).toEqual([]);
    expect(canvas.listeners.get('lostpointercapture')).toEqual([]);
  });
});

/* ---------- with the play gestures behind the adapter ---------- */

/** Player `p` (200, 1000) and `q` (520, 1000), neutral `n` (200, 600): every lane clear. */
function fixture(): GameState {
  const level: LevelDef = {
    id: 997,
    name: 'recover',
    lesson: 'recover',
    star3: 30_000,
    star2: 60_000,
    enemies: [{ owner: 'enemy1', personality: 'rusher', aggression: 0.5 }],
    towers: [
      { id: 'p', x: 200, y: 1000, owner: 'player', units: 10, level: 2 },
      { id: 'q', x: 520, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'n', x: 200, y: 600, owner: 'neutral', units: 5 },
    ],
  };
  return createState(level, 1);
}

function wired(state: GameState) {
  const commands: Command[] = [];
  const g = new PlayGestures({ getState: () => state, onCommand: (c) => commands.push(c) });
  attachPointer(canvas as unknown as HTMLCanvasElement, view(), {
    down: (p) => g.down(p),
    move: (p) => g.move(p),
    up: (p) => g.up(p),
    cancel: (p) => g.cancel(p),
  });
  return { g, commands };
}

describe('REV-16 / REV-17 through PlayGestures', () => {
  it('a canvas drag p → n released on the canvas links', () => {
    const state = fixture();
    const { commands } = wired(state);
    onCanvas('pointerdown', mouse(1, 200, 1000));
    onCanvas('pointermove', mouse(1, 200, 800));
    onCanvas('pointermove', mouse(1, 200, 600));
    onCanvas('pointerup', mouse(1, 200, 600));
    expect(commands).toEqual([{ type: 'link', owner: 'player', from: 'p', to: 'n' }]);
  });

  it('the same drag released outside the canvas issues no command, and the next tap selects', () => {
    const state = fixture();
    const { g, commands } = wired(state);
    onCanvas('pointerdown', mouse(1, 200, 1000));
    onCanvas('pointermove', mouse(1, 200, 800));
    onCanvas('pointermove', mouse(1, 200, 600)); // last canvas point is over n
    win.fire('pointerup', mouse(1, 200, -50));
    expect(commands).toEqual([]);
    expect(g.drag).toBeNull();
    expect(g.dragging).toBe(false);
    onCanvas('pointerdown', mouse(1, 520, 1000));
    onCanvas('pointerup', mouse(1, 520, 1000));
    expect(g.selectedTowerId).toBe('q');
  });

  it('REV-17: a right-button (or middle) press + move + up issues no command and changes no selection', () => {
    const state = fixture();
    const { g, commands } = wired(state);
    onCanvas('pointerdown', mouse(1, 520, 1000));
    onCanvas('pointerup', mouse(1, 520, 1000));
    expect(g.selectedTowerId).toBe('q');
    for (const button of [2, 1]) {
      onCanvas('pointerdown', mouse(1, 200, 1000, button)); // on p: a left press would select / drag
      onCanvas('pointermove', mouse(1, 200, 800, button));
      onCanvas('pointermove', mouse(1, 200, 600, button));
      onCanvas('pointerup', mouse(1, 200, 600, button));
      expect(commands, `button ${button}`).toEqual([]);
      expect(g.selectedTowerId, `button ${button}`).toBe('q');
      expect(g.drag, `button ${button}`).toBeNull();
    }
    // and then a left press works as usual (a tap on q again deselects it)
    onCanvas('pointerdown', mouse(1, 520, 1000));
    onCanvas('pointerup', mouse(1, 520, 1000));
    expect(g.selectedTowerId).toBeNull();
    onCanvas('pointerdown', mouse(1, 200, 1000));
    onCanvas('pointerup', mouse(1, 200, 1000));
    expect(g.selectedTowerId).toBe('p');
  });

  it('REV-17: touch and pen presses are not filtered by `button`', () => {
    const state = fixture();
    const { g } = wired(state);
    onCanvas('pointerdown', { ...touch(3, 200, 1000), button: -1 });
    onCanvas('pointerup', { ...touch(3, 200, 1000), button: -1 });
    expect(g.selectedTowerId).toBe('p');
    // a pen barrel-button press is still a tap: on the selected p it deselects
    onCanvas('pointerdown', { pointerId: 4, pointerType: 'pen', button: 2, clientX: 200, clientY: 1000 });
    onCanvas('pointerup', { pointerId: 4, pointerType: 'pen', button: 2, clientX: 200, clientY: 1000 });
    expect(g.selectedTowerId).toBeNull();
  });
});
