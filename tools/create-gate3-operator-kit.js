'use strict';
/* Gate 3 operator kit from one exact Windows CI build. No keys, internet,
 * installer execution, customer data or false commercial approvals. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const REG_HASH=/^[a-f0-9]{64}$/;
function digest(file){
 const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r');
 try{const b=Buffer.alloc(1048576);let n;
  while((n=fs.readSync(fd,b,0,b.length,null))>0)h.update(b.subarray(0,n));
 }finally{fs.closeSync(fd)}
 return h.digest('hex');
}
function regular(file){
 const s=fs.lstatSync(file);
 if(!s.isFile()||s.isSymbolicLink())throw Error('Linked or non-file input refused');
 return s;
}
function makeKit({evidence,dist,out,collector}){
 const e=typeof evidence==='string'?JSON.parse(fs.readFileSync(evidence,'utf8')):evidence;
 const b=e?.build||{},w=b.windowsInstaller||{},p=e?.policy||{};
 if(e?.schema!=='lhm.release.build-evidence.v1'||b.platform!=='windows-latest'||
    b.arch!=='x64'||b.scope!=='automated_ci_only'||
    b.uiCaptureCount!==12||p.authenticodeRequired!==false||
    p.publicReleaseAuthorized!==false||
    p.independentWindowsGate3!=='NOT_VERIFIED_BY_CI'||
    p.ownerReleaseApprovalGate4!=='NOT_VERIFIED_BY_CI'||
    e.outcome!=='CI_BUILD_EVIDENCE_ONLY_NOT_COMMERCIAL_APPROVAL')
  throw Error('Invalid build-only Windows release evidence');
 if(!/^[a-f0-9]{40}$/.test(b.commit)||!/^[0-9]{6,18}$/.test(String(b.runId))||
    !REG_HASH.test(w.sha256)||!Number.isSafeInteger(w.bytes)||w.bytes<1048576||
    !/^\d+\.\d+\.\d+$/.test(e.version)||
    w.name!=='LHM-Ads-Browser-'+e.version+'-Preview-Setup-x64.exe')
  throw Error('Invalid exact run or installer identity');
 const exe=path.join(dist,w.name),actual=regular(exe);
 if(actual.size!==w.bytes||digest(exe)!==w.sha256)throw Error('EXE SHA-256 or length differs from CI evidence');
 regular(collector);
 if(fs.existsSync(out))throw Error('Gate 3 kit already exists: refusing overwrite');
 const lines=[
  '[CmdletBinding()]',
  "param([string]$OutputDirectory=(Join-Path $PSScriptRoot 'acceptance'))",
  "$ErrorActionPreference='Stop'",
  "$installer=Join-Path $PSScriptRoot '"+w.name+"'",
  "if(-not (Test-Path -LiteralPath $installer -PathType Leaf)){throw 'Copy the exact EXE from this CI run into the kit folder'}",
  "& (Join-Path $PSScriptRoot 'collect-windows-gate3.ps1') "+String.fromCharCode(96),
  ' -Installer $installer '+String.fromCharCode(96),
  " -ExpectedSha256 '"+w.sha256+"' "+String.fromCharCode(96),
  " -BuildCommit '"+b.commit+"' "+String.fromCharCode(96),
  " -WindowsRunId '"+b.runId+"' "+String.fromCharCode(96),
  ' -OutputDirectory $OutputDirectory',
  "if(-not $?) { throw 'Hash preflight failed' }"
 ];
 const guide=[
  '# LHM Ads Browser — Windows Gate 3 operator kit',
  '',
  'CI run: https://github.com/capquangfptminhlh/ggminh/actions/runs/'+b.runId,
  'Commit: '+b.commit,
  'Required EXE: '+w.name,
  'SHA-256: '+w.sha256,
  'File bytes: '+w.bytes,
  '',
  '1. From that GitHub run, download artifact LHM-Ads-Browser-Windows-x64.',
  '2. Extract the EXACT EXE into this kit folder. The kit contains NO EXE.',
  '3. On an independent Windows x64 PC run: .\\Start-Gate3.ps1',
  '4. Compare GitHub run SUCCESS and source commit independently.',
  '5. Install manually only after hash PASS and run every Gate 3 checklist.',
  '',
  'No Windows Authenticode signature is required, but do not disable Defender.',
  'This runs no EXE, makes no network request and collects no customer data.',
  'All installed-Windows checks remain NOT_RUN until human test evidence.',
  'The offline source metadata is NOT GitHub-authenticated by this kit.',
  'Gate 4 commercial release remains NOT_APPROVED.'
 ];
 fs.mkdirSync(out,{recursive:false});
 fs.copyFileSync(collector,path.join(out,'collect-windows-gate3.ps1'));
 fs.writeFileSync(path.join(out,'Start-Gate3.ps1'),lines.join('\r\n')+'\r\n');
 fs.writeFileSync(path.join(out,'README.md'),guide.join('\n')+'\n');
 fs.writeFileSync(path.join(out,'build-identity.json'),JSON.stringify({
  schema:'lhm.gate3.operator-kit.v1',source:'CI_METADATA_NOT_AUTHENTICATED_OFFLINE',
  runId:String(b.runId),commit:b.commit,exe:w.name,bytes:w.bytes,
  sha256:w.sha256,authenticodeRequired:false,gate3:'NOT_RUN',gate4:'NOT_APPROVED'
 },null,2)+'\n');
 return {runId:b.runId,sha256:w.sha256};
}
if(require.main===module){
 try{
  const d=path.resolve(process.argv[3]||'dist');
  const out=path.resolve(process.argv[4]||'dist/gate3-operator-kit');
  const e=path.resolve(process.argv[2]||'dist/release-evidence.json');
  const collector=path.resolve(__dirname,'collect-windows-gate3.ps1');
  const result=makeKit({evidence:e,dist:d,out,collector});
  console.log('Gate3 operator kit prepared for '+result.runId+'; customer Gate3 remains NOT_RUN');
 }catch(error){console.error('Gate3 kit blocked:',error.message);process.exitCode=1}
}
module.exports={makeKit,digest};
