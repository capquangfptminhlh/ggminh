'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {expectedExeName,produceReleaseEvidence,validateCaptureEvidence,CAPTURES}=require('../tools/ci-release-evidence');
const {verify:verifyDraftArtifacts}=require('../tools/release-artifact-preflight');
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
  'workspace-about-update-preview.png','workspace-customer-handoff-preview.png',
  'workspace-license-preview.png','workspace-fleet-triage-preview.png','workspace-agency-handoff-preview.png','workspace-profile-paging-preview.png'
];
try{
  fs.writeFileSync(path.join(root,name),Buffer.alloc(1024*1024+1,0x2b));
  fs.mkdirSync(path.join(root,'packaged-ui'));
  screenshotNames.forEach((file,index)=>{
    fs.writeFileSync(path.join(root,file),Buffer.alloc(10001,0x2b+index));
    fs.writeFileSync(path.join(root,'packaged-ui',file),Buffer.alloc(10002,0x2c+index));
  });
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
  const evidence=produceReleaseEvidence({dist:root,pkg,
    sha:'1'.repeat(40),runId:'39835712310'});
  assert.equal(evidence.build.windowsInstaller.sha256,hash);
  assert.equal(evidence.build.windowsInstaller.bytes,1024*1024+1);
  assert.equal(evidence.build.uiCaptureCount,12);
  assert.deepEqual(CAPTURES,screenshotNames);
  assert(validateCaptureEvidence(evidence.build));
  assert.equal(evidence.build.uiCaptures.length,12);
  assert.equal(evidence.build.uiCaptures[0].source.bytes,10001);
  assert.equal(evidence.build.uiCaptures[0].packaged.bytes,10002);
  // Catch the real regression: hiding an agency panel below the scroll fold
  // must not be accepted as a distinct UI screenshot.
  const fleetImage=path.join(root,'workspace-fleet-triage-preview.png');
  const agencyImage=path.join(root,'workspace-agency-handoff-preview.png');
  const agencyOriginal=fs.readFileSync(agencyImage);
  fs.copyFileSync(fleetImage,agencyImage);
  assert.throws(()=>produceReleaseEvidence({dist:root,pkg,
    sha:'1'.repeat(40),runId:'39835712310'}),/Duplicate Fleet\\/Agency/);
  fs.writeFileSync(agencyImage,agencyOriginal);
  const evidenceFile=path.join(root,'release-evidence.json');
  fs.writeFileSync(evidenceFile,JSON.stringify(evidence));
  const verifyArgs={assetsRoot:root,evidenceFile,uiRoot:root,
    sha:'1'.repeat(40),runId:'39835712310',pkg};
  const result=verifyDraftArtifacts(verifyArgs);
  assert.equal(result.verifiedScreenshots,24);
  assert.equal(result.verdict,'CI_BYTES_VERIFIED_ONLY_NOT_OWNER_ACCEPTANCE');
  // Retaining a signed EXE hash is meaningless if the screenshot evidence can
  // be replaced with different bytes under the same exact file names.
  const packagedOne=path.join(root,'packaged-ui',screenshotNames[0]);
  fs.writeFileSync(packagedOne,Buffer.alloc(10002,0x7e));
  assert.throws(()=>verifyDraftArtifacts(verifyArgs),/SHA-256 mismatch/);
  fs.writeFileSync(packagedOne,Buffer.alloc(10002,0x2c));
  const sourceOne=path.join(root,screenshotNames[0]);
  fs.writeFileSync(sourceOne,Buffer.alloc(10001,0x7e));
  assert.throws(()=>verifyDraftArtifacts(verifyArgs),/SHA-256 mismatch/);
  fs.writeFileSync(sourceOne,Buffer.alloc(10001,0x2b));
  const badEvidence={...evidence,build:{...evidence.build,uiCaptureCount:11}};
  fs.writeFileSync(evidenceFile,JSON.stringify(badEvidence));
  assert.throws(()=>verifyDraftArtifacts(verifyArgs),/capture evidence/);
  fs.writeFileSync(evidenceFile,JSON.stringify(evidence));
  assert.throws(()=>verifyDraftArtifacts({...verifyArgs,runId:'99999999'}),/provenance/);
  assert.throws(()=>verifyDraftArtifacts({...verifyArgs,sha:'f'.repeat(40)}),/provenance/);
  assert.equal(verifyDraftArtifacts(verifyArgs).verifiedScreenshots,24);
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
  assert(html.includes('id="lhm-open-ads-review"'), 'Advertiser QA quick action must stay discoverable');
  const adsUi=fs.readFileSync(path.join(__dirname,'../src/ui/adsLaunchGuard.js'),'utf8');
  assert(adsUi.includes("byId('lhm-open-ads-review')?.addEventListener('click', show)"));
  assert(css.includes('.lhm-commercial-quickaction'));
  const releaseWorkflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/prepare-draft-release.yml'),'utf8');
  assert(releaseWorkflow.includes('LHM-Release-Evidence-Windows'));
  assert(releaseWorkflow.includes('release-assets/release-evidence.json'));
  assert(releaseWorkflow.includes('--draft'), 'Never auto-publish commercial installer');
  assert(releaseWorkflow.includes('.build.uiCaptureCount == 12'),'Draft must require actual 12 UI captures');
  assert(!releaseWorkflow.includes('.build.uiCaptureCount == 11'),'Draft must not keep stale 11-image gate');
  assert(releaseWorkflow.includes('node tools/release-artifact-preflight.js'),'Draft must validate all downloaded bytes');
  assert(releaseWorkflow.includes('--name LHM-Workspace-UI-Preview'),'Draft must fetch actual UI artifact');

  assert.equal((html.match(/href="workspaceInteractions.css"/g)||[]).length,1);
  for(const id of ['modal-ads-launch-guard','modal-performance-lab','modal-launch-readiness','modal-app-about'])
    assert(css.includes('#'+id));
  assert(main.includes('[REDACTED FOR CI SCREENSHOT]'), 'Mask installation ID in public UI screenshots');
  console.log('LHM release evidence: exact installer SHA-256, twelve UI captures, strict preview-only claim and key privacy PASSED');
} finally {fs.rmSync(root,{recursive:true,force:true});}
