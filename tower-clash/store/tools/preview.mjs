/**
 * The `vite preview` server of renderStoreShots.mjs (BUG-49), importable so it can be tested
 * without a real build (tests/release/renderStoreShotsServer.test.ts).
 *
 * BUG-49 (2026-10-15): the old start-up spawned `vite preview --port P --strictPort` and returned as
 * soon as `GET http://localhost:P/` answered. With P already taken, vite exited — but the poll had
 * reached the *other* process's server, and every frame was captured from whatever build that server
 * served (PUB-24's Google sets came from QA's e2e preview on 4190). `startPreview()` now:
 *
 *   1. probes the port before spawning (TCP connect on 127.0.0.1, ::1 and localhost): if anything
 *      answers it throws `PreviewError` code `PORT_BUSY` naming the port and `--port=<n>`, and spawns
 *      nothing — a foreign server is never adopted;
 *   2. waits for the child's own ready line (`Local:   http://localhost:P/`) instead of polling the URL;
 *      a child that exits first fails with its output (`CHILD_EXITED`), no line in time = `TIMEOUT`;
 *   3. fetches `/index.html` from the served origin(s) and compares it byte-for-byte with
 *      `<dist>/index.html`; a mismatch fails with "served build is not the requested dist"
 *      (`INDEX_MISMATCH`);
 *   4. kills the child on every failure path; on success the caller owns `stop()` / `killSync()`.
 *
 * Plain `node:http` / `node:net`, not the global `fetch`: in sandboxes that route Node's fetch
 * through an outbound proxy (`HTTPS_PROXY` set), `fetch('http://localhost:…')` fails while a plain
 * `http.get` — and Chromium — reach the preview server fine.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { get } from 'node:http';
import { connect } from 'node:net';
import { join, resolve } from 'node:path';

export class PreviewError extends Error {
  /** @param {'NO_DIST' | 'BAD_PORT' | 'PORT_BUSY' | 'CHILD_EXITED' | 'TIMEOUT' | 'INDEX_MISMATCH'} code */
  constructor(code, message) {
    super(message);
    this.name = 'PreviewError';
    this.code = code;
  }
}

/**
 * The build directory to serve: `--dist=<dir>` wins over `PW_DIST`; without either, `<root>/dist`
 * only when it holds a build (`index.html`). Throws `NO_DIST` otherwise, with the hint to pass `--dist`.
 */
export function resolveDist({ root, distArg, envDist }) {
  const given = distArg || envDist;
  if (given) {
    const dir = resolve(given);
    const from = distArg ? `--dist=${distArg}` : `PW_DIST=${envDist}`;
    if (!existsSync(join(dir, 'index.html'))) throw new PreviewError('NO_DIST', `${dir}/index.html missing (${from}) — build into that directory first (\`npx vite build --outDir ${dir}\`)`);
    return dir;
  }
  const dir = join(root, 'dist');
  if (!existsSync(join(dir, 'index.html'))) {
    throw new PreviewError('NO_DIST', `no --dist given and ${dir} holds no build (index.html missing): run \`npm run build\`, or build a snapshot with \`npx vite build --outDir <dir>\` and pass --dist=<dir>`);
  }
  return dir;
}

/** Resolves to `true` when a TCP connection to host:port is accepted (something listens there). */
const tcpAnswers = (host, port, timeoutMs = 1000) =>
  new Promise((done) => {
    const sock = connect({ host, port });
    const finish = (v) => {
      sock.destroy();
      done(v);
    };
    sock.setTimeout(timeoutMs, () => finish(false));
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false)); // ECONNREFUSED, or no IPv6 (EADDRNOTAVAIL / EAFNOSUPPORT)
  });

/** The addresses that answer on `port` (`[]` = free). `localhost` covers whatever the resolver picks first, as Chromium and `http.get` would. */
export async function portListeners(port) {
  const hosts = ['127.0.0.1', '::1', 'localhost'];
  const hits = await Promise.all(hosts.map((h) => tcpAnswers(h, port)));
  return hosts.filter((_, i) => hits[i]);
}

/** GET → `{ status, body }` (Buffer); rejects on a connection error or after `timeoutMs`. */
export const httpGet = (url, timeoutMs = 5000) =>
  new Promise((done, fail) => {
    const req = get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => done({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
      res.on('error', fail);
    });
    req.on('error', fail);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`GET ${url} timed out after ${timeoutMs} ms`)));
  });

const ANSI = /\u001b\[[0-9;]*m/g;

/**
 * Starts `vite preview` for `dist` on `port` and resolves once it is verifiably serving that build.
 *
 * @param {object} o
 * @param {string} o.root     project root (cwd of the child, home of node_modules/vite)
 * @param {string} o.dist     build directory (must contain index.html)
 * @param {number} o.port
 * @param {number} [o.timeoutMs=30000]  how long to wait for the ready line
 * @param {string} [o.viteBin]          the vite CLI script (tests pass a stand-in); default `<root>/node_modules/vite/bin/vite.js`
 * @returns {Promise<{ child: import('node:child_process').ChildProcess, url: string, stop: () => Promise<void>, killSync: () => void, output: () => string }>}
 */
export async function startPreview({ root, dist, port, timeoutMs = 30_000, viteBin }) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new PreviewError('BAD_PORT', `invalid port ${port} — pass a free port with --port=<n>`);
  const indexFile = join(dist, 'index.html');
  if (!existsSync(indexFile)) throw new PreviewError('NO_DIST', `${indexFile} missing — build first, or pass --dist=<dir>`);
  const expected = readFileSync(indexFile);

  // 1. never adopt a foreign server
  const busy = await portListeners(port);
  if (busy.length) {
    throw new PreviewError(
      'PORT_BUSY',
      `port ${port} is already in use (a server answers on ${busy.map((h) => (h.includes(':') ? `[${h}]` : h)).join(', ')}:${port}) — ` +
        `refusing to render from a server this tool did not start; stop it or pass a free port with --port=<n>`,
    );
  }

  // 2. spawn and wait for the child's own "Local:" line
  const vite = viteBin ?? join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(port), '--strictPort', '--outDir', dist], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  let stderr = '';
  const killSync = () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  };
  const stop = () =>
    new Promise((done) => {
      if (child.exitCode !== null || child.signalCode !== null) return done();
      const hard = setTimeout(() => child.kill('SIGKILL'), 3000);
      child.once('exit', () => {
        clearTimeout(hard);
        done();
      });
      child.kill('SIGTERM');
    });

  let url;
  try {
    url = await new Promise((done, fail) => {
      let out = '';
      const timer = setTimeout(() => fail(new PreviewError('TIMEOUT', `vite preview printed no "Local:" line for port ${port} within ${timeoutMs / 1000} s:\n${log}`)), timeoutMs);
      const onData = (d) => {
        out += d;
        const m = out.replace(ANSI, '').match(/Local:\s+(https?:\/\/[^\s/]+:(\d+))\/?/);
        if (!m) return;
        clearTimeout(timer);
        if (Number(m[2]) !== port) fail(new PreviewError('CHILD_EXITED', `vite preview reports ${m[1]}, not port ${port}:\n${log}`));
        else done(m[1]);
      };
      child.stdout.on('data', (d) => {
        log += d;
        onData(d);
      });
      child.stderr.on('data', (d) => {
        log += d;
        stderr += d;
      });
      child.once('error', (e) => {
        clearTimeout(timer);
        fail(new PreviewError('CHILD_EXITED', `vite preview could not be started: ${e.message}`));
      });
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        fail(new PreviewError('CHILD_EXITED', `vite preview exited (${signal ?? `code ${code}`}) before it was ready on port ${port}:\n${stderr || log}`));
      });
    });

    // 3. the served index.html must be the requested dist's, byte for byte — from the origin the
    //    child printed and from http://localhost:P, the origin the pages load
    const origins = [...new Set([url, `http://localhost:${port}`])];
    for (const origin of origins) {
      let got;
      try {
        got = await httpGet(`${origin}/index.html`);
      } catch (e) {
        throw new PreviewError('INDEX_MISMATCH', `served build is not the requested dist: GET ${origin}/index.html failed (${e.message})`);
      }
      if (got.status !== 200 || !got.body.equals(expected)) {
        throw new PreviewError(
          'INDEX_MISMATCH',
          `served build is not the requested dist: ${origin}/index.html (HTTP ${got.status}, ${got.body.length} bytes) differs from ${indexFile} (${expected.length} bytes)`,
        );
      }
    }
  } catch (e) {
    await stop();
    throw e;
  }
  return { child, url: `http://localhost:${port}/`, stop, killSync, output: () => log };
}
