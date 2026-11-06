'use strict';
// IP-leak lab for proxied Chromium profiles. Lab tool: stage0-measure is excluded from the installer.
// Starts a logging HTTP CONNECT proxy on loopback, launches the real browser
// with the product's own createLaunchArgs (proxy set), and records:
//  - every request the proxy carried (what SHOULD carry all traffic);
//  - Chrome's net-log: TCP/UDP connects and host resolutions it did itself;
//  - WebRTC ICE candidates gathered by a page against public STUN servers.
// Then repeats WITHOUT a proxy as a sensitivity baseline.
// Usage: node stage0-measure/run-ip-leak-netlog.js <browser.exe> <out-dir>
const fs = require('fs'), path = require('path'), http = require('http'), net = require('net');
const { spawn } = require('child_process');
const { createLaunchArgs } = require('../src/engine/launchArgs');
const [bin, outDir] = process.argv.slice(2);
if (!bin || !outDir) throw Error('usage: run-ip-leak-netlog.js <browser.exe> <out-dir>');
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

function startProxy(log) {
  const server = http.createServer((req, res) => {
    log.push({ kind: 'http', target: req.url });
    const u = new URL(req.url);
    const up = http.request({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: req.method, headers: req.headers },
      r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  server.on('connect', (req, client, head) => {
    log.push({ kind: 'connect', target: req.url });
    const [host, port] = req.url.split(':');
    const up = net.connect(Number(port) || 443, host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      up.write(head); up.pipe(client); client.pipe(up);
    });
    up.on('error', () => client.destroy()); client.on('error', () => up.destroy());
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  return { send: (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }), close: () => ws.close() };
}

const GATHER = `(async () => {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }] });
  const cands = [];
  pc.onicecandidate = e => { if (e.candidate && e.candidate.candidate) cands.push(e.candidate.candidate); };
  pc.createDataChannel('x');
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise(r => setTimeout(r, 6000));
  pc.close();
  return cands;
})()`;

async function run(label, withProxy) {
  const proxyLog = [];
  const proxy = withProxy ? await startProxy(proxyLog) : null;
  const profileDir = path.join(outDir, label + '-profile');
  const netlog = path.join(outDir, label + '-netlog.json');
  if (process.env.LEAK_PREFS === '1') {
    fs.mkdirSync(path.join(profileDir, 'Default'), { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'Default', 'Preferences'), JSON.stringify({ webrtc: {
      ip_handling_policy: 'disable_non_proxied_udp', multiple_routes_enabled: false, nonproxied_udp_enabled: false } }));
  }
  const cdpPort = 9300 + Math.floor(Math.random() * 400);
  const args = createLaunchArgs({ engine: 'chromium', profileDir, url: 'https://example.com/',
    proxy: withProxy ? { type: 'http', host: '127.0.0.1', port: proxy.address().port } : {}, port: cdpPort });
  args.splice(args.length - 1, 0, '--log-net-log=' + netlog, '--net-log-capture-mode=Default');
  const child = spawn(bin, args, { stdio: 'ignore' });
  let ver;
  for (let i = 0; i < 60 && !ver; i++) { await sleep(500); try { ver = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json(); } catch (_) {} }
  if (!ver) throw Error(label + ': browser CDP did not come up');
  await sleep(4000);
  const pages = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  const page = await cdp(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  const ice = await page.send('Runtime.evaluate', { expression: GATHER, awaitPromise: true, returnByValue: true });
  for (const u of ['https://www.wikipedia.org/', 'https://github.com/']) {
    await page.send('Page.navigate', { url: u }); await sleep(3000);
  }
  await sleep(8000); // background traffic window
  page.close();
  const browser = await cdp(ver.webSocketDebuggerUrl);
  await browser.send('Browser.close').catch(() => {});
  for (let i = 0; i < 40 && child.exitCode === null; i++) await sleep(250);
  await sleep(1500);
  if (proxy) proxy.close();
  return { label, proxyLog, candidates: ice.result?.result?.value || [], netlog };
}

function parseNetlog(file) {
  let text = fs.readFileSync(file, 'utf8').trim();
  if (!text.endsWith('}')) text = text.replace(/,\s*$/, '') + ']}';
  const log = JSON.parse(text);
  const names = Object.fromEntries(Object.entries(log.constants.logEventTypes).map(([k, v]) => [v, k]));
  const out = { tcpConnect: new Set(), udpConnect: new Set(), dnsHosts: new Set() };
  for (const e of log.events) {
    const name = names[e.type], p = e.params || {};
    if (name === 'TCP_CONNECT_ATTEMPT' && p.address) out.tcpConnect.add(p.address);
    if (name === 'TCP_CONNECT' && p.address_list) p.address_list.forEach(a => out.tcpConnect.add(a));
    if ((name === 'UDP_CONNECT' || name === 'UDP_SEND_TO') && p.address) out.udpConnect.add(p.address);
    if ((name === 'HOST_RESOLVER_DNS_TASK' || name === 'HOST_RESOLVER_MANAGER_JOB' || name === 'HOST_RESOLVER_SYSTEM_TASK') && p.host) out.dnsHosts.add(p.host);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

(async () => {
  const report = { browser: bin, at: new Date().toISOString(), runs: [] };
  for (const [label, withProxy] of (process.env.LEAK_ONLY_PROXIED === '1' ? [['proxied', true]] : [['proxied', true], ['baseline-direct', false]])) {
    const r = await run(label, withProxy);
    const nl = parseNetlog(r.netlog);
    const nonLoop = a => !/^(127\.|\[::1\]|::1)/.test(a);
    const cand = r.candidates.map(c => ({ type: (c.match(/ typ (\w+)/) || [])[1], addr: c.split(' ')[4] }));
    report.runs.push({
      label: r.label,
      proxyCarried: [...new Set(r.proxyLog.map(x => x.target))],
      directTcp: nl.tcpConnect.filter(nonLoop),
      directUdp: nl.udpConnect.filter(nonLoop),
      localDns: nl.dnsHosts.filter(h => !/^(localhost|127\.)/.test(h)),
      iceCandidates: cand
    });
  }
  fs.writeFileSync(path.join(outDir, 'leak-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
