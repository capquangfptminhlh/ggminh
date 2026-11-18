'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fork,spawn}=require('node:child_process');
const lockModule=process.env.LHM_GUARD_PACKAGED==='1'
 ?path.join(process.resourcesPath,'app.asar','src','engine','profileProcessLock')
 :'../src/engine/profileProcessLock';
const {withProfileMutationLock}=require(lockModule);
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
if(process.argv[2]==='child'){
 withProfileMutationLock(process.env.LHM_GUARD_ROOT,'__lhm_store_database__',()=>{
  fs.writeFileSync(path.join(process.env.LHM_GUARD_ROOT,'ready'),'ready');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);
 },{storeLock:true});
}else{
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 (async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-guard-crash-'));let child;
  try{
   const env={...process.env,LHM_GUARD_ROOT:root};
   const exe=process.argv[2];
   child=exe?spawn(exe,[__filename,'child'],{env:{...env,ELECTRON_RUN_AS_NODE:'1',LHM_GUARD_PACKAGED:'1'},stdio:'ignore',windowsHide:true})
    :fork(__filename,['child'],{env,stdio:['ignore','ignore','ignore','ipc']});
   const deadline=Date.now()+10000;while(!fs.existsSync(path.join(root,'ready'))&&Date.now()<deadline)await sleep(50);
   assert(fs.existsSync(path.join(root,'ready')),'Child did not acquire guard');
   assert.throws(()=>withProfileMutationLock(root,'__lhm_store_database__',()=>{}, {storeLock:true}),/PROFILE_LOCKED/);
   const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;
   assert.equal(withProfileMutationLock(root,'__lhm_store_database__',()=>42,{storeLock:true}),42,
    'A dead owner must not leave a permanent recovery guard');
   console.log('Mutation guard is released by OS after owner crash PASS');
  }finally{
   if(child&&child.exitCode===null&&child.signalCode===null)child.kill();
   fs.rmSync(root,{recursive:true,force:true});
  }
 })().catch(error=>{console.error(error);process.exitCode=1});
}
