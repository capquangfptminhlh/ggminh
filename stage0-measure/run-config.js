'use strict';
/**
 * Stage-0 configured-profile measurement: two synthetic Camoufox profiles,
 * each carrying a DIFFERENT pinned identity produced by the official
 * camoufox generator (tools/generate-camoufox-identity.mjs) and supplied via
 * LHM_STAGE0_IDENTITY_A / LHM_STAGE0_IDENTITY_B (paths to identity JSON).
 *
 * Asserts, per profile, that the browser-exposed values equal that profile's
 * own pinned expectations (identityExpectationResult), that the two
 * identities actually differ on the fields the generator was asked to vary
 * (timezone and language), and that storage isolation still holds.
 * NEVER implies signed installed application, IP leak prevention, or
 * unlinkability.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto'),http=require('node:http');
const {spawnSync}=require('node:child_process');
const {safeOptions,stageStorageResult,digestFile,identityExpectationResult,
 extendedProbe,summarizeProbe,webglExpectationResult}=require('./core');
const {CamoufoxPlaywrightController}=require('../src/engine/CamoufoxPlaywrightController');
const {runStage,startHardDeadline}=require('./steps');
const {validateStoredIdentity}=require('../src/engine/camoufoxIdentity');

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
  res.end('<!doctype html><html><head><meta charset="utf-8"><title>LHM Stage-0 configured test</title></head><body>Local configured-profile test</body></html>');
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 return {url:'http://127.0.0.1:'+server.address().port+'/probe',
  close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))};
}
function loadIdentity(env,name){
 const file=env[name];
 if(typeof file!=='string'||!file.trim())
  throw Error(name+' must specify a generated Camoufox identity JSON file');
 const identity=JSON.parse(fs.readFileSync(file,'utf8'));
 const {expectations}=validateStoredIdentity(identity);
 return {identity,expectations};
}
function profile(id,identity){
 return {id,name:'Stage0 configured '+id,engine:'gecko',engine_type:'camoufox',
  fingerprint:{mode:'native',identity},proxy:{type:'direct'}};
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
 const file=path.join(dir,'stage0-config-report.json');
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
 const idA=loadIdentity(process.env,'LHM_STAGE0_IDENTITY_A');
 const idB=loadIdentity(process.env,'LHM_STAGE0_IDENTITY_B');
 if(idA.expectations.timezone===idB.expectations.timezone||
    idA.expectations.language===idB.expectations.language)
  throw Error('The two generated identities must differ in timezone and language');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-stage0-config-'));
 const server=await serveLoopback();
 const verifier={resolve:engine=>{assert.equal(engine,'camoufox');return executable;}};
 const controller=new CamoufoxPlaywrightController(root,{
  verifier,enabled:true,labApproved:false
 });
 const tokens={a:crypto.randomBytes(16).toString('hex'),b:crypto.randomBytes(16).toString('hex')};
 let cleanupError=null;
 const report={
  classification:'LOCAL_STAGE0_CONFIGURED_PROFILE_DIAGNOSTIC_ONLY',
  executedAt:new Date().toISOString(),
  branchHead:currentHead(),
  browserExecutableSha256:actual,
  driver:'CamoufoxPlaywrightController + playwright-core.firefox',
  temporarySyntheticProfiles:true,concurrentProfiles:2,
  identity:{status:'NOT_RUN'},
  extended:{status:'NOT_RUN'},
  checks:{status:'NOT_RUN'},
  network:{proxy:'NOT_RUN',dns:'NOT_RUN',webrtc:'NOT_RUN',externalEgress:'NOT_RUN'},
  signedReleaseAcceptance:'NOT_RUN',installedClientAcceptance:'NOT_RUN',
  caveat:'Matching a pinned identity at a local origin does not prove websites cannot associate profiles'
 };
 const stopDeadline=startHardDeadline();
 try{
  const a=await runStage('launch configured A',()=>controller.launch(profile('stage0_cfg_a',idA.identity)),65000);
  const b=await runStage('launch configured B',()=>controller.launch(profile('stage0_cfg_b',idB.identity)),65000);
  assert.equal(a.info.identityApplied,true,'profile A identity was not applied');
  assert.equal(b.info.identityApplied,true,'profile B identity was not applied');
  const ap=await runStage('new page configured A',()=>a.context.newPage(),25000);
  const bp=await runStage('new page configured B',()=>b.context.newPage(),25000);
  await runStage('configured loopback navigation',()=>Promise.all([ap.goto(server.url,{timeout:18000}),bp.goto(server.url,{timeout:18000})]),30000);
  await runStage('write configured storage A',()=>writeValues(ap,tokens.a),30000);
  const beforeB=await runStage('read fresh configured B',()=>readValues(bp),30000);
  await runStage('write configured storage B',()=>writeValues(bp,tokens.b),30000);
  const [afterA,afterB,exposedA,exposedB,extendedA,extendedB]=await runStage('capture configured values',()=>Promise.all([
   readValues(ap),readValues(bp),captureEnvironment(ap),captureEnvironment(bp),
   captureExtended(ap),captureExtended(bp)
  ]),85000);
  await runStage('stop configured profiles',()=>Promise.all([controller.stop('stage0_cfg_a'),controller.stop('stage0_cfg_b')]),60000);
  const ra=await runStage('restart configured A',()=>controller.launch(profile('stage0_cfg_a',idA.identity)),65000);
  const rb=await runStage('restart configured B',()=>controller.launch(profile('stage0_cfg_b',idB.identity)),65000);
  const rap=await runStage('new restart configured A',()=>ra.context.newPage(),25000);
  const rbp=await runStage('new restart configured B',()=>rb.context.newPage(),25000);
  await runStage('configured restart navigation',()=>Promise.all([rap.goto(server.url,{timeout:18000}),rbp.goto(server.url,{timeout:18000})]),30000);
  const [restartA,restartB,restartExposedA,restartExposedB]=await runStage('verify configured restart',()=>Promise.all([
   readValues(rap),readValues(rbp),captureEnvironment(rap),captureEnvironment(rbp)
  ]),50000);
  const observations=stageStorageResult(beforeB,afterA,afterB,restartA,restartB,tokens);
  report.checks={status:observations.pass?'PASS':'FAIL',...observations};
  const matchA=identityExpectationResult(idA.expectations,exposedA);
  const matchB=identityExpectationResult(idB.expectations,exposedB);
  const matchRestartA=identityExpectationResult(idA.expectations,restartExposedA);
  const matchRestartB=identityExpectationResult(idB.expectations,restartExposedB);
  report.identity={
   status:matchA.pass&&matchB.pass&&matchRestartA.pass&&matchRestartB.pass?'PASS':'FAIL',
   profileA:{expectations:idA.expectations,observed:exposedA,match:matchA,
    observedAfterRestart:restartExposedA,matchAfterRestart:matchRestartA},
   profileB:{expectations:idB.expectations,observed:exposedB,match:matchB,
    observedAfterRestart:restartExposedB,matchAfterRestart:matchRestartB},
   distinctFields:{
    timezone:exposedA.timezone!==exposedB.timezone,
    language:exposedA.language!==exposedB.language
   }
  };
  // Extended runtime points (Agent 5): reported per point with their own
  // statuses; WebGL vendor/renderer are compared against the pinned
  // expectations by the dedicated function. These results do NOT change
  // the identity/storage PASS semantics above.
  report.extended={
   status:'MEASURED',
   profileA:extendedA,profileB:extendedB,
   webglMatchA:webglExpectationResult(idA.expectations,
    extendedA.points['webgl.vendorRenderer']||{status:'BLOCKED'}),
   webglMatchB:webglExpectationResult(idB.expectations,
    extendedB.points['webgl.vendorRenderer']||{status:'BLOCKED'})
  };
 }catch(error){
  report.identity={status:'FAIL',errorType:error?.code||error?.name||'Error',
   reason:String(error.message||error).slice(0,280)};
  if(report.checks.status==='NOT_RUN')report.checks={status:'FAIL'};
 }finally{
  for(const id of ['stage0_cfg_a','stage0_cfg_b']){
   try{if(controller.contextFor(id))await runStage('cleanup '+id,()=>controller.stop(id),15000)}
   catch(error){cleanupError=String(error.message).slice(0,100)}
  }
  await runStage('close configured loopback',()=>server.close(),15000).catch(error=>{cleanupError=String(error.message).slice(0,100)});
  if(!cleanupError){
   try{fs.rmSync(root,{recursive:true,force:true,maxRetries:12,retryDelay:300})}
   catch(error){cleanupError=String(error.message).slice(0,100)}
  }
 }
 report.cleanup=cleanupError?'NEEDS_MANUAL_REVIEW':'PASS';
 const output=writeReport(report);
 console.log(JSON.stringify({classification:report.classification,
  identity:report.identity.status,storage:report.checks.status,
  proxy:report.network.proxy,dns:report.network.dns,webrtc:report.network.webrtc,
  cleanup:report.cleanup,report:output}));
 if(report.identity.status!=='PASS'||report.checks.status!=='PASS'||cleanupError)
  process.exitCode=2;
 stopDeadline();
}
run().catch(error=>{console.error('[Stage-0 config]',String(error.message||error));process.exitCode=2});
