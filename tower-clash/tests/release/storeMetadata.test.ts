import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * MM-12: the App Store listing that tower-clash-ios-store.yml uploads with fastlane deliver.
 * Guards: (1) every text in fastlane/metadata equals the paste sheet's variant B
 * (docs/publishing/APP_STORE_CONNECT_SHEET.md) and fits Apple's limits; (2) the age-rating JSON
 * answers sheet §5 with attribute names the App Store Connect API knows; (3) the screenshot set
 * has sizes deliver maps to the iPhone 6.9"/6.5" slots; (4) both request files parse and bad ones
 * are refused; (5) the workflows only start from the request files and check secrets first.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REPO = join(ROOT, '..');
const SHEET = readFileSync(join(REPO, 'docs/publishing/APP_STORE_CONNECT_SHEET.md'), 'utf8');
const META = join(ROOT, 'fastlane/metadata');
const PARSER = join(ROOT, 'scripts/releaseRequest.mjs');

/** A metadata file without the trailing newline (deliver strips values before upload). */
function meta(rel: string): string {
  return readFileSync(join(META, rel), 'utf8').replace(/\n$/, '');
}

/** The table row of the sheet that starts with `| <label>` after the given heading. */
function sheetRow(heading: string, label: string): string {
  const start = SHEET.indexOf(heading);
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const row = SHEET.slice(start)
    .split('\n')
    .find((l) => l.startsWith(`| ${label}`));
  if (row === undefined) throw new Error(`row not found: ${label}`);
  return row;
}

function firstCode(row: string): string {
  const m = /`([^`]*)`/.exec(row);
  if (!m?.[1]) throw new Error(`no code span in: ${row}`);
  return m[1];
}

/** The first fenced code block after a marker line in the sheet. */
function sheetBlock(marker: string): string {
  const start = SHEET.indexOf(marker);
  if (start < 0) throw new Error(`marker not found: ${marker}`);
  const m = /```\n([\s\S]*?)\n```/.exec(SHEET.slice(start));
  if (!m?.[1]) throw new Error(`no code block after: ${marker}`);
  return m[1];
}

const codePoints = (s: string): number => [...s].length;

const SHEET_B = {
  name: firstCode(sheetRow('## 1. New App dialog', 'Name (Ad)')),
  subtitle: firstCode(sheetRow('## 2. App Information', 'Subtitle (Alt başlıq)')),
  privacyUrl: firstCode(sheetRow('## 2. App Information', 'Privacy Policy URL')),
  promotional: (() => {
    const row = sheetRow('### 6.2', 'Promotional Text (Tanıtım mətni) | 170 | **Variant B');
    const m = /\*\*Variant B \(default\):\*\* `([^`]*)`/.exec(row);
    if (!m?.[1]) throw new Error('promotional text B not found');
    return m[1];
  })(),
  keywords: firstCode(sheetRow('### 6.2', 'Keywords (Açar sözlər)')),
  supportUrl: firstCode(sheetRow('### 6.2', 'Support URL')),
  marketingUrl: firstCode(sheetRow('### 6.2', 'Marketing URL')),
  copyright: firstCode(sheetRow('### 6.2', 'Copyright')),
  description: sheetBlock('### 6.3 Description — variant B'),
  reviewNotes: sheetBlock('Notes — variant B (default, no purchases in this version):'),
};

describe('fastlane/metadata = APP_STORE_CONNECT_SHEET.md variant B', () => {
  it('has the deliver layout: en-US only (sheet §2: English (U.S.) only), review notes without contact files', () => {
    const dirs = readdirSync(META, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect(dirs).toEqual(['en-US', 'review_information']);
    expect(readdirSync(join(META, 'en-US')).sort()).toEqual([
      'description.txt',
      'keywords.txt',
      'marketing_url.txt',
      'name.txt',
      'privacy_url.txt',
      'promotional_text.txt',
      'subtitle.txt',
      'support_url.txt',
    ]);
    // Name / phone / e-mail come from the ASC_REVIEW_* secrets, never from the repository.
    expect(readdirSync(join(META, 'review_information'))).toEqual(['notes.txt']);
  });

  it('copies every text exactly', () => {
    expect(meta('en-US/name.txt')).toBe(SHEET_B.name);
    expect(meta('en-US/subtitle.txt')).toBe(SHEET_B.subtitle);
    expect(meta('en-US/privacy_url.txt')).toBe(SHEET_B.privacyUrl);
    expect(meta('en-US/promotional_text.txt')).toBe(SHEET_B.promotional);
    expect(meta('en-US/keywords.txt')).toBe(SHEET_B.keywords);
    expect(meta('en-US/support_url.txt')).toBe(SHEET_B.supportUrl);
    expect(meta('en-US/marketing_url.txt')).toBe(SHEET_B.marketingUrl);
    expect(meta('en-US/description.txt')).toBe(SHEET_B.description);
    expect(meta('review_information/notes.txt')).toBe(SHEET_B.reviewNotes);
    expect(meta('copyright.txt')).toBe(SHEET_B.copyright);
  });

  it('matches the character counts the sheet publishes (§9)', () => {
    expect(codePoints(SHEET_B.name)).toBe(11);
    expect(codePoints(SHEET_B.subtitle)).toBe(19);
    expect(codePoints(SHEET_B.promotional)).toBe(133);
    expect(codePoints(SHEET_B.keywords)).toBe(93);
    expect(codePoints(SHEET_B.description)).toBe(3863);
    expect(codePoints(SHEET_B.reviewNotes)).toBe(1202);
    expect(codePoints(SHEET_B.copyright)).toBe(23);
  });

  it("fits Apple's limits", () => {
    expect(codePoints(meta('en-US/name.txt'))).toBeLessThanOrEqual(30);
    expect(codePoints(meta('en-US/subtitle.txt'))).toBeLessThanOrEqual(30);
    expect(Buffer.byteLength(meta('en-US/keywords.txt'), 'utf8')).toBeLessThanOrEqual(100);
    expect(codePoints(meta('en-US/promotional_text.txt'))).toBeLessThanOrEqual(170);
    expect(codePoints(meta('en-US/description.txt'))).toBeLessThanOrEqual(4000);
    expect(codePoints(meta('review_information/notes.txt'))).toBeLessThanOrEqual(4000);
    // Keywords: commas without spaces, no duplicates, nothing repeating the app name.
    const words = meta('en-US/keywords.txt').split(',');
    expect(words.every((w) => w === w.trim() && w.length > 0)).toBe(true);
    expect(new Set(words).size).toBe(words.length);
  });

  it('is variant B: no purchase wording, no placeholders except the copyright holder', () => {
    expect(meta('en-US/description.txt')).toContain('Nothing to buy in this version');
    expect(meta('en-US/promotional_text.txt')).not.toContain('Ads removable');
    expect(meta('review_information/notes.txt')).toContain('This version contains NO in-app purchases');
    for (const f of ['en-US/description.txt', 'en-US/promotional_text.txt', 'review_information/notes.txt', 'en-US/keywords.txt']) {
      expect(meta(f)).not.toMatch(/\[developer|TODO|lorem/i);
    }
    for (const f of ['en-US/privacy_url.txt', 'en-US/support_url.txt', 'en-US/marketing_url.txt']) {
      expect(meta(f)).toMatch(/^https:\/\/pervincinal\.github\.io\/InsiderTest\//);
    }
    // The copyright keeps the sheet's placeholder; the Fastfile fills it from the review contact.
    expect(meta('copyright.txt')).toBe('© 2026 [developer name]');
    expect(readFileSync(join(ROOT, 'fastlane/Fastfile'), 'utf8')).toContain("COPYRIGHT_PLACEHOLDER = '[developer name]'");
  });

  it('sets the categories of sheet §2: Games › Strategy, Casual; no secondary category', () => {
    expect(SHEET).toContain('**Games** → subcategories **Strategy**, **Casual**');
    expect(meta('primary_category.txt')).toBe('GAMES');
    expect(meta('primary_first_sub_category.txt')).toBe('GAMES_STRATEGY');
    expect(meta('primary_second_sub_category.txt')).toBe('GAMES_CASUAL');
    expect(readFileSync(join(META, 'secondary_category.txt'), 'utf8')).toBe('');
  });
});

/*
 * Age rating: attribute names and values of AgeRatingDeclarationUpdateRequest in Apple's App Store
 * Connect OpenAPI specification 4.5.1 (also fastlane 2.240.1's AgeRatingDeclaration map).
 */
const RATING_LEVEL = ['NONE', 'INFREQUENT_OR_MILD', 'FREQUENT_OR_INTENSE'];
const API_LEVEL_ATTRIBUTES = [
  'alcoholTobaccoOrDrugUseOrReferences',
  'contests',
  'gamblingSimulated',
  'gunsOrOtherWeapons',
  'horrorOrFearThemes',
  'matureOrSuggestiveThemes',
  'medicalOrTreatmentInformation',
  'profanityOrCrudeHumor',
  'sexualContentGraphicAndNudity',
  'sexualContentOrNudity',
  'violenceCartoonOrFantasy',
  'violenceRealistic',
  'violenceRealisticProlongedGraphicOrSadistic',
];
const API_BOOLEAN_ATTRIBUTES = [
  'advertising',
  'ageAssurance',
  'gambling',
  'healthOrWellnessTopics',
  'lootBox',
  'messagingAndChat',
  'parentalControls',
  'socialMedia',
  'socialMediaAgeRestricted',
  'unrestrictedWebAccess',
  'userGeneratedContent',
];

describe('fastlane/age_rating.json = sheet §5 (expected 9+)', () => {
  const rating = JSON.parse(readFileSync(join(ROOT, 'fastlane/age_rating.json'), 'utf8')) as Record<string, unknown>;

  it('uses only App Store Connect API attribute names and values', () => {
    for (const [key, value] of Object.entries(rating)) {
      if (API_LEVEL_ATTRIBUTES.includes(key)) expect(RATING_LEVEL).toContain(value);
      else if (API_BOOLEAN_ATTRIBUTES.includes(key)) expect(typeof value).toBe('boolean');
      else throw new Error(`unknown age-rating attribute ${key}`);
    }
    // Every level question is answered; "Made for Kids" stays unset (no kidsAgeBand).
    for (const key of API_LEVEL_ATTRIBUTES) expect(rating).toHaveProperty(key);
    expect(rating).not.toHaveProperty('kidsAgeBand');
    expect(rating).not.toHaveProperty('ageRatingOverrideV2');
  });

  it('answers the sheet rows', () => {
    expect(sheetRow('## 5. Age Rating', 'Cartoon or Fantasy Violence')).toContain('**Infrequent/Mild**');
    expect(rating.violenceCartoonOrFantasy).toBe('INFREQUENT_OR_MILD');
    expect(sheetRow('## 5. Age Rating', 'Advertising (Reklam)')).toContain('**Yes**');
    expect(rating.advertising).toBe(true);
    // Variant B: no in-app purchases; gambling / contests / web / loot boxes / chat / UGC /
    // parental controls / age assurance: No.
    for (const key of ['gambling', 'unrestrictedWebAccess', 'lootBox', 'messagingAndChat', 'userGeneratedContent', 'parentalControls', 'ageAssurance']) {
      expect(rating[key]).toBe(false);
    }
    const levelsOtherThanCartoon = API_LEVEL_ATTRIBUTES.filter((k) => k !== 'violenceCartoonOrFantasy');
    for (const key of levelsOtherThanCartoon) expect(rating[key]).toBe('NONE');
  });
});

/** Width, height and colour type of a PNG (IHDR chunk). */
function pngInfo(path: string): { width: number; height: number; colourType: number } {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(b.subarray(12, 16).toString('latin1')).toBe('IHDR');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colourType: b.readUInt8(25) };
}

describe('iPhone screenshots for deliver', () => {
  // deliver 2.240.1 (app_screenshot.rb): 1290x2796 → APP_IPHONE_67 (the 6.9" slot),
  // 1284x2778 → APP_IPHONE_65. Apple accepts 1–10 per slot; the sheet ships 10, at least 3 kept.
  const sets = [
    { dir: 'store/screenshots/apple-6.7/en', width: 1290, height: 2796 },
    { dir: 'store/screenshots/apple-6.5/en', width: 1284, height: 2778 },
  ];
  for (const set of sets) {
    it(`${set.dir}: 3–10 PNGs, ${set.width}x${set.height}, no alpha, named 01..NN`, () => {
      const files = readdirSync(join(ROOT, set.dir)).filter((f) => f.endsWith('.png')).sort();
      expect(files.length).toBeGreaterThanOrEqual(3);
      expect(files.length).toBeLessThanOrEqual(10);
      expect(files).toEqual(files.map((_, i) => `${String(i + 1).padStart(2, '0')}.png`));
      for (const f of files) {
        const info = pngInfo(join(ROOT, set.dir, f));
        expect({ f, w: info.width, h: info.height }).toEqual({ f, w: set.width, h: set.height });
        expect(info.colourType).toBe(2); // truecolour without alpha (App Store Connect rejects alpha)
      }
    });
  }

  it('matches the slot table of sheet §6.1', () => {
    expect(SHEET).toContain('| 1 | iPhone 6.9"/6.7" display (1290×2796 accepted) | `apple-6.7/en/01.png`');
    expect(SHEET).toContain('iPhone 6.5" display (1284×2778)');
  });
});

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function runParser(kind: string, file: string, env = false): { status: number | null; stdout: string; stderr: string } {
  const args = [PARSER, kind, file, ...(env ? ['--env'] : [])];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function tempRequest(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mm12-request-'));
  tmpDirs.push(dir);
  const file = join(dir, 'x.request');
  writeFileSync(file, text);
  return file;
}

describe('request files (scripts/releaseRequest.mjs)', () => {
  it('release/ios-release.request parses: lane testflight', () => {
    const r = runParser('ios-release', join(ROOT, 'release/ios-release.request'));
    expect(r.status).toBe(0);
    const value = JSON.parse(r.stdout) as { lane: string; requested: string };
    expect(value.lane).toBe('testflight');
    expect(value.requested).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/);
    expect(runParser('ios-release', join(ROOT, 'release/ios-release.request'), true).stdout).toBe('LANE=testflight\n');
  });

  it('release/ios-store.request parses: metadata only, never submit by default', () => {
    const r = runParser('ios-store', join(ROOT, 'release/ios-store.request'));
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ action: 'metadata', build: null, iphone65: false });
    expect(runParser('ios-store', join(ROOT, 'release/ios-store.request'), true).stdout).toBe(
      'STORE_ACTION=metadata\nSTORE_BUILD=\nSTORE_IPHONE65=no\n',
    );
  });

  it('accepts appstore / submit requests', () => {
    const lane = runParser('ios-release', tempRequest('# c\nlane=appstore\nrequested=2026-10-10T08:00Z\n'));
    expect(JSON.parse(lane.stdout)).toMatchObject({ lane: 'appstore' });
    const submit = runParser('ios-store', tempRequest('action=submit\r\nbuild=8\r\niphone65=yes\r\nnote=a=b\r\nrequested=2026-10-10T08:00:00Z\r\n'));
    expect(submit.status).toBe(0);
    expect(JSON.parse(submit.stdout)).toMatchObject({ action: 'submit', build: 8, iphone65: true, note: 'a=b' });
    // lane may be left empty: default testflight
    expect(JSON.parse(runParser('ios-release', tempRequest('lane=\nrequested=2026-10-10T08:00Z')).stdout)).toMatchObject({ lane: 'testflight' });
  });

  const bad: [string, string, string][] = [
    ['ios-release', 'lane=production\nrequested=2026-10-10T08:00Z', 'lane must be'],
    ['ios-release', 'lnae=appstore\nrequested=2026-10-10T08:00Z', 'unknown key "lnae"'],
    ['ios-release', 'lane=testflight\nlane=appstore\nrequested=2026-10-10T08:00Z', 'appears twice'],
    ['ios-release', 'lane=testflight', 'requested=<UTC timestamp> is missing'],
    ['ios-release', 'lane=testflight\nrequested=10.10.2026', 'UTC timestamp'],
    ['ios-release', 'lane testflight\nrequested=2026-10-10T08:00Z', 'expected key=value'],
    ['ios-store', 'action=submit\nrequested=2026-10-10T08:00Z', 'needs build='],
    ['ios-store', 'action=submit\nbuild=08\nrequested=2026-10-10T08:00Z', 'positive whole number'],
    ['ios-store', 'action=release\nbuild=8\nrequested=2026-10-10T08:00Z', 'action must be'],
    ['ios-store', 'build=8\nrequested=2026-10-10T08:00Z', 'action must be'],
    ['ios-store', 'action=metadata\niphone65=maybe\nrequested=2026-10-10T08:00Z', 'iphone65 must be'],
    ['ios-store', `action=metadata\nnote=${'x'.repeat(201)}\nrequested=2026-10-10T08:00Z`, 'note is longer'],
    ['ios-store', 'lane=testflight\nrequested=2026-10-10T08:00Z', 'unknown key "lane"'],
  ];
  it.each(bad)('%s refuses %j', (kind, text, reason) => {
    const r = runParser(kind, tempRequest(text), true);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain(reason);
  });
});

describe('workflows start only from the request files', () => {
  const release = readFileSync(join(REPO, '.github/workflows/tower-clash-ios-release.yml'), 'utf8');
  const store = readFileSync(join(REPO, '.github/workflows/tower-clash-ios-store.yml'), 'utf8');
  const onBlock = (yaml: string): string => yaml.slice(yaml.indexOf('\non:'), yaml.indexOf('\nconcurrency:'));

  it('release: tag, manual, or a change of release/ios-release.request on the working branch', () => {
    const on = onBlock(release);
    expect(on).toContain("- 'tower-clash/release/ios-release.request'");
    expect(on).toContain('- claude/tower-war-game-plan-weqwpb');
    expect(on).not.toContain('.github/workflows/tower-clash-ios-release.yml');
    expect(release).toContain('node scripts/releaseRequest.mjs ios-release release/ios-release.request --env');
  });

  it('store: only a change of release/ios-store.request on the working branch', () => {
    const on = onBlock(store);
    expect(on).toContain("- 'tower-clash/release/ios-store.request'");
    expect(on).toContain('- claude/tower-war-game-plan-weqwpb');
    expect(on).not.toMatch(/workflow_dispatch|tags:|pull_request|schedule/);
  });

  it('store: the secrets check is the first step and names the same four secrets as the release lane', () => {
    const steps = store.slice(store.indexOf('    steps:'));
    expect(steps.indexOf('- name: Check required secrets')).toBeLessThan(steps.indexOf('- uses: actions/checkout'));
    const firstStep = /^\s+- (name|uses): (.*)$/m.exec(steps);
    expect(firstStep?.[2]).toBe('Check required secrets');
    const loop = 'for name in APP_STORE_CONNECT_API_KEY_ID APP_STORE_CONNECT_API_ISSUER_ID APP_STORE_CONNECT_API_KEY_P8 APPLE_TEAM_ID; do';
    expect(store).toContain(loop);
    expect(release).toContain(loop);
    // The key is handed to fastlane through the environment, never echoed.
    expect(store).not.toMatch(/echo[^\n]*\$\{?(ASC_KEY_P8|APP_STORE_CONNECT_API_KEY_P8)\b/);
  });

  it('fastlane: manual release, precheck off (it would skip a submission silently), pinned gem', () => {
    const fastfile = readFileSync(join(ROOT, 'fastlane/Fastfile'), 'utf8');
    expect(fastfile).toContain('automatic_release: false');
    expect(fastfile).toContain('run_precheck_before_submit: false');
    expect(fastfile).toContain('export_compliance_uses_encryption: false');
    expect(fastfile).toContain("SOFT_LAUNCH_TERRITORIES = %w[AZE TUR KAZ GEO]");
    expect(fastfile).not.toMatch(/automatic_release:\s*true|price_tier/);
    for (const f of ['fastlane/Gemfile', 'fastlane/Gemfile.lock']) expect(existsSync(join(ROOT, f))).toBe(true);
    expect(readFileSync(join(ROOT, 'fastlane/Gemfile.lock'), 'utf8')).toContain('    fastlane (2.240.1)');
  });
});
