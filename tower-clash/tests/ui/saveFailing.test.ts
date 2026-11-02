/**
 * AUD-Q10: failed save writes are not silent. `putSave` (src/ui/save.ts, the one write path) retries a
 * throwing `setItem` once after `SAVE_RETRY_MS`; when the retry throws too the session is
 * `isSaveFailing()` (the notice in src/render/saveNotice.ts) until a write lands. A storage whose
 * getter throws at boot (SecurityError: storage disabled) boots read-only *and* failing — no default is
 * written over the save that may exist, nothing is mirrored. The native mirror (`onSaveWritten`) is
 * still told of every write localStorage refused, once per write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_KEY,
  SAVE_RETRY_MS,
  defaultSave,
  isSaveFailing,
  isSaveReadOnly,
  loadSaveFrom,
  onSaveWritten,
  recordWin,
  saveLoadIssue,
  setSaveStorageForTests,
  writeSave,
  writeSaveAtBoot,
} from '../../src/ui/save';

class FlakyStorage {
  map = new Map<string, string>();
  /** How many of the next `setItem` calls throw. */
  refuse = 0;
  /** The getter throws (storage disabled). */
  blockGet = false;
  sets = 0;
  getItem(key: string): string | null {
    if (this.blockGet) throw new DOMException('The operation is insecure.', 'SecurityError');
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.sets += 1;
    if (this.refuse > 0) {
      this.refuse -= 1;
      throw new DOMException('quota', 'QuotaExceededError');
    }
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

let storage: FlakyStorage;
let mirrored: string[];
let unwatch: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  storage = new FlakyStorage();
  storage.map.set(SAVE_KEY, JSON.stringify({ ...defaultSave(), gold: 40, stars: { '1': 2 } }));
  setSaveStorageForTests(storage);
  mirrored = [];
  unwatch = onSaveWritten((json) => mirrored.push(json));
});

afterEach(() => {
  unwatch();
  setSaveStorageForTests(undefined);
  loadSaveFrom(storage); // a healthy load clears the session flags for the next file
  vi.useRealTimers();
});

describe('a write that throws (quota)', () => {
  it('is retried once after SAVE_RETRY_MS; the retry landing keeps the session healthy', () => {
    const save = loadSaveFrom(storage);
    storage.refuse = 1;
    expect(recordWin(save, 2, 3, 10)).toBe(30);
    expect(storage.sets).toBe(1);
    expect(isSaveFailing()).toBe(false); // not yet: the retry is pending
    vi.advanceTimersByTime(SAVE_RETRY_MS - 1);
    expect(storage.sets).toBe(1);
    vi.advanceTimersByTime(1);
    expect(storage.sets).toBe(2);
    expect(isSaveFailing()).toBe(false);
    expect(JSON.parse(storage.map.get(SAVE_KEY)!)).toMatchObject({ stars: { '1': 2, '2': 3 }, gold: 70 });
  });

  it('turns the session failing when the retry throws too; the in-memory save plays on', () => {
    const save = loadSaveFrom(storage);
    storage.refuse = 4; // this write + its retry, and the next write + its retry
    expect(writeSave(save)).toBe(false);
    vi.advanceTimersByTime(SAVE_RETRY_MS);
    expect(storage.sets).toBe(2);
    expect(isSaveFailing()).toBe(true);
    expect(isSaveReadOnly()).toBe(false);
    expect(saveLoadIssue()).toBeNull();
    // the player keeps the win in memory; the key still holds the old bytes
    expect(recordWin(save, 3, 1, 10)).toBe(10);
    expect(save.gold).toBe(50);
    expect(JSON.parse(storage.map.get(SAVE_KEY)!)).toMatchObject({ gold: 40 });
  });

  it('a later write that lands clears the notice; a successful write cancels a pending retry', () => {
    const save = loadSaveFrom(storage);
    storage.refuse = 2;
    writeSave(save);
    vi.advanceTimersByTime(SAVE_RETRY_MS);
    expect(isSaveFailing()).toBe(true);
    save.gold = 99;
    expect(writeSave(save)).toBe(true);
    expect(isSaveFailing()).toBe(false);
    expect(JSON.parse(storage.map.get(SAVE_KEY)!)).toMatchObject({ gold: 99 });
    // a refused write followed at once by one that lands: no stale retry writes the older JSON back
    storage.refuse = 1;
    save.gold = 1;
    writeSave(save);
    save.gold = 2;
    writeSave(save);
    const sets = storage.sets;
    vi.advanceTimersByTime(SAVE_RETRY_MS * 2);
    expect(storage.sets).toBe(sets);
    expect(JSON.parse(storage.map.get(SAVE_KEY)!)).toMatchObject({ gold: 2 });
  });

  it('a newer refused write replaces the pending retry (the retry sends the newest JSON only)', () => {
    const save = loadSaveFrom(storage);
    storage.refuse = 2;
    save.gold = 11;
    writeSave(save);
    save.gold = 12;
    writeSave(save);
    const sets = storage.sets;
    vi.advanceTimersByTime(SAVE_RETRY_MS * 2);
    expect(storage.sets).toBe(sets + 1);
    expect(isSaveFailing()).toBe(false);
    expect(JSON.parse(storage.map.get(SAVE_KEY)!)).toMatchObject({ gold: 12 });
  });

  it('tells the native mirror once per write, whether or not localStorage took it (the retry does not repeat it)', () => {
    const save = loadSaveFrom(storage);
    storage.refuse = 2;
    save.gold = 77;
    writeSave(save);
    expect(mirrored).toEqual([JSON.stringify(save)]);
    vi.advanceTimersByTime(SAVE_RETRY_MS);
    expect(mirrored).toHaveLength(1);
    expect(isSaveFailing()).toBe(true);
    save.gold = 78;
    writeSave(save);
    expect(mirrored).toEqual([expect.stringContaining('"gold":77'), JSON.stringify(save)]);
  });

  it('the failed-write state does not survive a load', () => {
    const save = loadSaveFrom(storage);
    storage.refuse = 2;
    writeSave(save);
    vi.advanceTimersByTime(SAVE_RETRY_MS);
    expect(isSaveFailing()).toBe(true);
    loadSaveFrom(storage);
    expect(isSaveFailing()).toBe(false);
  });
});

describe('a getter that throws at boot (storage disabled)', () => {
  it('boots a read-only default in memory, writes nothing, mirrors nothing, and shows the notice', () => {
    storage.blockGet = true;
    const save = loadSaveFrom(storage);
    expect(save).toEqual(defaultSave());
    expect(saveLoadIssue()).toEqual({ kind: 'blocked' });
    expect(isSaveReadOnly()).toBe(true);
    expect(isSaveFailing()).toBe(true);
    save.settings.language = 'az';
    expect(writeSaveAtBoot(save)).toBe(false); // the first-run language detection
    expect(recordWin(save, 1, 3, 10)).toBe(30);
    expect(writeSave(save)).toBe(false);
    vi.advanceTimersByTime(SAVE_RETRY_MS * 2);
    expect(storage.sets).toBe(0);
    expect(mirrored).toEqual([]);
    // the bytes under the key are exactly as found
    expect(JSON.parse(storage.map.get(SAVE_KEY)!)).toMatchObject({ gold: 40, stars: { '1': 2 } });
  });

  it('a missing storage (null) is the same case', () => {
    const save = loadSaveFrom(null);
    expect(save.version).toBe(3);
    expect(saveLoadIssue()).toEqual({ kind: 'blocked' });
    expect(isSaveReadOnly()).toBe(true);
    expect(isSaveFailing()).toBe(true);
    expect(writeSave(save)).toBe(false);
    expect(mirrored).toEqual([]);
  });

  it('a healthy getter on the next boot lifts both flags', () => {
    storage.blockGet = true;
    loadSaveFrom(storage);
    storage.blockGet = false;
    const save = loadSaveFrom(storage);
    expect(save.gold).toBe(40);
    expect(isSaveReadOnly()).toBe(false);
    expect(isSaveFailing()).toBe(false);
    expect(saveLoadIssue()).toBeNull();
  });
});
