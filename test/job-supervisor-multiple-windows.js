'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-multi-window-'));
 const script=path.join(root,'windows.ps1'),ready=path.join(root,'ready'),flushed=path.join(root,'flushed');
 const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 fs.writeFileSync(script,String.raw`param([string]$ready,[string]$flushed)
Add-Type -AssemblyName System.Windows.Forms
$a=New-Object Windows.Forms.Form;$a.Text='LHM synthetic window A'
$b=New-Object Windows.Forms.Form;$b.Text='LHM synthetic window B'
$context=New-Object Windows.Forms.ApplicationContext
$script:closed=0
$onClosed={$script:closed++;if($script:closed -eq 2){Start-Sleep -Milliseconds 1800;[IO.File]::WriteAllText($flushed,'flushed');$context.ExitThread()}}
$a.Add_FormClosed($onClosed);$b.Add_FormClosed($onClosed)
$a.Show();$b.Show();[IO.File]::WriteAllText($ready,'ready')
[Windows.Forms.Application]::Run($context)
`);
 let proc;
 try{
  proc=spawnJobSupervisor(powershell,['-NoProfile','-STA','-File',script,ready,flushed],{stopGraceMs:300});proc.on('error',()=>{});
  await new Promise((resolve,reject)=>{proc.once('spawn',resolve);proc.once('error',reject)});await proc.resume();
  const deadline=Date.now()+12000;while(!fs.existsSync(ready)&&Date.now()<deadline)await sleep(50);
  assert(fs.existsSync(ready),'Synthetic windows not ready');
  const done=new Promise(resolve=>proc.once('exit',resolve));assert.equal(proc.requestJobStop(),true);
  await sleep(900);assert.equal(proc.jobComplete,false,'Do not force a process while data is flushing');
  const code=await Promise.race([done,sleep(7000).then(()=>{throw Error('Both windows must close')})]);
  assert.equal(code,0);assert(fs.existsSync(flushed));assert.equal(proc.closeSummary.forced,false);
 }finally{if(proc&&!proc.jobComplete){proc.requestJobStop(true);for(let i=0;i<100&&!proc.jobComplete;i++)await sleep(50)}
  if(!proc||proc.jobComplete)fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  else console.error('Retained synthetic fixture because completion is unverified:',root)}
 console.log('Multiple windows and post-close flush preserved: PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
