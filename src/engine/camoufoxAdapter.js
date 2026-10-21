'use strict';
// Experimental Firefox provider. Uses the documented Camoufox TypeScript
// persistent-context API. No invented Firefox CLI, CDP, stealth flags or
// automatic lock-file deletion. Package/binary provisioning is separate.
const path=require('path');
const {assertProfileId,ensureIsolatedDirectory}=require('../privacy/isolation');
const {safeWebUrl}=require('./launchArgs');

async function officialLauncher(){
 let module;
 try{module=await import('camoufox');}
 catch(_){throw Error('Camoufox TypeScript launcher is not installed or cannot be loaded');}
 if(typeof module.Camoufox!=='function')
  throw Error('Installed Camoufox package has no supported Camoufox API');
 return module.Camoufox;
}
function validateCamoufoxProfile(profile,baseDir){
 assertProfileId(profile?.id);
 if(!path.isAbsolute(baseDir))throw Error('Profile storage root must be absolute');
 if(profile.engine!=='gecko')throw Error('Camoufox requires a Gecko profile');
 if(profile.fingerprint?.mode!=='native')
  throw Error('Camoufox preview requires native profile settings; legacy JS fingerprint unsupported');
 const proxy=profile.proxy||{type:'direct'};
 if(proxy.type!=='direct'&&proxy.type!=='none')
  throw Error('Camoufox preview does not support a configured proxy until network routing is verified');
 if(proxy.authProxyId)
  throw Error('Camoufox preview cannot accept stored proxy secrets');
 const profileDir=path.join(baseDir,'camoufox-profiles',profile.id);
 return {profileDir,headless:false};
}
class CamoufoxAdapter{
 constructor(baseDir,{loader=officialLauncher}={}){
  if(typeof loader!=='function')throw Error('Invalid Camoufox loader');
  this.baseDir=baseDir;this.loader=loader;this.sessions=new Map();
  this.pending=new Map();
 }
 status(){
  let installed=false;
  try{require.resolve('camoufox');installed=true;}catch(_){}
  return {installed,active:this.sessions.size,
   note:installed?'Camoufox launcher found; browser binary has not been verified by LHM':
    'Camoufox launcher unavailable. No binary is bundled with this preview.'};
 }
 isBusy(id){return this.sessions.has(id)||this.pending.has(id);}
 async start(profile,{url,onClosed}={}){
  const id=assertProfileId(profile?.id);
  if(this.isBusy(id))throw Error('Camoufox profile is already running or starting');
  const {profileDir}=validateCamoufoxProfile(profile,this.baseDir);
  const target=safeWebUrl(url||profile.startUrl||'https://example.com/');
  const operation=(async()=>{
   ensureIsolatedDirectory(this.baseDir,profileDir);
   const Camoufox=await this.loader();
   let context=null;
   try{
    context=await Camoufox({headless:false,user_data_dir:profileDir});
    if(!context||typeof context.newPage!=='function'||
       typeof context.close!=='function'||typeof context.on!=='function')
      throw Error('Camoufox persistent context did not expose the expected Playwright API');
    const info={profileId:id,engine:'gecko',provider:'camoufox',
     pid:null,port:null,wsEndpoint:null,startedAt:new Date().toISOString(),stopping:false};
    const item={context,info,closing:false};
    context.on('close',()=>{
     if(this.sessions.get(id)===item){
      this.sessions.delete(id);
      try{onClosed?.(info);}catch(_){}
     }
    });
    const page=await context.newPage();
    await page.goto(target,{waitUntil:'domcontentloaded',timeout:15000});
    this.sessions.set(id,item);
    return {...info};
   }catch(error){
    if(context&&typeof context.close==='function'){
     try{await context.close();}catch(_){}
    }
    throw error;
   }
  })();
  this.pending.set(id,operation);
  try{return await operation;}
  finally{if(this.pending.get(id)===operation)this.pending.delete(id);}
 }
 stop(id){
  const item=this.sessions.get(id);
  if(!item)return {success:false,message:'Camoufox profile is not running'};
  if(item.closing)return {success:false,message:'Camoufox profile is already closing'};
  item.closing=true;item.info.stopping=true;
  Promise.resolve().then(()=>item.context.close()).then(()=>{
   if(this.sessions.get(id)===item)this.sessions.delete(id);
  }).catch(error=>{
   item.closing=false;item.info.stopping=false;
   console.warn('[Camoufox] Context close failed:',String(error.message).slice(0,180));
  });
  return {success:true,pendingExit:true};
 }
 getActive(id){return this.sessions.get(id)?.info||null;}
}
module.exports={CamoufoxAdapter,validateCamoufoxProfile,officialLauncher};
