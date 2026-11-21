'use strict';
// Evidence gate for storage-only synthetic Windows CI. This is not a browser
// fingerprint comparison, network leak measurement or product release gate.
//
// Two modes:
//  - default (candidate engine): every storage condition must PASS, including
//    crash durability. This is the gate for an engine LHM would distribute.
//  - --upstream-baseline: the unmodified upstream engine is known to keep
//    localStorage writes in memory for 5000 ms (Firefox kFlushTimeoutMs), so a
//    hard kill inside that window loses them. This mode still requires every
//    isolation condition to PASS and every crash check to show no cross-profile
//    effect and no loss in any other field; it reports the localStorage
//    durability result instead of hiding it. It never gates a release.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const REQUIRED=['baselineClassic','concurrentCrossWrite','crashRecovery','crashRecoveryIdleFlush',
 'crashRecoveryKillSweep',
 'dirSnapshotRestore','configBackupRestore','httpCache'];
const DURABILITY=['crashRecovery','crashRecoveryKillSweep'];
function commonChecks({report,commitSha,exeSha256}){
 assert.match(commitSha||'',/^[a-f0-9]{40}$/i,'Exact CI commit required');
 assert.match(exeSha256||'',/^[a-f0-9]{64}$/i,'Exact engine SHA-256 required');
 assert.equal(report?.classification,'LOCAL_STAGE0_ISOLATION_EXTENDED','Unexpected scope');
 assert.equal(report.platform,'win32','Windows evidence required');
 assert.equal(report.branchHead,commitSha,'CI commit mismatch');
 assert.equal(report.engine?.sha256,exeSha256.toLowerCase(),'Engine digest mismatch');
 const knownExe='1f1df2f8a2681d45dc2b37d24b75f45fc294ca0bb84f7f0dfdb987bc399cd331';
 if(exeSha256.toLowerCase()===knownExe){
  const expectedPrefs=require('../src/engine/camoufoxDurability').preferencesForEngine(exeSha256,report.engine?.manifestPayloadSha256);
  assert.ok(Object.keys(expectedPrefs).length,'Patched engine content mismatch');
  assert.deepEqual(report.engine?.requestedDurabilityPreferences,expectedPrefs,'Patched engine durability settings mismatch');
 }
 assert.equal(report.cleanup,'PASS','Synthetic cleanup incomplete');
 assert(['PASS','NOT_RUN'].includes(report.conditions?.faviconCache?.status),'faviconCache failed');
 for(const key of ['proxy','dns','webrtc','externalEgress'])
  assert.equal(report.network?.[key],'NOT_RUN','Unapproved network measurement: '+key);
 assert.equal(report.signedReleaseAcceptance,'NOT_RUN','Signing acceptance must not be claimed');
 assert.equal(report.installedClientAcceptance,'NOT_RUN','Installed acceptance must not be claimed');
 assert.equal(report.browserExposedValues,undefined,'Unexpected browser signal measurement');
 assert.equal(report.extendedEnvironment,undefined,'Unexpected browser signal measurement');
}
function verifyStorageReport({report,commitSha,exeSha256}={}){
 commonChecks({report,commitSha,exeSha256});
 for(const key of REQUIRED)assert.equal(report.conditions?.[key]?.status,'PASS',key+' not measured or failed');
 return {result:'PASS_STORAGE_ONLY',commitSha,engineSha256:exeSha256.toLowerCase(),
  signalComparison:'NOT_RUN',network:'NOT_RUN',releaseAcceptance:'NOT_RUN'};
}
function verifyUpstreamBaseline({report,commitSha,exeSha256}={}){
 commonChecks({report,commitSha,exeSha256});
 const c=report.conditions||{};
 for(const key of REQUIRED.filter(k=>!DURABILITY.includes(k)))
  assert.equal(c[key]?.status,'PASS',key+' not measured or failed');
 // crashRecovery: measured (PASS or FAIL), never errored; only localStorage of
 // the killed profile may revert; the other profile is never affected.
 const crash=c.crashRecovery;
 assert(['PASS','FAIL'].includes(crash?.status)&&crash.checks,'crashRecovery not measured');
 assert.equal(crash.profileFunctionalAfterReopen,true,'crashRecovery: profile unusable after reopen');
 for(const [field,check] of Object.entries(crash.checks)){
  assert.equal(check.bUnchangedByCrashOfA,true,'crashRecovery: other profile affected in '+field);
  if(field!=='localStorage')
   assert.equal(check.aMarkerIntactAfterCrash,true,'crashRecovery: '+field+' lost');
 }
 const sweep=c.crashRecoveryKillSweep;
 assert(['PASS','FAIL'].includes(sweep?.status)&&Array.isArray(sweep.samples)&&sweep.samples.length>0,
  'crashRecoveryKillSweep not measured');
 assert.equal(sweep.bUnchangedByKillsOfA,true,'kill sweep: other profile affected');
 assert.equal(sweep.profileFunctionalAfterReopen,true,'kill sweep: profile unusable after reopen');
 for(const s of sweep.samples.filter(x=>x.gated))
  for(const field of ['cookie','indexedDB'])
   assert.equal(s.fields?.[field],'last','kill sweep: '+field+' lost at '+s.offsetMs+' ms');
 const lsKept=sweep.samples.filter(s=>s.fields?.localStorage==='last').map(s=>s.offsetMs);
 return {result:'PASS_UPSTREAM_ISOLATION_BASELINE',commitSha,engineSha256:exeSha256.toLowerCase(),
  localStorageCrashDurability:crash.status==='PASS'&&sweep.status==='PASS'?'PASS':'FAIL',
  localStorageKeptAtOffsetsMs:lsKept,releaseGate:'NOT_APPLICABLE_UPSTREAM_ENGINE',
  signalComparison:'NOT_RUN',network:'NOT_RUN',releaseAcceptance:'NOT_RUN'};
}
if(require.main===module){
 try{
  const file=path.resolve(__dirname,'../stage0-measure-results/stage0-isolation-report.json');
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size<100||st.size>8*1024*1024)throw Error('Invalid isolation report');
  const verify=process.argv.includes('--upstream-baseline')?verifyUpstreamBaseline:verifyStorageReport;
  const result=verify({report:JSON.parse(fs.readFileSync(file,'utf8')),
   commitSha:process.env.GITHUB_SHA,exeSha256:process.env.LHM_CAMOUFOX_EXE_SHA256});
  console.log(JSON.stringify(result));
 }catch(error){console.error('Storage CI gate FAIL:',error.message);process.exitCode=1;}
}
module.exports={verifyStorageReport,verifyUpstreamBaseline};
