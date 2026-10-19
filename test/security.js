const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Store = require('../src/db/store');
const { createApiServer } = require('../src/api/server');

(async () => {
  const location = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-browser-'));
  const store = new Store(location);
  try {
    assert.throws(() => store.saveProfile({ name: 'bad', id: '../escape' }), /Invalid profile ID/);
    assert.throws(() => store.saveProfile({ name: 'bad', proxy: { type: 'http', user: 'x', pass: 'p' } }), /not supported/);
    assert.throws(() => store.saveProfile({
      name:'Secret blocked', proxy:{type:'http',host:'proxy.test',port:8080,username:'alice'}
    }), /not supported/);
    assert.throws(() => store.saveProfile({
      name:'Invalid endpoint',proxy:{type:'http',host:'https://evil.test',port:8080}
    }), /không hợp lệ/);
    const normalized=store.saveProfile({
      name:'No hidden fields',proxy:{type:'http',host:'proxy.example',port:'8080',customCredential:'SHOULD_NOT_PERSIST'}
    });
    assert.strictEqual(normalized.proxy.port,8080);
    assert(!fs.readFileSync(store.dbFile,'utf8').includes('SHOULD_NOT_PERSIST'));
    store.deleteProfile(normalized.id);
    const added = store.saveProfile({ name: 'Google Ads company', group: 'Authorized', proxy: { type: 'direct' } });
    assert(added.id.startsWith('pb_'));
    assert.strictEqual(added.fingerprint.mode, 'native');
    assert(fs.existsSync(store.dbFile));
    assert.strictEqual(store.getProfiles().length, 1);
    const app = createApiServer(store, { listActive: () => [], stop: () => ({ success: true }) }, { apiKey: 'test-secret' });
    const server = await new Promise(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
      const port = server.address().port;
      const url = 'http://127.0.0.1:' + port + '/api/profiles';
      const unauthorized = await fetch(url);
      assert.strictEqual(unauthorized.status, 401);
      const crossOrigin = await fetch(url, { headers: { Origin: 'https://example.com', 'X-API-Key': 'test-secret' } });
      assert.strictEqual(crossOrigin.status, 403);
      const valid = await fetch(url, { headers: { 'X-API-Key': 'test-secret' } });
      assert.strictEqual(valid.status, 200);
      assert.strictEqual((await valid.json())[0].name, 'Google Ads company');
    } finally { await new Promise(resolve => server.close(resolve)); }
    console.log('Security and profile storage tests passed');
  } finally { fs.rmSync(location, { force: true, recursive: true }); }
})().catch(err => { console.error(err); process.exitCode = 1; });
