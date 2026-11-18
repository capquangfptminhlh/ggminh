'use strict';
// Real browser crash recovery against an isolated profile and loopback server.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {fork,spawn,execFileSync}=require('node:child_process');
const moduleRoot=process.argv[2]==='owner'&&process.env.LHM_REAL_CRASH_PACKAGED==='1'
 ?path.join(process.resourcesPath,'app.asar'):path.join(__dirname,'..');
const Store=require(path.join(moduleRoot,'src','db','store'));
const BrowserLauncher=require(path.join(moduleRoot,'src','engine','browserLauncher'));
const {acquireProfileLock}=require(path.join(moduleRoot,'src','engine','profileProcessLock'));
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
if(process.argv[2]==='owner'){
 (async()=>{
  const store=new Store(process.env.LHM_REAL_CRASH_ROOT),launcher=new BrowserLauncher(store);
  launcher.findBrowserBinary=()=>process.env.LHM_REAL_CRASH_BROWSER;
  const info=await launcher.start(process.env.LHM_REAL_CRASH_ID,process.env.LHM_REAL_CRASH_URL);
  process.send({pid:info.pid});
 })().catch(error=>{process.send({error:error.message});process.exitCode=1});
}else{
 const engine=process.argv[2],browser=process.argv[3],packagedExe=process.argv[4],sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 if(!['chromium','gecko'].includes(engine)||!browser||!path.isAbsolute(browser)||!fs.existsSync(browser))throw Error('Expected engine and browser path');
 (async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-real-supervisor-crash-'));
  let visits=0,owner,pid,recovered=false;
  const server=http.createServer((req,res)=>{if(req.url==='/')visits++;res.end('local crash test')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
   const store=new Store(root),profile=store.saveProfile({name:'Synthetic crash',engine,proxy:{type:'direct'},fingerprint:{mode:'native'}});
   const env={...process.env,LHM_REAL_CRASH_ROOT:root,LHM_REAL_CRASH_ID:profile.id,LHM_REAL_CRASH_BROWSER:browser,LHM_REAL_CRASH_URL:'http://127.0.0.1:'+server.address().port+'/'};
   if(packagedExe){
    assert(path.isAbsolute(packagedExe)&&fs.existsSync(packagedExe));
    owner=spawn(packagedExe,[__filename,'owner'],{env:{...env,ELECTRON_RUN_AS_NODE:'1',LHM_REAL_CRASH_PACKAGED:'1'},windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
   }else owner=fork(__filename,['owner'],{env,stdio:['ignore','ignore','ignore','ipc']});
   const value=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owner startup timed out')),30000);
    owner.once('message',m=>{clearTimeout(timer);resolve(m)});owner.once('exit',c=>{clearTimeout(timer);reject(Error('Owner exited: '+c))})});
   if(value.error)throw Error(value.error);
   pid=value.pid;assert(Number.isSafeInteger(pid)&&pid>0&&pid!==process.pid&&pid!==owner.pid);
   const deadline=Date.now()+30000;while(visits===0&&Date.now()<deadline)await sleep(100);
   assert(visits>0,'Browser did not reach loopback');
   const ended=new Promise(resolve=>owner.once('exit',resolve));owner.kill();await ended;
   await assert.rejects(acquireProfileLock(root,profile.id,{browserPath:browser}),/PROFILE_LOCKED/);
   // Verify the exact synthetic profile command line before sending WM_CLOSE.
   const command='@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq '+pid+' -or $_.ParentProcessId -eq '+pid+' } | Select-Object ProcessId,ParentProcessId,Name,CommandLine) | ConvertTo-Json -Compress';
   const data=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:10000,encoding:'utf8'}));
   const records=Array.isArray(data)?data:[data],base=records.find(item=>item.ProcessId===pid);
   assert(base&&typeof base.CommandLine==='string'&&base.CommandLine.toLowerCase().includes(root.toLowerCase()),'Synthetic browser PID no longer matches test profile');
   const targets=engine==='gecko'?records.filter(item=>item.ParentProcessId===pid&&String(item.Name).toLowerCase()==='firefox.exe').map(item=>item.ProcessId):[pid];
   assert(targets.length>0&&targets.every(n=>Number.isSafeInteger(n)&&n>0));
   execFileSync('taskkill.exe',targets.flatMap(n=>['/PID',String(n)]),{windowsHide:true,timeout:10000,stdio:'ignore'});
   let lock=null;const until=Date.now()+30000;
   while(!lock&&Date.now()<until){try{lock=await acquireProfileLock(root,profile.id,{browserPath:browser})}catch(e){if(e.code!=='PROFILE_LOCKED')throw e;await sleep(100)}}
   assert(lock,'No verified completion evidence after browser exit');await lock.release();recovered=true;
   console.log(JSON.stringify({result:'PASS',engine,packaged:!!packagedExe,ownerKilled:true,lockedUntilBrowserClosed:true,recovered:true}));
  }finally{
   if(owner&&owner.exitCode===null&&owner.signalCode===null)owner.kill();
   await new Promise(resolve=>server.close(resolve));
   if(recovered)fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
   else console.error('Retained synthetic profile for safety:',root);
  }
 })().catch(error=>{console.error(error);process.exitCode=1});
}
