import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Monetization placeholders (see docs/MOBILE.md §8). These are PUBLIC identifiers, not secrets:
 * they ship inside every app binary. Leave a value empty ('') to keep the safe default:
 *   - RevenueCat key empty  -> the native store reports `isAvailable() === false`, purchases
 *                              resolve `{ ok: false, error: 'unavailable' }` (no crash).
 *   - AdMob ad unit empty   -> Google's official TEST ad units are used (never real ads).
 * The `VITE_RC_IOS_KEY`, `VITE_RC_ANDROID_KEY`, `VITE_ADMOB_{IOS,ANDROID}_{INTERSTITIAL,REWARDED}`
 * environment variables override these at `vite build` time (used by CI secrets).
 * The AdMob *app* ids live in the native projects instead:
 *   android/app/src/main/res/values/strings.xml  (admob_app_id)
 *   ios/App/App/Info.plist                        (GADApplicationIdentifier)
 */
export const towerClashPluginConfig = {
  revenueCat: {
    /** RevenueCat "Apple App Store" public API key (starts with `appl_`). */
    ios: '',
    /** RevenueCat "Google Play Store" public API key (starts with `goog_`). */
    android: '',
  },
  adMob: {
    ios: {
      /** AdMob ad unit id `ca-app-pub-XXXX/YYYY` of type Interstitial. */
      interstitial: '',
      /** AdMob ad unit id of type Rewarded. */
      rewarded: '',
      /** Optional: placementId -> rewarded ad unit id (falls back to `rewarded`). */
      rewardedByPlacement: {} as Record<string, string>,
    },
    android: {
      interstitial: '',
      rewarded: '',
      rewardedByPlacement: {} as Record<string, string>,
    },
  },
};

// Native shells only load the Vite build in `dist/`; no game logic lives in native code.
const config: CapacitorConfig = {
  appId: 'com.pervincinal.towerclash',
  appName: 'Tower Clash',
  webDir: 'dist',
  backgroundColor: '#0f172a',
  server: {
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#0f172a',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0f172a',
  },
  plugins: {
    // Read by src/economy/providers/config.ts (the JS side imports this file directly; the
    // Capacitor bridge does not forward custom plugin config to the web view).
    TowerClash: towerClashPluginConfig,
  },
};

export default config;
