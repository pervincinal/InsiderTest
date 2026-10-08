import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * QA-16 (MM-9): the web bundle guard `scripts/checkBundle.mjs` (CI step "Web bundle guard",
 * `node scripts/checkBundle.mjs --no-build`). The native plugins — RevenueCat, AdMob and, since the
 * rating prompt, `@capacitor-community/in-app-review` — may only be reached through a dynamic
 * `import()` behind `isNative()`; a static import would ship them to every web player. These tests
 * pin the forbidden list and run the real script against fake dist/ folders (`--dist <tmp>`), so
 * no build is needed: a clean entry chunk passes, a forbidden package name in an eager chunk
 * (entry `<script>` or `<link rel="modulepreload">`) fails with exit 1 and names the package, the
 * same string in a lazy chunk index.html does not reference passes, and the size budget still bites.
 */

const SCRIPT = fileURLToPath(new URL('../../scripts/checkBundle.mjs', import.meta.url));
const SOURCE = readFileSync(SCRIPT, 'utf8');
const PLUGINS = ['purchases-capacitor', 'capacitor-community/admob', 'capacitor-community/in-app-review'] as const;

/** `FORBIDDEN_STRINGS` as written in the script (it runs on import, so it is read, not imported). */
function forbiddenStrings(): string[] {
  const body = /const FORBIDDEN_STRINGS\s*=\s*\[([^\]]*)\]/.exec(SOURCE)?.[1];
  if (body === undefined) throw new Error('FORBIDDEN_STRINGS not found in scripts/checkBundle.mjs');
  return [...body.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2]!);
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A fake dist/: index.html with one entry script (+ optional modulepreloads) and the given chunk files. */
function fakeDist(chunks: Record<string, string>, opts: { entry?: string; preload?: string[] } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'qa-checkbundle-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'assets'));
  for (const [name, code] of Object.entries(chunks)) writeFileSync(join(dir, 'assets', name), code);
  const entry = opts.entry ?? 'index-abc123.js';
  const preloads = (opts.preload ?? []).map((p) => `    <link rel="modulepreload" crossorigin href="./assets/${p}">`).join('\n');
  writeFileSync(
    join(dir, 'index.html'),
    `<!doctype html>\n<html>\n  <head>\n    <script type="module" crossorigin src="./assets/${entry}"></script>\n${preloads}\n  </head>\n  <body><div id="app"></div></body>\n</html>\n`,
  );
  return dir;
}

function run(dist: string, ...extra: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [SCRIPT, '--no-build', '--dist', dist, ...extra], { encoding: 'utf8', timeout: 20_000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const CLEAN = 'const a=1;export function boot(){return import("./lazy-1.js")}\n';

describe('scripts/checkBundle.mjs — forbidden native plugins (QA-16)', () => {
  it('FORBIDDEN_STRINGS lists the store, ads and in-app-review plugins', () => {
    const list = forbiddenStrings();
    for (const p of PLUGINS) expect(list).toContain(p);
  });

  it('passes a clean eager bundle (exit 0) and logs the size line', () => {
    const r = run(fakeDist({ 'index-abc123.js': CLEAN }));
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/eager JS = 1 chunk\(s\).*— OK/);
  });

  it('fails (exit 1) on an entry chunk containing capacitor-community/in-app-review and names it', () => {
    const code = `${CLEAN}import{InAppReview as r}from"@capacitor-community/in-app-review";r.requestReview();\n`;
    const r = run(fakeDist({ 'index-abc123.js': code }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('FAIL ./assets/index-abc123.js contains "capacitor-community/in-app-review" (line 2)');
    expect(r.stderr).toContain('checkBundle: 1 problem(s)');
  });

  it.each(PLUGINS)('fails (exit 1) on %s in a modulepreload chunk', (plugin) => {
    const r = run(fakeDist({ 'index-abc123.js': CLEAN, 'vendor-def456.js': `export const p="@${plugin}";\n` }, { preload: ['vendor-def456.js'] }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`FAIL ./assets/vendor-def456.js contains "${plugin}"`);
  });

  it('ignores lazy chunks index.html does not reference (the plugins live there behind isNative())', () => {
    const r = run(fakeDist({ 'index-abc123.js': CLEAN, 'review-xyz.js': 'export * from "@capacitor-community/in-app-review";\n' }));
    expect(r.status).toBe(0);
  });

  it('still enforces the gzip budget (exit 1 over --budget)', () => {
    const r = run(fakeDist({ 'index-abc123.js': CLEAN.repeat(20) }), '--budget', '10');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/FAIL: over budget/);
  });

  it('--no-build without dist/index.html → exit 2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qa-checkbundle-'));
    dirs.push(dir);
    const r = run(dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/dist\/index\.html does not exist/);
  });
});
