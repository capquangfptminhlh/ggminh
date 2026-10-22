'use strict';
/**
 * 01 — STUN / srflx on a real UDP network (Constitution 4.1 WebRTC
 * ICE row, 19.3, 19.4, 23). Windows-pack adaptation of Agent 6's
 * run-stun-investigation.js, whose sandbox run could not answer the
 * question: that sandbox delivers NO UDP on any local address, so
 * "the STUN server saw nothing" could not be attributed to the
 * engine. On the owner's Windows machine UDP works, and this script
 * separates transport facts from engine behaviour with its own
 * controls BEFORE any browser variant runs.
 *
 * Variants (each independently gated; a variant whose prerequisites
 * are missing is recorded NOT_RUN and never blocks the others):
 *  C0  control — Node UDP client vs the lab STUN server, plus raw
 *      UDP delivery trials (loopback, LAN interface, ::1). If no
 *      trial delivers, no browser observation in this run can be
 *      attributed — the report says so instead of implying safety.
 *  D1  direct, raw launch — STUN server bound to the machine's LAN
 *      IPv4 (the real network path, not loopback).
 *  D2  direct, raw launch — STUN server is the owner's public STUN
 *      (WINPACK_PUBLIC_STUN_URL, e.g. stun:host:3478). The srflx a
 *      public server reports is the machine's public reflexive
 *      address; it is cross-checked against the direct exit IP from
 *      the product's own checkProxy (manager process, labelled as
 *      such — a cross-check, never a substitute, 19.3).
 *  P1  through the app controller behind the LAB HTTP proxy
 *      (loopback, egress 127.0.0.20, Agent 6's S5 recipe).
 *  P2  through the app controller behind the OWNER's real proxy
 *      (WINPACK_PROXY_*; authenticated — the controller's only
 *      proxied mode), public STUN, judged with NetworkSafetyCheck's
 *      own unexpectedPublicCandidates against the expected egress
 *      (the manager-process through-gateway checkProxy value,
 *      labelled). This is the variant whose result speaks to the
 *      register row's handling: "srflx phải khớp IP thoát".
 *
 * Classification is the product's own classifyIceCandidates
 * (Section 19.3): host / srflx / prflx / relay, private / public /
 * mDNS / loopback — never the naive "any address != proxy = leak"
 * rule. Zero binding requests at a server is recorded as zero: an
 * absence of observation, with the C0 transport facts beside it.
 *
 * Prereqs: LHM_CAMOUFOX_EXECUTABLE (+ optional pinned
 * LHM_CAMOUFOX_EXE_SHA256). Exit 2 only when NO browser variant ran.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dgram = require('node:dgram');
const crypto = require('node:crypto');
const pack = require('./pack-common');
const lab = require('../lab-net');
const {
  classifyIceCandidates, unexpectedPublicCandidates,
} = require(path.join(pack.REPO_ROOT, 'src/engine/NetworkSafetyCheck'));
const { checkProxy } = require(path.join(pack.REPO_ROOT,
  'src/engine/proxyChecker'));

const SCRIPT = '01-stun-srflx';
const GATHER_MS = 20000;

/* ------------------------------------------------------------------ */
/* --check: pure classification logic on synthetic vectors              */
/* ------------------------------------------------------------------ */
function runCheck() {
  const vectors = [
    { raw: 'candidate:1 1 udp 2122260223 192.168.1.5 50000 typ host',
      type: 'host', kind: 'private' },
    { raw: 'candidate:2 1 udp 2122194687 a1b2c3.local 50001 typ host',
      type: 'host', kind: 'mdns' },
    { raw: 'candidate:3 1 udp 1686052607 91.198.174.2 62000 typ srflx ' +
        'raddr 192.168.1.5 rport 50000',
      type: 'srflx', kind: 'public' },
    { raw: 'candidate:4 1 udp 1686052607 203.0.113.9 62001 typ srflx',
      type: 'srflx', kind: 'documentation' },
    { raw: 'candidate:5 1 udp 631897727 91.198.174.10 63000 typ relay ' +
        'raddr 91.198.174.2 rport 62000',
      type: 'relay', kind: 'public' },
    { raw: 'not a candidate at all', type: null, kind: 'unverified' },
  ];
  const classified = classifyIceCandidates(vectors.map(v => v.raw));
  const vectorResults = vectors.map((v, i) => ({
    raw: v.raw,
    expected: { type: v.type, addressKind: v.kind },
    observed: { type: classified[i].type,
      addressKind: classified[i].addressKind, valid: classified[i].valid },
    pass: classified[i].type === v.type &&
      classified[i].addressKind === v.kind,
  }));
  const unexpected = unexpectedPublicCandidates(
    classifyIceCandidates([
      'candidate:3 1 udp 1 91.198.174.2 62000 typ srflx',
      'candidate:6 1 udp 1 1.2.3.4 62002 typ srflx',
      'candidate:1 1 udp 1 192.168.1.5 50000 typ host',
    ]), '1.2.3.4');
  const checks = [
    ...vectorResults.map((v, i) => ({ name: 'classifier vector ' + i, ...v })),
    { name: 'unexpectedPublic flags only the non-egress public srflx',
      pass: unexpected.length === 1 &&
        unexpected[0].address === '91.198.174.2',
      detail: unexpected.map(u => u.type + ' ' + u.address) },
  ];
  const report = pack.bound(SCRIPT, {
    mode: '--check (synthetic vectors only; no engine, no network)',
  });
  report.status = checks.every(c => c.pass) ? 'CHECK' : 'CHECK_FAILED';
  report.checks = checks;
  report.networkSections = {
    variants: 'NOT_RUN — owner Windows machine (real UDP network, ' +
      'public STUN, real proxy are unavailable to a --check run)',
  };
  pack.printOnly(report);
  process.exit(checks.every(c => c.pass) ? 0 : 1);
}

/* ------------------------------------------------------------------ */
/* Real run                                                            */
/* ------------------------------------------------------------------ */
async function gatherIce(page, stunUrl, waitMs) {
  return page.evaluate(async ({ stunUrl, waitMs }) => {
    const peer = new RTCPeerConnection({ iceServers: [{ urls: stunUrl }] });
    const candidates = [], states = [], errors = [];
    const t0 = Date.now();
    const done = new Promise(resolve => {
      peer.onicecandidate = e => {
        if (e.candidate?.candidate) candidates.push(e.candidate.candidate);
      };
      peer.onicecandidateerror = e => errors.push({
        url: e.url || null, errorCode: e.errorCode || null,
        errorText: e.errorText || null, atMs: Date.now() - t0 });
      peer.onicegatheringstatechange = () => {
        states.push({ state: peer.iceGatheringState, atMs: Date.now() - t0 });
        if (peer.iceGatheringState === 'complete') resolve();
      };
      setTimeout(resolve, waitMs);
    });
    try {
      peer.createDataChannel('lhm-winpack-stun');
      await peer.setLocalDescription(await peer.createOffer());
      await done;
      return { candidates, states, errors, waitedMs: Date.now() - t0 };
    } finally { peer.close(); }
  }, { stunUrl, waitMs });
}

function stunSnap(stun) {
  return { datagrams: stun.stats.datagrams,
    bindingRequests: stun.stats.bindingRequests };
}
function stunDelta(stun, before) {
  return { datagrams: stun.stats.datagrams - before.datagrams,
    bindingRequests: stun.stats.bindingRequests - before.bindingRequests,
    fromSources: stun.stats.fromSources };
}
function classifiedView(candidates) {
  const classified = classifyIceCandidates(candidates);
  return {
    rawCandidates: candidates,
    candidates: classified.map(c => ({ type: c.type, address: c.address,
      addressKind: c.addressKind, protocol: c.protocol, valid: c.valid })),
    countsByType: classified.reduce((acc, c) => {
      const k = c.valid ? c.type + '/' + c.addressKind : 'unverified';
      acc[k] = (acc[k] || 0) + 1; return acc;
    }, {}),
  };
}

async function udpDeliveryTrial(family, host) {
  return new Promise(done => {
    const srv = dgram.createSocket(family);
    let settled = false;
    const finish = (ok, detail) => {
      if (settled) return; settled = true;
      try { srv.close(); } catch (_) {}
      done({ family, host, delivered: ok, detail });
    };
    srv.on('error', e => finish(false, 'server error ' + e.code));
    srv.on('message', (m, r) => { srv.send(Buffer.from('pong'), r.port, r.address); });
    srv.bind(0, host, () => {
      const port = srv.address().port;
      const cli = dgram.createSocket(family);
      cli.on('message', () => { cli.close(); finish(true, 'pong received'); });
      cli.on('error', e => finish(false, 'client error ' + e.code));
      try { cli.send(Buffer.from('ping'), port, host); }
      catch (e) { finish(false, 'send threw ' + e.code); return; }
      setTimeout(() => {
        try { cli.close(); } catch (_) {}
        finish(false, 'timeout — no datagram delivered');
      }, 2500);
    });
  });
}

async function stunControlClient(port) {
  const socket = dgram.createSocket('udp4');
  const req = Buffer.alloc(20);
  req.writeUInt16BE(0x0001, 0); req.writeUInt32BE(0x2112a442, 4);
  crypto.randomBytes(12).copy(req, 8);
  const reply = await new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), 3000);
    socket.on('message', msg => { clearTimeout(timer); resolve(msg); });
    socket.send(req, port, '127.0.0.1');
  });
  socket.close();
  return reply
    ? { responded: true, bytes: reply.length,
        responseType: '0x' + reply.readUInt16BE(0).toString(16).padStart(4, '0') }
    : { responded: false };
}

/** The engine build's own ICE prefs, quoted from the camoufox.cfg
 * shipped next to the binary when present (Agent 6 quoted the lab
 * build's file the same way). Absence is recorded, not filled in. */
function engineConfigFacts(exe) {
  const keys = ['media.peerconnection.ice.no_host',
    'media.peerconnection.ice.default_address_only',
    'media.peerconnection.ice.proxy_only_if_behind_proxy',
    'media.peerconnection.ice.proxy_only_if_pbmode',
    'media.peerconnection.ice.obfuscate_host_addresses'];
  const candidates = [path.join(path.dirname(exe), 'camoufox.cfg'),
    path.join(path.dirname(exe), 'defaults', 'pref', 'camoufox.cfg')];
  for (const file of candidates) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      const prefs = {};
      for (const key of keys) {
        const m = text.match(new RegExp(key.replace(/\./g, '\\.') +
          '\\s*[:=]\\s*(true|false)'));
        prefs[key] = m ? m[1] === 'true' : null;
      }
      return { source: file, prefs,
        note: 'Configuration facts stated by the engine build ' +
          'itself; null = the key was not found in that file. The ' +
          'variants below are the observations.' };
    } catch (_) { /* try next location */ }
  }
  return { source: null, prefs: null,
    note: 'camoufox.cfg not found next to the engine binary; ' +
      'engine ICE defaults NOT recorded for this run' };
}

async function main() {
  if (pack.flag('check')) return runCheck();
  pack.watchdog(600000, SCRIPT);
  const proxy = pack.proxyFromEnv();
  const publicStun = process.env.WINPACK_PUBLIC_STUN_URL || null;
  const config = {
    publicStunUrl: publicStun,
    proxy: pack.proxyConfigForReport(proxy),
    gatherMs: GATHER_MS,
    browserEnvNote: pack.BROWSER_ENV_NOTE,
  };
  const exe = pack.requireEngine(SCRIPT, config);
  const pw = pack.loadPlaywright(SCRIPT, config);
  const report = pack.bound(SCRIPT, config);
  report.engineConfigFacts = engineConfigFacts(exe);
  report.scope = 'Owner Windows machine, real engine binary, lab ' +
    'STUN servers under the operator\u2019s control plus the ' +
    'owner-configured public STUN / proxy when provided. Synthetic ' +
    'throwaway profiles only; no customer profile is touched.';
  const variants = [];
  let anyBrowserVariant = false;

  const httpEcho = await lab.startHttpEcho('127.0.0.1');

  /* C0 — transport controls first: they decide what silence means. */
  const trials = [await udpDeliveryTrial('udp4', '127.0.0.1')];
  const lanIp = pack.defaultRouteIPv4();
  if (lanIp) trials.push(await udpDeliveryTrial('udp4', lanIp));
  trials.push(await udpDeliveryTrial('udp6', '::1'));
  const stunCtl = await lab.startStunServer('127.0.0.1');
  const control = await stunControlClient(stunCtl.port);
  const controlStats = { datagrams: stunCtl.stats.datagrams,
    bindingRequests: stunCtl.stats.bindingRequests };
  stunCtl.socket.close();
  variants.push({ id: 'C0-control', kind: 'node-udp-client',
    udpDeliveryTrials: trials,
    stunControlClient: control, stunServerStats: controlStats,
    transportVerdict: trials.some(t => t.delivered) && control.responded
      ? 'UDP transport works on this machine; browser silence in ' +
        'later variants is attributable to the browser/engine, ' +
        'not to a dead transport'
      : 'UDP transport NOT proven on this machine — later ' +
        'variants\u2019 silence must not be attributed to the engine' });

  async function rawVariant(id, stunHost, stunUrlOverride) {
    const stun = stunUrlOverride ? null : await lab.startStunServer(stunHost);
    const stunUrl = stunUrlOverride || stun.url;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-winpack-stun-'));
    let context;
    try {
      context = await pw.firefox.launchPersistentContext(dir, {
        executablePath: exe, headless: true, timeout: 120000,
        env: pack.browserEnv() });
      const page = await context.newPage();
      await page.goto(httpEcho.url + '/probe', { timeout: 20000 });
      const before = stun ? stunSnap(stun) : null;
      const ice = await gatherIce(page, stunUrl, GATHER_MS);
      variants.push({ id, kind: 'raw-launch-direct', stunUrl,
        ...classifiedView(ice.candidates),
        gatheringStates: ice.states, iceErrors: ice.errors,
        waitedMs: ice.waitedMs,
        serverDelta: stun ? stunDelta(stun, before)
          : 'NOT_APPLICABLE — public STUN server is not instrumented; ' +
            'the page-side candidates are the observation' });
      anyBrowserVariant = true;
    } catch (e) {
      variants.push({ id, kind: 'raw-launch-direct', stunUrl,
        status: 'NOT_RUN', reason: String(e && e.message || e).slice(0, 300) });
    } finally {
      if (context) await context.close().catch(() => {});
      if (stun) stun.socket.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  /* D1 — STUN on the LAN interface address (real network path). */
  if (lanIp) await rawVariant('D1-stun-on-lan-address', lanIp, null);
  else variants.push({ id: 'D1-stun-on-lan-address',
    status: 'NOT_RUN', reason: 'no non-loopback IPv4 interface found' });

  /* D2 — public STUN (owner-configured) + direct-egress cross-check. */
  let directExit = null;
  try {
    const direct = await checkProxy({ type: 'direct' });
    if (direct && direct.status === 'success') directExit = direct.ip;
  } catch (_) { /* cross-check only; recorded as null */ }
  report.crossChecks = { directExitIpViaCheckProxy: directExit
    ? { ip: directExit, source: 'manager-process',
        note: 'product checkProxy (api.ipify.org) run in THIS ' +
          'process; a comparison value only — per 19.3 it does ' +
          'not substitute for the profile runtime observation' }
    : null };
  if (publicStun) {
    await rawVariant('D2-stun-public', null, publicStun);
    const d2 = variants.find(v => v.id === 'D2-stun-public');
    if (d2 && d2.candidates) {
      const srflx = d2.candidates.filter(c => c.type === 'srflx');
      d2.srflxVsDirectExit = directExit
        ? { directExitIp: directExit,
            srflxAddresses: srflx.map(c => c.address),
            allSrflxEqualDirectExit:
              srflx.length > 0 && srflx.every(c => c.address === directExit) }
        : 'NOT_RUN — direct exit cross-check unavailable';
    }
  } else {
    variants.push({ id: 'D2-stun-public', status: 'NOT_RUN',
      reason: 'WINPACK_PUBLIC_STUN_URL not set — no public STUN ' +
        'server is hardcoded by this pack; set it to a STUN server ' +
        'the operator trusts (e.g. their own) and re-run' });
  }

  /* P1 — through the lab HTTP proxy via the app controller. */
  try {
    const cert = lab.makeLabCert();
    const httpsEcho = await lab.startHttpsEcho('127.0.0.10', cert);
    const user = 'lab-' + crypto.randomBytes(4).toString('hex');
    const pass = crypto.randomBytes(8).toString('hex');
    const upHttp = await lab.startUpstreamHttpProxy(
      { user, pass, egressAddress: '127.0.0.20' });
    const stun = await lab.startStunServer('127.0.0.1');
    const harness = pack.createController({
      exe, proxy: { configured: true, type: 'http', host: '127.0.0.1',
        port: upHttp.port, user, pass },
      launchPersistentContext: (dir, opts) =>
        pw.firefox.launchPersistentContext(dir, { ...opts,
          headless: process.platform !== 'win32',
          timeout: 120000, ignoreHTTPSErrors: true,
          env: pack.browserEnv(),
          firefoxUserPrefs: { ...(opts.firefoxUserPrefs || {}),
            'network.proxy.allow_hijacking_localhost': true } }),
    });
    try {
      const { context } = await harness.controller.launch({
        id: 'winpack-stun-lab-proxy', name: 'winpack-stun-lab-proxy',
        engine: 'gecko', fingerprint: { mode: 'native' },
        proxy: harness.profileProxy });
      const page = await context.newPage();
      await page.goto(httpsEcho.url + '/probe', { timeout: 20000 });
      const before = stunSnap(stun);
      const ice = await gatherIce(page, stun.url, GATHER_MS);
      variants.push({ id: 'P1-behind-lab-proxy', kind: 'app-controller',
        stunUrl: stun.url, ...classifiedView(ice.candidates),
        gatheringStates: ice.states, iceErrors: ice.errors,
        waitedMs: ice.waitedMs, serverDelta: stunDelta(stun, before),
        upstreamConnects: upHttp.connects,
        expectedLocalEgress: '127.0.0.20 (lab upstream proxy)' });
      anyBrowserVariant = true;
      await page.close().catch(() => {});
      await harness.controller.stop('winpack-stun-lab-proxy');
    } finally {
      harness.cleanup();
      await upHttp.close();
      httpsEcho.server.close();
      stun.socket.close();
      fs.rmSync(cert.dir, { recursive: true, force: true });
    }
  } catch (e) {
    variants.push({ id: 'P1-behind-lab-proxy', status: 'NOT_RUN',
      reason: 'lab proxy variant failed to set up: ' +
        String(e && e.message || e).slice(0, 300) });
  }

  /* P2 — the owner's real proxy + public STUN through the controller. */
  if (proxy.configured && pack.proxyHasCredentials(proxy) && publicStun) {
    try {
      const harness = pack.createController({ exe, proxy });
      try {
        const { context } = await harness.controller.launch({
          id: 'winpack-stun-real-proxy', name: 'winpack-stun-real-proxy',
          engine: 'gecko', fingerprint: { mode: 'native' },
          proxy: harness.profileProxy });
        let expectedEgress = null;
        const gateway = harness.captured.plan &&
          harness.captured.plan.gateway;
        if (gateway && gateway.port) {
          try {
            const via = await checkProxy({ type: 'http',
              host: '127.0.0.1', port: gateway.port });
            if (via && via.ip) expectedEgress = via.ip;
          } catch (_) { /* expectation stays null */ }
        }
        const page = await context.newPage();
        await page.goto('about:blank').catch(() => {});
        const ice = await gatherIce(page, publicStun, GATHER_MS);
        const view = classifiedView(ice.candidates);
        const classified = classifyIceCandidates(ice.candidates);
        variants.push({ id: 'P2-behind-real-proxy',
          kind: 'app-controller', stunUrl: publicStun, ...view,
          gatheringStates: ice.states, iceErrors: ice.errors,
          waitedMs: ice.waitedMs,
          expectedEgressIPv4: expectedEgress
            ? { ip: expectedEgress, source: 'manager-process',
                via: 'product checkProxy through the profile\u2019s ' +
                  'local gateway (ProxyCenter pattern)' }
            : null,
          unexpectedPublicCandidates: expectedEgress
            ? unexpectedPublicCandidates(classified, expectedEgress)
              .map(c => ({ type: c.type, address: c.address }))
            : 'NOT_RUN — expected egress unavailable, so the ' +
              'unexpected-public judgement was not applied (19.4: ' +
              'missing evidence is reported as missing)' });
        anyBrowserVariant = true;
        await page.close().catch(() => {});
        await harness.controller.stop('winpack-stun-real-proxy');
      } finally { harness.cleanup(); }
    } catch (e) {
      variants.push({ id: 'P2-behind-real-proxy', status: 'NOT_RUN',
        reason: String(e && e.message || e).slice(0, 300) });
    }
  } else {
    variants.push({ id: 'P2-behind-real-proxy', status: 'NOT_RUN',
      reason: !proxy.configured
        ? 'WINPACK_PROXY_* not set'
        : !pack.proxyHasCredentials(proxy)
          ? 'the app controller\u2019s proxied mode is ' +
            'authenticated-connect only (camoufoxProxyPlan); set ' +
            'WINPACK_PROXY_USER and WINPACK_PROXY_PASS'
          : 'WINPACK_PUBLIC_STUN_URL not set' });
  }

  httpEcho.server.close();
  report.machineNetwork = { defaultRouteIPv4: lanIp,
    interfaces: Object.fromEntries(Object.entries(os.networkInterfaces())
      .map(([k, v]) => [k, (v || []).map(n => n.family + ' ' +
        n.address + (n.internal ? ' (internal)' : ''))])) };
  report.variants = variants;
  report.interpretation = {
    rule: 'Section 19.3 classification only. A public srflx/prflx/' +
      'host address other than the route\u2019s expected egress is ' +
      'an unexpected-public-exposure OBSERVATION; host/private/mDNS/' +
      'relay addresses are not by themselves a leak. Zero binding ' +
      'requests is recorded as zero — an absence of observation ' +
      'whose meaning is bounded by the C0 transport verdict.',
    closesRow: 'Constitution 4.1 "WebRTC ICE candidates (host/' +
      'srflx)" — see windows-pack/README.md for the exact criterion',
  };
  report.notRun = variants.filter(v => v.status === 'NOT_RUN')
    .map(v => v.id + ': ' + v.reason);
  if (!anyBrowserVariant) {
    report.status = 'NOT_RUN';
    report.reason = 'no browser variant could run on this machine';
    pack.emit('01-stun-srflx.json', report);
    process.exit(2);
  }
  report.status = 'RAN';
  pack.emit('01-stun-srflx.json', report);
}

main().catch(e => { console.error(e); process.exit(1); });
