/**
 * AdMob ads provider for the native shells (`@capacitor-community/admob`, exact pin in
 * package.json). Loaded with a dynamic `import()` so the web bundle never contains the plugin.
 *
 * Flow (per the plugin's docs):
 *   init:  AdMob.initialize() -> UMP consent (requestConsentInfo / showConsentForm, EEA/UK only)
 *          -> preload one interstitial and one rewarded ad.
 *   show:  show the preloaded ad, wait for its Dismissed / FailedToShow event, preload the next.
 *   reward: `{ rewarded: true }` only when `RewardAdPluginEvents.Rewarded` fired for this show.
 *   privacy options: `privacyOptionsRequired()` mirrors UMP's `privacyOptionsRequirementStatus`;
 *          `showPrivacyOptions()` reopens the consent form (`showPrivacyOptionsForm`) and
 *          re-reads the consent state afterwards.
 *
 * No tracking (ECON-3, STORE_LISTING.md §6.4 option A): the iOS App Tracking Transparency prompt
 * is never shown and `NSUserTrackingUsageDescription` is absent from Info.plist, so the IDFA is
 * never available to the SDK. Every ad request on iOS carries `npa: 1` (non-personalised ads).
 * On Android personalisation is decided by the UMP consent answer alone (the SDK reads the TCF
 * string itself); outside the EEA/UK Google's defaults apply. Do not add
 * `requestTrackingAuthorization` back without changing the App Privacy answers in
 * docs/publishing/STORE_LISTING.md §6.4 and the privacy policy.
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

type PrivacyOptionsStatus = 'REQUIRED' | 'NOT_REQUIRED' | 'UNKNOWN';

let admob: AdMobModule | null = null;
let units: AdMobUnits | null = null;
let canRequestAds = false;
/** True => every ad request asks for non-personalised ads (`npa: 1`). Always true on iOS. */
let nonPersonalised = false;
let privacyOptionsStatus: PrivacyOptionsStatus = 'UNKNOWN';
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

type ConsentInfo = import('@capacitor-community/admob').AdmobConsentInfo;

function recordConsent(info: ConsentInfo): void {
  canRequestAds = info.canRequestAds;
  const s = info.privacyOptionsRequirementStatus as string | undefined;
  privacyOptionsStatus = s === 'REQUIRED' || s === 'NOT_REQUIRED' ? s : 'UNKNOWN';
}

/**
 * Google UMP consent (GDPR message configured in the AdMob console). Shows the form only where
 * it is required (EEA/UK) and not yet answered. No iOS tracking prompt — see the file header.
 */
async function runConsentFlow(mod: AdMobModule): Promise<void> {
  const { AdmobConsentStatus } = mod;
  let info = await mod.AdMob.requestConsentInfo();
  if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
    try {
      info = await mod.AdMob.showConsentForm();
    } catch (err) {
      warn('showConsentForm', err);
    }
  }
  recordConsent(info);
}

function preloadInterstitial(): Promise<boolean> {
  if (!admob || !units || !canRequestAds) return Promise.resolve(false);
  if (interstitialReady) return Promise.resolve(true);
  if (interstitialLoading) return interstitialLoading;
  const mod = admob;
  const u = units;
  interstitialLoading = withTimeout(
    mod.AdMob.prepareInterstitial({
      adId: u.interstitial,
      isTesting: u.usesTestIds,
      npa: nonPersonalised,
      immersiveMode: true,
    }).then(
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
    mod.AdMob.prepareRewardVideoAd({ adId: unit, isTesting: u.usesTestIds, npa: nonPersonalised, immersiveMode: true }).then(
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
    // iOS: no ATT prompt => the IDFA is never available, so ask for non-personalised ads
    // explicitly (Apple's "no tracking" App Privacy answer, STORE_LISTING.md §6.4 option A).
    nonPersonalised = platform === 'ios';
    // "G"-rated creatives only, not child-directed (docs/ECONOMY.md §7, privacy policy B.6).
    await mod.AdMob.initialize({
      initializeForTesting: units.usesTestIds,
      maxAdContentRating: mod.MaxAdContentRating.General,
      tagForChildDirectedTreatment: false,
    });
    admob = mod;
    try {
      await runConsentFlow(mod);
    } catch (err) {
      warn('consent flow', err);
      // UMP unavailable (e.g. no consent message configured yet): AdMob still serves
      // non-personalized / test ads, so keep going.
      canRequestAds = true;
      privacyOptionsStatus = 'UNKNOWN';
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

  async privacyOptionsRequired(): Promise<boolean> {
    if (!admob) return false;
    if (privacyOptionsStatus === 'UNKNOWN') {
      // Consent info was not available at init (offline, no message configured): try once more
      // so the Settings entry appears as soon as UMP can answer.
      try {
        recordConsent(await admob.AdMob.requestConsentInfo());
      } catch (err) {
        warn('requestConsentInfo', err);
      }
    }
    return privacyOptionsStatus === 'REQUIRED';
  },

  async showPrivacyOptions(): Promise<void> {
    if (!admob || showing) return;
    if (!(await this.privacyOptionsRequired())) return;
    const mod = admob;
    try {
      await mod.AdMob.showPrivacyOptionsForm();
    } catch (err) {
      warn('showPrivacyOptionsForm', err);
      return;
    }
    // The answer may have changed what we are allowed to request: refresh `canRequestAds` and
    // drop the preloaded ads so the next load honours the new consent state.
    try {
      recordConsent(await mod.AdMob.requestConsentInfo());
    } catch (err) {
      warn('requestConsentInfo', err);
    }
    interstitialReady = false;
    rewardedReadyUnit = null;
    if (canRequestAds && units) {
      void preloadInterstitial();
      void preloadRewarded(units.rewarded);
    }
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
  nonPersonalised = false;
  privacyOptionsStatus = 'UNKNOWN';
  initPromise = null;
  showing = false;
  interstitialReady = false;
  interstitialLoading = null;
  rewardedReadyUnit = null;
  rewardedLoading = null;
}
