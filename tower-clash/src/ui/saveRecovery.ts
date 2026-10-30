/**
 * Corrupt-save copies (AUD-Q2), the lazy half. `loadSaveFrom` (./save.ts) copies an unreadable v3
 * entry to `towerclash.save.v3.bad.<ms>` synchronously and keeps the game from writing over the entry
 * at boot; this module — in the lazy chunk (./lazyScreens.ts), which the app fetches at once when
 * that happens — tidies the copies and tells the player. No recovery UI yet: copies are only kept.
 */
import type { SaveStorage } from './save';
import { SAVE_BACKUP_PREFIX, saveStorage } from './save';
import type { Toast } from './screens';
import { t } from './i18n';

/** How many corrupt-save copies are kept (the newest distinct ones). */
export const SAVE_BACKUP_KEEP = 2;

/**
 * One copy per distinct text (the newest), and only the newest `keep` of those, by the timestamp in
 * the key. A store that cannot list its keys (no `length` / `key`) is left as it is. Never throws.
 */
export function pruneSaveBackups(store: SaveStorage | null = saveStorage(), keep = SAVE_BACKUP_KEEP): void {
  if (!store?.key || typeof store.length !== 'number') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(SAVE_BACKUP_PREFIX)) keys.push(k);
    }
    const stamp = (k: string): number => Number(k.slice(SAVE_BACKUP_PREFIX.length)) || 0;
    keys.sort((a, b) => stamp(b) - stamp(a)); // newest first
    const seen = new Set<string | null>();
    let kept = 0;
    for (const k of keys) {
      const text = store.getItem(k);
      if (seen.has(text) || kept >= keep) store.removeItem(k);
      else {
        seen.add(text);
        kept += 1;
      }
    }
  } catch {
    /* storage went away: the copies stay as they are */
  }
}

/** Tidy the copies and show "Your save could not be read; a copy was kept" on the screen showing (never over a match). */
export function noticeUnreadableSave(app: { current: { name: string; toast?: Toast } }, kept: boolean): void {
  pruneSaveBackups();
  if (kept && app.current.name !== 'play') app.current.toast?.show(t('save.unreadableKept'), 'error', performance.now(), 6000);
}
