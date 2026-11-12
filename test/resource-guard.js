'use strict';
const assert=require('node:assert/strict');
const {assessLaunch,createResourceGuard}=require('../src/ops/resourceGuard');

const GiB=1024**3;
let result=assessLaunch({totalBytes:16*GiB,availableBytes:6*GiB,predictedBytes:2*GiB});
assert.equal(result.allowed,true);
assert.equal(result.code,'RESOURCE_OK');
result=assessLaunch({totalBytes:16*GiB,availableBytes:4*GiB,predictedBytes:2*GiB});
assert.equal(result.allowed,false);
assert.equal(result.code,'RESOURCE_LIMIT');
result=assessLaunch({totalBytes:16*GiB,availableBytes:3*GiB,predictedBytes:0});
assert.equal(result.allowed,false);
assert.equal(result.code,'RESOURCE_LIMIT');
result=assessLaunch({totalBytes:16*GiB,availableBytes:6*GiB,predictedBytes:null});
assert.equal(result.allowed,true);
assert.equal(result.reviewRequired,true);
assert.equal(result.code,'RESOURCE_UNMEASURED');
for(const input of [null,{},
 {totalBytes:0,availableBytes:1,predictedBytes:1},
 {totalBytes:16*GiB,availableBytes:-1,predictedBytes:1}]){
 result=assessLaunch(input);
 assert.equal(result.allowed,false);
 assert.equal(result.code,'RESOURCE_STATUS_INVALID');
}
(async()=>{
 const guard=createResourceGuard({
  totalMemory:()=>16*GiB,availableMemory:()=>8*GiB,
  collectResources:async roots=>({status:'MEASURED',totalProcessCount:2,
   totalWorkingSetBytes:GiB,trees:[{rootPid:roots[0],processCount:2,
    workingSetBytes:GiB}]}),
  now:()=>new Date('2026-11-10T01:02:03.000Z')
 });
 const active=[{profileId:'pb_resource',pid:4242,engineType:'camoufox'}];
 const snapshot=await guard.status(active);
 assert.equal(snapshot.sampledAt,'2026-11-10T01:02:03.000Z');
 assert.equal(snapshot.profiles[0].workingSetBytes,GiB);
 assert.equal(snapshot.profiles[0].processCount,2);
 const unmeasured=await guard.assess({profile:{engine_type:'camoufox'},active});
 assert.equal(unmeasured.code,'RESOURCE_UNMEASURED');
 assert.equal(unmeasured.reviewRequired,true);
 console.log('Resource Guard preserves 20% RAM headroom and never invents missing predictions');
})().catch(error=>{console.error(error);process.exitCode=1});
