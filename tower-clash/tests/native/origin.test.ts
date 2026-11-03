import { describe, expect, it } from 'vitest';
import config from '../../capacitor.config';

/*
 * AUD-Q14: the native web origin is pinned. Inside the Capacitor shells the game's `localStorage`
 * (the save, `towerclash.save.v3` — src/ui/save.ts) belongs to the origin the WebView serves `dist/`
 * from, which Capacitor derives from `capacitor.config.ts`:
 *
 *   iOS      `<server.iosScheme>://<server.hostname>`      → implicit default  capacitor://localhost
 *   Android  `<server.androidScheme>://<server.hostname>`  → https://localhost (androidScheme set, hostname implicit)
 *
 * A change to any of the three (or a `server.url` pointing the shell at a dev server) moves the WebView
 * to a new origin: the old origin's localStorage is simply not visible there, so every installed save is
 * orphaned at the next update (the native Preferences mirror, AUD-Q4 / MOBILE.md §8.9, would bring it
 * back only where the WebView copy is *missing*, and Preferences is keyed by `appId`). This test fails
 * such a change with the reason, so it is made knowingly, together with a migration.
 */

const ORPHANS = 'this orphans every installed save: the WebView origin moves and the old localStorage is unreachable (AUD-Q14, MOBILE.md §8.9)';

describe('native web origin pin (AUD-Q14)', () => {
  it('appId is the install identity (Preferences mirror key space, bundle / application id)', () => {
    expect(config.appId, 'appId renames the app: a new install, a new Preferences store — every save is lost').toBe('com.pervincinal.towerclash');
  });

  it('server.hostname and server.iosScheme are not set: iOS serves from the implicit capacitor://localhost', () => {
    expect(config.server, 'the server block exists (androidScheme is set in it)').toBeDefined();
    expect(config.server?.hostname, `server.hostname — ${ORPHANS}`).toBeUndefined();
    expect(config.server?.iosScheme, `server.iosScheme — ${ORPHANS}`).toBeUndefined();
    expect(config.server?.url, `server.url points the shell at another origin — ${ORPHANS}`).toBeUndefined();
    expect(config.server?.cleartext, 'cleartext would allow an http:// origin').toBeUndefined();
  });

  it('server.androidScheme stays https: Android serves from https://localhost', () => {
    expect(config.server?.androidScheme, `server.androidScheme — ${ORPHANS}`).toBe('https');
  });

  it('the resolved origins are the documented ones', () => {
    const host = config.server?.hostname ?? 'localhost';
    const ios = `${config.server?.iosScheme ?? 'capacitor'}://${host}`;
    const android = `${config.server?.androidScheme ?? 'https'}://${host}`;
    expect({ ios, android }, ORPHANS).toEqual({ ios: 'capacitor://localhost', android: 'https://localhost' });
  });
});
