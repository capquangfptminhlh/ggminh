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
assert.throws(()=>verifyStorageReport({report:{...report,branchHead:'c'.repeat(40)},commitSha:sha,exeSha256:digest}),/commit/i);
assert.throws(()=>verifyStorageReport({report:{...report,conditions:{...conditions,concurrentCrossWrite:{status:'NOT_RUN'}}},commitSha:sha,exeSha256:digest}),/concurrentCrossWrite/);
assert.throws(()=>verifyStorageReport({report:{...report,network:{...report.network,dns:'PASS'}},commitSha:sha,exeSha256:digest}),/network/i);
assert.throws(()=>verifyStorageReport({report:{...report,browserExposedValues:{}},commitSha:sha,exeSha256:digest}),/signal/i);
assert.throws(()=>verifyStorageReport({report:{...report,conditions:{...conditions,crashRecoveryKillSweep:{status:'FAIL'}}},commitSha:sha,exeSha256:digest}),/crashRecoveryKillSweep/);
console.log('CI storage scope excludes browser signal comparisons and binds evidence: PASS');
