#!/usr/bin/env node
/*
 * QA-20: take the per-port dist/ snapshot the e2e preview serves (playwright.config.ts, QA-6) only
 * when it is a complete build.
 *
 *   node e2e/tools/snapshotDist.mjs <dist> <snapshot> [--attempts N] [--delay-ms MS]
 *
 * QA-6 made a running suite immune to a parallel `npm run build`, but the copy itself could still
 * land inside another agent's build: Vite empties dist/ first and writes the chunks over a few
 * seconds. Measured 2026-10-11 04:14 (Frontend rebuilt while this suite's preview server started):
 * the snapshot had no index.html, `GET /` answered 404 and all 36 tests of the run failed in boot
 * (`waitForFunction` 20 s). Now the copy is checked — index.html exists and every hashed chunk it
 * reaches (`./assets/*` in the HTML, `"./name-hash.js"` / `"assets/name-hash.js"` in the JS: static
 * imports, `import()`, Vite's preload map) is in the snapshot — and is taken again after a pause when
 * it is not, so a build in progress is waited out. Exit 1 with the missing files after the last attempt.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Hashed build files a file of the snapshot references and the snapshot does not hold. */
export function missingFiles(dir) {
  if (!existsSync(path.join(dir, 'index.html'))) return ['index.html'];
  const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
  const queue = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"?#]+)"/g)].map((m) => m[1]);
  if (queue.length === 0) return ['index.html (no ./assets/ entry)'];
  const seen = new Set();
  const missing = [];
  while (queue.length > 0) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const file = path.join(dir, rel);
    if (!existsSync(file)) {
      missing.push(rel);
      continue;
    }
    if (!rel.endsWith('.js')) continue;
    const js = readFileSync(file, 'utf8');
    // hashed names only (`name-XXXXXXXX.js`): "./sw.js" in the entry is a document-relative URL, not a chunk
    for (const m of js.matchAll(/["'`]\.\/([\w.-]+-[\w-]{8}\.(?:js|css))["'`]/g)) queue.push(`assets/${m[1]}`);
    for (const m of js.matchAll(/["'`](assets\/[\w.-]+-[\w-]{8}\.(?:js|css))["'`]/g)) queue.push(m[1]);
  }
  return missing;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] !== undefined ? Number(process.argv[i + 1]) : fallback;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function main() {
  const [src, dest] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1]?.startsWith('--')));
  if (!src || !dest) {
    console.error('usage: snapshotDist.mjs <dist> <snapshot> [--attempts N] [--delay-ms MS]');
    process.exit(2);
  }
  const attempts = arg('--attempts', 20);
  const delayMs = arg('--delay-ms', 2000);
  let missing = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    if (existsSync(src)) cpSync(src, dest, { recursive: true });
    missing = existsSync(src) ? missingFiles(dest) : [`${src}/ (no build: run npm run build first)`];
    if (missing.length === 0) {
      if (attempt > 1) console.error(`e2e: dist snapshot complete on attempt ${attempt}`);
      return;
    }
    console.error(`e2e: dist snapshot attempt ${attempt}/${attempts} incomplete (a build in progress?): missing ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}`);
    if (attempt < attempts) sleep(delayMs);
  }
  console.error(`e2e: no complete dist snapshot after ${attempts} attempts; missing: ${missing.join(', ')}`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
