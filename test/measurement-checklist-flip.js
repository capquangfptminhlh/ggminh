'use strict';
/* Agent R15: the checklist flip, end to end at provider level.
 * Tier: UI logic in pure Node with a window stub (like Agent 9's
 * provider test) — NOT packaged-app evidence (Section 23). Proves
 * the wiring Agent 9 specified and R15 built:
 *  - with a real MeasurementRecordStore behind the data-source seam
 *    and a matching currentContext, a profile's three stage-0
 *    criteria move from CHƯA ĐO (no record — reason stated) to
 *    evidence-backed PASS once a valid record is stored;
 *  - the provider's DEFAULT path (no seam) now picks the record up
 *    through window.api.getProfileMeasurement, and an api without
 *    that method keeps the honest "not wired" reason;
 *  - every Section-23 validity-gate refusal (wrong profile, expired,
 *    simulated tier, missing commit/engine binding, commit/engine
 *    mismatch, wrong format) surfaces as CHƯA ĐO with the SPECIFIC
 *    reason on all three criteria.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const PROVIDER = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'criteriaChecklistProvider.js'), 'utf8');
const { MeasurementRecordStore, RECORD_FORMAT, RECORD_VERSION } = require('../src/measurement/measurementRecords');

let failures = 0;
function check(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log('PASS', name),
    (e) => { failures++; console.log('FAIL', name, '-', String(e.message || e)); });
}

const COMMIT = 'f28029655e59aa020d8a040521747a7c43c15e36';
const ENGINE_SHA = 'a'.repeat(64);
const PROFILE = { id: 'prof_a', name: 'Profile A',
  fingerprint: { mode: 'native', identity: { format: 'pinned' } } };
const CONTEXT = { appCommit: COMMIT, engineSha256: ENGINE_SHA };

function validRecord(overrides = {}) {
  return {
    format: RECORD_FORMAT, version: RECORD_VERSION,
    profileId: 'prof_a', measuredAt: new Date().toISOString(),
    appCommit: COMMIT, engine: { version: '156.0.1-beta.36', sha256: ENGINE_SHA },
    os: 'linux', environment: 'flip test', tier: 'real-engine', method: 'flip test method',
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

function makeProvider() {
  const windowStub = {};
  const sandbox = { window: windowStub, console };
  vm.createContext(sandbox);
  vm.runInContext(PROVIDER, sandbox);
  return windowStub;
}
const entryOf = (model, id) => model.entries.find(e => e.id === id);
const STAGE0 = ['storage-isolation', 'self-consistency', 'pinned-identity'];

async function main() {
  await check('flip: no record -> CHƯA ĐO with reason; stored valid record -> PASS x3 with evidence', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-flip-'));
    try {
      const store = new MeasurementRecordStore(dir);
      const w = makeProvider();
      w.LHMCriteriaChecklistDataSource = async () => ({
        profile: PROFILE, warningReport: null,
        measurementRecord: store.getForProfile('prof_a'), currentContext: CONTEXT,
      });
      let model = await w.LHMCriteriaChecklistProvider('prof_a');
      for (const id of STAGE0) {
        assert.equal(entryOf(model, id).status, 'unmeasured', id + ' before record');
        assert.match(entryOf(model, id).evidence, /không có bản ghi nào/);
      }
      const savedRecord = validRecord();
      assert.equal(store.save(savedRecord).ok, true);
      model = await w.LHMCriteriaChecklistProvider('prof_a');
      const iso = entryOf(model, 'storage-isolation');
      assert.equal(iso.status, 'pass', JSON.stringify(iso));
      assert.match(iso.evidence, /3\/6 điều kiện/);
      assert.match(iso.limit, /crashRecovery/, 'not-run conditions must be named in the limit');
      const cons = entryOf(model, 'self-consistency');
      assert.equal(cons.status, 'pass', JSON.stringify(cons));
      assert.match(cons.evidence, /5 điểm/);
      const pin = entryOf(model, 'pinned-identity');
      assert.equal(pin.status, 'pass', JSON.stringify(pin));
      assert.match(pin.evidence, /14\/14/);
      assert.equal(pin.observedAt, savedRecord.measuredAt,
        'the entry must carry the record\'s own measurement time');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  await check('default api path: getProfileMeasurement is picked up; absent method keeps not-wired reason', async () => {
    const record = validRecord();
    const w1 = makeProvider();
    w1.api = {
      getProfiles: async () => [PROFILE],
      getWarningReport: async () => null,
      getProfileMeasurement: async (id) => ({ record: id === 'prof_a' ? record : null, currentContext: CONTEXT }),
    };
    const model1 = await w1.LHMCriteriaChecklistProvider('prof_a');
    for (const id of STAGE0) assert.equal(entryOf(model1, id).status, 'pass', id + ' via api path');

    const w2 = makeProvider();
    w2.api = {
      getProfiles: async () => [PROFILE],
      getWarningReport: async () => null,
    };
    const model2 = await w2.LHMCriteriaChecklistProvider('prof_a');
    for (const id of STAGE0) {
      assert.equal(entryOf(model2, id).status, 'unmeasured', id + ' without the api method');
      assert.match(entryOf(model2, id).evidence, /chưa nối nguồn hồ sơ đo/);
    }
  });

  const negatives = [
    ['record belongs to another profile', { profileId: 'prof_other' }, CONTEXT, /thuộc về hồ sơ khác/],
    ['record older than 30 days', { measuredAt: new Date(Date.now() - 31 * 86400000).toISOString() }, CONTEXT, /quá hạn 30 ngày/],
    ['simulated tier', { tier: 'simulated' }, CONTEXT, /mô phỏng/],
    ['record without app commit', { appCommit: '' }, CONTEXT, /không gắn commit ứng dụng/],
    ['record without engine hash', { engine: { version: '156.0.1-beta.36' } }, CONTEXT, /không gắn hash/],
    ['wrong format', { format: 'something-else' }, CONTEXT, /không đúng định dạng/],
    ['commit mismatch vs running app', {}, { appCommit: 'e'.repeat(40), engineSha256: ENGINE_SHA }, /commit ứng dụng khác/],
    ['engine mismatch vs running app', {}, { appCommit: COMMIT, engineSha256: 'b'.repeat(64) }, /engine khác/],
  ];
  for (const [name, patch, context, pattern] of negatives) {
    await check('gate refusal: ' + name, async () => {
      const w = makeProvider();
      const record = validRecord(patch);
      w.LHMCriteriaChecklistDataSource = async () => ({
        profile: PROFILE, warningReport: null, measurementRecord: record, currentContext: context,
      });
      const model = await w.LHMCriteriaChecklistProvider('prof_a');
      for (const id of STAGE0) {
        const entry = entryOf(model, id);
        assert.equal(entry.status, 'unmeasured', id + ' must stay unmeasured');
        assert.match(entry.evidence, pattern,
          id + ' must carry the specific reason, got: ' + entry.evidence);
      }
    });
  }

  await check('gate refusal: malformed (non-object) record and measured-error blocks stay unmeasured with reasons', async () => {
    const w = makeProvider();
    w.LHMCriteriaChecklistDataSource = async () => ({
      profile: PROFILE, warningReport: null, measurementRecord: 'garbage', currentContext: CONTEXT,
    });
    let model = await w.LHMCriteriaChecklistProvider('prof_a');
    assert.match(entryOf(model, 'pinned-identity').evidence, /không phải một đối tượng/);

    const errored = validRecord();
    errored.results.configured = { status: 'error', reason: 'engine launch failed' };
    errored.results.isolation = { status: 'error', reason: 'pair launch failed' };
    w.LHMCriteriaChecklistDataSource = async () => ({
      profile: PROFILE, warningReport: null, measurementRecord: errored, currentContext: CONTEXT,
    });
    model = await w.LHMCriteriaChecklistProvider('prof_a');
    assert.match(entryOf(model, 'storage-isolation').evidence, /pair launch failed/);
    assert.match(entryOf(model, 'pinned-identity').evidence, /engine launch failed/);
    for (const id of STAGE0) assert.equal(entryOf(model, id).status, 'unmeasured', id);
  });

  console.log(failures ? ('measurement-checklist-flip: ' + failures + ' FAIL') : 'measurement-checklist-flip: PASS');
  process.exitCode = failures ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
