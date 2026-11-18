'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Store=require('../src/db/store'),BrowserLauncher=require('../src/engine/browserLauncher');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-stop-orphan-job-'));
 let launcher,profile;
 try{
  const store=new Store(root);profile=store.saveProfile({name:'Synthetic',engine:'chromium',proxy:{type:'direct'}});
  const script="const c=require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},15000)'],{stdio:'ignore',windowsHide:true,detached:true});c.unref();setTimeout(()=>process.exit(0),500)";
  launcher=new BrowserLauncher(store,{spawnProcess:(_bin,_args,opts)=>spawnJobSupervisor(process.execPath,['-e',script],{...opts,stopGraceMs:300})});
  launcher.findBrowserBinary=()=>process.execPath;
  await launcher.start(profile.id);const proc=launcher.activeProcesses.get(profile.id).process;
  const until=Date.now()+10000;while(proc.pid!==undefined&&Date.now()<until)await sleep(50);
  assert.equal(proc.pid,undefined,'Root must exit while its child is still active');
  assert.equal(launcher.isBusy(profile.id),true);
  const done=new Promise(resolve=>proc.once('exit',resolve));
  assert.equal(launcher.stop(profile.id).success,true,'Stop must reach the remaining job');
  await Promise.race([done,sleep(6000).then(()=>{throw Error('Remaining job did not stop')})]);
  const deadline=Date.now()+5000;while(launcher.isBusy(profile.id)&&Date.now()<deadline)await sleep(50);
  assert.equal(launcher.isBusy(profile.id),false);
  console.log('Stop closes remaining supervised job after root exits PASS');
 }finally{
  if(!launcher||!profile||!launcher.isBusy(profile.id))fs.rmSync(root,{recursive:true,force:true});
  else console.error('Retained test fixture because process state is unknown:',root);
 }
})().catch(error=>{console.error(error);process.exitCode=1});
