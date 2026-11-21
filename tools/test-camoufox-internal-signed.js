'use strict';
// Opt-in Windows smoke: signed staging engine, synthetic local profile only.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {BundledEngineManager}=require('../src/engine/bundledEngineManager');
const {CamoufoxAdapter}=require('../src/engine/camoufoxAdapter');
const {provisionCamoufoxIdentity}=require('../src/engine/camoufoxProvisioning');
const {internalCamoufoxPreview}=require('../src/engine/camoufoxInternalPreview');
const {loadCamoufoxPublisherKey}=require('../src/engine/camoufoxPublisherTrust');
const {openIsolationDb,readIsolationValue,writeIsolationValue}=require('./storage-isolation-idb');
const {inspectServiceWorker}=require('./storage-isolation-service-worker');
const {firstProfileRequest}=require('./storage-isolation-requests');

async function main(){
 const directory=process.env.LHM_CAMOUFOX_INTERNAL_DIR;
 const legacy=process.env.LHM_CAMOUFOX_SMOKE_LEGACY==='1';
 if(process.platform!=='win32'||!directory||!path.isAbsolute(directory))throw Error('Windows and an explicit signed engine directory are required');
 const key=loadCamoufoxPublisherKey(path.resolve(__dirname,'../resources/camoufox-engine'));
 const verifier=new BundledEngineManager(directory,{engine:'camoufox',publicKey:key});
 const signed=verifier.status();
 const capability=internalCamoufoxPreview({packaged:false,enabled:'1',directory,
  platform:process.platform,version:signed.version,sha256:signed.sha256});
 assert(signed.valid&&capability,'Signed staging engine failed verification');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-internal-signed-smoke-'));
 const cookies=[],results=[],requests=[];
 const server=http.createServer((req,res)=>{
  if(req.url==='/result'&&req.method==='POST'){
   let body='';req.on('data',part=>{body+=part;});
   req.on('end',()=>{try{results.push(JSON.parse(body));res.end('ok');}catch(_){res.statusCode=400;res.end();}});
   return;
  }
  if(req.url.startsWith('/lhm-worker.js')){
   res.setHeader('content-type','application/javascript');
   res.setHeader('service-worker-allowed','/');
   res.end("self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));");return;
  }
  if(req.url==='/persistence/A'||req.url==='/persistence/B'){
   cookies.push({url:req.url,cookie:req.headers.cookie||''});
   requests.push({at:new Date().toISOString(),url:req.url,cookie:req.headers.cookie||'',
    fetchSite:req.headers['sec-fetch-site']||null});
   const who=req.url.endsWith('/A')?'A':'B';
   res.setHeader('Set-Cookie',legacy?'lhm_test_persist=present; Path=/; Max-Age=3600; SameSite=Lax':[
    'lhm_test_persist='+who+'; Path=/; Max-Age=3600; SameSite=Lax',
    'lhm_test_http_only='+who+'; Path=/; Max-Age=3600; SameSite=Lax; HttpOnly'
   ]);
   res.setHeader('content-type','text/html');
   res.end(`<!doctype html><meta charset="utf-8"><script>
   (async()=>{const openIsolationDb=${openIsolationDb.toString()};
    const readIsolationValue=${readIsolationValue.toString()},writeIsolationValue=${writeIsolationValue.toString()};
    const inspectServiceWorker=${inspectServiceWorker.toString()};
    const who=${JSON.stringify(who)},legacy=${JSON.stringify(legacy)},out={who,error:null};
    try{const db=await openIsolationDb(indexedDB),cache=await caches.open('lhm_camoufox_test');
     const hit=await cache.match('/cached');
     out.before={localStorage:localStorage.getItem('lhm_test'),indexedDB:await readIsolationValue(db),
      cacheStorage:hit?await hit.text():null,serviceWorker:await inspectServiceWorker(navigator,location,'read',who)};
     if(!legacy||who==='A'){
      localStorage.setItem('lhm_test',who);await writeIsolationValue(db,who);
      await cache.put('/cached',new Response(who));
     }
     out.localStorage=localStorage.getItem('lhm_test');out.indexedDB=await readIsolationValue(db);
     const written=await cache.match('/cached');out.cacheStorage=written?await written.text():null;
     out.serviceWorker=await inspectServiceWorker(navigator,location,legacy&&who==='B'?'read':'set',who);
    }catch(e){out.error=String(e)}
    await fetch('/result',{method:'POST',body:JSON.stringify(out)});
   })();</script>`);return;
  }
  res.end('Synthetic local test');
 });
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
 server.unref();
 const profile={id:'synthetic',name:'Synthetic internal smoke',engine:'gecko',
  engine_type:'camoufox',fingerprint:{mode:'native'},proxy:{type:'direct'},
  startUrl:'http://127.0.0.1:'+server.address().port+'/persistence/A'};
 const result=await provisionCamoufoxIdentity(profile,{resolveExecutable:()=>verifier.resolve('camoufox')});
 assert.equal(result.status,'provisioned',result.reason);
 const adapter=new CamoufoxAdapter(root,{bundleVerifier:verifier,requirePinnedIdentity:true,
  capabilityResolver:()=>capability,startupTimeoutMs:30000});
 let phase='first-launch';
 try{
  const session=await adapter.start(profile);
  assert.equal(session.startupEvidence,'native-window');
  const requestDeadline=Date.now()+20000;
  while(cookies.length<1&&Date.now()<requestDeadline)await new Promise(r=>setTimeout(r,200));
  assert(cookies.length>=1,'First local page was not loaded');
  assert(!/lhm_test_(?:persist|http_only)=/.test(cookies[0].cookie),'New profile must begin without the test cookies');
  const resultDeadline=Date.now()+20000;
  while(!results.some(value=>value.who==='A')&&Date.now()<resultDeadline)await new Promise(r=>setTimeout(r,200));
  const firstA=results.find(value=>value.who==='A');
  assert(firstA&&!firstA.error&&firstA.localStorage==='A'&&firstA.indexedDB==='A'&&
   firstA.cacheStorage==='A'&&firstA.serviceWorker?.registration==='A'&&
   firstA.before?.localStorage===null&&firstA.before?.indexedDB===null&&firstA.before?.cacheStorage===null&&
   firstA.before?.serviceWorker?.registration===null,'Profile A was not clean or its storage write failed');
  phase='concurrent-profile';
  const other={...profile,id:'syntheticB',name:'Synthetic internal smoke B',
   startUrl:'http://127.0.0.1:'+server.address().port+'/persistence/B',fingerprint:{mode:'native'}};
  const provisionB=await provisionCamoufoxIdentity(other,{resolveExecutable:()=>verifier.resolve('camoufox')});
  assert.equal(provisionB.status,'provisioned',provisionB.reason);
  await adapter.start(other);
  const otherDeadline=Date.now()+20000;
  while(!cookies.some(value=>value.url==='/persistence/B')&&Date.now()<otherDeadline)await new Promise(r=>setTimeout(r,200));
  const firstB=cookies.find(value=>value.url==='/persistence/B');
  assert(firstB&&!/lhm_test_(?:persist|http_only)=/.test(firstB.cookie),'Profile B read profile A cookies');
  const resultBDeadline=Date.now()+20000;
  while(!results.some(value=>value.who==='B')&&Date.now()<resultBDeadline)await new Promise(r=>setTimeout(r,200));
  const firstResultB=results.find(value=>value.who==='B');
  assert(firstResultB&&!firstResultB.error&&firstResultB.before?.localStorage===null&&
   firstResultB.before?.indexedDB===null&&firstResultB.before?.cacheStorage===null&&
   firstResultB.before?.serviceWorker?.supported===true&&firstResultB.before.serviceWorker.registration===null&&
   firstResultB.localStorage===(legacy?null:'B')&&firstResultB.indexedDB===(legacy?null:'B')&&
   firstResultB.cacheStorage===(legacy?null:'B')&&firstResultB.serviceWorker?.registration===(legacy?null:'B'),
   'Profile B read profile A storage or service worker');
  assert(adapter.stop(other.id).success);
  const otherCloseDeadline=Date.now()+20000;
  while(adapter.isBusy(other.id)&&Date.now()<otherCloseDeadline)await new Promise(r=>setTimeout(r,200));
  assert(!adapter.isBusy(other.id),'Profile B did not close');
  phase='close-first-profile';
  const bad={...profile,id:'blocked',proxy:{type:'socks5',host:'127.0.0.1',port:9,authProxyId:'synthetic'}};
  await assert.rejects(()=>adapter.start(bad),/NETWORK_BLOCKED/);
  assert(adapter.stop(profile.id).success);
  const deadline=Date.now()+20000;
  while(adapter.isBusy(profile.id)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,200));
  assert(!adapter.isBusy(profile.id),'Browser did not close');
  const cookieDb=path.join(root,'camoufox-profiles',profile.id,'cookies.sqlite');
  for(const suffix of ['', '-wal', '-shm'])
   if(fs.existsSync(cookieDb+suffix))fs.copyFileSync(cookieDb+suffix,path.join(root,'cookies-before-reopen.sqlite'+suffix));
  cookies.length=0;
  results.length=0;
  phase='reopen-first-profile';
  const reopened=await adapter.start(profile);
  assert.equal(reopened.startupEvidence,'native-window');
  const reopenDeadline=Date.now()+20000;
  while(!firstProfileRequest(cookies,'A')&&Date.now()<reopenDeadline)
   await new Promise(r=>setTimeout(r,200));
  const firstReopenA=firstProfileRequest(cookies,'A');
  assert(firstReopenA&&(legacy?firstReopenA.cookie.includes('lhm_test_persist=present'):
   firstReopenA.cookie.includes('lhm_test_persist=A')&&firstReopenA.cookie.includes('lhm_test_http_only=A')&&!/=B/.test(firstReopenA.cookie)),
   'Profile A cookies did not persist or were polluted by profile B: '+JSON.stringify(cookies));
  const reopenResultDeadline=Date.now()+20000;
  while(!results.some(value=>value.who==='A')&&Date.now()<reopenResultDeadline)await new Promise(r=>setTimeout(r,200));
  const reopenedA=results.find(value=>value.who==='A');
  assert(reopenedA&&!reopenedA.error&&reopenedA.before?.localStorage==='A'&&
   reopenedA.before?.indexedDB==='A'&&reopenedA.before?.cacheStorage==='A'&&
   reopenedA.before?.serviceWorker?.registration==='A','Profile A storage was lost or polluted after B wrote');
  assert(adapter.stop(profile.id).success);
  const closeDeadline=Date.now()+20000;
  while(adapter.isBusy(profile.id)&&Date.now()<closeDeadline)await new Promise(r=>setTimeout(r,200));
  assert(!adapter.isBusy(profile.id),'Reopened browser did not close');
  const report={result:'PASS',at:new Date().toISOString(),engine:'Camoufox '+signed.version,
   engineSha256:signed.sha256,scope:'Synthetic local origin, native adapter, direct connection',scenario:legacy?'legacy-cookie':'distinct-cookies',
   signed:true,identityProvisioned:true,
   nativeWindow:true,proxyBlocked:true,closed:true,concurrentCookieIsolation:true,
   concurrentStorageIsolation:['localStorage','IndexedDB','Cache Storage','Service Worker'],
   cookiePersistAfterReopen:true,httpOnlyCookieTested:!legacy,storagePersistsAfterReopen:true,
   profileAUnchangedAfterBWrote:legacy?null:true,root};
  fs.writeFileSync(path.join(root,'ket-qua.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }catch(error){
  const report={result:'FAIL',at:new Date().toISOString(),scope:'Synthetic local origin only',scenario:legacy?'legacy-cookie':'distinct-cookies',
   phase,error:String(error.message||error),root,requests,results,
   cookieSnapshot:fs.existsSync(path.join(root,'cookies-before-reopen.sqlite'))};
  fs.writeFileSync(path.join(root,'ket-qua.json'),JSON.stringify(report,null,2));
  console.error(JSON.stringify(report));
  throw error;
 }finally{
  for(const [,entry] of adapter.sessions)try{entry.child.kill('SIGTERM');}catch(_){}
  server.close();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
