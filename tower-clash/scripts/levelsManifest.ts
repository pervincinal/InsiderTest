/**
 * `npm run levels:manifest [-- --check]` — regenerate src/levels/manifest.ts from src/levels/*.json
 * (PERF-2). With `--check`, only report whether the checked-in file is up to date (exit 1 if not);
 * `npm run levels:check` runs the same check.
 */
import { writeFileSync } from 'node:fs';
import { MANIFEST_PATH, checkManifest, readEntries, renderManifest } from './lib/levelManifest';

if (process.argv.includes('--check')) {
  const errors = checkManifest();
  if (errors.length > 0) {
    for (const e of errors) console.error(`levels:manifest: ${e}`);
    process.exit(1);
  }
  console.log('levels:manifest: src/levels/manifest.ts is up to date');
} else {
  const entries = readEntries();
  writeFileSync(MANIFEST_PATH, renderManifest(entries));
  console.log(`levels:manifest: wrote src/levels/manifest.ts (${entries.length} levels)`);
}
