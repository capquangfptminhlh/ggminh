'use strict';
/*
 * Graceful browser stop (cookies survive "Stop"), Edge relaunch guard and
 * per-profile download folders. Unit/mock tier: no real browser is started
 * and no OS command is executed (the command runner is injected).
 * Real-browser evidence: docs/LHM_BROWSER_STOP_AND_DOWNLOADS.md.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');
const Store = require('../src/db/store');
const BrowserLauncher = require('../src/engine/browserLauncher');
const { stopBrowserProcess } = require('../src/engine/processStopper');
const {
  profileDownloadDir, applyChromiumDownloadDir, applyGeckoDownloadDir, GECKO_BEGIN
} = require('../src/engine/downloadDirectory');
const { updateGeckoProxy, BEGIN: PROXY_BEGIN } = require('../src/engine/geckoProxy');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function fakeProc(pid = 4242) {
  const proc = new EventEmitter();
  proc.pid = pid; proc.exitCode = null; proc.signalCode = null; proc.signals = [];
  proc.kill = signal => { proc.signals.push(signal); return true; };
  proc.exit = (code = 0) => { proc.exitCode = code; proc.emit('exit', code); };
  return proc;
}
function recorder({ failGraceful = false } = {}) {
  const calls = [];
  const run = (cmd, args, _opts, cb) => {
    calls.push([cmd, ...args]);
    const graceful = !args.includes('/F');
    setImmediate(() => cb(graceful && failGraceful ? Error('no window') : null));
  };
  return { calls, run };
}
const isChild = () => true;

async function stopperTests() {
  // Windows: graceful WM_CLOSE first (no /T, no /F); browser exits -> no force.
  {
    const proc = fakeProc(), r = recorder();
    assert.strictEqual(stopBrowserProcess(proc, { platform: 'win32', run: r.run, graceMs: 40, isChild }), true);
    assert.deepStrictEqual(r.calls, [['taskkill', '/PID', '4242']]);
    proc.exit(0);
    await sleep(80);
    assert.deepStrictEqual(r.calls, [['taskkill', '/PID', '4242']], 'no force after a clean exit');
    assert.deepStrictEqual(proc.signals, [], 'ChildProcess.kill (TerminateProcess) is not used');
  }
  // Windows: browser ignores the close request -> tree force-kill after grace.
  {
    const proc = fakeProc(), r = recorder();
    stopBrowserProcess(proc, { platform: 'win32', run: r.run, graceMs: 30, isChild });
    await sleep(80);
    assert.deepStrictEqual(r.calls[1], ['taskkill', '/PID', '4242', '/T', '/F']);
  }
  // Windows: no closable window (headless/starting) -> force at once.
  {
    const proc = fakeProc(), r = recorder({ failGraceful: true });
    stopBrowserProcess(proc, { platform: 'win32', run: r.run, graceMs: 5000, isChild });
    await sleep(30);
    assert.deepStrictEqual(r.calls[1], ['taskkill', '/PID', '4242', '/T', '/F']);
  }
  // Windows: objects that are not our ChildProcess never reach taskkill.
  {
    const proc = fakeProc(), r = recorder();
    stopBrowserProcess(proc, { platform: 'win32', run: r.run, graceMs: 30 });
    assert.deepStrictEqual(r.calls, []);
    assert.deepStrictEqual(proc.signals, ['SIGTERM']);
    await sleep(70);
    assert.deepStrictEqual(proc.signals, ['SIGTERM', 'SIGKILL']);
  }
  // POSIX: SIGTERM is graceful; SIGKILL only if still running after grace.
  {
    const proc = fakeProc(), r = recorder();
    stopBrowserProcess(proc, { platform: 'linux', run: r.run, graceMs: 30, isChild });
    proc.exit(0);
    await sleep(70);
    assert.deepStrictEqual(proc.signals, ['SIGTERM']);
    assert.deepStrictEqual(r.calls, []);
  }
  // Already exited or kill refused -> reported as not sent.
  {
    const proc = fakeProc(); proc.exitCode = 0;
    assert.strictEqual(stopBrowserProcess(proc, { platform: 'win32', run: recorder().run, isChild }), false);
    const refused = fakeProc(); refused.kill = () => false;
    assert.strictEqual(stopBrowserProcess(refused, { platform: 'linux', graceMs: 10 }), false);
  }
}

function downloadTests(root) {
  const downloads = path.join(root, 'dl');
  const own = profileDownloadDir(downloads, 'prof_a');
  assert.strictEqual(own, path.join(downloads, 'prof_a'));
  assert.throws(() => profileDownloadDir(downloads, '../x'), /Invalid profile ID/);
  assert.throws(() => profileDownloadDir('relative', 'prof_a'), /absolute/);

  // Fresh profile: Preferences created, folder created.
  const dirA = path.join(root, 'profiles', 'prof_a');
  fs.mkdirSync(dirA, { recursive: true });
  let result = applyChromiumDownloadDir(dirA, downloads, 'prof_a');
  assert.strictEqual(result.changed, true);
  const prefsFile = path.join(dirA, 'Default', 'Preferences');
  let prefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
  assert.strictEqual(prefs.download.default_directory, own);
  assert.strictEqual(prefs.savefile.default_directory, own);
  assert(fs.statSync(own).isDirectory());

  // Existing browser prefs are preserved; second run is a no-op.
  prefs.browser = { custom: 1 }; prefs.download.prompt_for_download = true;
  fs.writeFileSync(prefsFile, JSON.stringify(prefs));
  result = applyChromiumDownloadDir(dirA, downloads, 'prof_a');
  assert.strictEqual(result.changed, false);
  prefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
  assert.deepStrictEqual(prefs.browser, { custom: 1 });
  assert.strictEqual(prefs.download.prompt_for_download, true);

  // A profile directory copied from another profile is re-pointed.
  prefs.download.default_directory = path.join(downloads, 'prof_other');
  prefs.savefile.default_directory = downloads; // the shared root itself
  fs.writeFileSync(prefsFile, JSON.stringify(prefs));
  applyChromiumDownloadDir(dirA, downloads, 'prof_a');
  prefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
  assert.strictEqual(prefs.download.default_directory, own);
  assert.strictEqual(prefs.savefile.default_directory, own);

  // A folder the user picked deliberately outside the root is kept.
  const custom = path.join(root, 'my-own-folder');
  prefs.download.default_directory = custom;
  fs.writeFileSync(prefsFile, JSON.stringify(prefs));
  applyChromiumDownloadDir(dirA, downloads, 'prof_a');
  prefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
  assert.strictEqual(prefs.download.default_directory, custom);

  // Unreadable Preferences: backed up, never silently destroyed.
  fs.writeFileSync(prefsFile, '{broken');
  applyChromiumDownloadDir(dirA, downloads, 'prof_a');
  assert.strictEqual(fs.readFileSync(prefsFile + '.lhm-unreadable', 'utf8'), '{broken');
  assert.strictEqual(JSON.parse(fs.readFileSync(prefsFile, 'utf8')).download.default_directory, own);

  // Gecko: own block, coexists with the proxy block and user prefs, idempotent.
  const gecko = path.join(root, 'gecko-profiles', 'prof_g');
  fs.mkdirSync(gecko, { recursive: true });
  fs.writeFileSync(path.join(gecko, 'user.js'), 'user_pref("custom.user", true);\n');
  updateGeckoProxy(gecko, { type: 'direct' });
  applyGeckoDownloadDir(gecko, downloads, 'prof_g');
  applyGeckoDownloadDir(gecko, downloads, 'prof_g');
  const userJs = fs.readFileSync(path.join(gecko, 'user.js'), 'utf8');
  assert(userJs.includes('user_pref("custom.user", true);'));
  assert.strictEqual(userJs.split(GECKO_BEGIN).length, 2, 'exactly one downloads block');
  assert.strictEqual(userJs.split(PROXY_BEGIN).length, 2, 'proxy block untouched');
  assert(userJs.includes('user_pref("browser.download.dir", ' + JSON.stringify(path.join(downloads, 'prof_g')) + ');'));
  assert(userJs.includes('user_pref("browser.download.folderList", 2);'));
  updateGeckoProxy(gecko, { type: 'direct' });
  assert(fs.readFileSync(path.join(gecko, 'user.js'), 'utf8').includes(GECKO_BEGIN), 'proxy refresh keeps downloads block');
}

async function launcherTests(root) {
  const store = new Store(path.join(root, 'app'));
  const a = store.saveProfile({ name: 'A', engine: 'chromium', proxy: { type: 'direct' } });
  const b = store.saveProfile({ name: 'B', engine: 'chromium', proxy: { type: 'direct' } });
  const g = store.saveProfile({ name: 'G', engine: 'gecko', proxy: { type: 'direct' } });
  const spawned = [], stopped = [];
  const spawnProcess = (bin, args) => {
    const proc = fakeProc(60000 + spawned.length);
    spawned.push({ bin, args, proc });
    process.nextTick(() => proc.emit('spawn'));
    return proc;
  };
  const downloadsRoot = path.join(root, 'customer-downloads');
  const launcher = new BrowserLauncher(store, {
    spawnProcess, downloadsRoot, stopProcess: proc => { stopped.push(proc); return true; }
  });
  // Host-absolute paths (QA-006): the launcher reads the file name with the
  // host path module, so a Windows literal has no basename on POSIX.
  const binDir = process.platform === 'win32' ? 'C:\\LHMTest\\' : '/LHMTest/';
  let binary = binDir + 'msedge.exe';
  launcher.findBrowserBinary = () => binary;
  await launcher.start(a.id);
  assert.strictEqual(spawned[0].args[0], '--edge-skip-compat-layer-relaunch', 'Edge must not relaunch itself');
  binary = binDir + 'chrome.exe';
  await launcher.start(b.id);
  assert(!spawned[1].args.includes('--edge-skip-compat-layer-relaunch'), 'flag is Edge-only');
  await launcher.start(g.id);
  assert(!spawned[2].args.includes('--edge-skip-compat-layer-relaunch'));

  const prefsOf = id => JSON.parse(fs.readFileSync(path.join(store.baseDir, 'profiles', id, 'Default', 'Preferences'), 'utf8'));
  assert.strictEqual(prefsOf(a.id).download.default_directory, path.join(downloadsRoot, a.id));
  assert.strictEqual(prefsOf(b.id).download.default_directory, path.join(downloadsRoot, b.id));
  assert.notStrictEqual(prefsOf(a.id).download.default_directory, prefsOf(b.id).download.default_directory);
  const geckoJs = fs.readFileSync(path.join(store.baseDir, 'gecko-profiles', g.id, 'user.js'), 'utf8');
  assert(geckoJs.includes(JSON.stringify(path.join(downloadsRoot, g.id))));

  // stop() delegates to the graceful stopper and keeps the lock until exit.
  assert.deepStrictEqual(launcher.stop(a.id), { success: true, pendingExit: true });
  assert.strictEqual(stopped[0], spawned[0].proc);
  assert.deepStrictEqual(spawned[0].proc.signals, [], 'no immediate TerminateProcess');
  assert.strictEqual(launcher.isBusy(a.id), true);
  spawned[0].proc.exit(0);
  assert.strictEqual(launcher.isBusy(a.id), false);
  const refusing = new BrowserLauncher(store, { spawnProcess, downloadsRoot, stopProcess: () => false });
  refusing.findBrowserBinary = () => binary;
  await refusing.start(a.id);
  assert.strictEqual(refusing.stop(a.id).success, false);

  // Default download root stays inside app data, per profile.
  const defaults = new BrowserLauncher(store, { spawnProcess });
  assert.strictEqual(defaults.downloadsRoot, path.join(store.baseDir, 'downloads'));
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-stop-downloads-'));
  try {
    await stopperTests();
    downloadTests(root);
    await launcherTests(root);
    console.log('Graceful browser stop, Edge relaunch guard and per-profile download folders passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
