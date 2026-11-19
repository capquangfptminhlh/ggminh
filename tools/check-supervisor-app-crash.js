'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fork}=require('node:child_process');
const Store=require('../src/db/store'),BrowserLauncher=require('../src/engine/browserLauncher');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
if(process.argv[2]==='child'){
 (async()=>{
  const store=new Store(process.env.LHM_CRASH_TEST_ROOT);
  const launcher=new BrowserLauncher(store,{spawnProcess:(_bin,_args,options)=>spawnJobSupervisor(process.execPath,['-e','setTimeout(()=>{},5000)'],options)});
  launcher.findBrowserBinary=()=>process.execPath;
  const info=await launcher.start(process.env.LHM_CRASH_TEST_ID);
  process.send({pid:info.pid});
 })().catch(error=>{process.send({error:error.message});process.exitCode=1});
}else{
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 (async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-supervisor-crash-'));
  let owner,childPid,childObservedAt=0;
  try{
   const store=new Store(root),p=store.saveProfile({name:'Synthetic',engine:'chromium',proxy:{type:'direct'}});
   owner=fork(__filename,['child'],{env:{...process.env,LHM_CRASH_TEST_ROOT:root,LHM_CRASH_TEST_ID:p.id},stdio:['ignore','ignore','ignore','ipc']});
   const message=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Crash test timed out')),12000);
    owner.once('message',value=>{clearTimeout(timer);resolve(value)});
    owner.once('exit',code=>{clearTimeout(timer);reject(Error('Owner exited early '+code))});
   });
   if(message.error)throw Error(message.error);
   childPid=message.pid;childObservedAt=Date.now();assert(Number.isSafeInteger(childPid)&&childPid>0&&childPid!==process.pid&&childPid!==owner.pid);
   const exited=new Promise(resolve=>owner.once('exit',resolve));owner.kill();await exited;
   const contender=new BrowserLauncher(new Store(root),{spawnProcess:()=>{throw Error('Must not spawn')}});
   contender.findBrowserBinary=()=>process.execPath;
   await assert.rejects(contender.start(p.id),/PROFILE_LOCKED/);
   try{process.kill(childPid,0)}catch(_){throw Error('Synthetic browser exited before crash recovery was tested')}
   const {acquireProfileLock}=require('../src/engine/profileProcessLock');
   let recovered=null;
   for(let i=0;i<100&&!recovered;i++){
    try{recovered=await acquireProfileLock(root,p.id,{browserPath:process.execPath})}
    catch(error){if(error.code!=='PROFILE_LOCKED')throw error;await sleep(100)}
   }
   assert(recovered,'Profile should recover after the job supervisor records completion');
   await recovered.release();
   childPid=null;
   console.log(JSON.stringify({result:'PASS',ownerKilled:true,reopeningBlocked:true,recoveredAfterExit:true}));
  }finally{
   if(owner&&owner.exitCode===null&&owner.signalCode===null)owner.kill();
   // The synthetic browser exits by itself after five seconds. Do not signal
   // a PID after that lifetime, when Windows may already have reused it.
   if(childPid&&Date.now()-childObservedAt<4000){try{process.kill(childPid)}catch(_){};await sleep(200)}
   fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
 })().catch(error=>{console.error(error);process.exitCode=1});
}
