'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){const end=Date.now()+10000;while(!predicate()&&Date.now()<end)await sleep(50);assert(predicate(),'Timed out waiting for synthetic state')}
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-disabled-window-'));
 const script=path.join(root,'test.ps1'),ready=path.join(root,'ready');
 const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 fs.writeFileSync(script,String.raw`param([string]$ready)
Add-Type -AssemblyName System.Windows.Forms
$main=New-Object Windows.Forms.Form;$main.Text='LHM synthetic disabled window'
$timer=New-Object Windows.Forms.Timer;$timer.Interval=2200
$timer.Add_Tick({$timer.Stop();$main.Enabled=$true})
$main.Add_Shown({$main.Enabled=$false;[IO.File]::WriteAllText($ready,'ready');$timer.Start()})
[Windows.Forms.Application]::Run($main)
`);
 let proc;
 try{
  proc=spawnJobSupervisor(powershell,['-NoProfile','-STA','-File',script,ready],{stopGraceMs:300});proc.on('error',()=>{});
  await new Promise((resolve,reject)=>{proc.once('spawn',resolve);proc.once('error',reject)});await proc.resume();await until(()=>fs.existsSync(ready));
  const done=new Promise(resolve=>proc.once('exit',resolve));let cancelled=0;proc.on('stop-cancelled',()=>cancelled++);
  assert.equal(proc.requestJobStop(),true);await until(()=>proc.dialogBlocked);
  assert.equal(proc.windowState,'unknown','Disabled window without visible popup is unknown, not clear');
  await until(()=>cancelled===1);assert.equal(proc.jobComplete,false);
  assert.equal(proc.requestJobStop(),true);assert.equal(await Promise.race([done,sleep(6000).then(()=>{throw Error('Retry timed out')})]),0);
  assert.equal(proc.closeSummary.forced,false);
 }finally{if(proc&&!proc.jobComplete){proc.requestJobStop(true);for(let i=0;i<100&&!proc.jobComplete;i++)await sleep(50)}
  if(!proc||proc.jobComplete)fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  else console.error('Retained synthetic fixture because completion is unverified:',root)}
 console.log('Disabled window remains unknown until user choice is possible: PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
