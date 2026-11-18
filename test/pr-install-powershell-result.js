'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const os=require('node:os');
const yaml=require('js-yaml');
if(process.platform!=='win32'){console.log('SKIP PowerShell integration on non-Windows');process.exit(0)}
const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','windows-pr-install-evidence.yml'),'utf8');
const lines=workflow.split(/\r?\n/);
const index=lines.findIndex(line=>line.includes('& .\\tools\\run-windows-clean-install-acceptance.ps1'));
assert(index>=0,'Acceptance invocation missing');
const following=lines[index+1].trim();
function check(stub){
 const code=`$ErrorActionPreference='Stop'\n$stub={${stub}}\n& $stub\n${following}\nWrite-Output 'RESULT_OK'`;
 return spawnSync('pwsh',['-NoLogo','-NoProfile','-NonInteractive','-Command',code],{encoding:'utf8'});
}
const stale=check('& cmd.exe /d /c "exit 7"; Write-Output "measurement PASS"');
assert.equal(stale.status,0,`Successful PowerShell script was rejected after a failing child: ${stale.stderr}`);
assert.match(stale.stdout,/RESULT_OK/);
const failure=check('throw "synthetic acceptance failure"');
assert.notEqual(failure.status,0,'PowerShell acceptance exceptions must fail the step');
assert(!failure.stdout.includes('RESULT_OK'));
for(const [name,job,stepName] of [
 ['windows-pr-install-evidence.yml','installed-pr','Stop synthetic processes and remove temporary data'],
 ['windows-clean-install-acceptance.yml','installed-windows','Remove disposable inputs and synthetic data']
]){
 const config=yaml.load(fs.readFileSync(path.join(__dirname,'..','.github','workflows',name),'utf8'));
 const step=config.jobs[job].steps.find(s=>s.name===stepName);
 assert(step?.run,`Missing ${name} cleanup`);
 const source=step.run.replace(/^.*&\s+\.\\tools\\stop-windows-install-processes\.ps1.*$/m,'& $stub');
 assert.notEqual(source,step.run,'Could not isolate cleanup helper');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-cleanup-result-'));
 try{
  const runCleanup=stub=>spawnSync('pwsh',['-NoLogo','-NoProfile','-NonInteractive','-Command',
   `$stub={${stub}}\n${source}\nif (Test-Path -LiteralPath variable:\\LASTEXITCODE) { exit $LASTEXITCODE }`],
   {encoding:'utf8',env:{...process.env,RUNNER_TEMP:tmp}});
  const staleCleanup=runCleanup('& cmd.exe /d /c "exit 7"; Write-Output "cleanup PASS"');
  assert.equal(staleCleanup.status,0,`${name} rejected successful cleanup with stale native result: ${staleCleanup.stderr}`);
  const failureCleanup=runCleanup('throw "synthetic cleanup failure"');
  assert.notEqual(failureCleanup.status,0,`${name} must fail on cleanup exception`);
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
}
const main=fs.readFileSync(path.join(__dirname,'..','.github','workflows','windows-clean-install-acceptance.yml'),'utf8');
assert(!/if\s*\(\$LASTEXITCODE\s*-ne\s*0\)\s*\{throw 'Installed Windows acceptance runner failed'\}/.test(main),
 'Main workflow must not mistake stale native exit code for PowerShell runner failure');
const mainWorkflow=yaml.load(main);
const mainStep=mainWorkflow.jobs['installed-windows'].steps.find(s=>s.name==='Exercise installed builds with synthetic isolated data').run;
const mainStub=mainStep.replace(/&\s+\.\\tools\\run-windows-clean-install-acceptance\.ps1[\s\S]*?-ExpectedCandidateVersion \$env:EXPECTED_CANDIDATE_VERSION/,'& $stub');
assert.notEqual(mainStub,mainStep);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-main-result-'));
try{
 const runMain=stub=>spawnSync('pwsh',['-NoLogo','-NoProfile','-NonInteractive','-Command',
  `$stub={${stub}}\n${mainStub}\nif (Test-Path -LiteralPath variable:\\LASTEXITCODE) { exit $LASTEXITCODE }`],
  {encoding:'utf8',env:{...process.env,RUNNER_TEMP:tmp,GITHUB_ENV:path.join(tmp,'env')}});
 const ok=runMain('& cmd.exe /d /c "exit 7"; Write-Output "measurement PASS"');
 assert.equal(ok.status,0,`Main step rejected a successful runner: ${ok.stderr}`);
 assert.notEqual(runMain('throw "synthetic acceptance failure"').status,0);
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
console.log('PR install PowerShell acceptance exit semantics PASS');
