import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sandboxHeadlessShell } from '../../scripts/lib/sandboxBrowser';

/*
 * QA-43 (ENV-1): `sandboxHeadlessShell()` finds the Chromium headless shell under /opt/pw-browsers in either
 * directory layout (old `chrome-linux/headless_shell`, new `chrome-headless-shell-linux64/chrome-headless-shell`),
 * newest build first, '' when none. Fixtures live in a temp dir, so no real browser is needed.
 */

const OLD = 'chrome-linux/headless_shell';
const NEW = 'chrome-headless-shell-linux64/chrome-headless-shell';

const roots: string[] = [];
function makeRoot(): string {
  const r = mkdtempSync(join(tmpdir(), 'sandbox-browser-'));
  roots.push(r);
  return r;
}
function put(root: string, dir: string, rel?: string): string {
  const d = join(root, dir);
  mkdirSync(d, { recursive: true });
  if (!rel) return '';
  const bin = join(d, rel);
  mkdirSync(join(bin, '..'), { recursive: true });
  writeFileSync(bin, '');
  return `${root}/${dir}/${rel}`;
}

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe('sandboxHeadlessShell', () => {
  it('finds the old layout (build 1194)', () => {
    const root = makeRoot();
    const bin = put(root, 'chromium_headless_shell-1194', OLD);
    expect(sandboxHeadlessShell(root)).toBe(bin);
  });

  it('finds the new layout (build 1243)', () => {
    const root = makeRoot();
    const bin = put(root, 'chromium_headless_shell-1243', NEW);
    expect(sandboxHeadlessShell(root)).toBe(bin);
  });

  it('prefers the newest build when both are present', () => {
    const root = makeRoot();
    put(root, 'chromium_headless_shell-1194', OLD);
    const bin = put(root, 'chromium_headless_shell-1243', NEW);
    expect(sandboxHeadlessShell(root)).toBe(bin);
  });

  it('skips a build dir with no binary in favour of an older one that has it', () => {
    const root = makeRoot();
    const bin = put(root, 'chromium_headless_shell-1194', OLD);
    put(root, 'chromium_headless_shell-1243'); // empty build dir
    expect(sandboxHeadlessShell(root)).toBe(bin);
  });

  it("returns '' for a root that does not exist", () => {
    const root = makeRoot();
    expect(sandboxHeadlessShell(join(root, 'missing'))).toBe('');
  });

  it("returns '' when the root holds only unrelated dirs", () => {
    const root = makeRoot();
    put(root, 'chromium-1243', 'chrome-linux/chrome');
    put(root, 'ffmpeg-1011', 'ffmpeg-linux');
    expect(sandboxHeadlessShell(root)).toBe('');
  });

  it('real sandbox: the default call returns an existing file when /opt/pw-browsers exists', (ctx) => {
    if (!existsSync('/opt/pw-browsers')) {
      console.warn('QA-43: /opt/pw-browsers is absent on this machine (CI): real-sandbox assertion skipped');
      return ctx.skip();
    }
    const bin = sandboxHeadlessShell();
    expect(bin).not.toBe('');
    expect(existsSync(bin)).toBe(true);
  });
});
