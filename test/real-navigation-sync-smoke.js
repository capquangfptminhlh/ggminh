'use strict';
// Mandatory Windows proof of master-tab HTTPS navigation to a second *real*
// isolated Chromium instance. Disposable directories and example.com only.
const assert=require('assert');
const fs=require('fs'),path=require('path'),os=require('os');
const {execFileSync}=require('child_process');
const Store=require('../src/db/store');
const BrowserLauncher=require('../src/engine/browserLauncher');
const {RuntimeRegistry}=require('../src/engine/runtimeRegistry');
const {NavigationSynchronizer}=require('../src/ops/navigationSynchronizer');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function targets(port){
 const res=await fetch('http://127.0.0.1:'+port+'/json',{
  signal:AbortSignal.timeout(2500),redirect:'error'});
 if(!res.ok)throw Error('DevTools page list unavailable');
 return res.json();
}
async function navigateByCdp(port,target,url){
 if(typeof WebSocket!=='function')throw Error('Node 22 WebSocket required for live CDP');
 const conn=new WebSocket(target.webSocketDebuggerUrl);
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('CDP WebSocket handshake timed out')),7000);
   conn.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
   conn.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP socket unavailable'));},{once:true});
  });
  const reply=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('CDP navigation timed out')),9000);
   const handler=event=>{
    let msg;
    try{msg=JSON.parse(event.data);}catch(_){return;}
    if(msg.id!==41)return;
    clearTimeout(timer);
    conn.removeEventListener('message',handler);
    if(msg.error)reject(Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
   };
   conn.addEventListener('message',handler);
  });
  conn.send(JSON.stringify({id:41,method:'Page.navigate',params:{url}}));
  await reply;
 }finally{conn.close();}
}
(async()=>{
 if(process.platform!=='win32'){
  console.log('SKIPPED: navigation synchronizer real-browser test requires Windows');
  return;
 }
 const choices=[
  path.join(process.env.PROGRAMFILES||'C:\\Program Files','Google','Chrome','Application','chrome.exe'),
  path.join(process.env.PROGRAMFILES||'C:\\Program Files','Microsoft','Edge','Application','msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)','Microsoft','Edge','Application','msedge.exe')
 ];
 const executable=choices.find(file=>fs.existsSync(file));
 if(!executable)throw Error('Cannot find real installed Chrome or Edge');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-navigation-e2e-'));
 let launcher,profiles=[],sync;
 try{
  const store=new Store(path.join(root,'storage'));
  store.updateSettings({apiEnabled:true});
  const runtimes=new RuntimeRegistry(path.join(root,'storage'));
  runtimes.register('chromium',executable);
  launcher=new BrowserLauncher(store);launcher.runtimeRegistry=runtimes;
  for(const role of ['Master','Follower']){
   const profile=store.saveProfile({name:'Disposable '+role,engine:'chromium',
    startUrls:['https://example.com/'],fingerprint:{mode:'native'},proxy:{type:'direct'}});
   const browser=await launcher.start(profile.id);
   assert(browser.port>=1024);
   profiles.push({id:profile.id,port:browser.port,pid:browser.pid});
  }
  const [master,follower]=profiles;
  let tab=null;
  for(let n=0;n<30;n++){
   try{tab=(await targets(master.port)).find(x=>x.type==='page'&&
    /^https:\/\/(?:www\.)?example\.com\//.test(x.url));}
   catch(_){}
   if(tab?.webSocketDebuggerUrl)break;
   await delay(600);
  }
  assert(tab,'Master page not available for real CDP navigation');
  sync=new NavigationSynchronizer(store,launcher,{intervalMs:1500});
  sync.start({masterId:master.id,followerIds:[follower.id],
   hosts:'example.com,www.example.com'});
  // Establish baseline; never synchronize the existing initial page.
  await sync.poll();
  const selected=sync.session?.tab;
  assert(selected,'Master target not selected in allowed domain');
  tab=(await targets(master.port)).find(x=>x.id===selected);
  assert(tab?.webSocketDebuggerUrl);
  const destination='https://example.com/lhm-sync-smoke?do_not_forward=1';
  await navigateByCdp(master.port,tab,destination);
  let opened=false;
  for(let i=0;i<24;i++){
   await delay(650);
   await sync.poll();
   try{
    const pages=await targets(follower.port);
    if(pages.some(x=>x.type==='page'&&
       x.url.startsWith('https://example.com/lhm-sync-smoke'))){
      opened=true;break;
    }
   }catch(_){}
  }
  assert(opened,'HTTPS navigation was not forwarded to actual second Chromium profile');
  assert.strictEqual(sync.status().events,1);
  assert.strictEqual(sync.status().lastUrl,'https://example.com/lhm-sync-smoke');
  sync.stop();
  console.log('REAL WINDOWS NAVIGATION SYNCHRONIZER OK: 2 independent browsers, allowed HTTPS page navigation, stripped URL secrets');
 }finally{
  sync?.stop();
  for(const item of profiles){
   try{launcher?.stop(item.id);}catch(_){}
   if(item.pid){
    try{execFileSync('taskkill',['/PID',String(item.pid),'/T','/F'],
     {stdio:'ignore',timeout:15000});}catch(_){}
   }
  }
  await delay(1500);
  try{fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:250});}
  catch(error){console.warn('Temp browser cleanup deferred:',error.message);}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
