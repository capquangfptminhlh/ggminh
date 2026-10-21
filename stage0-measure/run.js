'use strict';
/**
 * Stage-0 real Camoufox experiment. Uses the SELECTIVE branch's real
 * CamoufoxPlaywrightController, ephemeral synthetic profiles and loopback HTTP.
 * NEVER implies signed installed application, IP leak prevention, or unlinkability.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto'),http=require('node:http');
const {spawnSync}=require('node:child_process');
const {safeOptions,stageStorageResult,digestFile}=require('./core');
const {observedHeaders,browserHeaders,compareHeaders}=require('./headers');
const {compareSnapshots,compareRestart}=require('./snapshot');
const {networkReview}=require('./network-review');
const {sealReport}=require('./report-integrity');
const {validateReport}=require('./report-gate');
const {CamoufoxPlaywrightController}=require('../src/engine/CamoufoxPlaywrightController');

function readValues(page){
 return page.evaluate(async()=>{
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
  return {cookie,localStorage:storage,indexedDB:indexed,cacheStorage:hit?await hit.text():null};
 });
}
function writeValues(page,value){
 return page.evaluate(async marker=>{
  const key='stage0_lab_marker';
  document.cookie=key+'='+marker+'; Max-Age=3600; SameSite=Lax; Path=/';
  localStorage.setItem(key,marker);
  await new Promise((resolve,reject)=>{
   const open=indexedDB.open('stage0-lab-db',1);
   open.onupgradeneeded=()=>open.result.createObjectStore('samples');
   open.onerror=()=>reject(open.error||Error('IndexedDB unavailable'));
   open.onsuccess=()=>{
    const db=open.result,tx=db.transaction('samples','readwrite');
    tx.objectStore('samples').put(marker,key);
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();reject(tx.error||Error('IndexedDB write failed'))};
   };
  });
  const cache=await caches.open('stage0-lab-cache');
  await cache.put(new Request('/cache-entry'),new Response(marker,{headers:{'Content-Type':'text/plain'}}));
 },value);
}
function captureEnvironment(page){
 return page.evaluate(()=>({
  userAgent:navigator.userAgent,
  platform:navigator.platform,
  language:navigator.language,
  languages:[...navigator.languages],
  hardwareConcurrency:navigator.hardwareConcurrency??null,
  screen:{width:screen.width,height:screen.height,colorDepth:screen.colorDepth},
  devicePixelRatio:window.devicePixelRatio,
  timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
  hasUserAgentData:typeof navigator.userAgentData!=='undefined',
  isSecureContext:window.isSecureContext
 }));
}
async function serveLoopback(){
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='GET'&&req.url==='/stage0/headers'){
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
   res.end(JSON.stringify(observedHeaders(req)));return;
  }
  if(req.method!=='GET'||req.url!=='/probe'){
   res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');return;
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end('<!doctype html><html><head><meta charset="utf-8"><title>LHM Stage-0 local test</title></head><body>Local isolation test</body></html>');
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 return {url:'http://127.0.0.1:'+server.address().port+'/probe',
  close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))};
}
function profile(id){
 return {id,name:'Stage0 synthetic '+id,engine:'gecko',engine_type:'camoufox',
  fingerprint:{mode:'native'},proxy:{type:'direct'}};
}
function currentHead(){
 const r=spawnSync('git',['rev-parse','HEAD'],{
  cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:5000,windowsHide:true
 });
 return r.status===0&&/^[a-f0-9]{40}$/i.test(r.stdout.trim())?r.stdout.trim():null;
}
function writeReport(report){
 const dir=path.resolve(__dirname,'..','stage0-measure-results');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const file=path.join(dir,'stage0-local-report.json');
 fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 return file;
}
async function run(){
 if(process.platform!=='win32')throw Error('Real Camoufox Stage-0 measurement requires Windows');
 const {executable,expectedSha256}=safeOptions();
 if(!path.isAbsolute(executable)||path.basename(executable).toLowerCase()!=='camoufox.exe')
  throw Error('Approved camoufox.exe must be an absolute file path');
 const stat=fs.lstatSync(executable);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('Rejecting linked or non-file Camoufox executable');
 const actual=digestFile(executable);
 if(actual!==expectedSha256)throw Error('Camoufox executable SHA-256 did not match approved reference');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-stage0-local-'));
 const server=await serveLoopback();
 const verifier={resolve:engine=>{assert.equal(engine,'camoufox');return executable;}};
 const controller=new CamoufoxPlaywrightController(root,{
  verifier,enabled:true,labApproved:false
 });
 const tokens={a:crypto.randomBytes(16).toString('hex'),b:crypto.randomBytes(16).toString('hex')};
 let cleanupError=null;
 const report={
  classification:'LOCAL_STAGE0_DIAGNOSTIC_ONLY',
  executedAt:new Date().toISOString(),
  branchHead:currentHead(),
  browserExecutableSha256:actual,
  driver:'CamoufoxPlaywrightController + playwright-core.firefox',
  temporarySyntheticProfiles:true,concurrentProfiles:2,
  checks:{status:'NOT_RUN'},
  browserExposedValues:{status:'NOT_RUN'},
  serverRequestEvidence:{status:'NOT_RUN'},
  snapshotComparison:{status:'NOT_RUN'},
  restartObservations:{status:'NOT_RUN'},
  networkReview:networkReview(),
  network:{proxy:'NOT_RUN',dns:'NOT_RUN',webrtc:'NOT_RUN',externalEgress:'NOT_RUN'},
  signedReleaseAcceptance:'NOT_RUN',installedClientAcceptance:'NOT_RUN',
  caveat:'Isolation at a local origin does not prove websites cannot associate profiles'
 };
 try{
  const a=await controller.launch(profile('stage0_a'));
  const b=await controller.launch(profile('stage0_b'));
  const ap=await a.context.newPage(),bp=await b.context.newPage();
  await Promise.all([ap.goto(server.url),bp.goto(server.url)]);
  await writeValues(ap,tokens.a);
  const beforeB=await readValues(bp);
  await writeValues(bp,tokens.b);
  const [afterA,afterB,exposedA,exposedB,serverA,serverB]=await Promise.all([
   readValues(ap),readValues(bp),captureEnvironment(ap),captureEnvironment(bp),
   browserHeaders(ap),browserHeaders(bp)
  ]);
  await Promise.all([controller.stop('stage0_a'),controller.stop('stage0_b')]);
  const ra=await controller.launch(profile('stage0_a'));
  const rb=await controller.launch(profile('stage0_b'));
  const rap=await ra.context.newPage(),rbp=await rb.context.newPage();
  await Promise.all([rap.goto(server.url),rbp.goto(server.url)]);
  const [restartA,restartB,restartExposedA,restartExposedB]=await Promise.all([
   readValues(rap),readValues(rbp),captureEnvironment(rap),captureEnvironment(rbp)
  ]);
  const observations=stageStorageResult(beforeB,afterA,afterB,restartA,restartB,tokens);
  report.checks={status:observations.pass?'PASS':'FAIL',...observations};
  report.browserExposedValues={
   status:'MEASURED_NOT_UNIQUENESS_ASSERTED',
   profileA:exposedA,profileB:exposedB,
   equalAcrossProfiles:JSON.stringify(exposedA)===JSON.stringify(exposedB)
  };
  report.serverRequestEvidence={status:'MEASURED_LOOPBACK_ONLY',
   a:compareHeaders(exposedA,serverA),b:compareHeaders(exposedB,serverB)};
  report.snapshotComparison={status:'MEASURED_READ_ONLY',
   betweenProfiles:compareSnapshots(exposedA,exposedB)};
  report.restartObservations={status:'MEASURED_READ_ONLY',
   a:compareRestart(exposedA,restartExposedA),b:compareRestart(exposedB,restartExposedB)};
 }catch(error){
  report.checks={status:'FAIL',errorType:error?.code||error?.name||'Error',
   reason:String(error.message||error).slice(0,280)};
 }finally{
  for(const id of ['stage0_a','stage0_b']){
   try{if(controller.contextFor(id))await controller.stop(id)}
   catch(error){cleanupError=String(error.message).slice(0,100)}
  }
  await server.close().catch(error=>{cleanupError=String(error.message).slice(0,100)});
  if(!cleanupError){
   try{fs.rmSync(root,{recursive:true,force:true,maxRetries:12,retryDelay:300})}
   catch(error){cleanupError=String(error.message).slice(0,100)}
  }
 }
 report.cleanup=cleanupError?'NEEDS_MANUAL_REVIEW':'PASS';
 const output=writeReport(sealReport(report));
 if(report.checks.status==='PASS'&&!cleanupError){
  const verdict=validateReport(JSON.parse(fs.readFileSync(output,'utf8')));
  if(!verdict.accepted){console.error('[Stage-0] Invalid evidence report:',verdict.issues);process.exitCode=2;}
 }
 console.log(JSON.stringify({classification:report.classification,status:report.checks.status,
  contexts:report.concurrentProfiles,exposure:report.browserExposedValues.status,
  proxy:report.network.proxy,dns:report.network.dns,webrtc:report.network.webrtc,
  cleanup:report.cleanup,report:output}));
 if(report.checks.status!=='PASS'||cleanupError)process.exitCode=2;
}
run().catch(error=>{console.error('[Stage-0]',String(error.message||error));process.exitCode=2});
