'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const supervisorModule=process.env.LHM_MODAL_PACKAGED==='1'
 ?path.join(process.resourcesPath,'app.asar','src','engine','jobSupervisor')
 :'../src/engine/jobSupervisor';
const {spawnJobSupervisor}=require(supervisorModule);
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-modal-test-'));
 const script=path.join(root,'modal.ps1'),ready=path.join(root,'ready');
 const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 fs.writeFileSync(script, String.raw`param([string]$ready)
Add-Type -AssemblyName System.Windows.Forms
$main=New-Object Windows.Forms.Form
$main.Text='LHM synthetic main'
$main.Add_Shown({
 $dialog=New-Object Windows.Forms.Form
 $dialog.Text='LHM synthetic dialog'
 $timer=New-Object Windows.Forms.Timer
 $timer.Interval=3500
 $timer.Add_Tick({$timer.Stop();$dialog.Close()})
 $dialog.Add_Shown({[IO.File]::WriteAllText($ready,'ready');$timer.Start()})
 [void]$dialog.ShowDialog($main)
})
[Windows.Forms.Application]::Run($main)
`);
 let proc;
 try{
  proc=spawnJobSupervisor(powershell,['-NoProfile','-STA','-File',script,ready],{stopGraceMs:1200});
  proc.on('error',()=>{});
  await new Promise((resolve,reject)=>{proc.once('spawn',resolve);proc.once('error',reject)});await proc.resume();
  const until=Date.now()+12000;while(!fs.existsSync(ready)&&Date.now()<until)await sleep(50);
  assert(fs.existsSync(ready),'Synthetic modal did not open');
  const ended=new Promise(resolve=>proc.once('exit',resolve));
  assert.equal(proc.requestJobStop(),true);
  await sleep(2000);
  assert.equal(proc.jobComplete,false,'Job must remain alive while a modal dialog awaits user input');
  assert.equal(proc.dialogBlocked,true,'Application must be able to tell the user a dialog needs attention');
  const clearedUntil=Date.now()+8000;
  while(proc.dialogBlocked&&Date.now()<clearedUntil)await sleep(50);
  assert.equal(proc.dialogBlocked,false,'Dialog state should clear when dismissed');
  await sleep(2000);
  assert.equal(proc.jobComplete,false,'Dismissing a dialog must not automatically retry a close the user may have canceled');
  assert.equal(proc.requestJobStop(),true,'A later user stop can be requested');
  assert.equal(await Promise.race([ended,sleep(12000).then(()=>{throw Error('Did not close after dialog dismissed')})]),0);
  assert.equal(proc.jobComplete,true);
  console.log('Modal dialog preserves browser until user choice PASS');
 }finally{
  if(proc&&!proc.jobComplete)proc.requestJobStop(true);
  await sleep(300);
  fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
