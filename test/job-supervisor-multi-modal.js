'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){const end=Date.now()+10000;while(!predicate()&&Date.now()<end)await sleep(50);assert(predicate(),'Timed out waiting for fixture state')}
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-multi-modal-'));
 const script=path.join(root,'multi.ps1'),ready=path.join(root,'ready'),first=path.join(root,'first');
 const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 fs.writeFileSync(script,String.raw`param([string]$ready,[string]$first)
Add-Type -AssemblyName System.Windows.Forms
$a=New-Object Windows.Forms.Form;$a.Text='LHM synthetic window A'
$b=New-Object Windows.Forms.Form;$b.Text='LHM synthetic window B'
$context=New-Object Windows.Forms.ApplicationContext
$script:closing=0;$script:closed=0
$dialog=New-Object Windows.Forms.Form;$dialog.Text='LHM synthetic confirmation'
$timer=New-Object Windows.Forms.Timer;$timer.Interval=1800
$timer.Add_Tick({$timer.Stop();$dialog.Close()});$dialog.Add_Shown({$timer.Start()})
$onClosing={param($sender,$eventArgs)
 $script:closing++
 if($script:closing -eq 2){$eventArgs.Cancel=$true;[void]$dialog.ShowDialog($sender)}
}
$onClosed={$script:closed++;if($script:closed -eq 1){[IO.File]::WriteAllText($first,'closed')};if($script:closed -eq 2){$context.ExitThread()}}
$a.Add_FormClosing($onClosing);$b.Add_FormClosing($onClosing)
$a.Add_FormClosed($onClosed);$b.Add_FormClosed($onClosed)
$a.Show();$b.Show();[IO.File]::WriteAllText($ready,'ready');[Windows.Forms.Application]::Run($context)
`);
 let proc;
 try{
  proc=spawnJobSupervisor(powershell,['-NoProfile','-STA','-File',script,ready,first],{stopGraceMs:300});proc.on('error',()=>{});
  await new Promise((resolve,reject)=>{proc.once('spawn',resolve);proc.once('error',reject)});await proc.resume();await until(()=>fs.existsSync(ready));
  const done=new Promise(resolve=>proc.once('exit',resolve));let cancelled=0;proc.on('stop-cancelled',()=>cancelled++);
  assert.equal(proc.requestJobStop(),true);await until(()=>fs.existsSync(first));await until(()=>proc.dialogBlocked);
  assert.equal(proc.jobComplete,false,'Do not force the remaining window while its dialog is open');
  await until(()=>cancelled===1);assert.equal(proc.jobComplete,false,'A cancelled close cannot automatically close the other window');
  assert.equal(proc.requestJobStop(),true);assert.equal(await Promise.race([done,sleep(6000).then(()=>{throw Error('Retry timed out')})]),0);
  assert.equal(proc.closeSummary.forced,false);
 }finally{if(proc&&!proc.jobComplete){proc.requestJobStop(true);for(let i=0;i<100&&!proc.jobComplete;i++)await sleep(50)}
  if(!proc||proc.jobComplete)fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  else console.error('Retained synthetic fixture because completion is unverified:',root)}
 console.log('Second window dialog preserves user choice: PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
