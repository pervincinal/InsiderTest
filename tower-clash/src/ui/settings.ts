/**
 * Settings screen (M3-3 + I18N): sound, colour-blind palette, reduced motion (auto/on/off
 * override), the "How to play" card (FE-3), UI language and a two-step reset of the progress; the About card
 * shows the version, the store support id (COPY) and the ads SDK's privacy options (native).
 * Every change persists immediately; BACK returns to the screen that opened it (title, or the
 * paused play screen). Loaded lazily with its drawing (PERF-1, src/ui/lazyScreens.ts).
 */
import type { View } from '../render/view';
import { SETTINGS } from '../render/layout';
import type { SettingsAboutLayout } from '../render/menuLayout';
import { settingsAboutLayout } from '../render/menuLayout';
import type { Rect } from '../render/widgets';
import { inRect } from '../render/widgets';
import { segmentAt } from '../render/menuWidgets';
import { LANGUAGE_SEGMENTS, MOTION_SEGMENTS, drawSettings } from '../render/menusSettings';
import type { PointerPoint } from '../input/pointer';
import { resetProgress, writeSave } from './save';
import { applyMotionPref } from './motion';
import { isMuted, playSfx, toggleMuted } from '../audio/index';
import type { AdsProvider } from '../economy/ads';
import { getAds } from '../economy/ads';
import type { StoreProvider } from '../economy/store';
import { getStore } from '../economy/store';
import type { App, Screen } from './screens';
import { Toast, appVersion } from './screens';
import { currentLanguage, t } from './i18n';

/* Optional provider extensions the Mobile Engineer is adding (feature-checked so the build stays green either way). */
interface PrivacyOptionsExt {
  privacyOptionsRequired?: () => Promise<boolean> | boolean;
  showPrivacyOptions?: () => Promise<void> | void;
}
interface SupportIdExt {
  getSupportId?: () => Promise<string | null> | string | null;
}

export class SettingsScreen implements Screen {
  readonly name = 'settings' as const;
  private pressed: Rect | null = null;
  private confirming = false;
  private nowMs = 0;
  readonly toast = new Toast();
  /** About block: support id from the store and the ads SDK's privacy-options requirement (native only). */
  private supportId: string | null = null;
  private privacyRequired = false;
  private about: SettingsAboutLayout = settingsAboutLayout(false, false);
  private privacyPending = false;

  constructor(
    private readonly app: App,
    private readonly back: () => void,
  ) {
    void this.probeNative();
  }

  get isConfirming(): boolean {
    return this.confirming;
  }

  /** What the About block currently shows (e2e). */
  get aboutInfo(): { version: string; supportId: string | null; privacyOptions: boolean } {
    return { version: appVersion(), supportId: this.supportId, privacyOptions: this.privacyRequired };
  }

  /**
   * Ask the providers (feature-checked: the web providers have neither method) — or take the
   * app's override. Never throws; a failing provider just leaves the row hidden.
   */
  private async probeNative(): Promise<void> {
    const over = this.app.nativeInfo;
    const ads = getAds() as AdsProvider & PrivacyOptionsExt;
    const store = getStore() as StoreProvider & SupportIdExt;
    let privacy = false;
    let id: string | null = null;
    try {
      if (over?.privacyOptionsRequired !== undefined) privacy = over.privacyOptionsRequired;
      else if (typeof ads.privacyOptionsRequired === 'function') privacy = (await ads.privacyOptionsRequired()) === true;
    } catch {
      privacy = false;
    }
    try {
      if (over?.supportId !== undefined) id = over.supportId;
      else if (typeof store.getSupportId === 'function') id = await store.getSupportId();
    } catch {
      id = null;
    }
    this.supportId = typeof id === 'string' && id.length > 0 ? id : null;
    this.privacyRequired = privacy;
    this.about = settingsAboutLayout(this.supportId !== null, this.privacyRequired);
  }

  draw(view: View, nowMs: number): void {
    this.nowMs = nowMs;
    const s = this.app.save.settings;
    const total = Object.values(this.app.save.stars).reduce((a, b) => a + b, 0);
    drawSettings(view, this.app.palette(), {
      soundOn: !isMuted(),
      colorBlind: s.colorBlind,
      reducedMotion: s.reducedMotion,
      language: currentLanguage(),
      confirming: this.confirming,
      totalStars: total,
      coins: this.app.save.gold,
      about: this.about,
      version: appVersion(),
      supportId: this.supportId,
      nowMs,
      pressed: this.pressed,
      toast: this.toast.opts(nowMs),
    });
  }

  private rects(): Rect[] {
    if (this.confirming) return [SETTINGS.confirm.yes, SETTINGS.confirm.no];
    const list = [SETTINGS.back, SETTINGS.sound, SETTINGS.colorBlind, SETTINGS.motion, SETTINGS.howto, SETTINGS.language, SETTINGS.reset];
    if (this.about.copy) list.push(this.about.copy);
    if (this.about.privacy) list.push(this.about.privacy);
    return list;
  }

  /** Copy the support id to the clipboard (toast either way). */
  copySupportId(): void {
    const id = this.supportId;
    if (!id) return;
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip || typeof clip.writeText !== 'function') {
      this.toast.show(t('settings.copyUnavailable'), 'error', this.nowMs);
      return;
    }
    clip.writeText(id).then(
      () => this.toast.show(t('settings.copied'), 'ok', this.nowMs),
      () => this.toast.show(t('settings.copyFailed'), 'error', this.nowMs),
    );
  }

  /** Open the ads SDK's privacy options form (UMP); no-op when the provider has none. */
  openPrivacyOptions(): void {
    if (this.privacyPending) return;
    const ads = getAds() as AdsProvider & PrivacyOptionsExt;
    if (typeof ads.showPrivacyOptions !== 'function') {
      this.toast.show(t('settings.privacyUnavailable'), 'error', this.nowMs);
      return;
    }
    this.privacyPending = true;
    Promise.resolve()
      .then(() => ads.showPrivacyOptions?.())
      .catch(() => this.toast.show(t('settings.privacyFailed'), 'error', this.nowMs))
      .finally(() => {
        this.privacyPending = false;
      });
  }

  down(p: PointerPoint): void {
    this.pressed = this.rects().find((r) => inRect(r, p.x, p.y)) ?? null;
  }

  move(p: PointerPoint): void {
    if (this.pressed && !inRect(this.pressed, p.x, p.y)) this.pressed = null;
  }

  up(p: PointerPoint): void {
    const hit = this.pressed;
    this.pressed = null;
    if (!hit || !inRect(hit, p.x, p.y)) return;
    const save = this.app.save;
    if (this.confirming) {
      if (hit === SETTINGS.confirm.yes) resetProgress(save);
      this.confirming = false;
      playSfx('button');
      return;
    }
    if (hit === SETTINGS.back) {
      this.back();
      return;
    }
    if (hit === SETTINGS.sound) {
      toggleMuted();
      playSfx('button');
      return;
    }
    if (hit === SETTINGS.howto) {
      playSfx('button');
      this.app.openHowTo(this);
      return;
    }
    if (hit === this.about.copy) {
      playSfx('button');
      this.copySupportId();
      return;
    }
    if (hit === this.about.privacy) {
      playSfx('button');
      this.openPrivacyOptions();
      return;
    }
    playSfx('button');
    if (hit === SETTINGS.colorBlind) {
      save.settings.colorBlind = !save.settings.colorBlind;
    } else if (hit === SETTINGS.motion) {
      const seg = MOTION_SEGMENTS[segmentAt(SETTINGS.motion, MOTION_SEGMENTS.length, p.x, p.y)];
      if (seg) {
        save.settings.reducedMotion = seg.value;
        applyMotionPref(seg.value);
      }
    } else if (hit === SETTINGS.language) {
      const seg = LANGUAGE_SEGMENTS[segmentAt(SETTINGS.language, LANGUAGE_SEGMENTS.length, p.x, p.y)];
      if (seg) this.app.setLanguage(seg.code); // persists through the app
      return;
    } else if (hit === SETTINGS.reset) {
      this.confirming = true;
      return;
    }
    writeSave(save);
  }

  cancel(): void {
    this.pressed = null;
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.confirming) this.confirming = false;
      else this.back();
    }
  }
}
