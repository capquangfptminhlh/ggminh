'use strict';
/**
 * Agent R20 — adversarial seam QA of the coordinator wiring (f280296).
 * Seams 1, 2, 4, 5 (seam 3, the runtime-egress gate against a real
 * engine, lives in test/seam3-runtime-gate-r20.js).
 *
 * These are DEFECT-PROOF tests: a check that demonstrates a defect
 * FAILS, and the suite exits 1 while any defect stands. They are not
 * proposed for the npm chain — see docs/agents/agent-r20/ for the
 * report. Tier: unit/integration with the REAL store / provisioning /
 * warning modules and the REAL main.js IPC handler bodies (extracted
 * verbatim from main.js and bound to a fake ipcMain/ipcRenderer pair
 * so the preload-exposed path is exercised end to end). NOT evidence
 * about the packaged app (Constitution Section 23).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const results = [];
function check(seam, name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { results.push({ seam, name, pass: true }); console.log(`PASS [${seam}] ${name}`); })
    .catch(error => {
      results.push({ seam, name, pass: false, error: error.message });
      console.log(`FAIL [${seam}] ${name} :: ${error.message}`);
    });
}
const tmp = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/* ================================================================
 * SEAM 1 — identityProvisioningReason: persistence vs consumption.
 * The save-profile segment below replicates main.js:640-662 verbatim
 * in behaviour (real provisionCamoufoxIdentity + real Store); the
 * write line is main.js:655-656.
 * ================================================================ */
async function seam1() {
  const Store = require('../src/db/store');
  const { provisionCamoufoxIdentity } = require('../src/engine/camoufoxProvisioning');
  const { summarizeIdentity } = require('../src/engine/camoufoxIdentity');

  // A structurally valid identity blob, built the way the official
  // generator's output is shaped (JSON config chunked into
  // CAMOU_CONFIG_n), with expectations derived by the repo's own
  // summariser — a fixture for the generate() stub, never attached
  // by hand anywhere in product code.
  function validIdentity(config) {
    const blob = JSON.stringify(config);
    const env = {};
    for (let i = 0, n = 1; i < blob.length; i += 2000, n++)
      env['CAMOU_CONFIG_' + n] = blob.slice(i, i + 2000);
    return {
      format: 'camoufox-camou-config', version: 1, generator: 'camoufox@0.5.8',
      generatedAt: new Date().toISOString(),
      constraints: { os: 'windows', locale: null, timezone: null },
      env, expectations: summarizeIdentity(JSON.parse(blob)),
    };
  }
  const WIN_CONFIG = {
    'navigator.userAgent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0',
    'navigator.platform': 'Win32',
    'locale:language': 'en', 'locale:region': 'US',
    timezone: 'Europe/London',
    'screen.width': 1920, 'screen.height': 1080,
    'navigator.hardwareConcurrency': 8,
  };
  // The exact handler segment (main.js save-profile, new profile) —
  // updated at Wave R integration to mirror the coordinator-applied
  // R13 provenance-gate diff in main.js (allowIdentity only when the
  // provisioning call itself returned 'provisioned').
  async function saveNewProfile(store, profile, deps) {
    let provisioning = null;
    try { provisioning = await provisionCamoufoxIdentity(profile, deps); }
    catch (_) { provisioning = null; }
    if (provisioning && provisioning.reason && profile.fingerprint)
      profile.fingerprint.identityProvisioningReason = provisioning.reason;
    return { saved: store.saveProfile(profile, { allowEngineChange: false,
      allowIdentity: !!provisioning && provisioning.status === 'provisioned' }), provisioning };
  }
  const camoProfile = extra => ({
    name: 'R20 seam1', engine: 'gecko', engine_type: 'camoufox',
    proxy: { type: 'direct' }, fingerprint: { mode: 'native', ...(extra || {}) },
  });

  const cases = [
    {
      label: 'unavailable / engine-not-installed-or-unverified',
      deps: { resolveExecutable: () => { throw Error('not installed'); } },
      profile: camoProfile(),
      status: 'unavailable', reason: 'engine-not-installed-or-unverified',
    },
    {
      label: 'invalid / generated-identity-failed-validation',
      deps: {
        resolveExecutable: () => '/engines/camoufox.exe',
        generate: async () => ({ format: 'camoufox-camou-config', version: 1, generator: 'camoufox@0.5.8', env: {}, expectations: {} }),
      },
      profile: camoProfile(),
      status: 'invalid', reason: 'generated-identity-failed-validation',
    },
    {
      label: 'invalid / generated-identity-contradicts-profile',
      deps: {
        resolveExecutable: () => '/engines/camoufox.exe',
        generate: async () => validIdentity(WIN_CONFIG),
      },
      profile: camoProfile({ timezone: 'Asia/Ho_Chi_Minh' }),
      status: 'invalid', reason: 'generated-identity-contradicts-profile',
    },
  ];
  for (const c of cases) {
    await check('seam1', `round-trip persists status+reason (${c.label})`, async () => {
      const dir = tmp('lhm-r20-s1-');
      try {
        const store = new Store(dir);
        await saveNewProfile(store, c.profile, c.deps).then(({ saved, provisioning }) => {
          assert.equal(provisioning.status, c.status);
          assert.equal(provisioning.reason, c.reason);
          // Delivered to the caller (the renderer) in the save result.
          assert.equal(saved.fingerprint.identityProvisioning, c.status);
          assert.equal(saved.fingerprint.identityProvisioningReason, c.reason);
          assert.equal(saved.fingerprint.identity, undefined, 'no identity attached');
          // Present in the raw db.json on disk.
          const raw = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
          const onDisk = raw.profiles.find(p => p.id === saved.id);
          assert.equal(onDisk.fingerprint.identityProvisioningReason, c.reason);
          // Survives a restart: a fresh Store over the same directory.
          const reopened = new Store(dir).getProfile(saved.id);
          assert.equal(reopened.fingerprint.identityProvisioning, c.status);
          assert.equal(reopened.fingerprint.identityProvisioningReason, c.reason);
        });
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
  }
  await check('seam1', 'control: provisioned profile carries identity and no stale reason', async () => {
    const dir = tmp('lhm-r20-s1c-');
    try {
      const store = new Store(dir);
      const { saved, provisioning } = await saveNewProfile(store, camoProfile(), {
        resolveExecutable: () => '/engines/camoufox.exe',
        generate: async () => validIdentity(WIN_CONFIG),
      });
      assert.equal(provisioning.status, 'provisioned');
      assert.equal(saved.fingerprint.identityProvisioning, 'provisioned');
      assert.ok(saved.fingerprint.identity, 'identity attached');
      assert.equal(saved.fingerprint.identityProvisioningReason, undefined);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // --- Consumption: does anything READ the persisted field? ---
  await check('seam1', 'the persisted reason is read by the UI (A16 #9 intent)', () => {
    // Mechanical proof (updated at Wave R integration, per Agent
    // R20's own instruction): defect R20-1 was that the field name
    // occurred exactly once in all product code — the write site in
    // main.js. After the coordinator fix the renderer must READ it.
    const hits = [];
    const walk = d => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
        else if (e.name.endsWith('.js')) {
          const src = fs.readFileSync(p, 'utf8');
          let i = -1;
          while ((i = src.indexOf('identityProvisioningReason', i + 1)) >= 0)
            hits.push(path.relative(ROOT, p));
        }
      }
    };
    walk(ROOT);
    const productHits = hits.filter(h => !h.startsWith('test' + path.sep) && !h.startsWith('docs' + path.sep));
    assert.ok(productHits.includes('main.js'),
      'expected the write site in main.js; found: ' + productHits.join(', '));
    assert.ok(productHits.includes(path.join('src', 'ui', 'renderer.js')),
      'expected a read site in src/ui/renderer.js (defect R20-1: the persisted reason was write-only); found: ' + productHits.join(', '));
    // Behavioural proof: the renderer's own notice builders ignore it.
    const rendererSrc = fs.readFileSync(path.join(ROOT, 'src/ui/renderer.js'), 'utf8');
    const slice = rendererSrc.slice(
      rendererSrc.indexOf('function provisioningReasonText'),
      rendererSrc.indexOf('window.LHMFirstRunGuide'));
    const api = new Function(slice +
      '; return { provisioningSaveNotice, identityMetaText, provisioningReasonText };')();
    const base = { name: 'X', engine_type: 'camoufox' };
    const noticeA = api.provisioningSaveNotice({ ...base, fingerprint: { identityProvisioning: 'unavailable', identityProvisioningReason: 'engine-not-installed-or-unverified' } });
    const noticeB = api.provisioningSaveNotice({ ...base, fingerprint: { identityProvisioning: 'unavailable', identityProvisioningReason: 'generator-package-missing' } });
    assert.notEqual(noticeA, noticeB,
      'post-create notice is identical regardless of the persisted reason — the specific cause never reaches the user');
    const metaA = api.identityMetaText({ ...base, fingerprint: { identityProvisioning: 'invalid', identityProvisioningReason: 'generated-identity-failed-validation' } });
    const metaB = api.identityMetaText({ ...base, fingerprint: { identityProvisioning: 'invalid', identityProvisioningReason: 'generated-identity-contradicts-profile' } });
    assert.notEqual(metaA, metaB,
      'profile-row meta text is identical regardless of the persisted reason');
  });
}

/* ================================================================
 * SEAM 2 — clear-warning-history across the real IPC boundary:
 * main.js's own handler bodies + preload.js loaded with a fake
 * electron module, so the calls go through the exact surface the
 * renderer uses (api.getWarningReport / api.clearWarningHistory).
 * ================================================================ */
async function seam2() {
  const { createWarningService } = require('../src/monitor/warningService');
  const { createWarningHistory } = require('../src/monitor/warningHistory');
  const { ExitIpObservationStore } = require('../src/health/exitIpObservations');

  const dir = tmp('lhm-r20-s2-');
  try {
    // Inputs: two profiles sharing one exit IP -> one deterministic
    // high warning (shared_exit_ip) on every evaluation.
    // Fixture clock (integration fix): the store takes an injectable
    // now(); advance it well past 1 ms per call. With the wall clock,
    // back-to-back record() calls can land in the SAME millisecond,
    // and GraphDefense's temporal check then legitimately adds two
    // subnet_overlap warnings (intervals are [observedAt, +1ms)) —
    // a fixture artefact that made this seam flaky, not a product
    // defect. Distinct times keep exactly one deterministic warning.
    let fixtureNow = Date.now();
    const ipStore = new ExitIpObservationStore(dir, { now: () => (fixtureNow += 5000) });
    ipStore.record({ profileId: 'pa', ip: '203.0.113.50', sessionId: 's1', source: 'manager-process' });
    ipStore.record({ profileId: 'pb', ip: '203.0.113.50', sessionId: 's1', source: 'manager-process' });

    // whenReady wiring (main.js:914-919), verbatim in behaviour.
    const scope = { warningService: null, warningHistory: null };
    scope.warningHistory = createWarningHistory({ storageDir: dir, countMode: 'authoritative' });
    assert.equal(scope.warningHistory.load().status, 'empty');
    scope.warningService = createWarningService({ seed: scope.warningHistory.seedRecords() });

    // Extract main.js's two handler bodies verbatim and register them
    // on a fake ipcMain; load preload.js against a fake ipcRenderer
    // that dispatches into the same registry.
    const mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    const slice = mainSrc.slice(
      mainSrc.indexOf("ipcMain.handle('get-warning-report'"),
      mainSrc.indexOf("ipcMain.handle('provision-camoufox-identity'"));
    assert.ok(slice.includes('clear-warning-history'), 'handler slice extracted');
    const handlers = {};
    const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
    const behaviorMonitor = { events: [], getReport: () => ({ alerts: [] }) };
    const localHealthDrift = { report: () => null };
    new Function('ipcMain', 'behaviorMonitor', 'ipObservationStore', 'localHealthDrift',
      'createWarningService', 'scope',
      `with (scope) { ${slice} }`)(
      ipcMain, behaviorMonitor, ipStore, localHealthDrift, createWarningService, scope);

    const Module = require('node:module');
    const originalLoad = Module._load;
    let exposed = null;
    Module._load = function (request, ...rest) {
      if (request === 'electron') return {
        contextBridge: { exposeInMainWorld: (name, api) => { exposed = { name, api }; } },
        ipcRenderer: { invoke: (ch, ...args) => handlers[ch](null, ...args) },
      };
      return originalLoad.call(this, request, ...rest);
    };
    try {
      delete require.cache[require.resolve('../preload.js')];
      require('../preload.js');
    } finally { Module._load = originalLoad; }
    const api = exposed.api;
    const historyFile = path.join(dir, 'warning-history.json');
    const shared = r => r.warnings.find(w => w.code === 'shared_exit_ip');

    await check('seam2', 'preload exposes getWarningReport + clearWarningHistory', () => {
      assert.equal(typeof api.getWarningReport, 'function');
      assert.equal(typeof api.clearWarningHistory, 'function');
    });
    await check('seam2', 'report #1 seeds history (timesObserved=1, file written)', async () => {
      const report = await api.getWarningReport();
      assert.ok(shared(report), 'shared_exit_ip warning present');
      assert.equal(report.history.length, 1);
      assert.equal(report.history[0].timesObserved, 1);
      const onDisk = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      assert.equal(onDisk.entries.length, 1);
      assert.equal(onDisk.entries[0].timesObserved, 1);
      // The status surfaced next to the report must describe the
      // store as it is NOW (holding one entry), not the load-time
      // state of a file that did not exist at startup.
      assert.equal(report.historyStatus.status, 'ok',
        'historyStatus stays \'empty\' after the first record on a fresh install');
    });
    await check('seam2', 'report #2 increments the durable count (seed+authoritative pairing)', async () => {
      const report = await api.getWarningReport();
      assert.equal(shared(report).timesObserved, 2);
      assert.equal(report.history[0].timesObserved, 2);
      const onDisk = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      assert.equal(onDisk.entries[0].timesObserved, 2);
    });
    let firstDetectedAt;
    await check('seam2', 'restart: seeded service keeps firstDetectedAt and continues the count', async () => {
      const before = JSON.parse(fs.readFileSync(historyFile, 'utf8')).entries[0];
      firstDetectedAt = before.firstDetectedAt;
      // Fresh store + fresh service, seeded exactly as whenReady does.
      scope.warningHistory = createWarningHistory({ storageDir: dir, countMode: 'authoritative' });
      assert.equal(scope.warningHistory.load().status, 'ok');
      scope.warningService = createWarningService({ seed: scope.warningHistory.seedRecords() });
      const report = await api.getWarningReport();
      assert.equal(report.history[0].timesObserved, 3);
      assert.equal(report.history[0].firstDetectedAt, firstDetectedAt,
        'first sighting survives the restart');
    });
    await check('seam2', 'clear via the preload path: service counts reset AND file removed', async () => {
      const out = await api.clearWarningHistory();
      assert.deepEqual(out, { ok: true });
      assert.equal(fs.existsSync(historyFile), false, 'history file is gone');
      assert.equal(scope.warningHistory.entries().length, 0);
      assert.equal(scope.warningHistory.status().count, 0);
      // Service registry was reset too: list() shows no warnings now.
      assert.equal(scope.warningService.list().warningCount, 0);
    });
    await check('seam2', 'next report re-seeds from zero under authoritative mode (no resurrection)', async () => {
      await new Promise(r => setTimeout(r, 5));
      const clearedAt = Date.now();
      const report = await api.getWarningReport();
      assert.ok(shared(report), 'the still-shared IP is honestly re-detected');
      assert.equal(shared(report).timesObserved, 1, 'service count restarted at 1');
      assert.equal(report.history.length, 1);
      assert.equal(report.history[0].timesObserved, 1,
        'durable count restarted at 1 — the cleared total (3) is NOT resurrected');
      assert.ok(report.history[0].firstDetectedAt >= clearedAt - 1000 &&
        report.history[0].firstDetectedAt > firstDetectedAt,
        'firstDetectedAt is the fresh detection, not the cleared one');
      const onDisk = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      assert.equal(onDisk.entries[0].timesObserved, 1);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/* ================================================================
 * SEAM 4 — the combined exit-IP store under concurrent record()
 * from both sources (one shared instance, as in the app).
 * ================================================================ */
async function seam4() {
  const { ExitIpObservationStore } = require('../src/health/exitIpObservations');
  const { observeRuntimeExitIp } = require('../src/health/runtimeEgressObservation');

  await check('seam4', 'interleaved manager+runtime writers lose nothing, labels intact', async () => {
    const dir = tmp('lhm-r20-s4-');
    try {
      const store = new ExitIpObservationStore(dir);
      const N = 60;
      const runtimeIps = [], managerIps = [];
      const originalFetch = globalThis.fetch;
      let fetchSeq = 0;
      globalThis.fetch = async () => {
        const ip = '198.51.100.' + (10 + (fetchSeq++));
        return { ok: true, status: 200, text: async () => JSON.stringify({ ip }) };
      };
      const stubPage = { evaluate: async (fn, arg) => fn(arg) };
      const jitter = () => new Promise(r => setTimeout(r, Math.floor(Math.random() * 3)));
      const runtimeWriter = (async () => {
        for (let i = 0; i < N; i++) {
          await jitter();
          const out = await observeRuntimeExitIp({
            page: stubPage, profileId: 'rt-' + (i % 3), sessionId: 'sess-rt',
            echoUrl: 'http://echo.lab.test/ip', store, timeoutMs: 2000,
          });
          assert.ok(out.recorded, 'runtime observation recorded');
          runtimeIps.push(out.entry.ip);
        }
      })();
      const managerWriter = (async () => {
        for (let i = 0; i < N; i++) {
          await jitter();
          const ip = '203.0.113.' + (10 + i);
          const saved = store.record({
            profileId: 'mg-' + (i % 3), ip, sessionId: 'sess-mg', source: 'manager-process',
          });
          assert.ok(saved, 'manager observation recorded');
          managerIps.push(ip);
        }
      })();
      try { await Promise.all([runtimeWriter, managerWriter]); }
      finally { globalThis.fetch = originalFetch; }

      const list = store.list();
      assert.equal(list.length, 2 * N, 'no record lost under interleaving');
      const rt = list.filter(e => e.source === 'browser-runtime');
      const mg = list.filter(e => e.source === 'manager-process');
      assert.equal(rt.length, N); assert.equal(mg.length, N);
      const multiset = xs => xs.slice().sort().join(',');
      assert.equal(multiset(rt.map(e => e.ip)), multiset(runtimeIps), 'runtime IPs exact');
      assert.equal(multiset(mg.map(e => e.ip)), multiset(managerIps), 'manager IPs exact');
      assert.ok(rt.every(e => e.sessionId === 'sess-rt') && mg.every(e => e.sessionId === 'sess-mg'),
        'no cross-labelled or cross-session entries');
      const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'exit-ip-observations.json'), 'utf8'));
      assert.equal(onDisk.length, 2 * N, 'disk file matches memory');
      const reloaded = new ExitIpObservationStore(dir);
      assert.equal(reloaded.list().length, 2 * N, 'reload matches');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  await check('seam4', 'boundary: two instances on one file are last-writer-wins (documented, not an app path)', () => {
    const dir = tmp('lhm-r20-s4b-');
    try {
      const a = new ExitIpObservationStore(dir);
      const b = new ExitIpObservationStore(dir);
      for (let i = 0; i < 5; i++) a.record({ profileId: 'a', ip: '192.0.2.' + (i + 1), sessionId: 'sa' });
      for (let i = 0; i < 5; i++) b.record({ profileId: 'b', ip: '192.0.3.' + (i + 1), sessionId: 'sb' });
      const reloaded = new ExitIpObservationStore(dir);
      // b's in-memory copy never saw a's records; its persist wins.
      // The app constructs exactly ONE instance (main.js:909), so this
      // is a store-contract boundary, asserted here so it is on record.
      assert.equal(reloaded.list().length, 5);
      assert.ok(reloaded.list().every(e => e.profileId === 'b'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}

/* ================================================================
 * SEAM 5 — a storage directory written by the phase-C tree
 * (07150d6) opened by the Wave-2 tree (f280296): no data loss.
 * Prerequisite: a phase-C checkout (env R20_PHASEC_ROOT, default
 * /tmp/r20-phasec). Without it this seam reports NOT_RUN.
 * ================================================================ */
async function seam5() {
  const phasecRoot = process.env.R20_PHASEC_ROOT || '/tmp/r20-phasec';
  if (!fs.existsSync(path.join(phasecRoot, 'src/db/store.js'))) {
    console.log('NOT_RUN [seam5] phase-C checkout not found at ' + phasecRoot +
      ' (git worktree add <dir> 07150d6)');
    results.push({ seam: 'seam5', name: 'phase-C dir opened by Wave-2', pass: null });
    return;
  }
  await check('seam5', 'phase-C storage dir loads in Wave-2 with zero data loss', () => {
    const dir = tmp('lhm-r20-s5-');
    try {
      execFileSync(process.execPath,
        [path.join(__dirname, 'helpers-r20-write-phasec-dir.js'), phasecRoot, dir],
        { stdio: 'pipe' });
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, '_phasec-manifest.json'), 'utf8'));

      const Store = require('../src/db/store');
      const { ExitIpObservationStore } = require('../src/health/exitIpObservations');
      const BehaviorMonitor = require('../src/monitor/behaviorMonitor');
      const { WorkflowStore } = require('../src/automation/studio');
      const { createWarningHistory } = require('../src/monitor/warningHistory');

      const store = new Store(dir);
      assert.deepEqual(store.getProfiles(), manifest.profiles, 'profiles identical');
      assert.deepEqual(store.getSettings(), manifest.settings, 'settings identical');
      assert.equal(store.getTrashedProfiles().length, manifest.trashedCount, 'trash intact');
      assert.equal(store.getTrashedProfiles()[0].id, manifest.ids.p3);

      const ipStore = new ExitIpObservationStore(dir);
      assert.deepEqual(ipStore.list(), manifest.ipEntries, 'legacy IP entries identical');
      assert.ok(ipStore.list().every(e => !('source' in e)), 'no label injected into legacy entries');

      const monitor = new BehaviorMonitor(dir);
      assert.deepEqual(monitor.events, manifest.behaviorEvents, 'behavior events identical');

      const workflows = new WorkflowStore(dir);
      assert.deepEqual(workflows.list(), manifest.workflows, 'workflows identical');

      // Wave-2 writes must EXTEND, not disturb, the phase-C data.
      ipStore.record({ profileId: manifest.ids.p1, ip: '192.0.2.99', sessionId: 'w2-s1', source: 'manager-process' });
      ipStore.record({ profileId: manifest.ids.p2, ip: '192.0.2.100', sessionId: 'w2-s1', source: 'browser-runtime' });
      const ipReloaded = new ExitIpObservationStore(dir).list();
      assert.equal(ipReloaded.length, manifest.ipEntries.length + 2);
      assert.deepEqual(ipReloaded.slice(0, manifest.ipEntries.length), manifest.ipEntries,
        'legacy prefix untouched by labelled appends');

      const edited = store.getProfile(manifest.ids.p2);
      edited.name = 'PhaseC Camoufox (renamed by Wave-2)';
      store.saveProfile(edited, {});
      const after = new Store(dir).getProfile(manifest.ids.p2);
      assert.equal(after.name, 'PhaseC Camoufox (renamed by Wave-2)');
      assert.deepEqual(after.fingerprint, manifest.profiles.find(p => p.id === manifest.ids.p2).fingerprint,
        'phase-C fingerprint (incl. identityProvisioning) survives a Wave-2 edit');

      // The Wave-2-only store coexists with the phase-C directory.
      const history = createWarningHistory({ storageDir: dir, countMode: 'authoritative' });
      assert.equal(history.load().status, 'empty', 'no phase-C file -> empty, not error');
      const rec = history.record([{
        id: 'w2-coexist', source: 'ipWarnings', code: 'shared_exit_ip', level: 'high',
        title: 't', observed: { summary: 's', profiles: ['a'], sessionIds: [], count: 1 },
        method: 'm', criterion: 'c', limitation: 'l', nextSteps: [],
        evaluatedAt: Date.now(),
      }]);
      assert.equal(rec.ok, true);
      assert.equal(createWarningHistory({ storageDir: dir }).load().status, 'ok');
      // …and the phase-C stores still load afterwards.
      assert.equal(new Store(dir).getProfiles().length, manifest.profiles.length);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}

(async () => {
  await seam1();
  await seam2();
  await seam4();
  await seam5();
  const failed = results.filter(r => r.pass === false);
  const notRun = results.filter(r => r.pass === null);
  console.log(`\nseam-qa-r20: ${results.filter(r => r.pass === true).length} PASS, ` +
    `${failed.length} FAIL, ${notRun.length} NOT_RUN`);
  if (failed.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
