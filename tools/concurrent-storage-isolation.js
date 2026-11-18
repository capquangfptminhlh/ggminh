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
const {withIsolationCleanup}=require('./storage-isolation-cleanup');
const {evaluateIsolationChecks,processDiagnostics,observeStopCancelled}=require('./storage-isolation-checks');
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
  const launchers = [];
  let reportWritten = false;
  await withIsolationCleanup({ server, launchers, onCleanup: cleanup => {
    fs.writeFileSync(path.join(outDir, 'storage-isolation-cleanup.json'), JSON.stringify(cleanup, null, 2));
    const reportPath = path.join(outDir, 'storage-isolation-report.json');
    if (reportWritten) {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      report.checks.cleanupComplete = cleanup.complete;
      if (!cleanup.complete) report.verdict = 'FAIL';
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    }
  } }, async () => {
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
  launchers.push(launcher);
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
    const diagnostics={beforeStop:processDiagnostics(instance,profile.id)};
    const observer=observeStopCancelled(proc);
    try {
      await Promise.resolve().then(() => instance.stop(profile.id)).catch(() => {});
      diagnostics.afterStop=processDiagnostics(instance,profile.id);
      const exit = await Promise.race([exited, sleep(20000).then(() => 'still running after 20 s')]);
      const stopToExitMs = Date.now() - stopAt;
      for (let i = 0; i < 40 && instance.activeProcesses.has(profile.id); i++) await sleep(250);
      await sleep(2000);
      diagnostics.afterWait=processDiagnostics(instance,profile.id);
      diagnostics.stopCancelledCount=observer.count();
      steps.push({ step: label, ...r, httpCacheNetworkFetches: assetHits - hitsBefore, stopToExitMs, exit, diagnostics });
      return r;
    } finally {observer.dispose()}
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
  const concurrentDiagnostics={};
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
    concurrentDiagnostics.beforeStop={A:processDiagnostics(launcher,A.id),B:processDiagnostics(launcher,B.id)};
    const observers={A:observeStopCancelled(launcher.activeProcesses.get(A.id)?.process),
      B:observeStopCancelled(launcher.activeProcesses.get(B.id)?.process)};
    try {
      launcher.stop(A.id);launcher.stop(B.id);
      concurrentDiagnostics.afterStop={A:processDiagnostics(launcher,A.id),B:processDiagnostics(launcher,B.id)};
      for(let i=0;i<80&&(launcher.isBusy(A.id)||launcher.isBusy(B.id));i++)await sleep(250);
      concurrentDiagnostics.afterWait={A:processDiagnostics(launcher,A.id),B:processDiagnostics(launcher,B.id)};
      concurrentDiagnostics.stopCancelledCount={A:observers.A.count(),B:observers.B.count()};
    } finally {observers.A.dispose();observers.B.dispose()}
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
  launchers.push(restoredLauncher);
  const restored=restoredStore.getProfiles();
  const restoredA=restored.find(profile=>profile.name.startsWith('iso-A'));
  const restoredB=restored.find(profile=>profile.name.startsWith('iso-B'));
  if(restoredA&&restoredB){
    await visit(restoredA,base+'/read?p=restoredA','restored A starts without session',restoredLauncher);
    await visit(restoredB,base+'/read?p=restoredB','restored B starts without session',restoredLauncher);
  }
  const checks=evaluateIsolationChecks({steps,simultaneous,concurrentA,concurrentB,concurrentExitCodes,
    concurrentStopped:!launcher.isBusy(A.id)&&!launcher.isBusy(B.id),
    restoreExcludesSessions:restoreResult.excludesSessions});
  const report = { schema: 'lhm.storage-isolation.v1', at: new Date().toISOString(), engine, browser: bin || 'auto',
    sameOrigin: true, storesChecked: ['cookie (JS)', 'cookie (HttpOnly)', 'localStorage', 'IndexedDB', 'Cache Storage', 'HTTP disk cache'],
    steps, concurrentResults: { A: concurrentA || null, B: concurrentB || null, exitCodes:concurrentExitCodes, diagnostics:concurrentDiagnostics },
    checks, verdict: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL' };
  fs.writeFileSync(path.join(outDir, 'storage-isolation-report.json'), JSON.stringify(report, null, 2));
  reportWritten = true;
  console.log(JSON.stringify({ verdict: report.verdict, checks, steps: steps.map(s => ({ step: s.step, cookie: s.cookie, httpCookie: s.cookieHeader,
    localStorage: s.localStorage, indexedDB: s.indexedDB, cacheStorage: s.cacheStorage, httpCacheNetworkFetches: s.httpCacheNetworkFetches, err: s.err })) }, null, 2));
  process.exitCode = report.verdict === 'PASS' ? 0 : 1;
  });
})().catch(e => { console.error(e); process.exitCode = 1; });
