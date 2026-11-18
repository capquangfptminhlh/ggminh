'use strict';
// Real-browser, loopback-only cross-process test using temporary profiles.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),{fork}=require('node:child_process');
const Store=require('../src/db/store');
const BrowserLauncher=require('../src/engine/browserLauncher');
if(process.argv[2]==='child'){
 const store=new Store(process.env.LHM_REAL_LOCK_ROOT);
 const launcher=new BrowserLauncher(store);
 launcher.findBrowserBinary=()=>process.env.LHM_REAL_LOCK_BROWSER;
 process.on('message',async message=>{
  if(message==='start'){
   try{await launcher.start(process.env.LHM_REAL_LOCK_ID,process.env.LHM_REAL_LOCK_URL);process.send({started:true})}
   catch(error){process.send({started:false,reason:String(error.message).slice(0,160)})}
  }
  if(message==='stop'){
   const pending=launcher.pendingStarts.get(process.env.LHM_REAL_LOCK_ID);
   if(pending)await pending.catch(()=>{});
   const proc=launcher.activeProcesses.get(process.env.LHM_REAL_LOCK_ID)?.process;
   if(!proc){process.send({stopped:true});return}
   proc.once('exit',(code,signal)=>process.send({stopped:true,code,signal}));
   if(!launcher.stop(process.env.LHM_REAL_LOCK_ID).success)process.send({stopped:false});
  }
 });
}else{
 (async()=>{
  const browser=process.argv[2],engine=process.argv[3]||'chromium';
  if(!browser||!path.isAbsolute(browser)||!fs.existsSync(browser)||!['chromium','gecko'].includes(engine))
   throw Error('Usage: node tools/check-real-profile-exclusion.js <browser> [chromium|gecko]');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-real-lock-probe-'));
  let visits=0;
  const server=http.createServer((req,res)=>{if(req.url==='/')visits++;res.setHeader('Cache-Control','no-store');res.end('local test')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const store=new Store(root);
  const profile=store.saveProfile({name:'Synthetic lock test',engine,proxy:{type:'direct'},fingerprint:{mode:'native'}});
  const env={...process.env,LHM_REAL_LOCK_ROOT:root,LHM_REAL_LOCK_ID:profile.id,
   LHM_REAL_LOCK_BROWSER:browser,LHM_REAL_LOCK_URL:'http://127.0.0.1:'+server.address().port+'/'};
  const children=[];
  const request=(child,message)=>new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Browser probe timed out')),30000);
   const onExit=()=>{clearTimeout(timer);reject(Error('Probe process exited before response'))};
   child.once('exit',onExit);child.once('message',value=>{clearTimeout(timer);child.off('exit',onExit);resolve(value)});
   child.send(message);
  });
  const startChild=()=>{const child=fork(__filename,['child'],{env,stdio:['ignore','ignore','ignore','ipc']});children.push(child);return child};
  try{
   const pair=[startChild(),startChild()];
   const results=await Promise.all(pair.map(child=>request(child,'start')));
   const winner=results.findIndex(item=>item.started);
   const locked=results.filter(item=>!item.started&&/PROFILE_LOCKED/.test(item.reason)).length;
   if(winner<0||results.filter(item=>item.started).length!==1||locked!==1)throw Error('Two-process exclusion failed');
   for(let i=0;i<120&&visits<1;i++)await new Promise(resolve=>setTimeout(resolve,250));
   if(visits<1)throw Error('Browser did not reach the loopback test page');
   const stopped=await request(pair[winner],'stop');
   if(!stopped.stopped||stopped.code!==0)throw Error('Browser did not stop cleanly');
   const previousVisits=visits;
   const replacement=startChild();const reopened=await request(replacement,'start');
   if(!reopened.started)throw Error('Profile could not reopen after clean exit');
   for(let i=0;i<120&&visits<=previousVisits;i++)await new Promise(resolve=>setTimeout(resolve,250));
   if(visits<=previousVisits)throw Error('Reopened browser did not reach the loopback test page');
   const stoppedAgain=await request(replacement,'stop');
   if(!stoppedAgain.stopped||stoppedAgain.code!==0)throw Error('Reopened browser did not stop cleanly');
   console.log(JSON.stringify({result:'PASS',engine,startedCount:1,lockedCount:1,reopened:true}));
  }finally{
   const cleanup=await Promise.all(children.map(async child=>{
    if(!child.connected)return false;
    try{return (await request(child,'stop')).stopped===true}catch(_){return false}
   }));
   await new Promise(resolve=>server.close(resolve));
   if(cleanup.every(Boolean)){
    for(const child of children){child.disconnect();child.kill()}
    const realRoot=fs.realpathSync(root),realTemp=fs.realpathSync(os.tmpdir());
    if(path.dirname(realRoot)!==realTemp||!path.basename(realRoot).startsWith('lhm-real-lock-probe-'))
     throw Error('Unsafe probe cleanup target');
    fs.rmSync(realRoot,{recursive:true,force:true,maxRetries:4,retryDelay:200});
   }else{
    console.error('Probe cleanup incomplete; temporary files retained:',root);
    process.exitCode=1;
   }
  }
 })().catch(error=>{console.error(error.message);process.exitCode=1});
}
