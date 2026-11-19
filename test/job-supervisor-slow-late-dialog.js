'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,timeout=10000){const end=Date.now()+timeout;while(!predicate()&&Date.now()<end)await sleep(50);assert(predicate(),'Timed out waiting for fixture state')}
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-late-dialog-'));
 const script=path.join(root,'dialog.ps1'),ready=path.join(root,'ready');
 const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 fs.writeFileSync(script,String.raw`param([string]$ready)
Add-Type -AssemblyName System.Windows.Forms
$main=New-Object Windows.Forms.Form
$main.Text='LHM synthetic late confirmation'
$script:first=$true
$dialog=New-Object Windows.Forms.Form;$dialog.Text='LHM synthetic late dialog'
$dismiss=New-Object Windows.Forms.Timer;$dismiss.Interval=1600
$dismiss.Add_Tick({$dismiss.Stop();$dialog.Close()})
$dialog.Add_Shown({$dismiss.Start()})
$timer=New-Object Windows.Forms.Timer;$timer.Interval=1200
$timer.Add_Tick({$timer.Stop();[void]$dialog.ShowDialog($main)})
$main.Add_Shown({[IO.File]::WriteAllText($ready,'ready')})
$main.Add_FormClosing({param($sender,$eventArgs)
 if($script:first){
  $eventArgs.Cancel=$true;$script:first=$false
  $timer.Start()
 }
})
[Windows.Forms.Application]::Run($main)
`);
 let proc;
 try{
  proc=spawnJobSupervisor(powershell,['-NoProfile','-STA','-File',script,ready],{stopGraceMs:900});proc.on('error',()=>{});
  await new Promise((resolve,reject)=>{proc.once('spawn',resolve);proc.once('error',reject)});await proc.resume();
  await until(()=>fs.existsSync(ready));const ended=new Promise(resolve=>proc.once('exit',resolve));
  let cancelled=0;proc.on('stop-cancelled',()=>cancelled++);
  assert.equal(proc.requestJobStop(),true);await until(()=>proc.slowClosing);
  await until(()=>proc.dialogBlocked);assert.equal(proc.jobComplete,false);
  try{await until(()=>cancelled===1)}catch(error){console.error('states',JSON.stringify(proc.windowStateCounts),'current',proc.windowState,'cancelled',cancelled);throw error}
  assert.equal(proc.slowClosing,false);assert.equal(proc.jobComplete,false);
  assert.equal(proc.requestJobStop(),true);assert.equal(await Promise.race([ended,sleep(6000).then(()=>{throw Error('Retry did not close')})]),0);
  assert.equal(proc.closeSummary.forced,false);
 }finally{if(proc&&!proc.jobComplete){proc.requestJobStop(true);for(let i=0;i<100&&!proc.jobComplete;i++)await sleep(50)}
  if(!proc||proc.jobComplete)fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  else console.error('Retained synthetic fixture because completion is unverified:',root)}
 console.log('Late dialog after slow close permits user choice and retry: PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
