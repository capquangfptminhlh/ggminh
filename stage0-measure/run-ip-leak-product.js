'use strict';
// IP-leak lab through the PRODUCT launch path (BrowserLauncher + Store),
// no CDP. A loopback page (Chromium bypasses the proxy for loopback) gathers
// WebRTC candidates against public STUN and posts them back. A logging HTTP
// proxy is the profile's proxy. Each scenario launches twice on the same
// profile so the second start runs against Preferences Chrome itself rewrote.
// Usage: node stage0-measure/run-ip-leak-product.js <out-dir> [browser.exe]
const fs = require('fs'), path = require('path'), http = require('http'), net = require('net');
const Store = require('../src/db/store');
const BrowserLauncher = require('../src/engine/browserLauncher');
const [outDir, bin] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PAGE = `<!doctype html><meta charset=utf-8><title>leak</title><body>gathering...<script>
(async () => {
  const cands = []; let err = null;
  try {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }] });
    pc.onicecandidate = e => { if (e.candidate && e.candidate.candidate) cands.push(e.candidate.candidate); };
    pc.createDataChannel('x');
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise(r => setTimeout(r, 6000));
    pc.close();
  } catch (e) { err = String(e); }
  await fetch('/result', { method: 'POST', body: JSON.stringify({ cands, err }) });
  document.body.textContent = 'done';
})();
</script>`;

function startPageServer(results) {
  const s = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/result') {
      let b = ''; req.on('data', d => b += d); req.on('end', () => { results.push(JSON.parse(b)); res.end('ok'); });
    } else { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); }
  });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r(s)));
}
function startProxy(log) {
  const server = http.createServer((req, res) => { log.push(req.url); res.writeHead(502); res.end(); });
  server.on('connect', (req, client, head) => {
    log.push(req.url);
    const [host, port] = req.url.split(':');
    const up = net.connect(Number(port) || 443, host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); up.write(head); up.pipe(client); client.pipe(up);
    });
    up.on('error', () => client.destroy()); client.on('error', () => up.destroy());
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

(async () => {
  const results = [], proxyLog = [];
  const page = await startPageServer(results), proxy = await startProxy(proxyLog);
  const root = path.join(outDir, 'app');
  const store = new Store(root);
  if (bin) store.updateSettings({ chromePath: bin });
  const launcher = new BrowserLauncher(store, { downloadsRoot: path.join(outDir, 'downloads') });
  const pageUrl = 'http://127.0.0.1:' + page.address().port + '/';
  const report = { browser: bin || 'auto', runs: [] };
  for (const [label, proxyCfg] of [
    ['proxied', { type: 'http', host: '127.0.0.1', port: proxy.address().port }],
    ['direct', { type: 'direct' }]]) {
    const profile = store.saveProfile({ name: 'leak-' + label, engine: 'chromium', proxy: proxyCfg, startUrl: pageUrl });
    for (const attempt of [1, 2]) {
      const before = results.length;
      await launcher.start(profile.id);
      for (let i = 0; i < 60 && results.length === before; i++) await sleep(500);
      const got = results[results.length - 1];
      report.runs.push({ label, attempt, gotResult: results.length > before,
        candidateTypes: results.length > before ? got.cands.map(c => (c.match(/ typ (\w+)/) || [])[1]) : null,
        error: results.length > before ? got.err : 'no result' });
      await launcher.stop(profile.id);
      await sleep(3000);
    }
    const prefs = JSON.parse(fs.readFileSync(path.join(store.baseDir, 'profiles', profile.id, 'Default', 'Preferences'), 'utf8'));
    report.runs.push({ label, preferencesWebrtc: prefs.webrtc || null });
  }
  report.proxyCarriedCount = proxyLog.length;
  page.close(); proxy.close();
  fs.writeFileSync(path.join(outDir, 'leak-product-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
