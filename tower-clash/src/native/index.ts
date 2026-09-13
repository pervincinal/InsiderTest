/**
 * Native bridge (Capacitor). Every export is a cheap no-op on the web: the plugin packages are
 * loaded with dynamic `import()` only inside a native shell, so Vite code-splits them into a
 * separate chunk that the browser/PWA build never downloads.
 *
 * Owned by the Mobile Engineer. The exported signatures are part of the contract with
 * `src/main.ts` / `src/ui/play.ts` — do not change them without telling the Frontend Engineer.
 */
export interface NativeHooks {
  /** Called when the hardware back button is pressed (Android). Return true if handled. */
  onBack: () => boolean;
  /**
   * Optional: true while the title screen is showing. When the back press was not handled and
   * this returns true the app exits; when it returns false the press is ignored. If omitted, an
   * unhandled back press is treated as "already at the root" and exits.
   */
  isTitleScreen?: () => boolean;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

/** True inside a Capacitor native shell (Android/iOS), false in a browser or PWA. */
export function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap) return false;
  // The native bridge always injects `isNativePlatform`; a web-only `@capacitor/core` import
  // would also define `window.Capacitor` but report false here.
  return typeof cap.isNativePlatform === 'function' ? cap.isNativePlatform() : true;
}

// Type-only imports are erased by TypeScript, so they do not pull the plugin into the web bundle.
type HapticsModule = typeof import('@capacitor/haptics');

let haptics: { plugin: HapticsModule['Haptics']; light: HapticsModule['ImpactStyle']['Light'] } | null =
  null;
let lastHapticAt = -Infinity;
const HAPTIC_MIN_INTERVAL_MS = 150;

/**
 * Set up the native shell: hide the status bar (overlaying the web view so the canvas draws
 * under it), lock portrait, and route the Android hardware back button through `hooks.onBack`.
 * Resolves immediately on the web. Never throws: a missing/failed plugin only logs a warning.
 */
export async function initNative(hooks: NativeHooks): Promise<void> {
  if (!isNative()) return;

  const [statusBarMod, orientationMod, hapticsMod, appMod] = await Promise.allSettled([
    import('@capacitor/status-bar'),
    import('@capacitor/screen-orientation'),
    import('@capacitor/haptics'),
    import('@capacitor/app'),
  ]);

  if (statusBarMod.status === 'fulfilled') {
    const { StatusBar } = statusBarMod.value;
    // Android-only call; iOS resolves/rejects harmlessly ("not implemented"), hence the catches.
    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);
    await StatusBar.hide().catch((err: unknown) => warn('StatusBar.hide', err));
  } else {
    warn('@capacitor/status-bar', statusBarMod.reason);
  }

  if (orientationMod.status === 'fulfilled') {
    const { ScreenOrientation } = orientationMod.value;
    await ScreenOrientation.lock({ orientation: 'portrait' }).catch((err: unknown) =>
      warn('ScreenOrientation.lock', err),
    );
  } else {
    warn('@capacitor/screen-orientation', orientationMod.reason);
  }

  if (hapticsMod.status === 'fulfilled') {
    haptics = { plugin: hapticsMod.value.Haptics, light: hapticsMod.value.ImpactStyle.Light };
  } else {
    warn('@capacitor/haptics', hapticsMod.reason);
  }

  if (appMod.status === 'fulfilled') {
    const { App } = appMod.value;
    try {
      await App.addListener('backButton', () => {
        let handled = false;
        try {
          handled = hooks.onBack();
        } catch (err) {
          warn('hooks.onBack', err);
          handled = true; // never exit the app because of a UI error
        }
        if (handled) return;
        const onTitle = hooks.isTitleScreen ? hooks.isTitleScreen() : true;
        if (onTitle) void App.exitApp().catch((err: unknown) => warn('App.exitApp', err));
        // otherwise: unhandled but not on the title screen — ignore the press
      });
    } catch (err) {
      warn('App.addListener(backButton)', err);
    }
  } else {
    warn('@capacitor/app', appMod.reason);
  }
}

/**
 * Light haptic tick for a tower capture. No-op on the web or before `initNative` finished;
 * rate-limited to one impact per 150 ms so mass captures do not turn into a continuous buzz.
 */
export function hapticCapture(): void {
  if (!haptics) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastHapticAt < HAPTIC_MIN_INTERVAL_MS) return;
  lastHapticAt = now;
  try {
    haptics.plugin.impact({ style: haptics.light }).catch(() => undefined);
  } catch {
    /* haptics unavailable on this device — silently ignore */
  }
}

function warn(what: string, err: unknown): void {
  console.warn(`[native] ${what} failed:`, err);
}
