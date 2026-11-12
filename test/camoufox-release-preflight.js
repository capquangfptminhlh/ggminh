'use strict';
const assert=require('assert');
const crypto=require('node:crypto');
const fs=require('node:fs');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {execFile,spawnSync}=require('node:child_process');
const {promisify}=require('node:util');
const {signedPayload}=require('../src/engine/bundledEngineManager');
const {
 evaluateCamoufoxReleasePreflight,gate,GATE_IDS,validateEvidence,
 evaluateConfiguredIdentity,evaluateStorageIsolation,evaluateCrashDurability,
 evaluateGraphicsFingerprint,evaluateRealProxyNetwork,evaluateResourceCapacity,
 evaluatePackagedUi,REQUIRED_RESOURCE_MATRIX,evaluateArtifactTrust,
 evaluatePublisherCeremony,evaluateCleanInstallUpgrade
}=require('../src/engine/camoufoxReleasePreflight');

function test(name,run){try{run();}catch(error){console.error(name);throw error;}}

test('release preflight package wiring and operator documentation are explicit',()=>{
 const packageJson=JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8'));
 assert.strictEqual(packageJson.scripts['camoufox:release-preflight'],
  'node tools/camoufox-release-preflight.js');
 const steps=packageJson.scripts['test:steps'].split(' && ');
 const focusedStep='node test/camoufox-release-preflight.js';
 const capabilityStep=steps.indexOf('node test/camoufox-capability-policy.js');
 assert(capabilityStep>=0);
 assert.strictEqual(steps.filter(step=>step===focusedStep).length,1);
 assert.strictEqual(steps[capabilityStep+1],focusedStep);

 const checklist=fs.readFileSync(path.join(__dirname,'..','docs/agents/agent-r6/RELEASE-DAY-CHECKLIST.md'),'utf8');
 const acceptance=fs.readFileSync(path.join(__dirname,'..','docs/acceptance/CAMOUFOX_RC1_WINDOWS_20261111.md'),'utf8');
 const preflightStart=checklist.indexOf('## 10. Camoufox release preflight');
 const preflightEnd=checklist.indexOf('\n## 11.',preflightStart);
 const preflightSection=checklist.slice(preflightStart,preflightEnd);
 assert(preflightSection.length>0);
 assert.match(checklist,/READY_FOR_OWNER_REVIEW/);
 assert.match(checklist,/\b0\b[^\n]*READY_FOR_OWNER_REVIEW/);
 assert.match(checklist,/\b1\b[^\n]*(?:unsafe|malformed|internal)/i);
 assert.match(checklist,/\b2\b[^\n]*(?:BLOCKED|MANUAL_REQUIRED)/);
 for(const flag of ['--resources-dir','--engine-dir','--installer','--evidence-dir','--publisher-receipt','--clean-install-receipt'])
  assert(checklist.includes(flag),`release-day command must include ${flag}`);
 assert.match(preflightSection,/evidence directory must contain the release evidence index/i);
 assert.match(preflightSection,/every\s+indexed report required by that index/i);
 assert.match(preflightSection,/genuine owner receipts/i);
 assert.match(preflightSection,/receipt is absent,?\s+the report records\s+`MANUAL_REQUIRED`/i);
 assert.match(preflightSection,/Do not create or alter receipts/i);
 assert.match(preflightSection,/runs locally and is read-only/i);
 assert.match(preflightSection,/no network requests/i);
 assert.match(preflightSection,/does not install,\s+launch,\s+sign,\s+download,\s+publish,\s+delete,\s+or edit capabilities\./i);
 assert.match(preflightSection,/must never edit `resources\/camoufox-engine\/capabilities\.json`/i);
 assert.match(preflightSection,/owner must\s+review the JSON/i);
 assert.match(preflightSection,/separately decide whether to approve release or\s+activate any capability/i);
 assert.match(preflightSection,/Do not make “100%”, “undetectable”, evasion, advertising account safety, or\s+platform non-association claims/i);

 const rcStart=acceptance.indexOf('## Expected release preflight state');
 const rcEnd=acceptance.indexOf('\n## Release decision',rcStart);
 const rcSection=acceptance.slice(rcStart,rcEnd);
 assert(rcSection.length>0);
 assert.match(rcSection,/BLOCKED/);
 for(const blocker of [
  /production publisher ceremony receipt/i,
  /real proxy P2[^\n]*DNS route[^\n]*browser.runtime vs manager egress/i,
  /8\/16\/32 GiB[^\n]*workloads[^\n]*concurrency/i,
  /clean install\/upgrade\/uninstall.retention owner receipt/i
 ])assert.match(rcSection,blocker);
 assert.match(rcSection,/capability releases remain empty/i);
 assert.match(rcSection,/draft release remains unpublished/i);
 assert.match(rcSection,/Task 8 and the live release\s+preflight\s+have NOT run\./);
 assert.doesNotMatch(rcSection,/\b(?:Task 8|live (?:release )?preflight)\b[^.\n]{0,80}\b(?:has run|was run|executed|completed|passed)\b/i);
 assert.doesNotMatch(rcSection,/100%|undetectable|evasion|advertising account safety|platform non.association/i);
});

const now=new Date('2026-11-11T12:00:00.000Z');
const candidate={
 commit:'a'.repeat(40),
 engineVersion:'156.0.1',
 engineSha256:'c'.repeat(64),
 installerSha256:'d'.repeat(64)
};
const gates=GATE_IDS.map(id=>gate(id,'PASS',`${id} verified`,{
 observedAt:now.toISOString(),
 candidateCommit:candidate.commit,
 candidateEngineVersion:candidate.engineVersion,
 candidateEngineSha256:candidate.engineSha256,
 candidateInstallerSha256:candidate.installerSha256
}));

const report=evaluateCamoufoxReleasePreflight(candidate,gates,now);
assert.deepStrictEqual(report.gates.map(item=>item.id),GATE_IDS);
assert.deepStrictEqual(evaluateCamoufoxReleasePreflight(candidate,[...gates].reverse(),now).gates.map(item=>item.id),GATE_IDS);
assert.strictEqual(report.generatedAt,now.toISOString());
assert.strictEqual(report.overall,'READY_FOR_OWNER_REVIEW');
assert.deepStrictEqual(report.blockers,[]);
assert.deepStrictEqual(report.manualAssertions,[
 {gate:'publisher-ceremony',status:'PASS'},
 {gate:'clean-install-upgrade',status:'PASS'}
]);
assert(report.limitation.length>0);
assert(!JSON.stringify(report).includes('RELEASED'));
assert.deepStrictEqual(Object.keys(report.candidate).sort(),
 ['commit','engineSha256','engineVersion','installerSha256'].sort());

const blockedGates=gates.map(item=>item.id==='graphics-fingerprint'?
 gate(item.id,'BLOCKED','Graphics evidence failed',item.evidence):item);
assert.strictEqual(evaluateCamoufoxReleasePreflight(candidate,blockedGates,now).overall,'BLOCKED');
const manualGates=gates.map(item=>item.id==='publisher-ceremony'?
 gate(item.id,'MANUAL_REQUIRED','Owner ceremony review pending',item.evidence):item);
const manualReport=evaluateCamoufoxReleasePreflight(candidate,manualGates,now);
assert.strictEqual(manualReport.overall,'BLOCKED');
assert.deepStrictEqual(manualReport.blockers,[{
 gate:'publisher-ceremony',status:'MANUAL_REQUIRED',reason:'Owner ceremony review pending'
}]);
assert.deepStrictEqual(manualReport.manualAssertions,[
 {gate:'publisher-ceremony',status:'MANUAL_REQUIRED'},
 {gate:'clean-install-upgrade',status:'PASS'}
]);
assert.throws(()=>evaluateCamoufoxReleasePreflight(candidate,gates.slice(1),now),/omitted a required gate/);
assert.strictEqual(JSON.stringify(evaluateCamoufoxReleasePreflight(candidate,gates,now)),
 JSON.stringify(evaluateCamoufoxReleasePreflight(candidate,gates,now)));
for(const length of [39,41,64]) assert.throws(()=>evaluateCamoufoxReleasePreflight(
 {...candidate,commit:'a'.repeat(length)},gates,now),/Invalid Camoufox preflight candidate/);

for(const invalid of [
 {...candidate,engineSha256:'not-a-hash'},
 {...candidate,installerSha256:'not-a-hash'},
 {...candidate,commit:'not-a-commit'},
 {...candidate,engineVersion:'latest'}
]) assert.throws(()=>evaluateCamoufoxReleasePreflight(invalid,gates,now),/Invalid Camoufox preflight candidate/);
for(const invalid of [
 {...candidate,commit:['a'.repeat(40)]},
 {...candidate,commit:null},
 {...candidate,commit:1},
 {...candidate,commit:{}},
 {...candidate,engineVersion:['156.0.1']},
 {...candidate,engineVersion:null},
 {...candidate,engineVersion:156},
 {...candidate,engineVersion:{}},
 {...candidate,engineSha256:['c'.repeat(64)]},
 {...candidate,engineSha256:null},
 {...candidate,engineSha256:1},
 {...candidate,engineSha256:{}},
 {...candidate,installerSha256:['d'.repeat(64)]},
 {...candidate,installerSha256:null},
 {...candidate,installerSha256:1},
 {...candidate,installerSha256:{}}
]) assert.throws(()=>evaluateCamoufoxReleasePreflight(invalid,gates,now),/Invalid Camoufox preflight candidate/);

const rawGates=gates.map(item=>({...item}));
assert.throws(()=>evaluateCamoufoxReleasePreflight(candidate,
 [...rawGates,{id:'unrecognized',status:'PASS',reason:'unknown'}],now),/Invalid Camoufox preflight gate/);
assert.throws(()=>evaluateCamoufoxReleasePreflight(candidate,
 [...rawGates,rawGates[0]],now),/Invalid Camoufox preflight gate/);
for(const invalid of [
 {...rawGates[0],status:'RELEASED'},
 {...rawGates[0],reason:''},
 {...rawGates[0],reason:12}
]) assert.throws(()=>evaluateCamoufoxReleasePreflight(candidate,
 rawGates.map(item=>item.id===rawGates[0].id?invalid:item),now),/Invalid Camoufox preflight gate/);

const envelope={
 schema:'lhm.camoufox-preflight.evidence.v1',
 kind:'identity',
 generatedAt:'2026-11-11T04:00:00.000Z',
 candidate:{...candidate},
 environment:'windows-installed-engine',
 result:{verified:true}
};
const evidenceOptions={candidate,kind:'identity',now,requireInstalled:true};
const evidenceGateId='configured-identity';

function withGate(replacement){
 return gates.map(item=>item.id===replacement.id?replacement:item);
}

for(const [label,changes] of [
 ['commit',{candidate:{...candidate,commit:'b'.repeat(40)}}],
 ['commit case',{candidate:{...candidate,commit:candidate.commit.toUpperCase()}}],
 ['engine version',{candidate:{...candidate,engineVersion:'156.0.2'}}],
 ['engine hash',{candidate:{...candidate,engineSha256:'e'.repeat(64)}}],
 ['installer hash',{candidate:{...candidate,installerSha256:'f'.repeat(64)}}],
 ['schema',{schema:'lhm.camoufox-preflight.evidence.v2'}],
 ['kind',{kind:'graphics'}],
 ['future skew',{generatedAt:'2026-11-11T12:05:00.001Z'}],
 ['maximum age',{generatedAt:'2026-10-12T11:59:59.999Z'}],
 ['installed environment',{environment:'windows-staging-tree'}],
 ['installed environment case',{environment:'Windows-installed-engine'}]
]){
 test('blocks an evidence mismatch in '+label,()=>{
  const check=validateEvidence({...envelope,...changes},evidenceOptions);
  assert.strictEqual(check.status,'BLOCKED');
  const report=evaluateCamoufoxReleasePreflight(candidate,
   withGate(gate(evidenceGateId,check.status,check.reason)),now);
  assert.strictEqual(report.overall,'BLOCKED');
  assert.deepStrictEqual(report.blockers,[
   {gate:evidenceGateId,status:'BLOCKED',reason:check.reason}
  ]);
 });
}

for(const generatedAt of ['invalid','2026-11-31T04:00:00.000Z','2026-11-11T04:00:00',null,1]){
 test('rejects an invalid evidence timestamp '+generatedAt,()=>{
  assert.throws(()=>validateEvidence({...envelope,generatedAt},evidenceOptions),
   /^Error: Evidence timestamp is invalid$/);
 });
}

test('accepts the inclusive age and future skew limits and normalizes an offset',()=>{
 for(const [generatedAt,expected] of [
  ['2026-10-12T05:00:00-07:00','2026-10-12T12:00:00.000Z'],
  ['2026-11-11T12:05:00.000Z','2026-11-11T12:05:00.000Z']
 ]){
  assert.deepStrictEqual(validateEvidence({...envelope,generatedAt},evidenceOptions),
   {status:'PASS',generatedAt:expected,result:{verified:true}});
 }
});

test('accepts staging evidence when installed evidence is optional',()=>{
 assert.strictEqual(validateEvidence({...envelope,environment:'windows-staging-tree'},
  {...evidenceOptions,requireInstalled:false}).status,'PASS');
});

for(const [label,field,value] of [
 ['proxy credentials','proxy',{username:'inject-user',password:'inject-password'}],
 ['IPv4 address','note','Observed 192.0.2.34.'],
 ['IPv6 address','note','IP:2001:db8::34.'],
 ['IPv6 address beside punctuation','note','Observed.2001:db8::34.'],
 ['bracketed IPv6 address','note','Observed [2001:db8::34]!'],
 ['IPv4-mapped IPv6 address','note','[::ffff:192.0.2.34%interface]'],
 ['URL','note','See HTTPS://example.invalid/injected-value'],
 ['cookie','setCookie','inject-cookie=custom-value'],
 ['PEM private key','note','-----BEGIN OPENSSH PRIVATE KEY-----'],
 ['Camoufox environment variable','note','CAMOU_CONFIG_1'],
 ['identity blob','identityBlob','inject-identity'],
 ['profile name','profileName','inject-profile'],
 ['secret','sharedSecret','inject-secret'],
 ['token','refreshToken','inject-token'],
 ['password','databasePassword','inject-password'],
 ['account','accountDetails','inject-account'],
 ['private key field','PrivateKeyEncryptedOutsideGit','inject-private-key'],
 ['address in a field name','192.0.2.34',true]
]){
 test('rejects nested '+label+' in automated evidence and manual receipts',()=>{
  const nested={details:[{[field]:value}]};
  assert.throws(()=>evaluateCamoufoxReleasePreflight(candidate,
   withGate(gate('publisher-ceremony','PASS','Reviewed',nested)),now),
  /^Error: Camoufox preflight data contains private information$/);
  assert.throws(()=>validateEvidence({...envelope,result:nested},evidenceOptions),
   /^Error: Camoufox preflight data contains private information$/);
 });
}

test('allows the exact private-key ceremony assertion field',()=>{
 const evidence={privateKeyEncryptedOutsideGit:true};
 const report=evaluateCamoufoxReleasePreflight(candidate,
  withGate(gate('publisher-ceremony','PASS','Reviewed',evidence)),now);
 assert.deepStrictEqual(report.gates[1].evidence,evidence);
});

test('rejects private text in a gate reason',()=>{
 assert.throws(()=>evaluateCamoufoxReleasePreflight(candidate,
  withGate(gate(evidenceGateId,'BLOCKED','From http://example.invalid/injected-value')),now),
 /^Error: Camoufox preflight data contains private information$/);
});

test('does not reject ordinary release reasons that mention tokens',()=>{
 const report=evaluateCamoufoxReleasePreflight(candidate,
  withGate(gate(evidenceGateId,'BLOCKED','Release tokens are not applicable')),now);
 assert.strictEqual(report.blockers[0].reason,'Release tokens are not applicable');
});

for(const bad of [
 null,
 {...envelope,candidate:null},
 {...envelope,result:[]},
 {...envelope,environment:''},
]){
 test('rejects malformed evidence structures generically',()=>{
  assert.throws(()=>validateEvidence(bad,evidenceOptions),/^Error: (?:Invalid Camoufox preflight data|Invalid Camoufox preflight evidence|Invalid Camoufox preflight candidate)$/);
 });
}

test('rejects cycles without serializing or traversing them indefinitely',()=>{
 const result={};result.self=result;
 assert.throws(()=>validateEvidence({...envelope,result},evidenceOptions),
  /^Error: Invalid Camoufox preflight data$/);
});

test('rejects custom prototypes without reading serializer methods',()=>{
 const result=Object.create({toJSON(){throw Error('inject-secret');}});
 result.verified=true;
 assert.throws(()=>validateEvidence({...envelope,result},evidenceOptions),
  /^Error: Invalid Camoufox preflight data$/);
});

test('rejects evidence with a custom serializer before producing the report',()=>{
 const receipt={verified:true};
 Object.defineProperty(receipt,'toJSON',{value:()=>({secret:'inject-secret'})});
 assert.throws(()=>evaluateCamoufoxReleasePreflight(candidate,
  withGate(gate('publisher-ceremony','PASS','Reviewed',receipt)),now),
 /^Error: Invalid Camoufox preflight data$/);
});

test('rejects evidence getters without reading their values',()=>{
 const result={get note(){throw Error('inject-secret');}};
 assert.throws(()=>validateEvidence({...envelope,result},evidenceOptions),
  /^Error: Invalid Camoufox preflight data$/);
});

test('rejects proxies without invoking their traps',()=>{
 let invoked=false;
 const result=new Proxy({}, {
  getPrototypeOf(){invoked=true;throw Error('inject-secret');},
  ownKeys(){invoked=true;throw Error('inject-secret');}
 });
 assert.throws(()=>validateEvidence({...envelope,result},evidenceOptions),
  /^Error: Invalid Camoufox preflight data$/);
 assert.strictEqual(invoked,false);
});

test('rejects symbol keyed evidence without traversing hidden fields',()=>{
 const result={};
 result[Symbol('hidden')]='http://example.invalid/injected-value';
 assert.throws(()=>validateEvidence({...envelope,result},evidenceOptions),
  /^Error: Invalid Camoufox preflight data$/);
});

test('outputs only the basename of Windows and POSIX evidence paths',()=>{
 for(const file of [
  'C:\\review\\deep\\candidate\\evidence\\identity.json',
  '/review/deep/candidate/evidence/identity.json'
 ]){
  for(const evidence of [file,{file}]){
   const report=evaluateCamoufoxReleasePreflight(candidate,
    withGate(gate(evidenceGateId,'PASS','Verified',evidence)),now);
   assert.deepStrictEqual(report.gates[2].evidence,
    typeof evidence==='string'?'identity.json':{file:'identity.json'});
   assert(!JSON.stringify(report).includes('deep'));
  }
 }
});

test('detaches candidate data and excludes extra candidate fields from reports',()=>{
 const input={...candidate,buildMetadata:{branch:'release'}};
 const report=evaluateCamoufoxReleasePreflight(input,gates,now);
 assert.deepStrictEqual(report.candidate,candidate);
 assert.deepStrictEqual(Object.keys(report.candidate),[
  'commit','engineVersion','engineSha256','installerSha256'
 ]);
 input.commit='a'.repeat(39)+'b';
 input.buildMetadata.branch='injected-after-validation';
 assert.deepStrictEqual(report.candidate,candidate);
 assert(!JSON.stringify(report).includes('buildMetadata'));
});

test('detaches nested gate evidence after evaluation',()=>{
 const input={details:[{verified:true}]};
 const report=evaluateCamoufoxReleasePreflight(candidate,
  withGate(gate('publisher-ceremony','PASS','Reviewed',input)),now);
 input.details[0].verified='http://example.invalid/injected-value';
 input.details.push({later:true});
 assert.deepStrictEqual(report.gates[1].evidence,{details:[{verified:true}]});
 assert(!JSON.stringify(report).includes('example.invalid'));
});

test('detaches validated envelope results after evidence validation',()=>{
 const input={details:[{verified:true}]};
 const checked=validateEvidence({...envelope,result:input},evidenceOptions);
 input.details[0].verified='http://example.invalid/injected-value';
 input.details.push({later:true});
 assert.deepStrictEqual(checked.result,{details:[{verified:true}]});
 assert(!JSON.stringify(checked).includes('example.invalid'));
});

for(const file of ['/review/deep/..','C:\\review\\deep\\..','/review/identity.json:alternate',
 '/review/.','C:\\review\\.','/review/../identity.json','\\\\?\\C:\\review\\identity.json',
 '','relative/path/bad name.json','relative/path/file.json.','C:\\review\\CON.txt']){
 test('rejects unsafe evidence basename '+file,()=>{
  assert.throws(()=>evaluateCamoufoxReleasePreflight(candidate,
   withGate(gate(evidenceGateId,'PASS','Verified',{file})),now),
  /^Error: Invalid Camoufox preflight evidence reference$/);
 });
}

const installedEnvelope=(kind,result,overrides={})=>({
 schema:'lhm.camoufox-preflight.evidence.v1',kind,
 generatedAt:'2026-11-11T04:00:00.000Z',candidate:{...candidate},
 environment:'windows-installed-engine',result,...overrides
});
const gateContext={candidate,now,evidenceName:'C:\\private\\evidence\\gate.json'};
const identityResult={profiles:[
 {syntheticId:'SYN-A',launchMatches:true,restartMatches:true,
  extended:{timezone:'MEASURED',locale:'MEASURED',hardware:'MEASURED'}},
 {syntheticId:'SYN-B',launchMatches:true,restartMatches:true,
  extended:{timezone:'MEASURED',locale:'MEASURED',hardware:'UNSUPPORTED'}}
]};
const isolationResult={
 baseline:'PASS',concurrentCrossWrite:'PASS',snapshotRestore:'PASS',
 configBackupRestore:'PASS',httpCache:'PASS',faviconCache:'PASS'
};
const crashResult={
 idleFlush:{status:'PASS',idleMs:10000},
 shortCrash:{status:'PASS',idleMs:1500}
};
const graphicsResult={
 headful:true,realGpu:true,
 profiles:[
  {vendorCompared:2,rendererCompared:2,vendorMatches:true,rendererMatches:true,
   canvas:'MEASURED',offlineAudio:'MEASURED',font:{status:'MEASURED',claim:'probe-only'}},
  {vendorCompared:2,rendererCompared:2,vendorMatches:true,rendererMatches:true,
   canvas:'MEASURED',offlineAudio:'MEASURED',font:{status:'MEASURED',claim:'probe-only'}}
 ]
};

const networkResult={
 transportControl:{status:'PASS',udpWorks:true},
 directPublicStun:{status:'PASS',candidatesClassified:true},
 realProxyP2:{status:'PASS',unexpectedPublicCandidateCount:0},
 dns:{status:'PASS',followedRealProxyRoute:true},
 runtimeVsManager:{status:'PASS',bothObserved:true,agree:true},
 labProxyP1:{status:'PASS',supportingOnly:true}
};
const packagedUiResult={exitCode:0,stderr:'',requiredCaptureCount:13,
 captures:Array.from({length:13},(_,i)=>({name:`capture-${i+1}.png`,bytes:110000+i}))};
const gib=1024**3;
const resourceReport=(row,overrides={})=>({
 schema:'lhm.browser-resource.evidence.v1',generatedAt:'2026-11-11T04:00:00.000Z',
 commit:candidate.commit,app:{sha256:candidate.installerSha256},
 engine:{id:'camoufox',version:candidate.engineVersion,sha256:candidate.engineSha256},
 system:{totalRamBytes:row.ramGiB*gib},workload:{id:row.workload,concurrency:row.concurrency},
 sampleCount:10,samples:Array(10).fill({startupMs:100,peakWorkingSetBytes:200000,
  peakCpuPercent:5,crashed:false,cleanupOk:true}),crashCount:0,
 cleanup:{status:'PASS',remainingPids:0},headroomPolicy:{minimumAvailableRatio:0.20},...overrides
});
const resourceEntries=()=>REQUIRED_RESOURCE_MATRIX.map((row,index)=>({
 evidenceName:`reports/resource-${String(index+1).padStart(2,'0')}.json`,report:resourceReport(row)
}));

test('real proxy network accepts the complete installed-engine P2 result',()=>{
 const result=evaluateRealProxyNetwork(installedEnvelope('network',networkResult),gateContext);
 assert.deepStrictEqual(result,gate('real-proxy-network','PASS',result.reason,'gate.json'));
});
for(const [section,change] of [
 ['transportControl',r=>r.transportControl={status:'NOT_RUN',udpWorks:false}],
 ['directPublicStun',r=>r.directPublicStun={status:'PASS',candidatesClassified:false}],
 ['realProxyP2',r=>r.realProxyP2={status:'PASS',unexpectedPublicCandidateCount:1}],
 ['dns',r=>r.dns={status:'FAIL',followedRealProxyRoute:false}],
 ['runtimeVsManager',r=>r.runtimeVsManager={status:'PASS',bothObserved:true,agree:false}],
 ['labProxyP1',r=>r.labProxyP1={status:'FAIL',supportingOnly:false}]
]) test(`real proxy network blocks invalid ${section}`,()=>{
 const input=JSON.parse(JSON.stringify(networkResult));change(input);
 assert.strictEqual(evaluateRealProxyNetwork(installedEnvelope('network',input),gateContext).status,'BLOCKED');
});
test('real proxy P1 supporting evidence cannot substitute for P2',()=>{
 const input={...networkResult};delete input.realProxyP2;
 assert.strictEqual(evaluateRealProxyNetwork(installedEnvelope('network',input),gateContext).status,'BLOCKED');
});
test('real proxy network requires a typed zero count for unexpected P2 candidates',()=>{
 for(const value of ['0',null,undefined]){
  const input={...networkResult,realProxyP2:{status:'PASS',unexpectedPublicCandidateCount:value}};
  assert.strictEqual(evaluateRealProxyNetwork(installedEnvelope('network',input),gateContext).status,'BLOCKED');
 }
});
test('real proxy network blocks wrong-candidate and stale evidence',()=>{
 for(const changes of [{candidate:{...candidate,commit:'b'.repeat(40)}},{generatedAt:'2026-10-01T00:00:00.000Z'}])
  assert.strictEqual(evaluateRealProxyNetwork(installedEnvelope('network',networkResult,changes),gateContext).status,'BLOCKED');
});
test('real proxy network ignores safe unknown fields without emitting them',()=>{
 const result=evaluateRealProxyNetwork(installedEnvelope('network',{...networkResult,futureEvidence:'safe'}),gateContext);
 assert.strictEqual(result.status,'PASS');assert(!JSON.stringify(result).includes('futureEvidence'));
});
test('real proxy network rejects privacy-forbidden extra evidence fields',()=>{
 assert.throws(()=>evaluateRealProxyNetwork(installedEnvelope('network',{...networkResult,proxyPassword:'private'}),gateContext),
  /^Error: Camoufox preflight data contains private information$/);
});

test('resource capacity accepts exactly one valid report for all 36 matrix rows',()=>{
 assert.strictEqual(REQUIRED_RESOURCE_MATRIX.length,36);
 const result=evaluateResourceCapacity(resourceEntries(),{candidate,now,evidenceName:'reports/summary.json'});
 assert.strictEqual(result.status,'PASS');
 assert.deepStrictEqual(result.evidence,resourceEntries().map(entry=>entry.evidenceName.split('/').pop()).sort());
 assert(!JSON.stringify(result).includes('availableRatio'));
});
for(const row of REQUIRED_RESOURCE_MATRIX) test(`resource capacity blocks missing ${row.ramGiB}GiB-${row.workload}-c${row.concurrency}`,()=>{
 const entries=resourceEntries().filter(entry=>{
  const report=entry.report;return !(report.system.totalRamBytes===row.ramGiB*gib&&report.workload.id===row.workload&&report.workload.concurrency===row.concurrency);
 });
 assert.strictEqual(evaluateResourceCapacity(entries,{candidate,now}).status,'BLOCKED');
});
test('resource capacity blocks duplicate matrix rows',()=>{
 const entries=resourceEntries();entries.push({...entries[0],evidenceName:'duplicate.json'});
 assert.strictEqual(evaluateResourceCapacity(entries,{candidate,now}).status,'BLOCKED');
});
test('resource capacity blocks duplicate normalized report basenames',()=>{
 const entries=resourceEntries();
 entries[0].evidenceName='C:\\first\\shared.json';
 entries[1].evidenceName='/second/shared.json';
 assert.strictEqual(evaluateResourceCapacity(entries,{candidate,now}).status,'BLOCKED');
});
for(const [label,overrides] of [
 ['wrong schema',{schema:'lhm.browser-resource.evidence.v2'}],
 ['wrong commit',{commit:'b'.repeat(40)}],
 ['wrong app binding',{app:{sha256:'e'.repeat(64)}}],
 ['wrong engine version',{engine:{id:'camoufox',version:'156.0.2',sha256:candidate.engineSha256}}],
 ['wrong engine hash',{engine:{id:'camoufox',version:candidate.engineVersion,sha256:'e'.repeat(64)}}],
 ['wrong engine',{engine:{id:'other',version:candidate.engineVersion,sha256:candidate.engineSha256}}],
 ['tier outside tolerance',{system:{totalRamBytes:8*gib*1.051}}],
 ['bad workload',{workload:{id:'other',concurrency:1}}],
 ['bad concurrency',{workload:{id:'light',concurrency:2}}],
 ['too few sample count',{sampleCount:9}],
 ['too few samples',{samples:Array(9).fill({startupMs:100,peakWorkingSetBytes:200000,peakCpuPercent:5,crashed:false,cleanupOk:true})}],
 ['inconsistent samples',{sampleCount:11}],
 ['crash',{crashCount:1}],
 ['cleanup status',{cleanup:{status:'FAIL',remainingPids:0}}],
 ['remaining process',{cleanup:{status:'PASS',remainingPids:1}}],
 ['headroom policy',{headroomPolicy:{minimumAvailableRatio:0.19}}],
 ['stale report',{generatedAt:'2026-10-01T00:00:00.000Z'}],
 ['future report',{generatedAt:'2026-11-11T12:05:00.001Z'}]
]) test(`resource capacity blocks ${label}`,()=>{
 const entries=resourceEntries();entries[0].report={...entries[0].report,...overrides};
 assert.strictEqual(evaluateResourceCapacity(entries,{candidate,now}).status,'BLOCKED');
});
for(const tier of [8,16,32]) for(const boundary of ['lower','upper']) test(`resource capacity accepts ${boundary} five-percent boundary for ${tier}GiB`,()=>{
 const entries=resourceEntries();
 const target=entries.find(entry=>entry.report.system.totalRamBytes===tier*gib&&
  entry.report.workload.id==='light'&&entry.report.workload.concurrency===1);
 target.report.system.totalRamBytes=tier*gib*(boundary==='lower'?0.95:1.05);
 assert.strictEqual(evaluateResourceCapacity(entries,{candidate,now}).status,'PASS');
});
for(const tier of [8,16,32]) for(const boundary of ['lower','upper']) test(`resource capacity rejects immediately outside ${boundary} boundary for ${tier}GiB`,()=>{
 const entries=resourceEntries();
 const target=entries.find(entry=>entry.report.system.totalRamBytes===tier*gib&&
  entry.report.workload.id==='light'&&entry.report.workload.concurrency===1);
 target.report.system.totalRamBytes=tier*gib*(boundary==='lower'?0.95:1.05)+(boundary==='lower'?-1:1);
 assert.strictEqual(evaluateResourceCapacity(entries,{candidate,now}).status,'BLOCKED');
});
test('resource RAM classification ranges never overlap',()=>{
 const tiers=[8,16,32].map(tier=>({lower:tier*gib*0.95,upper:tier*gib*1.05}));
 for(let i=1;i<tiers.length;i++)assert(tiers[i-1].upper<tiers[i].lower);
 for(const {lower,upper} of tiers) for(const value of [lower-1,lower,upper,upper+1])
  assert(tiers.filter(tier=>value>=tier.lower&&value<=tier.upper).length<=1);
});
for(const [label,change] of [
 ['null sample',samples=>samples[0]=null],
 ['array sample',samples=>samples[0]=[]],
 ['missing metric',samples=>delete samples[0].startupMs],
 ['nonnumeric metric',samples=>samples[0].peakCpuPercent='5'],
 ['nonfinite metric',samples=>samples[0].peakCpuPercent=Infinity],
 ['negative metric',samples=>samples[0].peakWorkingSetBytes=-1],
 ['nonboolean crash flag',samples=>samples[0].crashed=0],
 ['sample crash',samples=>samples[0].crashed=true],
 ['sample cleanup failure',samples=>samples[0].cleanupOk=false]
]) test(`resource capacity blocks ${label}`,()=>{
 const entries=resourceEntries();change(entries[0].report.samples);
 if(label==='sample crash')entries[0].report.crashCount=1;
 assert.strictEqual(evaluateResourceCapacity(entries,{candidate,now}).status,'BLOCKED');
});
test('resource capacity blocks aggregate crash count inconsistent with samples',()=>{
 const entries=resourceEntries();entries[0].report.crashCount=1;
 assert.strictEqual(evaluateResourceCapacity(entries,{candidate,now}).status,'BLOCKED');
});
test('resource capacity reduces evidence paths to sorted safe basenames',()=>{
 const entries=resourceEntries();entries[0].evidenceName='C:\\private\\deep\\report.json';
 const result=evaluateResourceCapacity(entries,{candidate,now});
 assert(result.evidence.includes('report.json'));assert(!JSON.stringify(result).includes('private'));
});
test('resource capacity ignores safe unknown report fields without emitting them',()=>{
 const entries=resourceEntries();entries[0].report.futureEvidence='safe note';
 const result=evaluateResourceCapacity(entries,{candidate,now});
 assert.strictEqual(result.status,'PASS');assert(!JSON.stringify(result).includes('futureEvidence'));
});
test('resource capacity rejects privacy-forbidden extra report fields',()=>{
 const entries=resourceEntries();entries[0].report.profileName='private-label';
 assert.throws(()=>evaluateResourceCapacity(entries,{candidate,now}),/^Error: Camoufox preflight data contains private information$/);
});

test('packaged UI accepts 13 sufficiently sized distinct PNG captures',()=>{
 const result=evaluatePackagedUi(installedEnvelope('packaged-ui',packagedUiResult,{environment:'windows-packaged-app'}),gateContext);
 assert.deepStrictEqual(result,gate('packaged-ui','PASS',result.reason,'gate.json'));
});
for(const [label,change] of [
 ['nonzero exit',r=>r.exitCode=1],['stderr',r=>r.stderr='warning'],
 ['wrong required count',r=>r.requiredCaptureCount=12],['missing capture',r=>r.captures.pop()],
 ['duplicate capture',r=>r.captures[1].name=r.captures[0].name],
 ['case-insensitive duplicate capture',r=>r.captures[1].name=r.captures[0].name.toUpperCase()],
 ['unsafe capture',r=>r.captures[0].name='..\\private.png'],
 ['small capture',r=>r.captures[0].bytes=99999]
]) test(`packaged UI blocks ${label}`,()=>{
 const input=JSON.parse(JSON.stringify(packagedUiResult));change(input);
 assert.strictEqual(evaluatePackagedUi(installedEnvelope('packaged-ui',input,{environment:'windows-packaged-app'}),gateContext).status,'BLOCKED');
});
test('packaged UI rejects Windows and POSIX capture paths safely',()=>{
 for(const name of ['C:\\private\\capture.png','/private/capture.png']){
  const input=JSON.parse(JSON.stringify(packagedUiResult));input.captures[0].name=name;
  assert.strictEqual(evaluatePackagedUi(installedEnvelope('packaged-ui',input,{environment:'windows-packaged-app'}),gateContext).status,'BLOCKED');
 }
});
test('packaged UI blocks wrong-candidate and stale evidence',()=>{
 for(const changes of [{candidate:{...candidate,engineVersion:'156.0.2'}},{generatedAt:'2026-10-01T00:00:00.000Z'}])
  assert.strictEqual(evaluatePackagedUi(installedEnvelope('packaged-ui',packagedUiResult,{...changes,environment:'windows-packaged-app'}),gateContext).status,'BLOCKED');
});
test('packaged UI requires its packaged-app environment',()=>{
 assert.strictEqual(evaluatePackagedUi(installedEnvelope('packaged-ui',packagedUiResult),gateContext).status,'BLOCKED');
});
test('packaged UI ignores safe unknown fields and emits only the evidence basename',()=>{
 const result=evaluatePackagedUi(installedEnvelope('packaged-ui',{...packagedUiResult,futureEvidence:'safe'},
  {environment:'windows-packaged-app'}),gateContext);
 assert.strictEqual(result.evidence,'gate.json');assert(!JSON.stringify(result).includes('capture-1'));
});
test('packaged UI rejects privacy-forbidden extra evidence fields',()=>{
 assert.throws(()=>evaluatePackagedUi(installedEnvelope('packaged-ui',{...packagedUiResult,accountName:'private'},
  {environment:'windows-packaged-app'}),gateContext),/^Error: Camoufox preflight data contains private information$/);
});
const detachedGate=(evaluator,kind,result,changes={})=>evaluator(
 installedEnvelope(kind,result,changes),gateContext);

test('configured identity accepts two distinct measured synthetic identities',()=>{
 const result=detachedGate(evaluateConfiguredIdentity,'identity',identityResult);
 assert.deepStrictEqual(result,gate('configured-identity','PASS',result.reason,'gate.json'));
 assert.strictEqual(result.evidence,'gate.json');
 assert(!JSON.stringify(result).includes('SYN-'));
});
test('configured identity ignores safe unknown fields without emitting evidence data',()=>{
 const input=JSON.parse(JSON.stringify(identityResult));
 input.futureEvidence={revision:7};
 input.profiles[0].futureEvidence='candidate note';
 const result=detachedGate(evaluateConfiguredIdentity,'identity',input);
 assert.strictEqual(result.status,'PASS');
 assert.strictEqual(result.evidence,'gate.json');
 assert(!JSON.stringify(result).includes('futureEvidence'));
});
for(const [label,mutate] of [
 ['duplicate IDs',r=>r.profiles[1].syntheticId=r.profiles[0].syntheticId],
 ['launch mismatch',r=>r.profiles[0].launchMatches=false],
 ['restart mismatch',r=>r.profiles[1].restartMatches=false],
 ['extended blocked',r=>r.profiles[0].extended.timezone='BLOCKED'],
 ['invalid extended value',r=>r.profiles[1].extended.locale='NOT_MEASURED'],
 ['empty extended points',r=>r.profiles[0].extended={}],
 ['missing profile',r=>r.profiles.pop()],
 ['extra profile',r=>r.profiles.push({...r.profiles[0],syntheticId:'SYN-C'})],
 ['empty synthetic ID',r=>r.profiles[0].syntheticId='']
]) test('configured identity blocks '+label,()=>{
 const result=detachedGate(evaluateConfiguredIdentity,'identity',(()=>{
  const copy=JSON.parse(JSON.stringify(identityResult));mutate(copy);return copy;
 })());
 assert.strictEqual(result.id,'configured-identity');
 assert.strictEqual(result.status,'BLOCKED');
 assert(!result.reason.includes('SYN-'));
});

test('configured identity blocks a wrong candidate and stale evidence through validateEvidence',()=>{
 for(const changes of [
  {candidate:{...candidate,commit:'b'.repeat(40)}},
  {generatedAt:'2026-10-01T00:00:00.000Z'}
 ]) assert.strictEqual(detachedGate(evaluateConfiguredIdentity,'identity',identityResult,changes).status,'BLOCKED');
});

test('storage isolation accepts the six required passing conditions',()=>{
 const result=detachedGate(evaluateStorageIsolation,'isolation',isolationResult);
 assert.strictEqual(result.status,'PASS');
 assert.strictEqual(result.id,'storage-isolation');
 assert.strictEqual(result.evidence,'gate.json');
});
test('storage isolation ignores a safe unknown field without emitting evidence data',()=>{
 const input={...isolationResult,futureEvidence:{revision:7},unlisted:'PASS'};
 Object.defineProperty(input,'hiddenFutureEvidence',{value:'unreported'});
 const result=detachedGate(evaluateStorageIsolation,'isolation',input);
 assert.strictEqual(result.status,'PASS');
 assert(!JSON.stringify(result).includes('futureEvidence'));
 assert(!JSON.stringify(result).includes('unlisted'));
 assert(!JSON.stringify(result).includes('hiddenFutureEvidence'));
});
for(const condition of ['baseline','concurrentCrossWrite','snapshotRestore',
 'configBackupRestore','httpCache','faviconCache']){
 test('storage isolation blocks a non-PASS '+condition,()=>{
  for(const value of ['NOT_RUN','FAIL',null,1]){
   const input={...isolationResult,[condition]:value};
   const result=detachedGate(evaluateStorageIsolation,'isolation',input);
   assert.strictEqual(result.status,'BLOCKED');
   assert(!result.reason.includes('null'));
  }
 });
}
for(const [label,change] of [
 ['missing condition',r=>delete r.baseline],
 ['array conditions',r=>r.baseline=['PASS']]
]) test('storage isolation blocks '+label,()=>{
 const input={...isolationResult};change(input);
 assert.strictEqual(detachedGate(evaluateStorageIsolation,'isolation',input).status,'BLOCKED');
});
test('storage isolation blocks wrong-candidate and stale evidence',()=>{
 for(const changes of [
  {candidate:{...candidate,installerSha256:'e'.repeat(64)}},
  {generatedAt:'2026-10-01T00:00:00.000Z'}
 ]) assert.strictEqual(detachedGate(evaluateStorageIsolation,'isolation',isolationResult,changes).status,'BLOCKED');
});

test('crash durability accepts regular idle-flush and short-crash PASS',()=>{
 const result=detachedGate(evaluateCrashDurability,'crash',crashResult);
 assert.strictEqual(result.status,'PASS');
 assert.strictEqual(result.id,'crash-durability');
 assert.strictEqual(result.evidence,'gate.json');
});
test('crash durability ignores safe unknown fields on ordinary evidence shapes',()=>{
 const result=detachedGate(evaluateCrashDurability,'crash',{
  futureEvidence:{revision:7},
  idleFlush:{status:'PASS',idleMs:10000,futureEvidence:'flush note'},
  shortCrash:{status:'PASS',idleMs:1500,futureEvidence:'recovery note'}
 });
 assert.strictEqual(result.status,'PASS');
 assert(!JSON.stringify(result).includes('futureEvidence'));
});
test('crash durability accepts and names only the bounded localStorage known finding',()=>{
 const result=detachedGate(evaluateCrashDurability,'crash',{
  idleFlush:{status:'PASS',idleMs:10000},
  shortCrash:{status:'KNOWN_FINDING',idleMs:1500,
   revertedFields:['localStorage'],aLocalStorageEqualsPriorCommitted:true,
   allOtherAFieldsPersisted:true,allBFieldsUnchanged:true,crossedProfileMarkers:0}
 });
 assert.strictEqual(result.status,'PASS');
 assert.match(result.reason,/bounded 1\.5-second localStorage finding/i);
});
for(const [label,change] of [
 ['extra reverted A field',r=>r.shortCrash.revertedFields.push('cookieJar')],
 ['missing reverted A field',r=>delete r.shortCrash.revertedFields],
 ['different reverted A field',r=>r.shortCrash.revertedFields=['sessionStorage']],
 ['localStorage not prior committed',r=>r.shortCrash.aLocalStorageEqualsPriorCommitted=false],
 ['missing other A persistence',r=>r.shortCrash.allOtherAFieldsPersisted=false],
 ['changed B field',r=>r.shortCrash.allBFieldsUnchanged=false],
 ['crossed marker',r=>r.shortCrash.crossedProfileMarkers=1],
 ['extra known-finding key',r=>r.shortCrash.note='broader issue'],
 ['missing known-finding key',r=>delete r.shortCrash.allBFieldsUnchanged],
 ['wrong short idle time',r=>r.shortCrash.idleMs=2000],
 ['wrong idle-flush time',r=>r.idleFlush.idleMs=9000],
 ['idle-flush failure',r=>r.idleFlush.status='FAIL'],
 ['broader short-crash failure',r=>r.shortCrash.status='FAIL']
]) test('crash durability blocks '+label,()=>{
 const input={idleFlush:{status:'PASS',idleMs:10000},shortCrash:{
  status:'KNOWN_FINDING',idleMs:1500,revertedFields:['localStorage'],
  aLocalStorageEqualsPriorCommitted:true,allOtherAFieldsPersisted:true,
  allBFieldsUnchanged:true,crossedProfileMarkers:0
 }};
 change(input);
 assert.strictEqual(detachedGate(evaluateCrashDurability,'crash',input).status,'BLOCKED');
});
test('crash durability blocks wrong-candidate and stale evidence',()=>{
 for(const changes of [
  {candidate:{...candidate,engineVersion:'156.0.2'}},
  {generatedAt:'2026-10-01T00:00:00.000Z'}
 ]) assert.strictEqual(detachedGate(evaluateCrashDurability,'crash',crashResult,changes).status,'BLOCKED');
});

test('graphics fingerprint accepts headful real GPU with two complete profiles',()=>{
 const result=detachedGate(evaluateGraphicsFingerprint,'graphics',graphicsResult);
 assert.strictEqual(result.status,'PASS');
 assert.strictEqual(result.id,'graphics-fingerprint');
 assert.strictEqual(result.evidence,'gate.json');
});
test('graphics fingerprint ignores safe unknown fields without emitting evidence data',()=>{
 const input=JSON.parse(JSON.stringify(graphicsResult));
 input.futureEvidence={revision:7};
 input.profiles[0].futureEvidence='profile note';
 input.profiles[0].font.futureEvidence='font note';
 const result=detachedGate(evaluateGraphicsFingerprint,'graphics',input);
 assert.strictEqual(result.status,'PASS');
 assert(!JSON.stringify(result).includes('futureEvidence'));
});
test('evaluator evidence still rejects privacy-forbidden unknown fields',()=>{
 assert.throws(()=>detachedGate(evaluateStorageIsolation,'isolation',{
  ...isolationResult,profileName:'private-label'
 }),/^Error: Camoufox preflight data contains private information$/);
});
for(const [label,change] of [
 ['headless mode',r=>r.headful=false],
 ['software graphics',r=>r.realGpu=false],
 ['one profile',r=>r.profiles.pop()],
 ['extra profile',r=>r.profiles.push({...r.profiles[0]})],
 ['vendor compared count',r=>r.profiles[0].vendorCompared=1],
 ['renderer compared count',r=>r.profiles[1].rendererCompared=3],
 ['vendor mismatch',r=>r.profiles[0].vendorMatches=false],
 ['renderer mismatch',r=>r.profiles[1].rendererMatches=false],
 ['unmeasured canvas',r=>r.profiles[0].canvas='NOT_RUN'],
 ['unmeasured offline audio',r=>r.profiles[1].offlineAudio='UNSUPPORTED'],
 ['unmeasured font probe',r=>r.profiles[0].font.status='NOT_RUN'],
 ['inventory-style font claim',r=>r.profiles[1].font.claim='full-inventory']
]) test('graphics fingerprint blocks '+label,()=>{
 const input=JSON.parse(JSON.stringify(graphicsResult));change(input);
 assert.strictEqual(detachedGate(evaluateGraphicsFingerprint,'graphics',input).status,'BLOCKED');
});
test('graphics fingerprint blocks wrong-candidate and stale evidence',()=>{
 for(const changes of [
  {candidate:{...candidate,engineSha256:'f'.repeat(64)}},
  {generatedAt:'2026-10-01T00:00:00.000Z'}
 ]) assert.strictEqual(detachedGate(evaluateGraphicsFingerprint,'graphics',graphicsResult,changes).status,'BLOCKED');
});

const artifactResult={
 resourcesConfigured:true,
 releaseVersion:'156.0.1',installedVersion:'156.0.1',
 releaseArchiveSha256:'d619'.padEnd(64,'b'),releaseArchiveBytes:1355084308,
 observedArchiveSha256:'d619'.padEnd(64,'b'),observedArchiveBytes:1355084308,
 installedEntrySha256:'c'.repeat(64),installedFileCount:1579,
 installedVerified:true,descriptorManifestAgrees:true,
 noPackagedPayload:true,noPrivateKeyMaterial:true
};
const ceremonyReceipt={
 schema:'lhm.camoufox-publisher-ceremony.v1',generatedAt:'2026-11-11T04:00:00.000Z',
 publicKeySpkiSha256:'c'.repeat(64),environmentClass:'owner-offline-production',
 privateKeyEncryptedOutsideGit:true,independentFromLicenseKey:true,twoOfflineBackups:true,
 ownerApprovalId:'QD-02'
};
const installReceipt={
 schema:'lhm.camoufox-clean-install.v1',generatedAt:'2026-11-11T04:00:00.000Z',
 installerSha256:candidate.installerSha256,environmentClass:'clean-windows-vm',
 freshInstallPass:true,upgradePass:true,uninstallRetentionChecked:true,ownerApprovalId:'release-owner'
};
const gateOptions={candidate,now,evidenceName:'C:\\private\\evidence\\receipt.json'};

test('artifact trust passes a fully verified adapter result and emits only safe evidence basename',()=>{
 const result=evaluateArtifactTrust(candidate,artifactResult,gateOptions);
 assert.deepStrictEqual(result,{id:'artifact-trust',status:'PASS',
  reason:'Installed Camoufox artifacts match the release descriptor and trust checks',evidence:'receipt.json'});
 assert(!JSON.stringify(result).includes('d619'));
});
for(const [label,change] of [
 ['resources not configured',a=>a.resourcesConfigured=false],
 ['release version mismatch',a=>a.releaseVersion='156.0.2'],
 ['installed version mismatch',a=>a.installedVersion='156.0.2'],
 ['observed archive hash mismatch',a=>a.observedArchiveSha256='e'.repeat(64)],
 ['archive byte mismatch',a=>a.observedArchiveBytes++],
 ['invalid archive hash',a=>a.releaseArchiveSha256='not-a-hash'],
 ['invalid archive size',a=>a.releaseArchiveBytes=Number.MAX_SAFE_INTEGER+1],
 ['installed manifest false',a=>a.installedVerified=false],
 ['descriptor disagreement',a=>a.descriptorManifestAgrees=false],
 ['installed entry hash mismatch',a=>a.installedEntrySha256='f'.repeat(64)],
 ['zero installed file count',a=>a.installedFileCount=0],
 ['invalid installed file count',a=>a.installedFileCount=1.5],
 ['packaged payload present',a=>a.noPackagedPayload=false],
 ['private material found',a=>a.noPrivateKeyMaterial=false]
]) test('artifact trust blocks '+label,()=>{
 const input={...artifactResult};change(input);
 assert.strictEqual(evaluateArtifactTrust(candidate,input,gateOptions).status,'BLOCKED');
});
test('artifact trust blocks candidate version and entry digest mismatches',()=>{
 assert.strictEqual(evaluateArtifactTrust({...candidate,engineVersion:'156.0.2'},artifactResult,gateOptions).status,'BLOCKED');
 assert.strictEqual(evaluateArtifactTrust({...candidate,engineSha256:'e'.repeat(64)},artifactResult,gateOptions).status,'BLOCKED');
});
test('artifact trust requires both release resource configuration flags',()=>{
 const input={...artifactResult,resources:{release:false,installed:true}};
 delete input.resourcesConfigured;
 assert.strictEqual(evaluateArtifactTrust(candidate,input,gateOptions).status,'BLOCKED');
});
test('artifact trust ignores safe unknown fields and does not alias adapter input',()=>{
 const input={...artifactResult,futureEvidence:'note'};
 const result=evaluateArtifactTrust(candidate,input,gateOptions);
 input.releaseVersion='156.0.2';input.futureEvidence='changed';
 assert.strictEqual(result.status,'PASS');
 assert(!JSON.stringify(result).includes('futureEvidence'));
});
test('artifact trust rejects forbidden unknown fields',()=>{
 assert.throws(()=>evaluateArtifactTrust(candidate,{...artifactResult,privateKey:'secret'},gateOptions),
  /^Error: Camoufox preflight data contains private information$/);
});
test('artifact trust rejects privacy-sensitive evidence basenames',()=>{
 for(const evidenceName of ['192.0.2.1.json','https_example.com.json','CAMOU_CONFIG_secret.json'])
  assert.throws(()=>evaluateArtifactTrust(candidate,artifactResult,{candidate,now,evidenceName}),
   /^Error: Camoufox preflight data contains private information$/);
});
test('artifact trust permits benign protocol-named evidence basenames',()=>{
 for(const evidenceName of ['https-report.json','http-response.json','ftp-checklist.json'])
  assert.strictEqual(evaluateArtifactTrust(candidate,artifactResult,{candidate,now,evidenceName}).status,'PASS');
});
test('artifact trust compares validated digests without case sensitivity',()=>{
 const result=evaluateArtifactTrust(candidate,{...artifactResult,
  releaseArchiveSha256:artifactResult.releaseArchiveSha256.toUpperCase(),
  installedEntrySha256:candidate.engineSha256.toUpperCase()},{candidate,now});
 assert.strictEqual(result.status,'PASS');
 assert(!JSON.stringify(result).includes(candidate.engineSha256.toUpperCase()));
});

test('publisher ceremony passes only the matching owner receipt and SPKI digest',()=>{
 const result=evaluatePublisherCeremony(ceremonyReceipt,{...gateOptions,packagedPublicKeySpkiSha256:'c'.repeat(64)});
 assert.strictEqual(result.status,'PASS');assert.strictEqual(result.evidence,'receipt.json');
 assert(!JSON.stringify(result).includes('QD-02'));
});
test('publisher ceremony missing receipt remains manual required',()=>{
 assert.strictEqual(evaluatePublisherCeremony(null,{...gateOptions,packagedPublicKeySpkiSha256:'c'.repeat(64)}).status,'MANUAL_REQUIRED');
});
for(const [label,change] of [
 ['schema',r=>r.schema='wrong'],
 ['stale timestamp',r=>r.generatedAt='2026-10-12T11:59:59.999Z'],
 ['future timestamp',r=>r.generatedAt='2026-11-11T12:05:00.001Z'],
 ['wrong SPKI digest',r=>r.publicKeySpkiSha256='d'.repeat(64)],
 ['wrong environment',r=>r.environmentClass='development'],
 ['unencrypted key assertion',r=>r.privateKeyEncryptedOutsideGit=false],
 ['not independent from license key',r=>r.independentFromLicenseKey=false],
 ['backups missing',r=>r.twoOfflineBackups=false],
 ['approval mismatch',r=>r.ownerApprovalId='OTHER'],
 ['approval missing',r=>delete r.ownerApprovalId]
]) test('publisher ceremony blocks '+label,()=>{
 const receipt={...ceremonyReceipt};change(receipt);
 assert.strictEqual(evaluatePublisherCeremony(receipt,{...gateOptions,packagedPublicKeySpkiSha256:'c'.repeat(64)}).status,'BLOCKED');
});
test('publisher ceremony treats malformed timestamp as an explicit safe block',()=>{
 const result=evaluatePublisherCeremony({...ceremonyReceipt,generatedAt:'bad'},
  {...gateOptions,packagedPublicKeySpkiSha256:'c'.repeat(64)});
 assert.strictEqual(result.status,'BLOCKED');
});
test('publisher ceremony ignores safe extras without claiming independent custody proof',()=>{
 const result=evaluatePublisherCeremony({...ceremonyReceipt,futureEvidence:{revision:2}},
  {...gateOptions,packagedPublicKeySpkiSha256:'c'.repeat(64)});
 assert.strictEqual(result.status,'PASS');
 assert(!JSON.stringify(result).includes('revision'));
});
test('publisher ceremony rejects forbidden extra fields',()=>{
 assert.throws(()=>evaluatePublisherCeremony({...ceremonyReceipt,privateKey:'secret'},
  {...gateOptions,packagedPublicKeySpkiSha256:'c'.repeat(64)}),
  /^Error: Camoufox preflight data contains private information$/);
});
test('publisher ceremony accepts the safe private-key custody assertion field',()=>{
 assert.strictEqual(evaluatePublisherCeremony(ceremonyReceipt,
  {...gateOptions,packagedPublicKeySpkiSha256:'c'.repeat(64)}).status,'PASS');
});
test('publisher ceremony rejects privacy-sensitive evidence basenames',()=>{
 for(const evidenceName of ['192.0.2.1.json','https_example.com.json','CAMOU_CONFIG_secret.json'])
  assert.throws(()=>evaluatePublisherCeremony(ceremonyReceipt,
   {...gateOptions,evidenceName,packagedPublicKeySpkiSha256:'c'.repeat(64)}),
   /^Error: Camoufox preflight data contains private information$/);
});
test('publisher ceremony permits benign protocol-named evidence basenames',()=>{
 for(const evidenceName of ['https-report.json','http-response.json','ftp-checklist.json'])
  assert.strictEqual(evaluatePublisherCeremony(ceremonyReceipt,
   {...gateOptions,evidenceName,packagedPublicKeySpkiSha256:'c'.repeat(64)}).status,'PASS');
});
test('publisher ceremony compares validated SPKI digests without case sensitivity',()=>{
 assert.strictEqual(evaluatePublisherCeremony({...ceremonyReceipt,
  publicKeySpkiSha256:ceremonyReceipt.publicKeySpkiSha256.toUpperCase()},
  {...gateOptions,packagedPublicKeySpkiSha256:'c'.repeat(64)}).status,'PASS');
});
test('publisher ceremony rejects artifact-only noPrivateKeyMaterial field',()=>{
 assert.throws(()=>evaluatePublisherCeremony({...ceremonyReceipt,noPrivateKeyMaterial:true},
  {...gateOptions,packagedPublicKeySpkiSha256:'c'.repeat(64)}),
  /^Error: Camoufox preflight data contains private information$/);
});

test('clean install and upgrade passes the matching fresh-install receipt',()=>{
 const result=evaluateCleanInstallUpgrade(installReceipt,gateOptions);
 assert.strictEqual(result.status,'PASS');assert.strictEqual(result.evidence,'receipt.json');
});
test('clean install and upgrade rejects privacy-sensitive evidence basenames',()=>{
 for(const evidenceName of ['192.0.2.1.json','https_example.com.json','CAMOU_CONFIG_secret.json'])
  assert.throws(()=>evaluateCleanInstallUpgrade(installReceipt,{...gateOptions,evidenceName}),
   /^Error: Camoufox preflight data contains private information$/);
});
test('clean install and upgrade permits benign protocol-named evidence basenames',()=>{
 for(const evidenceName of ['https-report.json','http-response.json','ftp-checklist.json'])
  assert.strictEqual(evaluateCleanInstallUpgrade(installReceipt,{...gateOptions,evidenceName}).status,'PASS');
});
test('clean install and upgrade compares validated installer hashes without case sensitivity',()=>{
 const upperCandidate={...candidate,installerSha256:candidate.installerSha256.toUpperCase()};
 assert.strictEqual(evaluateCleanInstallUpgrade(installReceipt,{candidate:upperCandidate,now}).status,'PASS');
});
test('clean install and upgrade missing receipt remains manual required',()=>{
 assert.strictEqual(evaluateCleanInstallUpgrade(null,gateOptions).status,'MANUAL_REQUIRED');
});
for(const [label,change] of [
 ['schema',r=>r.schema='wrong'],
 ['stale timestamp',r=>r.generatedAt='2026-10-12T11:59:59.999Z'],
 ['future timestamp',r=>r.generatedAt='2026-11-11T12:05:00.001Z'],
 ['installer hash mismatch',r=>r.installerSha256='e'.repeat(64)],
 ['wrong environment',r=>r.environmentClass='windows-dev'],
 ['fresh install false',r=>r.freshInstallPass=false],
 ['upgrade false',r=>r.upgradePass=false],
 ['uninstall retention unchecked',r=>r.uninstallRetentionChecked=false],
 ['approval missing',r=>delete r.ownerApprovalId],
 ['approval unsafe',r=>r.ownerApprovalId='../release-owner']
]) test('clean install and upgrade blocks '+label,()=>{
 const receipt={...installReceipt};change(receipt);
 assert.strictEqual(evaluateCleanInstallUpgrade(receipt,gateOptions).status,'BLOCKED');
});
test('clean install and upgrade blocks malformed timestamp',()=>{
 assert.strictEqual(evaluateCleanInstallUpgrade({...installReceipt,generatedAt:'bad'},gateOptions).status,'BLOCKED');
});
test('clean install and upgrade ignores safe extras and rejects private extras',()=>{
 const result=evaluateCleanInstallUpgrade({...installReceipt,futureEvidence:'note'},gateOptions);
 assert.strictEqual(result.status,'PASS');assert(!JSON.stringify(result).includes('futureEvidence'));
 assert.throws(()=>evaluateCleanInstallUpgrade({...installReceipt,profileName:'private'},gateOptions),
  /^Error: Camoufox preflight data contains private information$/);
});
test('clean install and upgrade rejects artifact-only and malformed privacy assertions',()=>{
 assert.throws(()=>evaluateCleanInstallUpgrade({...installReceipt,noPrivateKeyMaterial:true},gateOptions),
  /^Error: Camoufox preflight data contains private information$/);
 assert.throws(()=>evaluateCleanInstallUpgrade({...installReceipt,privateKeyEncryptedOutsideGit:'not-a-boolean'},gateOptions),
  /^Error: Camoufox preflight data contains private information$/);
});
test('owner receipt evaluators detach results from mutable inputs',()=>{
 const receipt={...installReceipt};const result=evaluateCleanInstallUpgrade(receipt,gateOptions);
 receipt.installerSha256='e'.repeat(64);receipt.generatedAt='bad';
 assert.strictEqual(result.status,'PASS');
});
test('receipt freshness boundaries allow exactly maximum age and future skew',()=>{
 for(const generatedAt of ['2026-10-12T12:00:00.000Z','2026-11-11T12:05:00.000Z']){
  assert.strictEqual(evaluateCleanInstallUpgrade({...installReceipt,generatedAt},{...gateOptions}).status,'PASS');
  assert.strictEqual(evaluatePublisherCeremony({...ceremonyReceipt,generatedAt},
   {...gateOptions,packagedPublicKeySpkiSha256:'c'.repeat(64)}).status,'PASS');
 }
});
test('owner receipt evaluators honor numeric epoch now',()=>{
 const epoch='1970-01-01T00:00:00.000Z';
 assert.strictEqual(evaluatePublisherCeremony({...ceremonyReceipt,generatedAt:epoch},
  {candidate,now:0,packagedPublicKeySpkiSha256:'c'.repeat(64)}).status,'PASS');
 assert.strictEqual(evaluateCleanInstallUpgrade({...installReceipt,generatedAt:epoch},
  {candidate,now:0}).status,'PASS');
});
test('candidate engine version uses the bounded bundled-engine release grammar',()=>{
 for(const engineVersion of ['1.2.3+foo..bar','1.2.3-beta','1234.2.3','1.123456.3','1.2.123456'])
  assert.throws(()=>evaluateArtifactTrust({...candidate,engineVersion},artifactResult),
   /Invalid Camoufox preflight candidate/);
 assert.strictEqual(evaluateArtifactTrust({...candidate,engineVersion:'156.0.1'},artifactResult).status,'PASS');
});
test('composed ten-gate report preserves exact owner manual assertions',()=>{
 const composed=GATE_IDS.map(id=>id==='artifact-trust'?evaluateArtifactTrust(candidate,artifactResult):
  id==='publisher-ceremony'?evaluatePublisherCeremony(ceremonyReceipt,{candidate,now,packagedPublicKeySpkiSha256:'c'.repeat(64)}):
  id==='clean-install-upgrade'?evaluateCleanInstallUpgrade(installReceipt,{candidate,now}):
  gate(id,'PASS',`${id} verified`));
 const report=evaluateCamoufoxReleasePreflight(candidate,composed,now);
 assert.deepStrictEqual(report.manualAssertions,[
  {gate:'publisher-ceremony',status:'PASS'},
  {gate:'clean-install-upgrade',status:'PASS'}
 ]);
});
test('composed ten-gate report marks both absent owner receipts as manual assertions',()=>{
 const composed=GATE_IDS.map(id=>id==='artifact-trust'?evaluateArtifactTrust(candidate,artifactResult):
  id==='publisher-ceremony'?evaluatePublisherCeremony(null,{candidate,now,packagedPublicKeySpkiSha256:'c'.repeat(64)}):
  id==='clean-install-upgrade'?evaluateCleanInstallUpgrade(null,{candidate,now}):
  gate(id,'PASS',`${id} verified`));
 const report=evaluateCamoufoxReleasePreflight(candidate,composed,now);
 assert.deepStrictEqual(report.manualAssertions,[
  {gate:'publisher-ceremony',status:'MANUAL_REQUIRED'},
  {gate:'clean-install-upgrade',status:'MANUAL_REQUIRED'}
 ]);
});

const cliPath=path.join(__dirname,'..','tools','camoufox-release-preflight.js');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const writeJson=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));

function makeCliFixture(root,{uppercaseInstallerDigest=false}={}){
 const resources=path.join(root,'resources');
 const engine=path.join(root,'installed-engine');
 const evidence=path.join(root,'evidence');
 for(const dir of [resources,engine,evidence])fs.mkdirSync(dir);
 const installer=path.join(root,'installer.exe');
 const publisherReceipt=path.join(root,'publisher-ceremony.json');
 const cleanInstallReceipt=path.join(root,'clean-install.json');
 const indexFile=path.join(evidence,'evidence-index.json');
 const releaseFile=path.join(resources,'release.json');
 const installerBytes=Buffer.alloc(1024*1024+17,0x57);
 const engineBytes=Buffer.from('Synthetic Camoufox executable fixture');
 const supportBytes=Buffer.from('Synthetic engine support file');
 const archiveBytes=Buffer.alloc(1234,0x31);
 const installerSha256=hash(installerBytes);
 const currentCandidate={...candidate,engineSha256:hash(engineBytes),
  installerSha256:uppercaseInstallerDigest?installerSha256.toUpperCase():installerSha256};
 const generatedAt=new Date().toISOString();
 const pair=crypto.generateKeyPairSync('ed25519');
 const manifest={schema:1,engine:'camoufox',version:currentCandidate.engineVersion,entry:'camoufox.exe',
  files:[{path:'camoufox.exe',bytes:engineBytes.length,sha256:currentCandidate.engineSha256},
   {path:'support.dat',bytes:supportBytes.length,sha256:hash(supportBytes)}]};
 manifest.signature=crypto.sign(null,signedPayload(manifest),pair.privateKey).toString('base64url');
 fs.writeFileSync(installer,installerBytes);
 fs.writeFileSync(path.join(engine,manifest.entry),engineBytes);
 fs.writeFileSync(path.join(engine,'support.dat'),supportBytes);
 fs.writeFileSync(path.join(resources,'publisher-ed25519.pub'),pair.publicKey.export({format:'pem',type:'spki'}));
 writeJson(path.join(engine,'manifest.json'),manifest);
 writeJson(path.join(resources,'capabilities.json'),{schema:1});
 const descriptor={schema:1,manifest,archiveSha256:hash(archiveBytes),archiveBytes:archiveBytes.length,
  url:'https://github.com/example/fixture/releases/download/v1/camoufox.zip'};
 writeJson(releaseFile,descriptor);
 writeJson(publisherReceipt,{...ceremonyReceipt,generatedAt,
  publicKeySpkiSha256:hash(pair.publicKey.export({format:'der',type:'spki'}))});
 writeJson(cleanInstallReceipt,{...installReceipt,generatedAt,installerSha256:currentCandidate.installerSha256});
 const reportNames={resources:[]};
 const saveEnvelope=(field,kind,result,environment='windows-installed-engine')=>{
  const name=`${kind}.json`;
  reportNames[field]=name;
  writeJson(path.join(evidence,name),installedEnvelope(kind,result,{candidate:currentCandidate,generatedAt,environment}));
 };
 saveEnvelope('artifactArchive','artifact-archive',{
  status:'PASS',observedArchiveSha256:descriptor.archiveSha256,observedArchiveBytes:descriptor.archiveBytes
 },'windows-release-archive');
 saveEnvelope('identity','identity',identityResult);
 saveEnvelope('isolation','isolation',isolationResult);
 saveEnvelope('crash','crash',crashResult);
 saveEnvelope('graphics','graphics',graphicsResult);
 saveEnvelope('network','network',networkResult);
 saveEnvelope('packagedUi','packaged-ui',packagedUiResult,'windows-packaged-app');
 REQUIRED_RESOURCE_MATRIX.forEach((row,i)=>{
  const name=`resource-${i+1}.json`;
  reportNames.resources.push(name);
  writeJson(path.join(evidence,name),resourceReport(row,{
   generatedAt,commit:currentCandidate.commit,app:{sha256:currentCandidate.installerSha256},
   engine:{id:'camoufox',version:currentCandidate.engineVersion,sha256:currentCandidate.engineSha256}
  }));
 });
 const index={schema:'lhm.camoufox-preflight.index.v1',candidate:currentCandidate,reports:reportNames};
 writeJson(indexFile,index);
 const args=['--resources-dir',resources,'--engine-dir',engine,'--installer',installer,
  '--evidence-dir',evidence,'--publisher-receipt',publisherReceipt,'--clean-install-receipt',cleanInstallReceipt];
 return {args,index,indexFile,resources,engine,evidence,installer,publisherReceipt,cleanInstallReceipt,releaseFile,pair};
}

function runCli(args,preload){
 const options=preload?['--require',preload]:[];
 const result=spawnSync(process.execPath,[...options,cliPath,...args],{encoding:'utf8',timeout:10000});
 if(result.error)throw result.error;
 return result;
}

function expectCliReport(result,exitCode){
 assert.strictEqual(result.status,exitCode,result.stderr);
 assert.strictEqual(result.stderr,'');
 const report=JSON.parse(result.stdout);
 assert.strictEqual(result.stdout,JSON.stringify(report)+'\n');
 return report;
}

function expectCliError(result){
 assert.strictEqual(result.status,1,result.stdout||result.stderr);
 assert.strictEqual(result.stdout,'');
 assert.match(result.stderr,
  /^Camoufox release preflight: (?:invalid command-line arguments|input or verification failed)\n$/);
}

function replaceArg(args,flag,value){
 const replacement=[...args];
 replacement[replacement.indexOf(flag)+1]=value;
 return replacement;
}

function snapshotFile(file){
 const stat=fs.lstatSync(file);
 return {size:stat.size,mtime:stat.mtimeMs,sha256:hash(fs.readFileSync(file))};
}

function snapshotTree(root){
 const entries={'.':{directory:true,mtime:fs.lstatSync(root).mtimeMs}};
 function visit(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
   const file=path.join(directory,entry.name);
   const name=path.relative(root,file);
   if(entry.isDirectory()){
    entries[name]={directory:true,mtime:fs.lstatSync(file).mtimeMs};
    visit(file);
   }else entries[name]=snapshotFile(file);
  }
 }
 visit(root);
 return entries;
}

function withFileContents(file,contents,run){
 const original=fs.readFileSync(file);
 try{fs.writeFileSync(file,contents);run();}
 finally{fs.writeFileSync(file,original);}
}

function expectSingleBlocker(result,id,reason){
 const report=expectCliReport(result,2);
 assert.strictEqual(report.overall,'BLOCKED');
 assert.deepStrictEqual(report.blockers,[{gate:id,status:'BLOCKED',reason}]);
 return report;
}

async function testCli(){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'lhm-camoufox-preflight-'));
 try{
  const fixture=makeCliFixture(root);
  const {args,index,indexFile,evidence,engine,resources,installer,publisherReceipt,cleanInstallReceipt,releaseFile}=fixture;
  const evidenceFile=key=>path.join(evidence,index.reports[key]);
  const invalid=()=>expectCliError(runCli(args));
  const repoResources=path.join(__dirname,'..','resources','camoufox-engine');
  const protectedFiles=['capabilities.json','release.json'].map(name=>path.join(repoResources,name));
  const repoBefore=protectedFiles.map(snapshotFile);
  const readyBefore=snapshotTree(root);
  const report=expectCliReport(runCli(args),0);
  assert.strictEqual(report.overall,'READY_FOR_OWNER_REVIEW');
  assert.deepStrictEqual(report.candidate,index.candidate);
  assert.deepStrictEqual(report.gates.map(item=>item.id),GATE_IDS);
  assert(report.gates.every(item=>item.status==='PASS'));
  assert(report.gates.every(item=>[].concat(item.evidence).every(file=>
   typeof file==='string'&&/^[A-Za-z0-9.-]+\.json$/.test(file))));
  assert.deepStrictEqual(snapshotTree(root),readyBefore);

  test('CLI reads each trust metadata file only once',()=>{
   const metadata=[path.join(resources,'publisher-ed25519.pub'),releaseFile];
   const preload=path.join(root,'count-resource-reads.js');
   fs.writeFileSync(preload,`const fs=require('node:fs');
const reads=new Map(${JSON.stringify(metadata)}.map(file=>[file,0]));
const open=fs.openSync;
const read=fs.readFileSync;
let reading=false;
function record(file){
 if(!reads.has(file))return;
 const count=reads.get(file)+1;
 reads.set(file,count);
 if(count>1)throw Error('Trust metadata was read again');
}
fs.openSync=function(file,...args){
 if(!reading)record(file);
 return open.call(this,file,...args);
};
fs.readFileSync=function(file,...args){
 record(file);
 reading=true;
 try{return read.call(this,file,...args);}finally{reading=false;}
};
process.on('exit',()=>{if([...reads.values()].some(count=>count!==1))process.exitCode=3;});`);
   assert.strictEqual(expectCliReport(runCli(args,preload),0).overall,'READY_FOR_OWNER_REVIEW');
  });

  test('CLI is read-only when one installed graphics check blocks',()=>{
   const file=evidenceFile('graphics');
   const graphics=JSON.parse(fs.readFileSync(file));
   graphics.result.realGpu=false;
   withFileContents(file,JSON.stringify(graphics),()=>{
    const before=snapshotTree(root);
    const result=expectCliReport(runCli(args),2);
    assert.strictEqual(result.overall,'BLOCKED');
    assert.deepStrictEqual(result.blockers.map(item=>[item.gate,item.status]),[['graphics-fingerprint','BLOCKED']]);
    assert.deepStrictEqual(snapshotTree(root),before);
   });
  });
  assert.deepStrictEqual(protectedFiles.map(snapshotFile),repoBefore);

  test('CLI reports absent owner receipts as manual requirements',()=>{
   let missing=replaceArg(args,'--publisher-receipt',path.join(root,'missing-parent','ceremony.json'));
   missing=replaceArg(missing,'--clean-install-receipt',path.join(root,'missing-install.json'));
   const result=expectCliReport(runCli(missing),2);
   assert.strictEqual(result.overall,'BLOCKED');
   assert.deepStrictEqual(result.blockers.map(item=>[item.gate,item.status]),[
    ['publisher-ceremony','MANUAL_REQUIRED'],['clean-install-upgrade','MANUAL_REQUIRED']
   ]);
   assert(result.gates.filter(item=>item.status==='MANUAL_REQUIRED').every(item=>item.evidence===null));
  });

  test('CLI accepts existing owner receipts whose basenames cannot be reported',()=>{
   const publisher=path.join(root,'owner review.json');
   const clean=path.join(root,'192.0.2.1.json');
   fs.copyFileSync(publisherReceipt,publisher);
   fs.copyFileSync(cleanInstallReceipt,clean);
   const withPublisher=replaceArg(args,'--publisher-receipt',publisher);
   const result=expectCliReport(runCli(replaceArg(withPublisher,'--clean-install-receipt',clean)),0);
   const manualGates=result.gates.filter(item=>result.manualAssertions.some(manual=>manual.gate===item.id));
   assert.strictEqual(manualGates.length,2);
   assert(manualGates.every(item=>item.status==='PASS'&&item.evidence===null));
  });

  test('CLI rejects non-object owner receipts and blocks incomplete object receipts',()=>{
   for(const file of [publisherReceipt,cleanInstallReceipt]){
    for(const value of ['[]','false','42','"receipt"','null'])withFileContents(file,value,invalid);
   }
   const receipt=JSON.parse(fs.readFileSync(publisherReceipt));
   delete receipt.ownerApprovalId;
   withFileContents(publisherReceipt,JSON.stringify(receipt),()=>{
    expectSingleBlocker(runCli(args),'publisher-ceremony','Publisher ceremony owner approval is missing');
   });
  });

  test('CLI blocks when the installer bytes disagree with the indexed digest',()=>{
   withFileContents(installer,'different installer bytes',()=>{
    const result=expectSingleBlocker(runCli(args),'artifact-trust','Installer digest does not match the release candidate');
    assert.deepStrictEqual(result.candidate,index.candidate);
   });
  });

  test('CLI blocks when the signed descriptor entry disagrees with the verified installed engine',()=>{
   const descriptor=JSON.parse(fs.readFileSync(releaseFile));
   descriptor.manifest.files[0].sha256='e'.repeat(64);
   descriptor.manifest.signature=crypto.sign(null,signedPayload(descriptor.manifest),fixture.pair.privateKey).toString('base64url');
   withFileContents(releaseFile,JSON.stringify(descriptor),()=>{
    expectSingleBlocker(runCli(args),'artifact-trust','Release descriptor and installed manifest disagree');
   });
  });

  test('CLI blocks when the signed descriptor changes only a non-entry engine file',()=>{
   const descriptor=JSON.parse(fs.readFileSync(releaseFile));
   descriptor.manifest.files[1].sha256='e'.repeat(64);
   descriptor.manifest.signature=crypto.sign(null,signedPayload(descriptor.manifest),fixture.pair.privateKey).toString('base64url');
   withFileContents(releaseFile,JSON.stringify(descriptor),()=>{
    expectSingleBlocker(runCli(args),'artifact-trust','Release descriptor and installed manifest disagree');
   });
  });

  test('CLI compares the signed manifests independently of JSON property order',()=>{
   const descriptor=JSON.parse(fs.readFileSync(releaseFile));
   descriptor.manifest=Object.fromEntries(Object.entries(descriptor.manifest).reverse());
   withFileContents(releaseFile,JSON.stringify(descriptor),()=>{
    assert.strictEqual(expectCliReport(runCli(args),0).overall,'READY_FOR_OWNER_REVIEW');
   });
  });

  test('CLI compares the manifest verified by the engine manager before a later swap',()=>{
   const descriptor=JSON.parse(fs.readFileSync(releaseFile));
   descriptor.manifest.files[1].sha256='e'.repeat(64);
   descriptor.manifest.signature=crypto.sign(null,signedPayload(descriptor.manifest),fixture.pair.privateKey).toString('base64url');
   const manifestFile=path.join(engine,'manifest.json');
   const managerPath=require.resolve('../src/engine/bundledEngineManager');
   const preload=path.join(root,'swap-after-verification.js');
   fs.writeFileSync(preload,`const fs=require('node:fs');
const {BundledEngineManager}=require(${JSON.stringify(managerPath)});
const original=BundledEngineManager.prototype.verify;
BundledEngineManager.prototype.verify=function(){
 const verified=original.call(this);
 fs.writeFileSync(${JSON.stringify(manifestFile)},${JSON.stringify(JSON.stringify(descriptor.manifest))});
 return verified;
};`);
   const original=fs.readFileSync(manifestFile);
   try{
    withFileContents(releaseFile,JSON.stringify(descriptor),()=>{
     const result=runCli(args,preload);
     assert.deepStrictEqual(JSON.parse(fs.readFileSync(manifestFile)),descriptor.manifest);
     expectSingleBlocker(result,'artifact-trust','Release descriptor and installed manifest disagree');
    });
   }finally{fs.writeFileSync(manifestFile,original);}
  });

  test('CLI accepts the same installer digest in uppercase across the index and reports',()=>{
   const uppercaseRoot=path.join(root,'uppercase-installer-digest');
   fs.mkdirSync(uppercaseRoot);
   const uppercase=makeCliFixture(uppercaseRoot,{uppercaseInstallerDigest:true});
   const result=expectCliReport(runCli(uppercase.args),0);
   assert.strictEqual(result.overall,'READY_FOR_OWNER_REVIEW');
   assert.strictEqual(result.candidate.installerSha256,uppercase.index.candidate.installerSha256);
  });

  test('CLI blocks stale archive evidence bound to the candidate',()=>{
   const file=evidenceFile('artifactArchive');
   const archive=JSON.parse(fs.readFileSync(file));
   archive.generatedAt='2000-01-01T00:00:00.000Z';
   withFileContents(file,JSON.stringify(archive),()=>{
    expectSingleBlocker(runCli(args),'artifact-trust','Evidence is older than 30 days');
   });
  });

  test('CLI blocks archive evidence from the wrong environment or without a passing run',()=>{
   const file=evidenceFile('artifactArchive');
   const archive=JSON.parse(fs.readFileSync(file));
   for(const [changed,reason] of [
    [{...archive,environment:'windows-installed-engine'},'Archive evidence must come from the Windows release archive'],
    ...[undefined,'NOT_RUN','FAIL'].map(status=>[
     {...archive,result:{...archive.result,status}},'Archive evidence must record a passing run']),
    [{...archive,status:'PASS',result:{...archive.result,status:'NOT_RUN'}},'Archive evidence must record a passing run'],
    ...['NOT_RUN','FAIL'].map(status=>[{...archive,status},'Archive evidence must record a passing run'])
   ]){
    withFileContents(file,JSON.stringify(changed),()=>{
     expectSingleBlocker(runCli(args),'artifact-trust',reason);
    });
   }
  });

  test('CLI blocks a valid but different indexed engine version or digest',()=>{
   for(const changes of [{engineVersion:'156.0.2'},{engineSha256:'e'.repeat(64)}]){
    const changed={...index,candidate:{...index.candidate,...changes}};
    withFileContents(indexFile,JSON.stringify(changed),()=>{
     const result=expectCliReport(runCli(args),2);
     assert.deepStrictEqual(result.candidate,changed.candidate);
     assert.strictEqual(result.gates[0].status,'BLOCKED');
    });
   }
  });

  test('CLI rejects bad flag lists and relative paths',()=>{
   for(const bad of [[],args.slice(0,-2),args.slice(0,-1),[...args,'positional'],
    [...args,...args.slice(0,2)],['--unknown',...args.slice(1)],
    ['--resources-dir='+resources,...args.slice(2)],
    replaceArg(args,'--installer','installer.exe'),replaceArg(args,'--publisher-receipt','receipt.json')]){
    expectCliError(runCli(bad));
   }
  });

  test('CLI rejects directories used as files and files used as roots',()=>{
   for(const [flag,value] of [['--installer',root],['--clean-install-receipt',root],
    ['--evidence-dir',indexFile],['--resources-dir',installer],['--engine-dir',installer]])
    expectCliError(runCli(replaceArg(args,flag,value)));
   const directory=path.join(evidence,'directory.json');
   fs.mkdirSync(directory);
   const badIndex={...index,reports:{...index.reports,identity:'directory.json'}};
   withFileContents(indexFile,JSON.stringify(badIndex),invalid);
  });

  test('CLI rejects traversal, Windows reserved names, and duplicate report names',()=>{
   for(const name of ['../identity.json','nested/identity.json','nested\\identity.json',
    path.join(evidence,'identity.json'),'C:\\identity.json','identity.json:alternate','CON.json',
    'NUL.extra.json','identity.json.','identity.json\n','evidence-index.json','GRAPHICS.json']){
    const bad={...index,reports:{...index.reports,identity:name}};
    withFileContents(indexFile,JSON.stringify(bad),invalid);
   }
   const extra='resource-extra.json';
   fs.copyFileSync(path.join(evidence,index.reports.resources[0]),path.join(evidence,extra));
   const longer={...index,reports:{...index.reports,resources:[...index.reports.resources,extra]}};
   withFileContents(indexFile,JSON.stringify(longer),()=>{
    const result=runCli(args);
    expectCliError(result);
    assert.strictEqual(result.stderr,'Camoufox release preflight: input or verification failed\n');
   });
   const duplicate={...index,reports:{...index.reports,
    resources:[index.reports.resources[1].toUpperCase(),...index.reports.resources.slice(1)]}};
   withFileContents(indexFile,JSON.stringify(duplicate),invalid);
  });

  test('CLI reports missing resource rows as a resource-capacity blocker',()=>{
   for(const count of [0,35]){
    const shorter={...index,reports:{...index.reports,resources:index.reports.resources.slice(0,count)}};
    withFileContents(indexFile,JSON.stringify(shorter),()=>{
     const result=expectCliReport(runCli(args),2);
     assert.deepStrictEqual(result.blockers.map(({gate,status})=>[gate,status]),[['resource-capacity','BLOCKED']]);
     assert.match(result.blockers[0].reason,/^Missing resource report: /);
    });
   }
  });

  test('CLI rejects invalid JSON files, invalid index schema, and failed internal verification',()=>{
   const oversized=JSON.stringify({padding:' '.repeat(1024*1024)});
   for(const file of [indexFile,evidenceFile('identity'),publisherReceipt,cleanInstallReceipt]){
    for(const value of ['{broken',oversized,'null'])withFileContents(file,value,invalid);
   }
   withFileContents(indexFile,JSON.stringify({...index,schema:'future-index'}),invalid);
   withFileContents(indexFile,JSON.stringify({...index,candidate:{...index.candidate,commit:'bad'}}),invalid);
   withFileContents(evidenceFile('identity'),Buffer.from([0x7b,0xff,0x7d]),invalid);
   withFileContents(path.join(engine,'camoufox.exe'),'tampered engine fixture',invalid);
  });

  test('CLI rejects symlink roots, files, and dangling receipt targets',()=>{
   let skipped=false;
   const directoryLink=process.platform==='win32'?'junction':'dir';
   for(const [flag,target,link,type] of [
    ['--resources-dir',resources,path.join(root,'resources-link'),directoryLink],
    ['--engine-dir',engine,path.join(root,'engine-link'),directoryLink],
    ['--evidence-dir',evidence,path.join(root,'evidence-link'),directoryLink],
    ['--installer',installer,path.join(root,'installer-link.exe'),'file'],
    ['--publisher-receipt',publisherReceipt,path.join(root,'ceremony-link.json'),'file'],
    ['--clean-install-receipt',path.join(root,'missing'),path.join(root,'dangling-receipt.json'),'file'],
    [null,evidenceFile('identity'),path.join(evidence,'report-link.json'),'file']
   ]){
    try{fs.symlinkSync(target,link,type);}catch(error){
     if(type==='file'&&process.platform==='win32'&&error.code==='EPERM'){
      skipped=true;
      continue;
     }
     throw error;
    }
    try{
     if(flag)expectCliError(runCli(replaceArg(args,flag,link)));
     else withFileContents(indexFile,JSON.stringify({...index,reports:{...index.reports,identity:path.basename(link)}}),invalid);
    }finally{fs.unlinkSync(link);}
   }
   if(skipped)console.error('Skipping Camoufox preflight symlink cases where Windows denied symlink creation');
  });

  test('CLI rejects symlinks in any input parent even for a missing receipt',()=>{
   const link=path.join(root,'linked-parent');
   fs.symlinkSync(root,link,process.platform==='win32'?'junction':'dir');
   try{
    for(let i=0;i<args.length;i+=2){
     const [flag,file]=[args[i],args[i+1]];
     expectCliError(runCli(replaceArg(args,flag,path.join(link,path.relative(root,file)))));
    }
    for(const flag of ['--publisher-receipt','--clean-install-receipt'])
     expectCliError(runCli(replaceArg(args,flag,path.join(link,'missing','receipt.json'))));
    const linkedThenParent=[link,'..','installer.exe'].join(path.sep);
    expectCliError(runCli(replaceArg(args,'--installer',linkedThenParent)));
   }finally{fs.unlinkSync(link);}
  });

  const {streamingSha256}=require('../tools/camoufox-release-preflight');
  assert(fs.statSync(installer).size>1024*1024);
  assert.strictEqual(await streamingSha256(installer),index.candidate.installerSha256);

  let requests=0;
  const trap=http.createServer((_request,response)=>{requests++;response.end('network trap');});
  await new Promise((resolve,reject)=>{
   trap.once('error',reject);
   trap.listen(0,'127.0.0.1',resolve);
  });
  try{
   const origin=`http://127.0.0.1:${trap.address().port}`;
   const url=`${origin}/unexpected`;
   writeJson(indexFile,{...index,ignored:url,candidate:{...index.candidate,ignored:url},
    reports:{...index.reports,ignored:url}});
   const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/(?:^|_)proxy$/i.test(key)));
   const output=await promisify(execFile)(process.execPath,[cliPath,...args],{encoding:'utf8',timeout:10000,
    env:{...env,HTTP_PROXY:origin,HTTPS_PROXY:origin,NO_PROXY:'',NODE_USE_ENV_PROXY:'1'}});
   const result=expectCliReport({...output,status:0},0);
   assert.deepStrictEqual(result.candidate,index.candidate);
   assert(!output.stdout.includes(url));
   assert.strictEqual(requests,0);
  }finally{await new Promise(resolve=>trap.close(resolve));}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}

testCli().then(()=>console.log('Camoufox release preflight evaluator and CLI PASS'),error=>{
 console.error(error);
 process.exitCode=1;
});
