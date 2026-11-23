import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNative } from '../../src/native/index';

/*
 * REV-39: main.ts `registerServiceWorker` skips the worker only inside a native shell (`isNative()`),
 * not whenever `window.Capacitor` exists — a web `@capacitor/core` import defines the global too and
 * reports `isNativePlatform() === false`; that PWA keeps its offline worker.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('service worker native gate (REV-39)', () => {
  it('a web @capacitor/core global is not native (the worker registers)', () => {
    vi.stubGlobal('window', {
      Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
    });
    expect(isNative()).toBe(false);
  });

  it('the native bridge is native (the worker is skipped); no global is web', () => {
    vi.stubGlobal('window', {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
    });
    expect(isNative()).toBe(true);
    vi.stubGlobal('window', {});
    expect(isNative()).toBe(false);
  });
});
