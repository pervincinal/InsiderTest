#!/usr/bin/env node
/**
 * MM-12 / MM-13 — parser for the commit-triggered release request files (docs/MOBILE.md §3.2
 * for iOS, §6 "Android" for Android). The team cannot press "Run workflow" or push tags, so a
 * commit that changes one of these files on the working branch is the trigger:
 *
 *   release/ios-release.request       → .github/workflows/tower-clash-ios-release.yml     (archive + upload)
 *   release/ios-store.request         → .github/workflows/tower-clash-ios-store.yml       (metadata / submit)
 *   release/android-release.request   → .github/workflows/tower-clash-android-release.yml (signed AAB/APK + Play)
 *   release/android-keystore.request  → .github/workflows/tower-clash-android-keystore.yml (upload key)
 *
 * Format (all files): one `key=value` per line; blank lines and lines starting with `#` are
 * ignored; a key may appear once; unknown keys are an error (a typo such as `lnae=appstore` must
 * not silently fall back to a default). Values are trimmed; `=` inside a value is kept. Every
 * file has `note=<text>` (optional, ≤ 200 characters) and `requested=<UTC time>` (required).
 * One schema per file kind:
 *
 *   ios-release       lane=testflight|appstore (default testflight)
 *   ios-store         action=metadata|submit (required), build=<positive integer> (required for
 *                     submit), iphone65=yes|no (default no)
 *   android-release   track=internal|closed|production (default internal),
 *                     status=draft|completed (default draft; the Play release status used by the
 *                     upload step). track=production with status=completed also needs a note
 *                     (whose written go-ahead it is), because that publishes to every Play user.
 *   android-keystore  generate=yes|no (required), replace_existing=no|yes (default no)
 *
 * `requested` must look like 2026-10-09T15:30Z or 2026-10-09T15:30:00Z: a new timestamp makes
 * every request a real diff, so GitHub's `paths` filter fires.
 *
 * Usage:  node scripts/releaseRequest.mjs <kind> <file> [--env]
 *   default  prints the validated values as JSON
 *   --env    prints NAME=value lines for $GITHUB_ENV (ios-release: LANE; ios-store: STORE_ACTION,
 *            STORE_BUILD, STORE_IPHONE65; android-release: TRACK, PLAY_STATUS; android-keystore:
 *            GENERATE, REPLACE_EXISTING); `note` is printed to stderr only, never exported
 * Exit code 1 with a one-line reason when the file is invalid.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TIMESTAMP = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?Z$/;
const NOTE_MAX = 200;

const SCHEMAS = {
  'ios-release': {
    keys: ['lane', 'note', 'requested'],
    finish(v) {
      const lane = v.lane || 'testflight';
      if (lane !== 'testflight' && lane !== 'appstore') {
        throw new Error(`lane must be testflight or appstore (got "${lane}")`);
      }
      return { lane, note: v.note ?? '', requested: v.requested };
    },
    env: (r) => [`LANE=${r.lane}`],
  },
  'ios-store': {
    keys: ['action', 'build', 'iphone65', 'note', 'requested'],
    finish(v) {
      const action = v.action ?? '';
      if (action !== 'metadata' && action !== 'submit') {
        throw new Error(`action must be metadata or submit (got "${action}")`);
      }
      const buildText = v.build ?? '';
      if (buildText !== '' && !/^[1-9]\d{0,5}$/.test(buildText)) {
        throw new Error(`build must be a positive whole number such as 8 (got "${buildText}")`);
      }
      if (action === 'submit' && buildText === '') {
        throw new Error('action=submit needs build=<build number>, e.g. build=8');
      }
      const iphone65 = v.iphone65 || 'no';
      if (iphone65 !== 'yes' && iphone65 !== 'no') {
        throw new Error(`iphone65 must be yes or no (got "${iphone65}")`);
      }
      return {
        action,
        build: buildText === '' ? null : Number(buildText),
        iphone65: iphone65 === 'yes',
        note: v.note ?? '',
        requested: v.requested,
      };
    },
    env: (r) => [`STORE_ACTION=${r.action}`, `STORE_BUILD=${r.build ?? ''}`, `STORE_IPHONE65=${r.iphone65 ? 'yes' : 'no'}`],
  },
  'android-release': {
    keys: ['track', 'status', 'note', 'requested'],
    finish(v) {
      const track = oneOf(v, 'track', ['internal', 'closed', 'production'], 'internal');
      const status = oneOf(v, 'status', ['draft', 'completed'], 'draft');
      const note = v.note ?? '';
      if (track === 'production' && status === 'completed' && note === '') {
        throw new Error('track=production with status=completed publishes to every Play user: write in note= whose go-ahead it is (e.g. note=stakeholder OK in the chat 2026-11-02)');
      }
      return { track, status, note, requested: v.requested };
    },
    env: (r) => [`TRACK=${r.track}`, `PLAY_STATUS=${r.status}`],
  },
  'android-keystore': {
    keys: ['generate', 'replace_existing', 'note', 'requested'],
    finish(v) {
      const generate = oneOf(v, 'generate', ['yes', 'no'], null);
      const replaceExisting = oneOf(v, 'replace_existing', ['no', 'yes'], 'no');
      return { generate: generate === 'yes', replaceExisting: replaceExisting === 'yes', note: v.note ?? '', requested: v.requested };
    },
    env: (r) => [`GENERATE=${r.generate ? 'yes' : 'no'}`, `REPLACE_EXISTING=${r.replaceExisting ? 'yes' : 'no'}`],
  },
};

export const REQUEST_KINDS = Object.keys(SCHEMAS);

/**
 * The value of `key` if it is one of `allowed`; an empty or absent value gives `fallback`
 * (`null` = the key is required).
 */
function oneOf(values, key, allowed, fallback) {
  const value = values[key] || fallback;
  if (value === null) throw new Error(`${key}=${allowed.join('|')} is missing`);
  if (!allowed.includes(value)) {
    const list = allowed.length === 2 ? allowed.join(' or ') : `${allowed.slice(0, -1).join(', ')} or ${allowed[allowed.length - 1]}`;
    throw new Error(`${key} must be ${list} (got "${value}")`);
  }
  return value;
}

/** Parses and validates request text. Throws an Error with a one-line reason. */
export function parseRequest(kind, text) {
  const schema = Object.hasOwn(SCHEMAS, kind) ? SCHEMAS[kind] : undefined;
  if (!schema) throw new Error(`unknown request kind "${kind}" (${REQUEST_KINDS.join(', ')})`);
  const values = {};
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq <= 0) throw new Error(`line ${i + 1}: expected key=value, got "${line}"`);
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!schema.keys.includes(key)) {
      throw new Error(`line ${i + 1}: unknown key "${key}" (allowed: ${schema.keys.join(', ')})`);
    }
    if (key in values) throw new Error(`line ${i + 1}: "${key}" appears twice`);
    values[key] = value;
  });
  if ((values.note ?? '').length > NOTE_MAX) throw new Error(`note is longer than ${NOTE_MAX} characters`);
  if (!values.requested) throw new Error('requested=<UTC timestamp> is missing, e.g. requested=2026-10-09T15:30:00Z');
  if (!TIMESTAMP.test(values.requested)) {
    throw new Error(`requested must be a UTC timestamp like 2026-10-09T15:30:00Z (got "${values.requested}")`);
  }
  return schema.finish(values);
}

/** NAME=value lines for $GITHUB_ENV. */
export function toEnvLines(kind, request) {
  return SCHEMAS[kind].env(request);
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const [kind, file, flag] = process.argv.slice(2);
  if (!kind || !file) {
    console.error(`usage: node scripts/releaseRequest.mjs <${REQUEST_KINDS.join('|')}> <file> [--env]`);
    process.exit(1);
  }
  try {
    const request = parseRequest(kind, readFileSync(file, 'utf8'));
    if (flag === '--env') {
      if (request.note) console.error(`note: ${request.note}`);
      console.error(`requested: ${request.requested}`);
      for (const line of toEnvLines(kind, request)) console.log(line);
    } else {
      console.log(JSON.stringify(request));
    }
  } catch (err) {
    console.error(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
