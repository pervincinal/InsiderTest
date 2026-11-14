import { existsSync, readdirSync } from 'node:fs';

/**
 * The Chromium headless shell the sandbox ships under /opt/pw-browsers, whatever build it is (1194 until
 * 2026-11-13, 1243 since — the container image moves, and the layout moved with it: `chrome-linux/headless_shell`
 * up to 1194, `chrome-headless-shell-linux64/chrome-headless-shell` from 1243). `''` where the directory does not
 * exist (CI, a developer machine): the caller then lets Playwright pick its own browser. The same rule lives in
 * playwright.config.ts (which cannot import from scripts/).
 */
export function sandboxHeadlessShell(root = '/opt/pw-browsers'): string {
  if (!existsSync(root)) return '';
  const dirs = readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of dirs) {
    for (const rel of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell']) {
      const bin = `${root}/${d}/${rel}`;
      if (existsSync(bin)) return bin;
    }
  }
  return '';
}
