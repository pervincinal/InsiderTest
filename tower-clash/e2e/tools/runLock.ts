/*
 * QA-28: one Playwright run per output directory on a shared checkout.
 *
 * Day 32 (2026-10-17): the chromium, pwa and WebView runs were started in parallel with no
 * `PW_OUTPUT`, so all three wrote to `test-results/`; each run's "clear output" step deletes its
 * project's outputDir before any test runs, and three tests of the other runs died with
 * `ENOENT … test-results/.playwright-artifacts-N/….zip` (their trace being written into a folder
 * that had just been removed). playwright.config.ts now takes a lock on the run's resolved output
 * directory while it loads, in the runner process only, and refuses to start — naming `PW_OUTPUT` —
 * while another live run holds the lock on the same directory.
 *
 * Why at config load and outside the output directory: Playwright runs its tasks in the order
 * config → "clear output" → web server → globalSetup → tests → globalTeardown. A marker written by a
 * globalSetup inside test-results/ would be deleted by the next run's "clear output" before that run
 * could read it, and is absent itself for the whole web-server start (the snapshot copy, up to 40 s)
 * — exactly when parallel runs collide. So the lock is a small JSON file under the OS temp dir, keyed
 * by the output directory's absolute path, taken with an exclusive create (`wx`) so two runs that
 * start in the same instant cannot both win, and released on the runner's `exit`.
 *
 * Stale locks never block: a run killed with SIGKILL leaves its file, and the next run takes it over
 * when the recorded pid is dead — or alive but no longer a Playwright process (pid reuse; checked via
 * /proc/<pid>/cmdline where it exists). CI runs one Playwright invocation at a time per checkout and
 * runner, so it only ever meets its own or a stale lock.
 */
import { mkdirSync, openSync, readFileSync, rmSync, writeSync, closeSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export interface RunLockOwner {
  pid: number;
  outputDir: string;
  startedAt: string;
  argv: string;
}

export interface RunLockOptions {
  /** Directory the lock files live in (default: `<os tmpdir>/tower-clash-e2e/locks`). */
  lockDir?: string;
  /** This process's pid (tests inject it). */
  pid?: number;
  /** Liveness probe for a recorded owner (tests inject it). */
  isLive?: (pid: number) => boolean;
}

export const DEFAULT_LOCK_DIR = path.join(os.tmpdir(), 'tower-clash-e2e', 'locks');

/** The lock file for an output directory: one per absolute path. */
export function lockFileFor(outputDir: string, lockDir = DEFAULT_LOCK_DIR): string {
  const key = createHash('sha1').update(path.resolve(outputDir)).digest('hex').slice(0, 16);
  return path.join(lockDir, `run-${key}.json`);
}

/**
 * True while `pid` is a running process that can be a Playwright run: `kill(pid, 0)` succeeds (or is
 * refused with EPERM, i.e. the process exists), and — where /proc exists — its command line mentions
 * playwright, so a pid recycled by an unrelated process does not count.
 */
export function isLivePlaywrightPid(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EPERM') return false;
  }
  const cmdline = `/proc/${pid}/cmdline`;
  if (!existsSync('/proc/self/cmdline')) return true;
  try {
    return /playwright/i.test(readFileSync(cmdline, 'utf8'));
  } catch {
    return false;
  }
}

function readOwner(file: string): RunLockOwner | null {
  try {
    const owner = JSON.parse(readFileSync(file, 'utf8')) as RunLockOwner;
    return Number.isInteger(owner.pid) ? owner : null;
  } catch {
    return null; // half-written or unreadable: treated as stale
  }
}

/** The message a refused run fails with. */
export function lockedMessage(outputDir: string, owner: RunLockOwner, file: string): string {
  return [
    `e2e: another Playwright run (pid ${owner.pid}, started ${owner.startedAt}) is writing to ${path.resolve(outputDir)}.`,
    `Parallel runs clobber each other's artefacts there (ENOENT … .playwright-artifacts-N/….zip, QA-28).`,
    `Give this run its own output directory and port, e.g. PW_OUTPUT=<scratch>/pw-<name> PW_PORT=<free port> npx playwright test …`,
    `(owner: ${owner.argv}; lock: ${file} — removed when that run exits, ignored once its pid is gone)`,
  ].join('\n');
}

/**
 * Take the lock on `outputDir` for this process or throw `lockedMessage`. Idempotent for the owner
 * (the config may be evaluated more than once in the runner). Returns the lock file path.
 */
export function acquireRunLock(outputDir: string, options: RunLockOptions = {}): string {
  const lockDir = options.lockDir ?? DEFAULT_LOCK_DIR;
  const pid = options.pid ?? process.pid;
  const isLive = options.isLive ?? isLivePlaywrightPid;
  const file = lockFileFor(outputDir, lockDir);
  mkdirSync(lockDir, { recursive: true });
  const me: RunLockOwner = { pid, outputDir: path.resolve(outputDir), startedAt: new Date().toISOString(), argv: process.argv.slice(1).join(' ') };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = openSync(file, 'wx');
      try {
        writeSync(fd, JSON.stringify(me));
      } finally {
        closeSync(fd);
      }
      return file;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    const owner = readOwner(file);
    if (owner?.pid === pid) return file;
    if (owner && isLive(owner.pid)) throw new Error(lockedMessage(outputDir, owner, file));
    rmSync(file, { force: true }); // stale (dead pid, recycled pid, or unreadable): take it over
  }
  throw new Error(`e2e: could not take the run lock ${file} (another run keeps re-creating it?)`);
}

/** Drop the lock if this process holds it (never another run's). */
export function releaseRunLock(outputDir: string, options: Pick<RunLockOptions, 'lockDir' | 'pid'> = {}): void {
  const file = lockFileFor(outputDir, options.lockDir ?? DEFAULT_LOCK_DIR);
  if (readOwner(file)?.pid === (options.pid ?? process.pid)) rmSync(file, { force: true });
}
