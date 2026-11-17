// Producer: prepare the "play" artifact publish from dist/ (daily-sprint skill §4.5a).
//   node scripts/producer/syncArtifact.mjs <playDir> [--dist dist] [--published list.txt]
// Mirrors dist/ (minus *.map and index.html) into <playDir>, swaps the entry `assets/index-<hash>.js` in
// <playDir>/tower-clash.html (created from scripts/producer/artifact-page.html when missing), writes
// <playDir>/publish-arg.json — the Artifact tool's `files` map: every changed or new path, plus `null` for every
// path that was published before (the previous manifest, or --published, one path per line) and is gone — and
// <playDir>/manifest.json (path → sha256) for the next delta. Prints a one-line summary.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const playDir = args[0];
if (!playDir) throw new Error('usage: syncArtifact.mjs <playDir> [--dist dist] [--published list.txt]');
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const dist = resolve(opt('--dist', 'dist'));
const publishedList = opt('--published', undefined);
const KEEP = new Set(['tower-clash.html', 'publish-arg.json', 'manifest.json']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

mkdirSync(playDir, { recursive: true });
const manifestPath = join(playDir, 'manifest.json');
const old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const published = publishedList ? new Set(readFileSync(publishedList, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)) : new Set();

const next = {};
for (const src of walk(dist)) {
  const rel = relative(dist, src);
  if (rel.endsWith('.map') || rel === 'index.html') continue;
  next[rel] = sha(src);
  const dst = join(playDir, rel);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
}
for (const p of walk(playDir)) {
  const rel = relative(playDir, p);
  if (!KEEP.has(rel) && !(rel in next)) rmSync(p);
}
const delta = {};
for (const [p, h] of Object.entries(next)) if (old[p] !== h) delta[p] = p;
for (const p of new Set([...Object.keys(old), ...published])) if (!(p in next)) delta[p] = null;

const entry = /src="(?:\.\/|\/)?(assets\/index-[\w-]+\.js)"/.exec(readFileSync(join(dist, 'index.html'), 'utf8'))?.[1];
if (!entry || !(entry in next)) throw new Error(`entry chunk not found in dist/index.html (${entry})`);
const pagePath = join(playDir, 'tower-clash.html');
const template = existsSync(pagePath) ? readFileSync(pagePath, 'utf8') : readFileSync(new URL('./artifact-page.html', import.meta.url), 'utf8');
const page = template.replace(/assets\/index-[\w-]+\.js/, entry);
writeFileSync(pagePath, page);
writeFileSync(join(playDir, 'publish-arg.json'), JSON.stringify(delta));
writeFileSync(manifestPath, JSON.stringify(next, null, 0));
const changed = Object.values(delta).filter((v) => v !== null).length;
const removed = Object.values(delta).filter((v) => v === null).length;
console.log(`syncArtifact: ${Object.keys(next).length} files, delta ${changed} changed, ${removed} removed, entry ${entry}, page ${page === template ? 'same' : 'changed'}`);
