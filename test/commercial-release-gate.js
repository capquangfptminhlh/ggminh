'use strict';
// Pure synthetic contract tests for the preflight gate. Never use fixtures to
// attest to a shipped, signed, installed or commercially approved application.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {evaluate,G3,DECISIONS,sha256}=require('../tools/commercial-release-gate');
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
 const evidence={
  schema:1,targetVersion:'5.8.0',source:{sha},
  gate1:{status:'PASS',verifiedCommit:sha,testSteps:224,
   gitHubRun:'https://github.com/example/example/actions/runs/123'},
  gate2:{status:'PASS',windowsCiRun:'https://github.com/example/example/actions/runs/124',
   baselineReport:bf,configuredReport:cf,camoufoxEngineSha256:engine},
  build:{status:'PASS',exePath:exe,exeSha256:digest,installerLabel:'Commercial',
   authenticodeStatus:'SIGNED_VALID'},
  engine:{distributionStatus:'SIGNED_APPROVED',enginePublisherVerified:true,
   licensedForDistribution:true,approvedOrigin:'Synthetic test fixture only',
   fontsDecision:'Synthetic approval fixture only'},
  gate3:{status:'PASS',machineWindowsVersion:'Windows 11 TEST ONLY',
   operator:'Synthetic QA test',testedExeSha256:digest,evidenceDir:dir,
   checkpoints:Object.fromEntries(G3.map(k=>[k,{status:'PASS',ref:'synthetic/'+k}]))},
  decisions:{approvedBy:'Synthetic unit test',approvedAt:'2026-10-22T00:00:00Z',
   items:Object.fromEntries(DECISIONS.map(k=>[k,'synthetic-only']))},
  gate4:{status:'APPROVED',approvedBy:'Synthetic unit test',approvedAt:'2026-10-22T00:00:00Z',
   ownerApprovalForExactSha:true}
 };
 const structural=evaluate(evidence,{head:sha,version:'5.8.0'});
 assert.equal(structural.status,'READY_FOR_OWNER_FINAL_REVIEW',
  'completely populated synthetic records are eligible for human review only');
 assert.equal(structural.approvedToPublish,false,
  'even apparently complete structural evidence must NEVER publish by itself');
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
 console.log('commercial-release-gate: PASS (synthetic only; default NOT_READY; never auto-publish)');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
