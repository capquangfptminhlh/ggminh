'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawnSync}=require('child_process');

const toolPath=path.join(__dirname,'..','tools','windows-clean-install-evidence.js');

function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'lhm-clean-install-'));}
function buildFixture(root,label,commit,runId,version='5.8.0'){
 const name=`LHM-Ads-Browser-${version}-Preview-Setup-x64.exe`;
 const bytes=Buffer.from(`synthetic-${label}-installer-bytes`.repeat(32));
 const installer=path.join(root,name);
 fs.writeFileSync(installer,bytes);
 const evidence={
  schema:'lhm.release.build-evidence.v1',product:'LHM Ads Browser',version,
  build:{
   commit,runId:String(runId),platform:'windows-latest',arch:'x64',
   windowsInstaller:{name,bytes:bytes.length,sha256:sha(bytes)},
   uiCaptureNames:[],uiCaptureCount:12,uiCaptures:[],scope:'automated_ci_only'
  },
  policy:{
   authenticodeRequired:false,installerSha256Recorded:true,
   engineAndUpdateTrustMustRemainCryptographicallyVerified:true,
   independentWindowsGate3:'NOT_VERIFIED_BY_CI',
   ownerReleaseApprovalGate4:'NOT_VERIFIED_BY_CI',
   hostedPaymentsOrLicenseAuthority:'NOT_VERIFIED_BY_CI',
   publicReleaseAuthorized:false
  },
  outcome:'CI_BUILD_EVIDENCE_ONLY_NOT_COMMERCIAL_APPROVAL'
 };
 const evidenceFile=path.join(root,`${label}-evidence.json`);
 fs.writeFileSync(evidenceFile,JSON.stringify(evidence));
 return {installer,evidenceFile,evidence,name,bytes};
}

const root=temp();
try{
 const commit='1'.repeat(40),runId='43176842323';
 const fixture=buildFixture(root,'candidate',commit,runId);
 const mod=require(toolPath);
 const verified=mod.verifyBuildArtifact({
  installerFile:fixture.installer,evidenceFile:fixture.evidenceFile,
  expectedCommit:commit,expectedRunId:runId,expectedName:fixture.name
 });
 assert.strictEqual(verified.sha256,fixture.evidence.build.windowsInstaller.sha256);
 assert.strictEqual(verified.bytes,fixture.bytes.length);
 assert.strictEqual(verified.version,'5.8.0');

 fs.appendFileSync(fixture.installer,'tampered');
 assert.throws(()=>mod.verifyBuildArtifact({
  installerFile:fixture.installer,evidenceFile:fixture.evidenceFile,
  expectedCommit:commit,expectedRunId:runId
 }),/SHA-256|bytes/);
 fs.writeFileSync(fixture.installer,fixture.bytes);

 for(const mutate of [
  x=>x.build.commit='2'.repeat(40),
  x=>x.build.runId='9',
  x=>x.policy.publicReleaseAuthorized=true,
  x=>x.outcome='APPROVED',
  x=>x.unexpected=true
 ]){
  const changed=JSON.parse(JSON.stringify(fixture.evidence));
  mutate(changed);
  fs.writeFileSync(fixture.evidenceFile,JSON.stringify(changed));
  assert.throws(()=>mod.verifyBuildArtifact({
   installerFile:fixture.installer,evidenceFile:fixture.evidenceFile,
   expectedCommit:commit,expectedRunId:runId
  }),/evidence|commit|run|authorized|outcome|field/i);
 }
 fs.writeFileSync(fixture.evidenceFile,JSON.stringify(fixture.evidence));
 const cli=spawnSync(process.execPath,[
  toolPath,'verify-build','--installer',fixture.installer,
  '--evidence',fixture.evidenceFile,'--commit',commit,'--run-id',runId,
  '--expected-name',fixture.name
 ],{encoding:'utf8'});
 assert.strictEqual(cli.status,0,cli.stderr);
 assert.strictEqual(cli.stderr,'');
 assert.strictEqual(JSON.parse(cli.stdout).sha256,
  fixture.evidence.build.windowsInstaller.sha256);
 console.log('Windows clean-install exact artifact verification PASS');
}finally{
 fs.rmSync(root,{recursive:true,force:true});
}
