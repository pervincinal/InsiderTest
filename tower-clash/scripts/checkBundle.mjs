#!/usr/bin/env node
/**
 * Web bundle guard (QA). Builds the game (unless `--no-build`) and checks the code the browser
 * downloads before the first frame — the entry chunk referenced by dist/index.html plus its
 * `<link rel="modulepreload">` chunks:
 *
 *   1. none of them contains the native store / ads plugin packages. Those are loaded with a
 *      dynamic `import()` only inside a Capacitor shell (src/economy/providers/*.ts,
 *      src/native/index.ts), so a static import sneaking in would ship RevenueCat / AdMob to
 *      every web player;
 *   2. their total gzip size stays under the budget (the whole game is a single entry chunk;
 *      the budget is generous so that content, not accidents, decides when it moves).
 *
 * Usage:  node scripts/checkBundle.mjs [--no-build] [--budget <bytes>] [--dist <dir>]
 * Exit code 1 on any violation. The report line is also printed on success so CI logs the size.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const budgetArg = args.indexOf('--budget');

/**
 * Gzip budget for the eagerly loaded JavaScript, in bytes. Rules v2 (links, per-level tower
 * sprites) pushed the entry chunk to 80.4 kB; the budget is 84 kB until PERF-2 moves the level
 * JSON out of the eager chunk, then it goes back to 80 kB.
 */
const DEFAULT_GZIP_BUDGET = 84 * 1024;
/** Package name fragments that must never appear in the eagerly loaded chunks. */
const FORBIDDEN_STRINGS = ['purchases-capacitor', 'capacitor-community/admob'];

const budget = budgetArg >= 0 ? Number(args[budgetArg + 1]) : DEFAULT_GZIP_BUDGET;
if (!Number.isInteger(budget) || budget <= 0) {
  console.error(`checkBundle: invalid --budget ${args[budgetArg + 1]}`);
  process.exit(2);
}

const distArg = args.indexOf('--dist');
const dist = distArg >= 0 ? resolve(process.cwd(), String(args[distArg + 1])) : resolve(root, 'dist');
if (!noBuild) {
  console.log('checkBundle: building (npm run build)…');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
} else if (!existsSync(resolve(dist, 'index.html'))) {
  console.error('checkBundle: --no-build given but dist/index.html does not exist — run `npm run build` first');
  process.exit(2);
}

/** Script and modulepreload URLs referenced by dist/index.html, in document order. */
function eagerChunkUrls(html) {
  const urls = [];
  const tagRe = /<(script|link)\b[^>]*>/gi;
  for (const [tag, kind] of html.matchAll(tagRe)) {
    const src = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src || !src.endsWith('.js')) continue;
    if (kind.toLowerCase() === 'script' || /\brel\s*=\s*["']modulepreload["']/i.test(tag)) urls.push(src);
  }
  return urls;
}

const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const urls = eagerChunkUrls(html);
if (urls.length === 0) {
  console.error('checkBundle: no <script src> / modulepreload found in dist/index.html');
  process.exit(1);
}

let failures = 0;
let totalRaw = 0;
let totalGzip = 0;
for (const url of urls) {
  const file = resolve(dist, url.replace(/^\.?\//, ''));
  if (!existsSync(file)) {
    console.error(`checkBundle: ${url} referenced by index.html is missing`);
    failures++;
    continue;
  }
  const code = readFileSync(file, 'utf8');
  const gz = gzipSync(code, { level: 9 }).length;
  totalRaw += code.length;
  totalGzip += gz;
  console.log(`checkBundle: ${url}  raw ${(code.length / 1024).toFixed(1)} kB  gzip ${(gz / 1024).toFixed(1)} kB`);
  for (const needle of FORBIDDEN_STRINGS) {
    const at = code.indexOf(needle);
    if (at >= 0) {
      failures++;
      const line = code.slice(0, at).split('\n').length;
      console.error(
        `checkBundle: FAIL ${url} contains "${needle}" (line ${line}). ` +
          'Native plugins must only be reached through a dynamic import() behind isNative() ' +
          '(see src/economy/providers/revenueCat.ts, admob.ts).',
      );
    }
  }
}

const summary = `checkBundle: eager JS = ${urls.length} chunk(s), raw ${(totalRaw / 1024).toFixed(1)} kB, gzip ${(totalGzip / 1024).toFixed(1)} kB (budget ${(budget / 1024).toFixed(0)} kB)`;
if (totalGzip > budget) {
  failures++;
  console.error(`${summary} — FAIL: over budget by ${((totalGzip - budget) / 1024).toFixed(1)} kB`);
} else {
  console.log(`${summary} — OK`);
}

if (failures > 0) {
  console.error(`checkBundle: ${failures} problem(s)`);
  process.exit(1);
}
