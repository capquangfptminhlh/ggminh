'use strict';
/* Release-side update signer tests (Agent R9).
 * All keys are THROWAWAY Ed25519 pairs generated inside this
 * process and written only to a fresh os.tmpdir() directory that
 * is removed when the suite finishes; no private key is persisted
 * in or read from the repository. Tiers: sign -> check round-trips
 * through the shipped checker (src/update/updateCheck.js), signer
 * refusal paths, and one end-to-end CLI run with an encrypted key. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkForUpdate } = require('../src/update/updateCheck');
const { signAppUpdate } = require('../tools/sign-app-update');

const T0 = Date.parse('2026-10-21T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const URL_590 = 'https://github.com/capquangfptminhlh/ggminh/releases/download/v5.9.0/LHM-Ads-Browser-5.9.0-Setup-x64.exe';
const PASSPHRASE = 'test-passphrase-123';

const publisher = crypto.generateKeyPairSync('ed25519');
const fakeLicense = crypto.generateKeyPairSync('ed25519');
const stranger = crypto.generateKeyPairSync('ed25519');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-update-sign-'));
const publisherPem = path.join(tmp, 'publisher.pem');
const publisherEncPem = path.join(tmp, 'publisher-encrypted.pem');
const fakeLicensePem = path.join(tmp, 'fake-license.pem');
const fakeLicensePub = path.join(tmp, 'fake-license.pub');
const strangerPub = path.join(tmp, 'stranger.pub');
const artifactPath = path.join(tmp, 'LHM-Ads-Browser-5.9.0-Setup-x64.exe');
const artifactBytes = Buffer.alloc(8192, 7);
const artifactSha = crypto.createHash('sha256').update(artifactBytes).digest('hex');

let passed = 0;
function ok(name, fn) { fn(); passed++; console.log('PASS', name); }
function refuses(name, fn, pattern) {
  assert.throws(fn, pattern); passed++;
  console.log('PASS refusal:', name);
}
function baseArgs(extra = {}) {
  return {
    artifactPath, version: '5.9.0', url: URL_590,
    keyFile: publisherPem, licensePublicKey: fakeLicense.publicKey,
    now: T0, ...extra,
  };
}
function check(manifest, extra = {}) {
  return checkForUpdate({
    currentVersion: '5.8.0', manifest,
    publicKey: publisher.publicKey,
    licenseKey: fakeLicense.publicKey, now: T0, ...extra,
  });
}

try {
  fs.writeFileSync(publisherPem,
    publisher.privateKey.export({ format: 'pem', type: 'pkcs8' }));
  fs.writeFileSync(publisherEncPem,
    publisher.privateKey.export({ format: 'pem', type: 'pkcs8',
      cipher: 'aes-256-cbc', passphrase: PASSPHRASE }));
  fs.writeFileSync(fakeLicensePem,
    fakeLicense.privateKey.export({ format: 'pem', type: 'pkcs8' }));
  fs.writeFileSync(fakeLicensePub,
    fakeLicense.publicKey.export({ format: 'pem', type: 'spki' }));
  fs.writeFileSync(strangerPub,
    stranger.publicKey.export({ format: 'pem', type: 'spki' }));
  fs.writeFileSync(artifactPath, artifactBytes);

  // --- Round-trip through the shipped checker ---
  let signed;
  ok('round-trip: signer output is accepted (update-available for a newer version)', () => {
    signed = signAppUpdate(baseArgs()).document;
    assert.equal(signed.artifact.sha256, artifactSha);
    assert.equal(signed.artifact.bytes, artifactBytes.length);
    const r = check(signed);
    assert.equal(r.status, 'update-available');
    assert.equal(r.details.latestVersion, '5.9.0');
    assert.equal(r.details.artifact.url, URL_590);
    assert.equal(signAppUpdate(baseArgs()).selfCheck, 'update-available');
  });
  ok('round-trip: equal version is up-to-date', () => {
    const r = check(signed, { currentVersion: '5.9.0' });
    assert.equal(r.status, 'up-to-date');
  });
  ok('round-trip: tampered manifest is invalid', () => {
    const byVersion = check({ ...signed, version: '9.9.9' });
    assert.equal(byVersion.status, 'invalid');
    assert.equal(byVersion.details.reason, 'signature-mismatch');
    const byHash = check({ ...signed,
      artifact: { ...signed.artifact, sha256: 'b'.repeat(64) } });
    assert.equal(byHash.status, 'invalid');
    assert.equal(byHash.details.reason, 'signature-mismatch');
  });
  ok('round-trip: downgrade is invalid even when validly signed', () => {
    const r = check(signed, { currentVersion: '6.0.0' });
    assert.equal(r.status, 'invalid');
    assert.equal(r.details.reason, 'downgrade-refused');
  });
  ok('round-trip: expired manifest is invalid, fresh one is offered', () => {
    const short = signAppUpdate(baseArgs({ validDays: 1 })).document;
    const fresh = check(short, { now: T0 + 12 * 60 * 60 * 1000 });
    assert.equal(fresh.status, 'update-available');
    const stale = check(short, { now: T0 + 2 * DAY });
    assert.equal(stale.status, 'invalid');
    assert.equal(stale.details.reason, 'manifest-expired');
  });
  ok('round-trip: preview channel signs and checks on its own channel', () => {
    const doc = signAppUpdate(baseArgs({ channel: 'preview' })).document;
    const r = check(doc, { channel: 'preview' });
    assert.equal(r.status, 'update-available');
    assert.equal(check(doc).details.reason, 'channel-mismatch');
  });

  // --- Key discipline refusals ---
  refuses('signing key that IS the license key', () =>
    signAppUpdate(baseArgs({ keyFile: fakeLicensePem })),
    /license signing key/);
  refuses('publisher anchor that equals the license key', () =>
    signAppUpdate(baseArgs({ publisherKeyFile: fakeLicensePub })),
    /publisher public key equals the application license/);
  refuses('publisher anchor the private key does not correspond to', () =>
    signAppUpdate(baseArgs({ publisherKeyFile: strangerPub })),
    /does not correspond/);
  refuses('encrypted key without a passphrase', () =>
    signAppUpdate(baseArgs({ keyFile: publisherEncPem })),
    /LHM_UPDATE_PASSPHRASE/);
  refuses('encrypted key with the wrong passphrase', () =>
    signAppUpdate(baseArgs({ keyFile: publisherEncPem, passphrase: 'wrong-passphrase-99' })),
    /key or passphrase invalid/);
  refuses('passphrase shorter than 12 characters', () =>
    signAppUpdate(baseArgs({ keyFile: publisherEncPem, passphrase: 'short' })),
    /at least 12 characters/);
  ok('encrypted key with the correct passphrase signs and verifies', () => {
    const doc = signAppUpdate(baseArgs({
      keyFile: publisherEncPem, passphrase: PASSPHRASE })).document;
    assert.equal(check(doc).status, 'update-available');
  });
  refuses('key file inside the repository tree', () =>
    signAppUpdate(baseArgs({ repoRoot: tmp })),
    /OUTSIDE the repository/);
  refuses('missing key file', () =>
    signAppUpdate(baseArgs({ keyFile: path.join(tmp, 'nope.pem') })),
    /Cannot read the update signing key file/);

  // --- Input refusals ---
  refuses('http artifact URL', () =>
    signAppUpdate(baseArgs({ url: URL_590.replace('https://', 'http://') })),
    /must be HTTPS/);
  refuses('artifact URL off the allowlist', () =>
    signAppUpdate(baseArgs({ url: 'https://evil.example.com/LHM.exe' })),
    /allowlisted host/);
  refuses('artifact URL with a query string', () =>
    signAppUpdate(baseArgs({ url: URL_590 + '?x=1' })),
    /must be HTTPS/);
  refuses('unparseable version', () =>
    signAppUpdate(baseArgs({ version: '5.9' })), /Invalid semantic version/);
  refuses('version 0.0.0', () =>
    signAppUpdate(baseArgs({ version: '0.0.0' })), /newer than 0\.0\.0/);
  refuses('validity window out of range', () =>
    signAppUpdate(baseArgs({ validDays: 0 })), /1\.\.90/);
  refuses('missing artifact', () =>
    signAppUpdate(baseArgs({ artifactPath: path.join(tmp, 'gone.exe') })),
    /ENOENT/);
  refuses('artifact without an .exe name', () => {
    const zip = path.join(tmp, 'LHM-Setup.zip');
    fs.writeFileSync(zip, artifactBytes);
    signAppUpdate(baseArgs({ artifactPath: zip }));
  }, /Invalid update artifact descriptor/);

  // --- Output handling ---
  ok('manifest is written atomically, not overwritten without force, and parses for the checker', () => {
    const out = path.join(tmp, 'update.json');
    const r = signAppUpdate(baseArgs({ out }));
    assert.equal(r.path, out);
    if (process.platform !== 'win32')
      assert.equal(fs.statSync(out).mode & 0o777, 0o600);
    const fromDisk = check(fs.readFileSync(out, 'utf8'));
    assert.equal(fromDisk.status, 'update-available');
    assert.throws(() => signAppUpdate(baseArgs({ out })), /already exists/);
    signAppUpdate(baseArgs({ out, force: true }));
    assert.equal(check(fs.readFileSync(out, 'utf8')).status, 'update-available');
  });

  // --- CLI end-to-end (encrypted key via env, like the operator) ---
  ok('CLI: signs with env-provided encrypted key; refuses without a key path', () => {
    const tool = path.join(__dirname, '..', 'tools', 'sign-app-update.js');
    const out = path.join(tmp, 'cli-update.json');
    const env = { ...process.env,
      LHM_UPDATE_SIGNING_KEY_FILE: publisherEncPem,
      LHM_UPDATE_PASSPHRASE: PASSPHRASE };
    const run = spawnSync(process.execPath,
      [tool, '--artifact', artifactPath, '--version', '5.9.0',
       '--url', URL_590, '--out', out],
      { env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /update-available/);
    const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
    const r = checkForUpdate({ currentVersion: '5.8.0', manifest: doc,
      publicKey: publisher.publicKey });
    assert.equal(r.status, 'update-available');
    const noKeyEnv = { ...process.env };
    delete noKeyEnv.LHM_UPDATE_SIGNING_KEY_FILE;
    const refused = spawnSync(process.execPath,
      [tool, '--artifact', artifactPath, '--version', '5.9.0',
       '--url', URL_590, '--out', path.join(tmp, 'never.json')],
      { env: noKeyEnv, encoding: 'utf8' });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /Cannot sign update manifest/);
    assert.equal(fs.existsSync(path.join(tmp, 'never.json')), false);
  });

  console.log(`app-update-signing: ${passed} test groups passed`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

