import { isNative } from './index';

/**
 * Native share sheet hook (SHARE-1, GDD §7.6, POST_LAUNCH.md §6.2 "Share card").
 *
 * Ownership: created by the Frontend Engineer; the Mobile Engineer owns the native branch inside
 * `shareImage` (Capacitor Share) and edits only that. The signature is the contract with
 * `src/ui/share.ts` — do not change it without telling the Frontend Engineer.
 *
 * Privacy: the image is created on the device; it leaves it only through the system share sheet
 * when the player chooses. No upload, no network call of our own.
 */

/**
 * `'shared'` — the sheet completed; `'unavailable'` — no native share here (the caller shows
 * "Sharing not available" or, on the web, runs its own Web Share / download chain);
 * `'cancelled'` — the player dismissed the sheet (optional for implementers: the caller shows no
 * toast; an implementation that only returns the first two values is valid).
 */
export type NativeShareResult = 'shared' | 'unavailable' | 'cancelled';

/**
 * Share a PNG `file` with `text` through the platform share sheet.
 * Web branch (browser / PWA / tests): resolves `'unavailable'` at once — the web chain
 * (`navigator.share` → download) lives in `src/ui/share.ts`. Native branch (MM-8): the PNG goes
 * through the system share sheet with `@capacitor/share` (`shareImageNative` below). Never rejects.
 */
export async function shareImage(file: File, text: string): Promise<NativeShareResult> {
  if (!isNative()) return 'unavailable';
  // ---- native branch (Mobile Engineer): @capacitor/share goes here ----
  return shareImageNative(file, text);
}

// ---------------------------------------------------------------------------------------------
// Native branch (Mobile Engineer, MM-8). `@capacitor/share` only accepts `file://` URIs, so the
// PNG is first written (base64) into the app's cache directory with `@capacitor/filesystem`; on
// Android the share plugin hands that file out through the app's FileProvider
// (`${applicationId}.fileprovider`, `<cache-path>` in android/app/src/main/res/xml/file_paths.xml).
// Both plugins are loaded with dynamic `import()` only here, so the web/PWA bundle never contains
// them. No network access.
// ---------------------------------------------------------------------------------------------

/** Name of the cached PNG: one fixed file, overwritten by every share, so the cache never grows. */
const NATIVE_SHARE_FILE = 'tower-clash-share.png';
/** Email subject / Android chooser title. The game name is not localised. */
const NATIVE_SHARE_TITLE = 'Tower Clash';

/** True while a native share sheet is open: a second tap must not overwrite the file being shared. */
let nativeShareInFlight = false;

/**
 * `Share.canShare()` → `Filesystem.writeFile(Directory.Cache)` → `Share.share({ files: [uri] })`;
 * if the file cannot be written, `Share.share({ title, text })` without the image. Resolves
 * `'shared'` when the plugin call resolves, `'cancelled'` when the player closes the sheet,
 * `'unavailable'` on `canShare` false, a second tap while the sheet is open, or any other error.
 */
async function shareImageNative(file: File, text: string): Promise<NativeShareResult> {
  if (nativeShareInFlight) return 'unavailable';
  nativeShareInFlight = true;
  try {
    const { Share } = await import('@capacitor/share');
    const { value: canShare } = await Share.canShare();
    if (!canShare) return 'unavailable';
    const uri = await writeShareFile(file);
    const options = { title: NATIVE_SHARE_TITLE, text, dialogTitle: NATIVE_SHARE_TITLE };
    await Share.share(uri ? { ...options, files: [uri] } : options);
    return 'shared';
  } catch (err) {
    // iOS and Android both reject with "Share canceled" when the sheet is dismissed.
    if (/cancel/i.test(err instanceof Error ? err.message : String(err))) return 'cancelled';
    console.warn('[native] share failed:', err);
    return 'unavailable';
  } finally {
    nativeShareInFlight = false;
  }
}

/** Writes the PNG into the cache directory and returns its `file://` URI, or null on any failure. */
async function writeShareFile(file: File): Promise<string | null> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const data = toBase64(new Uint8Array(await file.arrayBuffer()));
    const { uri } = await Filesystem.writeFile({ path: NATIVE_SHARE_FILE, data, directory: Directory.Cache });
    return uri || null;
  } catch (err) {
    console.warn('[native] share image write failed, sharing text only:', err);
    return null;
  }
}

/** Base64 without a data-URL prefix (what `Filesystem.writeFile` expects for binary data). */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000; // keeps String.fromCharCode's argument list well under engine limits
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
