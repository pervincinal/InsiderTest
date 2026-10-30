import { SAVE_BACKUP_PREFIX, SAVE_KEY, isReadableSaveText, onSaveWritten } from '../ui/save';
import { isNative } from './index';

/**
 * Native save mirror (AUD-Q4, docs/MOBILE.md §8.9 "Save mirror").
 *
 * Inside the Android / iOS app the WebView's localStorage used to be the only copy of the player's
 * progress. This module keeps a second copy of the v3 save JSON in `@capacitor/preferences`
 * (Android `SharedPreferences` file `CapacitorStorage`, iOS `UserDefaults`, key
 * `CapacitorStorage.towerclash.save.v3`) and restores from it at boot when localStorage has no
 * readable v3 save. On the web / PWA / tests `startSaveMirror()` (`src/native/index.ts`) resolves `'web'` at
 * once and neither this module nor the plugin is loaded (dynamic `import()` only inside a native shell).
 *
 * Writes: `onSaveWritten` (`src/ui/save.ts`) hands over the exact JSON of every committed save —
 * each `writeSave` and the one-time v1 / v2 migration — also when localStorage refused it (quota),
 * never while the save is read-only (newer schema, AUD-Q3). The newest JSON is passed to
 * `Preferences.set` at most `SAVE_MIRROR_DELAY_MS` after the first unmirrored write (last write
 * wins, calls strictly in order), and at once when the app goes to the background
 * (`visibilitychange` hidden, `pagehide`, the `pause` event both Capacitor bridges fire on `document`).
 *
 * Restore rule (boot, before `loadSave()` and the title):
 *   - localStorage holds a readable v3 save (`isReadableSaveText`, the test `loadSaveFrom` uses) →
 *     it is used as it is; the native copy is seeded with it when the native copy is missing or
 *     unreadable (first launch after the update that added the mirror).
 *   - localStorage has no v3 save, or an unreadable one, and the native copy is readable → the
 *     native copy is written to localStorage under `SAVE_KEY` (an unreadable local string is first
 *     copied to `SAVE_BACKUP_PREFIX + Date.now()`, the AUD-Q2 backup key — never destroyed) and
 *     `loadSave()` reads it as usual.
 *   - neither is readable → nothing happens (a fresh game, the AUD-Q2 corrupt-save path, or the
 *     legacy v2 / v1 migration in `loadSaveFrom`).
 * A session that could not restore a readable native copy (plugin too slow, localStorage refused
 * the write) never mirrors, so a default save cannot overwrite the good copy for the next launch.
 *
 * Owned by the Mobile Engineer. No game logic: the JSON is copied byte for byte, never parsed into
 * a SaveData or migrated here. Never throws, never blocks boot longer than `SAVE_RESTORE_TIMEOUT_MS`
 * (plus loading this chunk from the app bundle). This whole module is a lazy chunk (with the plugin):
 * the eager bundle only has the `isNative()` gate in `startSaveMirror()`, `src/native/index.ts`.
 */

/** Longest time between a save write and the matching `Preferences.set` call. */
export const SAVE_MIRROR_DELAY_MS = 250;
/** Boot never waits longer than this for the plugin chunk + `Preferences.get` (then: no restore). */
export const SAVE_RESTORE_TIMEOUT_MS = 1500;

/** The slice of `@capacitor/preferences` the mirror uses (tests pass a fake). */
export interface MirrorPrefs {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
}

/** The slice of localStorage the restore uses. */
export interface MirrorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * `'web'` — not a native shell, nothing loaded; `'kept'` — localStorage had a readable v3 save;
 * `'restored'` — it did not and the native copy was written back; `'empty'` — neither had one;
 * `'unavailable'` — the plugin failed / timed out or the restore could not be written (no mirror
 * this session when a readable native copy has to be protected).
 */
export type RestoreOutcome = 'web' | 'kept' | 'restored' | 'empty' | 'unavailable';

export interface SaveMirror {
  /** Queue `json` for the native copy (last write wins, ≤ `delayMs`). */
  write(json: string): void;
  /** Hand the newest queued JSON to `Preferences.set` now; resolves when every queued call settled. */
  flush(): Promise<void>;
}

/** True when `loadSaveFrom` would read `raw` as a save (delegates to `isReadableSaveText`, `src/ui/save.ts`). */
export function isUsableSave(raw: string | null | undefined): raw is string {
  return isReadableSaveText(raw);
}

interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * The write side. The first `write` after a flush starts one timer (not reset by later writes, so
 * the delay is a ceiling); when it fires, only the newest JSON is sent. `Preferences.set` calls are
 * chained, so an older value can never land after a newer one; a failed call is logged and the
 * value is retried by the next write or flush.
 */
export function createSaveMirror(prefs: MirrorPrefs, delayMs = SAVE_MIRROR_DELAY_MS, timers: Timers = realTimers): SaveMirror {
  let latest: string | null = null;
  let sent: string | null = null;
  let timer: unknown = null;
  let chain: Promise<void> = Promise.resolve();

  const flush = (): Promise<void> => {
    if (timer !== null) {
      timers.clear(timer);
      timer = null;
    }
    const value = latest;
    latest = null;
    if (value !== null && value !== sent) {
      sent = value;
      chain = chain
        .then(() => prefs.set({ key: SAVE_KEY, value }))
        .catch((err: unknown) => {
          if (sent === value) sent = null;
          warn('Preferences.set', err);
        });
    }
    return chain;
  };

  return {
    write(json: string): void {
      latest = json;
      if (timer === null) {
        timer = timers.set(() => {
          timer = null;
          void flush();
        }, delayMs);
      }
    },
    flush,
  };
}

/** Injection points (all default to the real WebView / plugin); tests override them. */
export interface SaveMirrorDeps {
  native: boolean;
  storage: MirrorStorage | null;
  loadPrefs: () => Promise<MirrorPrefs>;
  /** Subscribe to save writes (the JSON committed under `SAVE_KEY`); default `onSaveWritten`. */
  watch: (listener: (json: string) => void) => () => void;
  /** Subscribe to "the app goes to the background". */
  onHidden: (listener: () => void) => () => void;
  timeoutMs: number;
  delayMs: number;
  timers: Timers;
  now: () => number;
}

let active: { mirror: SaveMirror; stop: () => void } | null = null;
let started: Promise<RestoreOutcome> | null = null;

/**
 * Restore by the rule above, then mirror every later write. Reached through `startSaveMirror()` in
 * `src/native/index.ts` (awaited by `boot()` in `src/main.ts` before `loadSave()`), which loads this
 * module only inside a native shell. Web → `'web'` without loading the plugin. Calling it again
 * returns the first call's promise. Never rejects.
 */
export function bootSaveMirror(overrides: Partial<SaveMirrorDeps> = {}): Promise<RestoreOutcome> {
  if (!started) started = start({ ...defaultDeps(), ...overrides });
  return started;
}

/** Flush the pending native write now (no-op when the mirror is not running). */
export function flushSaveMirror(): Promise<void> {
  return active ? active.mirror.flush() : Promise.resolve();
}

/** Test hook: uninstall the watchers and forget the started mirror. */
export function resetSaveMirrorForTests(): void {
  active?.stop();
  active = null;
  started = null;
}

async function start(deps: SaveMirrorDeps): Promise<RestoreOutcome> {
  if (!deps.native) return 'web';
  const read = readNativeCopy(deps);
  let timeout: unknown = null;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timeout = deps.timers.set(() => resolve('timeout'), deps.timeoutMs);
  });
  let first: { prefs: MirrorPrefs; value: string | null } | 'timeout';
  try {
    first = await Promise.race([read, timedOut]);
  } catch (err) {
    warn('@capacitor/preferences', err);
    return 'unavailable';
  } finally {
    deps.timers.clear(timeout);
  }
  if (first === 'timeout') {
    warn('save restore', new Error(`no answer within ${deps.timeoutMs} ms, booting from localStorage`));
    // the plugin may still arrive: mirror from then on, but never restore behind loadSave()'s back
    read.then((late) => attach(deps, late.prefs, late.value, false)).catch(() => undefined);
    return 'unavailable';
  }
  return attach(deps, first.prefs, first.value, true);
}

async function readNativeCopy(deps: SaveMirrorDeps): Promise<{ prefs: MirrorPrefs; value: string | null }> {
  const prefs = await deps.loadPrefs();
  let value: string | null = null;
  try {
    value = (await prefs.get({ key: SAVE_KEY })).value;
  } catch (err) {
    warn('Preferences.get', err);
  }
  return { prefs, value };
}

function attach(deps: SaveMirrorDeps, prefs: MirrorPrefs, mirrored: string | null, mayRestore: boolean): RestoreOutcome {
  const local = readItem(deps.storage, SAVE_KEY);
  const mirror = createSaveMirror(prefs, deps.delayMs, deps.timers);
  let outcome: RestoreOutcome;
  if (isUsableSave(local)) {
    outcome = 'kept';
    if (!isUsableSave(mirrored)) mirror.write(local); // seed: the first launch after the mirror shipped
  } else if (!isUsableSave(mirrored)) {
    outcome = 'empty';
  } else if (mayRestore && restoreInto(deps.storage, local, mirrored, deps.now())) {
    outcome = 'restored';
  } else {
    // a readable native copy this session did not start from: keep it intact for the next launch
    return 'unavailable';
  }
  const unwatch = deps.watch((json) => mirror.write(json));
  const unhide = deps.onHidden(() => void mirror.flush());
  active = {
    mirror,
    stop: () => {
      unwatch();
      unhide();
    },
  };
  return outcome;
}

function restoreInto(storage: MirrorStorage | null, local: string | null, mirrored: string, nowMs: number): boolean {
  if (!storage) return false;
  try {
    if (local) storage.setItem(SAVE_BACKUP_PREFIX + nowMs, local); // the unreadable original, as AUD-Q2 keeps it
    storage.setItem(SAVE_KEY, mirrored);
    return storage.getItem(SAVE_KEY) === mirrored;
  } catch (err) {
    warn('save restore', err);
    return false;
  }
}

function readItem(storage: MirrorStorage | null, key: string): string | null {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}

function defaultDeps(): SaveMirrorDeps {
  return {
    native: isNative(),
    storage: webStorage(),
    loadPrefs: loadPreferencesPlugin,
    watch: onSaveWritten,
    onHidden: onAppHidden,
    timeoutMs: SAVE_RESTORE_TIMEOUT_MS,
    delayMs: SAVE_MIRROR_DELAY_MS,
    timers: realTimers,
    now: () => Date.now(),
  };
}

/**
 * The plugin behind a plain object. Never hand the plugin itself to `resolve()` / `return` in an
 * async function / `await`: Capacitor's plugin proxy answers *every* property, `then` included, so
 * the promise machinery takes it for a thenable and the promise never settles (found by the
 * fake-bridge browser probe, 2026-10-30; pinned by tests/native/saveMirror.test.ts).
 */
async function loadPreferencesPlugin(): Promise<MirrorPrefs> {
  const { Preferences } = await import('@capacitor/preferences');
  return {
    get: (options) => Preferences.get(options),
    set: (options) => Preferences.set(options),
  };
}

function webStorage(): MirrorStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // SecurityError: storage disabled
  }
}

/** Background signals: page visibility, `pagehide`, and the `pause` event both Capacitor bridges fire on `document`. */
function onAppHidden(listener: () => void): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => undefined;
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') listener();
  };
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('pause', listener);
  window.addEventListener('pagehide', listener);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('pause', listener);
    window.removeEventListener('pagehide', listener);
  };
}

function warn(what: string, err: unknown): void {
  console.warn(`[native] ${what} failed:`, err);
}
