'use strict';
/**
 * Stage-0 REAL proof for the LHM echo endpoint reference implementation
 * (tools/echo-service/echo-service.js; agent-r10; Constitution 19.3,
 * 19.4, 22, 23).
 *
 * Stands up the REAL echo service in HTTPS mode (throwaway self-signed
 * lab cert), wires it exactly the way main.js does — a
 * `settings.runtimeEchoUrl` value passed to observeRuntimeExitIp with
 * the context of a live CamoufoxPlaywrightController session and the
 * real ExitIpObservationStore — and checks:
 *   1. the service answers the client contract over TLS;
 *   2. a manager-process observation is recorded with its label;
 *   3. the runtime observation is recorded with source
 *      'browser-runtime', and the service's own request log shows the
 *      browser's hit (the address recorded is the address the service
 *      saw on the browser's actual connection);
 *   4. the store persists both labels to disk; the warning service
 *      consumes them, and once a second profile shares the exit IP,
 *      the D3 `shared_exit_ip` warning fires naming BOTH profiles —
 *      i.e. the browser-runtime observation participates in a real
 *      warning report, it is not just stored;
 *   5. negative controls in the same live session: a 404 path and a
 *      dead endpoint each record NOTHING (fail-closed).
 *
 * Lab accommodations, stated plainly: headless launch (no display on
 * this host) and ignoreHTTPSErrors in the injected launcher seam
 * (the cert is a throwaway lab cert; production uses a publicly
 * trusted cert and needs neither accommodation for TLS to verify).
 *
 * Scope: loopback, DIRECT profile. Both sources necessarily see
 * 127.0.0.1 here, so this proves the mechanism end-to-end (service,
 * TLS, in-page fetch, labelling, persistence, warning pipeline,
 * fail-closed) — it does NOT prove the runtime and manager addresses
 * DIFFER through a real proxy. That distinction stays NOT_RUN and
 * belongs to Gate 3 (see the notRun list in the report).
 *
 * Prerequisites (missing -> NOT_RUN, exit 2, never a fake pass):
 *  - LHM_CAMOUFOX_EXECUTABLE: lab Camoufox binary path;
 *  - playwright-core: the repo's pinned module (npm ci);
 *  - openssl on PATH for the throwaway lab cert.
 * Exit 0 = every check passed; exit 1 = a check failed.
 * The bound JSON report is printed and written to
 * stage0-measure/agent-r10-echo-endpoint-results.json.
 */
const fs = require('node:fs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const { CamoufoxPlaywrightController } = require(path.join(ROOT, 'src/engine/CamoufoxPlaywrightController'));
const { ExitIpObservationStore } = require(path.join(ROOT, 'src/health/exitIpObservations'));
const { normalizeObservations } = require(path.join(ROOT, 'src/health/autoIpWarnings'));
const { observeRuntimeExitIp, parseEchoIp } = require(path.join(ROOT, 'src/health/runtimeEgressObservation'));
const { createWarningService } = require(path.join(ROOT, 'src/monitor/warningService'));
const { createEchoServer } = require(path.join(ROOT, 'tools/echo-service/echo-service'));

const RESULTS_FILE = path.join(__dirname, 'agent-r10-echo-endpoint-results.json');

function notRun(reason) {
  console.log(JSON.stringify({ status: 'NOT_RUN', reason }, null, 1));
  process.exit(2);
}

function httpsGet(url, ca) {
  return new Promise((resolve, reject) => {
    https.get(url, { ca }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}

async function main() {
  const exe = process.env.LHM_CAMOUFOX_EXECUTABLE;
  if (!exe || !fs.existsSync(exe))
    notRun('LHM_CAMOUFOX_EXECUTABLE must point at a lab Camoufox binary');
  let pw;
  try { pw = require('playwright-core'); }
  catch (_) { notRun('playwright-core not loadable (run npm ci in the repo)'); }
  try { execFileSync('openssl', ['version'], { stdio: 'pipe' }); }
  catch (_) { notRun('openssl not on PATH (needed for the throwaway lab cert)'); }

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
  try { commit = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD']).toString().trim(); } catch (_) {}
  const servicePath = path.join(ROOT, 'tools/echo-service/echo-service.js');
  const serviceSha256 = crypto.createHash('sha256').update(fs.readFileSync(servicePath)).digest('hex');

  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-echo-proof-'));
  const sessionId = 'r10-echo-proof';
  const profileId = 'echo-proof-a';
  const otherProfileId = 'echo-proof-b';
  let controller = null;
  let echoServer = null;
  try {
    // Throwaway lab cert (self-signed; SAN covers the loopback URL).
    const certFile = path.join(root, 'cert.pem');
    const keyFile = path.join(root, 'key.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'pipe' });
    const ca = fs.readFileSync(certFile);

    // The REAL service, HTTPS mode, with its request hook as the
    // server-side source of truth for who actually connected.
    const serviceHits = [];
    const created = createEchoServer({
      port: 0, host: '127.0.0.1', tlsCertFile: certFile, tlsKeyFile: keyFile,
      allowHttp: false, trustProxy: false, rateMax: 600, rateWindowMs: 60000,
      log: false,
    }, { logger: () => {}, onRequest: hit => serviceHits.push(hit) });
    echoServer = created.server;
    check('service starts in HTTPS mode', created.mode === 'https', 'mode=' + created.mode);
    await new Promise((resolve, reject) => {
      echoServer.once('error', reject);
      echoServer.listen(0, '127.0.0.1', resolve);
    });
    const port = echoServer.address().port;
    // The exact settings value an owner would configure (on loopback here):
    const runtimeEchoUrl = `https://127.0.0.1:${port}/ip`;

    // 1) Contract over TLS, from Node, before any browser is involved.
    const direct = await httpsGet(runtimeEchoUrl, ca);
    check('HTTPS contract: 200 + JSON IPv4 + CORS + no-store, no redirect',
      direct.status === 200 && parseEchoIp(direct.body) === '127.0.0.1' &&
      direct.headers['access-control-allow-origin'] === '*' &&
      direct.headers['cache-control'] === 'no-store' &&
      !direct.headers.location,
      'status=' + direct.status + ' body=' + direct.body.trim());

    // Controller harness: the controller accepts only a basename of
    // camoufox.exe, so shim the lab binary through a symlink; the
    // injected launcher seam forces headless + lab-cert tolerance.
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
        pw.firefox.launchPersistentContext(dir, {
          ...launchOptions, headless: true, ignoreHTTPSErrors: true, timeout: 120000,
        }),
    });
    const profile = {
      id: profileId, name: 'Echo endpoint proof (agent-r10)',
      engine: 'gecko', engine_type: 'camoufox',
      fingerprint: { mode: 'native' }, proxy: { type: 'direct' },
    };
    await controller.launch(profile);
    const context = controller.contextFor(profileId);
    check('controller session live', !!context, 'contextFor returned the running context');

    const store = new ExitIpObservationStore(root);

    // 2) Manager-process observation, the way main.js records it.
    const managerBody = await httpsGet(runtimeEchoUrl, ca);
    const managerSaved = store.record({
      profileId, ip: parseEchoIp(managerBody.body), sessionId, source: 'manager-process',
    });
    check('manager-process observation recorded with its label',
      !!managerSaved && managerSaved.source === 'manager-process',
      'ip=' + (managerSaved && managerSaved.ip));

    // 3) Runtime observation through the product path under test:
    //    observeRuntimeExitIp + the controller context + the store,
    //    with runtimeEchoUrl as the settings value.
    const hitsBefore = serviceHits.length;
    const result = await observeRuntimeExitIp({
      context, profileId, sessionId, echoUrl: runtimeEchoUrl, store, timeoutMs: 10000,
    });
    check('runtime observation recorded', result.recorded === true,
      JSON.stringify(result).slice(0, 200));
    check('runtime entry labelled browser-runtime',
      !!result.entry && result.entry.source === 'browser-runtime',
      result.entry && result.entry.source);
    const browserHit = serviceHits.slice(hitsBefore)
      .find(h => h.path === '/ip' && h.status === 200);
    check('service saw a NEW connection for the in-page probe',
      !!browserHit, 'hits before=' + hitsBefore + ' after=' + serviceHits.length);
    check('recorded IP equals the source address the service logged for the browser connection',
      !!browserHit && !!result.entry && result.entry.ip === browserHit.ip,
      'entry=' + (result.entry && result.entry.ip) + ' serviceLog=' + (browserHit && browserHit.ip));

    // 4) Persistence + warning pipeline.
    const reloaded = new ExitIpObservationStore(root);
    const runtimeEntries = reloaded.list().filter(e => e.source === 'browser-runtime');
    check('runtime entry persisted to disk with label', runtimeEntries.length === 1,
      'entries=' + reloaded.list().length);
    let normalised = null;
    try { normalised = normalizeObservations(reloaded.list()); } catch (_) {}
    check('D3 normalisation carries the browser-runtime label through',
      Array.isArray(normalised) &&
      normalised.some(e => e.source === 'browser-runtime') &&
      normalised.some(e => e.source === 'manager-process'),
      normalised ? normalised.map(e => e.source).join(',') : 'threw');
    const service = createWarningService();
    const report1 = service.evaluate({ ipObservations: reloaded.list() });
    check('warning service consumes the store (ipWarnings source ok)',
      report1.sources.ipWarnings.status === 'ok',
      'status=' + report1.sources.ipWarnings.status);
    // A second profile exiting through the same address: the D3
    // shared-exit-IP warning must fire and name the runtime-observed
    // profile — the runtime observation feeds a real warning report.
    store.record({ profileId: otherProfileId, ip: '127.0.0.1', sessionId, source: 'manager-process' });
    const report2 = service.evaluate({ ipObservations: store.list() });
    const shared = report2.warnings.find(w => w.code === 'shared_exit_ip');
    check('shared_exit_ip warning fires and names the runtime-observed profile',
      !!shared && shared.observed.profiles.includes(profileId) &&
      shared.observed.profiles.includes(otherProfileId),
      shared ? 'profiles=' + shared.observed.profiles.join(',') +
        ' ips=' + (shared.observed.values.ips || []).join(',') : 'no shared_exit_ip warning');

    // 5) Negative controls in the same live session.
    const countBefore = store.list().length;
    const notFound = await observeRuntimeExitIp({
      context, profileId, sessionId,
      echoUrl: `https://127.0.0.1:${port}/definitely-not-here`, store, timeoutMs: 8000,
    });
    check('404 echo path records nothing (fail-closed)',
      notFound.recorded === false && store.list().length === countBefore,
      'reason=' + notFound.reason);
    await new Promise(r => echoServer.close(r));
    echoServer = null;
    const dead = await observeRuntimeExitIp({
      context, profileId, sessionId, echoUrl: runtimeEchoUrl, store, timeoutMs: 5000,
    });
    check('dead echo endpoint records nothing (fail-closed)',
      dead.recorded === false && store.list().length === countBefore,
      'reason=' + dead.reason);

    await controller.stop(profileId).catch(() => {});

    const failed = checks.filter(c => !c.pass);
    const report = {
      status: failed.length ? 'FAIL' : 'RAN',
      scope: 'Loopback end-to-end proof of the echo endpoint reference ' +
        'implementation through the app controller with a lab Camoufox ' +
        'binary: real HTTPS service, in-page runtime fetch, source ' +
        'labelling, store persistence, warning-service pipeline, ' +
        'fail-closed negative controls. Does NOT prove the runtime and ' +
        'manager addresses differ through a real proxy (Gate 3).',
      bound: {
        commit, os: process.platform + ' ' + os.release(),
        node: process.version,
        playwrightCore: (() => { try { return require('playwright-core/package.json').version; } catch (_) { return 'unknown'; } })(),
        engine: { path: realPath, sha256, version: engineVersion },
        service: { path: 'tools/echo-service/echo-service.js', sha256: serviceSha256 },
        runtimeEchoUrl,
        at: new Date().toISOString(),
      },
      checks,
      observations: store.list(),
      warningReportExcerpt: {
        ipWarningsStatus: report2.sources.ipWarnings.status,
        sharedExitIpWarning: shared || null,
      },
      notRun: [
        'Runtime-vs-manager address distinction through a REAL proxy — NOT_RUN, Gate 3: on loopback both sources are 127.0.0.1 by construction; the labelling is proven, the distinction is not.',
        'Windows / packaged EXE — NOT_RUN, Gate 3: this run is Linux with the lab binary and a throwaway self-signed cert.',
        'Public-internet deployment (VPS, real domain, publicly trusted cert) — NOT_RUN: owner infrastructure; DEPLOY.md is the prepared path, this proof is loopback only.',
        'IPv6 callers — out of scope by design: the observation pipeline is IPv4-only; the service answers {"ip": null} and the client records nothing.',
      ],
    };
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 1));
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    if (controller) { try { await controller.stop(profileId); } catch (_) {} }
    if (echoServer) { try { echoServer.close(); } catch (_) {} }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
