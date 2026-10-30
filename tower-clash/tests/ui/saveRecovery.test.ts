import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { SaveData, SaveStorage } from '../../src/ui/save';
import { SAVE_BACKUP_KEEP, noticeUnreadableSave, pruneSaveBackups } from '../../src/ui/saveRecovery';
import { Toast } from '../../src/ui/screens';
import { registerEnglish } from '../../src/ui/i18n';
import { enMenus } from '../../src/ui/locales/enMenus';
import {
  SAVE_BACKUP_PREFIX,
  SAVE_KEY,
  SAVE_KEY_V1,
  SAVE_KEY_V2,
  SAVE_VERSION,
  defaultSave,
  isReadableSaveText,
  isSaveReadOnly,
  loadSaveFrom,
  normalizeSave,
  onSaveWritten,
  recordWin,
  resetProgress,
  saveLoadIssue,
  setSaveStorageForTests,
  writeSave,
  writeSaveAtBoot,
} from '../../src/ui/save';

/*
 * AUD-Q2 / AUD-Q3 (QA audit 2026-10-29): a save the game cannot read is never destroyed, and a save
 * a newer build wrote is never rewritten.
 *  - Q2: an unreadable v3 entry is copied to `towerclash.save.v3.bad.<ms>` (newest 2 kept), the game
 *    boots with a default, and the default is not written over the entry by the boot itself
 *    (`writeSaveAtBoot`, the language detection) — only by the player's first change (`writeSave`).
 *  - Q3: `version > SAVE_VERSION` loads what this build understands and turns the session read-only:
 *    no write reaches the store, the stored bytes (unknown fields included) stay as they were.
 */

const FIXTURES = new URL('./saveFixtures/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');
const BUILD7 = JSON.stringify(JSON.parse(read('v3-build7-full.json')));

/** A Storage-like memory store that can list its keys (as localStorage can) and log every write. */
class MemStore implements SaveStorage {
  readonly map = new Map<string, string>();
  readonly writes: string[] = [];
  refuse: ((key: string) => boolean) | null = null;
  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.map.set(k, v);
  }
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.refuse?.(k)) throw new Error('QuotaExceededError');
    this.writes.push(k);
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  backups(): string[] {
    return [...this.map.keys()].filter((k) => k.startsWith(SAVE_BACKUP_PREFIX)).sort();
  }
}

/** Load from `store` and route every later write to it, as the app does with localStorage. */
function boot(store: MemStore, nowMs = 1_000): SaveData {
  setSaveStorageForTests(store);
  return loadSaveFrom(store, nowMs);
}

afterEach(() => {
  loadSaveFrom(null); // clear the session's read-only / hold state
  setSaveStorageForTests(undefined);
});

describe('AUD-Q2: an unreadable save is kept, never destroyed', () => {
  const truncated = BUILD7.slice(0, Math.floor(BUILD7.length * 0.6));

  it('boots with a default, copies the bytes to a backup key and leaves the v3 key as it was', () => {
    const store = new MemStore({ [SAVE_KEY]: truncated });
    expect(boot(store, 1_730_000_000_000)).toEqual(defaultSave());
    expect(saveLoadIssue()).toEqual({ kind: 'corrupt', kept: true });
    expect(store.getItem(`${SAVE_BACKUP_PREFIX}1730000000000`)).toBe(truncated);
    expect(store.getItem(SAVE_KEY)).toBe(truncated);
    expect(store.writes).toEqual([`${SAVE_BACKUP_PREFIX}1730000000000`]);
  });

  it('the boot write (first-run language) waits; the first player change writes, and the backup survives it', () => {
    const store = new MemStore({ [SAVE_KEY]: truncated });
    const save = boot(store);
    save.settings.language = 'az';
    expect(writeSaveAtBoot(save)).toBe(false);
    expect(store.getItem(SAVE_KEY)).toBe(truncated);
    expect(recordWin(save, 1, 3, 10)).toBe(30); // a player change → writeSave
    expect(JSON.parse(store.getItem(SAVE_KEY)!)).toMatchObject({ version: 3, stars: { '1': 3 }, gold: 30, settings: { language: 'az' } });
    expect(store.getItem(`${SAVE_BACKUP_PREFIX}1000`)).toBe(truncated);
    // the hold is over for the rest of the session: later boot-style writes go through
    expect(writeSaveAtBoot(save)).toBe(true);
  });

  it('a clean load never holds: writeSaveAtBoot writes a fresh or a readable save at once', () => {
    const fresh = new MemStore();
    const save = boot(fresh);
    expect(saveLoadIssue()).toBeNull();
    save.settings.language = 'tr';
    expect(writeSaveAtBoot(save)).toBe(true);
    expect(JSON.parse(fresh.getItem(SAVE_KEY)!).settings.language).toBe('tr');
  });

  it.each([
    ['literal null', 'null'],
    ['an array', '[3,3,3]'],
    ['a number', '42'],
    ['a string', '"save"'],
    ['an empty object', '{}'],
    ['an object with no save field', '{"foo":1}'],
    ['a non-numeric version', '{"version":"3","gold":5}'],
    ['bad JSON', '{"version":3,"gold":'],
  ])('%s is unreadable: kept aside, default in memory', (_label, text) => {
    expect(isReadableSaveText(text)).toBe(false);
    const store = new MemStore({ [SAVE_KEY]: text });
    expect(boot(store)).toEqual(defaultSave());
    expect(store.getItem(SAVE_KEY)).toBe(text);
    expect(store.backups().map((k) => store.getItem(k))).toEqual([text]);
  });

  it('a readable save with missing fields is normalised as before (no backup, no notice)', () => {
    const text = JSON.stringify({ version: 3, stars: { 1: 3, 2: 2, 3: 1 } });
    expect(isReadableSaveText(text)).toBe(true);
    const store = new MemStore({ [SAVE_KEY]: text });
    const s = boot(store);
    expect(s.stars).toEqual({ '1': 3, '2': 2, '3': 1 });
    expect(saveLoadIssue()).toBeNull();
    expect(store.backups()).toEqual([]);
    expect(store.writes).toEqual([]);
  });

  it('pruneSaveBackups (lazy): the same bytes kept once across reboots; distinct ones keep the newest SAVE_BACKUP_KEEP (2), by time', () => {
    const store = new MemStore({ [SAVE_KEY]: 'bad-1' });
    boot(store, 9_000);
    pruneSaveBackups();
    boot(store, 10_000); // relaunch before any change: the same bytes again
    expect(saveLoadIssue()).toEqual({ kind: 'corrupt', kept: true });
    pruneSaveBackups();
    expect(store.backups()).toEqual([`${SAVE_BACKUP_PREFIX}10000`]);
    store.map.set(SAVE_KEY, 'bad-2');
    boot(store, 20_000);
    pruneSaveBackups();
    store.map.set(SAVE_KEY, 'bad-3');
    boot(store, 100_000); // numeric order: 100000 is newer than 20000 although it sorts first as text
    pruneSaveBackups();
    expect(SAVE_BACKUP_KEEP).toBe(2);
    expect(store.backups().sort()).toEqual([`${SAVE_BACKUP_PREFIX}100000`, `${SAVE_BACKUP_PREFIX}20000`]);
    expect(store.getItem(`${SAVE_BACKUP_PREFIX}20000`)).toBe('bad-2');
    expect(store.getItem(`${SAVE_BACKUP_PREFIX}100000`)).toBe('bad-3');
    expect(store.getItem(SAVE_KEY)).toBe('bad-3');
  });

  it('a store that cannot list its keys is left as it is by the prune', () => {
    const m = new Map([[`${SAVE_BACKUP_PREFIX}1`, 'a'], [`${SAVE_BACKUP_PREFIX}2`, 'a'], [`${SAVE_BACKUP_PREFIX}3`, 'b']]);
    const plain = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    pruneSaveBackups(plain);
    expect(m.size).toBe(3);
  });

  it('noticeUnreadableSave: toast on a menu screen when a copy was kept; nothing over a match or when no copy exists', () => {
    registerEnglish(enMenus); // the toast's text ships with the lazy chunk's English part
    const title = { name: 'title', toast: new Toast() };
    noticeUnreadableSave({ current: title }, true);
    expect(title.toast.opts(performance.now())?.text).toBe('Your save could not be read; a copy was kept');
    const play = { name: 'play', toast: new Toast() };
    noticeUnreadableSave({ current: play }, true);
    expect(play.toast.opts(performance.now())).toBeNull();
    const lost = { name: 'title', toast: new Toast() };
    noticeUnreadableSave({ current: lost }, false);
    expect(lost.toast.opts(performance.now())).toBeNull();
  });

  it('backups and the legacy keys are left alone when the v3 key is empty or readable (no automatic recovery)', () => {
    const backup = `${SAVE_BACKUP_PREFIX}5000`;
    const empty = new MemStore({ [backup]: 'old bytes', [SAVE_KEY_V2]: JSON.stringify({ version: 2, coins: 50 }) });
    expect(boot(empty).gold).toBe(50); // the v2 migration as before
    expect(empty.getItem(backup)).toBe('old bytes');
    const readable = new MemStore({ [backup]: 'old bytes', [SAVE_KEY]: BUILD7 });
    expect(boot(readable).gold).toBe(1469);
    expect(readable.getItem(backup)).toBe('old bytes');
    expect(readable.writes).toEqual([]);
  });

  it('when even the backup cannot be written the load says so (no "copy kept" toast) and still does not overwrite at boot', () => {
    const store = new MemStore({ [SAVE_KEY]: truncated });
    store.refuse = () => true;
    expect(boot(store)).toEqual(defaultSave());
    expect(saveLoadIssue()).toEqual({ kind: 'corrupt', kept: false });
    store.refuse = null;
    expect(writeSaveAtBoot(defaultSave())).toBe(false);
    expect(store.getItem(SAVE_KEY)).toBe(truncated);
  });
});

describe('AUD-Q3: a save from a newer version is read-only', () => {
  const v4 = (() => {
    const o = JSON.parse(BUILD7) as Record<string, unknown>;
    o.version = 4;
    o.cloudId = 'abc-123';
    o.seasonPass = { tier: 7, xp: 1234 };
    return JSON.stringify(o);
  })();

  it('v4 with extra fields: loads what v3 understands, writes nothing, the stored bytes (extra fields included) stay', () => {
    const store = new MemStore({ [SAVE_KEY]: v4 });
    const heard: string[] = [];
    const off = onSaveWritten((j) => heard.push(j));
    const s = boot(store);
    expect(s).toStrictEqual(normalizeSave(JSON.parse(BUILD7)));
    expect(Object.keys(s.stars)).toHaveLength(50);
    expect(isSaveReadOnly()).toBe(true);
    expect(saveLoadIssue()).toEqual({ kind: 'newer', version: 4 });
    // every write path ends in writeSave: a win, a boot write, a reset
    expect(recordWin(s, 1, 3, 10)).toBe(0);
    expect(writeSave(s)).toBe(false);
    expect(writeSaveAtBoot(s)).toBe(false);
    resetProgress(s);
    expect(store.writes).toEqual([]);
    expect(store.getItem(SAVE_KEY)).toBe(v4);
    const onDisk = JSON.parse(store.getItem(SAVE_KEY)!) as Record<string, unknown>;
    expect(onDisk.version).toBe(4);
    expect(onDisk.cloudId).toBe('abc-123');
    expect(onDisk.seasonPass).toEqual({ tier: 7, xp: 1234 });
    expect(Object.keys(onDisk)).toHaveLength(22);
    expect(heard).toEqual([]); // the native mirror is not fed a downgraded copy either
    off();
  });

  it('v3 (the current version) is unchanged: not read-only, a change is written', () => {
    const store = new MemStore({ [SAVE_KEY]: BUILD7 });
    const s = boot(store);
    expect(isSaveReadOnly()).toBe(false);
    expect(saveLoadIssue()).toBeNull();
    expect(store.writes).toEqual([]);
    s.gold += 1;
    expect(writeSave(s)).toBe(true);
    expect(JSON.parse(store.getItem(SAVE_KEY)!).gold).toBe(1470);
    expect(SAVE_VERSION).toBe(3);
  });

  it('v1 and v2 are migrated as before (one v3 write, legacy entry left), not read-only', () => {
    const v2 = new MemStore({ [SAVE_KEY_V2]: read('v2-legacy.json') });
    expect(Object.keys(boot(v2).stars)).toHaveLength(14);
    expect(isSaveReadOnly()).toBe(false);
    expect(v2.writes).toEqual([SAVE_KEY]);
    expect(v2.getItem(SAVE_KEY_V2)).toBe(read('v2-legacy.json'));
    const v1 = new MemStore({ [SAVE_KEY_V1]: read('v1-legacy.json') });
    expect(boot(v1).gold).toBe(60);
    expect(isSaveReadOnly()).toBe(false);
    expect(v1.writes).toEqual([SAVE_KEY]);
    expect(JSON.parse(v1.getItem(SAVE_KEY)!).version).toBe(3);
  });

  it('the next load of a v3 save ends the read-only session', () => {
    boot(new MemStore({ [SAVE_KEY]: v4 }));
    expect(isSaveReadOnly()).toBe(true);
    boot(new MemStore({ [SAVE_KEY]: BUILD7 }));
    expect(isSaveReadOnly()).toBe(false);
  });
});

describe('onSaveWritten (native mirror hook, AUD-Q4)', () => {
  it('hears the exact JSON of every committed write — also when storage refuses it — and stops after unsubscribe', () => {
    const store = new MemStore();
    const s = boot(store);
    const heard: string[] = [];
    const off = onSaveWritten((j) => heard.push(j));
    const broken = onSaveWritten(() => {
      throw new Error('mirror down');
    });
    s.gold = 7;
    expect(writeSave(s)).toBe(true);
    expect(heard).toEqual([store.getItem(SAVE_KEY)]);
    store.refuse = () => true;
    s.gold = 8;
    expect(writeSave(s)).toBe(false);
    expect(JSON.parse(heard[1]!).gold).toBe(8);
    off();
    broken();
    store.refuse = null;
    writeSave(s);
    expect(heard).toHaveLength(2);
  });

  it('hears the one-time v2 → v3 migration write when registered before the load', () => {
    const heard: string[] = [];
    const off = onSaveWritten((j) => heard.push(j));
    const store = new MemStore({ [SAVE_KEY_V2]: read('v2-legacy.json') });
    boot(store);
    expect(heard).toEqual([store.getItem(SAVE_KEY)]);
    off();
  });
});
