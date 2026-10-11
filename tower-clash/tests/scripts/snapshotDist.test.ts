import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * QA-20: e2e/tools/snapshotDist.mjs takes the dist/ snapshot the e2e preview serves only when it is a
 * complete build. 2026-10-11 04:14: another agent's `npm run build` emptied dist/ while this suite's
 * preview server copied it; the snapshot had no index.html and 36/36 tests failed in boot. These tests
 * run the real script on fake builds.
 */
const TOOL = fileURLToPath(new URL('../../e2e/tools/snapshotDist.mjs', import.meta.url));
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A fake Vite build: entry → static chunk + lazy chunk (+ preload-map entry), and the `./sw.js` string the real entry carries. */
function fakeBuild(root: string, skip: string[] = []): void {
  const files: Record<string, string> = {
    'index.html': '<script type="module" crossorigin src="./assets/index-AbCdEf12.js"></script><link rel="stylesheet" href="./assets/index-Zz9_-x01.css">',
    'assets/index-AbCdEf12.js': 'import{a}from"./shared-B1b2B3b4.js";const m=["assets/lazyScreens-CW72UzKY.js"];navigator.serviceWorker.register("./sw.js");import("./lazyScreens-CW72UzKY.js");',
    'assets/index-Zz9_-x01.css': 'body{}',
    'assets/shared-B1b2B3b4.js': 'export const a=1;',
    'assets/lazyScreens-CW72UzKY.js': 'import{a}from"./shared-B1b2B3b4.js";export const s=a;',
    'sw.js': '',
  };
  mkdirSync(join(root, 'assets'), { recursive: true });
  for (const [rel, text] of Object.entries(files)) if (!skip.includes(rel)) writeFileSync(join(root, rel), text);
}

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'snapdist-'));
  dirs.push(d);
  return d;
}

const run = (src: string, dest: string, attempts = 2) =>
  spawnSync(process.execPath, [TOOL, src, dest, '--attempts', String(attempts), '--delay-ms', '20'], { encoding: 'utf8' });

describe('e2e/tools/snapshotDist.mjs (QA-20)', () => {
  it('copies a complete build at the first attempt (a document-relative "./sw.js" is not a chunk)', () => {
    const t = tmp();
    fakeBuild(join(t, 'dist'));
    const r = run(join(t, 'dist'), join(t, 'snap'));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toBe('');
    expect(existsSync(join(t, 'snap', 'assets', 'lazyScreens-CW72UzKY.js'))).toBe(true);
  });

  it('refuses a build without index.html (the 04:14 snapshot) and names it', () => {
    const t = tmp();
    fakeBuild(join(t, 'dist'), ['index.html']);
    const r = run(join(t, 'dist'), join(t, 'snap'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('attempt 1/2 incomplete');
    expect(r.stderr).toContain('missing: index.html');
  });

  it('follows static imports, import() and the preload map: a missing lazy or shared chunk is caught', () => {
    for (const gone of ['assets/lazyScreens-CW72UzKY.js', 'assets/shared-B1b2B3b4.js', 'assets/index-Zz9_-x01.css']) {
      const t = tmp();
      fakeBuild(join(t, 'dist'), [gone]);
      const r = run(join(t, 'dist'), join(t, 'snap'));
      expect(r.status, gone).toBe(1);
      expect(r.stderr, gone).toContain(gone);
    }
  });

  it('waits out a build in progress: the snapshot is taken again once the build is complete', async () => {
    const t = tmp();
    fakeBuild(join(t, 'dist'), ['assets/lazyScreens-CW72UzKY.js']);
    const child = spawn(process.execPath, [TOOL, join(t, 'dist'), join(t, 'snap'), '--attempts', '50', '--delay-ms', '40'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    await new Promise((r) => setTimeout(r, 150));
    writeFileSync(join(t, 'dist', 'assets', 'lazyScreens-CW72UzKY.js'), 'export const s=1;');
    const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
    expect(code, stderr).toBe(0);
    expect(stderr).toMatch(/dist snapshot complete on attempt \d+/);
    expect(existsSync(join(t, 'snap', 'assets', 'lazyScreens-CW72UzKY.js'))).toBe(true);
  });
});
