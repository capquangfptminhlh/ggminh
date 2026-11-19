'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{fork}=require('node:child_process');
const Store=require('../src/db/store'),BrowserLauncher=require('../src/engine/browserLauncher');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
const {acquireProfileLock}=require('../src/engine/profileProcessLock');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(process.argv[2]==='owner'){
 (async()=>{
  const root=process.env.LHM_SLOW_CRASH_ROOT,id=process.env.LHM_SLOW_CRASH_ID;
  const store=new Store(root);
  const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const launcher=new BrowserLauncher(store,{spawnProcess:(_bin,_args,options)=>spawnJobSupervisor(powershell,
   ['-NoProfile','-STA','-File',path.join(root,'slow.ps1'),path.join(root,'ready'),path.join(root,'flushed')],{...options,stopGraceMs:300})});
  launcher.findBrowserBinary=()=>powershell;
  await launcher.start(id);const proc=launcher.activeProcesses.get(id).process;
  let deadline=Date.now()+10000;while(!fs.existsSync(path.join(root,'ready'))&&Date.now()<deadline)await sleep(50);
  if(!fs.existsSync(path.join(root,'ready')))throw Error('window did not start');
  if(!launcher.stop(id).success)throw Error('stop not accepted');
  deadline=Date.now()+5000;while(!proc.slowClosing&&Date.now()<deadline)await sleep(50);
  if(!proc.slowClosing||proc.jobComplete)throw Error('slow wait not reached');
  process.send({slow:true});
 })().catch(error=>{process.send({error:error.message});process.exitCode=1});
}else{
 (async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-slow-owner-crash-'));
  const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  fs.writeFileSync(path.join(root,'slow.ps1'),String.raw`param([string]$ready,[string]$flushed)
Add-Type -AssemblyName System.Windows.Forms
$form=New-Object Windows.Forms.Form;$form.Text='LHM synthetic crash slow close'
$form.Add_Shown({[IO.File]::WriteAllText($ready,'ready')})
$form.Add_FormClosing({Start-Sleep -Milliseconds 5000;[IO.File]::WriteAllText($flushed,'flushed')})
[Windows.Forms.Application]::Run($form)
`);
  let owner,recovered=null,verifiedComplete=false;
  try{
   const store=new Store(root),p=store.saveProfile({name:'Synthetic',engine:'chromium',proxy:{type:'direct'}});
   owner=fork(__filename,['owner'],{env:{...process.env,LHM_SLOW_CRASH_ROOT:root,LHM_SLOW_CRASH_ID:p.id},stdio:['ignore','ignore','ignore','ipc']});
   const message=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Synthetic owner timeout')),18000);
    owner.once('message',value=>{clearTimeout(timer);resolve(value)});
    owner.once('exit',code=>{clearTimeout(timer);reject(Error('Owner exited early '+code))});
   });
   if(message.error)throw Error(message.error);assert.equal(message.slow,true);
   const exited=new Promise(resolve=>owner.once('exit',resolve));owner.kill();await exited;
   const options={browserPath:powershell,localStorage:async()=>true};
   await assert.rejects(acquireProfileLock(root,p.id,options),/PROFILE_LOCKED/);
   assert(!fs.existsSync(path.join(root,'flushed')),'Profile remained locked while synthetic flush was pending');
   for(let i=0;i<120&&!recovered;i++){
    try{recovered=await acquireProfileLock(root,p.id,options)}
    catch(error){if(error.code!=='PROFILE_LOCKED')throw error;await sleep(100)}
   }
   assert(recovered,'Lock should recover after supervisor records empty job');
   assert(fs.existsSync(path.join(root,'flushed')),'Synthetic write completed before recovery');
   await recovered.release();recovered=null;
   verifiedComplete=true;
   console.log('Owner crash during slow close retains lock until flush and job completion: PASS');
  }finally{
   if(owner&&owner.exitCode===null&&owner.signalCode===null)owner.kill();
   if(recovered)await recovered.release();
   if(verifiedComplete)fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
   else console.error('Retained synthetic fixture because completion was not observed:',root);
  }
 })().catch(error=>{console.error(error);process.exitCode=1});
}
