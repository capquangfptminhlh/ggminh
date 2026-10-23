'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Store = require('../src/db/store');
const { validateRuntimeEchoUrl } = require('../src/health/runtimeEchoConfig');
const { ExitIpObservationStore } = require('../src/health/exitIpObservations');
const BehaviorMonitor = require('../src/monitor/behaviorMonitor');
const { createWarningHistory } = require('../src/monitor/warningHistory');
const { createWarningService } = require('../src/monitor/warningService');
const { observeRuntimeExitIp } = require('../src/health/runtimeEgressObservation');

(async () => {
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-monitor-controls-'));
try {
  const handlers = {};
  const store = new Store(path.join(root, 'data'));
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const begin = main.indexOf("  ipcMain.handle('save-settings'");
  const end = main.indexOf("  ipcMain.handle('get-behavior-report'", begin);
  assert.ok(begin > 0 && end > begin);
  vm.runInNewContext(main.slice(begin, end), {
    ipcMain: { handle: (name, callback) => { handlers[name] = callback; } },
    store, validateRuntimeEchoUrl,
  });
  const save = value => handlers['save-settings'](null, { runtimeEchoUrl: value });
  save('https://echo.example.com/ip');
  assert.equal(store.getSettings().runtimeEchoUrl, 'https://echo.example.com/ip');
  for (const invalid of ['http://echo.example.com', 'https://user:pass@echo.example.com',
    'https://echo.example.com/?token=x', 'https://echo.example.com/#x', null, 1, 'x'.repeat(2049)]) {
    assert.throws(() => save(invalid));
    assert.equal(store.getSettings().runtimeEchoUrl, 'https://echo.example.com/ip');
  }
  save('');
  assert.equal(store.getSettings().runtimeEchoUrl, '');
  const observations = new ExitIpObservationStore(root);
  observations.record({ profileId: 'p1', ip: '203.0.113.7', sessionId: 's1' });
  observations.clear();
  assert.equal(observations.list().length, 0);
  assert.equal(new ExitIpObservationStore(root).list().length, 0);
  const retained = path.join(root, 'profile-marker');
  fs.writeFileSync(retained, 'customer-data');
  observations.clear();
  assert.equal(fs.readFileSync(retained, 'utf8'), 'customer-data');
  const oldRm = fs.rmSync;
  try {
    fs.rmSync = file => { if (file === observations.file) throw Error('simulated EACCES'); };
    assert.throws(() => observations.clear(), /EACCES/);
  } finally { fs.rmSync = oldRm; }

  // Execute the actual main.js registrations with real monitoring stores.
  // Only Electron/browser/network boundaries are replaced; no customer files
  // or live network endpoints are touched by this integration fixture.
  function registerRange(context, first, next) {
    const start = main.indexOf(`  ipcMain.handle('${first}'`);
    const stop = main.indexOf(`  ipcMain.handle('${next}'`, start);
    assert.ok(start > 0 && stop > start, `extract ${first} before ${next}`);
    vm.runInContext(main.slice(start, stop), context);
  }
  function fixture(name) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir);
    const registered = {};
    const monitor = new BehaviorMonitor(dir);
    let now = Date.now() - 10000;
    const ips = new ExitIpObservationStore(dir, { now: () => (now += 1000) });
    const history = createWarningHistory({ storageDir: dir, countMode: 'authoritative' });
    history.load();
    const service = createWarningService();
    const context = vm.createContext({
      ipcMain: { handle: (name, callback) => { registered[name] = callback; } },
      behaviorMonitor: monitor, ipObservationStore: ips,
      warningHistory: history, warningService: service,
      createWarningService, monitoringGeneration: 0, localHealthDrift: null,
    });
    registerRange(context, 'get-warning-report', 'get-profile-measurement');
    monitor.record('profile_open', 'p1');
    ips.record({ profileId: 'p1', ip: '203.0.113.7', sessionId: 's1' });
    ips.record({ profileId: 'p2', ip: '203.0.113.7', sessionId: 's1' });
    const report = registered['get-warning-report']();
    assert.ok(report.warnings.some(w => w.code === 'shared_exit_ip'));
    assert.ok(history.entries().length > 0);
    assert.ok(service.list().warningCount > 0);
    const marker = path.join(dir, 'unrelated-profile-marker');
    fs.writeFileSync(marker, 'synthetic-profile-data');
    const files = [monitor.file, ips.file, history.file];
    for (const file of files) fs.writeFileSync(file + '.tmp', 'synthetic-pending-write');
    return { dir, registered, context, monitor, ips, history, service, marker, files,
      clear: confirmed => registered['clear-monitoring-data'](null, confirmed) };
  }
  const f = fixture('clear-handler');
  const snapshot = () => ({
    files: fs.readdirSync(f.dir).sort().map(name => [name,
      fs.readFileSync(path.join(f.dir, name), 'utf8')]),
    events: f.monitor.listEvents(), ips: f.ips.list(), history: f.history.entries(),
    warnings: f.service.list().warnings, generation: f.context.monitoringGeneration,
  });
  const before = snapshot();
  for (const unconfirmed of [false, undefined, null, 1, 'true']) {
    assert.throws(() => f.clear(unconfirmed), /xác nhận/);
    assert.deepEqual(snapshot(), before, 'refusal must preserve disk and memory');
  }
  assert.equal(f.clear(true).ok, true);
  assert.equal(f.context.monitoringGeneration, 1);
  assert.deepEqual(f.monitor.listEvents(), []);
  assert.deepEqual(f.ips.list(), []);
  assert.deepEqual(f.history.entries(), []);
  assert.equal(f.service.list().warningCount, 0);
  assert.deepEqual(f.service.list().history, []);
  for (const file of f.files) {
    assert.equal(fs.existsSync(file), false, 'monitoring file removed');
    assert.equal(fs.existsSync(file + '.tmp'), false, 'temporary monitoring file removed');
  }
  assert.equal(fs.readFileSync(f.marker, 'utf8'), 'synthetic-profile-data');
  assert.deepEqual(new BehaviorMonitor(f.dir).listEvents(), []);
  assert.deepEqual(new ExitIpObservationStore(f.dir).list(), []);
  assert.equal(createWarningHistory({ storageDir: f.dir }).load().status, 'empty');
  assert.equal(f.registered['get-warning-report']().warningCount, 0);
  assert.deepEqual(f.history.entries(), [], 'cleared source data cannot re-seed warnings');

  // Each real store's deletion failure must escape the IPC callback,
  // including warningHistory.clear(), which returns an error object.
  for (const target of ['monitor', 'ips', 'history']) {
    const broken = fixture('failure-' + target);
    const failedFile = broken[target].file;
    const originalRm = fs.rmSync;
    try {
      fs.rmSync = function (file, ...args) {
        if (file === failedFile) throw Error('simulated EACCES ' + target);
        return originalRm.call(this, file, ...args);
      };
      assert.throws(() => broken.clear(true), new RegExp('EACCES ' + target));
    } finally { fs.rmSync = originalRm; }
    assert.equal(fs.existsSync(failedFile), true, 'failed deletion is not reported as success');
    assert.equal(fs.readFileSync(broken.marker, 'utf8'), 'synthetic-profile-data');
    assert.ok(broken.service.list().warningCount > 0, 'service reset only after successful clear');
  }

  // Start the real handler, pause both measurements at their external
  // boundaries, clear, then release them. This exercises the actual closed-
  // over observationSink and generation guard, not a copied implementation.
  const race = fixture('inflight');
  const profile = store.saveProfile({ name: 'Synthetic race profile',
    proxy: { type: 'http', host: '127.0.0.1', port: 8080 } });
  store.updateSettings({ runtimeEchoUrl: 'https://echo.example.com/ip' });
  let resolveProxy, resolveRuntime, runtimeTask;
  let proxyCalls = 0, runtimeCalls = 0;
  const proxyResult = new Promise(resolve => { resolveProxy = resolve; });
  const runtimeResult = new Promise(resolve => { resolveRuntime = resolve; });
  const browserContext = { newPage: async () => ({
    evaluate: () => { runtimeCalls++; return runtimeResult; }, close: async () => {},
  }) };
  Object.assign(race.context, {
    store, appSessionId: 'synthetic-session',
    launcher: {
      start: async id => ({ profileId: id, port: 9222 }),
      camoufoxPlaywrightController: { contextFor: () => browserContext },
    },
    checkProxy: () => { proxyCalls++; return proxyResult; },
    observeRuntimeExitIp: options => {
      runtimeTask = observeRuntimeExitIp(options);
      return runtimeTask;
    },
  });
  registerRange(race.context, 'start-browser', 'stop-browser');
  await race.registered['start-browser'](null, profile.id);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(proxyCalls, 1);
  assert.equal(runtimeCalls, 1);
  assert.equal(race.clear(true).ok, true);
  assert.equal(race.context.monitoringGeneration, 1);
  resolveProxy({ ip: '198.51.100.8' });
  resolveRuntime({ ok: true, text: '{"ip":"198.51.100.9"}' });
  assert.equal((await runtimeTask).recorded, false, 'stale runtime result is rejected');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(race.ips.list(), [], 'stale manager and runtime samples stay cleared');
  assert.equal(fs.existsSync(race.ips.file), false);
  assert.deepEqual(new ExitIpObservationStore(race.dir).list(), []);
  // A subsequent launch captures the new generation and can record again.
  await race.registered['start-browser'](null, profile.id);
  assert.equal((await runtimeTask).recorded, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(race.ips.list().map(entry => entry.source).sort(),
    ['browser-runtime', 'manager-process']);
  assert.equal(fs.readFileSync(race.marker, 'utf8'), 'synthetic-profile-data');
  console.log('runtime-echo-settings: persistence, rejection, clear IPC, deletion failures and in-flight generation checks passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
