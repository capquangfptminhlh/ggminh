'use strict';
// Cross-profile storage isolation on a REAL browser through the PRODUCT
// launcher (Store + BrowserLauncher). Lab tool: stage0-measure is excluded
// from the installer.
//
// Both profiles open the SAME origin (a loopback test server). Profile A
// writes a cookie, localStorage, IndexedDB and a Cache Storage entry; profile B
// must see none of them, A must still see its own after a restart, and after
// B writes its own values A must still see only A's.
// Usage: node tools/concurrent-storage-isolation.js <out-dir> [browser-exe] [chromium|gecko]
const fs = require('fs'), path = require('path'), http = require('http');
const Store = require('../src/db/store');
const BrowserLauncher = require('../src/engine/browserLauncher');
const {ConfigBackup}=require('../src/backup/configBackup');
const {WorkflowStore}=require('../src/automation/studio');
const {stopBrowserProcess}=require('../src/engine/processStopper');
const {execFile}=require('node:child_process');
const {openIsolationDb,readIsolationValue,writeIsolationValue}=require('./storage-isolation-idb');
const [outDirArg, bin, engineArg] = process.argv.slice(2);
const outDir = path.resolve(outDirArg || 'storage-isolation');
const engine = engineArg || 'chromium';
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const page = mode => `<!doctype html><meta charset=utf-8><title>iso</title><body>${mode}<script>
(async () => {
  const q = new URLSearchParams(location.search), who = q.get('p');
  const openIsolationDb = ${openIsolationDb.toString()};
  const readIsolationValue = ${readIsolationValue.toString()};
  const writeIsolationValue = ${writeIsolationValue.toString()};
  const deadline = (name, promise) => Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(name+' timeout')),10000))]);
  const idb = () => deadline('IndexedDB open',openIsolationDb(indexedDB));
  const out = { mode: '${mode}', who, err: null };
  try {
    if ('${mode}' === 'set') {
      document.cookie = 'lhm_js=' + who + '; max-age=86400; path=/';
      localStorage.setItem('lhm_probe', who);
      const db = await idb(); await deadline('IndexedDB write',writeIsolationValue(db,who));
      const c = await caches.open('lhm_probe'); await c.put('/cached', new Response(who));
    }
    await fetch('/asset.bin').then(r => r.text());
    out.cookie = document.cookie;
    out.localStorage = localStorage.getItem('lhm_probe');
    const db = await idb(); out.indexedDB = await deadline('IndexedDB read',readIsolationValue(db));
    const c = await deadline('CacheStorage open',caches.open('lhm_probe')); const hit = await deadline('CacheStorage match',c.match('/cached')); out.cacheStorage = hit ? await hit.text() : null;
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
  const launcherOptions={ downloadsRoot: path.join(outDir, 'downloads') };
  if(process.env.ISO_DEBUG)launcherOptions.stopProcess=(proc,options)=>stopBrowserProcess(proc,{
    ...options,run:(file,args,config,callback)=>execFile(file,args,config,(error,stdout,stderr)=>{
      console.error('[stop]',file,args.join(' '),'exit',error?.code??0,String(stderr||'').trim());
      callback(error,stdout,stderr);
    })
  });
  const launcher = new BrowserLauncher(store,launcherOptions);
  const A = store.saveProfile({ name: 'iso-A', engine, proxy: { type: 'direct' }, startUrl: base + '/' });
  const B = store.saveProfile({ name: 'iso-B', engine, proxy: { type: 'direct' }, startUrl: base + '/' });
  const steps = [];
  async function visit(profile, url, label, instance=launcher) {
    const before = results.length, hitsBefore = assetHits;
    await instance.start(profile.id, url);
    for (let i = 0; i < 60 && results.length === before; i++) await sleep(500);
    const r = results.length > before ? results[results.length - 1] : { err: 'no result' };
    const proc = instance.activeProcesses.get(profile.id)?.process;
    const exited = new Promise(res => { if (!proc || proc.exitCode !== null) res(null); else proc.once('exit', (code, signal) => res({ code, signal })); });
    const stopAt = Date.now();
    await Promise.resolve().then(() => instance.stop(profile.id)).catch(() => {});
    const exit = await Promise.race([exited, sleep(20000).then(() => 'still running after 20 s')]);
    const stopToExitMs = Date.now() - stopAt;
    for (let i = 0; i < 40 && instance.activeProcesses.has(profile.id); i++) await sleep(250);
    await sleep(2000);
    steps.push({ step: label, ...r, httpCacheNetworkFetches: assetHits - hitsBefore, stopToExitMs, exit });
    return r;
  }
  await visit(A, base + '/set?p=A', 'A writes');
  await visit(B, base + '/read', 'B reads (must be empty)');
  await visit(A, base + '/read', 'A reads after restart (must be A)');
  await visit(B, base + '/set?p=B', 'B writes');
  await visit(A, base + '/read', 'A reads after B wrote (must be A only)');
  // Keep both real browser processes alive together while reading the same
  // loopback origin. Each response carries only its synthetic test label.
  const beforeConcurrent=results.length;
  let concurrentA,concurrentB,simultaneous=false;
  const concurrentExitCodes={A:null,B:null};
  try {
    const launches=await Promise.allSettled([launcher.start(A.id,base+'/read?p=A'),
      launcher.start(B.id,base+'/read?p=B')]);
    const failed=launches.find(result=>result.status==='rejected');
    if(failed)throw failed.reason;
    simultaneous=launcher.activeProcesses.has(A.id)&&launcher.activeProcesses.has(B.id);
    for(const [label,profile] of [['A',A],['B',B]]){
      const proc=launcher.activeProcesses.get(profile.id)?.process;
      if(proc){
        if(proc.exitCode!==null)concurrentExitCodes[label]=proc.exitCode;
        else proc.once('exit',code=>{concurrentExitCodes[label]=code});
      }
    }
    for(let i=0;i<120;i++){
      const fresh=results.slice(beforeConcurrent);
      concurrentA=fresh.find(r=>r.who==='A');concurrentB=fresh.find(r=>r.who==='B');
      if(concurrentA&&concurrentB)break;
      await sleep(500);
    }
  } finally {
    launcher.stop(A.id);launcher.stop(B.id);
    for(let i=0;i<80&&(launcher.isBusy(A.id)||launcher.isBusy(B.id));i++)await sleep(250);
  }
  if(!launcher.isBusy(A.id)&&!launcher.isBusy(B.id)){
    await visit(A,base+'/read?p=A','A after concurrent stop');
    await visit(B,base+'/read?p=B','B after concurrent stop');
  }
  const backupPassword='synthetic-isolation-test-only';
  const backup=new ConfigBackup(store,new WorkflowStore(path.join(outDir,'app'))).export(backupPassword);
  const restoredStore=new Store(path.join(outDir,'restored'));
  const restoreResult=new ConfigBackup(restoredStore,new WorkflowStore(path.join(outDir,'restored')))
    .import(backup,backupPassword);
  if(bin)restoredStore.updateSettings(engine==='gecko'?{geckoPath:bin}:{chromePath:bin});
  const restoredLauncher=new BrowserLauncher(restoredStore,{downloadsRoot:path.join(outDir,'restored-downloads')});
  const restored=restoredStore.getProfiles();
  const restoredA=restored.find(profile=>profile.name.startsWith('iso-A'));
  const restoredB=restored.find(profile=>profile.name.startsWith('iso-B'));
  if(restoredA&&restoredB){
    await visit(restoredA,base+'/read?p=restoredA','restored A starts without session',restoredLauncher);
    await visit(restoredB,base+'/read?p=restoredB','restored B starts without session',restoredLauncher);
  }
  server.close();

  const empty = r => !r.err && !r.cookie && !r.cookieHeader && r.localStorage === null && r.indexedDB === null && r.cacheStorage === null;
  const onlyA = r => !r.err && /lhm_js=A/.test(r.cookie) && !/=B/.test(r.cookie) && /lhm_http=A/.test(r.cookieHeader) &&
    !/=B/.test(r.cookieHeader) && r.localStorage === 'A' && r.indexedDB === 'A' && r.cacheStorage === 'A';
  const onlyB = r => !!r && !r.err && /lhm_js=B/.test(r.cookie) && !/=A/.test(r.cookie) &&
    /lhm_http=B/.test(r.cookieHeader) && !/=A/.test(r.cookieHeader) &&
    r.localStorage==='B' && r.indexedDB==='B' && r.cacheStorage==='B';
  const checks = {
    profileBSeesNothingOfA: empty(steps[1]),
    profileAPersistsAcrossRestart: onlyA(steps[2]),
    profileANotPollutedByB: onlyA(steps[4]),
    profileBWroteOwnValues: steps[3].localStorage === 'B',
    concurrentProcessesActive: simultaneous,
    concurrentASeesOnlyA: !!concurrentA && onlyA(concurrentA),
    concurrentBSeesOnlyB: onlyB(concurrentB),
    concurrentProcessesStopped: !launcher.isBusy(A.id)&&!launcher.isBusy(B.id),
    concurrentProcessesExitedCleanly: concurrentExitCodes.A===0&&concurrentExitCodes.B===0,
    concurrentDataPersistsAfterRestart: !!steps[5]&&onlyA(steps[5])&&onlyB(steps[6]),
    restoredProfilesHaveNoSession: restoreResult.excludesSessions===true&&
      !!steps[7]&&!!steps[8]&&empty(steps[7])&&empty(steps[8]),
    // HTTP disk cache: A cached the asset, so B must fetch it itself, and A
    // must still serve it from its own cache after a restart.
    httpCacheNotSharedWithB: steps[0].httpCacheNetworkFetches === 1 && steps[1].httpCacheNetworkFetches === 1,
    httpCachePersistsForA: steps[2].httpCacheNetworkFetches === 0,
    // Stop must be a graceful shutdown (data flushed), not a kill at grace end.
    stopIsGraceful: steps.every(s => s.exit && s.exit.code === 0 && s.stopToExitMs < 8000)
  };
  const report = { schema: 'lhm.storage-isolation.v1', at: new Date().toISOString(), engine, browser: bin || 'auto',
    sameOrigin: true, storesChecked: ['cookie (JS)', 'cookie (HttpOnly)', 'localStorage', 'IndexedDB', 'Cache Storage', 'HTTP disk cache'],
    steps, concurrentResults: { A: concurrentA || null, B: concurrentB || null, exitCodes:concurrentExitCodes },
    checks, verdict: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL' };
  fs.writeFileSync(path.join(outDir, 'storage-isolation-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, checks, steps: steps.map(s => ({ step: s.step, cookie: s.cookie, httpCookie: s.cookieHeader,
    localStorage: s.localStorage, indexedDB: s.indexedDB, cacheStorage: s.cacheStorage, httpCacheNetworkFetches: s.httpCacheNetworkFetches, err: s.err })) }, null, 2));
  process.exit(report.verdict === 'PASS' ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
