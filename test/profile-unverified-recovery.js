'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {acquireProfileLock}=require('../src/engine/profileProcessLock');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-unverified-recovery-'));
 try{
  const browserPath=process.execPath;
  const first=await acquireProfileLock(root,'pb_original',{browserPath});
  await first.markExited();
  const guesses={browserPath,ownerAlive:()=>false,localStorage:async()=>true,browserInstancesExist:async()=>false};
  await assert.rejects(acquireProfileLock(root,'pb_original',guesses),/PROFILE_LOCKED/,
   'Missing evidence of all browser processes exiting must preserve the lock');
  assert(fs.existsSync(first.filePath));
  const proof={jobName:first.jobName,token:first.token,active:0};
  fs.writeFileSync(first.evidencePath,JSON.stringify({...proof,token:'b'.repeat(48)}));
  await assert.rejects(acquireProfileLock(root,'pb_original',guesses),/PROFILE_LOCKED/,
   'Evidence for a different lock must not unlock the profile');
  fs.writeFileSync(first.evidencePath,JSON.stringify(proof));
  await assert.rejects(acquireProfileLock(root,'pb_original',{...guesses,ownerAlive:()=>true}),/PROFILE_LOCKED/,
   'A live owner must finish before another process recovers the lock');
  const {DatabaseSync}=require('node:sqlite'),originalExec=DatabaseSync.prototype.exec;
  let recovered;
  try{
   DatabaseSync.prototype.exec=function(sql){if(sql==='ROLLBACK')throw Error('simulated rollback failure');return originalExec.call(this,sql)};
   recovered=await acquireProfileLock(root,'pb_original',guesses);
  }finally{DatabaseSync.prototype.exec=originalExec}
  await recovered.release();
  const again=await acquireProfileLock(root,'pb_original',{browserPath});await again.release();
  const interrupted=await acquireProfileLock(root,'pb_interrupted',{browserPath});
  await interrupted.markExited();
  fs.writeFileSync(interrupted.evidencePath,JSON.stringify({jobName:interrupted.jobName,token:interrupted.token,active:0}));
  const originalClose=DatabaseSync.prototype.close;let injected=false;
  try{
   DatabaseSync.prototype.close=function(){const result=originalClose.call(this);if(!injected){injected=true;throw Error('simulated close failure')}return result};
   await assert.rejects(acquireProfileLock(root,'pb_interrupted',guesses),/simulated close failure/);
  }finally{DatabaseSync.prototype.close=originalClose}
  assert.equal(fs.existsSync(interrupted.filePath),false,'Failed guard close must not leave a newly created browser marker');
  const afterCloseFailure=await acquireProfileLock(root,'pb_interrupted',{browserPath});await afterCloseFailure.release();
  const other=await acquireProfileLock(root,'pb_other',{browserPath});
  await other.release();
  console.log('Unverified browser process recovery stays locked PASS');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
