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
const {safeOptions,stageStorageResult,digestFile,
 extendedProbe,summarizeProbe}=require('./core');
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
async function captureExtended(page){
 try{return summarizeProbe(await page.evaluate(extendedProbe))}
 catch(error){return {points:{},counts:{MEASURED:0,UNSUPPORTED:0,BLOCKED:0},
  total:0,probeError:String((error&&error.name)||'Error')}}
}
async function serveLoopback(){
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
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
 let phase='preflight';
 const enter=name=>{phase=name;report.phase=name;report.progressAt=new Date().toISOString();
  writeReport(report);console.log('[Stage-0 phase] '+name)};
 const report={
  classification:'LOCAL_STAGE0_DIAGNOSTIC_ONLY',
  executedAt:new Date().toISOString(),
  branchHead:currentHead(),
  browserExecutableSha256:actual,
  driver:'CamoufoxPlaywrightController + playwright-core.firefox',
  temporarySyntheticProfiles:true,concurrentProfiles:2,
  checks:{status:'NOT_RUN'},
  browserExposedValues:{status:'NOT_RUN'},
  extendedEnvironment:{status:'NOT_RUN'},
  network:{proxy:'NOT_RUN',dns:'NOT_RUN',webrtc:'NOT_RUN',externalEgress:'NOT_RUN'},
  signedReleaseAcceptance:'NOT_RUN',installedClientAcceptance:'NOT_RUN',
  caveat:'Isolation at a local origin does not prove websites cannot associate profiles'
 };
 try{
  enter('launch-a');
  const a=await controller.launch(profile('stage0_a'));
  enter('launch-b');
  const b=await controller.launch(profile('stage0_b'));
  enter('create-pages');
  const ap=await a.context.newPage(),bp=await b.context.newPage();
  enter('navigate');
  await Promise.all([ap.goto(server.url),bp.goto(server.url)]);
  enter('write-a');
  await writeValues(ap,tokens.a);
  enter('read-b-before');
  const beforeB=await readValues(bp);
  enter('write-b');
  await writeValues(bp,tokens.b);
  enter('capture-storage-and-exposure');
  const [afterA,afterB,exposedA,exposedB,extendedA,extendedB]=await Promise.all([
   readValues(ap),readValues(bp),captureEnvironment(ap),captureEnvironment(bp),
   captureExtended(ap),captureExtended(bp)
  ]);
  enter('stop-both-before-restart');
  await Promise.all([controller.stop('stage0_a'),controller.stop('stage0_b')]);
  enter('restart-both');
  const ra=await controller.launch(profile('stage0_a'));
  const rb=await controller.launch(profile('stage0_b'));
  const rap=await ra.context.newPage(),rbp=await rb.context.newPage();
  await Promise.all([rap.goto(server.url),rbp.goto(server.url)]);
  const [restartA,restartB]=await Promise.all([readValues(rap),readValues(rbp)]);
  enter('evaluate-isolation');
  const observations=stageStorageResult(beforeB,afterA,afterB,restartA,restartB,tokens);
  report.checks={status:observations.pass?'PASS':'FAIL',...observations};
  report.browserExposedValues={
   status:'MEASURED_NOT_UNIQUENESS_ASSERTED',
   profileA:exposedA,profileB:exposedB,
   equalAcrossProfiles:JSON.stringify(exposedA)===JSON.stringify(exposedB)
  };
  report.extendedEnvironment={profileA:extendedA,profileB:extendedB};
 }catch(error){
  report.checks={status:'FAIL',phase,errorType:error?.code||error?.name||'Error',
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
 const output=writeReport(report);
 console.log(JSON.stringify({classification:report.classification,status:report.checks.status,
  contexts:report.concurrentProfiles,exposure:report.browserExposedValues.status,
  proxy:report.network.proxy,dns:report.network.dns,webrtc:report.network.webrtc,
  cleanup:report.cleanup,report:output}));
 if(report.checks.status!=='PASS'||cleanupError)process.exitCode=2;
}
run().catch(error=>{console.error('[Stage-0]',String(error.message||error));process.exitCode=2});
