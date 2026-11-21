'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {verifyStorageReport}=require('../tools/verify-stage0-isolation-ci');
const root=path.join(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,'.github/workflows/camoufox-upstream-smoke.yml'),'utf8');
const isolation=fs.readFileSync(path.join(root,'stage0-measure/run-isolation.js'),'utf8');
assert(workflow.includes('node stage0-measure/run-isolation.js'));
assert.match(workflow,/- name: Set up Node.js 22 for storage isolation\s+uses: actions\/setup-node@v4\s+with:\s+node-version: '22'\s+- name: Measure synthetic local storage isolation/,
 'Storage and backup require Node 22 with node:sqlite');
assert(!workflow.includes('node stage0-measure/run.js'));
assert(!workflow.includes('node stage0-measure/run-config.js'));
assert(!workflow.includes('node tools/verify-stage0-ci-reports.js'));
for(const disallowed of ['captureEnvironment(', 'captureExtended(', 'equalAcrossProfiles'])
 assert(!isolation.includes(disallowed),'Storage-only runner must not compare browser signals');
const sha='a'.repeat(40),digest='b'.repeat(64);
const conditions=Object.fromEntries(['baselineClassic','concurrentCrossWrite','crashRecovery',
 'crashRecoveryIdleFlush','crashRecoveryKillSweep','dirSnapshotRestore','configBackupRestore','httpCache'].map(k=>[k,{status:'PASS'}]));
conditions.faviconCache={status:'NOT_RUN'};
const report={classification:'LOCAL_STAGE0_ISOLATION_EXTENDED',platform:'win32',branchHead:sha,
 engine:{sha256:digest},conditions,cleanup:'PASS',network:{proxy:'NOT_RUN',dns:'NOT_RUN',webrtc:'NOT_RUN',externalEgress:'NOT_RUN'},
 signedReleaseAcceptance:'NOT_RUN',installedClientAcceptance:'NOT_RUN'};
assert.equal(verifyStorageReport({report,commitSha:sha,exeSha256:digest}).result,'PASS_STORAGE_ONLY');
const patched='1f1df2f8a2681d45dc2b37d24b75f45fc294ca0bb84f7f0dfdb987bc399cd331';
const patchedReport={...report,engine:{sha256:patched}};
assert.throws(()=>verifyStorageReport({report:patchedReport,commitSha:sha,exeSha256:patched}),/engine content mismatch/);
assert.equal(verifyStorageReport({report:{...patchedReport,engine:{...patchedReport.engine,
 manifestPayloadSha256:'c0595098721d0ca47e88e62a7cce7752b7e7ce8b5f421e7cfc4e4fcc5d6f19be',
 requestedDurabilityPreferences:{'dom.storage.flush_timeout_ms':0}}},commitSha:sha,exeSha256:patched}).result,'PASS_STORAGE_ONLY');
assert.throws(()=>verifyStorageReport({report:{...report,branchHead:'c'.repeat(40)},commitSha:sha,exeSha256:digest}),/commit/i);
assert.throws(()=>verifyStorageReport({report:{...report,conditions:{...conditions,concurrentCrossWrite:{status:'NOT_RUN'}}},commitSha:sha,exeSha256:digest}),/concurrentCrossWrite/);
assert.throws(()=>verifyStorageReport({report:{...report,network:{...report.network,dns:'PASS'}},commitSha:sha,exeSha256:digest}),/network/i);
assert.throws(()=>verifyStorageReport({report:{...report,browserExposedValues:{}},commitSha:sha,exeSha256:digest}),/signal/i);
assert.throws(()=>verifyStorageReport({report:{...report,conditions:{...conditions,crashRecoveryKillSweep:{status:'FAIL'}}},commitSha:sha,exeSha256:digest}),/crashRecoveryKillSweep/);
// Upstream baseline: isolation must pass; only localStorage durability of the
// killed profile may FAIL, and the result is reported, not hidden.
{
 const {verifyUpstreamBaseline}=require('../tools/verify-stage0-isolation-ci');
 const fields=['cookie','localStorage','indexedDB','cacheStorage','serviceWorker'];
 const crashChecks=lost=>Object.fromEntries(fields.map(f=>[f,{aHadMarkerBeforeCrash:true,
  aMarkerIntactAfterCrash:!lost.includes(f),bUnchangedByCrashOfA:true}]));
 const sample=(offsetMs,ls)=>({offsetMs,gated:offsetMs>=500,
  fields:{cookie:'last',localStorage:ls,indexedDB:'last'}});
 const base={...report,conditions:{...conditions,
  crashRecovery:{status:'FAIL',profileFunctionalAfterReopen:true,checks:crashChecks(['localStorage'])},
  crashRecoveryKillSweep:{status:'FAIL',bUnchangedByKillsOfA:true,profileFunctionalAfterReopen:true,
   samples:[sample(0,'other'),sample(1500,'other'),sample(6000,'last')]}}};
 const ok=verifyUpstreamBaseline({report:base,commitSha:sha,exeSha256:digest});
 assert.equal(ok.localStorageCrashDurability,'FAIL');
 assert.deepEqual(ok.localStorageKeptAtOffsetsMs,[6000]);
 assert.throws(()=>verifyStorageReport({report:base,commitSha:sha,exeSha256:digest}),/crashRecovery/);
 const withCrash=patch=>({...base,conditions:{...base.conditions,crashRecovery:{...base.conditions.crashRecovery,...patch}}});
 assert.throws(()=>verifyUpstreamBaseline({report:withCrash({checks:crashChecks(['localStorage','indexedDB'])}),
  commitSha:sha,exeSha256:digest}),/indexedDB lost/);
 const leak=crashChecks(['localStorage']);leak.cookie.bUnchangedByCrashOfA=false;
 assert.throws(()=>verifyUpstreamBaseline({report:withCrash({checks:leak}),commitSha:sha,exeSha256:digest}),/other profile/);
 assert.throws(()=>verifyUpstreamBaseline({report:{...base,conditions:{...base.conditions,
  crashRecoveryKillSweep:{status:'FAIL',reason:'launch timeout'}}},commitSha:sha,exeSha256:digest}),/not measured/);
 assert.throws(()=>verifyUpstreamBaseline({report:{...base,conditions:{...base.conditions,
  crashRecoveryKillSweep:{...base.conditions.crashRecoveryKillSweep,samples:[{...sample(1500,'other'),
   fields:{cookie:'other',localStorage:'other',indexedDB:'last'}}]}}},commitSha:sha,exeSha256:digest}),/cookie lost/);
 assert.throws(()=>verifyUpstreamBaseline({report:{...base,conditions:{...base.conditions,
  httpCache:{status:'FAIL'}}},commitSha:sha,exeSha256:digest}),/httpCache/);
}
assert(workflow.includes('node tools/verify-stage0-isolation-ci.js --upstream-baseline'));
assert(/patched-engine-storage:[\s\S]*LHM_TEST_ENGINE_EXE_SHA256:[\s\S]*node tools\/verify-stage0-isolation-ci\.js\r?\n/.test(workflow),
 'Patched engine job must use the strict storage gate');
console.log('CI storage scope excludes browser signal comparisons and binds evidence: PASS');
