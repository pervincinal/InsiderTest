import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as createTcpServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { PreviewError, portListeners, resolveDist, startPreview } from '../../store/tools/preview.mjs';

/*
 * BUG-49: store/tools/renderStoreShots.mjs rendered from a *foreign* preview server when its port was
 * taken (2026-10-15: PUB-24's Google sets were served by QA's e2e preview on 4190). The guards live in
 * store/tools/preview.mjs: refuse a busy port before spawning, wait for the child's own "Local:" line,
 * compare the served index.html with <dist>/index.html, stop the child on every failure.
 *
 * Hermetic: no vite, no build. A stand-in "vite" script (same argv: `preview --port P --strictPort
 * --outDir DIST`) prints vite's ready line and serves a fixed index, and writes a marker file when it
 * is launched, so "spawns nothing" is observable.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TOOL = join(ROOT, 'store/tools/renderStoreShots.mjs');
const dirs: string[] = [];
const servers: Server[] = [];
const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  for (const s of servers.splice(0)) await new Promise((r) => s.close(r));
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'bug49-'));
  dirs.push(d);
  return d;
}

const INDEX = '<!doctype html><html><head><script type="module" src="./assets/index-AbCdEf12.js"></script></head><body></body></html>\n';

/** A fake build: just the index.html the guard compares. */
function fakeDist(root: string, index = INDEX): string {
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), index);
  return dist;
}

type Mode = 'serve' | 'serve-other' | 'crash' | 'silent';

/** Writes a stand-in for vite's CLI; returns its path and the marker it writes when launched. */
function fakeVite(dir: string, mode: Mode): { bin: string; marker: string } {
  const bin = join(dir, `fake-vite-${mode}.mjs`);
  const marker = join(dir, `fake-vite-${mode}.launched`);
  writeFileSync(
    bin,
    `import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const a = process.argv.slice(2);
const port = Number(a[a.indexOf('--port') + 1]);
const dist = a[a.indexOf('--outDir') + 1];
writeFileSync(${JSON.stringify(marker)}, String(process.pid));
const mode = ${JSON.stringify(mode)};
if (mode === 'crash') {
  process.stderr.write('error: Port ' + port + ' is in use (fake)\\n');
  process.exit(1);
}
if (mode === 'silent') setInterval(() => {}, 1000);
else {
  const body = mode === 'serve-other' ? '<!doctype html><title>another build</title>\\n' : readFileSync(join(dist, 'index.html'));
  createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(body);
  }).listen(port, () => console.log('  \\u001b[32m\\u279c\\u001b[39m  \\u001b[1mLocal\\u001b[22m:   \\u001b[36mhttp://localhost:\\u001b[1m' + port + '\\u001b[22m/\\u001b[39m'));
}
`,
  );
  return { bin, marker };
}

/** A port nobody listens on (bound and released). */
async function freePort(): Promise<number> {
  const s = createTcpServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address() as AddressInfo;
  await new Promise((r) => s.close(r));
  return port;
}

/** The "foreign" preview: an HTTP server on 127.0.0.1 holding a port. */
async function foreignServer(): Promise<number> {
  const s = createServer((_req, res) => res.end('<!doctype html><title>QA e2e preview</title>'));
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  return (s.address() as AddressInfo).port;
}

async function rejection(p: Promise<unknown>): Promise<PreviewError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(PreviewError);
    return e as PreviewError;
  }
  throw new Error('expected startPreview to fail');
}

describe('store/tools/preview.mjs — startPreview guards (BUG-49)', () => {
  it('refuses a port a foreign server already answers on, names the port and --port, and spawns nothing', async () => {
    const t = tmp();
    const dist = fakeDist(t);
    const vite = fakeVite(t, 'serve');
    const port = await foreignServer();
    const e = await rejection(startPreview({ root: t, dist, port, viteBin: vite.bin }));
    expect(e.code).toBe('PORT_BUSY');
    expect(e.message).toContain(`port ${port} is already in use`);
    expect(e.message).toContain('--port=<n>');
    expect(existsSync(vite.marker)).toBe(false);
  });

  it('also refuses a port held by a plain TCP listener (not HTTP)', async () => {
    const t = tmp();
    const vite = fakeVite(t, 'serve');
    const s = createTcpServer((sock) => sock.destroy());
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
    const { port } = s.address() as AddressInfo;
    try {
      expect(await portListeners(port)).toContain('127.0.0.1');
      const e = await rejection(startPreview({ root: t, dist: fakeDist(t), port, viteBin: vite.bin }));
      expect(e.code).toBe('PORT_BUSY');
      expect(existsSync(vite.marker)).toBe(false);
    } finally {
      await new Promise((r) => s.close(r));
    }
  });

  it('starts on a free port: waits for the child\'s own "Local:" line, verifies index.html, stop() frees the port', async () => {
    const t = tmp();
    const dist = fakeDist(t);
    const vite = fakeVite(t, 'serve');
    const port = await freePort();
    const p = await startPreview({ root: t, dist, port, viteBin: vite.bin });
    stops.push(p.stop);
    expect(p.url).toBe(`http://localhost:${port}/`);
    expect(existsSync(vite.marker)).toBe(true);
    expect(p.child.exitCode).toBeNull();
    await p.stop();
    expect(p.child.exitCode !== null || p.child.signalCode !== null).toBe(true);
    expect(await portListeners(port)).toEqual([]);
  });

  it('fails when the served index.html is not the requested dist\'s, and kills the child', async () => {
    const t = tmp();
    const dist = fakeDist(t);
    const vite = fakeVite(t, 'serve-other');
    const port = await freePort();
    const e = await rejection(startPreview({ root: t, dist, port, viteBin: vite.bin }));
    expect(e.code).toBe('INDEX_MISMATCH');
    expect(e.message).toContain('served build is not the requested dist');
    expect(existsSync(vite.marker)).toBe(true);
    expect(await portListeners(port)).toEqual([]);
  });

  it('a one-byte difference is a mismatch (byte-for-byte, not "looks like a Tower Clash page")', async () => {
    const t = tmp();
    const port = await freePort();
    // the child serves another build's index.html, one trailing newline longer than the requested dist's
    const served = fakeDist(join(t, 'served'));
    const requested = fakeDist(join(t, 'requested'), INDEX.trimEnd());
    const e = await rejection(startPreview({ root: t, dist: requested, port, viteBin: fakeViteServing(t, join(served, 'index.html')) }));
    expect(e.code).toBe('INDEX_MISMATCH');
    expect(e.message).toContain(`(HTTP 200, ${INDEX.length} bytes) differs from`);
  });

  it('fails with the child\'s stderr when it exits before its ready line', async () => {
    const t = tmp();
    const vite = fakeVite(t, 'crash');
    const port = await freePort();
    const e = await rejection(startPreview({ root: t, dist: fakeDist(t), port, viteBin: vite.bin }));
    expect(e.code).toBe('CHILD_EXITED');
    expect(e.message).toContain(`Port ${port} is in use (fake)`);
  });

  it('times out (and kills the child) when no ready line comes', async () => {
    const t = tmp();
    const vite = fakeVite(t, 'silent');
    const port = await freePort();
    const e = await rejection(startPreview({ root: t, dist: fakeDist(t), port, viteBin: vite.bin, timeoutMs: 800 }));
    expect(e.code).toBe('TIMEOUT');
    expect(existsSync(vite.marker)).toBe(true);
  });
});

/** A stand-in that serves one fixed file as /index.html whatever --outDir says. */
function fakeViteServing(dir: string, file: string): string {
  const bin = join(dir, 'fake-vite-fixed.mjs');
  writeFileSync(
    bin,
    `import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const a = process.argv.slice(2);
const port = Number(a[a.indexOf('--port') + 1]);
const body = readFileSync(${JSON.stringify(file)});
createServer((req, res) => res.end(body)).listen(port, () => console.log('  Local:   http://localhost:' + port + '/'));
`,
  );
  return bin;
}

describe('store/tools/preview.mjs — resolveDist (BUG-49)', () => {
  it('defaults to <root>/dist only when it holds a build', () => {
    const t = tmp();
    expect(() => resolveDist({ root: t })).toThrow(/no --dist given .*pass --dist=<dir>/);
    const dist = fakeDist(t);
    expect(resolveDist({ root: t })).toBe(dist);
  });

  it('--dist wins over PW_DIST and must hold index.html', () => {
    const t = tmp();
    const a = fakeDist(join(t, 'a'));
    const b = fakeDist(join(t, 'b'));
    expect(resolveDist({ root: t, distArg: a, envDist: b })).toBe(a);
    expect(resolveDist({ root: t, envDist: b })).toBe(b);
    expect(() => resolveDist({ root: t, distArg: join(t, 'missing') })).toThrow(/index\.html missing \(--dist=/);
  });
});

describe('store/tools/renderStoreShots.mjs CLI (BUG-49)', () => {
  /** Runs the real CLI asynchronously (the foreign server lives in this process and must keep answering). */
  const cli = (argv: string[]) =>
    new Promise<{ status: number | null; stderr: string }>((done) => {
      const child = spawn(process.execPath, [TOOL, ...argv], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, PW_DIST: '', PW_OUTPUT: '', PW_PORT: '' } });
      let stderr = '';
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      child.on('close', (status) => done({ status, stderr }));
    });

  it('exits 1 with the busy-port error and writes nothing when the port is taken', async () => {
    const t = tmp();
    const port = await foreignServer();
    const out = join(t, 'out');
    const r = await cli(['--google', '--no-feature', `--dist=${fakeDist(t)}`, `--port=${port}`, `--out=${out}`]);
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain(`port ${port} is already in use`);
    expect(r.stderr).toContain('--port=<n>');
    expect(existsSync(out)).toBe(false);
  });

  it('exits 1 with the --dist hint when the given dist holds no build', async () => {
    const t = tmp();
    const r = await cli(['--google', '--no-feature', `--dist=${join(t, 'nothing')}`, `--port=${await freePort()}`, `--out=${join(t, 'out')}`]);
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain('index.html missing (--dist=');
  });
});
