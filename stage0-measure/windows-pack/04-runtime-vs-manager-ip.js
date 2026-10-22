'use strict';
/**
 * 04 — Runtime-vs-manager exit IP through a real proxy
 * (Constitution 4.1 exit-IP row, 19.3, 19.4, 22, 23).
 *
 * Section 19.3: a result from the manager process does not
 * substitute for a result from the profile's own runtime. In
 * production today only the manager side exists (checkProxy at
 * profile start); Agent 7 built the runtime side
 * (src/health/runtimeEgressObservation.js) and proved the mechanism
 * on loopback, where both sides are 127.0.0.1 by construction — so
 * the DIFFERENTIATION through a real proxy stayed NOT_RUN. This
 * script runs that differentiation on the owner's machine, through
 * the owner's real proxy, with both observations recorded in one
 * ExitIpObservationStore under their own source labels:
 *
 *  1. manager/direct — the product's checkProxy({type:'direct'})
 *     in THIS process (the machine's direct exit, baseline).
 *  2. manager/via-proxy — the profile is launched through the app
 *     controller behind the owner's proxy; the manager side then
 *     probes checkProxy({type:'http', host:'127.0.0.1',
 *     port:<gateway>}) — the product's own pattern for manager
 *     observation of an authenticated-proxy profile
 *     (src/proxies/proxyCenter.js probes the local gateway the
 *     same way). Recorded with source 'manager-process'.
 *  3. runtime — observeRuntimeExitIp() fetches WINPACK_ECHO_URL
 *     (a full echo URL honouring the module's contract: 200 JSON
 *     {"ip": ...}, CORS *, no-store, no redirect) from INSIDE the
 *     running profile's page context, so the request travels the
 *     profile's own proxy route. Recorded with source
 *     'browser-runtime'.
 *  4. negative control — the same call against a dead echo in the
 *     same live session must record NOTHING (fail-closed).
 *  5. the store is reloaded from disk and D3's
 *     normalizeObservations must accept the mixed labelled set.
 *
 * Comparison is reported as observation, with Section 19.3
 * wording: runtime == manager/via-proxy is the expected shape for
 * a profile whose traffic follows its proxy route; runtime ==
 * direct while the manager shows the proxy egress would mean the
 * runtime is not on the proxy route — a finding. Either way this
 * script says what was observed, at what time, through which
 * endpoint; it does not certify what any website sees.
 *
 * Prerequisites: WINPACK_PROXY_* WITH credentials (the
 * controller's proxied mode is authenticated-connect only);
 * WINPACK_ECHO_URL for the runtime half (without it the runtime
 * half is NOT_RUN and the manager halves still run — the halves
 * are never substituted for each other, 19.3).
 */
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const pack = require('./pack-common');
const ROOT = pack.REPO_ROOT;
const { checkProxy } = require(path.join(ROOT, 'src/engine/proxyChecker'));
const { ExitIpObservationStore } =
  require(path.join(ROOT, 'src/health/exitIpObservations'));
const { normalizeObservations } =
  require(path.join(ROOT, 'src/health/autoIpWarnings'));
const { observeRuntimeExitIp, canonicalIpv4, parseEchoIp } =
  require(path.join(ROOT, 'src/health/runtimeEgressObservation'));

const SCRIPT = '04-runtime-vs-manager-ip';
const PROFILE_ID = 'winpack-r4-egress';

async function runCheck() {
  const checks = [];
  checks.push({ name: 'canonicalIpv4 accepts a plain IPv4',
    pass: canonicalIpv4('203.0.113.7') === '203.0.113.7' });
  checks.push({ name: 'canonicalIpv4 normalises the IPv6-mapped form',
    pass: canonicalIpv4('::ffff:203.0.113.7') === '203.0.113.7' });
  checks.push({ name: 'canonicalIpv4 refuses a real IPv6 / garbage',
    pass: canonicalIpv4('2001:db8::1') === null &&
      canonicalIpv4('not-an-ip') === null });
  checks.push({ name: 'parseEchoIp reads the module contract shapes',
    pass: parseEchoIp('{"ip":"203.0.113.7"}') === '203.0.113.7' &&
      parseEchoIp('203.0.113.7') === '203.0.113.7' &&
      parseEchoIp('<html>no</html>') === null });
  const bad = await checkProxy({ type: 'http', host: '', port: 0 });
  checks.push({ name: 'checkProxy rejects an invalid proxy without network',
    pass: bad && bad.status === 'error', detail: bad });

  /* Fail-closed: a page whose evaluate throws must record nothing. */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-winpack-ck-'));
  try {
    const store = new ExitIpObservationStore(dir);
    const stubContext = {
      newPage: async () => ({
        evaluate: async () => { throw Error('stub failure'); },
        close: async () => {},
      }),
    };
    const res = await observeRuntimeExitIp({
      context: stubContext, profileId: PROFILE_ID,
      echoUrl: 'https://echo.invalid/egress', store, timeoutMs: 2000 });
    checks.push({
      name: 'runtime observation fails closed (records nothing) ' +
        'when the in-page fetch fails',
      pass: res.recorded === false && store.list().length === 0,
      detail: res });
    const noCtx = await observeRuntimeExitIp({
      profileId: PROFILE_ID, echoUrl: 'https://echo.invalid/egress',
      store, timeoutMs: 2000 });
    checks.push({ name: 'no page/context -> recorded:false, still nothing stored',
      pass: noCtx.recorded === false && noCtx.reason === 'no-page-or-context' &&
        store.list().length === 0, detail: noCtx });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }

  const report = pack.bound(SCRIPT, {
    mode: '--check (module vectors + fail-closed stubs; no proxy, ' +
      'no engine, no live echo)',
  });
  report.status = checks.every(c => c.pass) ? 'CHECK' : 'CHECK_FAILED';
  report.checks = checks;
  report.networkSections = {
    throughRealProxy: 'NOT_RUN — owner Windows machine with the ' +
      'owner\u2019s real proxy and echo endpoint',
  };
  pack.printOnly(report);
  process.exit(checks.every(c => c.pass) ? 0 : 1);
}

async function closedPortUrl() {
  const srv = http.createServer();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  await new Promise(r => srv.close(r));
  return 'http://127.0.0.1:' + port + '/egress-echo';
}

async function main() {
  if (pack.flag('check')) return runCheck();
  pack.watchdog(420000, SCRIPT);
  const proxy = pack.proxyFromEnv();
  const echoUrl = process.env.WINPACK_ECHO_URL || null;
  const config = {
    proxy: pack.proxyConfigForReport(proxy),
    echoUrl: echoUrl || null,
    echoContract: 'module contract: 200 JSON {"ip": ...}, ' +
      'Access-Control-Allow-Origin: *, Cache-Control: no-store, ' +
      'no redirect (src/health/runtimeEgressObservation.js)',
    managerEcho: 'api.ipify.org via the product checkProxy ' +
      '(its built-in endpoint, recorded verbatim)',
  };
  if (!proxy.configured) {
    pack.notRun(SCRIPT, config,
      'WINPACK_PROXY_* not set — this measurement is defined ' +
      'through the owner\u2019s real proxy');
  }
  if (!pack.proxyHasCredentials(proxy)) {
    pack.notRun(SCRIPT, config,
      'WINPACK_PROXY_USER and WINPACK_PROXY_PASS are required: ' +
      'the app controller\u2019s proxied mode is ' +
      'authenticated-connect only (camoufoxProxyPlan). An ' +
      'unauthenticated proxy cannot be launched by the product ' +
      'controller path, so the runtime half cannot run — ' +
      'recorded, not worked around.');
  }
  const exe = pack.requireEngine(SCRIPT, config);
  const report = pack.bound(SCRIPT, config);
  report.scope = 'Owner Windows machine; one synthetic profile ' +
    'launched through the app controller behind the owner\u2019s ' +
    'real proxy; observations recorded in a throwaway store under ' +
    'the two product source labels.';
  const checks = [];
  const check = (name, pass, detail) =>
    checks.push({ name, pass: !!pass, detail });
  const parts = {};
  const sessionId = 'winpack-r4-' + crypto.randomBytes(3).toString('hex');
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-winpack-store-'));
  const store = new ExitIpObservationStore(storeDir);
  let harness = null;
  try {
    /* 1 — manager/direct baseline. */
    try {
      const direct = await checkProxy({ type: 'direct' });
      parts.managerDirect = direct && direct.status === 'success'
        ? { ip: direct.ip, source: 'manager-process',
            via: 'checkProxy direct', latencyMs: direct.latency }
        : { status: 'NOT_RUN', reason: 'checkProxy direct did not ' +
            'succeed: ' + (direct && direct.message || 'unknown') };
    } catch (e) {
      parts.managerDirect = { status: 'NOT_RUN',
        reason: String(e && e.message || e).slice(0, 200) };
    }

    /* Launch the profile through the controller + real proxy. */
    harness = pack.createController({ exe, proxy });
    const { context } = await harness.controller.launch({
      id: PROFILE_ID, name: PROFILE_ID, engine: 'gecko',
      fingerprint: { mode: 'native' }, proxy: harness.profileProxy });
    check('controller session live behind the real proxy', !!context,
      'contextFor-equivalent handle returned by launch');
    const gateway = harness.captured.plan && harness.captured.plan.gateway;
    check('product built an authenticated-connect gateway plan',
      !!gateway && Number.isInteger(gateway.port),
      gateway ? 'gateway port captured via the prepareProxy seam'
        : 'no gateway in the captured plan');

    /* 2 — manager/via-proxy through the local gateway. */
    if (gateway && gateway.port) {
      try {
        const via = await checkProxy({ type: 'http',
          host: '127.0.0.1', port: gateway.port });
        if (via && via.ip) {
          const saved = store.record({ profileId: PROFILE_ID,
            ip: via.ip, sessionId, source: 'manager-process' });
          parts.managerViaProxy = { ip: via.ip,
            source: 'manager-process',
            via: 'checkProxy through the profile\u2019s local ' +
              'gateway (ProxyCenter pattern)',
            recorded: !!saved, latencyMs: via.latency };
          check('manager-process observation recorded with its label',
            !!saved && saved.source === 'manager-process', 'ip=' + via.ip);
        } else {
          parts.managerViaProxy = { status: 'NOT_RUN',
            reason: 'gateway checkProxy returned no IP: ' +
              (via && via.message || 'unknown') };
          check('manager-process observation recorded with its label',
            false, parts.managerViaProxy.reason);
        }
      } catch (e) {
        parts.managerViaProxy = { status: 'NOT_RUN',
          reason: String(e && e.message || e).slice(0, 200) };
      }
    }

    /* 3 — runtime observation from inside the profile. */
    if (echoUrl) {
      const result = await observeRuntimeExitIp({
        context, profileId: PROFILE_ID, sessionId,
        echoUrl, store, timeoutMs: 15000 });
      parts.runtime = result.recorded
        ? { ip: result.entry.ip, source: result.entry.source,
            recorded: true, observedAt: result.entry.observedAt }
        : { status: 'NOT_RUN', recorded: false, reason: result.reason };
      check('runtime observation recorded', result.recorded === true,
        JSON.stringify(result).slice(0, 200));
      check('runtime entry labelled browser-runtime',
        !!result.entry && result.entry.source === 'browser-runtime',
        result.entry && result.entry.source);

      /* 4 — negative control: dead echo, same live session. */
      const deadUrl = await closedPortUrl();
      const countBefore = store.list().length;
      const dead = await observeRuntimeExitIp({
        context, profileId: PROFILE_ID, sessionId,
        echoUrl: deadUrl, store, timeoutMs: 5000 });
      check('dead echo records nothing (fail-closed)',
        dead.recorded === false && store.list().length === countBefore,
        'reason=' + dead.reason);
    } else {
      parts.runtime = { status: 'NOT_RUN',
        reason: 'WINPACK_ECHO_URL not set — the runtime half is ' +
          'never replaced by a manager-process value (19.3); set ' +
          'it to an LHM-controlled echo honouring the module ' +
          'contract and re-run' };
    }

    await harness.controller.stop(PROFILE_ID).catch(() => {});

    /* 5 — persistence + D3 acceptance of the mixed labelled store. */
    const reloaded = new ExitIpObservationStore(storeDir);
    const entries = reloaded.list();
    check('observations persisted to disk with labels intact',
      entries.length >= 1 && entries.every(e =>
        e.source === 'manager-process' || e.source === 'browser-runtime'),
      'entries=' + entries.length);
    let normalised = null;
    try { normalised = normalizeObservations(entries); } catch (_) {}
    check('D3 normalisation accepts the store',
      Array.isArray(normalised) && normalised.length === entries.length,
      normalised ? normalised.map(e => e.source).join(',') : 'threw');

    /* Comparison — observation wording only (19.2/19.3). */
    const directIp = parts.managerDirect && parts.managerDirect.ip;
    const managerIp = parts.managerViaProxy && parts.managerViaProxy.ip;
    const runtimeIp = parts.runtime && parts.runtime.ip;
    report.comparison = {
      directExitIp: directIp || null,
      managerViaProxyIp: managerIp || null,
      runtimeIp: runtimeIp || null,
      runtimeEqualsManagerViaProxy: managerIp && runtimeIp
        ? runtimeIp === managerIp : null,
      runtimeEqualsDirect: directIp && runtimeIp
        ? runtimeIp === directIp : null,
      reading: 'runtimeEqualsManagerViaProxy=true with ' +
        'runtimeEqualsDirect=false is the expected shape when the ' +
        'profile runtime follows its proxy route and the proxy ' +
        'egress differs from the direct exit. runtimeEqualsDirect' +
        '=true while the manager side shows the proxy egress ' +
        'would mean the runtime is not on the proxy route — a ' +
        'finding. A null field means that side was not observed ' +
        'in this run; nothing is inferred from it (19.4).',
    };
    report.parts = parts;
    report.checks = checks;
    report.storeEntries = entries;
    const measured = !!(managerIp || runtimeIp);
    const failed = checks.filter(c => !c.pass);
    report.status = !measured ? 'NOT_RUN'
      : failed.length ? 'RAN_WITH_FAILED_CHECKS' : 'RAN';
    if (!measured) {
      report.reason = 'neither the manager/via-proxy nor the ' +
        'runtime observation could be made in this run';
    }
    pack.emit('04-runtime-vs-manager-ip.json', report);
    process.exit(!measured ? 2 : failed.length ? 1 : 0);
  } finally {
    if (harness) {
      try { await harness.controller.stop(PROFILE_ID); } catch (_) {}
      harness.cleanup();
    }
    fs.rmSync(storeDir, { recursive: true, force: true });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
