/**
 * Settings screen (M3-3 + I18N): music and effects (AUD-F6), colour-blind palette, reduced motion (auto/on/off
 * override), the "How to play" card (FE-3), UI language, the team-colour set (FE-14), text size (AUD-U2),
 * Vibration (AUD-U20) and Screen shake (AUD-F18) and a two-step
 * reset of the progress; the About card shows the version, the store support id (COPY), the ads
 * SDK's privacy options (native) and the opt-in Diagnostics log (AUD-B6: switch, COPY LOG, CLEAR LOG).
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
import type { DiagAboutLayout } from '../render/menusSettings';
import { LANGUAGE_SEGMENTS, MOTION_SEGMENTS, SETTINGS_FEEL, TEXT_SIZE_SEGMENTS, TONE_SEGMENTS, drawSettings, withDiagnostics } from '../render/menusSettings';
import { prefersReducedMotion } from '../render/particles';
import { isNative } from '../native/index';
import { loadToneSets, urlToneOverride } from '../render/palette';
import type { PointerPoint } from '../input/pointer';
import { dragThreshold } from '../input/pointer';
import { resetProgress, writeSave } from './save';
import { clearDiag, currentHints, diagCount, diagRows, diagShare, resetDiag } from './diagnostics';
import { applyMotionPref } from './motion';
import { effectsOn, musicOn, playSfx, setMusicOn, setMuted } from '../audio/index';
import type { AdsProvider } from '../economy/ads';
import { getAds } from '../economy/ads';
import type { StoreProvider } from '../economy/store';
import { getStore } from '../economy/store';
import type { App, Screen } from './screens';
import type { FocusItem } from './focus';
import { onScreen, readingOrder, segmentRects } from './focus';
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

/**
 * REV-43: what a tappable rect of the screen does. A press is remembered by role, not by rect identity:
 * `probeNative()` resolves asynchronously and `relayout()` replaces the About card's rects with new
 * objects, so a press that straddles it would otherwise match nothing at `up()`.
 */
type HitKind = 'back' | 'music' | 'sound' | 'colorBlind' | 'motion' | 'howto' | 'language' | 'tones' | 'textSize' | 'haptics' | 'shake' | 'reset' | 'copy' | 'privacy' | 'diagToggle' | 'diagCopy' | 'diagClear' | 'version' | 'confirmYes' | 'confirmNo';

interface SettingsHit {
  kind: HitKind;
  rect: Rect;
}

export class SettingsScreen implements Screen {
  readonly name = 'settings' as const;
  private pressed: Rect | null = null;
  /** REV-43: the role of `pressed` (survives a relayout between down and up; `pressed` is re-pointed by `relayout()`). */
  private pressedKind: HitKind | null = null;
  private confirming = false;
  private nowMs = 0;
  readonly toast = new Toast();
  /** About block: support id from the store and the ads SDK's privacy-options requirement (native only). */
  private supportId: string | null = null;
  private privacyRequired = false;
  private about: DiagAboutLayout = withDiagnostics(settingsAboutLayout(false, false), false);
  private versionRect: Rect = versionRowOf(this.about);
  /** AUD-B6: rows in the diagnostics log (read when the screen opens, kept up to date by CLEAR / reset). */
  private diagRowCount = 0;
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
    this.diagRowCount = diagCount();
    this.relayout();
    void this.probeNative();
  }

  /** AUD-B6: the Diagnostics switch is on (`settings.diagnostics`, off by default). */
  get diagnosticsOn(): boolean {
    return this.app.save.settings.diagnostics === true;
  }

  /** The About card's rows: COPY LOG / CLEAR LOG only while the log is on or holds rows. */
  private relayout(): void {
    this.about = withDiagnostics(settingsAboutLayout(this.supportId !== null, this.privacyRequired), this.diagnosticsOn || this.diagRowCount > 0);
    this.versionRect = versionRowOf(this.about);
    if (this.pressedKind) this.pressed = this.rectOf(this.pressedKind); // the press look follows the rebuilt rect (REV-43)
  }

  /** AUD-B6: the Diagnostics block's rects (layout px; e2e), and the row count it shows. */
  get diagInfo(): { toggle: Rect; copy: Rect | null; clear: Rect | null; rows: number; on: boolean } {
    return { toggle: this.about.diagToggle, copy: this.about.diagCopy, clear: this.about.diagClear, rows: this.diagRowCount, on: this.diagnosticsOn };
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
    this.relayout();
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
      diag: { on: this.diagnosticsOn, rows: this.diagRowCount },
      haptics: s.haptics !== false,
      hapticsNative: isNative(),
      shake: s.shake !== false,
      shakeReduced: prefersReducedMotion(),
      nowMs,
      pressed: this.pressed,
      toast: this.toast.opts(nowMs),
    });
  }

  /** The tappable rects as laid out right now, each with its role (REV-43), in hit-test order. */
  private hits(): SettingsHit[] {
    if (this.confirming) {
      return [
        { kind: 'confirmYes', rect: SETTINGS.confirm.yes },
        { kind: 'confirmNo', rect: SETTINGS.confirm.no },
      ];
    }
    const list: SettingsHit[] = [
      { kind: 'back', rect: SETTINGS.back },
      { kind: 'music', rect: SETTINGS.music },
      { kind: 'sound', rect: SETTINGS.sound },
      { kind: 'colorBlind', rect: SETTINGS.colorBlind },
      { kind: 'motion', rect: SETTINGS.motion },
      { kind: 'howto', rect: SETTINGS.howto },
      { kind: 'language', rect: SETTINGS.language },
      { kind: 'tones', rect: SETTINGS.tones },
      { kind: 'textSize', rect: SETTINGS.textSize },
      { kind: 'haptics', rect: SETTINGS_FEEL.haptics },
      { kind: 'shake', rect: SETTINGS_FEEL.shake },
      { kind: 'reset', rect: SETTINGS.reset },
    ];
    if (this.about.copy) list.push({ kind: 'copy', rect: this.about.copy });
    if (this.about.privacy) list.push({ kind: 'privacy', rect: this.about.privacy });
    list.push({ kind: 'diagToggle', rect: this.about.diagToggle });
    if (this.about.diagCopy) list.push({ kind: 'diagCopy', rect: this.about.diagCopy });
    if (this.about.diagClear) list.push({ kind: 'diagClear', rect: this.about.diagClear });
    list.push({ kind: 'version', rect: this.versionRect }); // last: COPY's tap area reaches up into the row and wins there
    return list;
  }

  /** Where the control with role `kind` is laid out now; null when the card no longer shows it. */
  private rectOf(kind: HitKind): Rect | null {
    return this.hits().find((h) => h.kind === kind)?.rect ?? null;
  }

  /**
   * AUD-U27: the keyboard focus items where they are drawn — BACK, then the body's controls in reading
   * order (one per segment of a picker), the About card's buttons; not the version row (a hidden switch).
   * The reset confirm card: CANCEL first, then RESET.
   */
  focusRects(): FocusItem[] {
    if (this.confirming) return [SETTINGS.confirm.no, SETTINGS.confirm.yes].map((r) => onScreen(this, r));
    const a = hudAnchors(this.app.view);
    const band = [SETTINGS.headerH + a.top, bleed(this.app.view).bottom] as const;
    const segs: [Rect, number][] = [
      [SETTINGS.motion, MOTION_SEGMENTS.length],
      [SETTINGS.language, LANGUAGE_SEGMENTS.length],
      [SETTINGS.tones, TONE_SEGMENTS.length],
      [SETTINGS.textSize, TEXT_SIZE_SEGMENTS.length],
    ];
    const body = this.hits()
      .filter((h) => h.kind !== 'back' && h.kind !== 'version')
      .map((h) => h.rect);
    const split = body.flatMap((r) => {
      const seg = segs.find(([s]) => s === r);
      return seg ? segmentRects(r, seg[1]) : [r];
    });
    return [onScreen(this, SETTINGS.back), ...readingOrder(split).map((r) => onScreen(this, r, band))];
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

  /**
   * AUD-B6 COPY LOG: the hints line, the column line and one CSV row per event to the clipboard (the
   * support id's mechanism; a toast either way). Nothing leaves the phone unless the tester pastes it.
   */
  copyDiagLog(): void {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip || typeof clip.writeText !== 'function') {
      this.toast.show(t('settings.copyUnavailable'), 'error', this.nowMs);
      return;
    }
    const share = diagShare(diagRows(), currentHints(this.app.save, currentLanguage())); // DIAG-2 / QA-39-2: ≤ 400 kB, newest replays first
    clip.writeText(share.text).then(
      () => this.toast.show(t(share.omitted > 0 ? 'settings.logCopiedTrimmed' : 'settings.logCopied'), 'ok', this.nowMs),
      () => this.toast.show(t('settings.logCopyFailed'), 'error', this.nowMs),
    );
  }

  /**
   * AUD-B6 CLEAR LOG: no rows and (QA-42-1) no attempt counters; the actions hide while the switch is off.
   * REV-3: the count is re-read from storage, and a refused write says so instead of "cleared".
   */
  clearDiagLog(): void {
    const ok = clearDiag();
    this.diagRowCount = diagCount();
    this.relayout();
    if (ok) this.toast.show(t('settings.logCleared'), 'ok', this.nowMs);
    else this.toast.show(t('settings.logClearFailed'), 'error', this.nowMs);
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
    const hit = this.hits().find((h) => hitRect(this.app.view, h.rect, l.x, l.y)) ?? null;
    this.pressed = hit?.rect ?? null;
    this.pressedKind = hit?.kind ?? null;
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
    if (this.pressed && !hitRect(this.app.view, this.pressed, l.x, l.y)) {
      this.pressed = null;
      this.pressedKind = null;
    }
  }

  wheel(dy: number): void {
    if (!this.confirming) this.setScroll(this.scroll + dy);
  }

  up(pointer: PointerPoint): void {
    const kind = this.pressedKind;
    this.pressed = null;
    this.pressedKind = null;
    const wasDrag = this.dragging;
    this.held = false;
    this.dragging = false;
    if (wasDrag || !kind) return;
    const p = { ...pointer, ...this.toLayout(pointer.x, pointer.y) };
    // REV-43: the pressed role's rect as laid out now — `probeNative()` may have rebuilt the About card since down
    const hit = this.rectOf(kind);
    if (!hit || !hitRect(this.app.view, hit, p.x, p.y)) return;
    p.y = hit.y + 1; // a segmented control picks by x: its tap area reaches above / below the drawn row (AUD-U1)
    const save = this.app.save;
    if (this.confirming) {
      if (kind === 'confirmYes') {
        resetProgress(save);
        resetDiag(); // AUD-B6 / TF-28: the diagnostics log and its attempt counters go with the progress
        this.diagRowCount = 0;
        this.relayout();
      }
      this.confirming = false;
      playSfx('button');
      return;
    }
    if (kind === 'back') {
      this.back();
      return;
    }
    // AUD-F6: Music and Effects persist through the audio facade (both flags; the click is on the UI bus, so Effects off is silent)
    if (kind === 'music') {
      setMusicOn(!musicOn());
      playSfx('button');
      return;
    }
    if (kind === 'sound') {
      setMuted(effectsOn());
      playSfx('button');
      return;
    }
    if (kind === 'howto') {
      playSfx('button');
      this.app.openHowTo(this);
      return;
    }
    if (kind === 'copy') {
      playSfx('button');
      this.copySupportId();
      return;
    }
    if (kind === 'privacy') {
      playSfx('button');
      this.openPrivacyOptions();
      return;
    }
    if (kind === 'diagToggle') {
      // AUD-B6: only `true` is stored (absent = off), as `perfOverlay`
      if (this.diagnosticsOn) delete save.settings.diagnostics;
      else save.settings.diagnostics = true;
      writeSave(save);
      this.relayout();
      playSfx('button');
      return;
    }
    if (kind === 'diagCopy') {
      playSfx('button');
      this.copyDiagLog();
      return;
    }
    if (kind === 'diagClear') {
      playSfx('button');
      this.clearDiagLog();
      return;
    }
    if (kind === 'version') {
      this.versionTap();
      return;
    }
    playSfx('button');
    if (kind === 'colorBlind') {
      save.settings.colorBlind = !save.settings.colorBlind;
    } else if (kind === 'motion') {
      const seg = MOTION_SEGMENTS[segmentAt(SETTINGS.motion, MOTION_SEGMENTS.length, p.x, p.y)];
      if (seg) {
        save.settings.reducedMotion = seg.value;
        applyMotionPref(seg.value);
      }
    } else if (kind === 'language') {
      const seg = LANGUAGE_SEGMENTS[segmentAt(SETTINGS.language, LANGUAGE_SEGMENTS.length, p.x, p.y)];
      if (seg) this.app.setLanguage(seg.code); // persists through the app
      return;
    } else if (kind === 'tones') {
      // FE-14: persist the set; a non-classic one fetches its lazy chunk now (the shipped palette shows
      // until it lands, then the app's palette() answers the set and empties the sprite cache)
      const seg = TONE_SEGMENTS[segmentAt(SETTINGS.tones, TONE_SEGMENTS.length, p.x, p.y)];
      if (seg) {
        save.settings.tones = seg.value;
        if (seg.value !== 'classic') void loadToneSets().catch(() => undefined);
      }
    } else if (kind === 'textSize') {
      // AUD-U2: 100 / 125 / 150 %, applied at once (every font goes through render/widgets.ts `font()`)
      const seg = TEXT_SIZE_SEGMENTS[segmentAt(SETTINGS.textSize, TEXT_SIZE_SEGMENTS.length, p.x, p.y)];
      if (seg) {
        save.settings.textScale = seg;
        setTextScale(seg);
      }
    } else if (kind === 'haptics') {
      save.settings.haptics = save.settings.haptics === false; // AUD-U20: the capture / hit haptics read it (play.ts, audio/recipes.ts)
    } else if (kind === 'shake') {
      save.settings.shake = save.settings.shake === false; // AUD-F18: draw.ts drops the capture shake while it is false
    } else if (kind === 'reset') {
      this.confirming = true;
      return;
    } else {
      return; // REV-43: nothing changed (a confirm role outside the card): nothing to persist
    }
    writeSave(save);
  }

  cancel(): void {
    this.pressed = null;
    this.pressedKind = null;
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
