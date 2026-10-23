'use strict';
// Pure synthetic contract tests for the preflight gate. Never use fixtures to
// attest to a shipped, signed, installed or commercially approved application.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {evaluate,G3,DECISIONS,sha256}=require('../tools/commercial-release-gate');
const {createBuildInfo}=require('../tools/write-build-info');
const captures=[
 'workspace-preview.png','workspace-expanded-preview.png','workspace-command-preview.png',
 'workspace-engine-provider-preview.png','workspace-ads-guard-preview.png','workspace-performance-lab-preview.png',
 'workspace-about-update-preview.png','workspace-customer-handoff-preview.png','workspace-license-preview.png',
 'workspace-fleet-triage-preview.png','workspace-agency-handoff-preview.png','workspace-profile-paging-preview.png'];
const sha='a'.repeat(40),exeSha='b'.repeat(64);
const none=evaluate({}, {head:sha,version:'5.8.0'});
assert.equal(none.status,'NOT_READY');
assert.equal(none.approvedToPublish,false);
for(const gate of ['GATE1','GATE2','GATE3','GATE4','OWNER','PACKAGE','ENGINE'])
 assert.ok(none.blockers.some(b=>b.gate===gate),'missing evidence must block '+gate);
const malformed=evaluate({parseError:'not json'}, {head:sha,version:'5.8.0'});
assert.ok(malformed.blockers.some(b=>b.code==='EVIDENCE_UNREADABLE'));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-commercial-preflight-fixture-'));
try{
 const exe=path.join(dir,'synthetic-unsigned.exe');
 fs.writeFileSync(exe,Buffer.from('MZ\x00\x01 SYNTHETIC ONLY; not a real installer'));
 const digest=sha256(exe),engine='c'.repeat(64);
 const baseReport={classification:'LOCAL_STAGE0_DIAGNOSTIC_ONLY',branchHead:sha,
  browserExecutableSha256:engine,cleanup:'PASS',checks:{status:'PASS'}};
 const configReport={...baseReport,classification:'LOCAL_STAGE0_CONFIGURED_PROFILE_DIAGNOSTIC_ONLY',
  identity:{status:'PASS'}};
 const bf=path.join(dir,'baseline.json'),cf=path.join(dir,'configured.json');
 fs.writeFileSync(bf,JSON.stringify(baseReport));
 fs.writeFileSync(cf,JSON.stringify(configReport));
 const buildInfo=createBuildInfo({commit:sha,appVersion:'5.8.0',builtAt:'2026-10-22T00:00:00.000Z',
  environment:{GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'example/example',GITHUB_REF:'refs/heads/test',
   GITHUB_WORKFLOW:'Build Windows EXE',GITHUB_RUN_ID:'123456'}});
 const bi=path.join(dir,'build-info.json'),ci=path.join(dir,'release-evidence.json');
 fs.writeFileSync(bi,JSON.stringify(buildInfo));
 const ciReport={schema:'lhm.release.build-evidence.v1',version:'5.8.0',
  build:{commit:sha,runId:'123456',buildInfo,packagedBuildInfoSha256:sha256(bi),
   uiCaptureCount:12,uiCaptureNames:captures,uiCaptures:captures.map(name=>({name,
    source:{bytes:10001,sha256:engine},packaged:{bytes:10002,sha256:engine}})),
   windowsInstaller:{name:path.basename(exe),bytes:fs.statSync(exe).size,sha256:digest}},
  policy:{publicReleaseAuthorized:false},outcome:'CI_BUILD_EVIDENCE_ONLY_NOT_COMMERCIAL_APPROVAL'};
 fs.writeFileSync(ci,JSON.stringify(ciReport));
 const evidence={
  schema:1,targetVersion:'5.8.0',source:{sha},
  gate1:{status:'PASS',verifiedCommit:sha,testSteps:224,
   gitHubRun:'https://github.com/example/example/actions/runs/123456'},
  gate2:{status:'PASS',windowsCiRun:'https://github.com/example/example/actions/runs/124',
   baselineReport:bf,configuredReport:cf,camoufoxEngineSha256:engine},
  build:{status:'PASS',exePath:exe,exeSha256:digest,installerLabel:'Commercial',
   authenticodeStatus:'SIGNED_VALID',ciEvidencePath:ci,buildInfoPath:bi},
  engine:{distributionStatus:'SIGNED_APPROVED',enginePublisherVerified:true,
   licensedForDistribution:true,approvedOrigin:'Synthetic test fixture only',
   fontsDecision:'Synthetic approval fixture only'},
  gate3:{status:'PASS',machineWindowsVersion:'Windows 11 TEST ONLY',
   operator:'Synthetic QA test',testedExeSha256:digest,evidenceDir:dir,completedAt:'2026-10-22T01:00:00.000Z',
   checkpoints:Object.fromEntries(G3.map(k=>{
    const file=path.join(dir,'evidence-'+k+'.txt');
    fs.writeFileSync(file,'Synthetic fixture '+k+'; no production acceptance');
    return [k,{status:'PASS',ref:file,sha256:sha256(file)}];
   }))},
  decisions:{approvedBy:'Synthetic unit test',approvedAt:'2026-10-22T00:00:00Z',
   items:Object.fromEntries(DECISIONS.map(k=>[k,'synthetic-only']))},
  gate4:{status:'APPROVED',approvedBy:'Synthetic unit test',approvedAt:'2026-10-22T02:00:00.000Z',
   ownerApprovalForExactSha:true,sourceSha:sha,exeSha256:digest}
 };
 const structural=evaluate(evidence,{head:sha,version:'5.8.0'});
 assert.equal(structural.status,'READY_FOR_OWNER_FINAL_REVIEW',
  'completely populated synthetic records are eligible for human review only');
 assert.equal(structural.approvedToPublish,false,
  'even apparently complete structural evidence must NEVER publish by itself');
 const check=patch=>evaluate({...evidence,...patch},{head:sha,version:'5.8.0'});
 assert.ok(check({build:{...evidence.build,ciEvidencePath:null}}).blockers.some(x=>x.code==='BUILD_PROVENANCE_MISMATCH'));
 for(const field of ['enginePublisherVerified','licensedForDistribution'])
  assert.ok(check({engine:{...evidence.engine,[field]:'false'}}).blockers.some(x=>x.code==='ENGINE_DISTRIBUTION_PENDING'));
 for(const patch of [{sourceSha:'e'.repeat(40)},{exeSha256:'e'.repeat(64)},
  {approvedAt:'2026-10-22T00:00:00.000Z'},{approvedAt:'not-a-date'}])
  assert.ok(check({gate4:{...evidence.gate4,...patch}}).blockers.some(x=>x.code==='FINAL_OWNER_APPROVAL'));
 assert.ok(check({gate3:{...evidence.gate3,completedAt:null}}).blockers.some(x=>x.code==='FINAL_OWNER_APPROVAL'));
 for(const patch of [{commit:'e'.repeat(40)},{runId:'654321'},
  {windowsInstaller:{...ciReport.build.windowsInstaller,bytes:1}},
  {uiCaptures:undefined},{uiCaptureCount:11},{uiCaptureNames:captures.slice(1)},
  {uiCaptures:ciReport.build.uiCaptures.map(x=>({...x,packaged:{bytes:0,sha256:engine}}))},
  {uiCaptures:ciReport.build.uiCaptures.map(x=>({...x,name:captures[0]}))},
  {uiCaptures:ciReport.build.uiCaptures.map(x=>({...x,source:{bytes:10001,sha256:'bad'}}))},
  {uiCaptures:ciReport.build.uiCaptures.map(x=>({...x,source:{bytes:10001,sha256:[engine]}}))},
  {packagedBuildInfoSha256:'e'.repeat(64)}]){
  fs.writeFileSync(ci,JSON.stringify({...ciReport,build:{...ciReport.build,...patch}}));
  assert.ok(check({}).blockers.some(x=>x.code==='BUILD_PROVENANCE_MISMATCH'));
 }
 fs.writeFileSync(ci,JSON.stringify(ciReport));
 const previewExe=path.join(dir,'LHM-Preview-Setup.exe');
 fs.copyFileSync(exe,previewExe);
 assert.ok(check({build:{...evidence.build,exePath:previewExe}}).blockers.some(x=>x.code==='PREVIEW_LABEL'));
 const mismatch=evaluate({...evidence,source:{sha:'d'.repeat(40)}},{head:sha,version:'5.8.0'});
 assert.ok(mismatch.blockers.some(i=>i.code==='COMMIT_MISMATCH'));
 const falseGate2=evaluate({...evidence,gate2:{...evidence.gate2,camoufoxEngineSha256:exeSha}},
  {head:sha,version:'5.8.0'});
 assert.ok(falseGate2.blockers.some(i=>i.code==='ENGINE_MISMATCH'));
 const preview=evaluate({...evidence,build:{...evidence.build,installerLabel:'Preview'}},
  {head:sha,version:'5.8.0'});
 assert.ok(preview.blockers.some(i=>i.code==='PREVIEW_LABEL'));
 const tampered=evaluate({...evidence,build:{...evidence.build,exeSha256:exeSha}},
  {head:sha,version:'5.8.0'});
 assert.ok(tampered.blockers.some(i=>i.code==='EXE_DIGEST_UNVERIFIED'));
 const noOwner=evaluate({...evidence,gate4:{status:'NOT_RUN'}},
  {head:sha,version:'5.8.0'});
 assert.ok(noOwner.blockers.some(i=>i.gate==='GATE4'));
 const noG3=evaluate({...evidence,gate3:{...evidence.gate3,
  checkpoints:{...evidence.gate3.checkpoints,'G3-05B':{status:'NOT_RUN'}}}},
  {head:sha,version:'5.8.0'});
 assert.ok(noG3.blockers.some(i=>i.code==='CHECKPOINT_G3-05B'));
 const noRights=evaluate({...evidence,engine:{...evidence.engine,licensedForDistribution:false}},
  {head:sha,version:'5.8.0'});
 assert.ok(noRights.blockers.some(i=>i.code==='ENGINE_DISTRIBUTION_PENDING'));
 const missingPhoto=evaluate({...evidence,gate3:{...evidence.gate3,
   checkpoints:{...evidence.gate3.checkpoints,
    'G3-08':{status:'PASS',ref:'missing-photo.png',sha256:exeSha}}}},
   {head:sha,version:'5.8.0'});
 assert.ok(missingPhoto.blockers.some(i=>i.code==='EVIDENCE_INTEGRITY_G3-08'));
 const wrongDigest=evaluate({...evidence,gate3:{...evidence.gate3,
   checkpoints:{...evidence.gate3.checkpoints,
    'G3-09':{...evidence.gate3.checkpoints['G3-09'],sha256:exeSha}}}},
   {head:sha,version:'5.8.0'});
 assert.ok(wrongDigest.blockers.some(i=>i.code==='EVIDENCE_INTEGRITY_G3-09'));
 const traversal=evaluate({...evidence,gate3:{...evidence.gate3,
   checkpoints:{...evidence.gate3.checkpoints,
    'G3-11':{status:'PASS',ref:exe,sha256:digest}}}},
   {head:sha,version:'5.8.0'});
 // The fixture installer resides within the fixture evidence directory; this
 // is acceptable structurally but MUST NOT be treated as a real Gate 3 photo.
 assert.equal(traversal.approvedToPublish,false);
 const noDigest=evaluate({...evidence,gate3:{...evidence.gate3,
   checkpoints:{...evidence.gate3.checkpoints,
    'G3-12':{status:'PASS',ref:'evidence-G3-12.txt'}}}},
   {head:sha,version:'5.8.0'});
 assert.ok(noDigest.blockers.some(i=>i.code==='CHECKPOINT_G3-12'));
 const badRoot=evaluate({...evidence,gate3:{...evidence.gate3,evidenceDir:path.join(dir,'missing')}},
   {head:sha,version:'5.8.0'});
 assert.ok(badRoot.blockers.some(i=>i.code==='EVIDENCE_DIRECTORY_MISSING'));
 console.log('commercial-release-gate: PASS (synthetic only; default NOT_READY; never auto-publish)');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
