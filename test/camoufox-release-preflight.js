'use strict';
const assert=require('assert');
const {evaluateCamoufoxReleasePreflight,gate,GATE_IDS}=require('../src/engine/camoufoxReleasePreflight');

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
assert.strictEqual(report.overall,'READY_FOR_OWNER_REVIEW');
assert.deepStrictEqual(report.blockers,[]);
assert(report.limitation.length>0);
assert(!JSON.stringify(report).includes('RELEASED'));
assert.deepStrictEqual(Object.keys(report.candidate).sort(),
 ['commit','engineSha256','engineVersion','installerSha256'].sort());

const blockedGates=gates.map(item=>item.id==='graphics-fingerprint'?
 gate(item.id,'BLOCKED','Graphics evidence failed',item.evidence):item);
assert.strictEqual(evaluateCamoufoxReleasePreflight(candidate,blockedGates,now).overall,'BLOCKED');
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

console.log('Camoufox release preflight evaluator PASS');
