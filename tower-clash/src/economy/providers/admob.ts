/**
 * AdMob ads provider for the native shells (`@capacitor-community/admob`, exact pin in
 * package.json). Loaded with a dynamic `import()` so the web bundle never contains the plugin.
 *
 * Flow (per the plugin's docs):
 *   init:  AdMob.initialize() -> UMP consent (requestConsentInfo / showConsentForm) -> iOS ATT
 *          prompt -> preload one interstitial and one rewarded ad.
 *   show:  show the preloaded ad, wait for its Dismissed / FailedToShow event, preload the next.
 *   reward: `{ rewarded: true }` only when `RewardAdPluginEvents.Rewarded` fired for this show.
 *
 * Ad unit ids come from `config.ts` (Google's test units unless real ids are configured); the
 * AdMob APP ids live in AndroidManifest.xml / Info.plist (see docs/MOBILE.md §8).
 */
import { getPlatform } from '../../native/index';
import type { AdsProvider, RewardedResult } from '../ads';
import { adMobUnits, type AdMobUnits } from './config';

type AdMobModule = typeof import('@capacitor-community/admob');
type ListenerHandle = { remove: () => Promise<void> };

/** How long we wait for an ad to load before giving up on a show request. */
const LOAD_TIMEOUT_MS = 12_000;
/** Safety net: an ad that never reports Dismissed must not hang the game forever. */
const SHOW_TIMEOUT_MS = 120_000;

let admob: AdMobModule | null = null;
let units: AdMobUnits | null = null;
let canRequestAds = false;
let initPromise: Promise<void> | null = null;
let showing = false;

let interstitialReady = false;
let interstitialLoading: Promise<boolean> | null = null;
let rewardedReadyUnit: string | null = null;
let rewardedLoading: Promise<boolean> | null = null;

function warn(what: string, err: unknown): void {
  console.warn(`[ads/admob] ${what} failed:`, err);
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

async function removeAll(handles: Array<Promise<ListenerHandle>>): Promise<void> {
  for (const h of handles) {
    try {
      await (await h).remove();
    } catch {
      /* listener already gone */
    }
  }
}

async function runConsentFlow(mod: AdMobModule): Promise<boolean> {
  const { AdmobConsentStatus } = mod;
  let info = await mod.AdMob.requestConsentInfo();
  if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
    try {
      info = await mod.AdMob.showConsentForm();
    } catch (err) {
      warn('showConsentForm', err);
    }
  }
  // iOS 14+: ask for tracking after the UMP form (Apple requires the prompt for personalized
  // ads; the answer does not gate non-personalized ads). No-op on Android.
  try {
    const tracking = await mod.AdMob.trackingAuthorizationStatus();
    if (tracking.status === 'notDetermined') await mod.AdMob.requestTrackingAuthorization();
  } catch (err) {
    warn('requestTrackingAuthorization', err);
  }
  return info.canRequestAds;
}

function preloadInterstitial(): Promise<boolean> {
  if (!admob || !units || !canRequestAds) return Promise.resolve(false);
  if (interstitialReady) return Promise.resolve(true);
  if (interstitialLoading) return interstitialLoading;
  const mod = admob;
  const u = units;
  interstitialLoading = withTimeout(
    mod.AdMob.prepareInterstitial({ adId: u.interstitial, isTesting: u.usesTestIds, immersiveMode: true }).then(
      () => {
        interstitialReady = true;
        return true;
      },
      (err: unknown) => {
        warn('prepareInterstitial', err);
        return false;
      },
    ),
    LOAD_TIMEOUT_MS,
    false,
  ).finally(() => {
    interstitialLoading = null;
  });
  return interstitialLoading;
}

function preloadRewarded(unit: string): Promise<boolean> {
  if (!admob || !units || !canRequestAds) return Promise.resolve(false);
  if (rewardedReadyUnit === unit) return Promise.resolve(true);
  if (rewardedLoading) return rewardedLoading;
  const mod = admob;
  const u = units;
  rewardedLoading = withTimeout(
    mod.AdMob.prepareRewardVideoAd({ adId: unit, isTesting: u.usesTestIds, immersiveMode: true }).then(
      () => {
        rewardedReadyUnit = unit;
        return true;
      },
      (err: unknown) => {
        warn('prepareRewardVideoAd', err);
        return false;
      },
    ),
    LOAD_TIMEOUT_MS,
    false,
  ).finally(() => {
    rewardedLoading = null;
  });
  return rewardedLoading;
}

async function doInit(): Promise<void> {
  const platform = getPlatform();
  if (platform === 'web') return;
  try {
    const mod = await import('@capacitor-community/admob');
    units = adMobUnits(platform);
    await mod.AdMob.initialize({ initializeForTesting: units.usesTestIds });
    admob = mod;
    try {
      canRequestAds = await runConsentFlow(mod);
    } catch (err) {
      warn('consent flow', err);
      // UMP unavailable (e.g. no consent message configured yet): AdMob still serves
      // non-personalized / test ads, so keep going.
      canRequestAds = true;
    }
    if (units.usesTestIds) console.info('[ads/admob] using Google TEST ad units');
    void preloadInterstitial();
    void preloadRewarded(units.rewarded);
  } catch (err) {
    warn('initialize', err);
    admob = null;
    canRequestAds = false;
  }
}

export const adMobAds: AdsProvider = {
  init(): Promise<void> {
    if (!initPromise) initPromise = doInit();
    return initPromise;
  },

  isAvailable(): boolean {
    return admob !== null && canRequestAds;
  },

  async showInterstitial(): Promise<boolean> {
    if (!this.isAvailable() || !admob || showing) return false;
    const mod = admob;
    if (!(await preloadInterstitial())) return false;
    showing = true;
    const { InterstitialAdPluginEvents: Ev } = mod;
    let shown = false;
    let finish: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const handles: Array<Promise<ListenerHandle>> = [
      mod.AdMob.addListener(Ev.Showed, () => {
        shown = true;
      }),
      mod.AdMob.addListener(Ev.Dismissed, () => finish()),
      mod.AdMob.addListener(Ev.FailedToShow, (err) => {
        warn('interstitial show', err);
        finish();
      }),
    ];
    try {
      interstitialReady = false;
      await mod.AdMob.showInterstitial();
      await withTimeout(done, SHOW_TIMEOUT_MS, undefined);
    } catch (err) {
      warn('showInterstitial', err);
    } finally {
      await removeAll(handles);
      showing = false;
      void preloadInterstitial();
    }
    return shown;
  },

  async showRewarded(placementId: string): Promise<RewardedResult> {
    if (!this.isAvailable() || !admob || !units || showing) return { rewarded: false };
    const mod = admob;
    const unit = units.rewardedByPlacement[placementId] ?? units.rewarded;
    if (rewardedReadyUnit !== null && rewardedReadyUnit !== unit) rewardedReadyUnit = null;
    if (!(await preloadRewarded(unit))) return { rewarded: false };
    showing = true;
    const { RewardAdPluginEvents: Ev } = mod;
    let rewarded = false;
    let finish: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const handles: Array<Promise<ListenerHandle>> = [
      mod.AdMob.addListener(Ev.Rewarded, () => {
        rewarded = true;
      }),
      mod.AdMob.addListener(Ev.Dismissed, () => finish()),
      mod.AdMob.addListener(Ev.FailedToShow, (err) => {
        warn(`rewarded show (${placementId})`, err);
        finish();
      }),
    ];
    try {
      rewardedReadyUnit = null;
      await mod.AdMob.showRewardVideoAd();
      await withTimeout(done, SHOW_TIMEOUT_MS, undefined);
    } catch (err) {
      warn(`showRewardVideoAd(${placementId})`, err);
    } finally {
      await removeAll(handles);
      showing = false;
      void preloadRewarded(units.rewarded);
    }
    return { rewarded };
  },
};

/** Test hook. */
export function resetAdMobForTests(): void {
  admob = null;
  units = null;
  canRequestAds = false;
  initPromise = null;
  showing = false;
  interstitialReady = false;
  interstitialLoading = null;
  rewardedReadyUnit = null;
  rewardedLoading = null;
}
