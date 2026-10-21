'use strict';
/**
 * Experimental in-process Playwright controller for independently signed
 * Camoufox Windows releases. Never exposes a fake WebSocket/CDP endpoint.
 * Disabled in production until real compatibility and packaged app tests.
 */
const path=require('path');
const {assertProfileId,ensureIsolatedDirectory}=require('../privacy/isolation');
const {safeWebUrl}=require('./launchArgs');
const {prepareCamoufoxProxy}=require('./camoufoxProxyPlan');
const {firefoxPrefs,assertIsolatedProfileDirectory}=require('./CamoufoxProfileManager');
const NetworkSafetyCheck=require('./NetworkSafetyCheck');

class CamoufoxPlaywrightController{
 constructor(root,{verifier,store=null,proxyVault=null,launchPersistentContext=null,
  prepareProxy=prepareCamoufoxProxy,labApproved=false,enabled=false}={}){
  if(!path.isAbsolute(root))throw Error('Absolute profile root required');
  if(typeof prepareProxy!=='function')throw Error('Invalid proxy configurator');
  this.root=root;this.verifier=verifier;this.store=store;this.proxyVault=proxyVault;
  this.launchContext=launchPersistentContext;this.prepareProxy=prepareProxy;
  this.labApproved=labApproved===true;this.enabled=enabled===true;
  this.sessions=new Map();this.pending=new Set();
 }
 async launch(profile,{url,onClosed}={}){
  if(!this.enabled)throw Error('Camoufox Playwright controller is gated: experimental only');
  const id=assertProfileId(profile?.id);
  if(this.pending.has(id)||this.sessions.has(id))
   throw Error('Camoufox profile is running or starting');
  this.pending.add(id);
  let proxyPlan=null,context=null;
  try{
   if(profile.engine!=='gecko'||profile.fingerprint?.mode!=='native')
    throw Error('Camoufox Playwright requires a native Gecko profile');
   const preflight=NetworkSafetyCheck.evaluate(profile,{
    labApproved:this.labApproved,store:this.store,proxyVault:this.proxyVault});
   if(!preflight.safeToLaunch){
    const error=new Error('NETWORK_BLOCKED: '+preflight.reason);
    error.code='NETWORK_BLOCKED';throw error;
   }
   if(!this.verifier||typeof this.verifier.resolve!=='function')
    throw Error('Publisher-signed Camoufox release verifier required');
   const executable=this.verifier.resolve('camoufox');
   if(typeof executable!=='string'||!path.isAbsolute(executable)||
      path.basename(executable).toLowerCase()!=='camoufox.exe')
    throw Error('Verified absolute Camoufox executable required');
   const profileDir=assertIsolatedProfileDirectory(
    this.root,path.join(this.root,'camoufox-profiles',id));
   ensureIsolatedDirectory(this.root,profileDir);
   proxyPlan=await this.prepareProxy(profile,profileDir,{
    store:this.store,proxyVault:this.proxyVault
   });
   const options={
    executablePath:executable,headless:false,
    firefoxUserPrefs:firefoxPrefs(profile,proxyPlan),
    timeout:30000
   };
   if(proxyPlan.mode==='authenticated-connect'){
    if(!this.labApproved)throw Error('NETWORK_BLOCKED: no approved proxy lab');
    // Playwright proxy option; no Chromium CLI flags.
    options.proxy={server:'http://127.0.0.1:'+proxyPlan.gateway.port};
   }
   let open=this.launchContext;
   if(!open){
    let pw;
    try{pw=require('playwright-core')}
    catch(_){throw Error('Pinned playwright-core runtime is not installed; no fallback');}
    if(typeof pw.firefox?.launchPersistentContext!=='function')
     throw Error('Playwright Firefox persistent context API not present');
    open=pw.firefox.launchPersistentContext.bind(pw.firefox);
   }
   context=await open(profileDir,options);
   if(!context||typeof context.newPage!=='function'||typeof context.close!=='function')
    throw Error('Playwright launcher returned no working BrowserContext');
   // context.browser() can be null in persistent mode. Never serialize it.
   const browser=typeof context.browser==='function'?context.browser():null;
   const info={profileId:id,name:profile.name,engine:'gecko',
    engineType:'camoufox',provider:'camoufox',
    protocol:'playwright-internal',manualOnly:false,
    automationAvailable:true,port:null,wsEndpoint:null,debugPort:null,
    proxyMode:proxyPlan.mode,startedAt:new Date().toISOString()};
   const session={info,context,browser,proxyPlan,closing:false};
   const finish=()=>{
    if(this.sessions.get(id)===session){
     this.sessions.delete(id);
     Promise.resolve(proxyPlan?.close?.()).catch(()=>{});
     try{onClosed?.(info)}catch(_){}
    }
   };
   context.on?.('close',finish);
   this.sessions.set(id,session);
   if(url||profile.startUrl){
    const page=await context.newPage();
    await page.goto(safeWebUrl(url||profile.startUrl),{timeout:15000});
   }
   return {info,context,browser};
  }catch(error){
   if(context){try{await context.close()}catch(_){}}
   if(proxyPlan){try{await proxyPlan.close()}catch(_){}}
   this.sessions.delete(id);
   throw error;
  }finally{this.pending.delete(id);}
 }
 contextFor(id){return this.sessions.get(id)?.context||null;}
 async stop(id){
  const session=this.sessions.get(id);
  if(!session)return {success:false};
  if(session.closing)return {success:false,reason:'Already stopping'};
  session.closing=true;
  try{await session.context.close()}
  finally{
   this.sessions.delete(id);
   try{await session.proxyPlan?.close?.()}catch(_){}
  }
  return {success:true};
 }
}
module.exports={CamoufoxPlaywrightController};
