'use strict';
/* Agent 9 (commercial round): criteria checklist data provider.
 * Tier: UI logic tests in pure Node with a DOM stub — NOT evidence
 * about the packaged app (Constitution Section 23). Covers:
 *  - provider-level mapping for all six criteria: pass / fail /
 *    unmeasured branches, incl. the measurement-record validity
 *    gate (expiry, commit/engine binding, tier, profile binding);
 *  - frame-level contract: no provider / provider throws /
 *    malformed model / async rejection -> all CHUA DO; async
 *    provider results render when settled; stale results for a
 *    previously selected profile never overwrite the current one.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FRAME = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'criteriaChecklist.js'), 'utf8');
const PROVIDER = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'criteriaChecklistProvider.js'), 'utf8');
const CRITERIA_ORDER = ['storage-isolation', 'self-consistency', 'pinned-identity',
  'cross-profile-coincidence', 'network-route', 'no-unexpected-drift'];

class El {
  constructor(tag) {
    this.tagName = tag; this.className = ''; this.children = [];
    this.dataset = {}; this.hidden = false; this._text = ''; this.listeners = {};
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  append(...kids) { this.children.push(...kids); }
  replaceChildren() { this.children = []; this._text = ''; }
  addEventListener(kind, fn) { this.listeners[kind] = fn; }
}

function makeEnv({ withProvider = true } = {}) {
  const registry = {
    'criteria-checklist': new El('div'),
    'criteria-checklist-live': new El('button'),
    'criteria-checklist-sample': new El('button'),
  };
  const documentStub = {
    readyState: 'complete',
    createElement: (tag) => new El(tag),
    getElementById: (id) => registry[id] || null,
    addEventListener() {},
  };
  const windowStub = {};
  const sandbox = { window: windowStub, document: documentStub, console };
  vm.createContext(sandbox);
  vm.runInContext(FRAME, sandbox);
  if (withProvider) vm.runInContext(PROVIDER, sandbox);
  return { window: windowStub, container: registry['criteria-checklist'] };
}

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };

function rowsOf(container) {
  return container.children.filter(c => c.className === 'criteria-row');
}
function chipOf(row) { return row.children[0].children[1]; }
function frameStatus(env, criterionId) {
  const row = rowsOf(env.container)[CRITERIA_ORDER.indexOf(criterionId)];
  assert.ok(row, 'row exists for ' + criterionId);
  return { chip: chipOf(row).className, text: row.textContent };
}

async function providerEntries(env, profileId) {
  const model = await env.window.LHMCriteriaChecklistProvider(profileId);
  const byId = {};
  for (const e of model.entries) byId[e.id] = e;
  return byId;
}

// --- factories ------------------------------------------------------
function ipWarn(code, profiles, summary) {
  return { source: 'ip-observations', code, title: code,
    observed: { summary: summary || code, profiles, sessionIds: [], count: null,
      values: { measurementSource: 'browser-runtime' } },
    lastDetectedAt: '2026-10-21T14:59:00.000Z', evaluatedAt: '2026-10-21T15:00:00.000Z',
    method: 'D3', limitation: 'gioi han D3', nextSteps: ['buoc xu ly'] };
}
function driftWarn(profiles, summary) {
  return { source: 'health-drift', code: 'drift_error_rate_increase', title: 'drift',
    observed: { summary, profiles, sessionIds: [], count: null, values: {} },
    evaluatedAt: '2026-10-21T15:00:00.000Z',
    method: 'Health Drift', limitation: 'gioi han drift', nextSteps: ['buoc xu ly'] };
}
function warningReport({ ip = { status: 'ok', runtimeProfiles: ['p1'] }, drift = { status: 'ok', driftStatus: 'stable' }, warnings = [] } = {}) {
  return { evaluatedAt: '2026-10-21T15:00:00.000Z',
    sources: { ipWarnings: ip, healthDrift: drift }, warnings };
}
function profileWithIdentity() {
  return { id: 'p1', name: 'Ho so 1', fingerprint: { mode: 'native', identity: { format: 'camoufox-camou-config' } } };
}
function goodRecord(over) {
  return Object.assign({
    format: 'lhm-profile-measurement', version: 1, profileId: 'p1',
    measuredAt: new Date(Date.now() - 3600e3).toISOString(),
    appCommit: 'abc1234', engine: { version: '156.0.1-beta.36', sha256: 'deadbeef' },
    os: 'linux', environment: 'Linux, Xvfb', tier: 'real-engine',
    method: 'stage0 run-config + run-isolation qua controller',
    results: {
      configured: { status: 'measured',
        identity: { compared: 7, matched: 7, mismatches: [] },
        consistency: { checked: 12, inconsistent: [] } },
      isolation: { status: 'measured', pairedProfileId: 'p2',
        conditions: { baselineClassic: 'pass', concurrentCrossWrite: 'pass',
          crashRecovery: 'not_run', crashRecoveryIdleFlush: 'pass',
          httpCache: 'pass', faviconCache: 'not_run' } },
    },
  }, over);
}
function envWithData(data) {
  const env = makeEnv();
  env.window.LHMCriteriaChecklistDataSource = async () => data;
  return env;
}

(async () => {
  // --- provider level ------------------------------------------------
  { // 1: IP warnings name the profile -> route + coincidence fail
    const env = envWithData({ warningReport: warningReport({ warnings: [
      ipWarn('ip_changed_mid_session', ['p1'], 'IP doi giua phien'),
      ipWarn('shared_exit_ip', ['p1', 'p2'], 'Chung IP thoat'),
    ] }), measurementRecord: null });
    const e = await providerEntries(env, 'p1');
    assert.equal(e['network-route'].status, 'unmeasured', 'IP change alone does not prove a route-policy violation');
    assert.equal(e['cross-profile-coincidence'].status, 'fail');
    console.log('PASS provider ip fail branches');
  }
  { // 2: measured sources, no warnings, no record
    const env = envWithData({ warningReport: warningReport({}), measurementRecord: null });
    const e = await providerEntries(env, 'p1');
    assert.equal(e['network-route'].status, 'unmeasured', 'one runtime sample without declared-route comparison is not acceptance');
    assert.match(e['network-route'].limit, /chính sách|tuyến/i);
    assert.equal(e['network-route'].observedAt, '', 'evaluation time must not masquerade as measurement time');
    assert.equal(e['no-unexpected-drift'].status, 'unmeasured');
    assert.match(e['no-unexpected-drift'].evidence, /toàn đội/);
    for (const id of ['storage-isolation', 'self-consistency', 'pinned-identity']) {
      assert.equal(e[id].status, 'unmeasured', id);
      assert.match(e[id].evidence, /không có bản ghi/i);
    }
    console.log('PASS provider measured-but-empty branches');
  }
  { // 2b: manager process is useful context, but not runtime evidence
    const env = envWithData({ warningReport: warningReport({
      ip: { status: 'ok', runtimeProfiles: [], managerProfiles: ['p1'] },
    }), measurementRecord: null });
    const e = await providerEntries(env, 'p1');
    assert.equal(e['network-route'].status, 'unmeasured');
    assert.match(e['network-route'].evidence, /tiến trình quản lý/i);
    assert.match(e['network-route'].limit, /không thay thế/i);
    console.log('PASS provider manager-only remains unmeasured');
  }
  { // 3: good record -> three stage0 criteria pass with exact counts
    const env = envWithData({ warningReport: warningReport({}),
      measurementRecord: goodRecord(), profile: profileWithIdentity() });
    const e = await providerEntries(env, 'p1');
    assert.equal(e['pinned-identity'].status, 'pass');
    assert.match(e['pinned-identity'].evidence, /7\/7/);
    assert.equal(e['self-consistency'].status, 'pass');
    assert.match(e['self-consistency'].evidence, /12/);
    assert.equal(e['storage-isolation'].status, 'pass');
    assert.match(e['storage-isolation'].limit, /crashRecovery/);
    console.log('PASS provider record pass branches');
  }
  { // 4: record with violations -> three fails with specifics
    const rec = goodRecord();
    rec.results.configured.identity = { compared: 7, matched: 6,
      mismatches: [{ field: 'timezone', expected: 'Asia/Ho_Chi_Minh', observed: 'UTC' }] };
    rec.results.configured.consistency = { checked: 12,
      inconsistent: [{ point: 'webgl.vendorRenderer', summary: 'khac khai bao' }] };
    rec.results.isolation.conditions.crashRecovery = 'fail';
    const env = envWithData({ warningReport: warningReport({}),
      measurementRecord: rec, profile: profileWithIdentity() });
    const e = await providerEntries(env, 'p1');
    assert.equal(e['pinned-identity'].status, 'fail');
    assert.match(e['pinned-identity'].evidence, /6\/7/);
    assert.match(e['pinned-identity'].evidence, /timezone/);
    assert.equal(e['self-consistency'].status, 'fail');
    assert.equal(e['storage-isolation'].status, 'fail');
    assert.match(e['storage-isolation'].evidence, /crashRecovery/);
    console.log('PASS provider record fail branches');
  }
  { // 5: expired record -> unmeasured with the expiry reason
    const rec = goodRecord({ measuredAt: new Date(Date.now() - 40 * 86400e3).toISOString() });
    const env = envWithData({ warningReport: warningReport({}),
      measurementRecord: rec, profile: profileWithIdentity() });
    const e = await providerEntries(env, 'p1');
    for (const id of ['storage-isolation', 'self-consistency', 'pinned-identity']) {
      assert.equal(e[id].status, 'unmeasured', id);
      assert.match(e[id].evidence, /quá hạn/);
    }
    console.log('PASS provider record expiry gate');
  }
  { // 6: commit / engine binding mismatch -> unmeasured, specific reason
    const envA = envWithData({ warningReport: warningReport({}),
      measurementRecord: goodRecord(), profile: profileWithIdentity(),
      currentContext: { appCommit: 'ffffff0', engineSha256: 'deadbeef' } });
    const eA = await providerEntries(envA, 'p1');
    assert.equal(eA['pinned-identity'].status, 'unmeasured');
    assert.match(eA['pinned-identity'].evidence, /commit/);
    const envB = envWithData({ warningReport: warningReport({}),
      measurementRecord: goodRecord(), profile: profileWithIdentity(),
      currentContext: { appCommit: 'abc1234', engineSha256: 'cafef00d' } });
    const eB = await providerEntries(envB, 'p1');
    assert.equal(eB['pinned-identity'].status, 'unmeasured');
    assert.match(eB['pinned-identity'].evidence, /engine khác/);
    console.log('PASS provider record binding gates');
  }
  { // 7+8+16: tier, foreign profile, bad format -> unmeasured
    const envTier = envWithData({ warningReport: warningReport({}),
      measurementRecord: goodRecord({ tier: 'mock' }), profile: profileWithIdentity() });
    assert.match((await providerEntries(envTier, 'p1'))['pinned-identity'].evidence, /tầng/);
    const envForeign = envWithData({ warningReport: warningReport({}),
      measurementRecord: goodRecord({ profileId: 'someone-else' }), profile: profileWithIdentity() });
    assert.match((await providerEntries(envForeign, 'p1'))['pinned-identity'].evidence, /hồ sơ khác/);
    const envFmt = envWithData({ warningReport: warningReport({}),
      measurementRecord: goodRecord({ format: 'other' }), profile: profileWithIdentity() });
    assert.match((await providerEntries(envFmt, 'p1'))['pinned-identity'].evidence, /định dạng/);
    console.log('PASS provider record tier/profile/format gates');
  }
  { // 9: profile without pinned identity -> pinned unmeasured even with a good record
    const env = envWithData({ warningReport: warningReport({}),
      measurementRecord: goodRecord(),
      profile: { id: 'p1', name: 'Ho so 1', fingerprint: { mode: 'native', identityProvisioning: 'unavailable' } } });
    const e = await providerEntries(env, 'p1');
    assert.equal(e['pinned-identity'].status, 'unmeasured');
    assert.match(e['pinned-identity'].evidence, /chưa có danh tính đã ghim/);
    assert.equal(e['self-consistency'].status, 'pass');
    assert.equal(e['storage-isolation'].status, 'pass');
    console.log('PASS provider no-pinned-identity branch');
  }
  { // 10: configured measurement collection error -> unmeasured with its reason
    const rec = goodRecord();
    rec.results.configured = { status: 'error', reason: 'engine khong khoi dong duoc' };
    const env = envWithData({ warningReport: warningReport({}),
      measurementRecord: rec, profile: profileWithIdentity() });
    const e = await providerEntries(env, 'p1');
    assert.equal(e['pinned-identity'].status, 'unmeasured');
    assert.match(e['pinned-identity'].evidence, /engine khong khoi dong duoc/);
    assert.equal(e['self-consistency'].status, 'unmeasured');
    assert.equal(e['storage-isolation'].status, 'pass', 'isolation block is independent');
    console.log('PASS provider collection-error branch');
  }
  { // 11+12+13: drift source states
    const envIns = envWithData({ warningReport: warningReport({
      drift: { status: 'not_measured', reason: 'chua du snapshot' } }), measurementRecord: null });
    const eIns = await providerEntries(envIns, 'p1');
    assert.equal(eIns['no-unexpected-drift'].status, 'unmeasured');
    assert.match(eIns['no-unexpected-drift'].evidence, /chua du snapshot/);
    const envFleet = envWithData({ warningReport: warningReport({
      warnings: [driftWarn([], 'Ti le loi tang toan doi')] }), measurementRecord: null });
    const eFleet = await providerEntries(envFleet, 'p1');
    assert.equal(eFleet['no-unexpected-drift'].status, 'unmeasured', 'fleet warning must not fail a profile');
    assert.match(eFleet['no-unexpected-drift'].evidence, /Ti le loi tang toan doi/);
    const envMine = envWithData({ warningReport: warningReport({
      warnings: [driftWarn(['p1'], 'Troi gan voi ho so nay')] }), measurementRecord: null });
    assert.equal((await providerEntries(envMine, 'p1'))['no-unexpected-drift'].status, 'fail');
    console.log('PASS provider drift source branches');
  }
  { // 14: mid-session IP change is also drift evidence for the profile
    const env = envWithData({ warningReport: warningReport({
      warnings: [ipWarn('ip_changed_mid_session', ['p1'], 'IP doi giua phien')] }),
      measurementRecord: null });
    const e = await providerEntries(env, 'p1');
    assert.equal(e['no-unexpected-drift'].status, 'fail');
    assert.equal(e['network-route'].status, 'unmeasured');
    console.log('PASS provider ip-change drift branch');
  }
  { // 15: zero comparable identity fields -> unmeasured, never pass
    const rec = goodRecord();
    rec.results.configured.identity = { compared: 0, matched: 0, mismatches: [] };
    const env = envWithData({ warningReport: warningReport({}),
      measurementRecord: rec, profile: profileWithIdentity() });
    const e = await providerEntries(env, 'p1');
    assert.equal(e['pinned-identity'].status, 'unmeasured');
    assert.match(e['pinned-identity'].evidence, /0 trường/);
    console.log('PASS provider zero-compared gate');
  }

  // --- frame level ---------------------------------------------------
  { // F1: no provider at all -> all CHUA DO
    const env = makeEnv({ withProvider: false });
    env.window.LHMCriteriaChecklist.showForProfile('p1');
    for (const id of CRITERIA_ORDER) {
      assert.match(frameStatus(env, id).chip, /is-unmeasured/, id);
    }
    console.log('PASS frame no-provider fallback');
  }
  { // F2+F3: provider throws / returns malformed / rejects -> all CHUA DO
    const envThrow = makeEnv();
    envThrow.window.LHMCriteriaChecklistProvider = () => { throw Error('boom'); };
    envThrow.window.LHMCriteriaChecklist.showForProfile('p1');
    assert.match(frameStatus(envThrow, 'network-route').chip, /is-unmeasured/);
    const envBad = makeEnv();
    envBad.window.LHMCriteriaChecklistProvider = async () => ({ nope: true });
    envBad.window.LHMCriteriaChecklist.showForProfile('p1');
    await flush();
    assert.match(frameStatus(envBad, 'pinned-identity').chip, /is-unmeasured/);
    const envRej = makeEnv();
    envRej.window.LHMCriteriaChecklistProvider = async () => { throw Error('ipc down'); };
    envRej.window.LHMCriteriaChecklist.showForProfile('p1');
    await flush();
    assert.match(frameStatus(envRej, 'storage-isolation').chip, /is-unmeasured/);
    console.log('PASS frame provider-error fallbacks');
  }
  { // F4: async provider data renders through the real frame
    const env = envWithData({ profileName: 'Ho so 1', profile: profileWithIdentity(),
      warningReport: warningReport({ warnings: [ipWarn('shared_exit_ip', ['p1', 'p2'], 'Chung IP')] }),
      measurementRecord: goodRecord() });
    env.window.LHMCriteriaChecklist.showForProfile('p1');
    await flush();
    assert.match(frameStatus(env, 'pinned-identity').chip, /is-pass/);
    assert.match(frameStatus(env, 'storage-isolation').chip, /is-pass/);
    assert.match(frameStatus(env, 'cross-profile-coincidence').chip, /is-fail/);
    assert.match(frameStatus(env, 'no-unexpected-drift').chip, /is-unmeasured/);
    assert.match(env.container.textContent, /Ho so 1/);
    console.log('PASS frame async render');
  }
  { // F5: stale async result must not overwrite a newer profile view
    const env = makeEnv();
    env.window.LHMCriteriaChecklistDataSource = async (id) => {
      if (id === 'p1') await new Promise(r => setTimeout(r, 30));
      return { profileName: id === 'p1' ? 'Ho so MOT' : 'Ho so HAI',
        profile: profileWithIdentity(), warningReport: warningReport({}),
        measurementRecord: goodRecord({ profileId: id }) };
    };
    env.window.LHMCriteriaChecklist.showForProfile('p1');
    env.window.LHMCriteriaChecklist.showForProfile('p2');
    await new Promise(r => setTimeout(r, 60));
    await flush();
    assert.match(env.container.textContent, /Ho so HAI/);
    assert.doesNotMatch(env.container.textContent, /Ho so MOT/);
    console.log('PASS frame stale-result guard');
  }

  console.log('criteria-checklist-provider: all assertions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
