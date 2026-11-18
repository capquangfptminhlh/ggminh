'use strict';
// Synthetic regression probe: two independent launcher processes try to
// start the same profile. No real browser, user data or network is used.
const {fork}=require('node:child_process');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const Store=require('../src/db/store');
const BrowserLauncher=require('../src/engine/browserLauncher');

if(process.argv[2]==='child'){
 const store=new Store(process.env.LHM_LOCK_PROBE_ROOT);
 const launcher=new BrowserLauncher(store,{spawnProcess:()=>{
  const child=new EventEmitter();child.pid=process.pid;child.exitCode=null;
  child.kill=()=>true;process.nextTick(()=>child.emit('spawn'));return child;
 }});
 launcher.findBrowserBinary=()=>path.join(store.baseDir,'lhm-probe-browser-missing.exe');
 process.on('message',async message=>{
  if(message==='mutate'){
   const profile=store.getProfile(process.env.LHM_LOCK_PROBE_ID);
   const blocked=action=>{try{action();return false}catch(error){return /PROFILE_LOCKED/.test(error.message)}};
   process.send({editBlocked:blocked(()=>store.saveProfile({...profile,name:'Changed'})),
    deleteBlocked:blocked(()=>store.deleteProfile(profile.id))});
   return;
  }
  if(message!=='start')return;
  try{await launcher.start(process.env.LHM_LOCK_PROBE_ID);process.send({started:true})}
  catch(error){process.send({started:false,reason:String(error.message).slice(0,160)})}
 });
}else{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-lock-probe-'));
 const store=new Store(root);
 const profile=store.saveProfile({name:'Synthetic lock test',engine:'chromium',
  proxy:{type:'direct'},fingerprint:{mode:'native'}});
 const env={...process.env,LHM_LOCK_PROBE_ROOT:root,LHM_LOCK_PROBE_ID:profile.id};
 const children=[0,1].map(()=>fork(__filename,['child'],{env,stdio:['ignore','ignore','ignore','ipc']}));
 const exited=children.map(child=>new Promise(resolve=>child.once('exit',resolve)));
 const timeout=setTimeout(()=>{for(const child of children)child.kill();
  console.error('FAIL: process probe timed out');process.exitCode=1},30000);
 const reply=child=>new Promise((resolve,reject)=>{
  child.once('message',resolve);child.once('error',reject);
  child.once('exit',code=>reject(Error('Probe process exited before replying: '+code)));
 });
 const replies=children.map(reply);
 for(const child of children)child.send('start');
 Promise.all(replies).then(async results=>{
  const count=results.filter(result=>result.started).length;
  const locked=results.filter(result=>!result.started&&/PROFILE_LOCKED/.test(result.reason)).length;
  let mutationsBlocked=false;
  if(count===1&&locked===1){
   const loser=results.findIndex(result=>!result.started);
   const response=reply(children[loser]);children[loser].send('mutate');
   const mutation=await response;
   mutationsBlocked=mutation.editBlocked===true&&mutation.deleteBlocked===true;
  }
  let recovered=null;
  if(count===1&&locked===1&&process.platform==='win32'){
   const winner=results.findIndex(result=>result.started);
   children[winner].kill();await exited[winner];
   const replacement=fork(__filename,['child'],{env,stdio:['ignore','ignore','ignore','ipc']});
   children.push(replacement);exited.push(new Promise(resolve=>replacement.once('exit',resolve)));
   const next=reply(replacement);replacement.send('start');
   recovered=!(await next).started;
  }
  const passed=count===1&&locked===1&&mutationsBlocked&&(process.platform!=='win32'||recovered===true);
  console.log(JSON.stringify({result:passed?'PASS':'FAIL',startedCount:count,
   lockedCount:locked,mutationsBlocked,blockedAfterOwnerExit:recovered}));
  if(!passed)process.exitCode=1;
 }).catch(error=>{console.error('FAIL: '+error.message);process.exitCode=1})
  .finally(async()=>{
   clearTimeout(timeout);for(const child of children)child.kill();
   await Promise.all(exited);
   const realRoot=fs.realpathSync(root),realTemp=fs.realpathSync(os.tmpdir());
   if(path.dirname(realRoot)!==realTemp||!path.basename(realRoot).startsWith('lhm-lock-probe-'))
    throw Error('Probe cleanup target is outside its temporary directory');
   fs.rmSync(realRoot,{recursive:true,force:true});
  });
}
