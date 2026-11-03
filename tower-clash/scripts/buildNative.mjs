#!/usr/bin/env node
/**
 * The web build for the Capacitor shells (iOS / Android, store and simulator lanes alike):
 *   1. `vite build` with `VITE_DEBUG_SURFACE=0` (AUD-Q18) — `__DEBUG_SURFACE__` is false, so
 *      src/main.ts never imports src/debug.ts and no `assets/debug-*.js` chunk is emitted
 *      (`window.__towerclash`, `economy.grant()` etc. do not exist in a store build);
 *   2. scripts/stripSourcemaps.mjs (AUD-Q17) — the `.map` files move to sourcemaps/, so
 *      `cap sync` copies a map-free dist/ into the apps;
 *   3. a check that the build really has neither (exit 1 otherwise).
 * Same mode (`production`) as `npm run build`, so `.env.production` / `.env.local` still apply.
 *
 * Usage:  node scripts/buildNative.mjs [--outDir <dir>] [--maps <dir>]   (npm run build:native)
 *   --outDir  build here instead of dist/ (scratch builds)
 *   --maps    move the maps here instead of sourcemaps/
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripSourcemaps } from './stripSourcemaps.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? resolve(process.cwd(), String(args[i + 1])) : resolve(root, fallback);
};
const outDir = arg('--outDir', 'dist');
const maps = arg('--maps', 'sourcemaps');

const vite = spawnSync('npx', ['vite', 'build', '--outDir', JSON.stringify(outDir), '--emptyOutDir'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_DEBUG_SURFACE: '0' },
});
if (vite.status !== 0) process.exit(vite.status ?? 1);

const { count, bytes, referencing } = stripSourcemaps(outDir, maps);
console.log(`buildNative: moved ${count} source map(s) (${(bytes / 1024).toFixed(0)} kB) to ${maps}`);

const problems = [...referencing.map((f) => `${f} references a source map`)];
const assets = join(outDir, 'assets');
for (const f of existsSync(assets) ? readdirSync(assets) : []) {
  if (/^debug-.*\.js$/.test(f)) problems.push(`assets/${f}: the debug surface chunk is in a native build`);
}
for (const f of readdirSync(outDir, { recursive: true }).map(String)) if (f.endsWith('.map')) problems.push(`${f} left in the build`);
if (problems.length > 0) {
  console.error(`buildNative: FAIL\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('buildNative: OK — no debug surface chunk, no source maps; ready for `npx cap sync`');
