'use strict';
// Gate: two actual Windows Stage-0 JSON reports from the same pinned browser and
// Git checkout. This NEVER represents public egress, redistribution approval,
// site detection outcomes or installed customer-Windows acceptance.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const FILES=Object.freeze({
  baseline:'stage0-measure-results/stage0-local-report.json',
  configured:'stage0-measure-results/stage0-config-report.json'
});
const NOT_RUN_FIELDS=['proxy','dns','webrtc','externalEgress'];
function readRegular(root,name){
  const filename=path.resolve(root,name);
  if(!filename.startsWith(path.resolve(root)+path.sep))throw Error('Report outside project');
  const stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<100||stat.size>8*1024*1024)
    throw Error('Missing, linked or invalid Stage-0 report');
  return JSON.parse(fs.readFileSync(filename,'utf8'));
}
function verify({baseline,configured,commitSha,exeSha256}={}){
  assert.match(commitSha||'',/^[a-f0-9]{40}$/i,'Exact CI commit SHA required');
  assert.match(exeSha256||'',/^[a-f0-9]{64}$/i,'Real Camoufox EXE SHA-256 required');
  for(const [name,report,classification] of [
    ['baseline',baseline,'LOCAL_STAGE0_DIAGNOSTIC_ONLY'],
    ['configured',configured,'LOCAL_STAGE0_CONFIGURED_PROFILE_DIAGNOSTIC_ONLY']
  ]){
    assert.equal(report?.classification,classification,name+' scope mismatch');
    assert.equal(report.branchHead,commitSha,name+' commit mismatch');
    assert.equal(report.browserExecutableSha256,exeSha256.toLowerCase(),name+' EXE digest mismatch');
    assert.equal(report.concurrentProfiles,2,name+' expected two local profiles');
    assert.equal(report.temporarySyntheticProfiles,true,name+' must use synthetic profiles');
    assert.equal(report.checks?.status,'PASS',name+' storage isolation incomplete');
    assert.equal(report.checks?.pass,true,name+' storage observations do not all pass');
    assert.equal(report.cleanup,'PASS',name+' temporary data cleanup failed');
    assert.equal(report.signedReleaseAcceptance,'NOT_RUN',name+' must not assert signing approval');
    assert.equal(report.installedClientAcceptance,'NOT_RUN',name+' installed Windows test not completed');
    for(const key of NOT_RUN_FIELDS){
      assert.equal(report.network?.[key],'NOT_RUN',name+' network field must not claim unmeasured evidence');
    }
  }
  assert.equal(configured.identity?.status,'PASS','Pinned identity replay failure');
  assert.equal(configured.identity?.distinctFields?.timezone,true,'Two configured timezones must differ');
  assert.equal(configured.identity?.distinctFields?.language,true,'Two configured languages must differ');
  return {result:'PASS_LAB_ONLY',commitSha,engineSha256:exeSha256.toLowerCase(),
    checks:'two real Windows local Stage-0 reports bound to one engine and commit',
    network:'NOT_RUN',publisherAcceptance:'NOT_RUN',installedCustomerWindows:'NOT_RUN'};
}
function main(){
  const root=path.resolve(__dirname,'..');
  const result=verify({
    baseline:readRegular(root,FILES.baseline),
    configured:readRegular(root,FILES.configured),
    commitSha:process.env.GITHUB_SHA,
    exeSha256:process.env.LHM_CAMOUFOX_EXE_SHA256
  });
  console.log(JSON.stringify(result));
}
if(require.main===module){try{main()}catch(e){console.error('Camoufox report gate FAIL:',e.message);process.exitCode=1;}}
module.exports={verify};
