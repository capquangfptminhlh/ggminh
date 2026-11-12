# Windows Clean-Install Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual, evidence-only Windows workflow that verifies exact CI installers, exercises clean install/install-over-existing/uninstall retention on a fresh hosted runner, and emits a privacy-minimal report without approving or publishing a release.

**Architecture:** A dependency-free Node module validates downloaded build artifacts and constructs a closed-schema evidence report. A PowerShell runner performs bounded Windows process and filesystem observations below `$RUNNER_TEMP`; a read-only `workflow_dispatch` workflow validates GitHub provenance, downloads the exact artifacts, invokes both tools, and uploads only sanitized JSON/log evidence.

**Tech Stack:** Node.js CommonJS, built-in `assert`/`crypto`/`fs`/`path`, PowerShell 7, GitHub Actions, GitHub CLI, electron-builder NSIS artifacts, repository plain-script tests.

---

## File structure

- Create `tools/windows-clean-install-evidence.js`: bounded JSON/file reader, exact build-artifact verifier, privacy validator, report builder, and two CLI subcommands (`verify-build`, `build`).
- Create `tools/run-windows-clean-install-acceptance.ps1`: isolated NSIS install, installed-app launch, install-over-existing, UI capture, uninstall, retention observation, PID-scoped cleanup, and raw measurement output.
- Create `.github/workflows/windows-clean-install-acceptance.yml`: manual provenance validation, artifact download, execution, cleanup, and evidence upload.
- Create `test/windows-clean-install-evidence.js`: behavioral tests for artifact verification and report construction.
- Create `test/windows-clean-install-workflow.js`: static contract tests for the workflow and PowerShell runner.
- Modify `package.json`: add both new tests to `test:steps`.
- Modify `docs/acceptance/CAMOUFOX_RC1_WINDOWS_20261111.md`: record that the automated hosted-runner gate exists while owner/manual gates remain incomplete.

### Task 1: Exact installer artifact verifier

**Files:**
- Create: `test/windows-clean-install-evidence.js`
- Create: `tools/windows-clean-install-evidence.js`

- [ ] **Step 1: Write the failing artifact-verification tests**

Create `test/windows-clean-install-evidence.js` with temporary fixture helpers and these assertions:

```js
'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawnSync}=require('child_process');
const toolPath=path.join(__dirname,'..','tools','windows-clean-install-evidence.js');

function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'lhm-clean-install-'));}
function buildFixture(root,label,commit,runId,version='5.8.0'){
 const name=`LHM-Ads-Browser-${version}-Preview-Setup-x64.exe`;
 const bytes=Buffer.from(`synthetic-${label}-installer-bytes`.repeat(32));
 const installer=path.join(root,name);fs.writeFileSync(installer,bytes);
 const evidence={schema:'lhm.release.build-evidence.v1',product:'LHM Ads Browser',version,
  build:{commit,runId:String(runId),platform:'windows-latest',arch:'x64',
   windowsInstaller:{name,bytes:bytes.length,sha256:sha(bytes)},uiCaptureCount:12,
   uiCaptureNames:[],uiCaptures:[],
   scope:'automated_ci_only'},
  policy:{authenticodeRequired:false,installerSha256Recorded:true,
   engineAndUpdateTrustMustRemainCryptographicallyVerified:true,
   independentWindowsGate3:'NOT_VERIFIED_BY_CI',ownerReleaseApprovalGate4:'NOT_VERIFIED_BY_CI',
   hostedPaymentsOrLicenseAuthority:'NOT_VERIFIED_BY_CI',publicReleaseAuthorized:false},
  outcome:'CI_BUILD_EVIDENCE_ONLY_NOT_COMMERCIAL_APPROVAL'};
 const evidenceFile=path.join(root,`${label}-evidence.json`);
 fs.writeFileSync(evidenceFile,JSON.stringify(evidence));
 return {installer,evidenceFile,evidence,name,bytes};
}

const root=temp();
try{
 const commit='1'.repeat(40),runId='43176842323';
 const fixture=buildFixture(root,'candidate',commit,runId);
 const mod=require(toolPath);
 const verified=mod.verifyBuildArtifact({installerFile:fixture.installer,
  evidenceFile:fixture.evidenceFile,expectedCommit:commit,expectedRunId:runId,
  expectedName:fixture.name});
 assert.strictEqual(verified.sha256,fixture.evidence.build.windowsInstaller.sha256);
 assert.strictEqual(verified.bytes,fixture.bytes.length);
 assert.strictEqual(verified.version,'5.8.0');

 fs.appendFileSync(fixture.installer,'tampered');
 assert.throws(()=>mod.verifyBuildArtifact({installerFile:fixture.installer,
  evidenceFile:fixture.evidenceFile,expectedCommit:commit,expectedRunId:runId}),/SHA-256|bytes/);
 fs.writeFileSync(fixture.installer,fixture.bytes);

 for(const mutate of [
  x=>x.build.commit='2'.repeat(40),x=>x.build.runId='9',
  x=>x.policy.publicReleaseAuthorized=true,
  x=>x.outcome='APPROVED',x=>x.unexpected=true
 ]){
  const changed=JSON.parse(JSON.stringify(fixture.evidence));mutate(changed);
  fs.writeFileSync(fixture.evidenceFile,JSON.stringify(changed));
  assert.throws(()=>mod.verifyBuildArtifact({installerFile:fixture.installer,
   evidenceFile:fixture.evidenceFile,expectedCommit:commit,expectedRunId:runId}),
   /evidence|commit|run|authorized|outcome|field/i);
 }
 fs.writeFileSync(fixture.evidenceFile,JSON.stringify(fixture.evidence));
 const cli=spawnSync(process.execPath,[toolPath,'verify-build','--installer',fixture.installer,
  '--evidence',fixture.evidenceFile,'--commit',commit,'--run-id',runId,
  '--expected-name',fixture.name],{encoding:'utf8'});
 assert.strictEqual(cli.status,0,cli.stderr);
 assert.strictEqual(JSON.parse(cli.stdout).sha256,fixture.evidence.build.windowsInstaller.sha256);
}finally{fs.rmSync(root,{recursive:true,force:true});}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node test/windows-clean-install-evidence.js`

Expected: FAIL with `Cannot find module '../tools/windows-clean-install-evidence.js'`.

- [ ] **Step 3: Implement the minimal bounded verifier and CLI parser**

Create `tools/windows-clean-install-evidence.js` with:

```js
#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const HASH=/^[a-f0-9]{64}$/;
const COMMIT=/^[a-f0-9]{40}$/;
const RUN=/^[0-9]{6,18}$/;
const MAX_JSON=1024*1024;
const BUILD_KEYS=['build','outcome','policy','product','schema','version'];
const INSTALLER_KEYS=['bytes','name','sha256'];

function exactKeys(value,keys,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!==keys.slice().sort().join(','))
  throw Error(`Invalid ${label} fields`);
}
function regularFile(filename,max=2*1024*1024*1024){
 if(typeof filename!=='string'||!path.isAbsolute(filename))throw Error('Absolute file path required');
 const stat=fs.lstatSync(filename);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>max)
  throw Error('Invalid regular file');
 return stat;
}
function readJson(filename){
 const stat=regularFile(filename,MAX_JSON);
 const data=fs.readFileSync(filename);
 if(data.length!==stat.size)throw Error('Evidence file changed during read');
 return JSON.parse(data.toString('utf8'));
}
function hashFile(filename){
 regularFile(filename);
 const hash=crypto.createHash('sha256'),fd=fs.openSync(filename,'r');
 let bytes=0;
 try{
  const buffer=Buffer.allocUnsafe(1024*1024);let count;
  while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0){
   bytes+=count;hash.update(buffer.subarray(0,count));
  }
 }finally{fs.closeSync(fd);}
 return {bytes,sha256:hash.digest('hex')};
}
function verifyBuildArtifact({installerFile,evidenceFile,expectedCommit,expectedRunId,expectedName=null}){
 if(!COMMIT.test(expectedCommit||''))throw Error('Invalid expected commit');
 if(!RUN.test(String(expectedRunId||'')))throw Error('Invalid expected run id');
 const evidence=readJson(evidenceFile);
 exactKeys(evidence,BUILD_KEYS,'build evidence');
 if(evidence.schema!=='lhm.release.build-evidence.v1'||evidence.product!=='LHM Ads Browser')
  throw Error('Invalid build evidence schema');
 const build=evidence.build;
 const requiredBuild=['arch','commit','platform','runId','scope','uiCaptureCount',
  'uiCaptureNames','uiCaptures','windowsInstaller'];
 exactKeys(build,requiredBuild,'build identity');
 exactKeys(build.windowsInstaller,INSTALLER_KEYS,'installer identity');
 if(build.commit!==expectedCommit||String(build.runId)!==String(expectedRunId))
  throw Error('Build commit or run binding mismatch');
 if(build.platform!=='windows-latest'||build.arch!=='x64'||build.scope!=='automated_ci_only')
  throw Error('Unexpected build environment');
 if(evidence.policy?.publicReleaseAuthorized!==false||
    evidence.outcome!=='CI_BUILD_EVIDENCE_ONLY_NOT_COMMERCIAL_APPROVAL')
  throw Error('Build evidence is authorized or has an unsafe outcome');
 const name=path.basename(installerFile);
 if(name!==build.windowsInstaller.name||(expectedName&&name!==expectedName)||
    !/^LHM-Ads-Browser-[0-9]+\.[0-9]+\.[0-9]+-Preview-Setup-x64\.exe$/.test(name))
  throw Error('Installer name mismatch');
 const actual=hashFile(installerFile);
 if(!HASH.test(build.windowsInstaller.sha256)||actual.sha256!==build.windowsInstaller.sha256||
    actual.bytes!==build.windowsInstaller.bytes)throw Error('Installer bytes or SHA-256 mismatch');
 return {commit:build.commit,runId:String(build.runId),name,bytes:actual.bytes,
  sha256:actual.sha256,version:evidence.version,evidence};
}
function parseArgs(argv){
 const command=argv[2],args=new Map();
 for(let i=3;i<argv.length;i+=2){
  if(!argv[i]?.startsWith('--')||i+1>=argv.length||args.has(argv[i]))throw Error('Invalid CLI arguments');
  args.set(argv[i],argv[i+1]);
 }
 return {command,args};
}
function required(args,name){const value=args.get(name);if(!value)throw Error(`Missing ${name}`);return value;}

if(require.main===module){
 try{
  const {command,args}=parseArgs(process.argv);
  if(command!=='verify-build')throw Error('Expected verify-build command');
  const result=verifyBuildArtifact({installerFile:path.resolve(required(args,'--installer')),
   evidenceFile:path.resolve(required(args,'--evidence')),expectedCommit:required(args,'--commit'),
   expectedRunId:required(args,'--run-id'),expectedName:args.get('--expected-name')||null});
  console.log(JSON.stringify({commit:result.commit,runId:result.runId,name:result.name,
   bytes:result.bytes,sha256:result.sha256,version:result.version}));
 }catch(error){console.error('Windows clean-install evidence:',error.message);process.exitCode=1;}
}
module.exports={verifyBuildArtifact,hashFile,readJson};
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node test/windows-clean-install-evidence.js`

Expected: exit 0 with no stderr.

- [ ] **Step 5: Commit the verifier slice**

```powershell
git add test/windows-clean-install-evidence.js tools/windows-clean-install-evidence.js
git commit -m "test: verify exact Windows installer evidence"
```

### Task 2: Closed-schema hosted-runner evidence builder

**Files:**
- Modify: `test/windows-clean-install-evidence.js`
- Modify: `tools/windows-clean-install-evidence.js`

- [ ] **Step 1: Add failing report-builder tests**

Before the fixture cleanup in `test/windows-clean-install-evidence.js`, create baseline/candidate fixtures plus this measurement and assertions:

```js
const baseline=buildFixture(root,'baseline','2'.repeat(40),'42755402012');
const candidate=buildFixture(root,'current','3'.repeat(40),'43176842323');
const PASS=['baselineInstall','baselineLaunch','installOverExisting','candidateLaunch',
 'packagedUiCapture','uninstall','processCleanup','retention'];
const measurement={schema:'lhm.windows-clean-install-measurement.v1',
 environmentClass:'github-hosted-windows-ephemeral',hostedRunnerImage:'windows-latest',
 baseline:{commit:baseline.evidence.build.commit,runId:baseline.evidence.build.runId,
  installerName:baseline.name,bytes:baseline.bytes.length,
  sha256:baseline.evidence.build.windowsInstaller.sha256,version:'5.8.0',authenticodeStatus:'NotSigned'},
 candidate:{commit:candidate.evidence.build.commit,runId:candidate.evidence.build.runId,
  installerName:candidate.name,bytes:candidate.bytes.length,
  sha256:candidate.evidence.build.windowsInstaller.sha256,version:'5.8.0',authenticodeStatus:'NotSigned'},
 results:Object.fromEntries(PASS.map(key=>[key,'PASS'])),
 markerSha256:'4'.repeat(64),uiCaptureCount:12,
 privacy:'Synthetic local data only; no customer, profile, token, cookie, proxy or network data'};
const report=mod.buildEvidence({measurement,baselineEvidenceFile:baseline.evidenceFile,
 candidateEvidenceFile:candidate.evidenceFile,now:'2026-11-12T08:30:00.000Z'});
assert.strictEqual(report.schema,'lhm.windows-clean-install-evidence.v1');
assert.strictEqual(report.outcome,'AUTOMATED_HOSTED_RUNNER_EVIDENCE_ONLY');
assert.deepStrictEqual(report.limitations,{sameVersionMayBeReinstall:true,notOwnerReceipt:true,
 notCleanMachineManualGate:true,notCamoufoxEngineAcceptance:true,notCommercialApproval:true});
assert(!JSON.stringify(report).includes(root));
for(const mutate of [
 x=>x.results.retention='NOT_RUN',x=>x.uiCaptureCount=11,x=>x.unexpected=true,
 x=>x.privacy='C:\\Users\\alice\\secret',x=>x.privacy='token=secret',
 x=>x.privacy='proxy://user:pass@example',x=>x.markerSha256='bad'
]){
 const changed=JSON.parse(JSON.stringify(measurement));mutate(changed);
 assert.throws(()=>mod.buildEvidence({measurement:changed,
  baselineEvidenceFile:baseline.evidenceFile,candidateEvidenceFile:candidate.evidenceFile}),
  /measurement|privacy|PASS|capture|SHA-256|field/i);
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node test/windows-clean-install-evidence.js`

Expected: FAIL because `buildEvidence` is not exported.

- [ ] **Step 3: Add the report builder and `build` CLI subcommand**

Extend `tools/windows-clean-install-evidence.js` with strict key lists, a recursive sensitive-value scanner, identity comparison against both build-evidence files, the eight required `PASS` results, exactly 12 captures, and the fixed limitations object. The emitted shape must be:

```js
{
 schema:'lhm.windows-clean-install-evidence.v1',generatedAt,
 environment:{class:'github-hosted-windows-ephemeral',image:'windows-latest'},
 baseline:{commit,runId,installer:{name,bytes,sha256},version,authenticodeStatus},
 candidate:{commit,runId,installer:{name,bytes,sha256},version,authenticodeStatus},
 observations:{...results,uiCaptureCount,markerSha256},
 privacy:'Synthetic local data only; no customer data was collected',
 limitations:{sameVersionMayBeReinstall:true,notOwnerReceipt:true,
  notCleanMachineManualGate:true,notCamoufoxEngineAcceptance:true,notCommercialApproval:true},
 outcome:'AUTOMATED_HOSTED_RUNNER_EVIDENCE_ONLY'
}
```

Add `build` CLI arguments `--measurement`, `--baseline-evidence`,
`--candidate-evidence`, and `--out`. Write with `flag: 'wx'`, UTF-8, mode
`0o600`, then print only the output basename and report outcome. Export
`buildEvidence`.

- [ ] **Step 4: Run focused tests and syntax checks**

Run:

```powershell
node test/windows-clean-install-evidence.js
node --check tools/windows-clean-install-evidence.js
```

Expected: both commands exit 0 with no stderr.

- [ ] **Step 5: Commit the report-builder slice**

```powershell
git add test/windows-clean-install-evidence.js tools/windows-clean-install-evidence.js
git commit -m "feat: build privacy-minimal Windows install evidence"
```

### Task 3: Bounded PowerShell install runner

**Files:**
- Create: `test/windows-clean-install-workflow.js`
- Create: `tools/run-windows-clean-install-acceptance.ps1`

- [ ] **Step 1: Write the failing runner contract test**

Create `test/windows-clean-install-workflow.js`:

```js
'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const psFile=path.join(root,'tools','run-windows-clean-install-acceptance.ps1');
assert(fs.existsSync(psFile),'PowerShell acceptance runner missing');
const ps=fs.readFileSync(psFile,'utf8');
for(const token of [
 'Set-StrictMode -Version Latest','[IO.Path]::GetFullPath','RUNNER_TEMP',
 'LHM-Ads-Browser-','-Preview-Setup-x64.exe','/S','/D=',
 'APPDATA','LOCALAPPDATA','LHM_CI_UI_CAPTURE','LHM_CI_UI_CAPTURE_DIR',
 'storage\\db.json','acceptance-synthetic-marker.txt','Get-AuthenticodeSignature',
 'WaitForExit','taskkill.exe','/PID','/T','lhm.windows-clean-install-measurement.v1',
 'github-hosted-windows-ephemeral'
]) assert(ps.includes(token),`runner contract missing ${token}`);
assert(!/Get-Process\s+[^\r\n]*LHM/i.test(ps),'cleanup must not match a broad process name');
assert(!/Stop-Process\s+[^\r\n]*-Name/i.test(ps),'cleanup must be PID-scoped');
assert(!/Set-MpPreference|DisableRealtimeMonitoring|SmartScreenEnabled/i.test(ps),
 'runner must not weaken Windows protection');
console.log('Windows clean-install runner contract PASS');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node test/windows-clean-install-workflow.js`

Expected: FAIL with `PowerShell acceptance runner missing`.

- [ ] **Step 3: Implement the PowerShell runner**

Create `tools/run-windows-clean-install-acceptance.ps1` with mandatory absolute
paths for the baseline/candidate installers and evidence JSON, an output root
strictly below `$env:RUNNER_TEMP`, and an expected candidate version. Implement
these focused helpers:

```powershell
function Assert-UnderRoot([string]$Path,[string]$Root) {
  $full=[IO.Path]::GetFullPath($Path); $base=[IO.Path]::GetFullPath($Root)
  if($full -eq $base -or -not $full.StartsWith($base+[IO.Path]::DirectorySeparatorChar,
      [StringComparison]::OrdinalIgnoreCase)){ throw 'Acceptance path escapes RUNNER_TEMP' }
  return $full
}
function Invoke-Bounded([string]$File,[string[]]$Arguments,[int]$TimeoutSeconds) {
  $process=Start-Process -FilePath $File -ArgumentList $Arguments -PassThru
  $script:OwnedPids.Add($process.Id)
  if(-not $process.WaitForExit($TimeoutSeconds*1000)){
    & taskkill.exe /PID $process.Id /T /F | Out-Null
    throw 'Bounded process timed out'
  }
  if($process.ExitCode -ne 0){ throw "Bounded process exited $($process.ExitCode)" }
}
function Stop-Owned([int]$Pid) {
  if($Pid -gt 0){ & taskkill.exe /PID $Pid /T /F 2>$null | Out-Null }
}
```

Use a `System.Diagnostics.ProcessStartInfo` helper for installed-app launches so
only the child receives isolated `APPDATA`, `LOCALAPPDATA`, and capture
variables. Require the app-generated `storage\db.json`, create and hash
`acceptance-synthetic-marker.txt`, run the candidate against the same install
and application-data roots, require 12 named captures of at least 10,000 bytes,
locate exactly one `Uninstall*.exe` below the install root, run it silently,
then require executable removal and data retention. Write a raw measurement
matching the schema in Task 2. On failure write only a stage name and sanitized
exception category to `diagnostic.log`; do not include absolute paths.

Wrap execution in `try/finally`. The `finally` block iterates only
`$script:OwnedPids`, calls `Stop-Owned`, and attempts the exact resolved
uninstaller below the temporary install root. Never use process-name matching.

- [ ] **Step 4: Verify the runner contract and PowerShell syntax**

Run:

```powershell
node test/windows-clean-install-workflow.js
pwsh -NoLogo -NoProfile -Command '$null=[scriptblock]::Create((Get-Content -Raw tools/run-windows-clean-install-acceptance.ps1)); "PowerShell syntax PASS"'
```

Expected: contract PASS and `PowerShell syntax PASS`.

- [ ] **Step 5: Commit the runner slice**

```powershell
git add test/windows-clean-install-workflow.js tools/run-windows-clean-install-acceptance.ps1
git commit -m "feat: exercise installed Windows builds in isolation"
```

### Task 4: Manual read-only GitHub workflow

**Files:**
- Modify: `test/windows-clean-install-workflow.js`
- Create: `.github/workflows/windows-clean-install-acceptance.yml`

- [ ] **Step 1: Add failing workflow contract assertions**

Append to `test/windows-clean-install-workflow.js`:

```js
const workflowFile=path.join(root,'.github','workflows','windows-clean-install-acceptance.yml');
assert(fs.existsSync(workflowFile),'manual clean-install workflow missing');
const workflow=fs.readFileSync(workflowFile,'utf8');
for(const token of [
 'workflow_dispatch:','candidate_run_id:','baseline_run_id:',
 'contents: read','actions: read','runs-on: windows-latest','timeout-minutes:',
 '.github/workflows/windows-exe.yml','head_branch','head_repository',
 'compare/','LHM-Ads-Browser-Windows-x64','LHM-Release-Evidence-Windows',
 'verify-build','run-windows-clean-install-acceptance.ps1',
 'windows-clean-install-evidence.js build','if: always()',
 'LHM-Windows-Clean-Install-Evidence','AUTOMATED_HOSTED_RUNNER_EVIDENCE_ONLY'
]) assert(workflow.includes(token),`workflow contract missing ${token}`);
assert(!workflow.includes('contents: write'));
assert(!/gh release (create|edit|upload)/.test(workflow));
assert(!/capabilities\.json/.test(workflow));
assert(!/publisher-ceremony|ownerApprovalId|READY_FOR_OWNER_REVIEW/.test(workflow));
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node test/windows-clean-install-workflow.js`

Expected: FAIL with `manual clean-install workflow missing`.

- [ ] **Step 3: Create the workflow with fail-closed provenance validation**

Create `.github/workflows/windows-clean-install-acceptance.yml` with:

```yaml
name: Windows clean-install evidence (manual, no release)
on:
  workflow_dispatch:
    inputs:
      candidate_run_id:
        description: Successful Build Windows EXE run for exact current main
        required: true
        type: string
      baseline_run_id:
        description: Earlier successful ancestor Build Windows EXE run
        required: true
        type: string
permissions:
  contents: read
  actions: read
concurrency:
  group: lhm-windows-clean-install-evidence
  cancel-in-progress: false
jobs:
  installed-windows:
    runs-on: windows-latest
    timeout-minutes: 25
```

The checkout step pins `ref: main` and disables persisted credentials. A
PowerShell provenance step validates decimal run IDs, current remote `main`,
candidate/baseline run status/conclusion/path/branch/repository, different
commits, and ancestor status from the compare API. Store only verified commits
and run IDs in `$GITHUB_ENV`.

Download both named artifacts with `gh run download` into separate directories.
Resolve exactly one EXE and one evidence JSON per build. Run `verify-build` for
both before the PowerShell runner; pass `--expected-name` for the candidate
using the exact artifact name derived from `package.json`.

Invoke the runner with paths under `$RUNNER_TEMP`, then invoke the Node `build`
subcommand. Parse the final JSON and require exact schema/outcome plus all five
limitation booleans. Upload only the final JSON on success. Under `if: always()`
upload the bounded diagnostic log if present and run a PID-scoped cleanup script
using a PID ledger created by the runner. Do not upload installers, screenshots,
application data, or raw evidence inputs.

- [ ] **Step 4: Run contract and repository policy tests**

Run:

```powershell
node test/windows-clean-install-workflow.js
node test/commercial-ui-release.js
node test/installer-signing-policy.js
```

Expected: all three commands exit 0.

- [ ] **Step 5: Commit the workflow slice**

```powershell
git add .github/workflows/windows-clean-install-acceptance.yml test/windows-clean-install-workflow.js
git commit -m "ci: add manual Windows clean-install evidence gate"
```

### Task 5: Test-suite wiring and honest acceptance documentation

**Files:**
- Modify: `package.json`
- Modify: `docs/acceptance/CAMOUFOX_RC1_WINDOWS_20261111.md`

- [ ] **Step 1: Add a failing package wiring assertion**

Append to `test/windows-clean-install-workflow.js`:

```js
const pkg=require('../package.json');
assert(pkg.scripts['test:steps'].includes('node test/windows-clean-install-evidence.js'));
assert(pkg.scripts['test:steps'].includes('node test/windows-clean-install-workflow.js'));
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node test/windows-clean-install-workflow.js`

Expected: FAIL because the new tests are not in `test:steps`.

- [ ] **Step 3: Wire tests and update the acceptance record**

Add both commands near the existing release/Gate 3 tests in
`package.json#scripts.test:steps`.

Add a section to `docs/acceptance/CAMOUFOX_RC1_WINDOWS_20261111.md` stating:

```markdown
## Automated hosted-runner install evidence

The repository now provides a manual, read-only hosted-Windows workflow for
exact-artifact clean install, install-over-existing continuity, UI capture,
uninstall and synthetic-data retention. Its output is supporting CI evidence
only. It does not satisfy the independent clean-Windows owner receipt, does not
exercise a production-signed Camoufox engine or real customer proxy, and cannot
change the `BLOCKED` release decision by itself.

The first real dispatch is required after the workflow reaches `main`; until a
successful report is recorded here, this automated gate remains NOT_RUN.
```

- [ ] **Step 4: Run focused tests and diff hygiene**

Run:

```powershell
node test/windows-clean-install-evidence.js
node test/windows-clean-install-workflow.js
git diff --check
```

Expected: both tests pass and `git diff --check` prints nothing.

- [ ] **Step 5: Commit suite wiring and docs**

```powershell
git add package.json docs/acceptance/CAMOUFOX_RC1_WINDOWS_20261111.md test/windows-clean-install-workflow.js
git commit -m "docs: scope hosted Windows install evidence"
```

### Task 6: Full verification, push, and pull request

**Files:**
- Verify all changed files; no new production files.

- [ ] **Step 1: Run the complete local verification suite**

Run:

```powershell
npm test
git diff --check origin/main...HEAD
git status --short
```

Expected: all selected test steps pass, diff check is empty, and worktree is
clean.

- [ ] **Step 2: Review the branch diff for forbidden scope expansion**

Run:

```powershell
git diff --name-status origin/main...HEAD
rg -n "gh release|contents: write|capabilities.json|ownerApprovalId|READY_FOR_OWNER_REVIEW" .github/workflows/windows-clean-install-acceptance.yml tools/windows-clean-install-evidence.js tools/run-windows-clean-install-acceptance.ps1
```

Expected: only planned files changed; the forbidden search returns no unsafe
workflow action (fixed rejection strings in tests are acceptable and reviewed).

- [ ] **Step 3: Push and create the PR**

```powershell
git push -u origin ci/windows-clean-acceptance-20261112
gh pr create --base main --head ci/windows-clean-acceptance-20261112 `
  --title "Add evidence-only Windows clean-install gate" `
  --body-file docs/superpowers/specs/2026-11-12-windows-clean-install-evidence-design.md
```

Expected: PR URL is returned; existing PR checks begin.

- [ ] **Step 4: Wait for all PR checks and merge only when green**

Run:

```powershell
$prNumber=gh pr view --json number --jq .number
gh pr checks --watch --interval 10 $prNumber
```

Expected: every required check succeeds. Resolve any failure with a new failing
regression test before changing implementation.

### Task 7: First operational dispatch after merge

**Files:**
- Runtime evidence only; if the run succeeds, update the acceptance document in
  a follow-up branch with the exact report identity.

- [ ] **Step 1: Identify the post-merge candidate build run**

After the PR merge, wait for `Build Windows EXE` on the merge commit to succeed:

```powershell
$mainSha=(git ls-remote origin refs/heads/main).Split("`t")[0]
$candidateRuns=gh run list --workflow windows-exe.yml --branch main --commit $mainSha `
  --limit 5 --json databaseId,status,conclusion,headSha,url | ConvertFrom-Json
$candidateRun=$candidateRuns | Where-Object {
  $_.status -eq 'completed' -and $_.conclusion -eq 'success' -and $_.headSha -eq $mainSha
} | Select-Object -First 1
if($null -eq $candidateRun){throw 'No successful exact-main Windows build run'}
$candidateRun | ConvertTo-Json -Compress
```

Expected: one completed successful run whose `headSha` equals `$mainSha`.

- [ ] **Step 2: Dispatch with a verified ancestor baseline**

Use successful run `43176842323` (commit
`4e46426c8e7ecb45f267c1fb8536697269b19d25`) as the initial baseline and the
new successful run ID as candidate:

```powershell
gh workflow run windows-clean-install-acceptance.yml --ref main `
  -f baseline_run_id=43176842323 -f candidate_run_id=$($candidateRun.databaseId)
```

- [ ] **Step 3: Watch the dispatch and inspect the evidence artifact**

Run:

```powershell
$acceptanceRun=$null
for($attempt=0;$attempt -lt 12 -and $null -eq $acceptanceRun;$attempt++){
  Start-Sleep -Seconds 5
  $acceptanceRun=gh run list --workflow windows-clean-install-acceptance.yml `
    --branch main --limit 5 --json databaseId,event,headSha,status,url |
    ConvertFrom-Json | Where-Object {
      $_.event -eq 'workflow_dispatch' -and $_.headSha -eq $mainSha
    } | Select-Object -First 1
}
if($null -eq $acceptanceRun){throw 'Manual acceptance run did not appear'}
gh run watch $acceptanceRun.databaseId --exit-status --interval 10
$evidenceDir=Join-Path $env:TEMP ('lhm-windows-clean-install-evidence-'+$acceptanceRun.databaseId)
gh run download $acceptanceRun.databaseId -n LHM-Windows-Clean-Install-Evidence -D $evidenceDir
```

Expected: run succeeds; JSON schema/outcome and both build identities match the
observed GitHub runs; no installer, profile database, screenshot, token, local
path, IP, proxy, private key, or owner receipt exists in the artifact.

- [ ] **Step 4: Record the actual result without changing manual gates**

Create a follow-up branch from the new `main`, replace the acceptance document's
`NOT_RUN` sentence with the run URL, commit, candidate/baseline IDs, installer
SHA-256 values, report SHA-256, and
`AUTOMATED_HOSTED_RUNNER_EVIDENCE_ONLY`. Preserve the explicit statement that
the independent owner receipt, production Camoufox key ceremony, real proxy
measurements, and resource matrix remain incomplete. Run `npm test`, push, and
open a documentation-only PR.

