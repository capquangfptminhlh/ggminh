'use strict';
// Mandatory installed-browser Windows smoke: use an isolated disposable profile.
// Try both installed Chrome and Edge (each in a new storage directory) because
// a GitHub-hosted runner may have a transiently unavailable browser install.
// Fail closed if NO real installed browser exposes CDP and opens a real tab.
const assert = require('assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const Store = require('../src/db/store');
const BrowserLauncher = require('../src/engine/browserLauncher');
const { RuntimeRegistry } = require('../src/engine/runtimeRegistry');
const { openInRunning } = require('../src/ops/liveNavigation');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function browserCandidates(env = process.env) {
  const candidates = [
    path.join(env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ];
  return [...new Set(candidates)].filter(file => fs.existsSync(file));
}

async function probeDevTools(port, launcher, profileId) {
  // A slow GitHub-hosted Windows runner may need more than 17.5 seconds.
  // Still fail if the real process has already exited; do not mock readiness.
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!launcher.getActive(profileId)) {
      throw Error('Browser process exited before DevTools became available');
    }
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/version', {
        signal: AbortSignal.timeout(900)
      });
      if (res.ok) {
        const info = await res.json();
        if (typeof info.webSocketDebuggerUrl === 'string' &&
            info.webSocketDebuggerUrl.startsWith('ws://127.0.0.1:' + port + '/')) {
          return info;
        }
      }
    } catch (_) { /* continue checking the live localhost endpoint */ }
    await wait(500);
  }
  throw Error('Browser did not expose a valid local DevTools WebSocket endpoint');
}

async function verifyInstalledBrowser(executable) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-real-browser-smoke-'));
  let launcher, launch;
  try {
    const store = new Store(path.join(root, 'storage'));
    store.updateSettings({ apiEnabled: true });
    const profile = store.saveProfile({
      name: 'Disposable CI Chromium', engine: 'chromium',
      startUrl: 'https://example.com/',
      proxy: { type: 'direct' }, fingerprint: { mode: 'native' }
    });
    launcher = new BrowserLauncher(store);
    const runtimes = new RuntimeRegistry(path.join(root, 'storage'));
    const registered = runtimes.register('chromium', executable);
    assert.strictEqual(registered.sha256.length, 64);
    launcher.runtimeRegistry = runtimes;
    assert.strictEqual(launcher.findBrowserBinary('chromium'), executable);
    launch = await launcher.start(profile.id);
    assert(launch.port >= 1024 && launch.port <= 65535);
    await probeDevTools(launch.port, launcher, profile.id);
    const result = await openInRunning(store, launcher, [profile.id], 'https://example.org/ci-tab');
    assert.strictEqual(result.opened, 1, JSON.stringify(result));
    assert.strictEqual(result.results[0].status, 'opened');
    assert(fs.existsSync(path.join(root, 'storage', 'profiles', profile.id)));
    return path.basename(executable);
  } finally {
    try { if (launcher && launch) launcher.stop(launch.profileId); } catch (_) {}
    if (launch?.pid) {
      try {
        execFileSync('taskkill', ['/PID', String(launch.pid), '/T', '/F'],
          { stdio: 'ignore', timeout: 15000 });
      } catch (_) { /* a previously closed browser needs no taskkill */ }
    }
    await wait(1500);
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); }
    catch (error) { console.warn('Temporary CI browser cleanup deferred:', error.message); }
  }
}

(async () => {
  if (process.platform !== 'win32') {
    console.log('SKIPPED: real installed-browser smoke needs a Windows runner');
    return;
  }
  const installed = browserCandidates();
  assert(installed.length > 0, 'Mandatory Windows smoke requires an installed Chrome or Edge');
  const failures = [];
  for (const executable of installed) {
    try {
      const name = await verifyInstalledBrowser(executable);
      console.log('REAL WINDOWS CHROMIUM OK: ' + name +
        ' isolated profile, local DevTools endpoint and active new-tab navigation');
      return;
    } catch (error) {
      // Each fallback is a completely new profile and a different installed
      // browser, not a retry that reuses a potentially locked session folder.
      const reason = path.basename(executable) + ': ' + String(error.message);
      failures.push(reason);
      console.warn('[Real-browser smoke] Attempt failed: ' + reason);
    }
  }
  throw Error('Real Chrome/Edge smoke FAILED; no installed browser passed:\n' +
    failures.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { browserCandidates, probeDevTools };
