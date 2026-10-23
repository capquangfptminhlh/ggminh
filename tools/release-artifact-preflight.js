#!/usr/bin/env node
'use strict';
/**
 * Verifies the actual EXE and every source/packaged Electron screenshot
 * downloaded from the SAME Windows CI run before creating a GitHub DRAFT.
 * No network, keys, customer data, tags, installs or publishing.
 */
const fs=require('node:fs');
const path=require('node:path');
const {expectedExeName,validateCaptureEvidence,CAPTURES,sha256}=
  require('./ci-release-evidence');
function readRegular(filename){
  const info=fs.lstatSync(filename);
  if(!info.isFile()||info.isSymbolicLink())throw Error('Expected regular artifact: '+path.basename(filename));
  return fs.readFileSync(filename);
}
function verify({assetsRoot,evidenceFile,uiRoot,sha,runId,pkg}={}){
  if(!pkg||!assetsRoot||!evidenceFile||!uiRoot||!sha||!runId)
    throw Error('EXE directory, evidence, screenshot directory, SHA and run ID required');
  const evidence=JSON.parse(readRegular(evidenceFile).toString('utf8'));
  if(evidence.schema!=='lhm.release.build-evidence.v1'||
     evidence.product!=='LHM Ads Browser'||evidence.version!==pkg.version||
     evidence.build?.commit!==sha||String(evidence.build?.runId)!==String(runId)||
     evidence.build?.platform!=='windows-latest'||evidence.build?.arch!=='x64'||
     evidence.build?.scope!=='automated_ci_only'||
     evidence.policy?.publicReleaseAuthorized!==false||
     evidence.policy?.independentWindowsGate3!=='NOT_VERIFIED_BY_CI'||
     evidence.policy?.ownerReleaseApprovalGate4!=='NOT_VERIFIED_BY_CI'||
     evidence.outcome!=='CI_BUILD_EVIDENCE_ONLY_NOT_COMMERCIAL_APPROVAL')
    throw Error('CI release provenance or preview-only policy mismatch');
  const exeName=expectedExeName(pkg);
  const installer=readRegular(path.join(assetsRoot,exeName));
  const meta=evidence.build.windowsInstaller;
  if(meta?.name!==exeName||meta.bytes!==installer.length||meta.sha256!==sha256(installer))
    throw Error('EXE artifact bytes/SHA-256 differ from CI evidence');
  validateCaptureEvidence(evidence.build);
  for(const capture of evidence.build.uiCaptures){
    for(const [place,filename] of [
      ['source',path.join(uiRoot,capture.name)],
      ['packaged',path.join(uiRoot,'packaged-ui',capture.name)]
    ]){
      const bytes=readRegular(filename);
      if(bytes.length!==capture[place].bytes||sha256(bytes)!==capture[place].sha256)
        throw Error('UI screenshot byte/SHA-256 mismatch: '+capture.name+' ('+place+')');
    }
  }
  return {sha,runId:String(runId),exe:exeName,installerSha256:sha256(installer),
    captureCount:CAPTURES.length,verifiedScreenshots:CAPTURES.length*2,
    verdict:'CI_BYTES_VERIFIED_ONLY_NOT_OWNER_ACCEPTANCE'};
}
if(require.main===module){
  try{
    if(process.argv.length!==5)throw Error('Usage: node tools/release-artifact-preflight.js EXE_DIR EVIDENCE_JSON UI_DIR');
    const result=verify({
      assetsRoot:path.resolve(process.argv[2]),
      evidenceFile:path.resolve(process.argv[3]),
      uiRoot:path.resolve(process.argv[4]),
      sha:process.env.VERIFIED_MAIN_SHA,runId:process.env.RUN_ID,
      pkg:require('../package.json')
    });
    console.log(JSON.stringify(result,null,2));
  }catch(e){console.error('DRAFT PRE-FLIGHT BLOCKED:',e.message);process.exitCode=1;}
}
module.exports={verify};
