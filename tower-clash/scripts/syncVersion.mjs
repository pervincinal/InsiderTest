#!/usr/bin/env node
/**
 * Copies the version from package.json into the native projects so every store upload carries
 * matching numbers:
 *   Android  android/app/build.gradle        versionName "<version>"   versionCode <code>
 *   iOS      ios/App/App.xcodeproj/project.pbxproj
 *                                            MARKETING_VERSION = <version>; CURRENT_PROJECT_VERSION = <code>;
 *
 * The integer build number (`versionCode` / `CURRENT_PROJECT_VERSION`) comes from
 * `config.buildNumber` in package.json. Both stores require it to grow with every upload, so
 * bump it (and usually `version`) before each release, then run `npm run version:sync`.
 *
 * Usage:  node scripts/syncVersion.mjs [--code <n>] [--check]
 *   --code   use this build number instead of package.json `config.buildNumber`
 *   --check  exit 1 (and change nothing) when the native files are out of date
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
const codeArg = args.indexOf('--code');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = String(pkg.version);
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`syncVersion: package.json version "${version}" is not plain MAJOR.MINOR.PATCH`);
  process.exit(1);
}
const code = codeArg >= 0 ? Number(args[codeArg + 1]) : Number(pkg.config?.buildNumber);
if (!Number.isInteger(code) || code < 1) {
  console.error(
    `syncVersion: invalid build number ${code} — set "config": { "buildNumber": <integer> } in package.json or pass --code <n>`,
  );
  process.exit(1);
}

const targets = [
  {
    file: 'android/app/build.gradle',
    edits: [
      [/versionCode\s+\d+/, `versionCode ${code}`],
      [/versionName\s+"[^"]*"/, `versionName "${version}"`],
    ],
  },
  {
    file: 'ios/App/App.xcodeproj/project.pbxproj',
    edits: [
      [/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${code};`],
      [/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`],
    ],
  },
];

let outdated = 0;
for (const { file, edits } of targets) {
  const path = resolve(root, file);
  const before = readFileSync(path, 'utf8');
  let after = before;
  for (const [re, replacement] of edits) {
    if (!re.test(after)) {
      console.error(`syncVersion: pattern ${re} not found in ${file}`);
      process.exit(1);
    }
    after = after.replace(re, replacement);
  }
  if (after === before) {
    console.log(`syncVersion: ${file} already at ${version} (${code})`);
    continue;
  }
  outdated++;
  if (check) {
    console.error(`syncVersion: ${file} is out of date (expected ${version} / ${code})`);
  } else {
    writeFileSync(path, after);
    console.log(`syncVersion: ${file} -> ${version} (${code})`);
  }
}
if (check && outdated > 0) process.exit(1);
