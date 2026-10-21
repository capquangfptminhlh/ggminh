'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const FIELDS=Object.freeze(['cookie','localStorage','indexedDB','cacheStorage']);
function safeOptions(env=process.env){
 const executable=env.LHM_CAMOUFOX_EXECUTABLE;
 const expectedSha256=env.LHM_CAMOUFOX_EXE_SHA256;
 if(typeof executable!=='string'||!executable.trim())
  throw Error('LHM_CAMOUFOX_EXECUTABLE must specify an approved absolute camoufox.exe');
 if(!/^[a-f0-9]{64}$/i.test(expectedSha256||''))
  throw Error('LHM_CAMOUFOX_EXE_SHA256 must be the independently approved executable digest');
 return {executable,expectedSha256:expectedSha256.toLowerCase()};
}
function stageStorageResult(beforeB,afterA,afterB,restartA,restartB,markers){
 for(const [name,value] of Object.entries({beforeB,afterA,afterB,restartA,restartB}))
  assert.ok(value,'Missing observation '+name);
 const left=markers.a,right=markers.b;
 if(typeof left!=='string'||typeof right!=='string'||!left||!right||left===right)
  throw Error('Distinct synthetic profile markers required');
 const checks={};
 for(const field of FIELDS){
  checks[field]={
   noAInFreshB:beforeB[field]===null,
   aIsolatedAfterBWrite:afterA[field]===left,
   bIsolatedAfterBWrite:afterB[field]===right,
   aPersistsAfterRestart:restartA[field]===left,
   bPersistsAfterRestart:restartB[field]===right
  };
 }
 return {pass:Object.values(checks).every(x=>Object.values(x).every(Boolean)),checks};
}
function digestFile(file){
 const fs=require('node:fs'),hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r');
 try{const buffer=Buffer.allocUnsafe(512*1024);let n;
  while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,n));
 }finally{fs.closeSync(fd)}
 return hash.digest('hex');
}
const IDENTITY_FIELD_MAP=Object.freeze({
 userAgent:'userAgent',platform:'platform',language:'language',
 timezone:'timezone',hardwareConcurrency:'hardwareConcurrency'
});
function identityExpectationResult(expectations,observed){
 if(!expectations||typeof expectations!=='object')
  throw Error('Identity expectations required');
 if(!observed||typeof observed!=='object')
  throw Error('Observed browser environment required');
 const fields={};
 for(const [expectedKey,observedKey] of Object.entries(IDENTITY_FIELD_MAP)){
  const expected=expectations[expectedKey]??null;
  fields[expectedKey]={expected,observed:observed[observedKey]??null,
   match:expected===null?null:expected===observed[observedKey]};
 }
 for(const [expectedKey,screenKey] of [['screenWidth','width'],['screenHeight','height']]){
  const expected=expectations[expectedKey]??null;
  const seen=observed.screen?observed.screen[screenKey]??null:null;
  fields[expectedKey]={expected,observed:seen,
   match:expected===null?null:expected===seen};
 }
 const compared=Object.values(fields).filter(f=>f.match!==null);
 return {fields,compared:compared.length,
  pass:compared.length>0&&compared.every(f=>f.match===true)};
}
module.exports={FIELDS,safeOptions,stageStorageResult,digestFile,
 IDENTITY_FIELD_MAP,identityExpectationResult};
