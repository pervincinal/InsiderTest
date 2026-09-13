/**
 * Native bridge (Capacitor). Stub: the Mobile Engineer fills this in with StatusBar,
 * ScreenOrientation, Haptics and App back-button handling. Web builds must keep working
 * with every call being a cheap no-op when `window.Capacitor` is absent.
 */
export interface NativeHooks {
  /** Called when the hardware back button is pressed (Android). Return true if handled. */
  onBack: () => boolean;
}

export function isNative(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { Capacitor?: unknown }).Capacitor);
}

export async function initNative(_hooks: NativeHooks): Promise<void> {
  /* filled in by the Mobile Engineer */
}

export function hapticCapture(): void {
  /* filled in by the Mobile Engineer */
}
