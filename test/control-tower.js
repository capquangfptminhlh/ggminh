const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Store = require('../src/db/store');
const { duplicateTemplate, batchStop, overview, uniqueIds, exportCsv } = require('../src/ops/operations');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-control-tower-'));
try {
  const store = new Store(dir);
  const original = store.saveProfile({
    name: '=SUM(1+1)', group: 'Company A', engine: 'chromium',
    startUrl: 'https://example.com',
    proxy: { type: 'http', host: 'proxy.example', port: '8080' },
    fingerprint: { userAgent: 'old UA', audioNoiseSeed: 42 },
    notes: 'PRIVATE-NOTES'
  });
  const clone = duplicateTemplate(store, original.id);
  assert.notStrictEqual(clone.id, original.id);
  assert.strictEqual(clone.group, original.group);
  assert.deepStrictEqual(clone.fingerprint, {});
  assert.strictEqual(clone.notes, '');
  assert(!fs.existsSync(path.join(dir, 'profiles', clone.id)));
  assert.throws(() => duplicateTemplate(store, '../oops'), /Invalid profile ID/);
  assert.throws(() => uniqueIds([]), /1 đến 50/);
  assert.throws(() => uniqueIds(Array.from({ length: 51 }, (_, i) => 'id'+i)), /1 đến 50/);
  const actions = [];
  const launcher = { stop(id) { actions.push(id); return id === original.id ? { success: true } : { success: false }; } };
  const monitor = { record(action, id, source) { actions.push([action,id,source]); } };
  const result = batchStop(store, launcher, [original.id, clone.id, original.id, 'missing'], monitor);
  assert.strictEqual(result.requested, 3);
  assert.strictEqual(result.stopped, 1);
  assert.deepStrictEqual(actions, [original.id, ['profile_close',original.id,'manual'], clone.id]);
  const reports = [
    { profileId:original.id, status:'warning', issues:[{ level:'warning',message:'UA old' }] },
    { profileId:clone.id, status:'ready', issues:[] }
  ];
  const profiles = store.getProfiles();
  const active = [{ profileId:original.id }];
  const snapshot = overview(profiles,active,reports,{ alertCount:2, alerts:[], recentEvents:[] });
  assert.strictEqual(snapshot.total, 2);
  assert.strictEqual(snapshot.active, 1);
  assert.strictEqual(snapshot.warningCount, 1);
  assert.strictEqual(snapshot.groups[0].name, 'Company A');
  assert.strictEqual(snapshot.groups[0].total, 2);
  const csv = exportCsv(profiles,reports,active);
  assert(csv.charCodeAt(0) === 0xfeff);
  assert(csv.includes("\"'=SUM(1+1)\""));
  assert(!csv.includes('PRIVATE-NOTES'));
  assert(!csv.includes('old UA'));
  assert(csv.includes('"proxy.example"'));
  console.log('Control Tower bulk operations, cloning, health and CSV tests passed');
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
