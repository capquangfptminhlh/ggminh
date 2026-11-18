'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const Store=require('../src/db/store'),BrowserLauncher=require('../src/engine/browserLauncher');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-supervisor-helper-crash-'));
 let helper,browserPid;
 try{
  const store=new Store(root),p=store.saveProfile({name:'Synthetic',engine:'chromium',proxy:{type:'direct'}});
  const launcher=new BrowserLauncher(store,{spawnProcess:()=>spawnJobSupervisor(process.execPath,['-e','setTimeout(()=>{},15000)'],{
   supervisorSpawner:(...args)=>{helper=spawn(...args);return helper}
  })});
  launcher.findBrowserBinary=()=>process.execPath;
  const info=await launcher.start(p.id);browserPid=info.pid;
  assert(Number.isSafeInteger(browserPid)&&browserPid>0&&browserPid!==process.pid&&browserPid!==helper.pid);
  const done=new Promise(resolve=>helper.once('exit',resolve));helper.kill();await done;
  const deadline=Date.now()+5000;while(launcher.activeProcesses.has(p.id)&&Date.now()<deadline)await sleep(50);
  assert.equal(launcher.isBusy(p.id),true,'Unknown supervisor state must keep profile locked');
  await assert.rejects(launcher.start(p.id),/PROFILE_LOCKED/);
  assert.throws(()=>store.saveProfile({...p,name:'Changed'}),/PROFILE_LOCKED/);
  console.log('Supervisor failure retains lock and blocks reopening PASS');
 }finally{
  if(helper&&helper.exitCode===null&&helper.signalCode===null)helper.kill();
  if(browserPid){try{process.kill(browserPid)}catch(_){};for(let i=0;i<100;i++){try{process.kill(browserPid,0);await sleep(50)}catch(_){break}}}
  fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
