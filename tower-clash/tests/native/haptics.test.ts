/**
 * MM-16: the native end of the haptics path (`src/native/index.ts` `initNative` / `hapticCapture`).
 * tests/ui/vibrationSetting.test.ts, tests/render/airstrikeFx.test.ts and tests/audio/hits.test.ts mock
 * `hapticCapture` and pin the Settings → Vibration gate in front of it; this file pins what the bridge
 * then sends to `@capacitor/haptics`: `Haptics.impact({ style: Light })` for a capture / hit,
 * `Medium` for the airstrike and a lost tower (`hapticCapture(true)`), nothing on the web or before
 * `initNative` loaded the plugin, and at most one impact per 150 ms.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { style: string }[] = [];
let clock = 1000;

async function fresh(native: boolean): Promise<typeof import('../../src/native/index')> {
  vi.resetModules();
  calls.length = 0;
  vi.doMock('@capacitor/haptics', () => ({
    Haptics: { impact: (o: { style: string }) => (calls.push(o), Promise.resolve()) },
    ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  }));
  vi.doMock('@capacitor/status-bar', () => ({ StatusBar: { setOverlaysWebView: () => Promise.resolve(), hide: () => Promise.resolve() } }));
  vi.doMock('@capacitor/screen-orientation', () => ({ ScreenOrientation: { lock: () => Promise.resolve() } }));
  vi.doMock('@capacitor/app', () => ({ App: { addListener: () => Promise.resolve({ remove: () => undefined }), exitApp: () => Promise.resolve() } }));
  vi.stubGlobal('window', native ? { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } } : {});
  vi.stubGlobal('performance', { now: () => clock });
  return import('../../src/native/index');
}

describe('hapticCapture → @capacitor/haptics (native bridge)', () => {
  beforeEach(() => {
    clock = 1000;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('web build: a no-op (initNative resolves without loading the plugin, no impact)', async () => {
    const n = await fresh(false);
    await n.initNative({ onBack: () => true });
    n.hapticCapture();
    n.hapticCapture(true);
    expect(calls).toEqual([]);
  });

  it('native, before initNative: a no-op; after it, light for a capture / hit and medium for the airstrike / a lost tower', async () => {
    const n = await fresh(true);
    n.hapticCapture(true);
    expect(calls).toEqual([]);
    await n.initNative({ onBack: () => true });
    n.hapticCapture();
    clock += 200;
    n.hapticCapture(true);
    expect(calls).toEqual([{ style: 'LIGHT' }, { style: 'MEDIUM' }]);
  });

  it('at most one impact per 150 ms, whatever its weight', async () => {
    const n = await fresh(true);
    await n.initNative({ onBack: () => true });
    n.hapticCapture(true);
    clock += 149;
    n.hapticCapture(true);
    n.hapticCapture();
    clock += 1;
    n.hapticCapture();
    expect(calls).toEqual([{ style: 'MEDIUM' }, { style: 'LIGHT' }]);
  });

  it('an impact that throws or rejects (no Taptic Engine, old Android) never reaches the game', async () => {
    const n = await fresh(true);
    await n.initNative({ onBack: () => true });
    const h = await import('@capacitor/haptics');
    (h.Haptics as { impact: unknown }).impact = () => Promise.reject(new Error('unavailable'));
    expect(() => n.hapticCapture()).not.toThrow();
    clock += 200;
    (h.Haptics as { impact: unknown }).impact = () => {
      throw new Error('unavailable');
    };
    expect(() => n.hapticCapture(true)).not.toThrow();
  });
});
