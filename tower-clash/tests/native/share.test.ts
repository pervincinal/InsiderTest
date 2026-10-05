/**
 * MM-8: native branch of `src/native/share.ts`. Inside a Capacitor shell `shareImage()` lazily
 * imports `@capacitor/share`, asks `canShare()`, writes the PNG (base64) into the cache directory
 * with `@capacitor/filesystem` and shares the returned `file://` URI through the system sheet;
 * when the file cannot be written it shares the text alone. A dismissed sheet resolves
 * 'cancelled', every other failure 'unavailable'; it never rejects.
 *
 * Both plugin modules are mocked with factories that count evaluations and log every call, so
 * the tests can assert the lazy import and the exact call order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ctl = {
  isNative: true,
  imports: { share: 0, filesystem: 0 },
  calls: [] as Array<[string, unknown?]>,
  canShare: true as boolean | 'throw',
  failShareImport: false,
  failFilesystemImport: false,
  failWrite: false,
  /** `Share.share()` rejects with this message (both plugins say "Share canceled" on dismiss). */
  failShare: null as string | null,
  /** When set, `Share.share()` waits for this promise (to test overlapping calls). */
  shareGate: null as Promise<void> | null,
};

vi.mock('../../src/native/index', () => ({
  isNative: () => ctl.isNative,
  getPlatform: () => (ctl.isNative ? 'android' : 'web'),
}));

type ShareModule = typeof import('../../src/native/share');

const CACHE_URI = 'file:///data/user/0/com.pervincinal.towerclash/cache/tower-clash-share.png';

async function freshShare(): Promise<ShareModule> {
  vi.resetModules();
  vi.doMock('@capacitor/share', () => {
    ctl.imports.share++;
    if (ctl.failShareImport) throw new Error('Failed to fetch dynamically imported module: share');
    return {
      Share: {
        async canShare() {
          ctl.calls.push(['canShare']);
          if (ctl.canShare === 'throw') throw new Error('not implemented');
          return { value: ctl.canShare };
        },
        async share(options: unknown) {
          ctl.calls.push(['share', options]);
          if (ctl.shareGate) await ctl.shareGate;
          if (ctl.failShare) throw new Error(ctl.failShare);
          return { activityType: 'com.example.chat' };
        },
      },
    };
  });
  vi.doMock('@capacitor/filesystem', () => {
    ctl.imports.filesystem++;
    if (ctl.failFilesystemImport) throw new Error('Failed to fetch dynamically imported module: filesystem');
    return {
      Directory: { Cache: 'CACHE', Documents: 'DOCUMENTS' },
      Filesystem: {
        async writeFile(options: unknown) {
          ctl.calls.push(['writeFile', options]);
          if (ctl.failWrite) throw new Error('disk full');
          return { uri: CACHE_URI };
        },
      },
    };
  });
  return import('../../src/native/share');
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 255, 128, 7]);
function pngFile(): File {
  return new File([PNG_BYTES], 'tower-clash-level-12.png', { type: 'image/png' });
}
const TEXT = 'I cleared level 12 in Tower Clash!';
/** Argument of the `i`-th logged plugin call (fails the test if there is no such call). */
function argOf(i: number): unknown {
  const call = ctl.calls[i];
  if (!call) throw new Error(`expected a plugin call #${i}, got ${ctl.calls.length}`);
  return call[1];
}

beforeEach(() => {
  Object.assign(ctl, {
    isNative: true,
    imports: { share: 0, filesystem: 0 },
    calls: [],
    canShare: true,
    failShareImport: false,
    failFilesystemImport: false,
    failWrite: false,
    failShare: null,
    shareGate: null,
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@capacitor/share');
  vi.doUnmock('@capacitor/filesystem');
});

describe('shareImage — web', () => {
  it('resolves "unavailable" without loading either plugin', async () => {
    ctl.isNative = false;
    const { shareImage } = await freshShare();
    await expect(shareImage(pngFile(), TEXT)).resolves.toBe('unavailable');
    expect(ctl.imports).toEqual({ share: 0, filesystem: 0 });
    expect(ctl.calls).toEqual([]);
  });
});

describe('shareImage — native (MM-8)', () => {
  it('does not load the plugins until shareImage() is called', async () => {
    await freshShare();
    expect(ctl.imports).toEqual({ share: 0, filesystem: 0 });
  });

  it('canShare → writeFile(cache, base64) → share({ files: [uri], text }) and resolves "shared"', async () => {
    const { shareImage } = await freshShare();
    await expect(shareImage(pngFile(), TEXT)).resolves.toBe('shared');

    expect(ctl.imports).toEqual({ share: 1, filesystem: 1 });
    expect(ctl.calls.map(([name]) => name)).toEqual(['canShare', 'writeFile', 'share']);

    const write = argOf(1) as { path: string; data: string; directory: string; encoding?: string };
    expect(write.directory).toBe('CACHE');
    expect(write.path).toMatch(/\.png$/);
    expect(write.encoding).toBeUndefined(); // base64 binary, not UTF-8 text
    expect(write.data).not.toMatch(/^data:/);
    expect(new Uint8Array(Buffer.from(write.data, 'base64'))).toEqual(PNG_BYTES);

    const share = argOf(2) as { text: string; files: string[]; title?: string };
    expect(share.text).toBe(TEXT);
    expect(share.files).toEqual([CACHE_URI]);
  });

  it('falls back to a text-only share when the file write fails', async () => {
    ctl.failWrite = true;
    const { shareImage } = await freshShare();
    await expect(shareImage(pngFile(), TEXT)).resolves.toBe('shared');
    expect(ctl.calls.map(([name]) => name)).toEqual(['canShare', 'writeFile', 'share']);
    const share = argOf(2) as { text: string; files?: string[]; title?: string };
    expect(share.text).toBe(TEXT);
    expect(share.files).toBeUndefined();
    expect(share.title).toBeTruthy();
  });

  it('falls back to a text-only share when the filesystem plugin fails to load', async () => {
    ctl.failFilesystemImport = true;
    const { shareImage } = await freshShare();
    await expect(shareImage(pngFile(), TEXT)).resolves.toBe('shared');
    expect(ctl.calls.map(([name]) => name)).toEqual(['canShare', 'share']);
    expect((argOf(1) as { files?: string[] }).files).toBeUndefined();
  });

  it('resolves "unavailable" without writing or sharing when canShare() is false', async () => {
    ctl.canShare = false;
    const { shareImage } = await freshShare();
    await expect(shareImage(pngFile(), TEXT)).resolves.toBe('unavailable');
    expect(ctl.calls.map(([name]) => name)).toEqual(['canShare']);
    expect(ctl.imports.filesystem).toBe(0);
  });

  it('resolves "unavailable" (never rejects) when canShare() throws', async () => {
    ctl.canShare = 'throw';
    const { shareImage } = await freshShare();
    await expect(shareImage(pngFile(), TEXT)).resolves.toBe('unavailable');
  });

  it('resolves "unavailable" when the share plugin fails to load', async () => {
    ctl.failShareImport = true;
    const { shareImage } = await freshShare();
    await expect(shareImage(pngFile(), TEXT)).resolves.toBe('unavailable');
    expect(ctl.calls).toEqual([]);
  });

  it('resolves "cancelled" when the player dismisses the sheet and does not open a second sheet', async () => {
    ctl.failShare = 'Share canceled';
    const { shareImage } = await freshShare();
    await expect(shareImage(pngFile(), TEXT)).resolves.toBe('cancelled');
    expect(ctl.calls.filter(([name]) => name === 'share')).toHaveLength(1);
  });

  it('resolves "unavailable" when Share.share() fails for any other reason', async () => {
    ctl.failShare = "Can't share while sharing is in progress";
    const { shareImage } = await freshShare();
    await expect(shareImage(pngFile(), TEXT)).resolves.toBe('unavailable');
    expect(ctl.calls.filter(([name]) => name === 'share')).toHaveLength(1);
  });

  it('ignores a second tap while the sheet is open, then works again', async () => {
    let open!: () => void;
    ctl.shareGate = new Promise<void>((resolve) => (open = resolve));
    const { shareImage } = await freshShare();
    const first = shareImage(pngFile(), TEXT);
    await vi.waitFor(() => expect(ctl.calls.some(([name]) => name === 'share')).toBe(true));
    await expect(shareImage(pngFile(), TEXT)).resolves.toBe('unavailable');
    open();
    await expect(first).resolves.toBe('shared');
    ctl.shareGate = null;
    await expect(shareImage(pngFile(), TEXT)).resolves.toBe('shared');
    expect(ctl.calls.filter(([name]) => name === 'share')).toHaveLength(2);
  });
});
