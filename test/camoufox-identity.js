'use strict';
const assert=require('node:assert/strict');
const {
 parseCamouConfigEnv,summarizeIdentity,validateStoredIdentity,
 identityEnvForProfile,assertIdentityMatchesProfile
}=require('../src/engine/camoufoxIdentity');

function chunkEnv(config,chunkSize=997){
 const blob=JSON.stringify(config);
 const env={};
 for(let i=0,start=0;start<blob.length;i++,start+=chunkSize)
  env['CAMOU_CONFIG_'+(i+1)]=blob.slice(start,start+chunkSize);
 return env;
}
const baseConfig={
 'navigator.userAgent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0',
 'navigator.platform':'Win32',
 'navigator.language':'en-US',
 'locale:language':'en',
 timezone:'America/New_York',
 'screen.width':1920,'screen.height':1080,
 'navigator.hardwareConcurrency':8,
 'webGl:vendor':'Google Inc. (NVIDIA)','webGl:renderer':'ANGLE (NVIDIA)',
 fonts:['Arial','Times New Roman'],
 padding:'x'.repeat(4500)
};
const env=chunkEnv(baseConfig);
assert(Object.keys(env).length>=5,'fixture must span several chunks');

// Happy path: numeric chunk order, parse and summarize.
const parsed=parseCamouConfigEnv(env);
assert.deepEqual(parsed,baseConfig);
const summary=summarizeIdentity(parsed);
assert.equal(summary.userAgent,baseConfig['navigator.userAgent']);
assert.equal(summary.platform,'Win32');
assert.equal(summary.timezone,'America/New_York');
assert.equal(summary.screenWidth,1920);
assert.equal(summary.webglRenderer,'ANGLE (NVIDIA)');

// Rejections: gap, extra key, bad JSON, oversize chunk, array blob.
const gap={...env};delete gap.CAMOU_CONFIG_2;
assert.throws(()=>parseCamouConfigEnv(gap),/sequential/);
assert.throws(()=>parseCamouConfigEnv({...env,OTHER:'x'}),/Unexpected key/);
assert.throws(()=>parseCamouConfigEnv({CAMOU_CONFIG_1:'{broken'}),/not valid JSON/);
assert.throws(()=>parseCamouConfigEnv({CAMOU_CONFIG_1:'y'.repeat(32768)}),/exceeds/);
assert.throws(()=>parseCamouConfigEnv(chunkEnv([1,2,3])),/must be a JSON object/);
assert.throws(()=>parseCamouConfigEnv({}),/no CAMOU_CONFIG chunks/);

// Stored identity: valid passes and replays the chunks unchanged.
const identity={format:'camoufox-camou-config',version:1,
 generator:'camoufox@0.5.8',env,expectations:summary};
const checked=validateStoredIdentity(identity);
assert.deepEqual(checked.expectations,summary);

// Tampered expectations fail closed.
assert.throws(()=>validateStoredIdentity({...identity,
 expectations:{...summary,timezone:'Asia/Tokyo'}}),/do not match/);
assert.throws(()=>validateStoredIdentity({...identity,format:'other'}),/format/);
assert.throws(()=>validateStoredIdentity({...identity,version:2}),/version/);
assert.throws(()=>validateStoredIdentity({...identity,generator:'handmade'}),/generator/);

// Profile plumbing: absent identity -> null (legacy native behaviour kept).
assert.equal(identityEnvForProfile({fingerprint:{mode:'native'}}),null);
const replay=identityEnvForProfile({fingerprint:{mode:'native',identity}});
assert.deepEqual(replay.expectations,summary);
// Replay re-slices the same blob into <=2047-char chunks; joined content and
// parsed config are byte-identical to the stored blob.
const joinedStored=Object.keys(env).sort((a,b)=>
 Number(a.slice(13))-Number(b.slice(13))).map(k=>env[k]).join('');
const joinedReplay=Object.keys(replay.env).sort((a,b)=>
 Number(a.slice(13))-Number(b.slice(13))).map(k=>replay.env[k]).join('');
assert.equal(joinedReplay,joinedStored);
assert.ok(Object.values(replay.env).every(v=>v.length<=2047));
assert.deepEqual(parseCamouConfigEnv(replay.env),baseConfig);
// A blob generated on a non-Windows host (single 32767-limit chunk) is
// accepted and re-chunked for Windows replay.
const bigBlob=JSON.stringify(baseConfig);
const linuxEnv={CAMOU_CONFIG_1:bigBlob};
assert.deepEqual(parseCamouConfigEnv(linuxEnv),baseConfig);
const rechunked=identityEnvForProfile({fingerprint:{mode:'native',
 identity:{...identity,env:linuxEnv}}});
assert.ok(Object.keys(rechunked.env).length>1);
assert.equal(Object.keys(rechunked.env).sort((a,b)=>
 Number(a.slice(13))-Number(b.slice(13))).map(k=>rechunked.env[k]).join(''),
 bigBlob);
// The replayed env is a copy: mutating it must not corrupt the stored one.
replay.env.CAMOU_CONFIG_1='tampered';
assert.notEqual(identity.env.CAMOU_CONFIG_1,'tampered');

// Consistency gate against the profile's own declared fields.
assert.equal(assertIdentityMatchesProfile(
 {fingerprint:{mode:'native',os:'Windows',timezone:'America/New_York',
  languages:['en-US'],screen:{width:1920,height:1080}}},summary),true);
assert.throws(()=>assertIdentityMatchesProfile(
 {fingerprint:{mode:'native',timezone:'Europe/Berlin'}},summary),
 /CAMOUFOX_IDENTITY_MISMATCH/);
assert.throws(()=>assertIdentityMatchesProfile(
 {fingerprint:{mode:'native',os:'Linux'}},summary),
 /CAMOUFOX_IDENTITY_MISMATCH/);
assert.throws(()=>assertIdentityMatchesProfile(
 {fingerprint:{mode:'native',screen:{width:1366}}},summary),
 /CAMOUFOX_IDENTITY_MISMATCH/);

// Locale parts compose into the observed navigator.language tag.
const partsConfig={...baseConfig};
delete partsConfig['navigator.language'];
partsConfig['locale:language']='vi';partsConfig['locale:region']='VN';
assert.equal(summarizeIdentity(partsConfig).language,'vi-VN');
const langOnly={...partsConfig};delete langOnly['locale:region'];
assert.equal(summarizeIdentity(langOnly).language,'vi');

console.log('camoufox-identity: PASS');
