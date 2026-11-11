# Camoufox Release Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local, read-only command that evaluates candidate-bound Camoufox release evidence and returns either `BLOCKED` or `READY_FOR_OWNER_REVIEW`, without publishing, enabling capabilities, launching browsers, or making network requests.

**Architecture:** Keep all release decisions in a pure evaluator that consumes allowlisted, already-parsed evidence. Put path validation, bounded JSON loading, streaming SHA-256, packaged-resource verification, installed-engine verification, and CLI exit-code handling in a thin adapter. Evidence is selected by a fixed-schema index whose entries are safe relative basenames; every report independently binds itself to the exact commit, engine version/hash, and installer hash it measures.

**Tech Stack:** Node.js CommonJS, built-in `assert`, `crypto`, `fs`, `path`, existing `BundledEngineManager`, `loadCamoufoxPublisherKey`, `verifyCamoufoxReleaseResources`, and the repository's plain-script test runner.

---

## Fixed contracts used by every task

The implementation must use these gate IDs and preserve this order:

```js
const GATE_IDS = Object.freeze([
  'artifact-trust',
  'publisher-ceremony',
  'configured-identity',
  'storage-isolation',
  'crash-durability',
  'graphics-fingerprint',
  'real-proxy-network',
  'resource-capacity',
  'packaged-ui',
  'clean-install-upgrade'
]);
```

The evidence directory contains `evidence-index.json`, and the index contains only safe relative JSON basenames:

```json
{
  "schema": "lhm.camoufox-preflight.index.v1",
  "candidate": {
    "commit": "0123456789abcdef0123456789abcdef01234567",
    "engineVersion": "156.0.1",
    "engineSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "installerSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  "reports": {
    "artifactArchive": "artifact-archive.json",
    "identity": "identity.json",
    "isolation": "isolation.json",
    "crash": "crash.json",
    "graphics": "graphics.json",
    "network": "network.json",
    "resources": ["resource-8gb-light-c1.json"],
    "packagedUi": "packaged-ui.json"
  }
}
```

Every automated evidence report uses this common envelope, with gate-specific data in `result`:

```json
{
  "schema": "lhm.camoufox-preflight.evidence.v1",
  "kind": "identity",
  "generatedAt": "2026-11-11T04:00:00.000Z",
  "candidate": {
    "commit": "0123456789abcdef0123456789abcdef01234567",
    "engineVersion": "156.0.1",
    "engineSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "installerSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  "environment": "windows-installed-engine",
  "result": {}
}
```

`artifactArchive`, `identity`, `isolation`, `crash`, `graphics`, and `network` must bind all four candidate fields. The archive report is produced by the existing pinned download/install verification and records the observed archive SHA-256/byte count; the preflight itself remains network-free and does not download the archive. Resource reports retain their existing `lhm.browser-resource.evidence.v1` schema and bind `commit`, `app.sha256`, `engine.version`, and `engine.sha256`. Packaged-UI evidence binds `commit`, `installerSha256`, and its packaged artifact hash. A gate ignores unknown fields but never trusts them.

The two owner receipts have separate, exact schemas:

```json
{
  "schema": "lhm.camoufox-publisher-ceremony.v1",
  "generatedAt": "2026-11-11T04:00:00.000Z",
  "publicKeySpkiSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "environmentClass": "owner-offline-production",
  "privateKeyEncryptedOutsideGit": true,
  "independentFromLicenseKey": true,
  "twoOfflineBackups": true,
  "ownerApprovalId": "QD-02"
}
```

```json
{
  "schema": "lhm.camoufox-clean-install.v1",
  "generatedAt": "2026-11-11T04:00:00.000Z",
  "installerSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "environmentClass": "clean-windows-vm",
  "freshInstallPass": true,
  "upgradePass": true,
  "uninstallRetentionChecked": true,
  "ownerApprovalId": "release-owner"
}
```

No receipt or report may contain a field name matching `/proxy|password|secret|token|cookie|account|profileName|privateKey|identityBlob|ipAddress/i`, except the allowlisted boolean `privateKeyEncryptedOutsideGit`. No serialized output may contain URLs, IPv4/IPv6 literals, PEM markers, or environment variables beginning with `CAMOU_CONFIG_`.

## Task 1: Build the pure evaluator skeleton and deterministic report

**Files:**

- Create: `src/engine/camoufoxReleasePreflight.js`
- Create: `test/camoufox-release-preflight.js`

- [ ] Write the first test with a fixture factory that produces all ten gates as valid, recent, and candidate-bound. Assert the ordered gate IDs, overall `READY_FOR_OWNER_REVIEW`, empty blockers, non-empty limitation, and no `RELEASED` state anywhere.

```js
const report=evaluateCamoufoxReleasePreflight(readyInput(), {
 now:new Date('2026-11-11T05:00:00.000Z')
});
assert.equal(report.schema,'lhm.camoufox-release-preflight.v1');
assert.equal(report.overall,'READY_FOR_OWNER_REVIEW');
assert.deepEqual(report.gates.map(g=>g.id),GATE_IDS);
assert.deepEqual(report.blockers,[]);
assert.match(report.limitation,/does not prove.*associate profiles/i);
assert(!JSON.stringify(report).includes('RELEASED'));
```

- [ ] Run the focused test and confirm the expected failure because the module does not exist.

Run: `node test/camoufox-release-preflight.js`

Expected: non-zero exit and `Cannot find module '../src/engine/camoufoxReleasePreflight'`.

- [ ] Implement the minimal public API, constants, candidate validation, deterministic gate ordering, blocker collection, manual-assertion collection, and overall-state calculation.

```js
'use strict';

const GATE_IDS=Object.freeze([
 'artifact-trust','publisher-ceremony','configured-identity',
 'storage-isolation','crash-durability','graphics-fingerprint',
 'real-proxy-network','resource-capacity','packaged-ui',
 'clean-install-upgrade'
]);
const LIMITATION='This result does not prove that a website cannot associate profiles.';
const STATUS=new Set(['PASS','BLOCKED','MANUAL_REQUIRED']);

function gate(id,status,reason,evidence=null){
 if(!GATE_IDS.includes(id)||!STATUS.has(status)||typeof reason!=='string'||!reason)
  throw Error('Invalid Camoufox preflight gate');
 return {id,status,reason,evidence};
}

function finalize(candidate,gates,generatedAt){
 const ordered=GATE_IDS.map(id=>gates.find(item=>item.id===id));
 if(ordered.some(item=>!item))throw Error('Camoufox preflight omitted a required gate');
 const blockers=ordered.filter(item=>item.status!=='PASS')
  .map(item=>({gate:item.id,status:item.status,reason:item.reason}));
 return {
  schema:'lhm.camoufox-release-preflight.v1',generatedAt,candidate,
  overall:blockers.length?'BLOCKED':'READY_FOR_OWNER_REVIEW',
  gates:ordered,blockers,
  manualAssertions:ordered.filter(item=>item.id==='publisher-ceremony'||
   item.id==='clean-install-upgrade').map(item=>({gate:item.id,status:item.status})),
  limitation:LIMITATION
 };
}
```

- [ ] Add tests showing one `BLOCKED` gate forces overall `BLOCKED`, missing gate data never passes, output is stable for the same `now`, and invalid candidate hashes/commit/version throw.

- [ ] Run `node test/camoufox-release-preflight.js` and confirm it prints `Camoufox release preflight evaluator PASS`.

- [ ] Commit the evaluator skeleton.

```powershell
git add src/engine/camoufoxReleasePreflight.js test/camoufox-release-preflight.js
git commit -m "feat: add Camoufox release preflight evaluator"
```

## Task 2: Enforce evidence freshness, candidate binding, and privacy allowlists

**Files:**

- Modify: `src/engine/camoufoxReleasePreflight.js`
- Modify: `test/camoufox-release-preflight.js`

- [ ] Add table-driven failing tests for wrong commit, engine version, engine SHA-256, installer SHA-256, unsupported schema, invalid timestamp, timestamp in the future by more than five minutes, age over 30 days, wrong report `kind`, and non-installed environment where installed evidence is required.

```js
for(const [label,mutate,expected] of bindingCases){
 const input=readyInput();
 mutate(input);
 const result=evaluateCamoufoxReleasePreflight(input,{now:NOW});
 assert.equal(result.overall,'BLOCKED',label);
 assert.match(result.blockers[0].reason,expected,label);
}
```

- [ ] Add failing tests that inject proxy credentials, raw IP addresses, URLs, cookies, a PEM marker, `CAMOU_CONFIG_1`, an identity blob, and a profile name into nested report/receipt data. Assert the evaluator throws before producing a report and the error never echoes the injected value.

- [ ] Implement exact binding/freshness validators and a recursive privacy scanner. Do not stringify an unsafe value into an error message.

```js
const MAX_AGE_MS=30*24*60*60*1000;
const MAX_FUTURE_MS=5*60*1000;
const FORBIDDEN_KEY=/proxy|password|secret|token|cookie|account|profileName|privateKey|identityBlob|ipAddress/i;
const SAFE_PRIVATE_KEY_FIELD='privateKeyEncryptedOutsideGit';

function validateFreshTimestamp(value,now){
 const ms=Date.parse(value);
 if(!Number.isFinite(ms))throw Error('Evidence timestamp is invalid');
 const age=now.getTime()-ms;
 if(age>MAX_AGE_MS)throw Error('Evidence is older than 30 days');
 if(age < -MAX_FUTURE_MS)throw Error('Evidence timestamp is in the future');
 return new Date(ms).toISOString();
}

function assertPrivacySafe(value,key='root'){
 if(key!==SAFE_PRIVATE_KEY_FIELD&&FORBIDDEN_KEY.test(key))
  throw Error('Evidence contains a forbidden field');
 if(typeof value==='string'&&(
   /https?:\/\//i.test(value)||/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)||
   /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(value)||
   /(?:^|[\s\[\]()])(?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}(?:$|[\s\[\]()])/i.test(value)||
   /CAMOU_CONFIG_/i.test(value)))
  throw Error('Evidence contains forbidden sensitive data');
 if(Array.isArray(value))return value.forEach(item=>assertPrivacySafe(item,'item'));
 if(value&&typeof value==='object')for(const [child,entry] of Object.entries(value))
  assertPrivacySafe(entry,child);
}
```

- [ ] Keep evidence names in the final report to `path.basename(...)` only. Add a test passing a deeply nested absolute fixture path and assert the output contains only `identity.json`, never its parent directory.

- [ ] Run the focused test and confirm all binding/privacy cases pass.

Run: `node test/camoufox-release-preflight.js`

- [ ] Commit the validation layer.

```powershell
git add src/engine/camoufoxReleasePreflight.js test/camoufox-release-preflight.js
git commit -m "feat: bind and sanitize Camoufox release evidence"
```

## Task 3: Implement identity, isolation, crash, and graphics gates

**Files:**

- Modify: `src/engine/camoufoxReleasePreflight.js`
- Modify: `test/camoufox-release-preflight.js`

- [ ] Add failing tests for configured identity. PASS requires two distinct synthetic IDs; each must match its own expectations at launch and restart. Each extended point must be exactly `MEASURED`, `UNSUPPORTED`, or `BLOCKED`; `BLOCKED`, duplicate IDs, or a mismatch blocks the gate.

```js
result:{
 profiles:[
  {syntheticId:'A',launchMatches:true,restartMatches:true,
   extended:{timezone:'MEASURED',locale:'MEASURED',hardware:'MEASURED'}},
  {syntheticId:'B',launchMatches:true,restartMatches:true,
   extended:{timezone:'MEASURED',locale:'MEASURED',hardware:'UNSUPPORTED'}}
 ]
}
```

- [ ] Add failing tests for storage isolation. PASS requires exactly these conditions to be `PASS`: `baseline`, `concurrentCrossWrite`, `snapshotRestore`, `configBackupRestore`, `httpCache`, and `faviconCache`.

- [ ] Add crash-durability tests for three cases:

  1. 10-second idle flush is `PASS`, and 1.5-second recovery is also `PASS` → gate PASS.
  2. 10-second idle flush is `PASS`, and 1.5-second result is the exact accepted known finding → gate PASS with a reason that explicitly says the bounded 1.5-second finding was observed.
  3. Any changed B field, crossed marker, additional reverted A field, missing persistence, or failed 10-second result → gate BLOCKED.

Use this exact accepted shape:

```js
shortCrash:{
 status:'KNOWN_FINDING',idleMs:1500,
 revertedFields:['localStorage'],
 aLocalStorageEqualsPriorCommitted:true,
 allOtherAFieldsPersisted:true,
 allBFieldsUnchanged:true,
 crossedProfileMarkers:0
}
```

- [ ] Add graphics tests. PASS requires `headful === true`, `realGpu === true`, two profiles, `vendorCompared === 2`, `rendererCompared === 2`, both match, Canvas and OfflineAudio status `MEASURED`, and font probe status `MEASURED` with `claim === 'probe-only'`.

- [ ] Implement four small evaluator functions returning `gate(...)`; call each only after common binding/freshness checks pass.

- [ ] Run focused tests and confirm all four gates pass only for the exact accepted shapes.

Run: `node test/camoufox-release-preflight.js`

- [ ] Commit the four evidence gates.

```powershell
git add src/engine/camoufoxReleasePreflight.js test/camoufox-release-preflight.js
git commit -m "feat: evaluate Camoufox privacy and durability evidence"
```

## Task 4: Implement network, resource-capacity, and packaged-UI gates

**Files:**

- Modify: `src/engine/camoufoxReleasePreflight.js`
- Modify: `test/camoufox-release-preflight.js`

- [ ] Add real-network failing tests. PASS requires all of the following; a lab-only P1 observation never substitutes for P2:

```js
result:{
 transportControl:{status:'PASS',udpWorks:true},
 directPublicStun:{status:'PASS',candidatesClassified:true},
 realProxyP2:{status:'PASS',unexpectedPublicCandidateCount:0},
 dns:{status:'PASS',followedRealProxyRoute:true},
 runtimeVsManager:{status:'PASS',bothObserved:true,agree:true},
 labProxyP1:{status:'PASS',supportingOnly:true}
}
```

- [ ] Add tests proving `NOT_RUN`, missing P2, unexpected public candidates, failed DNS routing, or disagreeing runtime/manager observations block the network gate with the exact next measurement in the reason.

- [ ] Add resource-capacity tests for the complete required matrix: RAM tiers 8/16/32 GiB × workloads `light`/`medium`/`heavy` × concurrency 1/3/5/10. Build 36 valid resource reports in the fixture, then remove each matrix entry in a loop and assert the gate becomes BLOCKED without interpolation.

```js
const REQUIRED_RESOURCE_MATRIX=Object.freeze(
 [8,16,32].flatMap(ramGiB=>
  ['light','medium','heavy'].flatMap(workload=>
   [1,3,5,10].map(concurrency=>({ramGiB,workload,concurrency}))))
);
```

- [ ] For every resource report, require existing schema `lhm.browser-resource.evidence.v1`, exact candidate binding, `engine.id === 'camoufox'`, at least ten samples, `crashCount === 0`, `cleanup.status === 'PASS'`, `cleanup.remainingPids === 0`, and `headroomPolicy.minimumAvailableRatio === 0.20`. Classify `system.totalRamBytes` into a tier only when within ±5% of 8, 16, or 32 GiB.

- [ ] Add packaged-UI tests requiring exit code zero, empty stderr, exact installer SHA binding, and all 13 required captures with distinct safe basenames and `bytes >= 100000`.

```js
result:{
 exitCode:0,stderr:'',requiredCaptureCount:13,
 captures:Array.from({length:13},(_,i)=>({name:`capture-${i+1}.png`,bytes:110000+i}))
}
```

- [ ] Implement these three gate evaluators and make blocker reasons identify only safe matrix labels or basenames, never machine paths.

- [ ] Run the focused test.

Run: `node test/camoufox-release-preflight.js`

Expected: exit 0 and the PASS message.

- [ ] Commit the network/resource/UI gates.

```powershell
git add src/engine/camoufoxReleasePreflight.js test/camoufox-release-preflight.js
git commit -m "feat: evaluate Camoufox network resource and UI gates"
```

## Task 5: Implement artifact trust and the two owner-receipt gates

**Files:**

- Modify: `src/engine/camoufoxReleasePreflight.js`
- Modify: `test/camoufox-release-preflight.js`

- [ ] Add artifact-trust tests for one fully verified candidate and one failure per fact: resource pair not configured, release/installed version mismatch, observed archive hash/size disagreement with the descriptor, installed manifest failure, entry SHA mismatch, packaged payload present, and private-key material found.

Use a pure input produced by the future CLI adapter:

```js
artifact:{
 resourcesConfigured:true,releaseVersion:'156.0.1',installedVersion:'156.0.1',
 releaseArchiveSha256:'d619b42d96cbc9bfadbf2e89dea5aba860b3d29c8b700b4af099a0412914b869',
 releaseArchiveBytes:1355084308,
 observedArchiveSha256:'d619b42d96cbc9bfadbf2e89dea5aba860b3d29c8b700b4af099a0412914b869',
 observedArchiveBytes:1355084308,
 installedEntrySha256:'a235730786ee4e27b7e5087751509b2d456b0f03ce73d04bbb1b9077458764c6',
 installedFileCount:1579,installedVerified:true,
 descriptorManifestAgrees:true,noPackagedPayload:true,noPrivateKeyMaterial:true
}
```

- [ ] Add publisher-ceremony receipt tests. Missing receipt yields `MANUAL_REQUIRED`; wrong schema, stale timestamp, wrong SPKI digest, non-production environment, false checklist boolean, or an approval ID other than `QD-02` yields `BLOCKED`.

- [ ] Add clean-install receipt tests with the same missing/manual distinction. PASS requires the exact installer hash, clean Windows VM environment, fresh install, upgrade, uninstall-retention check, and a non-empty owner approval ID.

- [ ] Implement `evaluateArtifactTrust`, `evaluatePublisherCeremony`, and `evaluateCleanInstall`. Record the two receipt gates in `manualAssertions` even when they pass, because they remain owner assertions rather than independently proven physical facts.

- [ ] Run the focused test and commit.

```powershell
node test/camoufox-release-preflight.js
git add src/engine/camoufoxReleasePreflight.js test/camoufox-release-preflight.js
git commit -m "feat: evaluate Camoufox trust and owner receipts"
```

## Task 6: Add the read-only filesystem and CLI adapter

**Files:**

- Create: `tools/camoufox-release-preflight.js`
- Modify: `test/camoufox-release-preflight.js`

- [ ] Add CLI tests using a temporary fixture tree. Spawn the CLI with these exact required arguments:

```powershell
node tools/camoufox-release-preflight.js `
  --resources-dir "C:\candidate\resources" `
  --engine-dir "C:\candidate\engine" `
  --installer "C:\candidate\LHM-Setup.exe" `
  --evidence-dir "C:\candidate\evidence" `
  --publisher-receipt "C:\candidate\publisher-receipt.json" `
  --clean-install-receipt "C:\candidate\clean-install-receipt.json"
```

- [ ] Assert exit codes: ready fixture = 0, valid blocked fixture = 2, and bad arguments/unsafe paths/malformed JSON/internal verification error = 1. A required receipt flag whose absolute target does not yet exist is a valid missing manual assertion and exits 2; an existing malformed/unsafe receipt exits 1. Stdout must contain exactly one JSON document; stderr contains only a bounded generic error for exit 1.

- [ ] Add argument/path tests: duplicate/unknown/missing flags, all relative paths, symlinked input root/file, non-file installer, evidence filename traversal, nested evidence filename, absolute evidence filename, and unsupported file type.

- [ ] Add JSON-size tests: index/reports/receipts over 1 MiB fail before parsing. Add an installer larger than the read buffer and assert its SHA-256 is correct, proving streaming hashing.

- [ ] Add an I/O-instrumented child-process test that snapshots every file's size/mtime/hash before and after both ready and blocked runs; assert no file was created, removed, or changed. Start a loopback HTTP server and pass its URL inside an ignored field; assert the server receives zero requests. Also run with `HTTP_PROXY`/`HTTPS_PROXY` set to the loopback server and assert zero requests.

- [ ] Implement strict argument parsing and helpers with no write methods in the production file.

```js
const REQUIRED_FLAGS=Object.freeze([
 '--resources-dir','--engine-dir','--installer','--evidence-dir',
 '--publisher-receipt','--clean-install-receipt'
]);

function requireAbsoluteRegularPath(filename,kind){
 if(typeof filename!=='string'||!path.isAbsolute(filename))
  throw Error(kind+' path must be absolute');
 const stat=fs.lstatSync(filename);
 if(stat.isSymbolicLink())throw Error(kind+' path must not be a symlink');
 return stat;
}

function loadBoundedJson(filename){
 const stat=requireAbsoluteRegularPath(filename,'JSON evidence');
 if(!stat.isFile()||stat.size<2||stat.size>1024*1024)
  throw Error('JSON evidence must be a regular file no larger than 1 MiB');
 return JSON.parse(fs.readFileSync(filename,'utf8'));
}

function loadOptionalReceipt(filename){
 if(typeof filename!=='string'||!path.isAbsolute(filename))
  throw Error('Receipt path must be absolute');
 if(!fs.existsSync(filename))return null;
 return loadBoundedJson(filename);
}

function safeEvidenceFile(root,name){
 if(typeof name!=='string'||path.basename(name)!==name||!/^[-A-Za-z0-9_.]+\.json$/.test(name))
  throw Error('Evidence index contains an unsafe filename');
 const file=path.join(root,name);
 requireAbsoluteRegularPath(file,'Evidence');
 return file;
}

async function sha256Stream(filename){
 const hash=crypto.createHash('sha256');
 await pipeline(fs.createReadStream(filename),hash);
 return hash.digest('hex');
}
```

- [ ] In the adapter, verify the packaged resource directory through `verifyCamoufoxReleaseResources(resourcesDir)`, load the publisher key through `loadCamoufoxPublisherKey(resourcesDir)`, and verify the installed tree with:

```js
const installed=new BundledEngineManager(engineDir,{
 publicKey,platform:'win32',engine:'camoufox',
 inspect:(_family,filename)=>{
  const stat=fs.lstatSync(filename);
  return {sha256:sha256File(filename).sha256,bytes:stat.size};
 }
}).verify();
```

The injected `inspect` is limited to hash/size consistency because the preflight verifies an already-installed signed tree; clean-VM binary launch remains in the owner receipt.

- [ ] Compute the packaged public-key SPKI digest with DER bytes, never by hashing PEM text:

```js
const publicKeySpkiSha256=crypto.createHash('sha256')
 .update(publicKey.export({format:'der',type:'spki'})).digest('hex');
```

- [ ] Build the pure evaluator input from the verified artifacts and parsed evidence. Print `JSON.stringify(report)` to stdout. Set `process.exitCode = report.overall === 'READY_FOR_OWNER_REVIEW' ? 0 : 2`; on caught errors print only `Camoufox release preflight: <bounded message>` and set exit 1.

- [ ] Run syntax, focused tests, and manual help/error smoke.

```powershell
node --check tools/camoufox-release-preflight.js
node --check src/engine/camoufoxReleasePreflight.js
node test/camoufox-release-preflight.js
node tools/camoufox-release-preflight.js
```

Expected: first three commands exit 0; the final command exits 1 with a missing-arguments error and no stack trace.

- [ ] Commit the adapter.

```powershell
git add tools/camoufox-release-preflight.js test/camoufox-release-preflight.js
git commit -m "feat: add read-only Camoufox preflight CLI"
```

## Task 7: Integrate tests and release-day documentation

**Files:**

- Modify: `package.json`
- Modify: `docs/agents/agent-r6/RELEASE-DAY-CHECKLIST.md`
- Modify: `docs/acceptance/CAMOUFOX_RC1_WINDOWS_20261111.md`

- [ ] Add a named operator script and add the test exactly once to the full step chain:

```json
"camoufox:release-preflight": "node tools/camoufox-release-preflight.js",
"test:steps": "... && node test/camoufox-release-preflight.js && ..."
```

Place the new test immediately after `node test/camoufox-capability-policy.js` so the related release/capability checks remain adjacent.

- [ ] Extend the release-day checklist with a preflight section after clean-machine measurement and before capability activation. Include the exact six-argument command, exit-code table, the fact that exit 0 means owner review only, and the prohibitions on network activity, publication, signing, installation, and capability editing.

- [ ] Update the RC acceptance document with the actual expected current result: `BLOCKED`. Name only these incomplete categories: production publisher ceremony, real proxy P2/DNS/runtime egress, all required resource matrix rows, and clean install/upgrade receipt. Do not claim the test has run until Task 8 records the output.

- [ ] Add a documentation test assertion to `test/camoufox-release-preflight.js` that the checklist contains `READY_FOR_OWNER_REVIEW`, exit codes 0/1/2, and `capabilities.json` is never edited by the command.

- [ ] Run the focused test and verify package JSON parses.

```powershell
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json PASS')"
node test/camoufox-release-preflight.js
npm run test:all -- --filter camoufox-release-preflight
```

Expected: all three commands exit 0; the filtered runner selects exactly one step.

- [ ] Commit integration and documentation.

```powershell
git add package.json docs/agents/agent-r6/RELEASE-DAY-CHECKLIST.md docs/acceptance/CAMOUFOX_RC1_WINDOWS_20261111.md test/camoufox-release-preflight.js
git commit -m "docs: wire Camoufox release preflight into owner review"
```

## Task 8: Verify the current RC truthfully, then run the full regression suite

**Files:**

- Modify only if the measured result changed: `docs/acceptance/CAMOUFOX_RC1_WINDOWS_20261111.md`

- [ ] Record immutable before-state hashes and GitHub/capability facts without changing them.

```powershell
$capBefore=(Get-FileHash -Algorithm SHA256 'resources/camoufox-engine/capabilities.json').Hash
$releaseBefore=(Get-FileHash -Algorithm SHA256 'resources/camoufox-engine/release.json').Hash
git status --short
```

Expected: working tree clean before creating any external evidence fixtures; `capabilities.json` still has `releases: []`.

- [ ] Run the preflight against the current RC and external evidence under `D:\LHM-Camoufox-Release\release-evidence`, using the actual absolute installer/engine/resource paths. For each owner receipt that does not exist, pass a deliberate absolute nonexistent filename; `loadOptionalReceipt` must convert that absence to `MANUAL_REQUIRED`. Do not invent a receipt or use `present:false`. The resulting valid evaluation must exit 2, not 1.

Expected overall: `BLOCKED`.

Expected blockers: production publisher ceremony; real proxy P2/DNS/runtime egress; missing 8/16/32-GiB matrix rows; clean install/upgrade receipt. Artifact trust, installed-engine checks, existing identity/isolation/graphics/packaged-UI gates must reflect their real evidence rather than being force-passed.

- [ ] Save the JSON output outside Git, then verify it contains no proxy endpoint, IP, credential, account, cookie, profile name, identity payload, or private-key material.

- [ ] Recompute immutable hashes and assert no mutation.

```powershell
$capAfter=(Get-FileHash -Algorithm SHA256 'resources/camoufox-engine/capabilities.json').Hash
$releaseAfter=(Get-FileHash -Algorithm SHA256 'resources/camoufox-engine/release.json').Hash
if($capBefore -ne $capAfter){throw 'capabilities.json changed'}
if($releaseBefore -ne $releaseAfter){throw 'release.json changed'}
git status --short
```

- [ ] Run focused Camoufox release tests.

```powershell
node test/camoufox-release-preflight.js
node test/camoufox-release-resources.js
node test/camoufox-capability-policy.js
node test/camoufox-production-trust-anchor.js
node test/camoufox-release-descriptor.js
```

Expected: all exit 0.

- [ ] Run the complete test suite.

Run: `npm test`

Expected: all pretests pass and `test/run-all.js` reports every selected step PASS.

- [ ] Build the Windows installer and verify packaged release resources.

```powershell
npm run build:win
node tools/verify-camoufox-release-resources.js 'dist/win-unpacked/resources/lhm-camoufox'
```

Expected: build exits 0; resource verifier returns JSON with `configured:true`, version `156.0.1`, 1,579 files, and archive SHA-256 `d619b42d96cbc9bfadbf2e89dea5aba860b3d29c8b700b4af099a0412914b869`.

- [ ] If the installer hash changes because the CLI/docs were packaged differently, do not reuse old packaged-UI or clean-install evidence. Update the acceptance document to mark those exact-hash gates stale and BLOCKED until rerun.

- [ ] Run placeholder and type-consistency scans on changed files.

```powershell
rg -n "TODO|TBD|FIXME|PLACEHOLDER|100%|undetect|né phát hiện|tránh liên kết" src/engine/camoufoxReleasePreflight.js tools/camoufox-release-preflight.js test/camoufox-release-preflight.js docs/agents/agent-r6/RELEASE-DAY-CHECKLIST.md docs/acceptance/CAMOUFOX_RC1_WINDOWS_20261111.md
node --check src/engine/camoufoxReleasePreflight.js
node --check tools/camoufox-release-preflight.js
```

Expected: `rg` finds no placeholders or evasion/absolute claims in new text; both syntax checks exit 0.

- [ ] Review the final diff against every design acceptance criterion, then commit only truthful measured-document changes, if any.

```powershell
git diff --check
git status --short
git diff -- docs/acceptance/CAMOUFOX_RC1_WINDOWS_20261111.md
git add docs/acceptance/CAMOUFOX_RC1_WINDOWS_20261111.md
git commit -m "test: record Camoufox preflight RC result"
```

Skip the final commit when the acceptance document did not change. Do not edit `resources/camoufox-engine/capabilities.json`, publish the draft release, or create a production-key claim as part of this plan.

## Final implementation review checklist

- [ ] The successful state is exactly `READY_FOR_OWNER_REVIEW`; no path yields `RELEASED`.
- [ ] All ten gates are present, ordered, fail-closed, and candidate-bound.
- [ ] The 1.5-second localStorage finding is accepted only in the exact bounded form; the 10-second recovery must still pass.
- [ ] Resource capacity covers all 36 approved combinations and never interpolates.
- [ ] Publisher ceremony and clean-install receipts remain explicit owner assertions.
- [ ] CLI input paths are absolute, non-symlinked, bounded, and evidence-index filenames cannot escape their root.
- [ ] Installer hashing streams data; no multi-gigabyte artifact is loaded into memory.
- [ ] The command makes zero filesystem writes, zero network requests, and prints no sensitive evidence.
- [ ] Current RC remains BLOCKED for real missing gates; capability policy and draft release state remain unchanged.
- [ ] Full tests and Windows build pass, or any failure is reported without weakening a gate.
