'use strict';
const assert=require('node:assert/strict');
const {verify}=require('../tools/verify-stage0-ci-reports');
const commitSha='a'.repeat(40),exeSha256='b'.repeat(64);
const make=(cls)=>({
 classification:cls,branchHead:commitSha,browserExecutableSha256:exeSha256,
 concurrentProfiles:2,temporarySyntheticProfiles:true,
 checks:{status:'PASS',pass:true},cleanup:'PASS',
 signedReleaseAcceptance:'NOT_RUN',installedClientAcceptance:'NOT_RUN',
 network:{proxy:'NOT_RUN',dns:'NOT_RUN',webrtc:'NOT_RUN',externalEgress:'NOT_RUN'}
});
const baseline=make('LOCAL_STAGE0_DIAGNOSTIC_ONLY');
const configured={...make('LOCAL_STAGE0_CONFIGURED_PROFILE_DIAGNOSTIC_ONLY'),
 identity:{status:'PASS',distinctFields:{timezone:true,language:true}}};
const input={baseline,configured,commitSha,exeSha256};
assert.equal(verify(input).result,'PASS_LAB_ONLY');
assert.throws(()=>verify({...input,commitSha:'c'.repeat(40)}),/commit mismatch/);
assert.throws(()=>verify({...input,exeSha256:'c'.repeat(64)}),/digest mismatch/);
assert.throws(()=>verify({...input,configured:{...configured,checks:{status:'FAIL',pass:false}}}),/storage isolation/);
assert.throws(()=>verify({...input,configured:{...configured,cleanup:'NEEDS_MANUAL_REVIEW'}}),/cleanup/);
assert.throws(()=>verify({...input,configured:{...configured,identity:{...configured.identity,distinctFields:{timezone:false,language:true}}}}),/timezones/);
assert.throws(()=>verify({...input,configured:{...configured,network:{...configured.network,proxy:'PASS'}}}),/network field/);
assert.throws(()=>verify({...input,baseline:{...baseline,signedReleaseAcceptance:'PASS'}}),/signing approval/);
console.log('Camoufox Stage-0 exact-commit, EXE digest, isolation and NOT_RUN gate PASS (synthetic test only)');
