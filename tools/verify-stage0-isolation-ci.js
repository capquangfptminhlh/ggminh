'use strict';
// Evidence gate for storage-only synthetic Windows CI. This is not a browser
// fingerprint comparison, network leak measurement or product release gate.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const REQUIRED=['baselineClassic','concurrentCrossWrite','crashRecovery','crashRecoveryIdleFlush',
 'dirSnapshotRestore','configBackupRestore','httpCache'];
function verifyStorageReport({report,commitSha,exeSha256}={}){
 assert.match(commitSha||'',/^[a-f0-9]{40}$/i,'Exact CI commit required');
 assert.match(exeSha256||'',/^[a-f0-9]{64}$/i,'Exact engine SHA-256 required');
 assert.equal(report?.classification,'LOCAL_STAGE0_ISOLATION_EXTENDED','Unexpected scope');
 assert.equal(report.platform,'win32','Windows evidence required');
 assert.equal(report.branchHead,commitSha,'CI commit mismatch');
 assert.equal(report.engine?.sha256,exeSha256.toLowerCase(),'Engine digest mismatch');
 assert.equal(report.cleanup,'PASS','Synthetic cleanup incomplete');
 for(const key of REQUIRED)assert.equal(report.conditions?.[key]?.status,'PASS',key+' not measured or failed');
 assert(['PASS','NOT_RUN'].includes(report.conditions?.faviconCache?.status),'faviconCache failed');
 for(const key of ['proxy','dns','webrtc','externalEgress'])
  assert.equal(report.network?.[key],'NOT_RUN','Unapproved network measurement: '+key);
 assert.equal(report.signedReleaseAcceptance,'NOT_RUN','Signing acceptance must not be claimed');
 assert.equal(report.installedClientAcceptance,'NOT_RUN','Installed acceptance must not be claimed');
 assert.equal(report.browserExposedValues,undefined,'Unexpected browser signal measurement');
 assert.equal(report.extendedEnvironment,undefined,'Unexpected browser signal measurement');
 return {result:'PASS_STORAGE_ONLY',commitSha,engineSha256:exeSha256.toLowerCase(),
  signalComparison:'NOT_RUN',network:'NOT_RUN',releaseAcceptance:'NOT_RUN'};
}
if(require.main===module){
 try{
  const file=path.resolve(__dirname,'../stage0-measure-results/stage0-isolation-report.json');
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size<100||st.size>8*1024*1024)throw Error('Invalid isolation report');
  const result=verifyStorageReport({report:JSON.parse(fs.readFileSync(file,'utf8')),
   commitSha:process.env.GITHUB_SHA,exeSha256:process.env.LHM_CAMOUFOX_EXE_SHA256});
  console.log(JSON.stringify(result));
 }catch(error){console.error('Storage CI gate FAIL:',error.message);process.exitCode=1;}
}
module.exports={verifyStorageReport};
