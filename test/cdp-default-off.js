'use strict';
/*
 * The Chromium DevTools (CDP) port is unauthenticated: any local process or
 * Windows user can read the profile's cookies while it is open. It must stay
 * closed unless the user opted into BOTH the Local API and automation (CDP).
 */
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { EventEmitter } = require('events');
const Store = require('../src/db/store');
const BrowserLauncher = require('../src/engine/browserLauncher');
const { createApiServer } = require('../src/api/server');
const { prepare } = require('../src/ops/liveNavigation');
const { cdpAllowed, CDP_DISABLED_MESSAGE } = require('../src/security/cdpPolicy');

(async () => {
  assert.strictEqual(cdpAllowed({}), false);
  assert.strictEqual(cdpAllowed(null), false);
  assert.strictEqual(cdpAllowed({ apiEnabled: true }), false, 'Local API alone does not open CDP');
  assert.strictEqual(cdpAllowed({ cdpEnabled: true }), false, 'CDP needs the Local API too');
  assert.strictEqual(cdpAllowed({ apiEnabled: true, cdpEnabled: 'true' }), false, 'strict boolean');
  assert.strictEqual(cdpAllowed({ apiEnabled: true, cdpEnabled: true }), true);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-cdp-off-'));
  let server;
  try {
    const store = new Store(dir);
    assert.strictEqual(store.getSettings().cdpEnabled, undefined, 'new install: CDP off');
    const profile = store.saveProfile({ name: 'CDP', engine: 'chromium', startUrl: 'https://example.com/',
      proxy: { type: 'direct' }, fingerprint: { mode: 'native' } });
    const spawned = [];
    const spawnProcess = (_bin, args) => {
      const proc = new EventEmitter(); proc.pid = 5000 + spawned.length; proc.args = args;
      proc.kill = () => { setImmediate(() => proc.emit('exit', 0)); return true; };
      spawned.push(proc); setImmediate(() => proc.emit('spawn')); return proc;
    };
    const launcher = new BrowserLauncher(store, { spawnProcess });
    launcher.findBrowserBinary = () => process.execPath;
    launcher.fetchWebSocketDebuggerUrl = async () => null;
    const hasDebugPort = proc => proc.args.some(arg => arg.startsWith('--remote-debugging'));
    const run = async () => {
      const info = await launcher.start(profile.id);
      const proc = spawned[spawned.length - 1];
      const exited = new Promise(resolve => proc.once('exit', resolve));
      launcher.stop(profile.id); await exited;
      return { info, proc };
    };

    // Existing customers with the Local API on: no CDP port after upgrade.
    store.updateSettings({ apiEnabled: true });
    let { info, proc } = await run();
    assert.strictEqual(info.port, null);
    assert(!hasDebugPort(proc), 'Local API alone must not open the DevTools port');

    store.updateSettings({ apiEnabled: true, cdpEnabled: true });
    ({ info, proc } = await run());
    assert(Number.isInteger(info.port) && info.port >= 1024);
    assert(proc.args.includes('--remote-debugging-port=' + info.port));
    assert(proc.args.includes('--remote-debugging-address=127.0.0.1'));

    store.updateSettings({ apiEnabled: false, cdpEnabled: true });
    ({ info, proc } = await run());
    assert(!hasDebugPort(proc), 'turning the Local API off closes CDP for new launches');

    // Bulk "open URL in running profiles" uses the DevTools port.
    const liveStore = settings => ({ getSettings: () => settings, getProfiles: () => [{ id: 'pb_000000000001', engine: 'chromium' }] });
    const liveLauncher = { getActive: () => ({ port: 9281 }) };
    assert.throws(() => prepare(liveStore({ apiEnabled: true }), liveLauncher, ['pb_000000000001'], 'https://example.com'),
      error => error.message === CDP_DISABLED_MESSAGE);
    assert.strictEqual(prepare(liveStore({ apiEnabled: true, cdpEnabled: true }), liveLauncher,
      ['pb_000000000001'], 'https://example.com').running.length, 1);

    // Local API: refuse before launching, and refuse a browser without a port.
    let starts = 0, startResult = { port: null };
    const apiLauncher = { start: async () => { starts++; return startResult; },
      stop: () => ({ success: false }), listActive: () => [], isBusy: () => false, getActive: () => null,
      fetchWebSocketDebuggerUrl: async () => 'ws://127.0.0.1:9333/devtools/browser/x' };
    const app = createApiServer(store, apiLauncher, { apiKey: 'cdp-test-key' });
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const call = () => fetch('http://127.0.0.1:' + server.address().port + '/api/v1/browser/start?user_id=' +
      encodeURIComponent(profile.id), { headers: { 'X-API-Key': 'cdp-test-key' } });

    store.updateSettings({ apiEnabled: true, cdpEnabled: false });
    let response = await call(); let body = await response.json();
    assert.strictEqual(response.status, 409);
    assert.strictEqual(body.msg, CDP_DISABLED_MESSAGE);
    assert.strictEqual(body.data.ws.puppeteer, null);
    assert.strictEqual(starts, 0, 'no browser launched that the caller cannot control');

    store.updateSettings({ cdpEnabled: true });
    response = await call(); body = await response.json();
    assert.strictEqual(response.status, 409, 'profile opened before the opt-in has no port');
    assert.strictEqual(body.data.cdp, 'unavailable');
    assert.strictEqual(starts, 1);

    startResult = { port: 9333 };
    response = await call(); body = await response.json();
    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.data.debug_port, 9333);
    assert.strictEqual(body.data.ws.selenium, '127.0.0.1:9333');
    assert.strictEqual(body.data.ws.puppeteer, 'ws://127.0.0.1:9333/devtools/browser/x');
    console.log('CDP port: closed by default, opt-in only, API and bulk-open respect it');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
