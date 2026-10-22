'use strict';
/**
 * Stage-0 REAL run for the runtime exit-IP observation module
 * (src/health/runtimeEgressObservation.js; Constitution 19.3/19.4).
 *
 * Boots a real Camoufox through the app's own
 * CamoufoxPlaywrightController (headless seam injected, as in
 * run-isolation.js), then:
 *   1. records a MANAGER-process observation of a loopback echo the
 *      way main.js does today (Node-side fetch + store.record with
 *      source 'manager-process');
 *   2. calls observeRuntimeExitIp() against the SAME echo from the
 *      profile's own browser context and expects a store record
 *      labelled 'browser-runtime';
 *   3. cross-checks three sources of truth: the returned entry, the
 *      store file reloaded from disk, and the echo server's own hit
 *      log (the remote address of the browser's actual connection);
 *   4. negative control: a dead echo endpoint must record NOTHING
 *      (fail-closed) in the same live session.
 *
 * Scope: loopback only. Both sources necessarily see 127.0.0.1 here,
 * so this run proves the mechanism, the source labelling, the
 * persistence and the fail-closed behaviour — it does NOT prove the
 * runtime and manager addresses differ through a real proxy; that
 * differentiation stays NOT_RUN until a controlled proxy exists.
 *
 * Missing prerequisites report NOT_RUN and exit 2 (never a fake pass):
 *  - LHM_CAMOUFOX_EXECUTABLE: lab Camoufox binary path;
 *  - playwright-core: the repo's pinned module, or LHM_PLAYWRIGHT_CORE.
 * Exit 0 = every check passed; exit 1 = a check failed.
 */
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const { CamoufoxPlaywrightController } = require(path.join(ROOT, 'src/engine/CamoufoxPlaywrightController'));
const { ExitIpObservationStore } = require(path.join(ROOT, 'src/health/exitIpObservations'));
const { normalizeObservations } = require(path.join(ROOT, 'src/health/autoIpWarnings'));
const { observeRuntimeExitIp } = require(path.join(ROOT, 'src/health/runtimeEgressObservation'));

function notRun(reason) {
  console.log(JSON.stringify({ status: 'NOT_RUN', reason }, null, 1));
  process.exit(2);
}

function startEchoServer() {
  const hits = [];
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/egress-echo') {
      const record = {
        remoteAddress: req.socket.remoteAddress,
        remotePort: req.socket.remotePort,
        at: new Date().toISOString(),
      };
      hits.push(record);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ip: record.remoteAddress, at: record.at }));
      return;
    }
    if (req.url === '/probe') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><title>LHM runtime egress observation probe</title><body>probe</body>');
      return;
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      server, hits, url: 'http://127.0.0.1:' + server.address().port,
    }));
  });
}

function managerFetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function closedPortUrl() {
  const srv = http.createServer();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  await new Promise(r => srv.close(r));
  return 'http://127.0.0.1:' + port + '/egress-echo';
}

async function main() {
  const exe = process.env.LHM_CAMOUFOX_EXECUTABLE;
  if (!exe || !fs.existsSync(exe))
    notRun('LHM_CAMOUFOX_EXECUTABLE must point at a lab Camoufox binary');
  let pw;
  try {
    pw = process.env.LHM_PLAYWRIGHT_CORE
      ? require(path.resolve(process.env.LHM_PLAYWRIGHT_CORE))
      : require('playwright-core');
  } catch (_) { notRun('playwright-core not loadable (repo node_modules or LHM_PLAYWRIGHT_CORE)'); }

  const realPath = fs.realpathSync(exe);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(realPath)).digest('hex');
  const expected = (process.env.LHM_CAMOUFOX_EXE_SHA256 || '').toLowerCase();
  if (expected && expected !== sha256)
    notRun('Camoufox binary SHA-256 did not match LHM_CAMOUFOX_EXE_SHA256');
  let engineVersion = 'unknown';
  try {
    engineVersion = execFileSync(realPath, ['--version'], { timeout: 15000 })
      .toString().trim().split('\n')[0];
  } catch (_) { /* version string is report metadata only */ }
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD']).toString().trim();
  } catch (_) { /* report metadata only */ }

  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-runtime-egress-'));
  const echo = await startEchoServer();
  const sessionId = 'a7-real-run';
  const profileId = 'runtime-egress-a7';
  let controller = null;
  try {
    // Controller harness (same recipe as run-isolation.js): the
    // controller accepts only a basename of camoufox.exe, so shim the
    // lab binary through a symlink; force headless via the injected
    // launcher seam on this display-less Linux host.
    let exeForController = realPath;
    if (path.basename(realPath).toLowerCase() !== 'camoufox.exe') {
      const shimDir = path.join(root, 'exe-shim');
      fs.mkdirSync(shimDir, { recursive: true });
      exeForController = path.join(shimDir, 'camoufox.exe');
      fs.symlinkSync(realPath, exeForController);
    }
    const verifier = { resolve: engine => engine === 'camoufox' ? exeForController : (() => { throw Error('unexpected engine'); })() };
    controller = new CamoufoxPlaywrightController(root, {
      verifier, enabled: true, labApproved: false,
      launchPersistentContext: (dir, launchOptions) =>
        pw.firefox.launchPersistentContext(dir, { ...launchOptions, headless: true, timeout: 120000 }),
    });
    const profile = {
      id: profileId, name: 'Runtime egress observation (agent-7)',
      engine: 'gecko', engine_type: 'camoufox',
      fingerprint: { mode: 'native' }, proxy: { type: 'direct' },
    };
    await controller.launch(profile);
    const context = controller.contextFor(profileId);
    check('controller session live', !!context, 'contextFor returned the running context');

    const store = new ExitIpObservationStore(root);

    // 1) Manager-process observation, the way main.js records today.
    const manager = await managerFetch(echo.url + '/egress-echo');
    const managerSaved = store.record({
      profileId, ip: manager.ip, sessionId, source: 'manager-process',
    });
    check('manager-process observation recorded with its label',
      !!managerSaved && managerSaved.source === 'manager-process',
      'ip=' + manager.ip);

    // 2) Runtime observation through the module under test.
    const hitsBefore = echo.hits.length;
    const result = await observeRuntimeExitIp({
      context, profileId, sessionId,
      echoUrl: echo.url + '/egress-echo', store, timeoutMs: 10000,
    });
    check('runtime observation recorded', result.recorded === true,
      JSON.stringify(result).slice(0, 200));
    check('runtime entry labelled browser-runtime',
      result.entry && result.entry.source === 'browser-runtime',
      result.entry && result.entry.source);
    const runtimeHit = echo.hits[hitsBefore];
    check('echo server saw a NEW connection for the runtime probe',
      !!runtimeHit, 'hits before=' + hitsBefore + ' after=' + echo.hits.length);
    check('recorded IP equals the source address the echo server logged',
      !!runtimeHit && result.entry && result.entry.ip === runtimeHit.remoteAddress,
      'entry=' + (result.entry && result.entry.ip) + ' echoLog=' + (runtimeHit && runtimeHit.remoteAddress));

    // 3) Persistence: reload the store from disk; D3 must accept it.
    const reloaded = new ExitIpObservationStore(root);
    const runtimeEntries = reloaded.list().filter(e => e.source === 'browser-runtime');
    check('runtime entry persisted to disk with label', runtimeEntries.length === 1,
      'entries=' + reloaded.list().length);
    let normalised = null;
    try { normalised = normalizeObservations(reloaded.list()); } catch (_) { /* reported below */ }
    check('D3 normalisation accepts the mixed labelled store',
      Array.isArray(normalised) && normalised.length === 2 &&
      normalised.some(e => e.source === 'browser-runtime') &&
      normalised.some(e => e.source === 'manager-process'),
      normalised ? normalised.map(e => e.source).join(',') : 'threw');

    // 4) Negative control: dead echo in the same live session.
    const deadUrl = await closedPortUrl();
    const countBefore = store.list().length;
    const dead = await observeRuntimeExitIp({
      context, profileId, sessionId, echoUrl: deadUrl, store, timeoutMs: 5000,
    });
    check('dead echo records nothing (fail-closed)',
      dead.recorded === false && store.list().length === countBefore,
      'reason=' + dead.reason);

    await controller.stop(profileId).catch(() => {});

    const failed = checks.filter(c => !c.pass);
    console.log(JSON.stringify({
      status: failed.length ? 'FAIL' : 'RAN',
      scope: 'Loopback mechanism proof through the app controller with a lab ' +
        'Camoufox binary. Proves: runtime-side fetch, source labelling, store ' +
        'persistence, D3 acceptance, fail-closed on a dead echo. Does NOT prove ' +
        'the runtime/manager addresses differ through a real proxy.',
      bound: {
        commit, os: process.platform + ' ' + os.release(),
        node: process.version,
        playwrightCore: (() => { try { return require('playwright-core/package.json').version; } catch (_) { return 'via LHM_PLAYWRIGHT_CORE'; } })(),
        engine: { path: realPath, sha256, version: engineVersion },
        at: new Date().toISOString(),
      },
      checks,
      observations: reloaded.list(),
      notRun: [
        'Runtime-vs-manager address differentiation through a real proxy — needs a controlled proxy (coordinated with the proxy lab); on loopback both are 127.0.0.1 by construction.',
        'Manually opened / native-adapter sessions — no page handle exists for this observation source (see INTEGRATION-NOTES).',
        'Windows / packaged EXE — this run is Linux with the lab binary (gate 3 territory).',
      ],
    }, null, 1));
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    if (controller) {
      try { await controller.stop(profileId); } catch (_) { /* already stopped */ }
    }
    echo.server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
