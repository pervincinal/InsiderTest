import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * MM-13: the Android release and keystore workflows start from commits of request files, like
 * the iOS lanes of MM-12 (tests in storeMetadata.test.ts). Guards: (1) both committed request
 * files parse to the safe first request (internal + draft; generate yes, never replace); (2) the
 * shared parser's Android schemas accept the documented values and refuse everything else; (3)
 * the release workflow starts only from its request file, the tag or a manual run — never from
 * an edit of the workflow itself —, checks secrets first and refuses closed / production
 * requests without the Play service account before building; (4) the keystore workflow keeps its
 * push-on-own-file trigger, adds the request file and still checks the password first.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REPO = join(ROOT, '..');
const PARSER = join(ROOT, 'scripts/releaseRequest.mjs');
const RELEASE_YML = readFileSync(join(REPO, '.github/workflows/tower-clash-android-release.yml'), 'utf8');
const KEYSTORE_YML = readFileSync(join(REPO, '.github/workflows/tower-clash-android-keystore.yml'), 'utf8');
const BRANCH = 'claude/tower-war-game-plan-weqwpb';

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function runParser(kind: string, file: string, env = false): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [PARSER, kind, file, ...(env ? ['--env'] : [])], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function tempRequest(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mm13-request-'));
  tmpDirs.push(dir);
  const file = join(dir, 'x.request');
  writeFileSync(file, text);
  return file;
}

const T = 'requested=2026-10-10T08:00:00Z';

describe('committed Android request files', () => {
  it('release/android-release.request: internal, draft (the first push cannot publish anything)', () => {
    const file = join(ROOT, 'release/android-release.request');
    const r = runParser('android-release', file);
    expect(r.status).toBe(0);
    const value = JSON.parse(r.stdout) as { track: string; status: string; requested: string };
    expect(value).toMatchObject({ track: 'internal', status: 'draft' });
    expect(value.requested).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/);
    expect(runParser('android-release', file, true).stdout).toBe('TRACK=internal\nPLAY_STATUS=draft\n');
  });

  it('release/android-keystore.request: generate yes, never replace an existing key', () => {
    const file = join(ROOT, 'release/android-keystore.request');
    const r = runParser('android-keystore', file);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ generate: true, replaceExisting: false });
    expect(runParser('android-keystore', file, true).stdout).toBe('GENERATE=yes\nREPLACE_EXISTING=no\n');
  });
});

describe('android-release / android-keystore schemas (scripts/releaseRequest.mjs)', () => {
  it('accepts every documented value and applies the defaults', () => {
    const empty = runParser('android-release', tempRequest(`track=\nstatus=\n${T}\n`), true);
    expect(empty.status).toBe(0);
    expect(empty.stdout).toBe('TRACK=internal\nPLAY_STATUS=draft\n');
    const closed = runParser('android-release', tempRequest(`# c\r\ntrack=closed\r\nstatus=completed\r\n${T}\r\n`), true);
    expect(closed.stdout).toBe('TRACK=closed\nPLAY_STATUS=completed\n');
    const prod = runParser('android-release', tempRequest(`track=production\nstatus=completed\nnote=go-ahead: stakeholder, chat 2026-11-02 = ok\n${T}`));
    expect(JSON.parse(prod.stdout)).toMatchObject({ track: 'production', status: 'completed', note: 'go-ahead: stakeholder, chat 2026-11-02 = ok' });
    const prodDraft = runParser('android-release', tempRequest(`track=production\n${T}`), true);
    expect(prodDraft.stdout).toBe('TRACK=production\nPLAY_STATUS=draft\n');
    const replace = runParser('android-keystore', tempRequest(`generate=yes\nreplace_existing=yes\n${T}`), true);
    expect(replace.stdout).toBe('GENERATE=yes\nREPLACE_EXISTING=yes\n');
    const off = runParser('android-keystore', tempRequest(`generate=no\n${T}`), true);
    expect(off.stdout).toBe('GENERATE=no\nREPLACE_EXISTING=no\n');
  });

  it('never exports the note', () => {
    const r = runParser('android-release', tempRequest(`note=SECRET-LOOKING TEXT\n${T}`), true);
    expect(r.stdout).not.toContain('SECRET-LOOKING');
    expect(r.stderr).toContain('note: SECRET-LOOKING TEXT');
  });

  const bad: [string, string, string][] = [
    ['android-release', `track=alpha\n${T}`, 'track must be internal, closed or production (got "alpha")'],
    ['android-release', `track=Internal\n${T}`, 'track must be'],
    ['android-release', `status=inProgress\n${T}`, 'status must be draft or completed'],
    ['android-release', `track=production\nstatus=completed\n${T}`, 'publishes to every Play user'],
    ['android-release', `lane=testflight\n${T}`, 'unknown key "lane"'],
    ['android-release', `track=internal\ntrack=closed\n${T}`, 'appears twice'],
    ['android-release', 'track=internal', 'requested=<UTC timestamp> is missing'],
    ['android-release', 'track=internal\nrequested=2026-10-10 08:00', 'UTC timestamp'],
    ['android-keystore', T, 'generate=yes|no is missing'],
    ['android-keystore', `generate=\n${T}`, 'generate=yes|no is missing'],
    ['android-keystore', `generate=true\n${T}`, 'generate must be yes or no'],
    ['android-keystore', `generate=yes\nreplace_existing=true\n${T}`, 'replace_existing must be no or yes'],
    ['android-keystore', `generate=yes\nreplace=yes\n${T}`, 'unknown key "replace"'],
    ['android-keystore', `generate=yes\nnote=${'x'.repeat(201)}\n${T}`, 'note is longer'],
  ];
  it.each(bad)('%s refuses %j', (kind, text, reason) => {
    const r = runParser(kind, tempRequest(text), true);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain(reason);
  });

  it('names every request kind when the kind is unknown; the iOS kinds are unchanged', () => {
    const r = runParser('android', tempRequest(T));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('unknown request kind "android" (ios-release, ios-store, android-release, android-keystore)');
    expect(runParser('toString', tempRequest(T)).stderr).toContain('unknown request kind "toString"');
    // The Android keys are not valid in the iOS files and vice versa.
    expect(runParser('ios-release', tempRequest(`track=internal\n${T}`)).stderr).toContain('unknown key "track"');
    expect(runParser('ios-store', tempRequest(`generate=yes\n${T}`)).stderr).toContain('unknown key "generate"');
  });
});

const onBlock = (yaml: string): string => yaml.slice(yaml.indexOf('\non:'), yaml.indexOf('\nconcurrency:'));
const steps = (yaml: string): string => yaml.slice(yaml.indexOf('    steps:'));
const firstStep = (yaml: string): string | undefined => /^\s+- (?:name|uses): (.*)$/m.exec(steps(yaml))?.[1];
/** The `run:` / `with:` body of the step with this name, up to the next step. */
function step(yaml: string, name: string): string {
  const all = steps(yaml);
  const start = all.indexOf(`- name: ${name}\n`);
  if (start < 0) throw new Error(`step not found: ${name}`);
  const next = all.indexOf('\n      - ', start + 1);
  return all.slice(start, next < 0 ? undefined : next);
}

describe('tower-clash-android-release.yml (MM-13)', () => {
  it('starts from the request file on the working branch, the tag or Run workflow — not from its own file', () => {
    const on = onBlock(RELEASE_YML);
    expect(on).toContain("- 'tower-clash/release/android-release.request'");
    expect(on).toContain(`- ${BRANCH}`);
    expect(on).toContain("- 'tower-clash-v*'");
    expect(on).toContain('workflow_dispatch:');
    expect(on).not.toContain('.github/workflows/tower-clash-android-release.yml');
    expect(on).not.toMatch(/pull_request|schedule/);
  });

  it('checks the secrets first, before the checkout', () => {
    expect(firstStep(RELEASE_YML)).toBe('Check required secrets');
    expect(steps(RELEASE_YML).indexOf('- name: Check required secrets')).toBeLessThan(steps(RELEASE_YML).indexOf('- uses: actions/checkout'));
    expect(RELEASE_YML).toContain('for name in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD; do');
    // The service-account key is checked for shape without being printed.
    expect(RELEASE_YML).not.toMatch(/echo[^\n]*\$\{?PLAY_SERVICE_ACCOUNT_JSON\b/);
  });

  it('reads track + status from the request file and refuses closed / production without the service account before building', () => {
    const read = step(RELEASE_YML, 'Read the request file and choose the Play track');
    expect(read).toContain('node scripts/releaseRequest.mjs android-release release/android-release.request --env');
    expect(read).toContain('if [ "$REQUEST_RUN" = true ] && [ "$TRACK" != internal ] && [ "$HAS_PLAY_SA" != true ]; then');
    expect(read).toContain('Nothing was built.');
    expect(read).toContain('closed) PLAY_TRACK=alpha ;;');
    // ... and it runs before anything is installed or built.
    const all = steps(RELEASE_YML);
    expect(all.indexOf('- name: Read the request file and choose the Play track')).toBeLessThan(all.indexOf('- name: Install dependencies'));
    expect(all.indexOf('- name: Read the request file and choose the Play track')).toBeLessThan(all.indexOf('- name: Build signed AAB and APK'));
    // Manual and tag runs never get anything but draft.
    expect(read).toMatch(/TRACK="\$DISPATCH_TRACK"\n\s+PLAY_STATUS=draft/);
    // The removed "branch push never uploads" rule must not come back: a request run may upload.
    expect(RELEASE_YML).not.toContain('Branch push (workflow file changed)');
  });

  it('uploads with the requested status only when the service account exists; inAppUpdatePriority untouched', () => {
    const upload = step(RELEASE_YML, 'Upload to Google Play (optional)');
    expect(upload).toContain("if: env.HAS_PLAY_SA == 'true'");
    expect(upload).toContain('uses: r0adkll/upload-google-play@v1');
    expect(upload).toContain('track: ${{ env.PLAY_TRACK }}');
    expect(upload).toContain('status: ${{ env.PLAY_STATUS }}');
    expect(RELEASE_YML).not.toMatch(/^\s+inAppUpdatePriority:/m);
  });

  it('the summary says when the upload was skipped and names the .aab artifact', () => {
    const summary = step(RELEASE_YML, 'Summary');
    expect(summary).toContain('AAB_ARTIFACT="tower-clash-android-$V-$C-aab"');
    expect(summary).toContain('**Play upload: SKIPPED**');
    expect(summary).toContain('The stakeholder uploads **$AAB_ARTIFACT** by hand');
    expect(summary).toContain('::notice::Play upload SKIPPED');
    // The artifact name in the summary is the one the upload step really uses.
    expect(RELEASE_YML).toContain('name: tower-clash-android-${{ steps.version.outputs.version }}-${{ steps.version.outputs.code }}-aab');
  });
});

describe('tower-clash-android-keystore.yml (MM-13)', () => {
  it('runs on its own file (Safari re-run fallback) and on the request file, working branch only', () => {
    const on = onBlock(KEYSTORE_YML);
    expect(on).toContain("- '.github/workflows/tower-clash-android-keystore.yml'");
    expect(on).toContain("- 'tower-clash/release/android-keystore.request'");
    expect(on).toContain(`- ${BRANCH}`);
    expect(on).toContain('workflow_dispatch:');
    expect(on).not.toMatch(/tags:|pull_request|schedule/);
  });

  it('checks the password secret first, then reads the request, then decides', () => {
    expect(firstStep(KEYSTORE_YML)).toBe('Check secrets');
    const all = steps(KEYSTORE_YML);
    const order = ['- name: Check secrets', '- uses: actions/checkout', '- name: Read the request file', '- name: Decide', '- name: Generate the upload keystore'].map((s) =>
      all.indexOf(s),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(step(KEYSTORE_YML, 'Read the request file')).toContain('releaseRequest.mjs android-keystore "$REQUEST" --env');
    const decide = step(KEYSTORE_YML, 'Decide');
    expect(decide).toContain('if [ "$HAS_KEYSTORE_BASE64" = "true" ] && [ "$REPLACE_EXISTING" != "yes" ]; then');
    // Every step that makes or publishes key material obeys generate=no.
    for (const name of ['Generate the upload keystore', 'Upload artifact (kept 1 day)', 'Summary — what to do on the iPhone']) {
      expect(step(KEYSTORE_YML, name)).toContain("if: env.GENERATE == 'yes'");
    }
  });
});
