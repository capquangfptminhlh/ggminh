'use strict';
// IP-leak measurement for Gecko profiles on a real Windows machine (CI runner).
// Lab tool: stage0-measure is excluded from the installer.
//
//  - Firefox through the PRODUCT launcher (BrowserLauncher, engine gecko).
//    Proxied: the test page is http://leaktest.lhm/, which only the logging
//    proxy can serve, so the page really loads THROUGH the proxy like any
//    remote site. Direct baseline: the same page from a loopback server.
//  - Camoufox through the PRODUCT controller (CamoufoxPlaywrightController)
//    with the authenticated loopback gateway in front of the logging proxy.
//    The page is https://example.com/ via CONNECT; candidates are read with
//    page.evaluate.
// Both gather WebRTC candidates against public STUN, and Gecko's own DNS log
// (MOZ_LOG nsHostResolver) shows any hostname the browser resolved locally.
// Usage: node stage0-measure/run-ip-leak-gecko.js <out-dir>
// Env: LHM_FIREFOX_EXECUTABLE, LHM_CAMOUFOX_EXECUTABLE (each optional: NOT_RUN if absent).
const fs = require('fs'), path = require('path'), http = require('http'), net = require('net');
const outDir = path.resolve(process.argv[2] || 'ip-leak-gecko');
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const STUN = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];
const GATHER_JS = `(async () => {
  const cands = []; let err = null;
  try {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: ${JSON.stringify(STUN)} }] });
    pc.onicecandidate = e => { if (e.candidate && e.candidate.candidate) cands.push(e.candidate.candidate); };
    pc.createDataChannel('x');
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise(r => setTimeout(r, 6000));
    pc.close();
  } catch (e) { err = String(e); }
  return { cands, err };
})()`;
const PAGE = `<!doctype html><meta charset=utf-8><title>leak</title><body>gathering<script>
${GATHER_JS}.then(r => fetch('/result', { method: 'POST', body: JSON.stringify(r) }))
  .then(() => { document.body.textContent = 'done'; new Image().src = 'https://www.wikipedia.org/static/favicon/wikipedia.ico'; });
</script>`;
const types = r => r ? r.cands.map(c => (c.match(/ typ (\w+)/) || [])[1]) : null;

// Logging proxy: serves leaktest.lhm itself, forwards everything else.
function startProxy(state) {
  const handlePage = (req, res) => {
    if (req.method === 'POST') {
      let b = ''; req.on('data', d => b += d); req.on('end', () => { state.results.push(JSON.parse(b)); res.end('ok'); });
    } else { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); }
  };
  const server = http.createServer((req, res) => {
    state.log.push(req.method + ' ' + req.url);
    let u; try { u = new URL(req.url); } catch (_) { return handlePage(req, res); } // loopback (direct) page
    if (u.hostname === 'leaktest.lhm') return handlePage(req, res);
    const headers = { ...req.headers }; delete headers['proxy-authorization'];
    const up = http.request({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: req.method,
      headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  server.on('connect', (req, client, head) => {
    state.log.push('CONNECT ' + req.url);
    const [host, port] = req.url.split(':');
    const up = net.connect(Number(port) || 443, host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); up.write(head); up.pipe(client); client.pipe(up);
    });
    up.on('error', () => client.destroy()); client.on('error', () => up.destroy());
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

// Hostnames Gecko resolved itself, from MOZ_LOG nsHostResolver output.
function resolvedHosts(prefix) {
  const hosts = new Set();
  for (const f of fs.readdirSync(outDir).filter(n => n.startsWith(prefix))) {
    const text = fs.readFileSync(path.join(outDir, f), 'latin1');
    for (const m of text.matchAll(/Resolving host \[([^\]]+)\]/g)) hosts.add(m[1]);
  }
  return [...hosts].filter(h => !/^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(h));
}
function setMozLog(prefix) {
  process.env.MOZ_LOG = 'timestamp,nsHostResolver:5';
  process.env.MOZ_LOG_FILE = path.join(outDir, prefix);
}

async function firefox(exe, state, loopbackUrl, proxyPort) {
  const Store = require('../src/db/store');
  const BrowserLauncher = require('../src/engine/browserLauncher');
  const store = new Store(path.join(outDir, 'firefox-app'));
  store.updateSettings({ geckoPath: exe });
  const launcher = new BrowserLauncher(store, { downloadsRoot: path.join(outDir, 'firefox-downloads') });
  const runs = [];
  for (const [label, proxy, url, launches] of [
    ['proxied', { type: 'http', host: '127.0.0.1', port: proxyPort }, 'http://leaktest.lhm/', 2],
    ['direct', { type: 'direct' }, loopbackUrl, 1]]) {
    const profile = store.saveProfile({ name: 'ff-' + label, engine: 'gecko', proxy, startUrl: url });
    for (let n = 1; n <= launches; n++) {
      const prefix = `moz-firefox-${label}-${n}`; setMozLog(prefix);
      const before = state.results.length, logBefore = state.log.length;
      await launcher.start(profile.id);
      for (let i = 0; i < 90 && state.results.length === before; i++) await sleep(500);
      await sleep(4000);
      const got = state.results.length > before ? state.results[state.results.length - 1] : null;
      const trackedWhileOpen = launcher.activeProcesses.has(profile.id);
      const stopAt = Date.now();
      const stopped = await Promise.resolve().then(() => launcher.stop(profile.id)).catch(e => ({ error: String(e.message || e) }));
      for (let i = 0; i < 120 && launcher.activeProcesses.has(profile.id); i++) await sleep(250);
      const stopToExitMs = Date.now() - stopAt;
      await sleep(1500);
      runs.push({ label, launch: n, gotResult: !!got, error: got ? got.err : 'no result', trackedWhileOpen, stopToExitMs,
        stopResult: stopped && (stopped.success === true ? 'stopped' : JSON.stringify(stopped).slice(0, 160)),
        iceCandidateTypes: types(got), proxyRequests: state.log.length - logBefore,
        locallyResolvedHosts: resolvedHosts(prefix) });
    }
  }
  return runs;
}

async function camoufox(exe, state, proxyPort) {
  const { firefox: pwFirefox } = require('playwright-core');
  const { CamoufoxPlaywrightController } = require('../src/engine/CamoufoxPlaywrightController');
  const root = path.join(outDir, 'camoufox-app');
  fs.mkdirSync(root, { recursive: true });
  const store = { data: { proxies: [{ id: 'lab-http', type: 'http', host: '127.0.0.1', port: proxyPort }] } };
  const vault = { get: id => id === 'lab-http' ? { user: 'lab-user', pass: 'lab-pass' } : null };
  const controller = new CamoufoxPlaywrightController(root, {
    verifier: { resolve: () => exe }, store, proxyVault: vault, enabled: true, labApproved: true,
    launchPersistentContext: pwFirefox.launchPersistentContext.bind(pwFirefox) });
  const runs = [];
  for (const [label, proxy] of [
    ['proxied', { type: 'http', host: '127.0.0.1', port: proxyPort, authProxyId: 'lab-http' }],
    ['direct', { type: 'direct' }]]) {
    const id = 'cf-' + label, prefix = `moz-camoufox-${label}`; setMozLog(prefix);
    const logBefore = state.log.length;
    let result = null, error = null;
    try {
      await controller.launch({ id, name: id, engine: 'gecko', fingerprint: { mode: 'native' }, proxy });
      const page = await controller.contextFor(id).newPage();
      await page.goto('https://example.com/', { timeout: 30000 });
      result = await page.evaluate(GATHER_JS);
      await page.goto('https://www.wikipedia.org/', { timeout: 30000 }).catch(() => {});
    } catch (e) { error = String(e.message || e).slice(0, 300); }
    try { await controller.stop(id); } catch (_) {}
    await sleep(3000);
    runs.push({ label, gotResult: !!result, error: error || (result && result.err),
      iceCandidateTypes: types(result), proxyRequests: state.log.length - logBefore,
      locallyResolvedHosts: resolvedHosts(prefix) });
  }
  return runs;
}

(async () => {
  const state = { results: [], log: [] };
  const proxy = await startProxy(state);
  const loop = http.createServer((req, res) => {
    if (req.method === 'POST') { let b = ''; req.on('data', d => b += d); req.on('end', () => { state.results.push(JSON.parse(b)); res.end('ok'); }); }
    else { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); }
  });
  await new Promise(r => loop.listen(0, '127.0.0.1', r));
  const loopbackUrl = 'http://127.0.0.1:' + loop.address().port + '/';
  const report = { schema: 'lhm.ip-leak-measurement.gecko.v1', at: new Date().toISOString(), stun: STUN };
  const ff = process.env.LHM_FIREFOX_EXECUTABLE, cf = process.env.LHM_CAMOUFOX_EXECUTABLE;
  try { report.firefox = ff && fs.existsSync(ff) ? await firefox(ff, state, loopbackUrl, proxy.address().port) : 'NOT_RUN'; }
  catch (e) { report.firefox = { error: String(e.message || e) }; }
  try { report.camoufox = cf && fs.existsSync(cf) ? await camoufox(cf, state, proxy.address().port) : 'NOT_RUN'; }
  catch (e) { report.camoufox = { error: String(e.message || e) }; }
  proxy.close(); loop.close();
  // Verdict: proxied runs must show no candidates and no local resolutions,
  // and the direct baseline must show srflx (proves STUN works on this network).
  const judge = runs => {
    if (runs && runs.error) return 'ERROR: ' + runs.error;
    if (!Array.isArray(runs)) return 'NOT_RUN';
    const baseline = runs.find(r => r.label === 'direct');
    if (!baseline || !(baseline.iceCandidateTypes || []).includes('srflx')) return 'INCONCLUSIVE: baseline gathered no srflx';
    const proxied = runs.filter(r => r.label === 'proxied');
    if (proxied.some(r => !r.gotResult)) return 'INCONCLUSIVE: proxied page gave no result';
    const leaks = proxied.filter(r => r.iceCandidateTypes.length || r.locallyResolvedHosts.length);
    return leaks.length ? 'FAIL' : 'PASS';
  };
  report.verdict = { firefox: judge(report.firefox), camoufox: judge(report.camoufox) };
  fs.writeFileSync(path.join(outDir, 'ip-leak-gecko-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
