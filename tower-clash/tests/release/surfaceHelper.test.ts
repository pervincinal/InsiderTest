import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readWorkflow, stepRun } from '../workflowYaml';

/*
 * QA-19: the MM-14 `surface` helper of tower-clash-ios-release.yml is the team's only window into
 * a failed iOS build (the GitHub proxy blocks job logs; check-run annotations are readable). A
 * broken helper would hide the next failure, so this runs the workflow's own step text with bash:
 * the "Define the log-surfacing helper" step writes $RUNNER_TEMP/surface.sh, then small callers
 * source it the way the archive / export / validate / upload steps do.
 *
 * Every case runs under both shells GitHub may use for a step: `bash -e {0}` (no `shell:` key —
 * what the workflow uses today) and `bash --noprofile --norc -eo pipefail {0}` (`shell: bash`).
 * BUG-28: under pipefail the old helper died on its own grep when no line matched, before the log
 * tail and the final ::error::, and returned 1 instead of the command's exit code.
 * BUG-29: GitHub keeps 10 error annotations per step; the helper emits at most 8 error lines so
 * its final ::error:: and the archive step's "Register one device" hint always survive.
 * BUG-30: altool writes `ERROR:` and `VERIFY FAILED`, which the case-sensitive `error:` pattern
 * missed — the failed validate run of 09d90f1 had no error annotation, only the log tail.
 */

const HAS_BASH = spawnSync('bash', ['-c', 'exit 0']).status === 0;
const SHELLS: [string, string[]][] = [
  ['bash -e (default shell)', ['-e']],
  ['bash -eo pipefail (shell: bash)', ['--noprofile', '--norc', '-eo', 'pipefail']],
];
const HELPER_STEP = 'Define the log-surfacing helper';
const NO_PROFILES = "error: No profiles for 'x' were found";
const ARCHIVE_FAILED = '** ARCHIVE FAILED **';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Result = { status: number | null; stdout: string; stderr: string; temp: string };

/** The first lines of altool's output in the failed "Validate with altool" step of 09d90f1 (2026-10-09), from its log-tail annotation. */
const ALTOOL_OUT = [
  "Running altool at path '/Applications/Xcode_26.6.app/Contents/SharedFrameworks/ContentDelivery.framework/Resources/altool'...",
  '2026-10-09 22:09:26.518 ERROR: [ContentDelivery.Uploader.7C8C2C500] ',
  '======================================= VERIFY FAILED with 2 errors =======================================',
  '2026-10-09 22:09:26.526 ERROR: [altool.7C8C2C500] Invalid Signature. Code failed to satisfy specified code requirement(s). The file at path “App.app/Frameworks/UserMessagingPlatform.framework/UserMessagingPlatform” is not properly signed. (90035)',
].join('\n');

/** Writes surface.sh into a fresh RUNNER_TEMP with the workflow's step, then runs `body` after sourcing it (`input` → $RUNNER_TEMP/altool.out). */
function runWithHelper(flags: string[], body: string, input?: string): Result {
  const temp = mkdtempSync(join(tmpdir(), 'qa19-runner-temp-'));
  dirs.push(temp);
  if (input !== undefined) writeFileSync(join(temp, 'altool.out'), `${input}\n`);
  const env = { ...process.env, RUNNER_TEMP: temp, LC_ALL: 'C.UTF-8' };
  const define = spawnSync('bash', [...flags, '-c', stepRun(readWorkflow('tower-clash-ios-release.yml'), HELPER_STEP)], { encoding: 'utf8', env });
  expect(define.stderr).toBe('');
  expect(define.status).toBe(0);
  expect(define.stdout).toBe('surface helper written\n');
  expect(existsSync(join(temp, 'surface.sh'))).toBe(true);
  const r = spawnSync('bash', [...flags, '-c', `source "$RUNNER_TEMP/surface.sh"\n${body}`], { encoding: 'utf8', env, timeout: 20_000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, temp };
}

const lines = (out: string): string[] => out.split('\n');
const errorsTitled = (out: string, name: string): string[] =>
  lines(out).filter((l) => l.startsWith(`::error title=${name}::`)).map((l) => l.slice(`::error title=${name}::`.length));
const allErrors = (out: string): string[] => lines(out).filter((l) => l.startsWith('::error'));
const notice = (out: string, name: string): string[] => lines(out).filter((l) => l.startsWith(`::notice title=${name} (log tail)::`));

describe.skipIf(!HAS_BASH)('tower-clash-ios-release.yml surface helper (QA-19, MM-14)', () => {
  it('the helper step is extracted as the runner sees it (heredoc terminator at column 0)', () => {
    const run = stepRun(readWorkflow('tower-clash-ios-release.yml'), HELPER_STEP);
    expect(run.startsWith(`cat > "$RUNNER_TEMP/surface.sh" <<'SH'\nsurface() {\n`)).toBe(true);
    expect(run).toContain('\nSH\necho "surface helper written"\n');
  });

  describe.each(SHELLS)('%s', (_label, flags) => {
    it('(a) a passing command → exit 0, its output passed through and logged, no annotations', () => {
      const r = runWithHelper(flags, 'surface archive bash -c \'echo "** ARCHIVE SUCCEEDED **"; echo "note: error: is only a word here" >&2\'\necho "after=$?"');
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('** ARCHIVE SUCCEEDED **\nnote: error: is only a word here\nafter=0\n');
      expect(readFileSync(join(r.temp, 'archive.log'), 'utf8')).toBe('** ARCHIVE SUCCEEDED **\nnote: error: is only a word here\n');
      expect(r.stdout).not.toContain('::error');
      expect(r.stdout).not.toContain('::notice');
    });

    it('(b) a failing xcodebuild-like command → its exit code, error lines as annotations, the log tail and the final ::error::', () => {
      const cmd = `printf '%s\\n' 'Build settings from command line:' "${NO_PROFILES}" 'warning: error: ignored warning' '${ARCHIVE_FAILED}'; exit 65`;
      const r = runWithHelper(flags, `surface archive bash -c ${JSON.stringify(cmd)}`);
      expect(r.status).toBe(65);
      expect(errorsTitled(r.stdout, 'archive')).toEqual([NO_PROFILES, ARCHIVE_FAILED]); // log order, no warnings
      const tail = notice(r.stdout, 'archive');
      expect(tail).toHaveLength(1);
      expect(tail[0]!.length).toBeLessThanOrEqual(2000);
      expect(tail[0]).toContain(NO_PROFILES);
      expect(tail[0]).toContain(ARCHIVE_FAILED);
      const all = allErrors(r.stdout);
      expect(all[all.length - 1]).toBe('::error::archive failed with exit code 65 — full log in the artifact ios-build-logs');
      expect(readFileSync(join(r.temp, 'archive.log'), 'utf8')).toContain(`${NO_PROFILES}\nwarning: error: ignored warning\n${ARCHIVE_FAILED}\n`);
    });

    it('(b) a failure with no matching line still prints the log tail and the final ::error:: with the real exit code (BUG-28)', () => {
      const r = runWithHelper(flags, `surface validate bash -c 'echo "Upload timed out"; exit 3'`);
      expect(r.status).toBe(3);
      expect(errorsTitled(r.stdout, 'validate')).toEqual([]);
      expect(notice(r.stdout, 'validate')).toEqual(['::notice title=validate (log tail)::Upload timed out ']);
      expect(allErrors(r.stdout)).toEqual(['::error::validate failed with exit code 3 — full log in the artifact ios-build-logs']);
    });

    it('(b) a long log: the tail notice line stays within 2000 characters', () => {
      const r = runWithHelper(flags, `surface export bash -c 'for i in $(seq 1 60); do printf "line %03d %0100d\\n" "$i" 0; done; exit 70'`);
      expect(r.status).toBe(70);
      const tail = notice(r.stdout, 'export');
      expect(tail).toHaveLength(1);
      expect(tail[0]!.length).toBe(2000);
      expect(tail[0]).toContain('line 021 '); // the last 40 lines, not the first
      expect(tail[0]).not.toContain('line 020 ');
    });

    it('(c) a 900-character error line is cut to 700 characters in its annotation', () => {
      const long = `error: ${'x'.repeat(893)}`;
      expect(long).toHaveLength(900);
      const r = runWithHelper(flags, `surface export bash -c 'echo "${long}"; exit 70'`);
      expect(r.status).toBe(70);
      expect(errorsTitled(r.stdout, 'export')).toEqual([long.slice(0, 700)]);
      expect(readFileSync(join(r.temp, 'export.log'), 'utf8')).toBe(`${long}\n`); // the artifact keeps it whole
    });

    it('(c) many error lines → the first 8 distinct ones in log order, so the step stays within 10 error annotations (BUG-29)', () => {
      const r = runWithHelper(
        flags,
        `surface archive bash -c 'echo "z.swift: error: root cause"; echo "z.swift: error: root cause"; for i in $(seq 1 15); do echo "f$i.swift: error: follow-up $i"; done; exit 65'`,
      );
      expect(r.status).toBe(65);
      expect(errorsTitled(r.stdout, 'archive')).toEqual(['z.swift: error: root cause', ...[1, 2, 3, 4, 5, 6, 7].map((i) => `f${i}.swift: error: follow-up ${i}`)]);
      expect(allErrors(r.stdout).length).toBeLessThanOrEqual(9); // + the archive step's device hint = 10
    });

    it('(b) altool output: its ERROR: and VERIFY FAILED lines become annotations (BUG-30, the validate run of 09d90f1)', () => {
      const r = runWithHelper(flags, `surface validate bash -c 'cat "$RUNNER_TEMP/altool.out"; exit 1'`, ALTOOL_OUT);
      expect(r.status).toBe(1);
      expect(errorsTitled(r.stdout, 'validate')).toEqual(ALTOOL_OUT.split('\n').filter((l) => /ERROR:|VERIFY FAILED/.test(l)));
      expect(errorsTitled(r.stdout, 'validate')).toHaveLength(3); // two ERROR: lines + VERIFY FAILED
    });

    it('(d) the caller keeps set -e: a failed surface inside `if !` is handled and the next commands still run under -e', () => {
      const r = runWithHelper(
        flags,
        `if ! surface archive bash -c 'echo "error: No profiles for x"; exit 65'; then echo "handled rc"; fi\necho "still running"\nfalse\necho "NOT REACHED"`,
      );
      expect(r.stdout).toContain('::error::archive failed with exit code 65');
      expect(r.stdout).toContain('handled rc\nstill running\n');
      expect(r.stdout).not.toContain('NOT REACHED'); // -e still active after the helper
      expect(r.status).toBe(1);
    });

    it('(d) a bare failing surface ends the step with the command’s exit code (export / validate steps)', () => {
      const r = runWithHelper(flags, `surface export bash -c 'echo "error: exportArchive failed"; exit 70'\necho "NOT REACHED"`);
      expect(r.status).toBe(70);
      expect(r.stdout).toContain('::error title=export::error: exportArchive failed\n');
      expect(r.stdout).toContain('::error::export failed with exit code 70');
      expect(r.stdout).not.toContain('NOT REACHED');
    });

    it('(d) a caller without -e is not switched to -e by the helper', () => {
      const r = runWithHelper(
        flags.filter((f) => f !== '-e').map((f) => (f === '-eo' ? '-o' : f)),
        `surface archive bash -c 'exit 2'\necho "rc=$?"\nfalse\necho "reached"`,
      );
      expect(r.stdout).toContain('rc=2\nreached\n');
      expect(r.status).toBe(0);
    });
  });
});
