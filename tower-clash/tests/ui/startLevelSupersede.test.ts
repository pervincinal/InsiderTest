import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LevelDef } from '../../src/sim/types';
import type { Screen } from '../../src/ui/screens';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import { makeLevel } from '../helpers';

/*
 * REV-36: main.ts `startLevel` guards. (a) An unknown level id is refused before the start counter
 * moves, so a start in flight is not superseded by nothing (which left its spinner up for good).
 * (b) A start that supersedes another start's spinner returns, on failure, to the screen the first
 * start left — never to that dead spinner (onBack swallows presses on 'loading': only a reload got out).
 * The app is driven through `TowerClashApp.prototype` on a bare object (no canvas in Vitest); the
 * level / chunk loaders are mocked so each download is resolved or failed by hand.
 */

type Deferred = {
  resolve: (l: LevelDef | null) => void;
  reject: (e: unknown) => void;
};
const pending = new Map<number, Deferred[]>();

vi.mock('../../src/levels/index', async (orig) => {
  const real = await orig<typeof import('../../src/levels/index')>();
  return {
    ...real,
    getLoadedLevel: () => undefined,
    loadLevel: (id: number) =>
      new Promise<LevelDef | null>((resolve, reject) => {
        pending.set(id, [...(pending.get(id) ?? []), { resolve, reject }]);
      }),
  };
});
vi.mock('../../src/render/cosmetics', async (orig) => ({
  ...(await orig<object>()),
  preloadCosmetics: () => null,
}));
vi.mock('../../src/render/camera', async (orig) => ({
  ...(await orig<object>()),
  preloadCamera: () => null,
}));
vi.mock('../../src/ui/tutorialChunk', async (orig) => ({
  ...(await orig<object>()),
  preloadTutorialSteps: () => null,
}));
vi.mock('../../src/render/tutorialDraw', async (orig) => ({
  ...(await orig<object>()),
  preloadTutorialBubble: () => null,
}));
// main.ts boots on import: park it on the save mirror (never resolves) so no DOM is touched
vi.mock('../../src/native/index', async (orig) => ({
  ...(await orig<object>()),
  startSaveMirror: () => new Promise<never>(() => {}),
}));

const g = globalThis as Record<string, unknown>;
const hadDocument = 'document' in g;
const hadCanvas = 'HTMLCanvasElement' in g;
class FakeCanvas {}
if (!hadCanvas) g.HTMLCanvasElement = FakeCanvas;
if (!hadDocument) g.document = { getElementById: () => new FakeCanvas() };
const { TowerClashApp } = await import('../../src/main');

afterAll(() => {
  if (!hadDocument) delete g.document;
  if (!hadCanvas) delete g.HTMLCanvasElement;
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

interface Harness {
  app: InstanceType<typeof TowerClashApp>;
  title: Screen;
  entered: number[];
}

function harness(): Harness {
  const title: Screen = { name: 'title', draw() {} };
  const entered: number[] = [];
  const app = Object.create(TowerClashApp.prototype) as InstanceType<typeof TowerClashApp>;
  const fields = app as unknown as Record<string, unknown>;
  Object.assign(fields, {
    save: defaultSave(),
    current: title,
    startSeq: 0,
    carriedToasts: [],
    pendingStart: null,
    lazy: null,
    play: null,
    speed: 1,
    // no canvas / sim loop here: record which level would have been entered
    enterLevel(level: LevelDef) {
      entered.push(level.id);
      const play: Screen = { name: 'play', draw() {} };
      app.current = play;
      return play;
    },
  });
  return { app, title, entered };
}

describe('startLevel supersede guards (REV-36)', () => {
  beforeEach(() => {
    setSaveStorageForTests(null);
    pending.clear();
  });

  it('(a) an unknown id while a start is in flight: refused, the in-flight start still completes', async () => {
    const { app, entered } = harness();
    const first = app.startLevel(1);
    expect(app.current.name).toBe('loading');
    await expect(app.startLevel(99_999)).resolves.toBe(false);
    pending.get(1)![0]!.resolve(makeLevel({ id: 1 }));
    await expect(first).resolves.toBe(true);
    expect(entered).toEqual([1]);
    expect(app.current.name).toBe('play');
  });

  it("(b) a second start over the first one's spinner fails: back on the screen the first start left, not a spinner", async () => {
    const { app, title } = harness();
    const first = app.startLevel(1);
    expect(app.current.name).toBe('loading');
    const second = app.startLevel(2);
    expect(app.current.name).toBe('loading');
    pending.get(2)![0]!.reject(new Error('offline'));
    await expect(second).resolves.toBe(false);
    expect(app.current.name).not.toBe('loading');
    expect(app.current).toBe(title);
    pending.get(1)![0]!.resolve(makeLevel({ id: 1 })); // superseded: does not take over
    await expect(first).resolves.toBe(false);
    expect(app.current).toBe(title);
    await flush();
  });

  it("(b) the second start's level is missing (null chunk): same, back on the title", async () => {
    const { app, title } = harness();
    void app.startLevel(1);
    const second = app.startLevel(2);
    pending.get(2)![0]!.resolve(null);
    await expect(second).resolves.toBe(false);
    expect(app.current).toBe(title);
  });
});
