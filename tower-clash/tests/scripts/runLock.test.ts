import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireRunLock, isLivePlaywrightPid, lockFileFor, releaseRunLock } from '../../e2e/tools/runLock';

/*
 * QA-28: playwright.config.ts takes e2e/tools/runLock.ts's lock on the run's output directory, so a
 * second run on the same directory fails fast naming PW_OUTPUT instead of deleting the first run's
 * artefacts (Day 32: three tests died with `ENOENT … .playwright-artifacts-N/….zip`). These tests run
 * the lock on a temp lock dir with injected pids; a stale lock (dead or recycled pid) must never block.
 */
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'runlock-'));
  dirs.push(d);
  return d;
}
const alive = (...pids: number[]) => (pid: number) => pids.includes(pid);

describe('e2e/tools/runLock.ts (QA-28)', () => {
  it('a free output dir is locked for the caller; the owner may take it again (the config loads more than once)', () => {
    const lockDir = tmp();
    const file = acquireRunLock('/x/test-results', { lockDir, pid: 101, isLive: alive(101) });
    expect(file).toBe(lockFileFor('/x/test-results', lockDir));
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ pid: 101, outputDir: '/x/test-results' });
    expect(acquireRunLock('/x/test-results', { lockDir, pid: 101, isLive: alive(101) })).toBe(file);
  });

  it('a second live run on the same dir fails fast, naming PW_OUTPUT, PW_PORT and the owner pid', () => {
    const lockDir = tmp();
    acquireRunLock('/x/test-results', { lockDir, pid: 101, isLive: alive(101, 202) });
    expect(() => acquireRunLock('/x/test-results', { lockDir, pid: 202, isLive: alive(101, 202) })).toThrow(/pid 101[\s\S]*PW_OUTPUT=[\s\S]*PW_PORT=/);
    // the refused run did not touch the owner's lock
    expect(JSON.parse(readFileSync(lockFileFor('/x/test-results', lockDir), 'utf8')).pid).toBe(101);
  });

  it('other output dirs are independent (a run with its own PW_OUTPUT is never refused)', () => {
    const lockDir = tmp();
    acquireRunLock('/x/test-results', { lockDir, pid: 101, isLive: alive(101, 202) });
    expect(() => acquireRunLock('/scratch/pw-qa', { lockDir, pid: 202, isLive: alive(101, 202) })).not.toThrow();
    expect(lockFileFor('/x/test-results', lockDir)).not.toBe(lockFileFor('/scratch/pw-qa', lockDir));
  });

  it('a stale lock (owner pid dead, e.g. a SIGKILLed run or a previous CI step) is taken over', () => {
    const lockDir = tmp();
    acquireRunLock('/x/test-results', { lockDir, pid: 101, isLive: alive(101) });
    const file = acquireRunLock('/x/test-results', { lockDir, pid: 202, isLive: alive(202) });
    expect(JSON.parse(readFileSync(file, 'utf8')).pid).toBe(202);
  });

  it('an unreadable lock file (half-written) is taken over', () => {
    const lockDir = tmp();
    const file = lockFileFor('/x/test-results', lockDir);
    acquireRunLock('/x/other', { lockDir, pid: 1, isLive: alive() }); // creates lockDir
    writeFileSync(file, '{"pid":');
    acquireRunLock('/x/test-results', { lockDir, pid: 202, isLive: alive(202) });
    expect(JSON.parse(readFileSync(file, 'utf8')).pid).toBe(202);
  });

  it('release drops only the caller own lock', () => {
    const lockDir = tmp();
    const file = acquireRunLock('/x/test-results', { lockDir, pid: 101, isLive: alive(101) });
    releaseRunLock('/x/test-results', { lockDir, pid: 202 });
    expect(existsSync(file)).toBe(true);
    releaseRunLock('/x/test-results', { lockDir, pid: 101 });
    expect(existsSync(file)).toBe(false);
  });

  it('liveness: a running process counts only while its command line names playwright (no pid-reuse misfire)', async () => {
    expect(isLivePlaywrightPid(0)).toBe(false);
    expect(isLivePlaywrightPid(2 ** 22 + 12_345)).toBe(false); // above Linux pid_max: no such process
    // this vitest worker is alive but not a Playwright run
    if (existsSync('/proc/self/cmdline')) expect(isLivePlaywrightPid(process.pid)).toBe(false);
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)', 'playwright', 'test'], { stdio: 'ignore' });
    try {
      await new Promise((resolve) => child.once('spawn', resolve));
      expect(isLivePlaywrightPid(child.pid!)).toBe(true);
    } finally {
      child.kill('SIGKILL');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    expect(isLivePlaywrightPid(child.pid!)).toBe(false);
  });
});
