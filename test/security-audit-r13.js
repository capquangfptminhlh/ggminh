'use strict';
/**
 * Wave R — Agent R13 independent security audit PoCs.
 *
 * Each section states the check it actually runs. Sections A, B and D
 * encode findings that FAILED on the base tree (f280296) and pass with
 * the in-branch fixes; sections C, E and F are verification probes for
 * properties earlier waves claimed (API minimisation, snapshot path
 * discipline, release-descriptor validation, vault file mode) — they
 * passed before and must keep passing.
 *
 * Synthetic data only: throwaway keys, fake IPs, marker strings. No
 * real credentials, no network access (the update-check transport is
 * stubbed), no real customer data.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

let passed = 0, failed = 0;
function check(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { passed++; console.log('  PASS', name); },
    (error) => { failed++; console.log('  FAIL', name, '—', error.message); });
}
function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-r13-' + tag + '-'));
}
function modeOf(file) { return fs.statSync(file).mode & 0o777; }
// POSIX permission bits are not represented on Windows (Node reports 0666
// for regular files); the 0600 guarantee is therefore only asserted where
// the platform has modes — same guard pattern as measurement-records-e2e.
function assertPrivateMode(file) {
  if (process.platform !== 'win32') assert.equal(modeOf(file), 0o600);
}
function plantLoose(file, content) {
  fs.writeFileSync(file, content);
  fs.chmodSync(file, 0o644);
}

const BLOB = {
  format: 'camoufox-camou-config', version: 1,
  generator: 'camoufox@0.5.8', generatedAt: '2026-01-01T00:00:00.000Z',
  constraints: { os: 'windows', locale: null, timezone: null },
  env: { CAMOU_CONFIG_1: '{"marker":"SECRET_CHUNK_R13"}' },
  expectations: {},
};

async function sectionA() {
  console.log('A. File-permission claims (0o600 stores, write AND rewrite paths)');
  if (process.platform === 'win32')
    console.log('   note: POSIX mode assertions not measured on win32 (no permission bits); write/rewrite paths still exercised');
  const Store = require('../src/db/store');
  await check('A1 db.json lands 0600 even when db.json.tmp pre-exists at 0644', () => {
    const dir = tmpDir('store');
    plantLoose(path.join(dir, 'db.json.tmp'), '{}');
    const store = new Store(dir); // constructor performs the first saveData
    assertPrivateMode(store.dbFile);
    plantLoose(path.join(dir, 'db.json.tmp'), '{}');
    store.saveData(); // rewrite path
    assertPrivateMode(store.dbFile);
  });
  const { ExitIpObservationStore } = require('../src/health/exitIpObservations');
  await check('A2 exit-ip-observations.json lands 0600 with a pre-loose .tmp', () => {
    const dir = tmpDir('exitip');
    const store = new ExitIpObservationStore(dir);
    plantLoose(store.file + '.tmp', '[]');
    store.record({ profileId: 'pb_r13', ip: '203.0.113.7', source: 'manager-process' });
    assertPrivateMode(store.file);
  });
  const BehaviorMonitor = require('../src/monitor/behaviorMonitor');
  await check('A3 behavior-events.json lands 0600 with a pre-loose .tmp', () => {
    const dir = tmpDir('behavior');
    const monitor = new BehaviorMonitor(dir);
    plantLoose(monitor.file + '.tmp', '[]');
    monitor.record('profile_open', 'pb_r13', 'manual');
    assertPrivateMode(monitor.file);
  });
}

async function sectionB() {
  console.log('B. Pinned-identity provenance gate (Store.saveProfile)');
  const Store = require('../src/db/store');
  const dir = tmpDir('identity');
  const store = new Store(dir);
  const create = (extra = {}, options) => store.saveProfile({
    name: 'R13 probe', engine: 'gecko', engine_type: 'camoufox',
    fingerprint: { mode: 'native', identity: structuredClone(BLOB) }, ...extra,
  }, options);
  const stored = (id) => store.data.profiles.find(p => p.id === id);
  await check('B1 a caller-supplied identity on CREATE is not persisted', () => {
    const created = create();
    assert.equal(stored(created.id).fingerprint.identity, undefined);
    assert.equal(created.fingerprint.identity, undefined);
  });
  await check('B2 the provisioning path (allowIdentity) persists the blob', () => {
    const created = create({}, { allowIdentity: true });
    assert.deepEqual(stored(created.id).fingerprint.identity, BLOB);
    return created.id;
  }).then(() => {});
  const provisioned = store.data.profiles.find(p => p.fingerprint.identity);
  await check('B3 a plain edit round-tripping the identical blob keeps it', () => {
    assert.ok(provisioned, 'precondition: a provisioned profile exists');
    const edited = store.saveProfile({
      id: provisioned.id, name: 'R13 renamed',
      fingerprint: { mode: 'native', identity: structuredClone(BLOB) },
    });
    assert.deepEqual(stored(edited.id).fingerprint.identity, BLOB);
  });
  await check('B4 an edit carrying a DIFFERENT blob cannot replace the pin', () => {
    assert.ok(provisioned, 'precondition: a provisioned profile exists');
    const tampered = structuredClone(BLOB);
    tampered.env.CAMOU_CONFIG_1 = '{"marker":"SWAPPED"}';
    store.saveProfile({
      id: provisioned.id, name: 'R13 renamed again',
      fingerprint: { mode: 'native', identity: tampered },
    });
    assert.deepEqual(stored(provisioned.id).fingerprint.identity, BLOB);
  });
  await check('B5 the same blob stamped onto a SECOND profile is refused', () => {
    const other = create();
    assert.equal(stored(other.id).fingerprint.identity, undefined);
  });
}

async function sectionD() {
  console.log('D. Update-checker fetch handling (credentials in manifest/redirect URLs)');
  const { checkForUpdateRemote } = require('../src/update/updateCheck');
  const { publicKey } = crypto.generateKeyPairSync('ed25519');
  function stubRequest(captured) {
    return (url, cb) => {
      captured.push(String(url));
      const req = { on() {}, setTimeout() {}, destroy() {} };
      process.nextTick(() => cb({
        statusCode: 302,
        headers: { location: 'https://user:pass@github.com/manifest.json' },
        resume() {},
      }));
      return req;
    };
  }
  await check('D1 a redirect to a credentialed URL is refused, never followed', async () => {
    const captured = [];
    const result = await checkForUpdateRemote({
      url: 'https://github.com/manifest.json', currentVersion: '5.8.0',
      publicKey, request: stubRequest(captured),
    });
    assert.equal(result.status, 'unreachable');
    assert.equal(result.details.reason, 'redirect-refused');
    assert.equal(captured.length, 1, 'the credentialed hop must not be requested');
  });
  await check('D2 a credentialed manifest URL is refused up front', async () => {
    const result = await checkForUpdateRemote({
      url: 'https://user:pass@github.com/manifest.json', currentVersion: '5.8.0',
      publicKey, request: stubRequest([]),
    });
    assert.equal(result.status, 'unreachable');
    assert.equal(result.details.reason, 'manifest-url-refused');
  });
}

async function sectionE() {
  console.log('E. Snapshot path discipline + release descriptor validation (verification)');
  const { safePath } = require('../src/ops/sessionSnapshots');
  await check('E1 safePath rejects traversal, absolute and reserved names', () => {
    const root = tmpDir('snap');
    for (const bad of ['../evil', 'a/../../b', '/abs', 'a//b', 'CON.txt', 'a/b:c', 'x.'])
      assert.throws(() => safePath(root, bad), /Invalid snapshot entry path|escapes/);
    const inside = safePath(root, 'Default/Cookies');
    assert.ok(inside.startsWith(path.resolve(root) + path.sep));
  });
  const { validateRelease } = require('../src/engine/camoufoxInstallService');
  const { signedPayload } = require('../src/engine/bundledEngineManager');
  const keys = crypto.generateKeyPairSync('ed25519');
  const manifest = {
    engine: 'camoufox', entry: 'camoufox.exe', schema: 1, version: '156.0.1',
    files: [{ path: 'camoufox.exe', bytes: 100, sha256: 'a'.repeat(64) }],
    signature: '',
  };
  manifest.signature = crypto.sign(null, signedPayload(manifest), keys.privateKey).toString('base64url');
  const doc = {
    schema: 1, url: 'https://github.com/lhm/lhm/releases/download/v1/camoufox.zip',
    archiveSha256: 'b'.repeat(64), archiveBytes: 4096, manifest,
  };
  await check('E2 a correctly signed descriptor validates', () => {
    const out = validateRelease(structuredClone(doc), { publicKey: keys.publicKey });
    assert.equal(out.sha256, 'b'.repeat(64));
  });
  await check('E3 http / foreign host / tampered signature are refused', () => {
    const http = structuredClone(doc); http.url = http.url.replace('https:', 'http:');
    assert.throws(() => validateRelease(http, { publicKey: keys.publicKey }));
    const host = structuredClone(doc); host.url = 'https://evil.example.com/o/r/releases/download/v/x.zip';
    assert.throws(() => validateRelease(host, { publicKey: keys.publicKey }));
    const bad = structuredClone(doc); bad.manifest = { ...manifest, version: '156.0.2' };
    assert.throws(() => validateRelease(bad, { publicKey: keys.publicKey }));
    const other = crypto.generateKeyPairSync('ed25519');
    assert.throws(() => validateRelease(structuredClone(doc), { publicKey: other.publicKey }));
  });
}

async function sectionF() {
  console.log('F. Proxy credential vault (verification)');
  const ProxyCredentialVault = require('../src/security/proxyCredentialVault');
  const codec = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from('enc:' + s, 'utf8'),
    decryptString: (b) => b.toString('utf8').replace(/^enc:/, ''),
  };
  await check('F1 vault round-trips, stores no plaintext, file is 0600', () => {
    const dir = tmpDir('vault');
    const vault = new ProxyCredentialVault(dir, codec);
    vault.set('px_0123456789abcdef', 'user-r13', 'pass-r13-marker');
    const raw = fs.readFileSync(vault.file, 'utf8');
    assert.ok(!raw.includes('pass-r13-marker'), 'plaintext password must not reach disk');
    assert.equal(vault.get('px_0123456789abcdef').pass, 'pass-r13-marker');
    assertPrivateMode(vault.file);
  });
}

async function sectionC() {
  console.log('C. Local API: auth + minimisation on success AND error paths');
  const Store = require('../src/db/store');
  const { createApiServer } = require('../src/api/server');
  const dir = tmpDir('api');
  const store = new Store(dir);
  const launcher = {
    start: async () => { throw Error('launcher disabled in audit'); },
    stop: () => ({ success: false }), listActive: () => [],
    isBusy: () => false, getActive: () => null,
    camoufoxPlaywrightController: null,
  };
  const apiKey = 'r13-audit-key';
  const app = createApiServer(store, launcher, { apiKey });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (method, route, { key, body, headers = {} } = {}) => fetch(base + route, {
    method, headers: { ...(key ? { 'x-api-key': key } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  try {
    await check('C1 missing API key -> 401', async () => {
      assert.equal((await call('GET', '/api/profiles')).status, 401);
    });
    await check('C2 any Origin header -> 403 (browser-origin lockdown)', async () => {
      const res = await call('GET', '/api/profiles', { key: apiKey, headers: { origin: 'https://evil.example' } });
      assert.equal(res.status, 403);
    });
    await check('C3 foreign Host header -> 403 (rebinding guard)', async () => {
      const status = await new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: server.address().port,
          path: '/api/profiles', headers: { host: 'evil.example:50325', 'x-api-key': apiKey } },
          (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
        req.on('error', reject); req.end();
      });
      assert.equal(status, 403);
    });
    let createdId = null;
    await check('C4 POST create: response carries no notes and no identity chunk', async () => {
      const res = await call('POST', '/api/profiles', { key: apiKey, body: {
        name: 'R13 API probe', notes: 'SECRET_NOTE_R13',
        fingerprint: { mode: 'native', identity: structuredClone(BLOB) },
      } });
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(!text.includes('SECRET_NOTE_R13'), 'notes leaked in POST response');
      assert.ok(!text.includes('SECRET_CHUNK_R13'), 'identity chunk leaked in POST response');
      createdId = JSON.parse(text).id;
    });
    await check('C5 GET list: no notes / no identity chunk for the same profile', async () => {
      const text = await (await call('GET', '/api/profiles', { key: apiKey })).text();
      assert.ok(!text.includes('SECRET_NOTE_R13'));
      assert.ok(!text.includes('SECRET_CHUNK_R13'));
    });
    await check('C6 stored profile after API create holds NO pinned identity', () => {
      const raw = store.data.profiles.find(p => p.id === createdId);
      assert.ok(raw, 'profile persisted');
      assert.equal(raw.fingerprint.identity, undefined);
    });
    await check('C7 error path (409 edit-while-running) leaks no profile fields', async () => {
      launcher.isBusy = () => true;
      const res = await call('POST', '/api/profiles', { key: apiKey, body: {
        id: createdId, name: 'R13 API probe', notes: 'SECRET_NOTE_R13',
      } });
      assert.equal(res.status, 409);
      const text = await res.text();
      assert.ok(!text.includes('SECRET_NOTE_R13'));
      launcher.isBusy = () => false;
    });
  } finally { server.close(); }
}

(async () => {
  await sectionA();
  await sectionB();
  await sectionD();
  await sectionE();
  await sectionF();
  await sectionC();
  console.log(`SECURITY-AUDIT-R13: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error('AUDIT HARNESS ERROR', error); process.exit(2); });
