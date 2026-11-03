#!/usr/bin/env node
/**
 * AUD-Q17: moves every `*.map` file out of a Vite build so the maps never ship — not inside the
 * iOS / Android bundles (`cap sync` copies all of `webDir: 'dist'`) and not on GitHub Pages. The
 * build uses `sourcemap: 'hidden'` (vite.config.ts), so no shipped file points at a map; CI uploads
 * the moved maps as the `sourcemaps-<sha>` artifact (30 days) to symbolicate crash stacks.
 *
 * Usage:  node scripts/stripSourcemaps.mjs [--dist <dir>] [--out <dir>]
 *   --dist  the build to strip (default dist/)
 *   --out   where the maps go, same relative paths (default sourcemaps/, git-ignored; emptied first)
 * Exit 1 when a shipped .js / .css file still carries a `sourceMappingURL` comment.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every file under `dir`, as absolute paths. */
function filesUnder(dir) {
  return readdirSync(dir, { recursive: true })
    .map((f) => join(dir, String(f)))
    .filter((f) => statSync(f).isFile());
}

/**
 * Moves `dist/**\/*.map` to `out/` (same relative paths). Returns the count and bytes moved and the
 * shipped files that still reference a map (empty when the build is clean).
 */
export function stripSourcemaps(dist, out) {
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`stripSourcemaps: no build at ${dist} (dist/index.html missing)`);
  rmSync(out, { recursive: true, force: true });
  let count = 0;
  let bytes = 0;
  const referencing = [];
  for (const file of filesUnder(dist)) {
    if (file.endsWith('.map')) {
      const dest = join(out, relative(dist, file));
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(file, dest); // copy + unlink, not rename: dist/ and out/ may be on different devices
      unlinkSync(file);
      count++;
      bytes += statSync(dest).size;
    } else if (/\.(?:js|css)$/.test(file) && /[#@] sourceMappingURL=/.test(readFileSync(file, 'utf8'))) {
      referencing.push(relative(dist, file));
    }
  }
  return { count, bytes, referencing };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? resolve(process.cwd(), String(args[i + 1])) : resolve(root, fallback);
  };
  const dist = arg('--dist', 'dist');
  const out = arg('--out', 'sourcemaps');
  const { count, bytes, referencing } = stripSourcemaps(dist, out);
  console.log(`stripSourcemaps: moved ${count} map(s), ${(bytes / 1024).toFixed(0)} kB, ${relative(process.cwd(), dist) || '.'} → ${relative(process.cwd(), out) || '.'}`);
  if (referencing.length > 0) {
    console.error(`stripSourcemaps: FAIL ${referencing.length} shipped file(s) still reference a source map (expected sourcemap: 'hidden'): ${referencing.join(', ')}`);
    process.exit(1);
  }
}
