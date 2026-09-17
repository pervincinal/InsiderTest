/**
 * `npm run levels:check` — validate every level in src/levels/manifest.ts and make sure the manifest
 * itself matches src/levels/*.json (PERF-2); exit 1 on any failure.
 */
import { loadAllLevels } from '../src/levels/index';
import { checkManifest } from './lib/levelManifest';
import { formatReport, validateLevels } from './lib/validateLevel';

const stale = checkManifest();
for (const e of stale) console.error(`levels:check: ${e}`);
const reports = validateLevels(await loadAllLevels());
console.log(formatReport(reports));
if (stale.length > 0 || reports.some((r) => r.errors.length > 0)) process.exit(1);
