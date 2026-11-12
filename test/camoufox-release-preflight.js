'use strict';
const assert=require('assert');
const {
 evaluateCamoufoxReleasePreflight,gate,GATE_IDS,validateEvidence,
 evaluateConfiguredIdentity,evaluateStorageIsolation,evaluateCrashDurability,
 evaluateGraphicsFingerprint
}=require('../src/engine/camoufoxReleasePreflight');

function test(name,run){try{run();}catch(error){console.error(name);throw error;}}

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
const detachedGate=(evaluator,kind,result,changes={})=>evaluator(
 installedEnvelope(kind,result,changes),gateContext);

test('configured identity accepts two distinct measured synthetic identities',()=>{
 const result=detachedGate(evaluateConfiguredIdentity,'identity',identityResult);
 assert.deepStrictEqual(result,gate('configured-identity','PASS',result.reason,'gate.json'));
 assert.strictEqual(result.evidence,'gate.json');
 assert(!JSON.stringify(result).includes('SYN-'));
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

test('storage isolation accepts exactly the six required passing conditions',()=>{
 const result=detachedGate(evaluateStorageIsolation,'isolation',isolationResult);
 assert.strictEqual(result.status,'PASS');
 assert.strictEqual(result.id,'storage-isolation');
 assert.strictEqual(result.evidence,'gate.json');
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
 ['extra condition',r=>r.unlisted='PASS'],
 ['non-enumerable extra condition',r=>Object.defineProperty(r,'hidden',{value:'PASS'})],
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

test('prints only the required success line',()=>{});
console.log('Camoufox release preflight evaluator PASS');
