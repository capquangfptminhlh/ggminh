'use strict';
// Cross-profile storage isolation on a REAL browser through the PRODUCT
// launcher (Store + BrowserLauncher). Lab tool: stage0-measure is excluded
// from the installer.
//
// Both profiles open the SAME origin (a loopback test server). Profile A
// writes a cookie, localStorage, IndexedDB and a Cache Storage entry; profile B
// must see none of them, A must still see its own after a restart, and after
// B writes its own values A must still see only A's.
// Usage: node stage0-measure/run-storage-isolation.js <out-dir> [chromium-exe] [chromium|gecko]
const fs = require('fs'), path = require('path'), http = require('http');
const Store = require('../src/db/store');
const BrowserLauncher = require('../src/engine/browserLauncher');
const [outDirArg, bin, engineArg] = process.argv.slice(2);
const outDir = path.resolve(outDirArg || 'storage-isolation');
const engine = engineArg || 'chromium';
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const page = mode => `<!doctype html><meta charset=utf-8><title>iso</title><body>${mode}<script>
(async () => {
  const q = new URLSearchParams(location.search), who = q.get('p');
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('lhm_probe', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const out = { mode: '${mode}', err: null };
  try {
    if ('${mode}' === 'set') {
      document.cookie = 'lhm_js=' + who + '; max-age=86400; path=/';
      localStorage.setItem('lhm_probe', who);
      const db = await idb(); await new Promise(r => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(who, 'k'); t.oncomplete = r; });
      const c = await caches.open('lhm_probe'); await c.put('/cached', new Response(who));
    }
    await fetch('/asset.bin').then(r => r.text());
    out.cookie = document.cookie;
    out.localStorage = localStorage.getItem('lhm_probe');
    const db = await idb(); out.indexedDB = await new Promise(r => { const g = db.transaction('kv').objectStore('kv').get('k'); g.onsuccess = () => r(g.result ?? null); });
    const c = await caches.open('lhm_probe'); const hit = await c.match('/cached'); out.cacheStorage = hit ? await hit.text() : null;
  } catch (e) { out.err = String(e); }
  await fetch('/result', { method: 'POST', body: JSON.stringify(out) });
  document.body.textContent = 'done';
})();
</script>`;

(async () => {
  const results = []; let assetHits = 0;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (process.env.ISO_DEBUG) console.error('[srv]', req.method, req.url);
    if (req.method === 'POST' && u.pathname === '/result') {
      let b = ''; req.on('data', d => b += d);
      req.on('end', () => { results.push({ ...JSON.parse(b), cookieHeader: req.headers.cookie || '' }); res.end('ok'); });
      return;
    }
    if (u.pathname === '/asset.bin') {
      assetHits++;
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'public, max-age=86400' });
      res.end('lhm-cacheable'); return;
    }
    const mode = u.pathname === '/set' ? 'set' : 'read';
    const headers = { 'content-type': 'text/html', 'cache-control': 'no-store' };
    if (mode === 'set') headers['set-cookie'] = 'lhm_http=' + u.searchParams.get('p') + '; Max-Age=86400; Path=/; HttpOnly';
    res.writeHead(200, headers); res.end(page(mode));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;

  const store = new Store(path.join(outDir, 'app'));
  if (bin) store.updateSettings(engine === 'gecko' ? { geckoPath: bin } : { chromePath: bin });
  const launcher = new BrowserLauncher(store, { downloadsRoot: path.join(outDir, 'downloads') });
  const A = store.saveProfile({ name: 'iso-A', engine, proxy: { type: 'direct' }, startUrl: base + '/' });
  const B = store.saveProfile({ name: 'iso-B', engine, proxy: { type: 'direct' }, startUrl: base + '/' });
  const steps = [];
  async function visit(profile, url, label) {
    const before = results.length, hitsBefore = assetHits;
    await launcher.start(profile.id, url);
    for (let i = 0; i < 60 && results.length === before; i++) await sleep(500);
    const r = results.length > before ? results[results.length - 1] : { err: 'no result' };
    const proc = launcher.activeProcesses.get(profile.id)?.process;
    const exited = new Promise(res => { if (!proc || proc.exitCode !== null) res(null); else proc.once('exit', (code, signal) => res({ code, signal })); });
    const stopAt = Date.now();
    await Promise.resolve().then(() => launcher.stop(profile.id)).catch(() => {});
    const exit = await Promise.race([exited, sleep(20000).then(() => 'still running after 20 s')]);
    const stopToExitMs = Date.now() - stopAt;
    for (let i = 0; i < 40 && launcher.activeProcesses.has(profile.id); i++) await sleep(250);
    await sleep(2000);
    steps.push({ step: label, ...r, httpCacheNetworkFetches: assetHits - hitsBefore, stopToExitMs, exit });
    return r;
  }
  await visit(A, base + '/set?p=A', 'A writes');
  await visit(B, base + '/read', 'B reads (must be empty)');
  await visit(A, base + '/read', 'A reads after restart (must be A)');
  await visit(B, base + '/set?p=B', 'B writes');
  await visit(A, base + '/read', 'A reads after B wrote (must be A only)');
  server.close();

  const empty = r => !r.err && !r.cookie && !r.cookieHeader && r.localStorage === null && r.indexedDB === null && r.cacheStorage === null;
  const onlyA = r => !r.err && /lhm_js=A/.test(r.cookie) && !/=B/.test(r.cookie) && /lhm_http=A/.test(r.cookieHeader) &&
    !/=B/.test(r.cookieHeader) && r.localStorage === 'A' && r.indexedDB === 'A' && r.cacheStorage === 'A';
  const checks = {
    profileBSeesNothingOfA: empty(steps[1]),
    profileAPersistsAcrossRestart: onlyA(steps[2]),
    profileANotPollutedByB: onlyA(steps[4]),
    profileBWroteOwnValues: steps[3].localStorage === 'B',
    // HTTP disk cache: A cached the asset, so B must fetch it itself, and A
    // must still serve it from its own cache after a restart.
    httpCacheNotSharedWithB: steps[0].httpCacheNetworkFetches === 1 && steps[1].httpCacheNetworkFetches === 1,
    httpCachePersistsForA: steps[2].httpCacheNetworkFetches === 0
  };
  const report = { schema: 'lhm.storage-isolation.v1', at: new Date().toISOString(), engine, browser: bin || 'auto',
    sameOrigin: true, storesChecked: ['cookie (JS)', 'cookie (HttpOnly)', 'localStorage', 'IndexedDB', 'Cache Storage', 'HTTP disk cache'],
    steps, checks, verdict: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL' };
  fs.writeFileSync(path.join(outDir, 'storage-isolation-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, checks, steps: steps.map(s => ({ step: s.step, cookie: s.cookie, httpCookie: s.cookieHeader,
    localStorage: s.localStorage, indexedDB: s.indexedDB, cacheStorage: s.cacheStorage, httpCacheNetworkFetches: s.httpCacheNetworkFetches, err: s.err })) }, null, 2));
  process.exit(report.verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
