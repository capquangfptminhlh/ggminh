'use strict';
const assert=require('node:assert/strict');
const {stageStorageResult,safeOptions,FIELDS,identityExpectationResult}=require('./core');
const markers={a:'a-synthetic',b:'b-synthetic'};
const left=Object.fromEntries(FIELDS.map(x=>[x,markers.a]));
const right=Object.fromEntries(FIELDS.map(x=>[x,markers.b]));
const empty=Object.fromEntries(FIELDS.map(x=>[x,null]));
assert.equal(stageStorageResult(empty,left,right,left,right,markers).pass,true);
assert.equal(stageStorageResult({...empty,cookie:markers.a},left,right,left,right,markers).pass,false);
assert.equal(stageStorageResult(empty,left,{...right,indexedDB:markers.a},left,right,markers).pass,false);
assert.equal(stageStorageResult(empty,left,right,{...left,cacheStorage:null},right,markers).pass,false);
assert.throws(()=>safeOptions({LHM_CAMOUFOX_EXECUTABLE:'C:\\camoufox.exe',LHM_CAMOUFOX_EXE_SHA256:'bad'}),/digest/);
assert.equal(safeOptions({LHM_CAMOUFOX_EXECUTABLE:'C:\\camoufox.exe',LHM_CAMOUFOX_EXE_SHA256:'A'.repeat(64)}).expectedSha256,'a'.repeat(64));
assert.throws(()=>stageStorageResult(empty,left,right,left,right,{a:'same',b:'same'}),/Distinct/);
// Identity expectation contract: a configured profile must expose exactly
// the values its pinned identity declares, field by field.
const expectations={userAgent:'UA-A',platform:'Win32',language:'en-US',
 timezone:'America/New_York',screenWidth:1920,screenHeight:1080,
 hardwareConcurrency:8,webglVendor:null,webglRenderer:null};
const observed={userAgent:'UA-A',platform:'Win32',language:'en-US',
 timezone:'America/New_York',screen:{width:1920,height:1080},hardwareConcurrency:8};
const good=identityExpectationResult(expectations,observed);
assert.equal(good.pass,true);
assert.equal(good.fields.webglVendor,undefined,'webgl is not captured by this probe and must not be compared');
assert.equal(identityExpectationResult(expectations,
 {...observed,timezone:'Asia/Tokyo'}).pass,false);
assert.equal(identityExpectationResult(expectations,
 {...observed,screen:{width:1366,height:1080}}).fields.screenWidth.match,false);
assert.equal(identityExpectationResult(expectations,
 {...observed,userAgent:'UA-B'}).fields.userAgent.match,false);
assert.throws(()=>identityExpectationResult(null,observed),/expectations/);
console.log('Stage-0 contract: PASS; real Windows browser measurements NOT_RUN');
