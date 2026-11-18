'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Store=require('../src/db/store'),BrowserLauncher=require('../src/engine/browserLauncher');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-supervised-lock-'));
 try{
  const store=new Store(root),p=store.saveProfile({name:'Synthetic',engine:'chromium',proxy:{type:'direct'}});
  const script="const c=require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},4000)'],{stdio:'ignore',windowsHide:true,detached:true});c.unref();setTimeout(()=>process.exit(0),700)";
  const launcher=new BrowserLauncher(store,{spawnProcess:()=>spawnJobSupervisor(process.execPath,['-e',script])});
  launcher.findBrowserBinary=()=>process.execPath;
  await launcher.start(p.id);
  const current=launcher.activeProcesses.get(p.id);current.stopping=true;
  current.process.emit('stop-cancelled');
  assert.equal(current.stopping,false,'A canceled dialog stop must allow a later stop request');
  await sleep(2000);
  assert.equal(launcher.isBusy(p.id),true,'Profile remains locked while descendant is alive');
  assert.throws(()=>store.saveProfile({...p,name:'Changed'}),/PROFILE_LOCKED/);
  const deadline=Date.now()+10000;while(launcher.isBusy(p.id)&&Date.now()<deadline)await sleep(100);
  assert.equal(launcher.isBusy(p.id),false,'Profile unlocks after job is empty');
  assert.equal(store.saveProfile({...p,name:'Changed'}).name,'Changed');
  console.log('Launcher holds lock until supervised process tree exits PASS');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
