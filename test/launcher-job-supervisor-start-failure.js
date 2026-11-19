'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Store=require('../src/db/store'),BrowserLauncher=require('../src/engine/browserLauncher');
const {spawn}=require('node:child_process'),{spawnJobSupervisor}=require('../src/engine/jobSupervisor');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-start-failure-'));
 try{
  const store=new Store(root),profile=store.saveProfile({name:'Synthetic',engine:'chromium',proxy:{type:'direct'}});
  const launcher=new BrowserLauncher(store);launcher.findBrowserBinary=()=>path.join(root,'missing-browser.exe');
  await assert.rejects(launcher.start(profile.id));
  const deadline=Date.now()+5000;while(launcher.isBusy(profile.id)&&Date.now()<deadline)await sleep(50);
  assert.equal(launcher.isBusy(profile.id),false,'Verified failure before process creation must release the lock');
  assert.equal(store.saveProfile({...profile,name:'Editable'}).name,'Editable');
  const brokenHelper=path.join(root,'broken-helper.ps1');fs.writeFileSync(brokenHelper,"throw 'synthetic initialization failure'\n");
  const second=new BrowserLauncher(store,{spawnProcess:(_bin,_args,options)=>spawnJobSupervisor(process.execPath,['-e',''],{
   ...options,supervisorSpawner:(exe,args,spawnOptions)=>spawn(exe,[args[0],brokenHelper],spawnOptions)
  })});
  second.findBrowserBinary=()=>process.execPath;
  await assert.rejects(second.start(profile.id));
  const next=Date.now()+5000;while(second.isBusy(profile.id)&&Date.now()<next)await sleep(50);
  assert.equal(second.isBusy(profile.id),false,'Failure before process creation must release the lock');
  console.log('Verified supervisor startup failure releases profile lock PASS');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
