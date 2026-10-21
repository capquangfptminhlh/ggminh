'use strict';
/** Ten independent, non-browser CI audit lanes; NOT ten AI subagents. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {FIELDS,safeOptions,stageStorageResult}=require('./core');
const {SAFE_HEADERS,observedHeaders,compareHeaders}=require('./headers');
const {compareSnapshots,compareRestart}=require('./snapshot');
const {networkReview}=require('./network-review');
const {sealReport,verifySeal}=require('./report-integrity');
const {validateReport}=require('./report-gate');
const head=path.join(__dirname,'..');
const a=Object.fromEntries(FIELDS.map(k=>[k,'profile_A']));
const b=Object.fromEntries(FIELDS.map(k=>[k,'profile_B']));
const empty=Object.fromEntries(FIELDS.map(k=>[k,null]));
const sample={userAgent:'TestBrowser/1',platform:'Win32',language:'en-US',
 languages:['en-US'],hardwareConcurrency:4,screen:{width:1200,height:800,colorDepth:24},
 devicePixelRatio:1,timezone:'UTC',hasUserAgentData:false,isSecureContext:true};
const syntheticHeaders=()=>observedHeaders({method:'GET',headers:{
 'user-agent':'TestBrowser/1','accept-language':'en-US,en;q=0.8',
 cookie:'SYNTHETIC_SECRET_NEVER_LOG','authorization':'SYNTHETIC_SECRET_NEVER_LOG'
},socket:{remoteAddress:'127.0.0.1'}});
const report=()=>({classification:'LOCAL_STAGE0_DIAGNOSTIC_ONLY',
 concurrentProfiles:2,checks:{status:'PASS',pass:true,
 checks:stageStorageResult(empty,a,b,a,b,{a:'profile_A',b:'profile_B'}).checks},
 cleanup:'PASS',network:{proxy:'NOT_RUN',dns:'NOT_RUN',webrtc:'NOT_RUN',externalEgress:'NOT_RUN'},
 signedReleaseAcceptance:'NOT_RUN',installedClientAcceptance:'NOT_RUN'});
const tests={
 '01-hash-input':()=>{
  assert.throws(()=>safeOptions({LHM_CAMOUFOX_EXECUTABLE:'C:\\camoufox.exe',LHM_CAMOUFOX_EXE_SHA256:'bad'}),/digest/);
  assert.equal(safeOptions({LHM_CAMOUFOX_EXECUTABLE:'C:\\camoufox.exe',LHM_CAMOUFOX_EXE_SHA256:'A'.repeat(64)}).expectedSha256,'a'.repeat(64));
 },
 '02-storage-isolation':()=>{
  assert(stageStorageResult(empty,a,b,a,b,{a:'profile_A',b:'profile_B'}).pass);
  assert(!stageStorageResult({...empty,indexedDB:'profile_A'},a,b,a,b,{a:'profile_A',b:'profile_B'}).pass);
 },
 '03-restart-retention':()=>{
  assert(!stageStorageResult(empty,a,b,{...a,cacheStorage:null},b,{a:'profile_A',b:'profile_B'}).pass);
  assert(stageStorageResult(empty,a,b,a,b,{a:'profile_A',b:'profile_B'}).pass);
 },
 '04-browser-snapshot':()=>{
  assert(compareSnapshots(sample,sample).identical);
  assert.equal(compareSnapshots(sample,{...sample,timezone:'Asia/Ho_Chi_Minh'}).differenceCount,1);
  assert(compareRestart(sample,sample).identical);
 },
 '05-header-minimization':()=>{
  assert.equal(SAFE_HEADERS.includes('cookie'),false);
  assert.equal(SAFE_HEADERS.includes('authorization'),false);
  assert(!JSON.stringify(syntheticHeaders()).includes('SYNTHETIC_SECRET'));
 },
 '06-header-coherence':()=>{
  assert(compareHeaders(sample,syntheticHeaders()).userAgentHeaderMatchesNavigator);
  assert.equal(compareHeaders(sample,{...syntheticHeaders(),headers:{...syntheticHeaders().headers,'user-agent':'other'}}).alert,'CLIENT_SERVER_MISMATCH');
 },
 '07-network-evidence':()=>{
  assert.equal(networkReview().signoffReady,false);
  assert.throws(()=>networkReview({dns:{status:'PASS'}}),/premature/);
  assert.throws(()=>networkReview({proxy:{status:'OPERATOR_REPORTED'}}),/capture/);
 },
 '08-report-integrity':()=>{
  const sealed=sealReport(report());assert(verifySeal(sealed));
  assert(!verifySeal({...sealed,cleanup:'FAILED'}));
 },
 '09-evidence-gate':()=>{
  const valid=sealReport(report());assert(validateReport(valid).accepted);
  const invalid=sealReport({...report(),network:{...report().network,webrtc:'PASS'}});
  assert(!validateReport(invalid).accepted);
 },
 '10-release-boundary':()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(head,'package.json'),'utf8'));
  assert(pkg.build.files.includes('!stage0-measure/**'));
  assert(pkg.build.files.includes('!stage0-measure-results/**'));
  const workflow=fs.readFileSync(path.join(head,'.github','workflows','camoufox-upstream-smoke.yml'),'utf8');
  assert(workflow.includes('Stage-0 two-profile real Camoufox'));
  assert(workflow.includes('stage0-measure/validate-report.js'));
 }
};
const current=process.argv[2];if(!Object.prototype.hasOwnProperty.call(tests,current)){
 console.error('Use one named lane:',Object.keys(tests).join(','));process.exit(2);
}
try{tests[current]();console.log(JSON.stringify({lane:current,result:'PASS',browser:'NOT_STARTED',proxy:'NOT_RUN'}))}
catch(e){console.error('[Lane FAIL]',current,e);process.exitCode=2}
