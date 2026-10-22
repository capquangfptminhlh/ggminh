'use strict';
/**
 * Stage-0 configured-profile measurement — LINUX REHEARSAL DRIVER
 * (Agent R2, Wave R release-prep).
 *
 * Why this file exists: `stage0-measure/run-config.js` — the script the
 * Windows CI smoke workflow runs for the configured measurement — is
 * Windows-only BY CONSTRUCTION. Its run() refuses every non-win32 host
 * (`Real Camoufox Stage-0 measurement requires Windows`) and then also
 * requires the executable basename to be `camoufox.exe`. On Linux it is
 * therefore NOT_RUN by design; no local run of the file itself can
 * prove or disprove the pipeline it orchestrates.
 *
 * This driver rehearses that pipeline end-to-end on the real Linux
 * Camoufox engine, so that the only remaining unknown is the Windows
 * CI runner itself. It is a deliberate, minimal port of run-config.js:
 *
 * IDENTICAL to run-config.js:
 *  - profile shape, controller construction (CamoufoxPlaywrightController
 *    with a verifier resolving the approved executable, enabled:true,
 *    labApproved:false), identityApplied assertions;
 *  - identity loading/validation via validateStoredIdentity and the
 *    A/B distinctness requirement (timezone AND language must differ);
 *  - the loopback probe page and the storage write/read protocol
 *    (cookie + localStorage + IndexedDB + Cache Storage markers),
 *    compared by core.stageStorageResult;
 *  - environment capture compared by core.identityExpectationResult,
 *    before AND after a stop/relaunch restart leg;
 *  - the extended probe (core.extendedProbe/summarizeProbe) and the
 *    WebGL comparison via core.webglExpectationResult;
 *  - executable discipline: absolute path, regular file, not a
 *    symlink, SHA-256 must equal LHM_CAMOUFOX_EXE_SHA256;
 *  - report shape and the NOT_RUN semantics for network/signed/installed
 *    acceptance; exit code 2 unless identity AND storage both PASS.
 *
 * DIFFERENT (the whole point of the rehearsal; recorded in the report):
 *  - host platform gate accepts linux instead of win32;
 *  - executable basename must be `camoufox` or `camoufox-bin` (the
 *    Linux binary names) instead of `camoufox.exe`;
 *  - the controller ALSO hard-requires basename `camoufox.exe` on every
 *    platform (CamoufoxPlaywrightController.js, launch()), so — exactly
 *    like the repo's own Linux harnesses (run-isolation.js,
 *    run-runtime-egress-observation.js) — the digest-verified real
 *    binary is shimmed to the controller through a symlink named
 *    `camoufox.exe` inside the temp root. The SHA-256 check runs on the
 *    real target; the report binds both paths. On Windows CI no shim
 *    exists or is needed: the executable really is camoufox.exe;
 *  - report file is stage0-config-rehearsal-report.json and carries
 *    rehearsal metadata binding it to run-config.js.
 *
 * Usage (from repo root, normally via rehearse-configured-measure.sh):
 *   LHM_CAMOUFOX_EXECUTABLE=/abs/path/camoufox-bin \
 *   LHM_CAMOUFOX_EXE_SHA256=<approved sha256> \
 *   LHM_STAGE0_IDENTITY_A=/path/identity-a.json \
 *   LHM_STAGE0_IDENTITY_B=/path/identity-b.json \
 *   xvfb-run -a node stage0-measure/run-config-rehearsal.js
 *
 * NEVER implies signed installed application, IP leak prevention, or
 * unlinkability. Synthetic profiles only.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto'),http=require('node:http');
const {spawnSync}=require('node:child_process');
const {safeOptions,stageStorageResult,digestFile,identityExpectationResult,
 extendedProbe,summarizeProbe,webglExpectationResult}=require('./core');
const {CamoufoxPlaywrightController}=require('../src/engine/CamoufoxPlaywrightController');
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
 const file=path.join(dir,'stage0-config-rehearsal-report.json');
 fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 return file;
}
async function run(){
 if(process.platform!=='linux')
  throw Error('Rehearsal driver is Linux-only; use run-config.js on Windows');
 const {executable,expectedSha256}=safeOptions();
 const base=path.basename(executable).toLowerCase();
 if(!path.isAbsolute(executable)||!['camoufox','camoufox-bin'].includes(base))
  throw Error('Approved Linux Camoufox executable must be an absolute camoufox/camoufox-bin path');
 const stat=fs.lstatSync(executable);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('Rejecting linked or non-file Camoufox executable');
 const actual=digestFile(executable);
 if(actual!==expectedSha256)throw Error('Camoufox executable SHA-256 did not match approved reference');
 const idA=loadIdentity(process.env,'LHM_STAGE0_IDENTITY_A');
 const idB=loadIdentity(process.env,'LHM_STAGE0_IDENTITY_B');
 if(idA.expectations.timezone===idB.expectations.timezone||
    idA.expectations.language===idB.expectations.language)
  throw Error('The two generated identities must differ in timezone and language');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-stage0-config-rehearsal-'));
 const server=await serveLoopback();
 // Controller basename-gate adaptation (see header): shim the verified
 // real binary through a `camoufox.exe` symlink inside the temp root.
 let controllerExecutable=executable;
 if(path.basename(executable).toLowerCase()!=='camoufox.exe'){
  const shimDir=path.join(root,'exe-shim');
  fs.mkdirSync(shimDir,{recursive:true});
  controllerExecutable=path.join(shimDir,'camoufox.exe');
  fs.symlinkSync(executable,controllerExecutable);
 }
 const verifier={resolve:engine=>{assert.equal(engine,'camoufox');return controllerExecutable;}};
 const controller=new CamoufoxPlaywrightController(root,{
  verifier,enabled:true,labApproved:false
 });
 const tokens={a:crypto.randomBytes(16).toString('hex'),b:crypto.randomBytes(16).toString('hex')};
 let cleanupError=null;
 const report={
  classification:'LOCAL_STAGE0_CONFIGURED_PROFILE_REHEARSAL_ONLY',
  rehearsalOf:'stage0-measure/run-config.js (Windows CI configured measurement)',
  differencesFromCiScript:[
   'host platform gate: linux instead of win32',
   'executable basename: camoufox/camoufox-bin instead of camoufox.exe',
   'controller reached through a camoufox.exe symlink shim to the digest-verified real binary (controller basename gate; repo Linux-harness precedent)',
   'report filename: stage0-config-rehearsal-report.json'],
  executedAt:new Date().toISOString(),
  branchHead:currentHead(),
  hostPlatform:process.platform,
  browserExecutableSha256:actual,
  browserExecutable:executable,
  controllerExecutable:controllerExecutable,
  driver:'CamoufoxPlaywrightController + playwright-core.firefox',
  temporarySyntheticProfiles:true,concurrentProfiles:2,
  identity:{status:'NOT_RUN'},
  extended:{status:'NOT_RUN'},
  checks:{status:'NOT_RUN'},
  network:{proxy:'NOT_RUN',dns:'NOT_RUN',webrtc:'NOT_RUN',externalEgress:'NOT_RUN'},
  signedReleaseAcceptance:'NOT_RUN',installedClientAcceptance:'NOT_RUN',
  caveat:'Matching a pinned identity at a local origin does not prove websites cannot associate profiles'
 };
 try{
  const a=await controller.launch(profile('stage0_cfg_a',idA.identity));
  const b=await controller.launch(profile('stage0_cfg_b',idB.identity));
  assert.equal(a.info.identityApplied,true,'profile A identity was not applied');
  assert.equal(b.info.identityApplied,true,'profile B identity was not applied');
  const ap=await a.context.newPage(),bp=await b.context.newPage();
  await Promise.all([ap.goto(server.url),bp.goto(server.url)]);
  await writeValues(ap,tokens.a);
  const beforeB=await readValues(bp);
  await writeValues(bp,tokens.b);
  const [afterA,afterB,exposedA,exposedB,extendedA,extendedB]=await Promise.all([
   readValues(ap),readValues(bp),captureEnvironment(ap),captureEnvironment(bp),
   captureExtended(ap),captureExtended(bp)
  ]);
  await Promise.all([controller.stop('stage0_cfg_a'),controller.stop('stage0_cfg_b')]);
  const ra=await controller.launch(profile('stage0_cfg_a',idA.identity));
  const rb=await controller.launch(profile('stage0_cfg_b',idB.identity));
  const rap=await ra.context.newPage(),rbp=await rb.context.newPage();
  await Promise.all([rap.goto(server.url),rbp.goto(server.url)]);
  const [restartA,restartB,restartExposedA,restartExposedB]=await Promise.all([
   readValues(rap),readValues(rbp),captureEnvironment(rap),captureEnvironment(rbp)
  ]);
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
  // Extended runtime points: reported per point with their own
  // statuses; WebGL vendor/renderer are compared against the pinned
  // expectations by the dedicated function. These results do NOT change
  // the identity/storage PASS semantics above. (Same rule as run-config.js.)
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
 console.log(JSON.stringify({classification:report.classification,
  identity:report.identity.status,storage:report.checks.status,
  proxy:report.network.proxy,dns:report.network.dns,webrtc:report.network.webrtc,
  cleanup:report.cleanup,report:output}));
 if(report.identity.status!=='PASS'||report.checks.status!=='PASS'||cleanupError)
  process.exitCode=2;
}
run().catch(error=>{console.error('[Stage-0 config rehearsal]',String(error.message||error));process.exitCode=2});
