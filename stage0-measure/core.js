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
module.exports={FIELDS,safeOptions,stageStorageResult,digestFile};
