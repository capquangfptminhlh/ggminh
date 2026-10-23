'use strict';
/**
 * Deterministic, honest CI artifact provenance.
 * This does NOT assert owner physical-Windows Gate 3 or commercial approval.
 * No network, no signing keys, no license token or customer profile data.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const CAPTURES=Object.freeze([
  'workspace-preview.png','workspace-expanded-preview.png',
  'workspace-command-preview.png','workspace-engine-provider-preview.png',
  'workspace-ads-guard-preview.png','workspace-performance-lab-preview.png',
  'workspace-about-update-preview.png','workspace-customer-handoff-preview.png',
  'workspace-license-preview.png','workspace-fleet-triage-preview.png',
  'workspace-agency-handoff-preview.png','workspace-profile-paging-preview.png'
]);
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function validateCaptureEvidence(build){
  if(build?.uiCaptureCount!==CAPTURES.length||
     JSON.stringify(build.uiCaptureNames)!==JSON.stringify(CAPTURES)||
     !Array.isArray(build.uiCaptures)||build.uiCaptures.length!==CAPTURES.length)
    throw Error('Incomplete CI capture evidence');
  for(let i=0;i<CAPTURES.length;i++){
    const capture=build.uiCaptures[i];
    if(capture?.name!==CAPTURES[i])throw Error('Unexpected CI capture name/order');
    for(const place of ['source','packaged']){
      const entry=capture[place];
      if(!Number.isSafeInteger(entry?.bytes)||entry.bytes<10000||
         typeof entry?.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256))
        throw Error('Invalid CI capture byte count or SHA-256');
    }
  }
  return true;
}
function captureDigest(filename){
  const info=fs.statSync(filename);
  if(!info.isFile()||info.size<10000)
    throw Error('Missing or undersized CI UI capture: '+path.basename(filename));
  return {bytes:info.size,sha256:sha256(fs.readFileSync(filename))};
}
function expectedExeName(pkg){
  const version=String(pkg.version||'');
  if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid package version');
  const template=pkg.build?.nsis?.artifactName;
  if(typeof template!=='string'||!template.includes('\${version}'))
    throw Error('Unknown Windows artifact naming policy');
  const name=template.replaceAll('\${version}',version)
    .replaceAll('\${arch}','x64').replaceAll('\${ext}','exe');
  if(!/^[A-Za-z0-9._-]+\.exe$/.test(name))throw Error('Unsafe generated EXE name');
  return name;
}
function produceReleaseEvidence({dist,pkg,sha,runId,files}){
  if(!dist||!path.isAbsolute(dist))throw Error('Absolute dist path required');
  if(!sha||!/^[0-9a-f]{40}$/.test(sha))throw Error('Require exact GitHub commit SHA');
  if(!runId||!/^\d{6,18}$/.test(String(runId)))throw Error('Require GitHub workflow run ID');
  const exe=expectedExeName(pkg);
  const exePath=path.join(dist,exe);
  if(!fs.statSync(exePath).isFile())throw Error('Installer was not produced');
  const size=fs.statSync(exePath).size;
  if(size<1024*1024)throw Error('Installer is implausibly small');
  const digest=crypto.createHash('sha256').update(fs.readFileSync(exePath)).digest('hex');
  const present=new Set(files||fs.readdirSync(dist));
  const captures=CAPTURES;
  const absent=captures.filter(name=>!present.has(name));
  if(absent.length)throw Error('CI UI captures missing: '+absent.join(', '));
  const uiCaptures=captures.map(name=>({
    name,
    source:captureDigest(path.join(dist,name)),
    packaged:captureDigest(path.join(dist,'packaged-ui',name))
  }));
  validateCaptureEvidence({
    uiCaptureCount:captures.length,uiCaptureNames:captures,uiCaptures
  });
  return {
    schema:'lhm.release.build-evidence.v1',
    product:'LHM Ads Browser',
    version:pkg.version,
    build:{commit:sha,runId:String(runId),platform:'windows-latest',arch:'x64',
      windowsInstaller:{name:exe,bytes:size,sha256:digest},
      uiCaptureNames:captures,uiCaptureCount:captures.length,
      uiCaptures,
      scope:'automated_ci_only'},
    policy:{
      authenticodeRequired:false,
      installerSha256Recorded:true,
      engineAndUpdateTrustMustRemainCryptographicallyVerified:true,
      independentWindowsGate3:'NOT_VERIFIED_BY_CI',
      ownerReleaseApprovalGate4:'NOT_VERIFIED_BY_CI',
      hostedPaymentsOrLicenseAuthority:'NOT_VERIFIED_BY_CI',
      publicReleaseAuthorized:false
    },
    outcome:'CI_BUILD_EVIDENCE_ONLY_NOT_COMMERCIAL_APPROVAL'
  };
}
function main(){
  const pkg=require('../package.json');
  const dist=path.resolve(process.argv[2]||'dist');
  const out=path.resolve(process.argv[3]||path.join(dist,'release-evidence.json'));
  const report=produceReleaseEvidence({
    dist,pkg,sha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID
  });
  if(!out.startsWith(dist+path.sep))throw Error('Release evidence must remain inside dist');
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',mode:0o600});
  console.log('CI release evidence: '+report.build.windowsInstaller.name+
    ' SHA-256 '+report.build.windowsInstaller.sha256+
    '; commercial gate 3/4 NOT_VERIFIED');
}
if(require.main===module){
  try{main();}catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={expectedExeName,produceReleaseEvidence,validateCaptureEvidence,CAPTURES,sha256};
