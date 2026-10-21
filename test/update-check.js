'use strict';
/* Signed update-check prototype tests (Agent 12).
 * All keys are THROWAWAY Ed25519 pairs generated inside this process
 * at run time; nothing is read from disk and no private key is ever
 * persisted or committed. Tiers: pure-function unit tests plus remote
 * checks against an injected stub transport (no real network). */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const {
  UPDATE_DOMAIN, signedUpdatePayload, compareVersions,
  checkForUpdate, checkForUpdateRemote,
} = require('../src/update/updateCheck');

const NOW = Date.parse('2026-10-21T00:00:00.000Z');
const publisher = crypto.generateKeyPairSync('ed25519');
const stranger = crypto.generateKeyPairSync('ed25519');
const license = crypto.generateKeyPairSync('ed25519');

function buildManifest(overrides = {}) {
  return {
    schema: 1, product: 'lhm-ads-browser', version: '5.9.0', channel: 'stable',
    publishedAt: '2026-10-20T00:00:00.000Z', expiresAt: '2026-12-31T00:00:00.000Z',
    artifact: {
      fileName: 'LHM-Ads-Browser-5.9.0-Setup-x64.exe',
      url: 'https://github.com/capquangfptminhlh/ggminh/releases/download/v5.9.0/LHM-Ads-Browser-5.9.0-Setup-x64.exe',
      bytes: 198000000, sha256: 'a'.repeat(64),
    },
    signature: 'unsigned',
    ...overrides,
  };
}
function sign(manifest, key = publisher.privateKey) {
  const signature = crypto.sign(null, signedUpdatePayload(manifest), key);
  return { ...manifest, signature: signature.toString('base64url') };
}
function check(manifest, extra = {}) {
  return checkForUpdate({
    currentVersion: '5.8.0', manifest,
    publicKey: publisher.publicKey, now: NOW, ...extra,
  });
}

let passed = 0;
function ok(name, fn) { fn(); passed++; console.log('PASS', name); }

ok('update-available: validly signed newer version', () => {
  const r = check(sign(buildManifest()));
  assert.equal(r.status, 'update-available');
  assert.equal(r.details.latestVersion, '5.9.0');
  assert.equal(r.details.artifact.bytes, 198000000);
  assert.equal(r.details.artifact.sha256, 'a'.repeat(64));
});
ok('up-to-date: manifest version equals current', () => {
  const r = check(sign(buildManifest({ version: '5.8.0' })));
  assert.equal(r.status, 'up-to-date');
});
ok('up-to-date: manifest for another channel is not offered', () => {
  const r = check(sign(buildManifest({ channel: 'preview' })));
  assert.equal(r.status, 'up-to-date');
  assert.equal(r.details.reason, 'channel-mismatch');
});
ok('invalid: tampered version after signing', () => {
  const signed = sign(buildManifest());
  const r = check({ ...signed, version: '9.9.9' });
  assert.equal(r.status, 'invalid');
  assert.equal(r.details.reason, 'signature-mismatch');
});
ok('invalid: signed by a stranger key', () => {
  const r = check(sign(buildManifest(), stranger.privateKey));
  assert.equal(r.status, 'invalid');
  assert.equal(r.details.reason, 'signature-mismatch');
});
ok('invalid: signature minted for the engine domain does not verify', () => {
  // Domain separation: the same canonical text signed under the
  // engine-bundle domain must never verify as an update manifest.
  const { canonicalUpdateManifest } = require('../src/update/updateCheck');
  const m = buildManifest();
  const foreign = crypto.sign(null,
    Buffer.from('LHM_BROWSER_ENGINE_BUNDLE_V1\n' + canonicalUpdateManifest(m), 'utf8'),
    publisher.privateKey);
  const r = check({ ...m, signature: foreign.toString('base64url') });
  assert.equal(r.status, 'invalid');
  assert.equal(r.details.reason, 'signature-mismatch');
  assert.equal(UPDATE_DOMAIN, 'LHM_APP_UPDATE_V1\n');
});
ok('invalid: downgrade refused even when validly signed', () => {
  const r = check(sign(buildManifest({ version: '5.7.0' })));
  assert.equal(r.status, 'invalid');
  assert.equal(r.details.reason, 'downgrade-refused');
});
ok('semver: prerelease ordering follows the spec', () => {
  assert.equal(compareVersions('5.9.0-preview.1', '5.9.0'), -1);
  assert.equal(compareVersions('5.9.0-preview.2', '5.9.0-preview.10'), -1);
  assert.equal(compareVersions('5.10.0', '5.9.0'), 1);
  assert.equal(compareVersions('5.9.0', '5.9.0'), 0);
  const down = checkForUpdate({
    currentVersion: '5.9.0', manifest: sign(buildManifest({ version: '5.9.0-preview.1' })),
    publicKey: publisher.publicKey, now: NOW,
  });
  assert.equal(down.status, 'invalid');
  assert.equal(down.details.reason, 'downgrade-refused');
  const up = check(sign(buildManifest({ version: '5.9.0-preview.1' })));
  assert.equal(up.status, 'update-available');
});
ok('invalid: expired manifest refused', () => {
  const r = check(sign(buildManifest({
    publishedAt: '2026-09-01T00:00:00.000Z', expiresAt: '2026-10-01T00:00:00.000Z',
  })));
  assert.equal(r.status, 'invalid');
  assert.equal(r.details.reason, 'manifest-expired');
});
ok('invalid: malformed inputs refused', () => {
  assert.equal(check('{not json').details.reason, 'manifest-malformed');
  const missing = sign(buildManifest());
  delete missing.expiresAt;
  assert.equal(check(missing).details.reason, 'manifest-malformed');
  const extra = { ...sign(buildManifest()), extraField: true };
  assert.equal(check(extra).details.reason, 'manifest-malformed');
  const badSha = sign(buildManifest());
  badSha.artifact = { ...badSha.artifact, sha256: 'xyz' };
  assert.equal(check(badSha).details.reason, 'manifest-malformed');
});
ok('invalid: artifact URL must be HTTPS on an allowlisted host', () => {
  const http = buildManifest();
  http.artifact = { ...http.artifact, url: 'http://github.com/x/LHM.exe' };
  const r1 = check(sign(http));
  assert.equal(r1.status, 'invalid');
  assert.equal(r1.details.reason, 'artifact-url-refused');
  const evil = buildManifest();
  evil.artifact = { ...evil.artifact, url: 'https://evil.example.com/LHM.exe' };
  assert.equal(check(sign(evil)).details.reason, 'artifact-url-refused');
});
ok('invalid: missing or license-matching publisher key refused', () => {
  const noKey = checkForUpdate({
    currentVersion: '5.8.0', manifest: sign(buildManifest()), now: NOW,
  });
  assert.equal(noKey.status, 'invalid');
  assert.equal(noKey.details.reason, 'publisher-key-not-configured');
  const matched = checkForUpdate({
    currentVersion: '5.8.0', manifest: sign(buildManifest(), license.privateKey),
    publicKey: license.publicKey, licenseKey: license.publicKey, now: NOW,
  });
  assert.equal(matched.status, 'invalid');
  assert.equal(matched.details.reason, 'publisher-key-matches-license');
});

// --- Remote check with an injected stub transport (no network) ---
function stubRequest(handler) {
  return (url, cb) => {
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.destroy = () => {};
    process.nextTick(() => handler(String(url), cb, req));
    return req;
  };
}
function respond(statusCode, body, headers = {}) {
  return (url, cb) => {
    const res = new PassThrough();
    res.statusCode = statusCode;
    res.headers = headers;
    cb(res);
    res.end(body);
  };
}
(async () => {
  const manifestText = JSON.stringify(sign(buildManifest()));
  const remote = extra => checkForUpdateRemote({
    url: 'https://github.com/capquangfptminhlh/ggminh/releases/download/update/update.json',
    currentVersion: '5.8.0', publicKey: publisher.publicKey, now: NOW, ...extra,
  });
  let r = await remote({ request: stubRequest(respond(200, manifestText)) });
  assert.equal(r.status, 'update-available'); passed++;
  console.log('PASS remote: 200 with signed manifest yields the pure result');

  r = await remote({ request: stubRequest((url, cb, req) => req.emit('error', Error('boom'))) });
  assert.equal(r.status, 'unreachable'); passed++;
  console.log('PASS remote: transport error is unreachable, never invalid');

  r = await remote({ request: stubRequest(respond(500, 'nope')) });
  assert.equal(r.status, 'unreachable');
  assert.equal(r.details.reason, 'manifest-http-500'); passed++;
  console.log('PASS remote: HTTP 500 is unreachable');

  r = await remote({
    request: stubRequest(respond(302, '', { location: 'https://evil.example.com/update.json' })),
  });
  assert.equal(r.status, 'unreachable');
  assert.equal(r.details.reason, 'redirect-refused'); passed++;
  console.log('PASS remote: redirect off the allowlist is refused');

  console.log(`update-check: ${passed} test groups passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
