'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {
 evaluateCapabilities,loadCapabilityPolicy
}=require('../src/engine/camoufoxCapabilityPolicy');

const policy={schema:1,releases:[{
 version:'156.0.1',manual:true,proxyTypes:['http','socks5'],
 evidence:'stage0-measure/ip-leak-results-gecko-2026-11-07.json',verdict:'PASS'
}]};
const approved=evaluateCapabilities({engineVersion:'156.0.1',policy});
assert.equal(approved.manual,true);
assert.deepEqual(approved.proxyTypes,['http','socks5']);
assert.equal(approved.evidence,policy.releases[0].evidence);
assert.equal(approved.reason,null);

for(const [label,engineVersion,value] of [
 ['unknown version','156.0.2',policy],
 ['missing policy','156.0.1',null],
 ['extra top-level field','156.0.1',{...policy,enabled:true}],
 ['wrong evidence location','156.0.1',{schema:1,releases:[{
  ...policy.releases[0],evidence:'other/result.json'}]}],
 ['unsupported proxy type','156.0.1',{schema:1,releases:[{
  ...policy.releases[0],proxyTypes:['https']}]}],
 ['duplicate proxy type','156.0.1',{schema:1,releases:[{
  ...policy.releases[0],proxyTypes:['http','http']}]}],
 ['non-pass verdict','156.0.1',{schema:1,releases:[{
  ...policy.releases[0],verdict:'NOT_RUN'}]}]
]){
 const result=evaluateCapabilities({engineVersion,policy:value});
 assert.equal(result.manual,false,label);
 assert.deepEqual(result.proxyTypes,[],label);
 assert.equal(typeof result.reason,'string',label);
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-capability-policy-'));
try{
 const good=path.join(root,'capabilities.json');
 fs.writeFileSync(good,JSON.stringify(policy));
 assert.deepEqual(loadCapabilityPolicy(good),policy);
 assert.equal(loadCapabilityPolicy(path.join(root,'missing.json')),null);
 const bad=path.join(root,'bad.json');
 fs.writeFileSync(bad,'{"schema":');
 assert.equal(loadCapabilityPolicy(bad),null);
 const huge=path.join(root,'huge.json');
 fs.writeFileSync(huge,' '.repeat(1024*1024+1));
 assert.equal(loadCapabilityPolicy(huge),null);
}finally{fs.rmSync(root,{recursive:true,force:true})}

console.log('Camoufox capability policy is exact-version, evidence-bound and fail-closed');
