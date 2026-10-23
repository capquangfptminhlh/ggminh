'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {expectedExeName,produceReleaseEvidence}=require('../tools/ci-release-evidence');
const pkg=require('../package.json');
const name=expectedExeName(pkg);
assert.equal(name,'LHM-Ads-Browser-'+pkg.version+'-Preview-Setup-x64.exe');
assert.throws(()=>expectedExeName({...pkg,version:'bad'}),/version/);
assert.throws(()=>expectedExeName({...pkg,build:{nsis:{artifactName:'foo.exe'}}}),/naming/);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-release-evidence-'));
const screenshotNames=[
  'workspace-preview.png','workspace-expanded-preview.png',
  'workspace-command-preview.png','workspace-engine-provider-preview.png',
  'workspace-ads-guard-preview.png','workspace-performance-lab-preview.png',
  'workspace-about-update-preview.png','workspace-license-preview.png'
];
try{
  fs.writeFileSync(path.join(root,name),Buffer.alloc(1024*1024+1,0x2b));
  screenshotNames.forEach(file=>fs.writeFileSync(path.join(root,file),'synthetic unit-test marker'));
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
  const evidence=produceReleaseEvidence({dist:root,pkg,
    sha:'1'.repeat(40),runId:'39835712310'});
  assert.equal(evidence.build.windowsInstaller.sha256,hash);
  assert.equal(evidence.build.windowsInstaller.bytes,1024*1024+1);
  assert.equal(evidence.build.uiCaptureCount,8);
  assert.equal(evidence.outcome,'CI_BUILD_EVIDENCE_ONLY_NOT_COMMERCIAL_APPROVAL');
  assert.equal(evidence.policy.publicReleaseAuthorized,false);
  assert.equal(evidence.policy.independentWindowsGate3,'NOT_VERIFIED_BY_CI');
  assert.equal(evidence.policy.ownerReleaseApprovalGate4,'NOT_VERIFIED_BY_CI');
  assert.equal(evidence.policy.authenticodeRequired,false);
  assert.equal(evidence.policy.engineAndUpdateTrustMustRemainCryptographicallyVerified,true);
  fs.rmSync(path.join(root,'workspace-license-preview.png'));
  assert.throws(()=>produceReleaseEvidence({dist:root,pkg,
    sha:'1'.repeat(40),runId:'39835712310'}),/CI UI captures missing/);
  assert.throws(()=>produceReleaseEvidence({dist:root,pkg,
    sha:'not-a-real-commit',runId:'39835712310'}),/commit SHA/);
  const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/windows-exe.yml'),'utf8');
  assert(workflow.includes('node tools/ci-release-evidence.js'));
  assert(workflow.includes('LHM-Release-Evidence-Windows'));
  assert(workflow.includes('workspace-license-preview.png'));
  assert(workflow.includes('workspace-performance-lab-preview.png'));
  const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
  for(const img of screenshotNames){
    assert(main.includes("'"+img+"'"),'Actual Electron capture missing: '+img);
    assert(workflow.includes('"'+img+'"'),'Windows validation missing: '+img);
  }
  const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../src/ui/commercialPolish.css'),'utf8');
  assert(html.includes('href="commercialPolish.css"'));
  assert.equal((html.match(/href="workspaceInteractions.css"/g)||[]).length,1);
  for(const id of ['modal-ads-launch-guard','modal-performance-lab','modal-launch-readiness','modal-app-about'])
    assert(css.includes('#'+id));
  assert(main.includes('[REDACTED FOR CI SCREENSHOT]'), 'Mask installation ID in public UI screenshots');
  console.log('LHM release evidence: exact installer SHA-256, eight UI captures, strict preview-only claim and key privacy PASSED');
} finally {fs.rmSync(root,{recursive:true,force:true});}
