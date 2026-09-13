/**
 * Monetization configuration: RevenueCat public API keys and AdMob ad unit ids.
 *
 * Precedence (highest first):
 *   1. `VITE_*` environment variables baked in at `vite build` time (CI secrets, `.env.local`).
 *   2. `plugins.TowerClash` in `capacitor.config.ts` (placeholders, committed).
 *   3. Safe defaults: no RevenueCat key (store unavailable), Google's official AdMob TEST ad units.
 *
 * Everything here is a public identifier that ships inside the app binary; nothing is secret.
 * Owned by the Mobile Engineer — see docs/MOBILE.md §8.
 */
import { towerClashPluginConfig } from '../../../capacitor.config';
import type { NativePlatform } from '../../native/index';

/** Google's official test ad units — always serve test ads, never real ones. */
export const ADMOB_TEST_UNITS = {
  android: {
    appId: 'ca-app-pub-3940256099942544~3347511713',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
  ios: {
    appId: 'ca-app-pub-3940256099942544~1458002511',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
} as const;

export interface AdMobUnits {
  interstitial: string;
  rewarded: string;
  /** placementId -> rewarded ad unit id; missing placements use `rewarded`. */
  rewardedByPlacement: Record<string, string>;
  /** True when at least one of the ids is a Google test id (used to flag `initializeForTesting`). */
  usesTestIds: boolean;
}

type Platform = Exclude<NativePlatform, 'web'>;

/** Environment variable lookup that tolerates missing `import.meta.env` (plain node). */
function env(name: string): string {
  const e = (import.meta as { env?: Record<string, unknown> }).env;
  const v = e?.[name];
  return typeof v === 'string' ? v.trim() : '';
}

/** Empty strings and untouched `REPLACE_WITH_…` placeholders count as "not configured". */
function configured(value: unknown): string {
  if (typeof value !== 'string') return '';
  const v = value.trim();
  return v === '' || v.startsWith('REPLACE_WITH') ? '' : v;
}

/** RevenueCat public API key for the platform, or `''` when not configured. */
export function revenueCatApiKey(platform: Platform): string {
  const fromEnv = env(platform === 'ios' ? 'VITE_RC_IOS_KEY' : 'VITE_RC_ANDROID_KEY');
  return configured(fromEnv) || configured(towerClashPluginConfig.revenueCat[platform]);
}

/** AdMob ad unit ids for the platform, falling back to Google's test units per id. */
export function adMobUnits(platform: Platform): AdMobUnits {
  const cfg = towerClashPluginConfig.adMob[platform];
  const prefix = platform === 'ios' ? 'VITE_ADMOB_IOS_' : 'VITE_ADMOB_ANDROID_';
  const test = ADMOB_TEST_UNITS[platform];
  const interstitial = configured(env(`${prefix}INTERSTITIAL`)) || configured(cfg.interstitial) || test.interstitial;
  const rewarded = configured(env(`${prefix}REWARDED`)) || configured(cfg.rewarded) || test.rewarded;
  const rewardedByPlacement: Record<string, string> = {};
  for (const [placement, unit] of Object.entries(cfg.rewardedByPlacement ?? {})) {
    const id = configured(unit);
    if (id) rewardedByPlacement[placement] = id;
  }
  return {
    interstitial,
    rewarded,
    rewardedByPlacement,
    usesTestIds: interstitial === test.interstitial || rewarded === test.rewarded,
  };
}
