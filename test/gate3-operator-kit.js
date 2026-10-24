'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const os=require('node:os'),path=require('node:path');
const {makeKit,digest}=require('../tools/create-gate3-operator-kit');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-gate3-operator-fixture-'));
try{
 const dist=path.join(root,'dist');fs.mkdirSync(dist);
 const filename='LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe';
 const exe=path.join(dist,filename);
 fs.writeFileSync(exe,Buffer.alloc(1048578,73));
 const sha=digest(exe),commit='a'.repeat(40),runId='40099918629';
 const evidence={
  schema:'lhm.release.build-evidence.v1',version:'5.8.0',
  build:{commit,runId,platform:'windows-latest',arch:'x64',scope:'automated_ci_only',
   uiCaptureCount:12,windowsInstaller:{name:filename,bytes:fs.statSync(exe).size,sha256:sha}},
  policy:{authenticodeRequired:false,publicReleaseAuthorized:false,
   independentWindowsGate3:'NOT_VERIFIED_BY_CI',ownerReleaseApprovalGate4:'NOT_VERIFIED_BY_CI'},
  outcome:'CI_BUILD_EVIDENCE_ONLY_NOT_COMMERCIAL_APPROVAL'
 };
 const collector=path.join(__dirname,'../tools/collect-windows-gate3.ps1');
 const kit=path.join(root,'gate3-kit');
 const result=makeKit({evidence,dist,out:kit,collector});
 assert.equal(result.sha256,sha);
 assert.deepEqual(fs.readdirSync(kit).sort(),
  ['README.md','Start-Gate3.ps1','build-identity.json','collect-windows-gate3.ps1'].sort());
 const wrapper=fs.readFileSync(path.join(kit,'Start-Gate3.ps1'),'utf8');
 assert(wrapper.includes(sha)&&wrapper.includes(commit)&&wrapper.includes(runId));
 assert(!wrapper.includes('Run anyway')&&!wrapper.includes('ExecutionPolicy Bypass'));
 const ref=JSON.parse(fs.readFileSync(path.join(kit,'build-identity.json'),'utf8'));
 assert.equal(ref.gate3,'NOT_RUN');assert.equal(ref.gate4,'NOT_APPROVED');
 assert.equal(ref.authenticodeRequired,false);
 assert.throws(()=>makeKit({evidence,dist,out:kit,collector}),/already exists/);
 const changed={...evidence,build:{...evidence.build,windowsInstaller:{...evidence.build.windowsInstaller,
  sha256:'b'.repeat(64)}}};
 assert.throws(()=>makeKit({evidence:changed,dist,out:path.join(root,'wrong-sha'),collector}),/SHA-256/);
 assert(!fs.existsSync(path.join(root,'wrong-sha')));
 const badPolicy={...evidence,policy:{...evidence.policy,publicReleaseAuthorized:true}};
 assert.throws(()=>makeKit({evidence:badPolicy,dist,out:path.join(root,'wrong-policy'),collector}),/Invalid build-only/);
 assert(!fs.existsSync(path.join(root,'wrong-policy')));
 const badFilename={...evidence,build:{...evidence.build,windowsInstaller:{...evidence.build.windowsInstaller,
  name:'malicious.exe'}}};
 assert.throws(()=>makeKit({evidence:badFilename,dist,out:path.join(root,'bad-filename'),collector}),/Invalid exact/);
 console.log('Gate3 exact CI-bound operator kit PASS on synthetic EXE; no commercial acceptance asserted');
}finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:150})}
