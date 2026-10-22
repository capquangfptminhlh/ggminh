'use strict';
/**
 * 03 — DNS through the proxy route + DoH behaviour (Constitution
 * 4.1 DNS row — handling: "phân giải qua tuyến proxy" — 19.3, 19.4,
 * 23). Windows-pack successor to Agent 5's run-dns-lab.js, which
 * built the observation mechanism (controlled zone a5dns.test +
 * resolution log) on the DIRECT path only; the proxy route and DoH
 * stayed NOT_RUN for lack of a controlled proxy and a UDP-capable
 * host. Both exist on the owner's Windows machine.
 *
 * Attribution design (one machine, two lab DNS instances):
 *  - dnsSys: the lab server on 127.0.0.1:53. The owner points the
 *    Windows adapter DNS at 127.0.0.1 (README step; admin). A
 *    pre-flight probe through the OS resolver must appear in this
 *    log before any adapter-dependent variant runs — evidence, not
 *    attestation. Every query the BROWSER resolves locally lands
 *    here, whichever variant is running.
 *  - dnsProxy: a second lab instance on an ephemeral port, used
 *    ONLY by the pack's own SOCKS5 proxy (below) to resolve the
 *    names clients hand it. Queries here are proxy-side by
 *    construction.
 *  - The pack SOCKS5 proxy resolves hostnames through dnsProxy
 *    (hand-rolled query, UDP with TCP fallback), binds its egress
 *    to 127.0.0.30, and logs every CONNECT target in the form it
 *    received it: a hostname target means the client delegated
 *    resolution to the proxy; an IPv4-literal target means the
 *    client resolved BEFORE connecting.
 *
 * Variants (independently gated):
 *  A-direct       browser, no proxy, adapter -> dnsSys. Baseline:
 *                 which names, which qtypes, which transport, and
 *                 whether each resolution is followed by its HTTP
 *                 request (Agent 5's correlation).
 *  A-trr-off      same + network.trr.mode=5 (DoH explicitly off).
 *                 A vs A-trr-off is the DoH comparison pair; in
 *                 either variant, a page that LOADS while its names
 *                 produce ZERO dnsSys queries is recorded as
 *                 "resolution channel unobserved (DoH suspected)" —
 *                 an absence of observation (19.4), never a leak
 *                 verdict.
 *  B-lab-socks    browser behind the pack SOCKS5 proxy with
 *                 network.proxy.socks_remote_dns=true (declared
 *                 lab config). The row's handling holds on this
 *                 path iff: page loads; every CONNECT target is in
 *                 hostname form; resolutions appear in dnsProxy;
 *                 dnsSys sees NO page-name queries; HTTP hits
 *                 arrive from the proxy egress 127.0.0.30.
 *  B2-real-proxy  the profile runs through the app controller
 *                 behind the OWNER's real proxy (WINPACK_PROXY_*,
 *                 authenticated). The lab zone cannot be answered
 *                 by a remote proxy's resolver, so the in-zone page
 *                 is EXPECTED to fail upstream; the measurement is
 *                 negative-space: any page-name query appearing in
 *                 dnsSys during this variant means the browser
 *                 resolved locally despite the proxy route. Zero
 *                 such queries + a recorded upstream failure is
 *                 the pass shape; a page that unexpectedly LOADS
 *                 is recorded verbatim for investigation.
 *
 * Binding port 53 needs elevation on Windows; if dnsSys cannot
 * bind, A/A-trr-off/B2 are NOT_RUN with instructions and B still
 * runs. The lab only OBSERVES resolution (19.1/19.2): it contains
 * no judgement about any address.
 */
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const dgram = require('node:dgram');
const dns = require('node:dns');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const pack = require('./pack-common');
const { createDnsLabServer, parseQuery, buildResponse } =
  require('../dns-lab-server');

const SCRIPT = '03-dns-proxy-route';
const ZONE = 'a5dns.test';
const SUBS = ['www', 'css', 'js', 'img', 'api', 'frame', 'prefetch'];

/* ------------------------------------------------------------------ */
/* DNS query plumbing (client side)                                    */
/* ------------------------------------------------------------------ */
function buildQuery(name, qtype = 1) {
  const labels = name.split('.').filter(Boolean);
  const qname = Buffer.concat(labels.map(l => Buffer.concat([
    Buffer.from([l.length]), Buffer.from(l, 'ascii')])));
  const pkt = Buffer.alloc(12 + qname.length + 1 + 4);
  pkt.writeUInt16BE(crypto.randomBytes(2).readUInt16BE(0), 0);
  pkt.writeUInt16BE(0x0100, 2);
  pkt.writeUInt16BE(1, 4);
  qname.copy(pkt, 12);
  pkt.writeUInt16BE(qtype, 12 + qname.length + 1);
  pkt.writeUInt16BE(1, 12 + qname.length + 3);
  return pkt;
}
/** First A record of a response, located via parseQuery's question
 * raw length (the answer section follows the question verbatim). */
function firstA(response) {
  const q = parseQuery(response);
  if (!q || !q.question) return null;
  const ancount = response.readUInt16BE(6);
  if (ancount < 1) return null;
  let off = 12 + q.question.raw.length;
  if (off + 12 > response.length) return null;
  off += 2; // name pointer
  const type = response.readUInt16BE(off);
  const rdlen = response.readUInt16BE(off + 8);
  if (type !== 1 || rdlen !== 4) return null;
  return [...response.subarray(off + 10, off + 14)].join('.');
}
function queryUdp(name, host, port, timeoutMs = 1500) {
  return new Promise(resolve => {
    const sock = dgram.createSocket('udp4');
    const pkt = buildQuery(name);
    const timer = setTimeout(() => {
      try { sock.close(); } catch (_) {}
      resolve(null);
    }, timeoutMs);
    sock.on('message', msg => {
      clearTimeout(timer);
      try { sock.close(); } catch (_) {}
      resolve(msg);
    });
    sock.on('error', () => {});
    sock.send(pkt, port, host);
  });
}
function queryTcp(name, host, port, timeoutMs = 2500) {
  return new Promise(resolve => {
    const pkt = buildQuery(name);
    const framed = Buffer.alloc(2 + pkt.length);
    framed.writeUInt16BE(pkt.length, 0);
    pkt.copy(framed, 2);
    const sock = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => { sock.destroy(); resolve(null); },
      timeoutMs);
    sock.on('connect', () => sock.write(framed));
    sock.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length >= 2 && buf.length >= 2 + buf.readUInt16BE(0)) {
        clearTimeout(timer);
        sock.destroy();
        resolve(buf.subarray(2, 2 + buf.readUInt16BE(0)));
      }
    });
    sock.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}
/** Resolve one A record through a chosen lab server, UDP first,
 * TCP fallback; records which transport answered. */
async function resolveViaLab(name, host, port) {
  const udp = await queryUdp(name, host, port);
  if (udp) {
    const a = firstA(udp);
    if (a) return { address: a, transport: 'udp' };
  }
  const tcp = await queryTcp(name, host, port);
  if (tcp) {
    const a = firstA(tcp);
    if (a) return { address: a, transport: 'tcp' };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Pack SOCKS5 proxy resolving through dnsProxy (adapted from        */
/* lab-net.js startUpstreamSocks5, egress attribution unchanged)     */
/* ------------------------------------------------------------------ */
function startLabSocksProxy({ dnsHost, dnsPort, egressAddress }) {
  const connects = [];
  const server = net.createServer(client => {
    let buffer = Buffer.alloc(0), stage = 0;
    const fail = () => client.destroy();
    client.on('error', () => {});
    client.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      (async () => {
        for (;;) {
          if (stage === 0) {
            if (buffer.length < 2) return;
            const nMethods = buffer[1];
            if (buffer[0] !== 5 || buffer.length < 2 + nMethods) return;
            buffer = buffer.subarray(2 + nMethods);
            client.write(Buffer.from([5, 0])); stage = 1;
          } else if (stage === 1) {
            if (buffer.length < 4) return;
            if (buffer[0] !== 5 || buffer[1] !== 1) { fail(); return; }
            const atyp = buffer[3];
            let host, off, form;
            if (atyp === 1) {
              if (buffer.length < 10) return;
              host = [...buffer.subarray(4, 8)].join('.');
              off = 8; form = 'ipv4-literal';
            } else if (atyp === 3) {
              const len = buffer[4];
              if (buffer.length < 5 + len + 2) return;
              host = buffer.subarray(5, 5 + len).toString('ascii');
              off = 5 + len; form = 'hostname';
            } else { fail(); return; }
            const port = buffer.readUInt16BE(off);
            buffer = buffer.subarray(off + 2);
            stage = 2;
            let resolved = null, resolvedVia = null;
            if (form === 'hostname') {
              const r = await resolveViaLab(host, dnsHost, dnsPort);
              if (!r) {
                connects.push({ target: host + ':' + port, form,
                  resolvedVia: 'lab-dns', resolution: 'FAILED' });
                client.write(Buffer.from([5, 4, 0, 1, 0, 0, 0, 0, 0, 0]));
                client.end(); return;
              }
              resolved = r.address; resolvedVia = 'lab-dns/' + r.transport;
            } else { resolved = host; resolvedVia = 'literal'; }
            connects.push({ target: host + ':' + port, form,
              resolvedVia, resolvedAddress: resolved });
            const upstream = net.connect(
              { host: resolved, port, localAddress: egressAddress });
            upstream.once('error', () => {
              if (!client.destroyed) {
                client.write(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0]));
                client.end();
              }
            });
            upstream.once('connect', () => {
              client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
              if (buffer.length) upstream.write(buffer);
              client.pipe(upstream); upstream.pipe(client);
            });
            client.once('close', () => upstream.destroy());
            return;
          } else return;
        }
      })().catch(() => fail());
    });
  });
  const clients = new Set();
  server.on('connection', s => {
    clients.add(s); s.on('close', () => clients.delete(s));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      server, port: server.address().port, connects,
      close: async () => {
        for (const s of clients) s.destroy();
        await new Promise(r => server.close(() => r()));
      },
    }));
  });
}

/* ------------------------------------------------------------------ */
/* Measurement page server (Agent 5's page, unchanged in substance)  */
/* ------------------------------------------------------------------ */
function startHttpLab() {
  const hits = [];
  const reports = new Map();
  const server = http.createServer((req, res) => {
    const host = String(req.headers.host || '');
    const at = new Date().toISOString();
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/report') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed && parsed.label) reports.set(parsed.label, parsed);
        } catch (_) {}
        res.writeHead(204); res.end();
      });
      return;
    }
    hits.push({ at, host, path: url.pathname,
      remoteAddress: req.socket.remoteAddress });
    const port = server.address().port;
    const labelMatch = host.match(/^www\.([a-z0-9]+)\./);
    if (url.pathname === '/' && labelMatch) {
      const label = labelMatch[1];
      const base = sub => `http://${sub}.${label}.${ZONE}:${port}`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><title>LHM DNS lab</title>
<link rel="stylesheet" href="${base('css')}/r/style.css">
<link rel="dns-prefetch" href="//prefetch.${label}.${ZONE}">
<body><h1>DNS lab page</h1>
<img id="im" src="${base('img')}/r/pixel.gif" alt="">
<iframe id="fr" src="${base('frame')}/r/frame.html"></iframe>
<script src="${base('js')}/r/app.js"></script>
<script>
window.__states={img:null,frame:null};
const __im=document.getElementById('im');
if(__im.complete) window.__states.img=__im.naturalWidth>0;
document.getElementById('im').addEventListener('load',()=>window.__states.img=true);
document.getElementById('im').addEventListener('error',()=>window.__states.img=false);
document.getElementById('fr').addEventListener('load',()=>window.__states.frame=true);
document.getElementById('fr').addEventListener('error',()=>window.__states.frame=false);
window.addEventListener('load',()=>{
 setTimeout(async()=>{
  let api=null;
  try{ const r=await fetch('${base('api')}/r/data.json'); api=r.ok; }
  catch(_){ api=false; }
  const resources=performance.getEntriesByType('resource').map(e=>e.name);
  const report={label:'${label}',states:window.__states,
    jsLoaded:window.__jsLoaded===true,api,resources,
    at:new Date().toISOString()};
  try{ navigator.sendBeacon('/report',JSON.stringify(report)); }
  catch(_){ fetch('/report',{method:'POST',body:JSON.stringify(report)}); }
 },600);
});
</script></body>`);
      return;
    }
    if (url.pathname === '/r/style.css') {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end('h1{color:#333}'); return;
    }
    if (url.pathname === '/r/app.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end('window.__jsLoaded=true;'); return;
    }
    if (url.pathname === '/r/pixel.gif' || url.pathname === '/favicon.ico') {
      res.writeHead(200, { 'Content-Type': 'image/gif' });
      res.end(Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64')); return;
    }
    if (url.pathname === '/r/frame.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<title>frame</title>frame'); return;
    }
    if (url.pathname === '/r/data.json') {
      res.writeHead(200, { 'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' });
      res.end('{"ok":true}'); return;
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(
      { server, hits, reports, port: server.address().port }));
  });
}

function analyseSlice(logSlice, hitSlice, names) {
  const inZone = logSlice.filter(e => e.zone === 'lab');
  const external = logSlice.filter(e => e.zone === 'external');
  const perName = {};
  for (const sub of SUBS) {
    const qname = names[sub];
    const queries = inZone.filter(e => e.qname === qname ||
      e.qname.endsWith('.' + qname)).map(e => ({ qname: e.qname,
        qtypeName: e.qtypeName, transport: e.transport,
        action: e.action, source: e.source, at: e.at }));
    perName[sub] = { qname, queries,
      httpHit: hitSlice.some(h => h.host.startsWith(qname)) };
  }
  return {
    inZoneQueryCount: inZone.length,
    sequence: inZone.map(e =>
      `${e.qname} ${e.qtypeName} [${e.transport}] ${e.action}`),
    perName,
    externalQueries: external.map(e =>
      ({ qname: e.qname, qtypeName: e.qtypeName, action: e.action })),
  };
}

/* ------------------------------------------------------------------ */
/* --check: server round-trip + proxy plumbing on synthetic traffic   */
/* ------------------------------------------------------------------ */
async function runCheck() {
  const checks = [];
  /* One lab instance serving UDP and TCP on the SAME port, the
   * way port 53 works in the real run: the pack resolver's TCP
   * fallback must land on the TCP listener of the same server. */
  // Windows runners can reserve a TCP port independently of UDP, so an
  // OS-selected ephemeral UDP port may reject the matching TCP listener.
  // Retry with a FRESH lab instance and OS-assigned port; never skip the
  // actual DNS round-trip assertions or turn this into a mocked PASS.
  let lab2, udpAddr, tcpAddr;
  for (let attempt = 0; attempt < 12; attempt++) {
    lab2 = createDnsLabServer({ zone: ZONE, upstream: null });
    try {
      udpAddr = await lab2.listen(0);
      tcpAddr = await lab2.listenTcp(udpAddr.port);
      break;
    } catch (error) {
      lab2.close();
      if (!['EACCES', 'EADDRINUSE'].includes(error.code) || attempt === 11) throw error;
    }
  }
  const label = 'check' + crypto.randomBytes(3).toString('hex');
  const name = 'www.' + label + '.' + ZONE;

  const tcpResp = await queryTcp(name, '127.0.0.1', tcpAddr.port);
  checks.push({ name: 'lab server answers an in-zone A query over TCP',
    pass: !!tcpResp && firstA(tcpResp) === '127.0.0.1',
    detail: tcpResp ? 'A=' + firstA(tcpResp) : 'no response' });
  const logEntry = lab2.log.find(e => e.qname === name);
  checks.push({ name: 'the query is in the resolution log with its action',
    pass: !!logEntry && logEntry.action === 'answer-a-127.0.0.1' &&
      logEntry.transport === 'tcp' && logEntry.zone === 'lab',
    detail: logEntry || null });

  const resolved = await resolveViaLab(name, '127.0.0.1', udpAddr.port);
  checks.push({ name: 'pack resolver reaches the lab (UDP, TCP fallback)',
    pass: !!resolved && resolved.address === '127.0.0.1',
    detail: resolved || 'no answer on either transport' });

  const extResp = await queryTcp('outside.example', '127.0.0.1', tcpAddr.port);
  const extEntry = lab2.log.find(e => e.qname === 'outside.example');
  checks.push({ name: 'out-of-zone query is REFUSED and logged (no upstream)',
    pass: !!extResp && !!extEntry &&
      extEntry.action === 'refused-no-upstream',
    detail: extEntry || null });

  /* SOCKS plumbing: a raw client speaks SOCKS5 to a hostname target;
   * the proxy must resolve it via the lab and the HTTP hit must
   * arrive from the proxy egress address 127.0.0.30. */
  const web = await startHttpLab();
  const socks = await startLabSocksProxy(
    { dnsHost: '127.0.0.1', dnsPort: udpAddr.port, egressAddress: '127.0.0.30' });
  const socksResult = await new Promise(resolve => {
    const sock = net.connect({ host: '127.0.0.1', port: socks.port });
    let buf = Buffer.alloc(0), stage = 0;
    const timer = setTimeout(() => { sock.destroy(); resolve(null); }, 8000);
    sock.on('connect', () => sock.write(Buffer.from([5, 1, 0])));
    sock.on('error', () => { clearTimeout(timer); resolve(null); });
    sock.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === 0 && buf.length >= 2) {
        buf = buf.subarray(2); stage = 1;
        const hostBuf = Buffer.from(name, 'ascii');
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(web.port, 0);
        sock.write(Buffer.concat(
          [Buffer.from([5, 1, 0, 3, hostBuf.length]), hostBuf, portBuf]));
      } else if (stage === 1 && buf.length >= 10) {
        const ok = buf[1] === 0;
        buf = buf.subarray(10); stage = 2;
        if (!ok) { clearTimeout(timer); sock.destroy(); resolve(null); return; }
        sock.write(Buffer.from('GET /r/data.json HTTP/1.1\r\n' +
          'Host: ' + name + '\r\nConnection: close\r\n\r\n', 'ascii'));
      } else if (stage === 2) {
        const text = buf.toString('latin1');
        if (text.includes('\r\n\r\n')) {
          clearTimeout(timer); sock.destroy();
          resolve({ http200: / 200 /.test(text.split('\r\n')[0]) });
        }
      }
    });
  });
  const connectRow = socks.connects.find(c => c.target.startsWith(name));
  const hit = web.hits.find(h => h.host.startsWith(name));
  checks.push({ name: 'SOCKS proxy: hostname target resolved via lab DNS',
    pass: !!connectRow && connectRow.form === 'hostname' &&
      String(connectRow.resolvedVia).startsWith('lab-dns') &&
      connectRow.resolution !== 'FAILED' &&
      connectRow.resolvedAddress === '127.0.0.1',
    detail: connectRow || null });
  checks.push({ name: 'SOCKS proxy: HTTP hit arrives from egress 127.0.0.30',
    pass: !!socksResult && socksResult.http200 === true && !!hit &&
      hit.remoteAddress === '127.0.0.30',
    detail: { socksResult, hit: hit || null } });
  await socks.close();
  web.server.close();
  lab2.close();

  const report = pack.bound(SCRIPT, {
    mode: '--check (lab server + resolver + SOCKS plumbing on ' +
      'synthetic loopback traffic; no browser)',
  });
  report.status = checks.every(c => c.pass) ? 'CHECK' : 'CHECK_FAILED';
  report.checks = checks;
  report.networkSections = {
    browserVariants: 'NOT_RUN — owner Windows machine (adapter ' +
      'DNS redirect + browser + real proxy are owner-machine facts)',
  };
  pack.printOnly(report);
  process.exit(checks.every(c => c.pass) ? 0 : 1);
}

/* ------------------------------------------------------------------ */
/* Real run                                                            */
/* ------------------------------------------------------------------ */
async function main() {
  if (pack.flag('check')) return runCheck();
  pack.watchdog(600000, SCRIPT);
  const proxy = pack.proxyFromEnv();
  const config = {
    zone: ZONE,
    adapterDnsExpected: '127.0.0.1 (owner sets the Windows adapter ' +
      'DNS to the lab; verified by the SYS-PROBE variant, not assumed)',
    proxy: pack.proxyConfigForReport(proxy),
    browserEnvNote: pack.BROWSER_ENV_NOTE,
  };
  const exe = pack.requireEngine(SCRIPT, config);
  const pw = pack.loadPlaywright(SCRIPT, config);
  const report = pack.bound(SCRIPT, config);
  report.scope = 'Owner Windows machine; controlled zone + ' +
    'resolution logs; synthetic profiles; loopback lab proxies ' +
    'plus the owner\u2019s real proxy for B2. The lab observes ' +
    'resolution only (19.1/19.2).';
  const variants = [];

  /* dnsProxy instance (ephemeral, UDP+TCP on the same port) —
   * always available. */
  const dnsProxy = createDnsLabServer({ zone: ZONE, upstream: null });
  const dnsProxyAddr = await dnsProxy.listen(0);
  await dnsProxy.listenTcp(dnsProxyAddr.port);

  /* dnsSys instance on :53 — needs elevation on Windows. */
  let dnsSys = createDnsLabServer({ zone: ZONE, upstream: null });
  let dnsSysUp = true;
  try {
    await dnsSys.listen(53);
    await dnsSys.listenTcp(53);
  } catch (e) {
    dnsSysUp = false;
    dnsSys.close();
    dnsSys = null;
    report.dnsSysBindError = String(e && e.message || e).slice(0, 200);
  }

  const web = await startHttpLab();

  /* SYS-PROBE: does the OS resolver actually reach dnsSys? */
  let sysProbe = { ran: false, seenInLabLog: false };
  if (dnsSysUp) {
    const probeName = 'probe-' + crypto.randomBytes(4).toString('hex') +
      '.' + ZONE;
    const from = dnsSys.log.length;
    try {
      await dns.promises.lookup(probeName, { family: 4 });
    } catch (_) { /* the lookup result is irrelevant; the log is the evidence */ }
    await pack.sleep(400);
    sysProbe = { ran: true, probeName,
      seenInLabLog: dnsSys.log.slice(from)
        .some(e => e.qname === probeName) };
  }
  report.sysProbe = { ...sysProbe, dnsSysUp,
    meaning: 'seenInLabLog=true proves the OS resolver path reaches ' +
      'the lab; adapter-dependent variants are gated on it' };
  const adapterReady = dnsSysUp && sysProbe.seenInLabLog;

  async function browserVariant(id, { prefs = null, proxyOption = null,
      viaController = false } = {}) {
    const label = crypto.randomBytes(4).toString('hex');
    const names = Object.fromEntries(SUBS.map(s =>
      [s, `${s}.${label}.${ZONE}`]));
    const sysFrom = dnsSys ? dnsSys.log.length : 0;
    const proxyDnsFrom = dnsProxy.log.length;
    const hitsFrom = web.hits.length;
    let navError = null, pageReport = null, context = null, harness = null;
    const profileDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'lhm-winpack-dns-'));
    try {
      if (viaController) {
        harness = pack.createController({ exe, proxy });
        const launched = await harness.controller.launch({
          id: 'winpack-dns-b2', name: 'winpack-dns-b2',
          engine: 'gecko', fingerprint: { mode: 'native' },
          proxy: harness.profileProxy });
        context = launched.context;
      } else {
        const options = { executablePath: exe, headless: true,
          timeout: 30000, env: pack.browserEnv() };
        if (prefs) options.firefoxUserPrefs = prefs;
        if (proxyOption) options.proxy = proxyOption;
        context = await pw.firefox.launchPersistentContext(
          profileDir, options);
      }
      const page = await context.newPage();
      try {
        await page.goto(`http://${names.www}:${web.port}/`,
          { waitUntil: 'load', timeout: 25000 });
      } catch (e) { navError = String(e && e.message || e).split('\n')[0]; }
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        if (web.reports.has(label)) {
          pageReport = web.reports.get(label); break;
        }
        await pack.sleep(300);
      }
      await pack.sleep(1500);
    } catch (e) {
      navError = navError || String(e && e.message || e).split('\n')[0];
    } finally {
      if (harness) {
        await harness.controller.stop('winpack-dns-b2').catch(() => {});
        harness.cleanup();
      } else if (context) await context.close().catch(() => {});
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
    const hitSlice = web.hits.slice(hitsFrom);
    const entry = { id, label, navError, pageReport,
      sysResolver: dnsSys
        ? analyseSlice(dnsSys.log.slice(sysFrom), hitSlice, names)
        : 'NOT_RUN — dnsSys unavailable',
      proxyResolver: analyseSlice(
        dnsProxy.log.slice(proxyDnsFrom), hitSlice, names),
      httpHits: hitSlice };
    if (!viaController && pageReport && dnsSys &&
        entry.sysResolver.inZoneQueryCount === 0) {
      entry.dohObservation = 'page report received (names loaded) ' +
        'with ZERO in-zone queries at the system resolver — the ' +
        'resolution channel was not observed here; a DoH channel ' +
        'is the standing explanation to test next (packet capture ' +
        'or a lab DoH endpoint). Per 19.4 this is missing ' +
        'evidence, NOT a leak verdict.';
    }
    variants.push(entry);
    return entry;
  }

  /* A variants — gated on the verified adapter redirect. */
  if (adapterReady) {
    await browserVariant('A-direct', {});
    await browserVariant('A-trr-off',
      { prefs: { 'network.trr.mode': 5 } });
  } else {
    for (const id of ['A-direct', 'A-trr-off']) {
      variants.push({ id, status: 'NOT_RUN',
        reason: !dnsSysUp
          ? 'dnsSys could not bind port 53 (run elevated; see README)'
          : 'SYS-PROBE did not reach the lab — set the Windows ' +
            'adapter DNS to 127.0.0.1 and re-run' });
    }
  }

  /* B — pack SOCKS5 route. */
  const socks = await startLabSocksProxy({ dnsHost: '127.0.0.1',
    dnsPort: dnsProxyAddr.port, egressAddress: '127.0.0.30' });
  const connectsFrom = socks.connects.length;
  const bEntry = await browserVariant('B-lab-socks', {
    prefs: { 'network.proxy.socks_remote_dns': true },
    proxyOption: { server: 'socks5://127.0.0.1:' + socks.port },
  });
  bEntry.proxyConnects = socks.connects.slice(connectsFrom);
  bEntry.routeCriteria = {
    pageLoaded: !!bEntry.pageReport,
    allConnectTargetsHostnameForm: bEntry.proxyConnects.length > 0 &&
      bEntry.proxyConnects.every(c => c.form === 'hostname'),
    resolutionsInProxyLog: bEntry.proxyResolver.inZoneQueryCount > 0,
    pageNameQueriesAtSystemResolver: typeof bEntry.sysResolver === 'object'
      ? bEntry.sysResolver.inZoneQueryCount : null,
    httpHitsFromProxyEgress: bEntry.httpHits.length > 0 &&
      bEntry.httpHits.every(h => h.remoteAddress === '127.0.0.30'),
    note: 'the handling "phân giải qua tuyến proxy" holds on ' +
      'this lab path iff pageLoaded AND hostname-form targets AND ' +
      'proxy-log resolutions AND zero page-name queries at the ' +
      'system resolver AND HTTP via the proxy egress — every ' +
      'conjunct is reported, none is merged away',
  };
  await socks.close();

  /* B2 — owner's real proxy through the controller (negative space). */
  if (!proxy.configured || !pack.proxyHasCredentials(proxy)) {
    variants.push({ id: 'B2-real-proxy', status: 'NOT_RUN',
      reason: !proxy.configured ? 'WINPACK_PROXY_* not set'
        : 'controller proxied mode needs credentials ' +
          '(WINPACK_PROXY_USER/PASS)' });
  } else if (!adapterReady) {
    variants.push({ id: 'B2-real-proxy', status: 'NOT_RUN',
      reason: 'adapter redirect unverified (SYS-PROBE) — without ' +
        'the lab as system resolver, local resolution is invisible' });
  } else {
    const b2 = await browserVariant('B2-real-proxy', { viaController: true });
    b2.criterion = {
      pageNameQueriesAtSystemResolver: b2.sysResolver.inZoneQueryCount,
      expected: 0,
      pageLoaded: !!b2.pageReport,
      reading: 'zero page-name queries at the system resolver ' +
        'while the profile was routed through the real proxy = ' +
        'no local resolution on the proxy route. The in-zone page ' +
        'is expected NOT to load (a remote proxy\u2019s resolver ' +
        'cannot answer the lab zone); navError records why. A ' +
        'page that DID load, or any page-name query in the log, ' +
        'is a finding to investigate — recorded verbatim above.',
    };
  }

  dnsProxy.close();
  if (dnsSys) dnsSys.close();
  web.server.close();
  report.variants = variants;
  report.interpretation = {
    closesRow: 'Constitution 4.1 "DNS — máy chủ phân giải thật" ' +
      '(handling: phân giải qua tuyến proxy) — see windows-pack/' +
      'README.md for the exact criterion per variant',
    doh: 'DoH is assessed by the A vs A-trr-off comparison and ' +
      'the unobserved-channel detector; a resolv.conf/adapter lab ' +
      'cannot see DoH traffic itself (19.4).',
  };
  const ran = variants.some(v => v.status !== 'NOT_RUN');
  report.status = ran ? 'RAN' : 'NOT_RUN';
  if (!ran) report.reason = 'every variant was gated out on this machine';
  pack.emit('03-dns-proxy-route.json', report);
  process.exit(ran ? 0 : 2);
}

main().catch(e => { console.error(e); process.exit(1); });
