'use strict';
/* Agent R15: measurement record store + contract validation.
 * Tier: pure Node unit tests (fs/os only) — NOT evidence about the
 * packaged app (Constitution Section 23). Covers:
 *  - lhm-profile-measurement v1 shape validation: every refusal
 *    carries a specific reason and persists nothing;
 *  - store durability pattern mirrored from the fixed exit-IP
 *    store: atomic tmp+rename at mode 0o600, newest record per
 *    profile wins, no age pruning (the provider gate must see an
 *    expired record to name the expiry reason);
 *  - corrupt evidence file: preserved as a .corrupt-* sibling and
 *    REPORTED via status(), never silently dropped; entries that
 *    fail the contract shape inside a parseable file are counted
 *    in status() the same way;
 *  - the runner's pure shaping helpers (identity accumulation,
 *    consistency checks).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  MeasurementRecordStore, validateMeasurementRecord, assembleRecord,
  RECORD_FORMAT, RECORD_VERSION,
} = require('../src/measurement/measurementRecords');
const { mergeIdentityResults, consistencyFromObservation } = require('../tools/measure-profile');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('PASS', name); }
  catch (e) { failures++; console.log('FAIL', name, '-', String(e.message || e)); }
}

const SHA = 'a'.repeat(64);
function validRecord(overrides = {}) {
  return {
    format: RECORD_FORMAT, version: RECORD_VERSION,
    profileId: 'prof_a', measuredAt: new Date().toISOString(),
    appCommit: 'f28029655e59aa020d8a040521747a7c43c15e36',
    engine: { version: '156.0.1-beta.36', sha256: SHA },
    os: 'linux', environment: 'unit test', tier: 'real-engine',
    method: 'unit test method',
    results: {
      configured: { status: 'measured',
        identity: { compared: 14, matched: 14, mismatches: [] },
        consistency: { checked: 5, inconsistent: [] } },
      isolation: { status: 'measured', pairedProfileId: 'prof_b',
        conditions: { baselineClassic: 'pass', concurrentCrossWrite: 'pass',
          crashRecovery: 'not_run', crashRecoveryIdleFlush: 'not_run',
          httpCache: 'pass', faviconCache: 'not_run' } },
    },
    ...overrides,
  };
}

check('valid record passes validation; assembleRecord round-trips', () => {
  assert.equal(validateMeasurementRecord(validRecord()), null);
  const built = assembleRecord({
    profileId: 'prof_x', appCommit: 'abc1234', os: 'linux', tier: 'real-engine',
    engine: { version: '1.0', sha256: SHA }, method: 'm',
    configured: { status: 'error', reason: 'boom' },
    isolation: { status: 'error', reason: 'boom' },
  });
  assert.equal(built.format, RECORD_FORMAT);
  assert.equal(validateMeasurementRecord(built), null);
  assert.throws(() => assembleRecord({ profileId: 'p', engine: {} }), /Refusing to assemble/);
});

check('save/get round-trip: file mode 0600, no temp left, deep-equal record', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-mr-'));
  try {
    const store = new MeasurementRecordStore(dir);
    assert.equal(store.status().load.status, 'empty');
    const rec = validRecord();
    const saved = store.save(rec);
    assert.equal(saved.ok, true);
    const file = path.join(dir, 'measurement-records.json');
    assert.ok(fs.existsSync(file));
    assert.ok(!fs.existsSync(file + '.tmp'), 'temp file must not survive the rename');
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'records file must be 0600');
    }
    const reloaded = new MeasurementRecordStore(dir);
    assert.deepEqual(reloaded.getForProfile('prof_a'), rec);
    assert.equal(reloaded.getForProfile('nobody'), null);
    assert.equal(reloaded.status().load.status, 'ok');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

check('newest record per profile wins; records are NOT pruned by age', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-mr-'));
  try {
    const store = new MeasurementRecordStore(dir);
    const old = validRecord({ measuredAt: new Date(Date.now() - 90 * 86400000).toISOString(),
      method: 'old run' });
    assert.equal(store.save(old).ok, true);
    // An expired record must still be retrievable: the provider
    // gate needs it to report the specific "too old" reason.
    assert.equal(store.getForProfile('prof_a').method, 'old run');
    const fresh = validRecord({ method: 'fresh run' });
    assert.equal(store.save(fresh).ok, true);
    assert.equal(store.list().length, 1);
    assert.equal(store.getForProfile('prof_a').method, 'fresh run');
    assert.equal(store.save(validRecord({ profileId: 'prof_b' })).ok, true);
    assert.equal(store.list().length, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

check('every contract violation is refused with a specific reason and persists nothing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-mr-'));
  try {
    const store = new MeasurementRecordStore(dir);
    const cases = [
      ['wrong format', { format: 'other' }, /định dạng/],
      ['wrong version', { version: 2 }, /định dạng/],
      ['empty profileId', { profileId: '' }, /profileId/],
      ['bad measuredAt', { measuredAt: 'not-a-date' }, /measuredAt/],
      ['missing appCommit', { appCommit: '' }, /commit/],
      ['missing engine sha', { engine: { version: '1' } }, /SHA-256/],
      ['engine sha not hex', { engine: { version: '1', sha256: 'xyz' } }, /SHA-256/],
      ['missing os', { os: '' }, /os/],
      ['missing tier', { tier: '' }, /tier/],
      ['missing method', { method: '' }, /method/],
      ['missing results', { results: null }, /results/],
    ];
    for (const [name, patch, pattern] of cases) {
      const rec = validRecord(patch);
      const res = store.save(rec);
      assert.equal(res.ok, false, name + ' must be refused');
      assert.match(res.reason, pattern, name + ' reason must be specific: ' + res.reason);
    }
    const badStatus = validRecord();
    badStatus.results.configured = { status: 'done' };
    assert.match(store.save(badStatus).reason, /status/);
    const errorNoReason = validRecord();
    errorNoReason.results.configured = { status: 'error' };
    assert.match(store.save(errorNoReason).reason, /lý do/);
    const matchedTooBig = validRecord();
    matchedTooBig.results.configured.identity = { compared: 3, matched: 4, mismatches: [] };
    assert.match(store.save(matchedTooBig).reason, /identity/);
    const badCondition = validRecord();
    badCondition.results.isolation.conditions = { baselineClassic: 'passed' };
    assert.match(store.save(badCondition).reason, /baselineClassic/);
    const unknownCondition = validRecord();
    unknownCondition.results.isolation.conditions = { teleportation: 'pass' };
    assert.match(store.save(unknownCondition).reason, /không thuộc hợp đồng/);
    assert.equal(store.list().length, 0, 'no refused record may be persisted');
    assert.ok(!fs.existsSync(path.join(dir, 'measurement-records.json')),
      'no file may be created by refused saves');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

check('corrupt file is preserved as .corrupt-* and REPORTED, store restarts usable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-mr-'));
  try {
    const file = path.join(dir, 'measurement-records.json');
    fs.writeFileSync(file, '{"torn write, not json');
    const store = new MeasurementRecordStore(dir);
    const status = store.status();
    assert.equal(status.load.status, 'error');
    assert.ok(status.load.preservedFile && status.load.preservedFile.includes('.corrupt-'),
      'status must name the preserved sibling: ' + JSON.stringify(status.load));
    const siblings = fs.readdirSync(dir).filter(f => f.includes('.corrupt-'));
    assert.equal(siblings.length, 1);
    assert.equal(fs.readFileSync(path.join(dir, siblings[0]), 'utf8'), '{"torn write, not json',
      'the original bytes must survive in the preserved copy');
    assert.equal(store.list().length, 0);
    assert.equal(store.save(validRecord()).ok, true, 'store must accept new records after preservation');
    // Non-array JSON is equally unusable as a record file.
    fs.writeFileSync(file, '{"not":"an array"}');
    const store2 = new MeasurementRecordStore(dir);
    assert.equal(store2.status().load.status, 'error');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

check('shape-invalid entries inside a parseable file are dropped AND counted in status', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-mr-'));
  try {
    const file = path.join(dir, 'measurement-records.json');
    fs.writeFileSync(file, JSON.stringify([validRecord(), { format: 'junk' }, null]));
    const store = new MeasurementRecordStore(dir);
    assert.equal(store.list().length, 1);
    assert.equal(store.status().invalidDropped, 2);
    assert.equal(store.status().load.invalidDropped, 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

check('mergeIdentityResults accumulates compared/matched and dedupes mismatches', () => {
  const r1 = { compared: 7, fields: {
    userAgent: { expected: 'UA', observed: 'UA', match: true },
    timezone: { expected: 'X', observed: 'Y', match: false },
    platform: { expected: null, observed: 'Win32', match: null } } };
  const r2 = { compared: 6, fields: {
    userAgent: { expected: 'UA', observed: 'UA', match: true },
    timezone: { expected: 'X', observed: 'Z', match: false } } };
  const merged = mergeIdentityResults(r1, r2);
  assert.equal(merged.compared, 13);
  assert.equal(merged.matched, 2);
  assert.equal(merged.mismatches.length, 1);
  assert.equal(merged.mismatches[0].field, 'timezone');
  assert.equal(merged.mismatches[0].observed, 'Y', 'first observation of a mismatch wins');
});

check('consistencyFromObservation: coherent values pass; each incoherence is named', () => {
  const exposed = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/140.0',
    platform: 'Win32', language: 'en-US', languages: ['en-US', 'en'],
    timezone: 'America/New_York', intlLocale: 'en-US',
  };
  const ok = consistencyFromObservation(exposed, { points: {} }, {});
  assert.ok(ok.checked >= 4, 'coherent set must evaluate at least 4 checks, got ' + ok.checked);
  assert.deepEqual(ok.inconsistent, []);
  const bad = consistencyFromObservation(
    { ...exposed, languages: ['vi-VN'], intlLocale: 'fr-FR', platform: 'MacIntel' },
    { points: {} }, {});
  const points = bad.inconsistent.map(x => x.point);
  assert.ok(points.includes('navigator.languages'));
  assert.ok(points.includes('locale.intl'));
  assert.ok(points.includes('navigator.platform'));
  const badTz = consistencyFromObservation({ ...exposed, timezone: 'Not/AZone!' }, { points: {} }, {});
  assert.ok(badTz.inconsistent.some(x => x.point === 'intl.timezone'));
});

check('consistencyFromObservation: WebGL counts only when comparable', () => {
  const exposed = { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Firefox/140.0',
    platform: 'Win32', language: 'en-US', languages: ['en-US'],
    timezone: 'UTC', intlLocale: 'en-US' };
  const expectations = { webglVendor: 'VendorA', webglRenderer: 'RendererA' };
  const blocked = consistencyFromObservation(exposed,
    { points: { 'webgl.vendorRenderer': { status: 'BLOCKED' } } }, expectations);
  const measuredOk = consistencyFromObservation(exposed,
    { points: { 'webgl.vendorRenderer': { status: 'MEASURED',
      value: { vendor: 'VendorA', renderer: 'RendererA' } } } }, expectations);
  const measuredBad = consistencyFromObservation(exposed,
    { points: { 'webgl.vendorRenderer': { status: 'MEASURED',
      value: { vendor: 'Other', renderer: 'RendererA' } } } }, expectations);
  assert.equal(measuredOk.checked, blocked.checked + 1, 'a comparable WebGL point adds one check');
  assert.deepEqual(measuredOk.inconsistent, []);
  assert.ok(measuredBad.inconsistent.some(x => x.point === 'webgl.vendorRenderer'));
});

check('forgetProfile removes only that profile record and persists (purge surface)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-mr-'));
  try {
    const store = new MeasurementRecordStore(dir);
    assert.equal(store.save(validRecord({ profileId: 'prof_a' })).ok, true);
    assert.equal(store.save(validRecord({ profileId: 'prof_b' })).ok, true);
    assert.equal(store.forgetProfile('prof_a'), 1);
    assert.equal(store.getForProfile('prof_a'), null);
    assert.ok(store.getForProfile('prof_b'), 'other profile record untouched');
    // Persisted: a fresh store over the same directory agrees.
    const reloaded = new MeasurementRecordStore(dir);
    assert.equal(reloaded.getForProfile('prof_a'), null);
    assert.equal(reloaded.list().length, 1);
    // Forgetting an unknown profile is a no-op and reports 0.
    assert.equal(store.forgetProfile('prof_missing'), 0);
    assert.equal(store.list().length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

console.log(failures ? ('measurement-records: ' + failures + ' FAIL') : 'measurement-records: PASS');
process.exitCode = failures ? 1 : 0;
