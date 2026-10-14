import { generateKeyPairSync, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM script without types
import { ASC_API, AscError, listCertificates, makeJwt, revokeDevelopmentCertificates } from '../../scripts/ascCertificates.mjs';

/*
 * BUG-45 (2026-10-14): run 17 of the iOS release lane died in the archive step with "Your account has
 * reached the maximum number of certificates" — every run's cloud signing had left an Apple Development
 * certificate behind. scripts/ascCertificates.mjs revokes them through the App Store Connect API before
 * the archive. These tests pin the JWT shape, the type guard (never a DISTRIBUTION certificate), the
 * dry run and the error paths with a fake fetch; the workflow step is checked to exist.
 */
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function b64urlJson(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

type Call = { url: string; method: string };
function fakeFetch(certs: { id: string; type: string; name: string }[], opts: { deleteStatus?: number; listStatus?: number } = {}) {
  const calls: Call[] = [];
  const fetchFn = async (url: string, init?: { method?: string; headers?: Record<string, string> }): Promise<Response> => {
    calls.push({ url, method: init?.method ?? 'GET' });
    expect(init?.headers?.Authorization).toMatch(/^Bearer /);
    if ((init?.method ?? 'GET') === 'GET') {
      if (opts.listStatus) return new Response('nope', { status: opts.listStatus });
      const type = new URL(url).searchParams.get('filter[certificateType]');
      const data = certs.filter((c) => c.type === type || c.type === 'MISLABELLED').map((c) => ({
        id: c.id,
        attributes: { certificateType: c.type === 'MISLABELLED' ? 'DISTRIBUTION' : c.type, displayName: c.name, expirationDate: '2027-10-14T00:00:00Z' },
      }));
      return new Response(JSON.stringify({ data, links: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('', { status: opts.deleteStatus ?? 200 }); // 204 is what Apple sends; undici's Response constructor refuses a null-body status here
  };
  return { fetchFn, calls };
}

describe('scripts/ascCertificates.mjs (BUG-45)', () => {
  it('makes an ES256 JWT the App Store Connect API accepts: kid / iss / aud / 10-minute exp, signature verifies', () => {
    const jwt: string = makeJwt({ keyId: 'ABC123DEF4', issuerId: '11111111-2222-3333-4444-555555555555', privateKeyPem: pem, now: 1_000_000 });
    const [h, p, s] = jwt.split('.');
    expect(b64urlJson(h!)).toEqual({ alg: 'ES256', kid: 'ABC123DEF4', typ: 'JWT' });
    expect(b64urlJson(p!)).toEqual({ iss: '11111111-2222-3333-4444-555555555555', iat: 1_000_000, exp: 1_000_600, aud: 'appstoreconnect-v1' });
    const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key: publicPem, dsaEncoding: 'ieee-p1363' }, Buffer.from(s!, 'base64url'));
    expect(ok).toBe(true);
    expect(() => makeJwt({ keyId: '', issuerId: 'x', privateKeyPem: pem })).toThrow(/required/);
  });

  it('revokes every DEVELOPMENT certificate and nothing else — a DISTRIBUTION one that slipped into the list is skipped', async () => {
    const { fetchFn, calls } = fakeFetch([
      { id: 'dev1', type: 'DEVELOPMENT', name: 'Apple Development: GitHub runner' },
      { id: 'dev2', type: 'DEVELOPMENT', name: 'Apple Development: GitHub runner' },
      { id: 'dist', type: 'MISLABELLED', name: 'Apple Distribution: Parvin Yusifli' },
      { id: 'dist2', type: 'DISTRIBUTION', name: 'Apple Distribution: cloud' },
    ]);
    const log: string[] = [];
    const r = await revokeDevelopmentCertificates({ fetchFn, jwt: 'j', log: (m: string) => log.push(m) });
    expect(r).toEqual({ revoked: 2, skipped: 1, dryRun: false });
    const deletes = calls.filter((c) => c.method === 'DELETE').map((c) => c.url);
    expect(deletes).toEqual([`${ASC_API}/certificates/dev1`, `${ASC_API}/certificates/dev2`]);
    expect(calls[0]!.url).toContain('filter[certificateType]=DEVELOPMENT');
    expect(log.join('\n')).toContain('revoked 2 Apple Development certificate(s)');
  });

  it('dry run lists and deletes nothing; an empty account is a no-op', async () => {
    const a = fakeFetch([{ id: 'dev1', type: 'DEVELOPMENT', name: 'x' }]);
    const r = await revokeDevelopmentCertificates({ fetchFn: a.fetchFn, jwt: 'j', dryRun: true, log: () => {} });
    expect(r).toEqual({ revoked: 0, skipped: 0, dryRun: true });
    expect(a.calls.some((c) => c.method === 'DELETE')).toBe(false);
    const b = fakeFetch([]);
    expect(await revokeDevelopmentCertificates({ fetchFn: b.fetchFn, jwt: 'j', log: () => {} })).toEqual({ revoked: 0, skipped: 0, dryRun: false });
  });

  it('API errors carry the status: 403 (key role cannot manage certificates) and a failed DELETE', async () => {
    const a = fakeFetch([], { listStatus: 403 });
    await expect(listCertificates({ fetchFn: a.fetchFn, jwt: 'j', type: 'DEVELOPMENT' })).rejects.toMatchObject({ status: 403 });
    const b = fakeFetch([{ id: 'dev1', type: 'DEVELOPMENT', name: 'x' }], { deleteStatus: 409 });
    await expect(revokeDevelopmentCertificates({ fetchFn: b.fetchFn, jwt: 'j', log: () => {} })).rejects.toBeInstanceOf(AscError);
  });

  it('the release workflow revokes stale Development certificates before the archive, in automatic signing only', () => {
    const yml = readFileSync(fileURLToPath(new URL('../../../.github/workflows/tower-clash-ios-release.yml', import.meta.url)), 'utf8');
    const step = yml.indexOf('Revoke stale Apple Development certificates');
    expect(step).toBeGreaterThan(yml.indexOf('Install App Store Connect API key'));
    expect(step).toBeLessThan(yml.indexOf('Archive (Release, generic iOS device)'));
    const block = yml.slice(step, yml.indexOf('- name:', step + 10));
    expect(block).toContain("if: env.SIGNING_MODE == 'automatic'");
    expect(block).toContain('node scripts/ascCertificates.mjs revoke-development');
  });
});
