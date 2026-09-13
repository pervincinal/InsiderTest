/** `npm run levels:check` — validate every level in src/levels/index.ts; exit 1 on any failure. */
import { LEVELS } from '../src/levels/index';
import { formatReport, validateLevels } from './lib/validateLevel';

const reports = validateLevels(LEVELS);
console.log(formatReport(reports));
if (reports.some((r) => r.errors.length > 0)) process.exit(1);
