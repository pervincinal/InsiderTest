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
 *      the budget is the measured size + ~2 kB, so that content, not accidents, decides when it moves).
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
 * Gzip budget for the eagerly loaded JavaScript, in bytes. The level bodies are per-level chunks
 * (PERF-2, src/levels/manifest.ts) and the menu screens a lazy chunk (PERF-1), so the entry chunk
 * is the sim + play screen + renderer + level metadata (≈ 67 kB after rules v2).
 * 2026-10-12 (ART-20 walking soldiers, ART-21 tilted camera, FE-12 title layout): 80 → 88 kB; the
 * renderer grew 4 kB for the stakeholder's visual pass. PERF-9 tracked getting back under 80.
 * 2026-10-13 (ART-22 chips, ART-23 lighting + combat effects, BUG-40 ground build): 88 → 92 kB at 87.9 kB.
 * 2026-10-14 (PERF-9): 88.4 → 79.7 kB — the perspective camera (src/render/perspective.ts: ground
 * warp, horizon haze, islets, tutorial side bubble; only the `?tilt=` override uses it since ART-24)
 * and the enemy AI (src/ai/*, awaited with the level chunk, src/ui/ai.ts) are lazy chunks. Budget
 * 92 → 82 kB (the new size + 2 kB headroom).
 * 2026-10-30 (skills audit day 1: 44 pt hit areas through hitRect, crystal-spend confirm flows, MENU → pause,
 * save backup / read-only paths, the native save mirror's eager gate): 81.3 → 82.3 kB. Budget 82 → 84 kB
 * (Producer decision, AUD summary): the audit's P1 set is worth 1 kB; PERF-11 brings the eager chunk back
 * under 82 kB (candidates: the debug surface's eager hooks, AUD-Q18; the boot path's duplicated locale glue).
 * 2026-10-30 / 31 (PERF-11): 85.0 → 80.7 kB — lazy chunks for the purchases flows and the Daily / Weekly
 * generator (day 1), then the result screen (src/ui/result.ts + native/review.ts, loaded by src/ui/resultChunk.ts,
 * warmed at idle and at level start, the 600 ms result beat covering any download still in flight) and the store
 * boot (src/economy/store.ts + the web fake, initialised at idle / on the shop's first open). Budget 84 → 82 kB
 * (≈ 1.3 kB headroom; features added since must stay at 0 eager bytes or bring their own savings).
 */
const DEFAULT_GZIP_BUDGET = 82 * 1024;
/** Package name fragments that must never appear in the eagerly loaded chunks. */
const FORBIDDEN_STRINGS = ['purchases-capacitor', 'capacitor-community/admob', 'capacitor-community/in-app-review'];

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
