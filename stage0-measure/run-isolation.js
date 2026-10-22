'use strict';
/**
 * Stage-0 extended data-isolation measurement (Constitution Section 17.2).
 *
 * run.js covers the classic protocol: sequential writes, fresh-B read,
 * clean stop/restart. This runner covers the protocol steps run.js does
 * NOT: (a) simultaneous + interleaved cross-writes while both profiles
 * stay open, (b) engine process killed mid-session, then reopened,
 * (c) profile-directory snapshot -> restore, (d) HTTP cache and favicon
 * cache partitioning observed from a controlled loopback server.
 * Storage fields: cookie, localStorage, IndexedDB, Cache Storage and
 * Service Worker registrations. Synthetic markers only; loopback only.
 *
 * Engine selection:
 *   Windows: LHM_CAMOUFOX_EXECUTABLE + LHM_CAMOUFOX_EXE_SHA256 (same
 *     contract as run.js); the controller's default headful launch is used.
 *   Other platforms: LHM_STAGE0_ISO_EXE = absolute path to a Camoufox
 *     binary; optional LHM_STAGE0_ISO_SHA256 is enforced when present.
 *     A launchPersistentContext wrapper is injected (headless, longer
 *     timeout) because the controller's built-in 30s headful launch is a
 *     Windows-acceptance path. The controller, profile directories,
 *     network preflight and proxy plan under test are the real ones.
 *
 * A PASS here is a LOCAL diagnostic on this machine/engine only. It is
 * not installed-EXE acceptance, not a Windows result, and never evidence
 * that any website can or cannot associate profiles.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto'),http=require('node:http');
const {spawnSync}=require('node:child_process');
const core=require('./core');
const {CamoufoxPlaywrightController}=require('../src/engine/CamoufoxPlaywrightController');

const IDS={a:'iso_a',b:'iso_b'};
const token=()=>crypto.randomBytes(12).toString('hex');

/* ---------------- page-side storage helpers (5 fields) ---------------- */
function writeIso(page,marker){
 return page.evaluate(async m=>{
  const key='stage0_lab_marker';
  document.cookie=key+'='+m+'; Max-Age=3600; SameSite=Lax; Path=/';
  localStorage.setItem(key,m);
  await new Promise((resolve,reject)=>{
   const open=indexedDB.open('stage0-lab-db',1);
   open.onupgradeneeded=()=>open.result.createObjectStore('samples');
   open.onerror=()=>reject(open.error||Error('IndexedDB unavailable'));
   open.onsuccess=()=>{
    const db=open.result,tx=db.transaction('samples','readwrite');
    tx.objectStore('samples').put(m,key);
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();reject(tx.error||Error('IndexedDB write failed'))};
   };
  });
  const cache=await caches.open('stage0-lab-cache');
  await cache.put(new Request('/cache-entry'),new Response(m,{headers:{'Content-Type':'text/plain'}}));
  if(!('serviceWorker' in navigator))throw Error('Service Worker API unavailable');
  await navigator.serviceWorker.register('/sw.js?m='+m);
 },marker);
}
async function readServiceWorkerMarker(page){
 // Two probes, because each alone has a blind spot:
 //  - functional: fetch('/sw-marker') is answered by THIS profile's
 //    controlling worker with its own marker. Authoritative for "a
 //    worker registered by this profile is in effect", and it wakes a
 //    worker that idle-time terminated. Blind spot: brief transitions.
 //  - worker objects: getRegistrations() scriptURLs. Blind spot: an
 //    idle-terminated worker can vanish from all three state slots
 //    while its registration persists (observed in the idle crash run).
 // Verdict rule: a single worker-object marker wins; otherwise the
 // latest functional answer wins; otherwise keep polling.
 let lastFunctional=null;
 for(let attempt=0;attempt<25;attempt++){
  const state=await page.evaluate(async()=>{
   let functional=null;
   try{
    const r=await fetch('/sw-marker');
    if(r.ok){
     const text=(await r.text()).trim();
     if(/^[A-Za-z0-9-]{4,128}$/.test(text))functional=text;
    }
   }catch(_){/* no controlling worker */}
   let markers=[];
   if('serviceWorker' in navigator){
    const set=new Set();
    for(const reg of await navigator.serviceWorker.getRegistrations()){
     for(const worker of [reg.installing,reg.waiting,reg.active]){
      if(worker&&worker.scriptURL){
       try{
        const m=new URL(worker.scriptURL).searchParams.get('m');
        if(m)set.add(m);
       }catch(_){/* unparsable scriptURL */}
      }
     }
    }
    markers=[...set];
   }
   return {functional,markers};
  });
  if(state.functional)lastFunctional=state.functional;
  if(state.markers.length===1)return state.markers[0];
  if(lastFunctional&&attempt>=6&&state.markers.length===0)return lastFunctional;
  if(lastFunctional&&state.markers.length>1&&attempt>=12)return lastFunctional;
  await page.waitForTimeout(400);
 }
 return lastFunctional;
}
async function readIso(page){
 const base=await page.evaluate(async()=>{
  const key='stage0_lab_marker';
  const cookie=(document.cookie.match(/(?:^|;\s*)stage0_lab_marker=([^;]*)/)||[])[1]||null;
  const storage=localStorage.getItem(key);
  const indexed=await new Promise((resolve,reject)=>{
   const open=indexedDB.open('stage0-lab-db',1);
   open.onupgradeneeded=()=>open.result.createObjectStore('samples');
   open.onerror=()=>reject(open.error||Error('IndexedDB unavailable'));
   open.onsuccess=()=>{
    const db=open.result,request=db.transaction('samples','readonly').objectStore('samples').get(key);
    request.onerror=()=>{db.close();reject(request.error||Error('IndexedDB read failed'))};
    request.onsuccess=()=>{const v=request.result??null;db.close();resolve(v)};
   };
  });
  const cache=await caches.open('stage0-lab-cache');
  const hit=await cache.match(new Request('/cache-entry'));
  return {cookie,localStorage:storage,indexedDB:indexed,
   cacheStorage:hit?await hit.text():null};
 });
 return {...base,serviceWorker:await readServiceWorkerMarker(page)};
}

/* ---------------- controlled loopback server -------------------------- */
const ICO_B64='AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAA'
 +'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
function startServer(){
 const stats={assetHits:[],faviconHits:0,assetCounter:0};
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/probe'||url.pathname==='/probe-icon'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
   const icon=url.pathname==='/probe-icon'
    ?'<link rel="icon" href="/favicon.ico?phase=d">':'';
   res.end('<!doctype html><html><head><meta charset="utf-8">'+icon+
    '<title>LHM isolation probe</title></head><body>probe</body></html>');
   return;
  }
  if(url.pathname==='/sw.js'){
   const m=(url.searchParams.get('m')||'').replace(/[^A-Za-z0-9-]/g,'');
   res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});
   res.end('/* synthetic stage0 service worker */\n'+
    'const MARKER='+JSON.stringify(m)+';\n'+
    "self.addEventListener('install',()=>self.skipWaiting());\n"+
    "self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));\n"+
    "self.addEventListener('fetch',e=>{\n"+
    " if(new URL(e.request.url).pathname==='/sw-marker')\n"+
    "  e.respondWith(new Response(MARKER,{headers:{'Content-Type':'text/plain'}}));\n"+
    "});\n");
   return;
  }
  if(url.pathname==='/asset'){
   const inm=req.headers['if-none-match']||null;
   stats.assetHits.push({ifNoneMatch:inm,at:Date.now()});
   if(inm){
    res.writeHead(304,{'ETag':inm,'Cache-Control':'public, max-age=3600'});
    res.end();return;
   }
   stats.assetCounter+=1;
   const body='asset-'+stats.assetCounter;
   res.writeHead(200,{'Content-Type':'text/plain',
    'ETag':'"'+body+'"','Cache-Control':'public, max-age=3600'});
   res.end(body);return;
  }
  if(url.pathname==='/favicon.ico'){
   stats.faviconHits+=1;
   res.writeHead(200,{'Content-Type':'image/x-icon',
    'ETag':'"favicon-d"','Cache-Control':'public, max-age=3600'});
   res.end(Buffer.from(ICO_B64,'base64'));return;
  }
  res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');
 });
 return new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{
   const port=server.address().port;
   resolve({stats,origin:'http://127.0.0.1:'+port,
    close:()=>new Promise((res2,rej)=>server.close(e=>e?rej(e):res2()))});
  });
 });
}

/* An idle-terminated Service Worker can stop answering on a long-open
 * page while its registration persists in the profile. If (and only if)
 * the SW field reads null on a live profile, re-read it from a fresh
 * page in the same context — a fresh navigation re-attaches the
 * registration, exactly as the restore phase reads state after a
 * relaunch. Returns a patched observation or null. */
async function swFreshPageFallback(page,observation){
 if(!observation||observation.serviceWorker!==null)return null;
 if(observation.cookie===null&&observation.localStorage===null)return null;
 const fresh=await page.context().newPage();
 try{
  await fresh.goto(page.url());
  const marker=await readServiceWorkerMarker(fresh);
  return marker?{...observation,serviceWorker:marker}:null;
 }finally{await fresh.close().catch(()=>{})}
}

/* ---------------- engine process kill --------------------------------- */
function pidsForProfileDir(dir){
 const found=[];
 if(process.platform==='linux'){
  for(const entry of fs.readdirSync('/proc')){
   if(!/^\d+$/.test(entry))continue;
   try{
    const cmd=fs.readFileSync('/proc/'+entry+'/cmdline','utf8');
    if(cmd.includes(dir))found.push(Number(entry));
   }catch(_){/* process vanished */}
  }
 }
 return found;
}
async function killEngineProcess(controller,id,profileDir){
 const context=controller.contextFor(id);
 let browserPid=null;
 try{browserPid=context?.browser?.()?.process?.()?.pid||null}catch(_){}
 const pids=new Set(pidsForProfileDir(profileDir));
 if(browserPid)pids.add(browserPid);
 if(process.platform==='win32'&&browserPid){
  spawnSync('taskkill',['/PID',String(browserPid),'/T','/F'],{timeout:15000,windowsHide:true});
 }else{
  for(const pid of pids){
   try{process.kill(pid,'SIGKILL')}catch(_){/* already gone */}
  }
 }
 if(pids.size===0){
  const error=Error('No engine process found to kill for profile '+id+
   ' (platform '+process.platform+')');
  error.code='NOT_RUN';throw error;
 }
 // Wait until the controller observes the context close and frees the id.
 for(let i=0;i<60;i++){
  if(!controller.contextFor(id))return {killedPids:[...pids]};
  await new Promise(r=>setTimeout(r,500));
 }
 throw Error('Controller still holds the killed profile after 30s');
}

/* ---------------- engine / runner setup ------------------------------- */
function engineOptions(){
 if(process.platform==='win32'){
  const {executable,expectedSha256}=core.safeOptions();
  if(!path.isAbsolute(executable)||path.basename(executable).toLowerCase()!=='camoufox.exe')
   throw Error('Approved camoufox.exe must be an absolute file path');
  const stat=fs.lstatSync(executable);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('Rejecting linked or non-file Camoufox executable');
  if(core.digestFile(executable)!==expectedSha256)
   throw Error('Camoufox executable SHA-256 did not match approved reference');
  return {realPath:executable,verifiedDigest:expectedSha256};
 }
 const exe=process.env.LHM_STAGE0_ISO_EXE;
 if(typeof exe!=='string'||!path.isAbsolute(exe))
  throw Error('LHM_STAGE0_ISO_EXE must specify an absolute Camoufox binary path on this platform');
 const realPath=fs.realpathSync(exe);
 const digest=core.digestFile(realPath);
 const expected=(process.env.LHM_STAGE0_ISO_SHA256||'').toLowerCase();
 if(expected&&expected!==digest)
  throw Error('Camoufox binary SHA-256 did not match LHM_STAGE0_ISO_SHA256');
 return {realPath,verifiedDigest:digest};
}
function engineVersion(realPath){
 try{
  const ini=fs.readFileSync(path.join(path.dirname(realPath),'application.ini'),'utf8');
  return (ini.match(/^Version=(.+)$/m)||[])[1]?.trim()||null;
 }catch(_){return null}
}
function currentHead(){
 const r=spawnSync('git',['rev-parse','HEAD'],{
  cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:5000,windowsHide:true});
 return r.status===0&&/^[a-f0-9]{40}$/i.test(r.stdout.trim())?r.stdout.trim():null;
}
function profile(id){
 return {id,name:'Stage0 isolation '+id,engine:'gecko',engine_type:'camoufox',
  fingerprint:{mode:'native'},proxy:{type:'direct'}};
}
const notRun=(reason)=>{const e=Error(reason);e.code='NOT_RUN';return e;};

/* ---------------- main ------------------------------------------------- */
async function run(){
 const report={
  classification:'LOCAL_STAGE0_ISOLATION_EXTENDED',
  executedAt:new Date().toISOString(),
  branchHead:currentHead(),
  platform:process.platform,node:process.version,
  engine:{path:null,sha256:null,version:null},
  conditions:{
   baselineClassic:{status:'NOT_RUN'},
   concurrentCrossWrite:{status:'NOT_RUN'},
   crashRecovery:{status:'NOT_RUN'},
   crashRecoveryIdleFlush:{status:'NOT_RUN'},
   dirSnapshotRestore:{status:'NOT_RUN'},
   configBackupRestore:{status:'NOT_RUN',
    note:'Separate Node-level run: node stage0-measure/backup-restore-isolation.js'},
   httpCache:{status:'NOT_RUN'},
   faviconCache:{status:'NOT_RUN'}
  },
  network:{proxy:'NOT_RUN',dns:'NOT_RUN',webrtc:'NOT_RUN',externalEgress:'NOT_RUN'},
  signedReleaseAcceptance:'NOT_RUN',installedClientAcceptance:'NOT_RUN',
  caveat:'Local synthetic-marker isolation results only; they do not prove any website can or cannot associate profiles'
 };
 let root=null,server=null,controller=null,cleanupError=null;
 const fail=(bucket,error)=>{
  report.conditions[bucket]=error?.code==='NOT_RUN'
   ?{status:'NOT_RUN',reason:String(error.message||error).slice(0,280)}
   :{status:'FAIL',errorType:error?.code||error?.name||'Error',
     reason:String(error?.message||error).slice(0,280)};
 };
 /* (c1) Configuration-layer backup/restore needs no browser: run the
  * dedicated Node-level script and fold its verdict into this report. */
 try{
  const r=spawnSync(process.execPath,
   [path.join(__dirname,'backup-restore-isolation.js')],
   {encoding:'utf8',timeout:120000});
  report.conditions.configBackupRestore=r.status===0
   ?{status:'PASS',runner:'backup-restore-isolation.js',exitCode:0}
   :{status:'FAIL',runner:'backup-restore-isolation.js',exitCode:r.status,
     reason:String(r.stderr||r.stdout||'').slice(-280)};
 }catch(error){fail('configBackupRestore',error)}
 try{
  const {realPath,verifiedDigest}=engineOptions();
  report.engine={path:realPath,sha256:verifiedDigest,version:engineVersion(realPath)};
  root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-stage0-iso-'));
  server=await startServer();
  // The controller accepts only a path whose basename is camoufox.exe.
  let exeForController=realPath;
  if(path.basename(realPath).toLowerCase()!=='camoufox.exe'){
   const shimDir=path.join(root,'exe-shim');
   fs.mkdirSync(shimDir,{recursive:true});
   exeForController=path.join(shimDir,'camoufox.exe');
   fs.symlinkSync(realPath,exeForController);
  }
  const verifier={resolve:engine=>{assert.equal(engine,'camoufox');return exeForController;}};
  const options={verifier,enabled:true,labApproved:false};
  if(process.platform!=='win32'){
   const pw=require('playwright-core');
   options.launchPersistentContext=(dir,launchOptions)=>
    pw.firefox.launchPersistentContext(dir,{...launchOptions,headless:true,timeout:120000});
  }
  controller=new CamoufoxPlaywrightController(root,options);
  const dirOf=id=>path.join(root,'camoufox-profiles',id);
  const launchPair=async()=>{
   const a=await controller.launch(profile(IDS.a));
   const b=await controller.launch(profile(IDS.b));
   const ap=await a.context.newPage(),bp=await b.context.newPage();
   await Promise.all([ap.goto(server.origin+'/probe'),bp.goto(server.origin+'/probe')]);
   return {ap,bp};
  };
  const stopQuiet=async id=>{
   try{if(controller.contextFor(id))await controller.stop(id)}catch(_){}
  };

  let {ap,bp}=await launchPair();

  /* Baseline: the classic run.js sequence on the 4 classic fields. */
  try{
   const a='base-a-'+token(),b='base-b-'+token();
   const classic=({cookie,localStorage,indexedDB,cacheStorage})=>({cookie,localStorage,indexedDB,cacheStorage});
   await writeIso(ap,a);
   const beforeB=await readIso(bp);
   await writeIso(bp,b);
   const [afterA,afterB]=await Promise.all([readIso(ap),readIso(bp)]);
   await Promise.all([controller.stop(IDS.a),controller.stop(IDS.b)]);
   const r2=await launchPair();ap=r2.ap;bp=r2.bp;
   const [restartA,restartB]=await Promise.all([readIso(ap),readIso(bp)]);
   const result=core.stageStorageResult(
    classic(beforeB),classic(afterA),classic(afterB),
    classic(restartA),classic(restartB),{a,b});
   report.conditions.baselineClassic={status:result.pass?'PASS':'FAIL',...result};
  }catch(error){fail('baselineClassic',error)}

  /* (a) Concurrent: simultaneous writes, then interleaved cross-writes. */
  const M={a1:'conc-a1-'+token(),a2:'conc-a2-'+token(),
   b1:'conc-b1-'+token(),b2:'conc-b2-'+token()};
  try{
   await Promise.all([writeIso(ap,M.a1),writeIso(bp,M.b1)]);
   const afterFirst={a:await readIso(ap),b:await readIso(bp)};
   await Promise.all([writeIso(ap,M.a2),writeIso(bp,M.b2)]);
   const afterSecond={a:await readIso(ap),b:await readIso(bp)};
   const result=core.concurrentIsolationResult({afterFirst,afterSecond},M);
   report.conditions.concurrentCrossWrite={status:result.pass?'PASS':'FAIL',...result,
    observations:{afterFirst,afterSecond}};
  }catch(error){fail('concurrentCrossWrite',error)}

  /* (b) Crash: kill A's engine process mid-session, then reopen. */
  const crash={a:'crash-a-'+token(),b:'crash-b-'+token(),aFunc:'func-a-'+token()};
  try{
   await Promise.all([writeIso(ap,crash.a),writeIso(bp,crash.b)]);
   await Promise.all([ap.reload(),bp.reload()]);
   await new Promise(r=>setTimeout(r,1500)); // let the engine flush storage
   const aBefore=await readIso(ap),bBefore=await readIso(bp);
   const kill=await killEngineProcess(controller,IDS.a,dirOf(IDS.a));
   const ra=await controller.launch(profile(IDS.a));
   ap=await ra.context.newPage();
   await ap.goto(server.origin+'/probe');
   const aAfter=await readIso(ap);
   let bAfter=await readIso(bp);
   const bSwFallback=await swFreshPageFallback(bp,bAfter);
   if(bSwFallback)bAfter=bSwFallback;
   const result=core.crashRecoveryResult({aBefore,aAfter,bBefore,bAfter},crash);
   await writeIso(ap,crash.aFunc);
   const functional=await readIso(ap);
   const aFunctional=Object.values(functional).every(v=>v===crash.aFunc);
   report.conditions.crashRecovery={status:result.pass&&aFunctional?'PASS':'FAIL',
    ...result,killedPids:kill.killedPids,
    profileFunctionalAfterReopen:aFunctional,
    flushWindow:'reload + 1500ms idle before kill',
    bServiceWorkerViaFreshPage:!!bSwFallback,
    observations:{aBefore,aAfter,bBefore,bAfter}};
  }catch(error){fail('crashRecovery',error)}

  /* (c2) Directory snapshot -> post-snapshot write -> wipe -> restore. */
  const snap={snapshot:crash.aFunc,postSnapshot:'post-snap-'+token(),other:crash.b};
  try{
   const atSnapshot=await readIso(ap);
   if(!Object.values(atSnapshot).every(v=>v===snap.snapshot))
    throw Error('Pre-snapshot state is not the expected functional marker');
   await Promise.all([stopQuiet(IDS.a),stopQuiet(IDS.b)]);
   const snapshotDir=path.join(root,'snapshot-a');
   fs.cpSync(dirOf(IDS.a),snapshotDir,{recursive:true});
   const ra=await controller.launch(profile(IDS.a));
   ap=await ra.context.newPage();
   await ap.goto(server.origin+'/probe');
   await writeIso(ap,snap.postSnapshot);
   await stopQuiet(IDS.a);
   fs.rmSync(dirOf(IDS.a),{recursive:true,force:true});
   fs.cpSync(snapshotDir,dirOf(IDS.a),{recursive:true});
   const ra2=await controller.launch(profile(IDS.a));
   ap=await ra2.context.newPage();
   await ap.goto(server.origin+'/probe');
   const restored=await readIso(ap);
   const rb=await controller.launch(profile(IDS.b));
   bp=await rb.context.newPage();
   await bp.goto(server.origin+'/probe');
   const other=await readIso(bp);
   const result=core.restoreIsolationResult({restored,other},snap);
   report.conditions.dirSnapshotRestore={status:result.pass?'PASS':'FAIL',...result,
    observations:{restored,other}};
  }catch(error){fail('dirSnapshotRestore',error)}

  /* (b2) Crash variant: identical kill, longer idle flush window. This is
   * a separate, labelled condition — it does not re-judge (b). */
  const idle={a:'idle-a-'+token(),b:crash.b,func:'idle-func-'+token()};
  try{
   await writeIso(ap,idle.a);
   await ap.reload();
   await new Promise(r=>setTimeout(r,10000)); // idle: let async storage flush
   const aBefore=await readIso(ap),bBefore=await readIso(bp);
   const kill=await killEngineProcess(controller,IDS.a,dirOf(IDS.a));
   const ra=await controller.launch(profile(IDS.a));
   ap=await ra.context.newPage();
   await ap.goto(server.origin+'/probe');
   const aAfter=await readIso(ap);
   let bAfter=await readIso(bp);
   const bSwFallback=await swFreshPageFallback(bp,bAfter);
   if(bSwFallback)bAfter=bSwFallback;
   const result=core.crashRecoveryResult({aBefore,aAfter,bBefore,bAfter},idle);
   await writeIso(ap,idle.func);
   const functional=await readIso(ap);
   const aFunctional=Object.values(functional).every(v=>v===idle.func);
   report.conditions.crashRecoveryIdleFlush={status:result.pass&&aFunctional?'PASS':'FAIL',
    ...result,killedPids:kill.killedPids,
    profileFunctionalAfterReopen:aFunctional,
    flushWindow:'reload + 10000ms idle before kill',
    bServiceWorkerViaFreshPage:!!bSwFallback,
    observations:{aBefore,aAfter,bBefore,bAfter}};
  }catch(error){fail('crashRecoveryIdleFlush',error)}

  /* (d) HTTP cache + favicon cache partitioning. */
  try{
   const fetchText=page=>page.evaluate(async()=>{
    const r=await fetch('/asset');return r.text();
   });
   const bodyAFirst=await fetchText(ap);
   const hitsAfterAFirst=server.stats.assetHits.length;
   const bodyASecond=await fetchText(ap);
   const hitsAfterASecond=server.stats.assetHits.length;
   const bodyBFirst=await fetchText(bp);
   const hitsAfterBFirst=server.stats.assetHits.length;
   await ap.evaluate(async()=>{await fetch('/asset',{cache:'no-cache'})});
   const revalidation=server.stats.assetHits[server.stats.assetHits.length-1];
   // The server issues ETag "<body>" for the body it served; A's first
   // body therefore determines the ETag A must present on revalidation.
   const result=core.httpCacheIsolationResult({
    hitsAfterAFirst,hitsAfterASecond,hitsAfterBFirst,
    bodyAFirst,bodyASecond,bodyBFirst,
    aEtag:'"'+bodyAFirst+'"',
    revalidationEtagSeen:revalidation?.ifNoneMatch||'none'});
   report.conditions.httpCache={status:result.pass?'PASS':'FAIL',...result};
  }catch(error){fail('httpCache',error)}
  try{
   const iconA=await ap.context().newPage(),iconB=await bp.context().newPage();
   await iconA.goto(server.origin+'/probe-icon');
   await iconA.waitForTimeout(1500);
   const hitsAfterA=server.stats.faviconHits;
   await iconB.goto(server.origin+'/probe-icon');
   await iconB.waitForTimeout(1500);
   const hitsAfterB=server.stats.faviconHits;
   const result=core.faviconCacheResult({hitsAfterA,hitsAfterB});
   report.conditions.faviconCache=result.measurable
    ?{status:result.pass?'PASS':'FAIL',...result}
    :{status:'NOT_RUN',...result,
      reason:'Engine issued no favicon request in this automation mode; favicon fetches are a browser-chrome behaviour that headless automation does not exercise'};
  }catch(error){fail('faviconCache',error)}
 }catch(error){
  report.preflight={status:error?.code==='NOT_RUN'?'NOT_RUN':'FAIL',
   reason:String(error?.message||error).slice(0,280)};
  for(const key of Object.keys(report.conditions)){
   if(report.conditions[key].status==='NOT_RUN'&&key!=='configBackupRestore')
    report.conditions[key]={status:'NOT_RUN',reason:'Preflight failed: '+report.preflight.reason};
  }
 }finally{
  if(controller)for(const id of [IDS.a,IDS.b]){
   try{if(controller.contextFor(id))await controller.stop(id)}
   catch(error){cleanupError=String(error.message).slice(0,100)}
  }
  if(server)await server.close().catch(error=>{cleanupError=String(error.message).slice(0,100)});
  if(root&&process.env.LHM_STAGE0_ISO_KEEP!=='1'&&!cleanupError){
   try{fs.rmSync(root,{recursive:true,force:true,maxRetries:12,retryDelay:300})}
   catch(error){cleanupError=String(error.message).slice(0,100)}
  }
 }
 report.cleanup=cleanupError?'NEEDS_MANUAL_REVIEW':'PASS';
 const dir=path.resolve(__dirname,'..','stage0-measure-results');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const file=path.join(dir,'stage0-isolation-report.json');
 fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 const summary={classification:report.classification,
  engine:report.engine.version,engineSha256:(report.engine.sha256||'').slice(0,16),
  conditions:Object.fromEntries(Object.entries(report.conditions)
   .map(([k,v])=>[k,v.status])),
  cleanup:report.cleanup,report:file};
 console.log(JSON.stringify(summary));
 const anyFail=Object.values(report.conditions).some(c=>c.status==='FAIL')||
  report.preflight?.status==='FAIL';
 if(anyFail)process.exitCode=2;
}
run().catch(error=>{console.error('[Stage-0 isolation]',String(error.message||error));process.exitCode=2});
