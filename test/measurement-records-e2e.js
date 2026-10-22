'use strict';
/* Agent R15: END-TO-END per-profile measurement on the real engine.
 *
 * Tier: real-engine lab run (Constitution Section 23) — the full
 * producer chain Agent 9's contract was missing, on REAL app
 * profiles in a real app profile store:
 *   create profiles via Store.saveProfile -> provision pinned
 *   identities via the official generator (camoufoxProvisioning) ->
 *   measureProfile() drives the app's own CamoufoxPlaywrightController
 *   against the profiles' real data directories -> a
 *   lhm-profile-measurement v1 record lands in
 *   measurement-records.json (mode 0600) -> the checklist provider
 *   flips the target profile's three stage-0 criteria from CHƯA ĐO
 *   to evidence-backed PASS, while the pair profile (measured only
 *   as the isolation counterpart, no record of its own) stays
 *   CHƯA ĐO.
 *
 * Prerequisites (missing => NOT_RUN, exit 2 — never a fake pass):
 *   - LHM_CAMOUFOX_EXECUTABLE: a real Camoufox binary
 *     (default: ~/tmp-big/cfx-build/camoufox-bin, the lab build);
 *   - repo node_modules installed (playwright-core + camoufox
 *     generator package).
 * Exit 0 = PASS; 1 = FAIL; 2 = NOT_RUN.
 * NOT for the regular npm chain (same class as
 * test/camoufox-provisioning-real.js): it launches a real engine.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const EXE = process.env.LHM_CAMOUFOX_EXECUTABLE ||
  path.join(os.homedir(), 'tmp-big', 'cfx-build', 'camoufox-bin');

const results = [];
function record(name, status, detail) {
  results.push({ name, status, detail });
  console.log(status.padEnd(7), name, detail ? '-' + detail : '');
}

async function main() {
  if (!fs.existsSync(EXE)) {
    record('prerequisites', 'NOT_RUN', 'Camoufox executable not found: ' + EXE);
    console.log('measurement-records-e2e: NOT_RUN');
    process.exitCode = 2;
    return;
  }
  let pwOk = true;
  try { require('playwright-core'); } catch (_) { pwOk = false; }
  try { require('camoufox'); } catch (_) { pwOk = false; }
  if (!pwOk) {
    record('prerequisites', 'NOT_RUN', 'playwright-core / camoufox package not loadable (npm ci first)');
    console.log('measurement-records-e2e: NOT_RUN');
    process.exitCode = 2;
    return;
  }

  const Store = require(path.join(ROOT, 'src', 'db', 'store'));
  const { provisionCamoufoxIdentity } = require(path.join(ROOT, 'src', 'engine', 'camoufoxProvisioning'));
  const { MeasurementRecordStore, validateMeasurementRecord } =
    require(path.join(ROOT, 'src', 'measurement', 'measurementRecords'));
  const { measureProfile } = require(path.join(ROOT, 'tools', 'measure-profile'));
  const { digestFile } = require(path.join(ROOT, 'stage0-measure', 'core'));

  const engineSha = digestFile(fs.realpathSync(EXE));
  const head = spawnSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-r15-e2e-'));
  let failed = false;
  const expect = (name, cond, detail) => {
    record(name, cond ? 'PASS' : 'FAIL', detail);
    if (!cond) failed = true;
  };

  try {
    /* 1) Create two REAL app profiles through the app store. */
    const store = new Store(storageDir);
    const a = store.saveProfile({ name: 'R15 e2e A', engine: 'gecko', engine_type: 'camoufox',
      fingerprint: { mode: 'native', languages: ['en-US'] }, proxy: { type: 'direct' } });
    const b = store.saveProfile({ name: 'R15 e2e B', engine: 'gecko', engine_type: 'camoufox',
      fingerprint: { mode: 'native', languages: ['vi-VN'] }, proxy: { type: 'direct' } });
    expect('profiles created in the app store', !!a.id && !!b.id && a.id !== b.id, a.id + ' / ' + b.id);

    /* 2) Provision pinned identities via the official generator. */
    for (const created of [a, b]) {
      const profile = store.getProfile(created.id);
      const result = await provisionCamoufoxIdentity(profile, { resolveExecutable: () => EXE });
      expect('provision ' + created.name, result.status === 'provisioned', 'status=' + result.status);
      if (result.status === 'provisioned') store.saveProfile(profile);
    }
    const profileA = store.getProfile(a.id);
    expect('profile A carries a pinned identity',
      !!(profileA.fingerprint && profileA.fingerprint.identity), '');

    /* Checklist view of a profile, backed by the real record store. */
    const PROVIDER = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'criteriaChecklistProvider.js'), 'utf8');
    const windowStub = {};
    const sandbox = { window: windowStub, console };
    vm.createContext(sandbox);
    vm.runInContext(PROVIDER, sandbox);
    const checklistFor = async (profileId) => {
      const records = new MeasurementRecordStore(storageDir);
      const freshStore = new Store(storageDir);
      windowStub.LHMCriteriaChecklistDataSource = async () => ({
        profile: freshStore.getProfile(profileId) || null, warningReport: null,
        measurementRecord: records.getForProfile(profileId),
        currentContext: { appCommit: head, engineSha256: engineSha },
      });
      return windowStub.LHMCriteriaChecklistProvider(profileId);
    };
    const STAGE0 = ['storage-isolation', 'self-consistency', 'pinned-identity'];
    const entryOf = (model, id) => model.entries.find(e => e.id === id);

    /* 3) Before measurement: all three criteria CHƯA ĐO. */
    const before = await checklistFor(a.id);
    expect('before measurement: 3 criteria unmeasured with the no-record reason',
      STAGE0.every(id => entryOf(before, id).status === 'unmeasured' &&
        /không có bản ghi nào/.test(entryOf(before, id).evidence)),
      STAGE0.map(id => entryOf(before, id).status).join(','));

    /* 4) Run the real per-profile measurement. */
    const { record: rec, clean } = await measureProfile({
      storageDir, profileId: a.id, pairProfileId: b.id, executable: EXE, headless: true,
    });
    expect('record validates against the v1 contract', validateMeasurementRecord(rec) === null,
      validateMeasurementRecord(rec) || '');
    expect('record binds this repo commit + the real engine hash',
      rec.appCommit === head && rec.engine.sha256 === engineSha,
      'commit=' + String(rec.appCommit).slice(0, 8) + ' engine=' + rec.engine.sha256.slice(0, 12));
    expect('configured block measured', rec.results.configured.status === 'measured',
      JSON.stringify(rec.results.configured).slice(0, 160));
    expect('isolation block measured', rec.results.isolation.status === 'measured',
      JSON.stringify(rec.results.isolation.conditions || rec.results.isolation).slice(0, 160));
    const conditions = rec.results.isolation.conditions || {};
    expect('isolation baseline + concurrent pass on the real data dirs',
      conditions.baselineClassic === 'pass' &&
      conditions.concurrentCrossWrite === 'pass',
      JSON.stringify(conditions));
    expect('crash conditions honestly not_run in this runner',
      conditions.crashRecovery === 'not_run' &&
      conditions.crashRecoveryIdleFlush === 'not_run', '');
    const file = path.join(storageDir, 'measurement-records.json');
    expect('record file persisted at mode 0600',
      fs.existsSync(file) && (process.platform === 'win32' || (fs.statSync(file).mode & 0o777) === 0o600),
      file);
    const cfgIdentity = (rec.results.configured && rec.results.configured.identity) || { matched: 0, compared: 0 };
    const cfgConsistency = (rec.results.configured && rec.results.configured.consistency) || { checked: 0, inconsistent: [] };
    record('runner self-assessment (clean)', clean ? 'PASS' : 'FAIL',
      'identity ' + cfgIdentity.matched + '/' + cfgIdentity.compared +
      ', consistency checked=' + cfgConsistency.checked +
      ' inconsistent=' + cfgConsistency.inconsistent.length);
    if (!clean) failed = true;

    /* 5) After measurement: A's criteria flip to PASS; B stays CHƯA ĐO. */
    const after = await checklistFor(a.id);
    for (const id of STAGE0) {
      const entry = entryOf(after, id);
      expect('after measurement: ' + id + ' flips to evidence-backed PASS',
        entry.status === 'pass', entry.status + ' — ' + String(entry.evidence).slice(0, 140));
    }
    const pairView = await checklistFor(b.id);
    expect('pair profile (no record of its own) stays unmeasured',
      STAGE0.every(id => entryOf(pairView, id).status === 'unmeasured'),
      STAGE0.map(id => entryOf(pairView, id).status).join(','));
  } catch (error) {
    record('e2e execution', 'FAIL', String(error && error.message || error).slice(0, 300));
    failed = true;
  } finally {
    if (process.env.LHM_R15_KEEP !== '1') fs.rmSync(storageDir, { recursive: true, force: true });
    else console.log('kept storage dir:', storageDir);
  }
  console.log('measurement-records-e2e:', failed ? 'FAIL' : 'PASS');
  process.exitCode = failed ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
