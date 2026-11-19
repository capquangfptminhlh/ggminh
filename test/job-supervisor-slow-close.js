'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
const Store=require('../src/db/store'),BrowserLauncher=require('../src/engine/browserLauncher');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-slow-close-'));
 const script=path.join(root,'slow.ps1'),ready=path.join(root,'ready'),flushed=path.join(root,'flushed');
 const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 fs.writeFileSync(script,String.raw`param([string]$ready,[string]$flushed)
Add-Type -AssemblyName System.Windows.Forms
$form=New-Object Windows.Forms.Form
$form.Text='LHM synthetic slow close'
$form.Add_Shown({[IO.File]::WriteAllText($ready,'ready')})
$form.Add_FormClosing({Start-Sleep -Milliseconds 1800;[IO.File]::WriteAllText($flushed,'flushed')})
[Windows.Forms.Application]::Run($form)
`);
 let proc,launcher,profile;
 try{
  proc=spawnJobSupervisor(powershell,['-NoProfile','-STA','-File',script,ready,flushed],{stopGraceMs:1200});
  proc.on('error',()=>{});
  await new Promise((resolve,reject)=>{proc.once('spawn',resolve);proc.once('error',reject)});await proc.resume();
  const deadline=Date.now()+12000;while(!fs.existsSync(ready)&&Date.now()<deadline)await sleep(50);
  assert(fs.existsSync(ready),'Synthetic window did not start');
  const ended=new Promise(resolve=>proc.once('exit',resolve));
  assert.equal(proc.requestJobStop(),true);
  await sleep(1500);
  assert.equal(proc.slowClosing,true,'Slow close should be exposed to the application');
  assert.equal(proc.jobComplete,false,'Job remains active until its pending write completes');
  const code=await Promise.race([ended,sleep(7000).then(()=>{throw Error('Slow-close fixture timed out')})]);
  assert.equal(code,0,'Slow graceful close must not be terminated mid-flush');
  assert(fs.existsSync(flushed),'Pending synthetic data must flush');
  assert.equal(proc.closeSummary?.forced,false);
  assert.equal(proc.closeSummary.sent,1,'Do not repeatedly send WM_CLOSE before a slow write completes');
  const rootScript="const {spawn}=require('node:child_process');spawn(process.argv[1],['-NoProfile','-STA','-File',process.argv[2],process.argv[3],process.argv[4]],{stdio:'ignore'});setInterval(()=>{},1000)";
  fs.unlinkSync(ready);fs.unlinkSync(flushed);
  const store=new Store(path.join(root,'app'));profile=store.saveProfile({name:'Synthetic slow child',engine:'chromium',proxy:{type:'direct'}});
  launcher=new BrowserLauncher(store,{spawnProcess:(_bin,_args,opts)=>spawnJobSupervisor(process.execPath,
   ['-e',rootScript,powershell,script,ready,flushed],{...opts,stopGraceMs:300})});
  launcher.findBrowserBinary=()=>process.execPath;
  await launcher.start(profile.id);proc=launcher.activeProcesses.get(profile.id).process;
  const childDeadline=Date.now()+12000;while(!fs.existsSync(ready)&&Date.now()<childDeadline)await sleep(50);
  assert(fs.existsSync(ready),'Synthetic child window did not start');
  const rootEnd=new Promise(resolve=>proc.once('exit',resolve));
  assert.equal(launcher.stop(profile.id).success,true);await sleep(2600);
  assert.equal(proc.slowClosing,true);assert.equal(proc.jobComplete,false,'Hanging root must keep job active after child window closes');
  assert.equal(launcher.isBusy(profile.id),true,'Profile lock must stay held while job is active');
  assert.throws(()=>store.saveProfile({...profile,name:'Should not save'}),/PROFILE_LOCKED/);
  assert(fs.existsSync(flushed),'Child window must flush before explicit test cleanup');
  assert.equal(proc.requestJobStop(true),true,'Explicit job force remains available for synthetic cleanup');
  await Promise.race([rootEnd,sleep(5000).then(()=>{throw Error('Synthetic root cleanup timed out')})]);
  assert.equal(proc.closeSummary?.forced,true);
  const unlockDeadline=Date.now()+5000;while(launcher.isBusy(profile.id)&&Date.now()<unlockDeadline)await sleep(50);
  assert.equal(launcher.isBusy(profile.id),false,'Profile may unlock only after job completion');
 }finally{
  if(proc&&!proc.jobComplete){proc.requestJobStop(true);for(let i=0;i<100&&!proc.jobComplete;i++)await sleep(50)}
  if((!proc||proc.jobComplete)&&(!launcher||!profile||!launcher.isBusy(profile.id)))fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  else console.error('Retained synthetic fixture because job completion is unverified:',root);
 }
 console.log('Slow close preserved data: PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
