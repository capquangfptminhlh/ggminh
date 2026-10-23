'use strict';
/**
 * Deterministic, honest CI artifact provenance.
 * This does NOT assert owner physical-Windows Gate 3 or commercial approval.
 * No network, no signing keys, no license token or customer profile data.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {validateBuildInfo,readBuildInfo}=require('./write-build-info');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const CAPTURES=Object.freeze([
  'workspace-preview.png','workspace-expanded-preview.png',
  'workspace-command-preview.png','workspace-engine-provider-preview.png',
  'workspace-ads-guard-preview.png','workspace-performance-lab-preview.png',
  'workspace-about-update-preview.png','workspace-customer-handoff-preview.png',
  'workspace-license-preview.png','workspace-fleet-triage-preview.png','workspace-agency-handoff-preview.png','workspace-profile-paging-preview.png'
]);
function validateCaptureEvidence(build){
  if(build?.uiCaptureCount!==CAPTURES.length||
     JSON.stringify(build?.uiCaptureNames)!==JSON.stringify(CAPTURES)||
     !Array.isArray(build?.uiCaptures)||build.uiCaptures.length!==CAPTURES.length)
    throw Error('Incomplete CI capture evidence');
  for(const [index,item] of build.uiCaptures.entries()){
    if(item?.name!==CAPTURES[index])throw Error('Unexpected CI capture name/order');
    for(const source of ['source','packaged']){
      if(!Number.isSafeInteger(item[source]?.bytes)||item[source].bytes<10000||
         !/^[0-9a-f]{64}$/.test(item[source]?.sha256||''))
        throw Error('Invalid CI capture size/digest');
    }
  }
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
function produceReleaseEvidence({dist,pkg,sha,runId,buildInfo,packagedBuildInfo}){
  if(!dist||!path.isAbsolute(dist))throw Error('Absolute dist path required');
  if(!sha||!/^[0-9a-f]{40}$/.test(sha))throw Error('Require exact GitHub commit SHA');
  if(!runId||!/^\d{6,18}$/.test(String(runId)))throw Error('Require GitHub workflow run ID');
  // Đối chiếu nguồn CI với thông tin thực sự lấy ra từ app.asar đã đóng gói.
  const provenance=validateBuildInfo(buildInfo);
  if(provenance.commit!==sha||provenance.appVersion!==pkg.version||
     provenance.source.provider!=='github-actions'||provenance.source.runId!==String(runId))
    throw Error('CI provenance does not match commit/version/run');
  if(!Buffer.isBuffer(packagedBuildInfo))throw Error('Missing packaged build provenance');
  const packaged=validateBuildInfo(JSON.parse(packagedBuildInfo.toString('utf8')));
  if(JSON.stringify(packaged)!==JSON.stringify(provenance))
    throw Error('Packaged build provenance differs from checkout');
  const exe=expectedExeName(pkg);
  const exePath=path.join(dist,exe);
  if(!fs.statSync(exePath).isFile())throw Error('Installer was not produced');
  const size=fs.statSync(exePath).size;
  if(size<1024*1024)throw Error('Installer is implausibly small');
  const installerDigest=digest(fs.readFileSync(exePath));
  const present=new Set(fs.readdirSync(dist));
  const captures=CAPTURES;
  const absent=captures.filter(name=>!present.has(name));
  if(absent.length)throw Error('CI UI captures missing: '+absent.join(', '));
  const measureCapture=file=>{
    if(!fs.statSync(file).isFile())throw Error('UI capture is not a file');
    const bytes=fs.readFileSync(file);
    if(bytes.length<10000)throw Error('CI UI capture undersized: '+path.basename(file));
    return {bytes:bytes.length,sha256:digest(bytes)};
  };
  const uiCaptures=captures.map(name=>({name,
    source:measureCapture(path.join(dist,name)),
    packaged:measureCapture(path.join(dist,'packaged-ui',name))}));
  return {
    schema:'lhm.release.build-evidence.v1',
    product:'LHM Ads Browser',
    version:pkg.version,
    build:{commit:sha,runId:String(runId),platform:'windows-latest',arch:'x64',
      windowsInstaller:{name:exe,bytes:size,sha256:installerDigest},
      buildInfo:provenance,packagedBuildInfoSha256:digest(packagedBuildInfo),
      uiCaptures,
      uiCaptureNames:captures,uiCaptureCount:captures.length,
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
    dist,pkg,sha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,
    buildInfo:readBuildInfo(path.resolve(__dirname,'../build-info.json')),
    packagedBuildInfo:require('@electron/asar').extractFile(
      path.join(dist,'win-unpacked','resources','app.asar'),'build-info.json')
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
module.exports={expectedExeName,produceReleaseEvidence,validateCaptureEvidence,CAPTURES};
