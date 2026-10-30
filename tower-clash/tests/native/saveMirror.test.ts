/**
 * AUD-Q4: `src/native/saveMirror.ts` keeps a second copy of the v3 save in `@capacitor/preferences`
 * inside the native shell and restores from it at boot when localStorage lost (or broke) the save.
 *
 * The real `save.ts` writes go to an in-memory Storage (`setSaveStorageForTests`) and reach the
 * mirror through the real `onSaveWritten` hook; the plugin is a fake Preferences that logs every
 * call. Timers are Vitest fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MirrorPrefs, SaveMirrorDeps } from '../../src/native/saveMirror';
import {
  SAVE_MIRROR_DELAY_MS,
  SAVE_RESTORE_TIMEOUT_MS,
  createSaveMirror,
  flushSaveMirror,
  isUsableSave,
  resetSaveMirrorForTests,
  bootSaveMirror,
} from '../../src/native/saveMirror';
import {
  SAVE_BACKUP_PREFIX,
  SAVE_KEY,
  SAVE_KEY_V2,
  defaultSave,
  loadSaveFrom,
  recordWin,
  setSaveStorageForTests,
  writeSave,
} from '../../src/ui/save';

class MemoryStorage {
  map = new Map<string, string>();
  refuse = false;
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.refuse) throw new Error('QuotaExceededError');
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  /** The `SAVE_BACKUP_PREFIX` keys present. */
  backups(): string[] {
    return [...this.map.keys()].filter((k) => k.startsWith(SAVE_BACKUP_PREFIX));
  }
}

class FakePrefs implements MirrorPrefs {
  store = new Map<string, string>();
  calls: Array<['get' | 'set', string, string?]> = [];
  failGet = false;
  failSetOnce = false;
  /** When set, `set()` waits for it (tests overlapping calls). */
  setGate: Promise<void> | null = null;
  async get({ key }: { key: string }): Promise<{ value: string | null }> {
    this.calls.push(['get', key]);
    if (this.failGet) throw new Error('bridge error');
    return { value: this.store.get(key) ?? null };
  }
  async set({ key, value }: { key: string; value: string }): Promise<void> {
    this.calls.push(['set', key, value]);
    if (this.setGate) await this.setGate;
    if (this.failSetOnce) {
      this.failSetOnce = false;
      throw new Error('disk full');
    }
    this.store.set(key, value);
  }
  sets(): string[] {
    return this.calls.filter(([op]) => op === 'set').map(([, , v]) => v!);
  }
}

function saveJson(stars: Record<string, number>, gold: number): string {
  const save = defaultSave();
  save.stars = stars;
  save.gold = gold;
  return JSON.stringify(save);
}

let storage: MemoryStorage;
let prefs: FakePrefs;
let hidden: Array<() => void>;

/** Deps wired to the in-memory storage and the fake plugin (native shell by default). */
function deps(over: Partial<SaveMirrorDeps> = {}): Partial<SaveMirrorDeps> {
  return {
    native: true,
    storage,
    loadPrefs: async () => prefs,
    now: () => 1_700_000_000_000,
    onHidden: (listener) => {
      hidden.push(listener);
      return () => (hidden = hidden.filter((l) => l !== listener));
    },
    ...over,
  };
}

/** Let the plugin promises settle without moving the clock. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  storage = new MemoryStorage();
  prefs = new FakePrefs();
  hidden = [];
  setSaveStorageForTests(storage);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  resetSaveMirrorForTests();
  setSaveStorageForTests(undefined);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('isUsableSave', () => {
  it('accepts a JSON object and rejects missing, truncated, non-object JSON', () => {
    expect(isUsableSave(saveJson({ '1': 3 }, 30))).toBe(true);
    expect(isUsableSave('{"stars":{"1":2}}')).toBe(true);
    expect(isUsableSave('{"unrelated":true}')).toBe(false); // not save-shaped: loadSaveFrom keeps it aside
    expect(isUsableSave(null)).toBe(false);
    expect(isUsableSave('')).toBe(false);
    expect(isUsableSave(saveJson({ '1': 3 }, 30).slice(0, 40))).toBe(false);
    expect(isUsableSave('null')).toBe(false);
    expect(isUsableSave('[1,2]')).toBe(false);
    expect(isUsableSave('42')).toBe(false);
  });
});

describe('bootSaveMirror — web', () => {
  it('resolves "web" and never loads the plugin', async () => {
    const loadPrefs = vi.fn(async () => prefs);
    await expect(bootSaveMirror(deps({ native: false, loadPrefs }))).resolves.toBe('web');
    expect(loadPrefs).not.toHaveBeenCalled();
    writeSave(defaultSave());
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS * 4);
    expect(prefs.calls).toEqual([]);
  });
});

describe('bootSaveMirror — restore rule at boot', () => {
  it('restores the native copy when localStorage has no v3 save, before loadSave() reads it', async () => {
    const mirrored = saveJson({ '1': 3, '2': 2 }, 50);
    prefs.store.set(SAVE_KEY, mirrored);
    await expect(bootSaveMirror(deps())).resolves.toBe('restored');
    expect(storage.getItem(SAVE_KEY)).toBe(mirrored); // byte for byte
    expect(storage.backups()).toEqual([]); // nothing was there to keep
    const save = loadSaveFrom(storage);
    expect(save.stars).toEqual({ '1': 3, '2': 2 });
    expect(save.gold).toBe(50);
  });

  it('restores over a corrupt v3 string and keeps that string under the AUD-Q2 backup key', async () => {
    const mirrored = saveJson({ '1': 3 }, 30);
    const truncated = saveJson({ '1': 3, '2': 3, '3': 3 }, 90).slice(0, 60);
    storage.map.set(SAVE_KEY, truncated);
    prefs.store.set(SAVE_KEY, mirrored);
    await expect(bootSaveMirror(deps())).resolves.toBe('restored');
    expect(storage.getItem(SAVE_KEY)).toBe(mirrored);
    expect(storage.backups()).toEqual([`${SAVE_BACKUP_PREFIX}1700000000000`]);
    expect(storage.getItem(`${SAVE_BACKUP_PREFIX}1700000000000`)).toBe(truncated);
    expect(loadSaveFrom(storage).stars).toEqual({ '1': 3 });
  });

  it('keeps a readable localStorage save and does not overwrite a readable native copy at boot', async () => {
    const local = saveJson({ '1': 3 }, 30);
    const mirrored = saveJson({ '1': 3, '2': 1 }, 40);
    storage.map.set(SAVE_KEY, local);
    prefs.store.set(SAVE_KEY, mirrored);
    await expect(bootSaveMirror(deps())).resolves.toBe('kept');
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS * 4);
    expect(storage.getItem(SAVE_KEY)).toBe(local);
    expect(prefs.sets()).toEqual([]);
  });

  it('seeds an empty native copy from localStorage (the first launch after the update)', async () => {
    const local = saveJson({ '1': 3, '2': 3 }, 60);
    storage.map.set(SAVE_KEY, local);
    await expect(bootSaveMirror(deps())).resolves.toBe('kept');
    expect(prefs.sets()).toEqual([]);
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS);
    expect(prefs.sets()).toEqual([local]);
    expect(prefs.store.get(SAVE_KEY)).toBe(local);
  });

  it('leaves a fresh install alone ("empty") and leaves the legacy v2 migration to loadSave()', async () => {
    const v2 = JSON.stringify({ version: 2, stars: { '1': 2 }, coins: 20 });
    storage.map.set(SAVE_KEY_V2, v2);
    await expect(bootSaveMirror(deps())).resolves.toBe('empty');
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    const save = loadSaveFrom(storage); // migrates and writes v3 → mirrored
    expect(save.gold).toBe(20);
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS);
    expect(prefs.sets()).toEqual([storage.getItem(SAVE_KEY)]);
  });

  it('reads the native copy once and calls bootSaveMirror only once per launch', async () => {
    const first = bootSaveMirror(deps());
    const second = bootSaveMirror(deps());
    expect(second).toBe(first);
    await first;
    expect(prefs.calls.filter(([op]) => op === 'get')).toEqual([['get', SAVE_KEY]]);
  });
});

describe('bootSaveMirror — failures never block boot or destroy a copy', () => {
  it('resolves "unavailable" when the plugin chunk fails to load; nothing is touched or mirrored', async () => {
    storage.map.set(SAVE_KEY, saveJson({ '1': 1 }, 10));
    const outcome = await bootSaveMirror(deps({ loadPrefs: async () => Promise.reject(new Error('Failed to fetch dynamically imported module')) }));
    expect(outcome).toBe('unavailable');
    writeSave(defaultSave());
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS * 4);
    expect(prefs.calls).toEqual([]);
  });

  it('treats a failing Preferences.get as "no native copy" and still mirrors', async () => {
    prefs.failGet = true;
    await expect(bootSaveMirror(deps())).resolves.toBe('empty');
    writeSave(defaultSave());
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS);
    expect(prefs.sets()).toHaveLength(1);
  });

  it(`boots after ${SAVE_RESTORE_TIMEOUT_MS} ms without restoring; a late native copy is protected, not overwritten`, async () => {
    const mirrored = saveJson({ '1': 3, '2': 3 }, 60);
    prefs.store.set(SAVE_KEY, mirrored);
    let arrive!: () => void;
    const gate = new Promise<void>((resolve) => (arrive = resolve));
    const outcome = bootSaveMirror(deps({ loadPrefs: async () => (await gate, prefs) }));
    await vi.advanceTimersByTimeAsync(SAVE_RESTORE_TIMEOUT_MS);
    await expect(outcome).resolves.toBe('unavailable');
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    arrive();
    await settle();
    writeSave(defaultSave()); // this session started from a default save
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS * 4);
    expect(prefs.sets()).toEqual([]);
    expect(prefs.store.get(SAVE_KEY)).toBe(mirrored);
  });

  it('a late plugin still mirrors when localStorage had the save', async () => {
    storage.map.set(SAVE_KEY, saveJson({ '1': 2 }, 20));
    let arrive!: () => void;
    const gate = new Promise<void>((resolve) => (arrive = resolve));
    const outcome = bootSaveMirror(deps({ loadPrefs: async () => (await gate, prefs) }));
    await vi.advanceTimersByTimeAsync(SAVE_RESTORE_TIMEOUT_MS);
    await expect(outcome).resolves.toBe('unavailable');
    arrive();
    await settle();
    const save = loadSaveFrom(storage);
    recordWin(save, 2, 3, 10);
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS);
    expect(prefs.store.get(SAVE_KEY)).toBe(storage.getItem(SAVE_KEY));
  });

  it('does not mirror when the restore could not be written (the native copy stays for the next launch)', async () => {
    const mirrored = saveJson({ '1': 3 }, 30);
    prefs.store.set(SAVE_KEY, mirrored);
    storage.refuse = true;
    await expect(bootSaveMirror(deps())).resolves.toBe('unavailable');
    writeSave(defaultSave());
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS * 4);
    expect(prefs.sets()).toEqual([]);
    expect(prefs.store.get(SAVE_KEY)).toBe(mirrored);
  });
});

describe('mirroring every write', () => {
  it('a win written by recordWin reaches Preferences within 250 ms, byte for byte', async () => {
    await bootSaveMirror(deps());
    const save = loadSaveFrom(storage);
    const earned = recordWin(save, 1, 3, 10);
    expect(earned).toBe(30);
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS - 1);
    expect(prefs.sets()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(prefs.sets()).toEqual([storage.getItem(SAVE_KEY)]);
    const mirrored = loadSaveFrom({ getItem: () => prefs.store.get(SAVE_KEY) ?? null, setItem: () => undefined, removeItem: () => undefined });
    expect(mirrored.stars).toEqual({ '1': 3 });
    expect(mirrored.gold).toBe(30);
  });

  it('a burst of writes becomes one Preferences.set with the newest JSON; later writes do not push the deadline', async () => {
    await bootSaveMirror(deps());
    const save = loadSaveFrom(storage);
    recordWin(save, 1, 2, 10); // t = 0: starts the 250 ms window
    await vi.advanceTimersByTimeAsync(200);
    recordWin(save, 2, 3, 10); // t = 200
    save.gold -= 5;
    writeSave(save); // t = 200, newest
    const newest = storage.getItem(SAVE_KEY);
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS - 200); // t = 250
    expect(prefs.sets()).toEqual([newest]);
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS * 4);
    expect(prefs.sets()).toHaveLength(1);
  });

  it('flushes at once when the app goes to the background (kill right after a win)', async () => {
    await bootSaveMirror(deps());
    const save = loadSaveFrom(storage);
    recordWin(save, 5, 3, 10);
    expect(hidden).toHaveLength(1);
    hidden[0]!();
    await settle();
    expect(prefs.store.get(SAVE_KEY)).toBe(storage.getItem(SAVE_KEY));
    await flushSaveMirror(); // nothing left
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS * 4);
    expect(prefs.sets()).toHaveLength(1);
  });

  it('mirrors a write that localStorage refused (quota): the native copy is then the only one', async () => {
    await bootSaveMirror(deps());
    storage.refuse = true;
    const save = defaultSave();
    save.gold = 77;
    writeSave(save); // save.ts swallows the quota error
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS);
    expect(prefs.sets()).toEqual([JSON.stringify(save)]);
  });

  it('resetProgress-style writes are mirrored too (a reset is not resurrected by the next restore)', async () => {
    storage.map.set(SAVE_KEY, saveJson({ '1': 3 }, 30));
    prefs.store.set(SAVE_KEY, saveJson({ '1': 3 }, 30));
    await bootSaveMirror(deps());
    writeSave(defaultSave());
    await flushSaveMirror();
    expect(prefs.store.get(SAVE_KEY)).toBe(JSON.stringify(defaultSave()));
  });

  it('mirrors nothing while the save is read-only (a newer build wrote it, AUD-Q3)', async () => {
    const v4 = JSON.stringify({ ...defaultSave(), version: 4, cloudId: 'x' });
    storage.map.set(SAVE_KEY, v4);
    prefs.store.set(SAVE_KEY, v4);
    await expect(bootSaveMirror(deps())).resolves.toBe('kept');
    const save = loadSaveFrom(storage);
    recordWin(save, 1, 3, 10);
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS * 4);
    expect(prefs.sets()).toEqual([]);
    expect(prefs.store.get(SAVE_KEY)).toBe(v4);
  });

  it('stops observing writes once reset (no listener leaks between launches)', async () => {
    await bootSaveMirror(deps());
    resetSaveMirrorForTests();
    writeSave(defaultSave());
    await vi.advanceTimersByTimeAsync(SAVE_MIRROR_DELAY_MS * 4);
    expect(prefs.sets()).toEqual([]);
  });
});

describe('createSaveMirror', () => {
  it('keeps Preferences.set calls in order: a slow older call cannot land after a newer one', async () => {
    const mirror = createSaveMirror(prefs);
    let release!: () => void;
    prefs.setGate = new Promise<void>((resolve) => (release = resolve));
    mirror.write('{"a":1}');
    const first = mirror.flush();
    mirror.write('{"a":2}');
    const second = mirror.flush();
    await settle();
    expect(prefs.sets()).toEqual(['{"a":1}']); // the second waits for the first
    release();
    await first;
    await second;
    expect(prefs.sets()).toEqual(['{"a":1}', '{"a":2}']);
    expect(prefs.store.get(SAVE_KEY)).toBe('{"a":2}');
  });

  it('skips a write identical to the last one sent, and retries a value whose set failed', async () => {
    const mirror = createSaveMirror(prefs);
    mirror.write('{"a":1}');
    await mirror.flush();
    mirror.write('{"a":1}');
    await mirror.flush();
    expect(prefs.sets()).toEqual(['{"a":1}']);
    prefs.failSetOnce = true;
    mirror.write('{"a":2}');
    await mirror.flush();
    expect(prefs.store.get(SAVE_KEY)).toBe('{"a":1}');
    mirror.write('{"a":2}');
    await mirror.flush();
    expect(prefs.store.get(SAVE_KEY)).toBe('{"a":2}');
  });
});

describe('the real plugin is a lazy import', () => {
  afterEach(() => {
    vi.doUnmock('@capacitor/preferences');
    vi.doUnmock('../../src/native/index');
  });

  it('loads @capacitor/preferences only inside the native shell, at bootSaveMirror(), and survives its thenable-looking proxy', async () => {
    const ctl = { native: true, imports: 0 };
    vi.resetModules();
    vi.doMock('../../src/native/index', () => ({ isNative: () => ctl.native }));
    vi.doMock('@capacitor/preferences', () => {
      ctl.imports++;
      // like Capacitor's registerPlugin proxy: every property is a method, `then` included (a
      // promise resolved with it never settles), so the mirror must never await / return the plugin
      const Preferences = new Proxy(
        {},
        {
          get: (_, prop) =>
            prop === 'get' || prop === 'set'
              ? (options: never) => prefs[prop](options)
              : () => Promise.reject(new Error(`"Preferences.${String(prop)}()" is not implemented on android`)),
        },
      );
      return { Preferences };
    });
    const mod = await import('../../src/native/saveMirror');
    expect(ctl.imports).toBe(0);
    ctl.native = false;
    await expect(mod.bootSaveMirror({ storage })).resolves.toBe('web');
    expect(ctl.imports).toBe(0);
    mod.resetSaveMirrorForTests();
    ctl.native = true;
    prefs.store.set(SAVE_KEY, saveJson({ '1': 3 }, 30));
    await expect(mod.bootSaveMirror({ storage, onHidden: () => () => undefined })).resolves.toBe('restored');
    expect(ctl.imports).toBe(1);
    mod.resetSaveMirrorForTests();
  });
});

describe('startSaveMirror (src/native/index.ts) — the eager gate', () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
    vi.doUnmock('../../src/native/saveMirror');
  });

  async function gate(mirror: () => Promise<string>) {
    const ctl = { imports: 0, calls: 0 };
    vi.resetModules();
    vi.doMock('../../src/native/saveMirror', () => {
      ctl.imports++;
      return {
        bootSaveMirror: () => {
          ctl.calls++;
          return mirror();
        },
      };
    });
    const { startSaveMirror } = await import('../../src/native/index');
    return { ctl, startSaveMirror };
  }

  it('web: resolves "web" without loading the mirror chunk', async () => {
    const { ctl, startSaveMirror } = await gate(async () => 'restored');
    await expect(startSaveMirror()).resolves.toBe('web');
    expect(ctl).toEqual({ imports: 0, calls: 0 });
  });

  it('native: loads the chunk and returns the restore outcome; a failing chunk resolves "unavailable"', async () => {
    g.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } };
    const ok = await gate(async () => 'restored');
    await expect(ok.startSaveMirror()).resolves.toBe('restored');
    expect(ok.ctl).toEqual({ imports: 1, calls: 1 });
    const broken = await gate(async () => Promise.reject(new Error('chunk failed')));
    await expect(broken.startSaveMirror()).resolves.toBe('unavailable');
  });
});
