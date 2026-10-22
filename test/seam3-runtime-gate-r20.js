'use strict';
/**
 * Agent R20, seam 3 — the runtime-egress gate in main.js's
 * start-browser handler, exercised against REAL controller sessions.
 *
 * The exact fire-and-forget block is extracted verbatim from main.js
 * (from the `void (async () => {` after the s.19/22 comment through
 * its closing `})();`) and executed with the real bindings the
 * handler closes over: the real profile Store (settings come from
 * store.getSettings(), exactly as in the app), the real
 * ExitIpObservationStore, the real checkProxy, the real
 * CamoufoxPlaywrightController holding a live Camoufox session, and
 * a spy around the real observeRuntimeExitIp so every call the gate
 * makes (or correctly does NOT make) is counted.
 *
 * Cases (one live session, settings changed between runs):
 *   (a) runtimeEchoUrl UNSET        -> 0 spy calls, 0 echo hits, 0 records
 *   (b) runtimeEchoUrl ''          -> same strict no-op
 *   (c) runtimeEchoUrl 42 (number)  -> same strict no-op
 *   (d) runtimeEchoUrl -> closed loopback port
 *        -> session already started fine; 1 spy call, recorded:false,
 *           0 records, nothing throws, no unhandled rejection
 *   (e) control: runtimeEchoUrl -> live echo
 *        -> 1 spy call, recorded:true, 1 browser-runtime record
 *           (proves the harness CAN see the observation when the
 *           gate is legitimately open — the no-ops above are the
 *           gate working, not a broken harness)
 *
 * Prerequisites: LHM_CAMOUFOX_EXECUTABLE (lab Camoufox binary) and
 * the repo's playwright-core. Missing prerequisites print NOT_RUN
 * and exit 2 — never a fake pass. NOT for the npm chain (real
 * engine; same rule as the other real-engine tests).
 */
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function notRun(reason) {
  console.log(JSON.stringify({ seam: 'seam3', status: 'NOT_RUN', reason }, null, 1));
  process.exit(2);
}

async function main() {
  const exe = process.env.LHM_CAMOUFOX_EXECUTABLE;
  if (!exe || !fs.existsSync(exe)) notRun('LHM_CAMOUFOX_EXECUTABLE must point at a lab Camoufox binary');
  let pw;
  try { pw = require('playwright-core'); } catch (_) { notRun('playwright-core not loadable'); }

  const Store = require(path.join(ROOT, 'src/db/store'));
  const { ExitIpObservationStore } = require(path.join(ROOT, 'src/health/exitIpObservations'));
  const { CamoufoxPlaywrightController } = require(path.join(ROOT, 'src/engine/CamoufoxPlaywrightController'));
  const { checkProxy } = require(path.join(ROOT, 'src/engine/proxyChecker'));
  const realObserve = require(path.join(ROOT, 'src/health/runtimeEgressObservation')).observeRuntimeExitIp;

  const realPath = fs.realpathSync(exe);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(realPath)).digest('hex');
  let commit = 'unknown';
  try { commit = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD']).toString().trim(); } catch (_) {}

  // Extract the gate block verbatim from main.js.
  const mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const commentAt = mainSrc.indexOf('// Exit-IP observation (Constitution s.19/22)');
  const blockStart = mainSrc.indexOf('void (async () => {', commentAt);
  const blockEnd = mainSrc.indexOf('})();', blockStart) + '})();'.length;
  if (commentAt < 0 || blockStart < 0 || blockEnd <= blockStart)
    throw Error('could not extract the start-browser observation block from main.js');
  const blockSource = mainSrc.slice(blockStart, blockEnd);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-r20-s3-'));
  const checks = [];
  const check = (name, pass, detail) => {
    checks.push({ name, pass: !!pass, detail });
    console.log((pass ? 'PASS' : 'FAIL') + ' [seam3] ' + name + (detail ? ' :: ' + detail : ''));
  };
  let unhandled = null;
  process.on('unhandledRejection', e => { unhandled = String(e && e.message || e); });

  // Echo server: counts every hit, answers the module's contract.
  let echoHits = 0;
  const echo = http.createServer((req, res) => {
    echoHits++;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ip: '127.0.0.1' }));
  });
  await new Promise(r => echo.listen(0, '127.0.0.1', r));
  const echoUrl = 'http://127.0.0.1:' + echo.address().port + '/egress-echo';
  const deadServer = http.createServer();
  await new Promise(r => deadServer.listen(0, '127.0.0.1', r));
  const deadUrl = 'http://127.0.0.1:' + deadServer.address().port + '/egress-echo';
  await new Promise(r => deadServer.close(r));

  // Start-page server: the controller navigates to the profile's
  // start URL at launch; a loopback page keeps that step real without
  // touching the echo counter or the outside network.
  const startServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>r20 seam3 start</title><body>start</body>');
  });
  await new Promise(r => startServer.listen(0, '127.0.0.1', r));
  const startUrl = 'http://127.0.0.1:' + startServer.address().port + '/';

  let controller = null;
  const profileId = 'r20-seam3-profile';
  try {
    const store = new Store(root);
    const saved = store.saveProfile({
      id: profileId, name: 'R20 seam3', engine: 'gecko', engine_type: 'camoufox',
      proxy: { type: 'direct' }, fingerprint: { mode: 'native' },
      startUrls: [startUrl],
    });
    const ipObservationStore = new ExitIpObservationStore(root);

    let exeForController = realPath;
    if (path.basename(realPath).toLowerCase() !== 'camoufox.exe') {
      const shimDir = path.join(root, 'exe-shim');
      fs.mkdirSync(shimDir, { recursive: true });
      exeForController = path.join(shimDir, 'camoufox.exe');
      fs.symlinkSync(realPath, exeForController);
    }
    const verifier = { resolve: e => e === 'camoufox' ? exeForController : (() => { throw Error('unexpected engine'); })() };
    controller = new CamoufoxPlaywrightController(root, {
      verifier, enabled: true, labApproved: false,
      launchPersistentContext: (dir, opts) =>
        pw.firefox.launchPersistentContext(dir, { ...opts, headless: true, timeout: 120000 }),
    });
    await controller.launch(store.getProfile(saved.id));
    check('real controller session live', !!controller.contextFor(profileId),
      'contextFor returned the running context');

    // Spy around the real observation module.
    const calls = [];
    const observeSpy = options => {
      const entry = { options: { profileId: options.profileId, echoUrl: options.echoUrl }, result: null };
      calls.push(entry);
      return realObserve(options).then(r => { entry.result = r; return r; });
    };
    const launcher = { camoufoxPlaywrightController: controller };
    const runGateBlock = new Function(
      'store', 'launcher', 'ipObservationStore', 'appSessionId', 'checkProxy',
      'observeRuntimeExitIp', 'id', blockSource);

    async function runCase(label) {
      const callsBefore = calls.length, hitsBefore = echoHits;
      runGateBlock(store, launcher, ipObservationStore, 'r20-seam3-session',
        checkProxy, observeSpy, profileId);
      // The gate DECISION is made in the block's synchronous prefix:
      // if it is going to call the observation at all, the spy has
      // been called by the time runGateBlock returns. What remains
      // is waiting for any issued call to COMPLETE (its in-page
      // fetch may take up to the block's 8 s timeout on a dead
      // endpoint). No call within 1.2 s = the gate stayed shut.
      const t0 = Date.now();
      while (Date.now() - t0 < 25000) {
        const pending = calls.slice(callsBefore);
        if (pending.length && pending.every(c => c.result !== null)) break;
        if (!pending.length && Date.now() - t0 > 1200) break;
        await new Promise(r => setTimeout(r, 100));
      }
      return {
        label,
        newCalls: calls.slice(callsBefore),
        newHits: echoHits - hitsBefore,
        records: ipObservationStore.list().length,
      };
    }

    // (a) unset
    let r = await runCase('unset');
    check('(a) runtimeEchoUrl unset: strict no-op',
      r.newCalls.length === 0 && r.newHits === 0 && r.records === 0,
      `calls=${r.newCalls.length} hits=${r.newHits} records=${r.records}`);
    // (b) empty string
    store.updateSettings({ runtimeEchoUrl: '' });
    r = await runCase('empty');
    check('(b) runtimeEchoUrl empty string: strict no-op',
      r.newCalls.length === 0 && r.newHits === 0 && r.records === 0,
      `calls=${r.newCalls.length} hits=${r.newHits} records=${r.records}`);
    // (c) non-string (hand-edited db.json shape, via the real Store API)
    store.updateSettings({ runtimeEchoUrl: 42 });
    check('(c0) settings really hold a non-string value',
      store.getSettings().runtimeEchoUrl === 42, 'typeof=' + typeof store.getSettings().runtimeEchoUrl);
    r = await runCase('non-string');
    check('(c) runtimeEchoUrl non-string: strict no-op',
      r.newCalls.length === 0 && r.newHits === 0 && r.records === 0,
      `calls=${r.newCalls.length} hits=${r.newHits} records=${r.records}`);
    // (d) unreachable endpoint: fail-closed, session unaffected
    store.updateSettings({ runtimeEchoUrl: deadUrl });
    r = await runCase('unreachable');
    check('(d) unreachable echo: gate fires once, records nothing, never throws',
      r.newCalls.length === 1 && r.newCalls[0].result &&
      r.newCalls[0].result.recorded === false && r.records === 0 && !unhandled,
      'result=' + JSON.stringify(r.newCalls[0] && r.newCalls[0].result) +
      (unhandled ? ' unhandledRejection=' + unhandled : ''));
    check('(d2) session still alive after the failed observation',
      !!controller.contextFor(profileId), 'contextFor still returns the context');
    // (e) live control
    store.updateSettings({ runtimeEchoUrl: echoUrl });
    r = await runCase('live');
    const entries = ipObservationStore.list();
    check('(e) control: live echo records exactly one browser-runtime entry',
      r.newCalls.length === 1 && r.newCalls[0].result && r.newCalls[0].result.recorded === true &&
      r.newHits === 1 && entries.length === 1 && entries[0].source === 'browser-runtime' &&
      entries[0].profileId === profileId && entries[0].sessionId === 'r20-seam3-session',
      'entries=' + JSON.stringify(entries));

    await controller.stop(profileId).catch(() => {});
    const failed = checks.filter(c => !c.pass);
    console.log(JSON.stringify({
      seam: 'seam3', status: failed.length ? 'FAIL' : 'PASS',
      bound: { commit, os: process.platform + ' ' + os.release(), node: process.version, engine: { path: realPath, sha256 } },
      checks: checks.length, failed: failed.length,
    }, null, 1));
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    if (controller) { try { await controller.stop(profileId); } catch (_) {} }
    echo.close();
    startServer.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
