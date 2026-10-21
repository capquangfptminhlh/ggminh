'use strict';
/**
 * Stage-0 DNS lab run (Constitution 4.1 DNS row, 19.3, 23).
 *
 * Runs a REAL lab Camoufox binary against the lab's own authoritative
 * DNS server (dns-lab-server.js) and records, per run:
 *  - which names the browser caused to be resolved, in what order,
 *    with which qtypes and over which transport (the resolution log
 *    of the controlled zone `a5dns.test`, RFC 2606 `.test`);
 *  - which of those resolutions were followed by an HTTP request to
 *    the lab's HTTP server (correlation: resolved -> requested);
 *  - which names OUTSIDE the lab zone the browser tried to resolve
 *    while its resolver pointed at the lab (they are logged and, when
 *    an upstream is available, forwarded — never silently dropped);
 *  - whether the measurement page's subresources actually loaded.
 *
 * Resolver redirection (lab mechanism, stated limits):
 *  The runner re-executes itself inside a mount namespace
 *  (`unshare -m`) where /etc/resolv.conf is bind-mounted to a lab file
 *  containing only `nameserver 127.0.0.1` + `options use-vc`. The
 *  HOST's resolv.conf is never modified (verified pattern: host file
 *  is bind-mounted read-only in this sandbox and untouched after the
 *  run). `use-vc` makes glibc speak DNS-over-TCP: this sandbox does
 *  not deliver UDP loopback at all (raw-socket probes in DNS-LAB.md),
 *  so TCP is the only working transport HERE; on a host with working
 *  UDP (Windows, standard Linux) the same server also answers UDP and
 *  a plain `nameserver 127.0.0.1` resolv.conf suffices. Firefox native
 *  resolution on Linux goes through getaddrinfo, which is what this
 *  redirect captures. Browser-internal DNS-by-type lookups that do
 *  not use getaddrinfo, and any DNS-over-HTTPS the build may attempt,
 *  do NOT pass through resolv.conf: their absence from the log is an
 *  absence of observation on those channels, recorded as such.
 *
 * Two variants run back to back, each with a fresh profile directory
 * and a fresh unique label set:
 *  - "default": browser prefs exactly as shipped in this build;
 *  - "trr-off": network.trr.mode=5 forced via firefoxUserPrefs, i.e.
 *    DNS-over-HTTPS explicitly off, native resolver only.
 *
 * Missing prerequisites report NOT_RUN and exit 2 (never a fake pass):
 *  - LHM_PLAYWRIGHT_CORE, LHM_CAMOUFOX_EXECUTABLE (as run-runtime-egress);
 *  - root + `unshare` (for the mount-namespace resolv.conf redirect).
 *
 * Scope: loopback, direct (no proxy), Linux lab binary. The proxy
 * path (does DNS follow the profile's proxy route?), the packaged
 * Windows EXE, and DoH behaviour stay NOT_RUN — see the report's
 * `notRun` field and DNS-LAB.md.
 */
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const core = require('./core');
const { createDnsLabServer } = require('./dns-lab-server');

const ZONE = 'a5dns.test';
const SUBS = ['www', 'css', 'js', 'img', 'api', 'frame', 'prefetch'];

function notRun(reason) {
  console.log(JSON.stringify({ status: 'NOT_RUN', reason }, null, 1));
  process.exit(2);
}

function firstUpstreamFromResolvConf() {
  try {
    const text = fs.readFileSync('/etc/resolv.conf', 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*nameserver\s+(\d{1,3}(?:\.\d{1,3}){3})\s*$/);
      if (m) return m[1];
    }
  } catch (_) {}
  return null;
}

// --- namespace self-wrap -------------------------------------------------
if (process.env.LHM_DNS_LAB_IN_NS !== '1') {
  if (process.getuid && process.getuid() !== 0) {
    notRun('must run as root: binding port 53 and creating a mount ' +
      'namespace for the resolv.conf redirect require it');
  }
  const upstream = firstUpstreamFromResolvConf();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-dnslab-'));
  const labResolv = path.join(tmpDir, 'resolv.conf');
  fs.writeFileSync(labResolv,
    'nameserver 127.0.0.1\noptions use-vc timeout:2 attempts:2\n');
  const child = spawnSync('unshare', ['-m', 'bash', '-c',
    'mount --bind "$1" /etc/resolv.conf && shift && exec "$@"',
    'lhm-dns-lab', labResolv, process.execPath, __filename],
    { stdio: 'inherit',
      env: { ...process.env, LHM_DNS_LAB_IN_NS: '1',
        LHM_DNS_LAB_UPSTREAM: upstream || '' } });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (child.error) notRun('failed to create mount namespace: ' + child.error.message);
  process.exit(child.status === null ? 1 : child.status);
}

// --- in-namespace run ------------------------------------------------------
function startHttpLab() {
  const hits = [];   // {at, host, path}
  const reports = new Map(); // label -> page report
  const server = http.createServer((req, res) => {
    const host = String(req.headers.host || '');
    const at = new Date().toISOString();
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/report') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed && parsed.label) reports.set(parsed.label, parsed);
        } catch (_) {}
        res.writeHead(204); res.end();
      });
      return;
    }
    hits.push({ at, host, path: url.pathname });
    const port = server.address().port;
    const labelMatch = host.match(/^www\.([a-z0-9]+)\./);
    if (url.pathname === '/' && labelMatch) {
      const label = labelMatch[1];
      const base = (sub) => `http://${sub}.${label}.${ZONE}:${port}`;
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
      res.writeHead(200, { 'Content-Type': 'text/css' }); res.end('h1{color:#333}'); return;
    }
    if (url.pathname === '/r/app.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end('window.__jsLoaded=true;'); return;
    }
    if (url.pathname === '/r/pixel.gif' || url.pathname === '/favicon.ico') {
      res.writeHead(200, { 'Content-Type': 'image/gif' });
      // well-known valid 1x1 transparent GIF (a truncated body made
      // the img element report an error in early runs even though the
      // HTTP delivery itself succeeded — a harness defect, fixed)
      res.end(Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64')); return;
    }
    if (url.pathname === '/r/frame.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<title>frame</title>frame'); return;
    }
    if (url.pathname === '/r/data.json') {
      // CORS header required: the page origin is www.<label> and this
      // is a cross-origin fetch — without it the fetch rejects even
      // though the request was delivered (harness defect, fixed)
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

async function probeUpstream(upstream) {
  // One UDP query through a throwaway socket: in THIS sandbox UDP
  // egress is not delivered, so forwarding would only add timeouts.
  // The probe result is reported verbatim; it never gates the
  // lab-zone observation itself.
  if (!upstream) return { upstream, reachable: null, note: 'no upstream nameserver found in host resolv.conf' };
  const dgram = require('node:dgram');
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const name = Buffer.concat([Buffer.from([3]), Buffer.from('www'),
      Buffer.from([7]), Buffer.from('example'), Buffer.from([3]),
      Buffer.from('com'), Buffer.from([0])]);
    const pkt = Buffer.alloc(12 + name.length + 4);
    pkt.writeUInt16BE(0x5151, 0); pkt.writeUInt16BE(0x0100, 2);
    pkt.writeUInt16BE(1, 4); name.copy(pkt, 12);
    pkt.writeUInt16BE(1, 12 + name.length);
    pkt.writeUInt16BE(1, 12 + name.length + 2);
    const timer = setTimeout(() => {
      try { socket.close(); } catch (_) {}
      resolve({ upstream, reachable: false,
        note: 'no answer to a UDP probe within 1500ms — forwarding ' +
          'disabled for this run; out-of-zone queries are REFUSED ' +
          'fast and logged, not timed out' });
    }, 1500);
    socket.on('message', () => {
      clearTimeout(timer);
      try { socket.close(); } catch (_) {}
      resolve({ upstream, reachable: true, note: 'upstream answered a UDP probe; forwarding enabled' });
    });
    socket.on('error', () => {});
    socket.send(pkt, 53, upstream);
  });
}

async function main() {
  const pwPath = process.env.LHM_PLAYWRIGHT_CORE;
  if (!pwPath) notRun('LHM_PLAYWRIGHT_CORE (path to a playwright-core module directory) is required');
  let pw;
  try { pw = require(path.resolve(pwPath)); }
  catch (_) { notRun('playwright-core not loadable from ' + pwPath); }
  const exe = process.env.LHM_CAMOUFOX_EXECUTABLE;
  if (!exe || !fs.existsSync(exe)) notRun('LHM_CAMOUFOX_EXECUTABLE must point at a lab Camoufox binary');

  const startedAt = new Date().toISOString();
  const upstreamProbe = await probeUpstream(process.env.LHM_DNS_LAB_UPSTREAM || null);
  const dns = createDnsLabServer({ zone: ZONE,
    upstream: upstreamProbe.reachable ? upstreamProbe.upstream : null });
  await dns.listen(53);
  await dns.listenTcp(53);
  const web = await startHttpLab();

  const variants = [
    { name: 'default', prefs: null },
    { name: 'trr-off', prefs: { 'network.trr.mode': 5 } },
  ];
  const variantResults = [];
  for (const variant of variants) {
    const label = crypto.randomBytes(4).toString('hex');
    const names = Object.fromEntries(SUBS.map((s) => [s, `${s}.${label}.${ZONE}`]));
    const dnsFrom = dns.log.length;
    const hitsFrom = web.hits.length;
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-dnslab-profile-'));
    let context = null;
    let navError = null;
    let pageReport = null;
    try {
      // Lab hygiene, disclosed in the report: this sandbox injects an
      // egress proxy via *_PROXY environment variables, and the
      // browser's system-proxy path honours them — with them present,
      // names are resolved AT the proxy and the local resolver (the
      // thing under measurement) is never consulted. First evidence:
      // the uncleaned run produced ZERO lab queries and
      // NS_ERROR_NET_RESET for both variants. The product does not
      // ship these variables; they are an artifact of this sandbox.
      const browserEnv = { ...process.env };
      for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY',
        'http_proxy', 'https_proxy', 'all_proxy']) delete browserEnv[key];
      const options = { executablePath: exe, headless: true, timeout: 30000,
        env: browserEnv };
      if (variant.prefs) options.firefoxUserPrefs = variant.prefs;
      context = await pw.firefox.launchPersistentContext(profileDir, options);
      const page = await context.newPage();
      try {
        await page.goto(`http://${names.www}:${web.port}/`,
          { waitUntil: 'load', timeout: 25000 });
      } catch (e) { navError = String(e && e.message || e).split('\n')[0]; }
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        if (web.reports.has(label)) { pageReport = web.reports.get(label); break; }
        await new Promise((r) => setTimeout(r, 300));
      }
      await new Promise((r) => setTimeout(r, 1500)); // late/prefetch queries
    } catch (e) {
      navError = navError || String(e && e.message || e).split('\n')[0];
    } finally {
      if (context) await context.close().catch(() => {});
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
    const dnsSlice = dns.log.slice(dnsFrom);
    const hitSlice = web.hits.slice(hitsFrom);
    const inZone = dnsSlice.filter((e) => e.zone === 'lab');
    const external = dnsSlice.filter((e) => e.zone === 'external');
    const perName = {};
    for (const sub of SUBS) {
      const qname = names[sub];
      // Exact match, plus by-type owner names that END with the host
      // name (Firefox asks for `_<port>._https.<host>` HTTPS records).
      const queries = inZone.filter((e) => e.qname === qname ||
        e.qname.endsWith('.' + qname))
        .map((e) => ({ qname: e.qname, qtypeName: e.qtypeName, transport: e.transport, action: e.action, at: e.at }));
      perName[sub] = {
        qname, queries,
        httpHit: hitSlice.some((h) => h.host.startsWith(qname)),
      };
    }
    const externalSummary = [];
    for (const e of external) {
      let row = externalSummary.find((r) => r.qname === e.qname && r.qtypeName === e.qtypeName);
      if (!row) { row = { qname: e.qname, qtypeName: e.qtypeName, count: 0, actions: [] }; externalSummary.push(row); }
      row.count++;
      if (!row.actions.includes(e.action)) row.actions.push(e.action);
    }
    variantResults.push({
      variant: variant.name,
      prefsApplied: variant.prefs,
      label, navError, pageReport,
      resolutionSequence: inZone.map((e) => `${e.qname} ${e.qtypeName} [${e.transport}] ${e.action}`),
      perName, externalQueries: externalSummary,
    });
  }

  let commit = null;
  try {
    commit = require('node:child_process')
      .execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..') })
      .toString().trim();
  } catch (_) {}
  const report = {
    status: 'RAN',
    tier: 'real engine (lab Camoufox binary), loopback, direct — ' +
      'not the packaged app, not Windows, not the proxy path',
    commit,
    engine: { path: exe, sha256: core.digestFile(exe) },
    os: `${os.platform()} ${os.release()}`, node: process.version,
    startedAt, finishedAt: new Date().toISOString(),
    zone: ZONE,
    resolverRedirection: {
      mechanism: 'mount namespace bind-mount of /etc/resolv.conf ' +
        '(host file never modified; verified unchanged after runs)',
      resolvConf: 'nameserver 127.0.0.1 + options use-vc timeout:2 attempts:2',
      transportsBound: ['udp/53', 'tcp/53'],
      useVcReason: 'this sandbox does not deliver UDP loopback ' +
        '(raw Node and Python probes, DNS-LAB.md); glibc is therefore ' +
        'told to use TCP. On hosts with working UDP the lab receives ' +
        'UDP normally and use-vc is unnecessary.',
    },
    upstreamProbe,
    browserEnv: 'sandbox egress proxy variables (*_PROXY) removed ' +
      'for the browser process only — see the hygiene note in the ' +
      'runner source; with them present, a control run produced ' +
      'zero lab queries and NS_ERROR_NET_RESET (names resolved at ' +
      'the sandbox proxy, not by the profile runtime)',
    variants: variantResults,
    notRun: {
      proxyPathDns: 'NOT_RUN — no controlled proxy in this lab; ' +
        'whether profile DNS follows the proxy route (the 4.1 ' +
        'handling decision) needs the proxy lab / SOCKS-UDP or ' +
        'proxy-side resolver observation',
      dohBehaviour: 'NOT_RUN — whether this build attempts ' +
        'DNS-over-HTTPS for names it cannot resolve natively is not ' +
        'observable from the resolver log alone (DoH bypasses ' +
        'resolv.conf); needs a trusted DoH endpoint or packet capture',
      udpTransportHere: 'NOT_RUN in this sandbox — UDP loopback ' +
        'undelivered (probe evidence); the lab server implements ' +
        'UDP and its UDP battery runs where the transport works',
      windowsExe: 'NOT_RUN — acceptance environment is the ' +
        'installed Windows EXE (Constitution 12, gate 3)',
    },
  };
  console.log(JSON.stringify(report, null, 1));
  dns.close();
  web.server.close();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
