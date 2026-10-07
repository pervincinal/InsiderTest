import type { Palette } from '../render/palette';
import type { ShareCardSpec } from '../render/shareCard';
import { SHARE_H, SHARE_W, challengeLine, drawShareCard, loadShareFonts } from '../render/shareCard';
import { formatTime } from '../render/widgets';
import type { NativeShareResult } from '../native/share';
import { shareImage } from '../native/share';
import { isNative } from '../native/index';
import { levelName, t } from './i18n';
import type { ResultInfo } from './screens';

/*
 * Share card flow (SHARE-1, GDD §7.6, POST_LAUNCH.md §6.2): the result screen's SHARE button
 * draws a 1080 × 1350 PNG of the result on an offscreen canvas (src/render/shareCard.ts) and hands
 * it to the platform. Lazy chunk: the result screen reaches this module only through
 * `import('./share')`, so neither the flow nor the card drawing is in the eager bundle.
 *
 * Fallback chain (`sharePng`):
 *   1. native shell (`isNative()`): `shareImage(file, text)` from src/native/share.ts (Capacitor
 *      Share, wired by the Mobile Engineer); 'unavailable' falls through to 2 (iOS WebViews have
 *      `navigator.share`), never to 4;
 *   2. `navigator.share({ files: [png], title, text })` when `navigator.canShare` accepts the file;
 *   3. `navigator.share({ title, text })` — text only;
 *   4. web only: download the PNG through an `<a download>` click;
 *   5. otherwise 'unavailable'.
 * A dismissed sheet (AbortError) stops the chain as 'cancelled' — no download, no toast.
 *
 * Privacy: nothing leaves the device unless the player picks a target in the system share sheet;
 * no upload, no network call of our own.
 */

export type ShareResult = 'shared' | 'saved' | 'unavailable' | 'cancelled';

/** The parts of `navigator` the chain uses (injectable for tests). */
export interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
}

/** Everything the chain touches outside itself; `browserShareEnv()` is the real one. */
export interface ShareEnv {
  native: boolean;
  navigator: ShareNavigator | undefined;
  shareNative(file: File, text: string): Promise<NativeShareResult>;
  /** Save the file locally (web: `<a download>` click). Throws when impossible. */
  download(file: File): void;
}

/** A drawn card ready to hand to the platform. */
export interface PreparedShare {
  spec: ShareCardSpec;
  text: string;
  file: File;
}

/** What the last share did (debug surface `lastShare`, e2e). */
export interface ShareRecord {
  result: ShareResult;
  text: string;
  name: string;
  type: string;
  bytes: number;
  width: number;
  height: number;
}

/** Title passed to the share sheet (brand, not translated). */
export const SHARE_TITLE = 'Tower Clash';

/**
 * The card for a result, or null when the result has nothing to share: Yesterday's map (practice,
 * DAILY-6) pays nothing and proves nothing, so it has no SHARE button.
 */
export function shareSpecOf(info: ResultInfo, version: string): ShareCardSpec | null {
  if (info.daily?.practice) return null;
  const won = info.ui.outcome === 'won';
  const challenge = info.challenge
    ? { kind: 'daily' as const, key: info.challenge.dayKey, twist: t(`daily.twist.${info.challenge.twist.id}`) }
    : info.weekly
      ? { kind: 'weekly' as const, key: info.weekly.weekKey, twist: t(`daily.twist.${info.weekly.twist.id}`) }
      : null;
  return {
    levelId: info.level.id,
    levelName: levelName(info.level),
    won,
    stars: won ? info.ui.stars : 0,
    timeMs: info.ui.clockMs ?? info.state.time,
    challenge,
    version,
  };
}

/** Share text: "Tower Clash · [Daily 2026-10-05 · Lean rations · ]Level 12 · Name · 3★ in 01:12". */
export function shareText(spec: ShareCardSpec): string {
  const parts = [SHARE_TITLE];
  const challenge = challengeLine(spec);
  if (challenge) parts.push(challenge);
  parts.push(t('share.level', { n: spec.levelId, name: spec.levelName }));
  const time = formatTime(spec.timeMs);
  parts.push(spec.won ? t('share.won', { stars: spec.stars, time }) : t('share.lost', { time }));
  return parts.join(' · ');
}

/** PNG file name: towerclash-level-07.png, towerclash-daily-2026-10-05.png, towerclash-weekly-2026-09-28.png. */
export function shareFileName(spec: ShareCardSpec): string {
  const c = spec.challenge;
  return c ? `towerclash-${c.kind}-${c.key}.png` : `towerclash-level-${String(spec.levelId).padStart(2, '0')}.png`;
}

/** Toast text for a share result; null for a dismissed sheet. */
export function shareToastText(result: ShareResult): string | null {
  if (result === 'shared') return t('share.shared');
  if (result === 'saved') return t('share.saved');
  if (result === 'unavailable') return t('share.unavailable');
  return null;
}

function isAbort(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

function canShareFiles(nav: ShareNavigator, file: File): boolean {
  if (typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Run the fallback chain (see the file header). Never rejects. */
export async function sharePng(file: File, text: string, env: ShareEnv = browserShareEnv()): Promise<ShareResult> {
  if (env.native) {
    const r = await env.shareNative(file, text).catch((): NativeShareResult => 'unavailable');
    if (r !== 'unavailable') return r;
  }
  const nav = env.navigator;
  if (nav && typeof nav.share === 'function') {
    const attempts: ShareData[] = canShareFiles(nav, file) ? [{ files: [file], title: SHARE_TITLE, text }, { title: SHARE_TITLE, text }] : [{ title: SHARE_TITLE, text }];
    for (const data of attempts) {
      try {
        await nav.share(data);
        return 'shared';
      } catch (err) {
        if (isAbort(err)) return 'cancelled';
        // NotAllowedError / TypeError / DataError: try the next, plainer payload
      }
    }
  }
  if (env.native) return 'unavailable'; // a WebView `<a download>` saves nothing the player can find
  try {
    env.download(file);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

/** `<a download>` click on an object URL (revoked later: some browsers read it after the click returns). */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export function browserShareEnv(): ShareEnv {
  return {
    native: isNative(),
    navigator: typeof navigator === 'undefined' ? undefined : (navigator as ShareNavigator),
    shareNative: shareImage,
    download: downloadFile,
  };
}

/** Draw the card on an offscreen canvas (after its faces are loaded) and encode it as a PNG file. */
export async function renderShareFile(spec: ShareCardSpec, pal: Palette): Promise<File> {
  await loadShareFonts(spec);
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_W;
  canvas.height = SHARE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('share card: no 2d context');
  drawShareCard(ctx, pal, spec);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('share card: toBlob failed'))), 'image/png'));
  return new File([blob], shareFileName(spec), { type: 'image/png' });
}

/** Draw the card for a result (null: nothing to share). Started on the SHARE press so the tap's activation is still fresh on release. */
export async function prepareShare(info: ResultInfo, pal: Palette, version: string): Promise<PreparedShare | null> {
  const spec = shareSpecOf(info, version);
  if (!spec) return null;
  return { spec, text: shareText(spec), file: await renderShareFile(spec, pal) };
}

/** Hand a prepared card to the platform; the record feeds the toast and the debug surface. */
export async function sendShare(prep: PreparedShare, env: ShareEnv = browserShareEnv()): Promise<ShareRecord> {
  const result = await sharePng(prep.file, prep.text, env);
  return { result, text: prep.text, name: prep.file.name, type: prep.file.type, bytes: prep.file.size, width: SHARE_W, height: SHARE_H };
}
