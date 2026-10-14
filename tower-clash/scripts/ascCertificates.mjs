#!/usr/bin/env node
/**
 * App Store Connect API — certificate housekeeping for the iOS release lane (BUG-45, 2026-10-14).
 *
 * Every run of tower-clash-ios-release.yml on a fresh macOS runner lets Xcode's cloud signing create a
 * new *Apple Development* certificate (the runner's keychain is empty, the private key dies with the
 * runner). Apple caps those per account: run 17 (build 16) failed in the archive step with
 * "Choose a certificate to revoke. Your account has reached the maximum number of certificates" and
 * "No profiles for 'com.pervincinal.towerclash' were found". Nobody on this team develops with Xcode,
 * so every DEVELOPMENT certificate on the account is a CI leftover. This script lists them through the
 * App Store Connect API (the same key the lane already holds) and revokes them before the archive;
 * DISTRIBUTION certificates (the cloud-managed one the export uses) are never touched.
 *
 *   node scripts/ascCertificates.mjs revoke-development [--dry-run]
 *     env: APP_STORE_CONNECT_API_KEY_ID, APP_STORE_CONNECT_API_ISSUER_ID, API_KEY_PATH (the .p8 file)
 *   node scripts/ascCertificates.mjs list
 *
 * Exit 0 after revoking (or on a 403 — the key's role cannot manage certificates: a warning names the
 * fix, the archive then fails by itself if the cap is really hit); exit 1 on other API errors.
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ASC_API = 'https://api.appstoreconnect.apple.com/v1';
const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** ES256 JWT for the App Store Connect API (kid = key id, iss = issuer id, 10-minute lifetime). */
export function makeJwt({ keyId, issuerId, privateKeyPem, now = Math.floor(Date.now() / 1000) }) {
  if (!keyId || !issuerId || !privateKeyPem) throw new Error('makeJwt: keyId, issuerId and privateKeyPem are required');
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = { iss: issuerId, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = createPrivateKey(privateKeyPem);
  const signature = sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
  return `${data}.${b64url(signature)}`;
}

/** Every certificate of `type` (DEVELOPMENT / DISTRIBUTION / …), following pagination. */
export async function listCertificates({ fetchFn = fetch, jwt, type }) {
  const out = [];
  let url = `${ASC_API}/certificates?filter[certificateType]=${encodeURIComponent(type)}&limit=200`;
  while (url) {
    const res = await fetchFn(url, { headers: { Authorization: `Bearer ${jwt}` } });
    if (!res.ok) throw new AscError(res.status, `GET certificates → ${res.status} ${await safeText(res)}`);
    const body = await res.json();
    for (const c of body.data ?? []) out.push({ id: c.id, ...(c.attributes ?? {}) });
    url = body.links?.next ?? null;
  }
  return out;
}

/**
 * Revokes every DEVELOPMENT certificate (double-checked on the attribute, never another type).
 * Returns { revoked, skipped, dryRun }.
 */
export async function revokeDevelopmentCertificates({ fetchFn = fetch, jwt, dryRun = false, log = console.log }) {
  const all = await listCertificates({ fetchFn, jwt, type: 'DEVELOPMENT' });
  const dev = all.filter((c) => c.certificateType === 'DEVELOPMENT');
  const skipped = all.length - dev.length;
  if (dev.length === 0) {
    log('No Apple Development certificates on the account — nothing to revoke.');
    return { revoked: 0, skipped, dryRun };
  }
  let revoked = 0;
  for (const c of dev) {
    const label = `${c.displayName ?? c.name ?? '?'} (${c.id}, expires ${c.expirationDate ?? '?'})`;
    if (dryRun) {
      log(`would revoke: ${label}`);
      continue;
    }
    const res = await fetchFn(`${ASC_API}/certificates/${encodeURIComponent(c.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${jwt}` } });
    if (!res.ok && res.status !== 404) throw new AscError(res.status, `DELETE certificate ${c.id} → ${res.status} ${await safeText(res)}`);
    revoked++;
    log(`revoked: ${label}`);
  }
  log(dryRun ? `dry run: ${dev.length} Apple Development certificate(s) would be revoked` : `revoked ${revoked} Apple Development certificate(s)`);
  return { revoked, skipped, dryRun };
}

export class AscError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 400);
  } catch {
    return '';
  }
}

function jwtFromEnv(env = process.env) {
  const keyId = env.APP_STORE_CONNECT_API_KEY_ID;
  const issuerId = env.APP_STORE_CONNECT_API_ISSUER_ID;
  const keyPath = env.API_KEY_PATH;
  if (!keyId || !issuerId || !keyPath) {
    throw new Error('APP_STORE_CONNECT_API_KEY_ID, APP_STORE_CONNECT_API_ISSUER_ID and API_KEY_PATH must be set');
  }
  return makeJwt({ keyId, issuerId, privateKeyPem: readFileSync(keyPath, 'utf8') });
}

async function main(argv) {
  const [command, ...rest] = argv;
  const dryRun = rest.includes('--dry-run');
  if (command === 'list') {
    const jwt = jwtFromEnv();
    for (const type of ['DEVELOPMENT', 'DISTRIBUTION']) {
      const certs = await listCertificates({ jwt, type });
      console.log(`${type}: ${certs.length}`);
      for (const c of certs) console.log(`  ${c.displayName ?? c.name} (${c.id}, expires ${c.expirationDate})`);
    }
    return 0;
  }
  if (command === 'revoke-development') {
    try {
      await revokeDevelopmentCertificates({ jwt: jwtFromEnv(), dryRun });
      return 0;
    } catch (e) {
      if (e instanceof AscError && e.status === 403) {
        console.log(`::warning title=certificates::The App Store Connect API key may not manage certificates (403) — give it the Admin role or revoke the old Apple Development certificates at developer.apple.com → Certificates. ${e.message}`);
        return 0;
      }
      throw e;
    }
  }
  console.error('usage: ascCertificates.mjs list | revoke-development [--dry-run]');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`::error title=certificates::${e.message}`);
      process.exit(1);
    },
  );
}
