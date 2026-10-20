'use strict';
// Run only on a Windows runner. Starts a disposable real installed Chromium
// browser with isolated profile storage; never touches saved user sessions.
const assert=require('assert');
const fs=require('fs'),path=require('path'),os=require('os');
const {execFileSync}=require('child_process');
const Store=require('../src/db/store');
const BrowserLauncher=require('../src/engine/browserLauncher');
const {openInRunning}=require('../src/ops/liveNavigation');
const wait=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
 if(process.platform!=='win32'){
  console.log('SKIPPED: real Windows browser smoke requires win32');
  return;
 }
 const choices=[
  path.join(process.env.PROGRAMFILES||'C:\\Program Files','Google','Chrome','Application','chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)','Microsoft','Edge','Application','msedge.exe'),
  path.join(process.env.PROGRAMFILES||'C:\\Program Files','Microsoft','Edge','Application','msedge.exe')
 ];
 const executable=choices.find(x=>fs.existsSync(x));
 if(!executable)throw Error('Windows CI has no Chrome/Edge browser for mandatory smoke test');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-chrome-real-'));
 let launcher,launch;
 try{
  const store=new Store(path.join(root,'storage'));
  store.updateSettings({apiEnabled:true});
  const profile=store.saveProfile({name:'Disposable CI Chromium',engine:'chromium',
   startUrl:'https://example.com/',proxy:{type:'direct'},fingerprint:{mode:'native'}});
  launcher=new BrowserLauncher(store);
  launcher.findBrowserBinary=()=>executable;
  launch=await launcher.start(profile.id);
  assert(launch.port>=1024 && launch.port<=65535);
  let detected=false;
  for(let i=0;i<35;i++){
   try{
    const res=await fetch('http://127.0.0.1:'+launch.port+'/json/version',{
     signal:AbortSignal.timeout(900)
    });
    if(res.ok){detected=true;break;}
   }catch(_){}
   await wait(500);
  }
  assert(detected,'Real Chromium did not expose local DevTools port');
  const result=await openInRunning(store,launcher,[profile.id],'https://example.org/ci-tab');
  assert.strictEqual(result.opened,1,JSON.stringify(result));
  assert.strictEqual(result.results[0].status,'opened');
  // No shared user-data folder or other profile should have been opened.
  assert(fs.existsSync(path.join(root,'storage','profiles',profile.id)));
  console.log('REAL WINDOWS CHROMIUM OK: '+path.basename(executable)+
   ' isolated profile and active new-tab navigation via localhost DevTools');
 }finally{
  try{if(launcher&&launch)launcher.stop(launch.profileId);}catch(_){}
  if(launch?.pid){
   try{execFileSync('taskkill',['/PID',String(launch.pid),'/T','/F'],
    {stdio:'ignore',timeout:15000});}catch(_){}
  }
  await wait(1500);
  try{fs.rmSync(root,{recursive:true,force:true,maxRetries:8,retryDelay:250});}
  catch(error){console.warn('CI temporary browser folder cleanup deferred:',error.message);}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
