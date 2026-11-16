'use strict';
// A profile's selected engine is explicit and immutable while running.
// Existing store records without engine_type keep their old provider setting.
const ChromiumAdapter=require('./adapters/ChromiumAdapter');
const FirefoxAdapter=require('./adapters/FirefoxAdapter');
const CamoufoxAdapter=require('./adapters/CamoufoxAdapter');
const NetworkSafetyCheck=require('./NetworkSafetyCheck');
const SUPPORTED=Object.freeze(['chromium','firefox','camoufox']);
function resolveEngineType(profile,settings={}){
 if(!profile||typeof profile!=='object'||Array.isArray(profile))
  throw Error('Invalid browser profile');
 if(profile.engine_type!==undefined&&profile.engine_type!==null){
  if(!SUPPORTED.includes(profile.engine_type))
   throw Error('Unsupported profile engine_type');
  if(profile.engine!==undefined &&
     profile.engine!==(profile.engine_type==='chromium'?'chromium':'gecko'))
   throw Error('Profile engine_type conflicts with browser family');
  return profile.engine_type;
 }
 if(profile.engine==='gecko')
  return settings.geckoProvider==='camoufox'?'camoufox':'firefox';
 if(profile.engine===undefined||profile.engine==='chromium')return 'chromium';
 throw Error('Unsupported legacy browser family');
}
class EngineFactory{
 constructor(launcher){
  if(!launcher||typeof launcher._launchInstalled!=='function')
   throw Error('EngineFactory needs a BrowserLauncher');
  this.adapters={
   chromium:new ChromiumAdapter(launcher),
   firefox:new FirefoxAdapter(launcher),
   camoufox:new CamoufoxAdapter(launcher)
  };
 }
 select(profile,settings={}){
  const type=resolveEngineType(profile,settings);
  return {engineType:type,adapter:this.adapters[type]};
 }
 async launchProfile(profile,{customUrl}={}){
  const {engineType,adapter}=this.select(profile,
   this.adapters.chromium.launcher.store.getSettings());
  if(engineType==='camoufox'){
   const launcher=this.adapters.camoufox.launcher;
   const lab=launcher.camoufoxPlaywrightController?.enabled===true
     ?launcher.camoufoxPlaywrightController.labApproved
     :launcher.camoufoxAdapter?.allowProxyLab===true;
   const report=NetworkSafetyCheck.evaluate(profile,{
    labApproved:lab,store:launcher.store,proxyVault:launcher.proxyVault
   });
   if(!report.safeToLaunch){
    const error=new Error('NETWORK_BLOCKED: '+report.reason);
    error.code='NETWORK_BLOCKED';
    throw error;
   }
  }
  const result=await adapter.launch(profile,{customUrl});
  if(result.engineType&&result.engineType!==engineType)
   throw Error('Engine provider response mismatch');
  return {...result,engineType};
 }
}
module.exports={EngineFactory,resolveEngineType,SUPPORTED};