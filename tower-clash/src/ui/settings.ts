/**
 * Settings screen (M3-3 + I18N): music and effects (AUD-F6), colour-blind palette, reduced motion (auto/on/off
 * override), the "How to play" card (FE-3), UI language, the team-colour set (FE-14) and a two-step
 * reset of the progress; the About card shows the version, the store support id (COPY) and the ads
 * SDK's privacy options (native).
 * Every change persists immediately; BACK returns to the screen that opened it (title, or the
 * paused play screen). Loaded lazily with its drawing (PERF-1, src/ui/lazyScreens.ts).
 */
import type { View } from '../render/view';
import { bleed, hudAnchors } from '../render/view';
import type { MenuBands, SettingsAboutLayout } from '../render/menuLayout';
import { SETTINGS, SETTINGS_BANDS, bandToScreen, screenToBand, settingsAboutLayout } from '../render/menuLayout';
import type { Rect } from '../render/widgets';
import { hitRect, setTextScale } from '../render/widgets';
import { segmentAt } from '../render/menuWidgets';
import { LANGUAGE_SEGMENTS, MOTION_SEGMENTS, TEXT_SIZE_SEGMENTS, TONE_SEGMENTS, drawSettings } from '../render/menusSettings';
import { loadToneSets, urlToneOverride } from '../render/palette';
import type { PointerPoint } from '../input/pointer';
import { dragThreshold } from '../input/pointer';
import { resetProgress, writeSave } from './save';
import { applyMotionPref } from './motion';
import { effectsOn, musicOn, playSfx, setMusicOn, setMuted } from '../audio/index';
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

/** AUD-Q8: taps on the About card's version row, within this many ms, that switch the frame-time overlay (TF-13). */
export const VERSION_TAPS = 5;
export const VERSION_TAP_WINDOW_MS = 2000;

/** AUD-Q8: the About card's first row (name · version, and the line under them): the overlay's hidden switch. Not a button: no press look. */
export function versionRowOf(about: SettingsAboutLayout): Rect {
  return { x: about.card.x, y: about.card.y, w: about.card.w, h: about.versionY + SETTINGS.aboutRowH / 2 - about.card.y };
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
  private versionRect: Rect = versionRowOf(this.about);
  /** AUD-Q8: times (performance.now) of the recent taps on the version row. */
  private versionTaps: number[] = [];
  private privacyPending = false;
  /**
   * AUD-U2: the card and the About block scroll when they are taller than the screen (the About
   * block with a support id and privacy options on a 9:16 screen; the header stays). Layout px.
   */
  private scroll = 0;
  private held = false;
  private dragging = false;
  private downY = 0;
  private scrollAtDown = 0;

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
    this.versionRect = versionRowOf(this.about);
  }

  /** AUD-Q8: the version row (layout px; e2e). */
  get versionRow(): Rect {
    return this.versionRect;
  }

  /**
   * AUD-Q8: a tap on the version row; the VERSION_TAPS-th within VERSION_TAP_WINDOW_MS switches the
   * frame-time overlay (persisted in `settings.perfOverlay`, so TF-13 needs no URL) and says so.
   */
  private versionTap(): void {
    const now = performance.now();
    this.versionTaps = this.versionTaps.filter((at) => now - at < VERSION_TAP_WINDOW_MS);
    this.versionTaps.push(now);
    if (this.versionTaps.length < VERSION_TAPS) return;
    this.versionTaps = [];
    const save = this.app.save;
    const on = !(this.app.perfOverlayOn ?? save.settings.perfOverlay === true);
    if (on) save.settings.perfOverlay = true;
    else delete save.settings.perfOverlay;
    writeSave(save);
    this.app.setPerfOverlay?.(on);
    playSfx('button');
    this.toast.show(t(on ? 'settings.perfOn' : 'settings.perfOff'), 'ok', this.nowMs);
  }

  /** How far the content may scroll: its foot (the About block + 24) past the screen's bottom edge. */
  maxScroll(): number {
    const view = this.app.view;
    const foot = this.about.card.y + this.about.card.h + 24;
    return Math.max(0, Math.ceil(foot + hudAnchors(view).top - bleed(view).bottom));
  }

  /** The content's scroll (e2e / tests). */
  get scrollY(): number {
    return this.scroll;
  }

  setScroll(y: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll(), y));
  }

  /** The screen's bands: the body follows the header and its scroll. */
  private bands(): MenuBands {
    return { ...SETTINGS_BANDS, content: (a) => a.top - this.scroll };
  }

  draw(view: View, nowMs: number): void {
    this.nowMs = nowMs;
    this.setScroll(this.scroll); // the About block / the screen may have changed size: re-clamp
    const s = this.app.save.settings;
    const total = Object.values(this.app.save.stars).reduce((a, b) => a + b, 0);
    drawSettings(view, this.app.palette(), {
      soundOn: effectsOn(),
      musicOn: musicOn(),
      colorBlind: s.colorBlind,
      reducedMotion: s.reducedMotion,
      language: currentLanguage(),
      textScale: s.textScale ?? 1,
      scroll: this.scroll,
      tones: s.tones ?? 'classic',
      toneOverride: urlToneOverride(),
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
    const list = [SETTINGS.back, SETTINGS.music, SETTINGS.sound, SETTINGS.colorBlind, SETTINGS.motion, SETTINGS.howto, SETTINGS.language, SETTINGS.tones, SETTINGS.textSize, SETTINGS.reset];
    if (this.about.copy) list.push(this.about.copy);
    if (this.about.privacy) list.push(this.about.privacy);
    list.push(this.versionRect); // last: COPY's tap area reaches up into the row and wins there
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

  /**
   * FE-11: screen logical point → layout point. The header and both cards follow the header up to the
   * top safe edge of a tall screen; the reset confirm card is centred on the screen (identity).
   */
  toLayout(x: number, y: number): { x: number; y: number } {
    return this.confirming ? { x, y } : screenToBand(hudAnchors(this.app.view), this.bands(), x, y);
  }

  /** Where layout point (x, y) is drawn (e2e: `layoutToClient`). */
  fromLayout(x: number, y: number): { x: number; y: number } {
    return this.confirming ? { x, y } : bandToScreen(hudAnchors(this.app.view), this.bands(), x, y);
  }

  down(p: PointerPoint): void {
    this.held = true;
    this.dragging = false;
    this.downY = p.y;
    this.scrollAtDown = this.scroll;
    const l = this.toLayout(p.x, p.y);
    this.pressed = this.rects().find((r) => hitRect(this.app.view, r, l.x, l.y)) ?? null;
  }

  move(p: PointerPoint): void {
    // a drag past the slop scrolls the body (only when it is taller than the screen) and drops the press
    if (this.held && !this.confirming && this.maxScroll() > 0 && Math.abs(p.y - this.downY) > dragThreshold(this.app.view.scale)) {
      this.dragging = true;
      this.pressed = null;
    }
    if (this.dragging) {
      this.setScroll(this.scrollAtDown - (p.y - this.downY));
      return;
    }
    const l = this.toLayout(p.x, p.y);
    if (this.pressed && !hitRect(this.app.view, this.pressed, l.x, l.y)) this.pressed = null;
  }

  wheel(dy: number): void {
    if (!this.confirming) this.setScroll(this.scroll + dy);
  }

  up(pointer: PointerPoint): void {
    const hit = this.pressed;
    this.pressed = null;
    const wasDrag = this.dragging;
    this.held = false;
    this.dragging = false;
    if (wasDrag) return;
    const p = { ...pointer, ...this.toLayout(pointer.x, pointer.y) };
    if (!hit || !hitRect(this.app.view, hit, p.x, p.y)) return;
    p.y = hit.y + 1; // a segmented control picks by x: its tap area reaches above / below the drawn row (AUD-U1)
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
    // AUD-F6: Music and Effects persist through the audio facade (both flags; the click is on the UI bus, so Effects off is silent)
    if (hit === SETTINGS.music) {
      setMusicOn(!musicOn());
      playSfx('button');
      return;
    }
    if (hit === SETTINGS.sound) {
      setMuted(effectsOn());
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
    if (hit === this.versionRect) {
      this.versionTap();
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
    } else if (hit === SETTINGS.tones) {
      // FE-14: persist the set; a non-classic one fetches its lazy chunk now (the shipped palette shows
      // until it lands, then the app's palette() answers the set and empties the sprite cache)
      const seg = TONE_SEGMENTS[segmentAt(SETTINGS.tones, TONE_SEGMENTS.length, p.x, p.y)];
      if (seg) {
        save.settings.tones = seg.value;
        if (seg.value !== 'classic') void loadToneSets().catch(() => undefined);
      }
    } else if (hit === SETTINGS.textSize) {
      // AUD-U2: 100 / 125 / 150 %, applied at once (every font goes through render/widgets.ts `font()`)
      const seg = TEXT_SIZE_SEGMENTS[segmentAt(SETTINGS.textSize, TEXT_SIZE_SEGMENTS.length, p.x, p.y)];
      if (seg) {
        save.settings.textScale = seg;
        setTextScale(seg);
      }
    } else if (hit === SETTINGS.reset) {
      this.confirming = true;
      return;
    }
    writeSave(save);
  }

  cancel(): void {
    this.pressed = null;
    this.held = false;
    this.dragging = false;
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.confirming) this.confirming = false;
      else this.back();
    }
  }
}
