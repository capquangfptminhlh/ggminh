'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { launchReadiness } = require('../src/health/launchReadiness');
const BrowserLauncher = require('../src/engine/browserLauncher');

function has(report, code) { return report.issues.some(issue => issue.code === code); }
(async () => {
  const clean = {
    id: 'pb_test', name: 'Workspace A', engine: 'chromium',
    proxy: { type: 'direct' }, fingerprint: { mode: 'native' },
    startUrl: 'https://example.com/'
  };
  const result = launchReadiness(clean);
  assert.strictEqual(result.canLaunch, true);
  assert.strictEqual(result.status, 'review', 'Offline pass must never claim a fully measured safe identity');
  assert.strictEqual(result.measuredNetwork, false);
  assert.strictEqual(result.detectedAsNewUser, 'NOT_MEASURED');
  assert.deepStrictEqual(result.layers.map(x => x.key),
    ['network', 'storage', 'fingerprint', 'behavior']);
  assert(result.layers.filter(x => x.status === 'review').length >= 3);
  assert(has(result, 'direct_connection'));
  assert(has(result, 'remote_detection_unknown'));

  const imported = launchReadiness({ ...clean, requiresProxySetup: true });
  assert.strictEqual(imported.status, 'blocked');
  assert(has(imported, 'proxy_setup_required'));

  const invalid = launchReadiness({ ...clean,
    startUrls: ['file:///etc/passwd'], startUrl: '' });
  assert.strictEqual(invalid.canLaunch, false);
  assert(has(invalid, 'start_urls_invalid'));

  const loginInUrl = launchReadiness({ ...clean, startUrl: 'https://u:p@example.org/' });
  assert.strictEqual(loginInUrl.canLaunch, false);
  assert(has(loginInUrl, 'start_urls_invalid'));

  const inconsistent = launchReadiness({ ...clean,
    fingerprint: { mode: 'custom', os: 'macOS', platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/144.0.0.0',
      screen: { width: 400, height: 800, availWidth: 1200 } }
  });
  assert.strictEqual(inconsistent.canLaunch, false);
  assert(has(inconsistent, 'signal_ua_os_mismatch'));
  assert(has(inconsistent, 'signal_screen_width_mismatch'));
  assert.strictEqual(inconsistent.layers.find(x => x.key === 'fingerprint').status, 'blocked');

  const authenticated = { ...clean, proxy: {
    type: 'socks5', host: 'proxy.example', port: 1080, authProxyId: 'px_0123456789abcdef'
  } };
  const existing = [{ id: 'px_0123456789abcdef', type: 'socks5',
    host: 'proxy.example', port: 1080 }];
  assert(has(launchReadiness(authenticated), 'proxy_reference_missing'));
  assert(has(launchReadiness(authenticated, { proxies: existing }), 'proxy_vault_unavailable'));
  assert(has(launchReadiness(authenticated, { proxies: existing, vault: {
    available: () => true, has: () => false
  } }), 'proxy_password_missing'));

  const linked = launchReadiness(authenticated, { proxies: existing, vault: {
    available: () => true, has: () => true
  } });
  assert.strictEqual(linked.canLaunch, true);
  assert(has(linked, 'network_unverified'), 'Credentials do not prove DNS/WebRTC or route isolation');

  const launcherStore = {
    baseDir: path.resolve('/tmp/lhm-test-preflight'),
    data: { proxies: existing },
    getSettings: () => ({}),
    getProfile: () => authenticated
  };
  const launcher = new BrowserLauncher(launcherStore, { spawnProcess: () => {
    throw Error('Must not spawn before local preflight');
  } });
  let adapterCalls = 0;
  launcher.engineFactory.launchProfile = async () => {
    adapterCalls++;
    return { success: true };
  };
  await assert.rejects(() => launcher.start(authenticated.id), /Launch readiness blocked/);
  assert.strictEqual(adapterCalls, 0, 'All launch routes must fail closed on missing vault');
  launcher.proxyVault = { available: () => true, has: () => true };
  const opened = await launcher.start(authenticated.id);
  assert.strictEqual(opened.success, true);
  assert.strictEqual(adapterCalls, 1, 'Valid local profile may start after warnings are understood');

  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'src/ui/index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/ui/renderer.js'), 'utf8');
  const tower = fs.readFileSync(path.join(root, 'src/ui/controlTower.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'src/ui/launchReadiness.js'), 'utf8');
  assert(main.includes("ipcMain.handle('get-launch-readiness'"));
  assert(preload.includes("ipcRenderer.invoke('get-launch-readiness'"));
  assert(renderer.includes('LHMLaunchReadiness.confirm(profile.id)'));
  assert(tower.includes('api.getLaunchReadiness(id)'));
  for (const id of ['modal-launch-readiness', 'launch-readiness-layers',
    'launch-readiness-confirm', 'launch-readiness-status']) {
    assert(index.includes('id="' + id + '"'), 'Missing prelaunch UI: ' + id);
  }
  assert(index.includes('src="launchReadiness.js"'));
  assert(index.includes('href="launchReadiness.css"'));
  assert(ui.includes('lastReport?.canLaunch'));
  assert(!ui.includes('innerHTML'), 'Untrusted data must not be inserted as HTML');
  console.log('LHM four-layer preflight: blocking, limitations, batch/UI wiring and old launcher path passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
