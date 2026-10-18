/**
 * `npm run levels:manifest [-- --check]` — regenerate src/levels/manifest.ts and src/levels/names.ts
 * from src/levels/*.json (PERF-2, PERF-10). With `--check`, only report whether the checked-in file is up to date (exit 1 if not);
 * `npm run levels:check` runs the same check.
 */
import { writeFileSync } from 'node:fs';
import { MANIFEST_PATH, NAMES_PATH, checkManifest, readEntries, renderManifest, renderNames } from './lib/levelManifest';

if (process.argv.includes('--check')) {
  const errors = checkManifest();
  if (errors.length > 0) {
    for (const e of errors) console.error(`levels:manifest: ${e}`);
    process.exit(1);
  }
  console.log('levels:manifest: src/levels/manifest.ts and src/levels/names.ts are up to date');
} else {
  const entries = readEntries();
  writeFileSync(MANIFEST_PATH, renderManifest(entries));
  writeFileSync(NAMES_PATH, renderNames(entries));
  console.log(`levels:manifest: wrote src/levels/manifest.ts and src/levels/names.ts (${entries.length} levels)`);
}
