'use strict';
/**
 * Experimental native, manual Camoufox launcher. No Camoufox npm package.
 * Uses only documented Firefox CLI arguments; Camoufox-specific proxy,
 * GeoIP, Juggler/CDP control and config-file injection are NOT assumed.
 * A process PID or stdout text is not a browser-readiness signal.
 */
const path=require('path');
const {spawn,execFile}=require('child_process');
const {assertProfileId,ensureIsolatedDirectory}=require('../privacy/isolation');
const {safeWebUrl}=require('./launchArgs');

const MIN_STARTUP_MS=1000;
const MAX_STARTUP_MS=45000;
function validateCamoufoxProfile(profile,baseDir){
 assertProfileId(profile?.id);
 if(typeof baseDir!=='string'||!path.isAbsolute(baseDir))
  throw Error('Profile storage root must be absolute');
 if(profile.engine!=='gecko')throw Error('Camoufox requires a Gecko profile');
 if(profile.fingerprint?.mode!=='native')
  throw Error('Camoufox native preview requires native profile settings');
 const proxy=profile.proxy||{type:'direct'};
 if(!['direct','none'].includes(proxy.type)||
    proxy.authProxyId||proxy.host||proxy.username||proxy.password||proxy.port)
  throw Error('Camoufox native preview does not support a configured proxy; refusing direct fallback');
 if(profile.geoip===true||profile.geoip?.enabled===true||
    profile.geolocation?.mode==='proxy')
  throw Error('Camoufox native preview does not support automatic GeoIP flags');
 return {profileDir:path.join(baseDir,'camoufox-profiles',profile.id)};
}
function nativeArgs(profileDir,url){
 if(!path.isAbsolute(profileDir))throw Error('Camoufox profile path must be absolute');
 return ['-no-remote','-profile',profileDir,'-new-window',safeWebUrl(url)];
}
function powershell(command,timeoutMs=5000){
 return new Promise((resolve,reject)=>{
  execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],
   {timeout:timeoutMs,windowsHide:true,encoding:'utf8'},
   (error,stdout)=>error?reject(error):resolve(String(stdout||'').trim()));
 });
}
// Window visibility, not PID alone, is used as a limited *manual UI* health
// indicator. It does NOT prove page navigation, a WebSocket, or automation.
async function windowsWindowProbe(pid){
 if(!Number.isSafeInteger(pid)||pid<=0)return false;
 try{
  return await powershell('$p=Get-Process -Id '+pid+
   ' -ErrorAction SilentlyContinue; if($p -and $p.MainWindowHandle -ne 0){"WINDOW_READY"}')
   ==='WINDOW_READY';
 }catch(_){return false;}
}
async function requestWindowClose(pid){
 if(!Number.isSafeInteger(pid)||pid<=0)return false;
 try{
  return await powershell('$p=Get-Process -Id '+pid+
   ' -ErrorAction SilentlyContinue; if($p -and $p.MainWindowHandle -ne 0)'+
   '{if($p.CloseMainWindow()){"CLOSE_REQUESTED"}}')==='CLOSE_REQUESTED';
 }catch(_){return false;}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class CamoufoxAdapter{
 constructor(baseDir,{
  bundleVerifier=null,spawnProcess=spawn,windowProbe=windowsWindowProbe,
  closeWindow=requestWindowClose,platform=process.platform,
  startupTimeoutMs=20000
 }={}){
  if(typeof spawnProcess!=='function'||typeof windowProbe!=='function'||
     typeof closeWindow!=='function')throw Error('Camoufox process helpers must be functions');
  if(!Number.isInteger(startupTimeoutMs)||startupTimeoutMs<MIN_STARTUP_MS||
     startupTimeoutMs>MAX_STARTUP_MS)throw Error('Invalid Camoufox startup timeout');
  this.baseDir=baseDir;this.bundleVerifier=bundleVerifier;
  this.spawnProcess=spawnProcess;this.windowProbe=windowProbe;
  this.closeWindow=closeWindow;this.platform=platform;
  this.startupTimeoutMs=startupTimeoutMs;
  this.sessions=new Map();this.pending=new Map();
 }
 status(){
  const signed=this.bundleVerifier?.status?.()||
   {valid:false,reason:'No signed Camoufox executable'};
  return {installed:signed.valid===true,binaryVerified:signed.valid===true,
   version:signed.version||null,active:this.sessions.size,
   runtimeCompatible:this.platform==='win32',manualOnly:true,
   automationAvailable:false,
   ready:signed.valid===true&&this.platform==='win32',
   note:signed.valid?
    'Signed native EXE available. Manual window only; proxy, GeoIP and Playwright automation remain unverified.':
    'Independent publisher-signed Camoufox EXE is not installed or verified.'};
 }
 isBusy(id){return this.sessions.has(id)||this.pending.has(id);}
 async launchProfile(profile,options={}){return this.start(profile,options);}
 async start(profile,{url,onClosed}={}){
  const id=assertProfileId(profile?.id);
  if(this.isBusy(id))throw Error('Camoufox profile is already running or starting');
  const {profileDir}=validateCamoufoxProfile(profile,this.baseDir);
  const target=safeWebUrl(url||profile.startUrl||'https://example.com/');
  const task=this._startVerified({profile,id,profileDir,target,onClosed});
  this.pending.set(id,task);
  try{return await task;}
  finally{if(this.pending.get(id)===task)this.pending.delete(id);}
 }
 async _startVerified({profile,id,profileDir,target,onClosed}){
  if(this.platform!=='win32')
   throw Error('Native Camoufox desktop process is supported only on Windows');
  if(!this.bundleVerifier||typeof this.bundleVerifier.resolve!=='function')
   throw Error('Camoufox requires a trusted, release-signed browser distribution');
  // Verifier must reject absent, modified, extra, symlinked or unsigned files.
  const executable=this.bundleVerifier.resolve('camoufox');
  if(typeof executable!=='string'||!path.isAbsolute(executable)||
     path.basename(executable).toLowerCase()!=='camoufox.exe')
   throw Error('Camoufox verifier did not supply an approved absolute executable');
  ensureIsolatedDirectory(this.baseDir,profileDir);
  const args=nativeArgs(profileDir,target);
  let child;
  let exited=false;
  let exitCode=null;
  let exitSignal=null;
  let entry=null;
  const finish=()=>{
   // Firefox descendants may inherit the redirected pipe handles. Closing
   // our read ends after process exit prevents abandoned CI/app listeners.
   child?.stdout?.destroy?.();
   child?.stderr?.destroy?.();
   if(entry&&this.sessions.get(id)===entry){
    this.sessions.delete(id);
    try{onClosed?.(entry.info);}catch(_){}
   }
  };
  try{
   child=this.spawnProcess(executable,args,{
    cwd:path.dirname(executable),windowsHide:false,
    detached:false,stdio:['ignore','pipe','pipe']
   });
   if(!child||typeof child.once!=='function'||typeof child.kill!=='function')
    throw Error('Camoufox spawn did not return a child process');
   child.once('exit',(code,signal)=>{
    exited=true;exitCode=code;exitSignal=signal;
    finish();
   });
   // ChildProcess can emit 'error' after initial spawn (not only ENOENT).
   // Do not let a late process error become an uncaught Electron crash.
   child.on('error',error=>{
    exited=true;exitSignal='process-error';
    finish();
   });
   // Draining output avoids OS pipe back-pressure, but stdout is NEVER parsed
   // as PID/WebSocket/readiness: upstream executable does not promise one.
   child.stdout?.resume?.();
   child.stderr?.resume?.();
   await new Promise((resolve,reject)=>{
    const onSpawn=()=>{child.removeListener('error',onError);resolve();};
    const onError=error=>{child.removeListener('spawn',onSpawn);reject(error);};
    child.once('spawn',onSpawn);
    child.once('error',onError);
   });
   if(!Number.isSafeInteger(child.pid)||child.pid<=0)
    throw Error('Camoufox process spawned without a valid PID');
   const until=Date.now()+this.startupTimeoutMs;
   let windowFound=false;
   while(Date.now()<until){
    if(exited)throw Error('Camoufox exited before window readiness ('+
     String(exitCode??exitSignal??'unknown')+')');
    if(await this.windowProbe(child.pid)){
     windowFound=true;break;
    }
    await sleep(250);
   }
   if(!windowFound)throw Error('Camoufox browser window not confirmed before timeout');
   if(exited)throw Error('Camoufox exited immediately after window appeared');
   const info={profileId:id,name:profile.name,engine:'gecko',
    provider:'camoufox',engineType:'camoufox',pid:child.pid,
    port:null,wsEndpoint:null,manualOnly:true,automationAvailable:false,
    startupEvidence:'native-window',startedAt:new Date().toISOString(),stopping:false};
   entry={child,info,closing:false,forceTimer:null};
   this.sessions.set(id,entry);
   return {...info};
  }catch(error){
   if(child&&!exited){
    try{child.kill('SIGTERM');}catch(_){}
   }
   child?.stdout?.destroy?.();
   child?.stderr?.destroy?.();
   throw error;
  }
 }
 stop(id){
  const entry=this.sessions.get(id);
  if(!entry)return {success:false,message:'Camoufox profile is not running'};
  if(entry.closing)return {success:false,message:'Camoufox profile is already closing'};
  entry.closing=true;entry.info.stopping=true;
  // Graceful Windows UI close lets Firefox write its profile database.
  // Avoid terminating immediately; hard kill only on explicit timeout.
  entry.forceTimer=setTimeout(()=>{
   if(this.sessions.get(id)!==entry)return;
   try{entry.child.kill('SIGTERM');}catch(_){}
  },8000);
  entry.forceTimer.unref?.();
  Promise.resolve().then(()=>this.closeWindow(entry.child.pid)).then(closed=>{
   if(!closed&&this.sessions.get(id)===entry){
    try{entry.child.kill('SIGTERM');}catch(_){}
   }
  }).catch(()=>{
   if(this.sessions.get(id)===entry)
    try{entry.child.kill('SIGTERM');}catch(_){}
  });
  entry.child.once('exit',()=>clearTimeout(entry.forceTimer));
  return {success:true,pendingExit:true};
 }
 getActive(id){return this.sessions.get(id)?.info||null;}
}
module.exports={CamoufoxAdapter,validateCamoufoxProfile,nativeArgs,
 windowsWindowProbe,requestWindowClose};
