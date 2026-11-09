'use strict';
const assert=require('node:assert/strict');
const {assessLaunch}=require('../src/ops/resourceGuard');

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
console.log('Resource Guard preserves 20% RAM headroom and never invents missing predictions');
