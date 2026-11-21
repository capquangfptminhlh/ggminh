'use strict';
const assert=require('node:assert/strict');
const {firstProfileRequest}=require('../tools/storage-isolation-requests');
const requests=[
 {url:'/persistence/B',cookie:'lhm_test_persist=A'},
 {url:'/persistence/A',cookie:''},
 {url:'/persistence/A',cookie:'lhm_test_persist=A'}
];
assert.deepEqual(firstProfileRequest(requests,'A'),requests[1],
 'The check must inspect A’s first request, not B’s or a later A request');
assert.equal(firstProfileRequest([{url:'/persistence/B'}],'A'),null);
assert.throws(()=>firstProfileRequest(requests,'../A'),/Invalid/);
console.log('Storage isolation uses the first request of the intended profile: PASS');
