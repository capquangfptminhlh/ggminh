'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Store = require('../src/db/store');
const { parseAdsPowerProfileJson } = require('../src/ops/adspowerJsonImport');
const { inspectProfilesCsv, importProfilesCsv } = require('../src/ops/profileCsvImport');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-adspower-metadata-'));
try {
  const store = new Store(dir);
  const payload = JSON.stringify({ data: { list: [
    {
      name: 'Agency A', group_name: 'Khách hàng A',
      open_urls: ['https://example.com/'], profile_tag_names: ['VIP', 'Marketing'],
      cookie: 'COOKIE_NEVER_PERSIST', password: 'PASSWORD_NEVER_PERSIST',
      remark: 'NOTE_MAY_CONTAIN_SECRET',
      user_proxy_config: { proxy_type: 'http', proxy_password: 'PROXY_NEVER_PERSIST' },
      fingerprint_config: { ua: 'FAKE_UA_NEVER_PERSIST' },
      username: 'ACCOUNT_NEVER_PERSIST'
    },
    { name: 'Agency B', tabs: '["https://example.org/"]', tags: ['B2B'] }
  ] } });

  const rows = parseAdsPowerProfileJson(payload);
  assert.strictEqual(rows.length, 2);
  assert(rows.every(row => row.requiresproxysetup === true));
  assert(rows.every(row => row.proxytype === 'direct'));
  assert.strictEqual(rows[0].notes, '');
  assert.strictEqual(inspectProfilesCsv(store, payload).count, 2);
  assert.strictEqual(store.getProfiles().length, 0, 'Preview must be side-effect free');

  const result = importProfilesCsv(store, payload);
  assert.strictEqual(result.count, 2);
  const saved = new Store(dir).getProfiles();
  assert.strictEqual(saved.length, 2);
  assert.strictEqual(saved[0].name, 'Agency A');
  assert.strictEqual(saved[0].group, 'Khách hàng A');
  assert.deepStrictEqual(saved[0].tags, ['VIP', 'Marketing']);
  assert.deepStrictEqual(saved[0].startUrls, ['https://example.com/']);
  assert.strictEqual(saved[1].startUrls[0], 'https://example.org/');
  assert.strictEqual(saved[0].requiresProxySetup, true, 'A migrated profile must require proxy setup');
  assert.strictEqual(saved[0].proxy.type, 'direct');
  assert.strictEqual(saved[0].fingerprint.mode, 'native');
  assert.strictEqual(saved[0].notes, '');
  const persisted = fs.readFileSync(store.dbFile, 'utf8');
  for (const marker of [
    'COOKIE_NEVER_PERSIST', 'PASSWORD_NEVER_PERSIST', 'NOTE_MAY_CONTAIN_SECRET',
    'PROXY_NEVER_PERSIST', 'FAKE_UA_NEVER_PERSIST', 'ACCOUNT_NEVER_PERSIST'
  ]) assert(!persisted.includes(marker), 'Sensitive source field leaked: ' + marker);

  const before = fs.readFileSync(store.dbFile, 'utf8');
  for (const invalid of [
    '{invalid', JSON.stringify({data:{list:[]}}),
    JSON.stringify([{name:'Bad',open_urls:['file:///etc/passwd']}]),
    JSON.stringify([{name:'Bad',tabs:['https://user:password@example.com']}]),
    JSON.stringify([{name:'Bad',open_urls:[{url:'https://example.com'}]}]),
    JSON.stringify([{name:'Bad',profile_tag_names:Array(9).fill('too-many')}]),
    JSON.stringify([{cookie:'missing-name'}]),
    JSON.stringify(Array.from({length:201},(_,i)=>({name:'item'+i})))
  ]) assert.throws(() => importProfilesCsv(store, invalid));
  assert.strictEqual(fs.readFileSync(store.dbFile, 'utf8'), before, 'Invalid import must not mutate the database');

  const originalSaveData = store.saveData;
  store.saveData = () => { throw Error('DISK_FULL_IMPORT_TEST'); };
  assert.throws(() => importProfilesCsv(store, JSON.stringify([{name:'Rollback'}])), /DISK_FULL_IMPORT_TEST/);
  store.saveData = originalSaveData;
  assert.strictEqual(fs.readFileSync(store.dbFile, 'utf8'), before, 'A failed write must leave database intact');

  const csv = 'name,group\nNative CSV,Existing';
  assert.strictEqual(inspectProfilesCsv(store, csv).count, 1, 'Existing CSV path remains supported');
  console.log('AdsPower JSON metadata migration: privacy, proxy gate, validation and rollback passed');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
