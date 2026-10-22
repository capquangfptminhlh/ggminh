'use strict';
/* QA-003: profile payloads leaving over the Local API must not carry
 * the user's private notes or the pinned D1 identity blob
 * (CAMOU_CONFIG chunks + expectations). The full data stays available
 * on the verified internal paths (store / Electron IPC); this test
 * proves the projection is HTTP-output-only and breaks no consumer. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Store = require('../src/db/store');
const { createApiServer } = require('../src/api/server');

const BLOB_CHUNK = 'SYNTHETIC_CAMOU_CONFIG_CHUNK_NOT_A_REAL_IDENTITY';
const syntheticIdentity = {
  format: 'camoufox-camou-config', version: 1,
  generator: 'camoufox@0.5.8', generatedAt: '2026-10-21T00:00:00.000Z',
  constraints: { os: 'windows', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh' },
  env: { CAMOU_CONFIG_1: BLOB_CHUNK },
  expectations: { userAgent: 'SyntheticUA/1.0', webglVendor: 'SyntheticVendor' },
};

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-api-min-'));
  let server;
  try {
    const store = new Store(dir);
    // R13: this fixture simulates an ALREADY-provisioned profile, so
    // the save goes through the provisioning path flag — plain saves
    // may no longer attach a pinned identity (Store provenance gate).
    const withIdentity = store.saveProfile({
      name: 'Provisioned client', engine: 'gecko', engine_type: 'camoufox',
      group: 'Authorized', proxy: { type: 'direct' },
      notes: 'private customer note',
      fingerprint: { mode: 'native', identityProvisioning: 'provisioned', identity: syntheticIdentity },
    }, { allowIdentity: true });
    const plain = store.saveProfile({
      name: 'Plain client', engine: 'chromium', group: 'Authorized',
      proxy: { type: 'direct' }, notes: 'another private note',
    });
    const launcher = {
      isBusy: () => false, getActive: () => null,
      listActive: () => [], stop: () => ({ success: true }),
    };
    const app = createApiServer(store, launcher, { apiKey: 'min-key' });
    server = await new Promise(resolve => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = 'http://127.0.0.1:' + server.address().port;
    const get = (url, key) => fetch(base + url, { headers: key ? { 'X-API-Key': key } : {} });

    // Auth is still enforced on the minimized endpoint.
    assert.equal((await get('/api/profiles')).status, 401);

    // GET list: notes and blob are gone, everything else survives.
    const list = await (await get('/api/profiles', 'min-key')).json();
    assert.ok(Array.isArray(list));
    const a = list.find(p => p.id === withIdentity.id);
    assert.equal(a.name, 'Provisioned client');
    assert.equal(a.engine, 'gecko');
    assert.ok(!('notes' in a), 'notes must not leave over the Local API');
    assert.equal(a.fingerprint.identityProvisioning, 'provisioned');
    assert.equal(a.fingerprint.identity.redacted, true);
    assert.equal(a.fingerprint.identity.generator, 'camoufox@0.5.8');
    assert.equal(a.fingerprint.identity.format, 'camoufox-camou-config');
    assert.equal(a.fingerprint.identity.env, undefined, 'CAMOU_CONFIG chunks must not leave');
    assert.equal(a.fingerprint.identity.expectations, undefined, 'expectations must not leave');
    assert.ok(!JSON.stringify(a).includes(BLOB_CHUNK), 'blob content must not appear anywhere in the payload');
    assert.ok(!JSON.stringify(list).includes('private customer note'));
    const b = list.find(p => p.id === plain.id);
    assert.ok(!('notes' in b));
    assert.equal(b.fingerprint.identity, undefined, 'no identity may be fabricated for plain profiles');

    // The verified internal path is untouched: the store still returns
    // the full profile (notes + blob) to in-process/IPC consumers.
    const internal = store.getProfile(withIdentity.id);
    assert.equal(internal.notes, 'private customer note');
    assert.equal(internal.fingerprint.identity.env.CAMOU_CONFIG_1, BLOB_CHUNK);
    assert.equal(internal.fingerprint.identity.expectations.webglVendor, 'SyntheticVendor');

    // POST response follows the same data policy, and storing is unaffected.
    const post = await fetch(base + '/api/profiles', {
      method: 'POST',
      headers: { 'X-API-Key': 'min-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: withIdentity.id, name: 'Renamed client' }),
    });
    assert.equal(post.status, 200);
    const saved = await post.json();
    assert.equal(saved.name, 'Renamed client');
    assert.equal(saved.engine, 'gecko');
    assert.ok(!('notes' in saved));
    assert.equal(saved.fingerprint.identity.redacted, true);
    assert.equal(store.getProfile(withIdentity.id).fingerprint.identity.env.CAMOU_CONFIG_1, BLOB_CHUNK);

    // The minimized v1 list keeps its established shape.
    const v1 = await (await get('/api/v1/user/list', 'min-key')).json();
    assert.equal(v1.code, 0);
    assert.equal(v1.data.list.length, 2);
    assert.equal(v1.data.list[0].user_id, withIdentity.id);
    assert.ok(!('notes' in v1.data.list[0]));

    console.log('api-profile-minimization: all assertions passed');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
