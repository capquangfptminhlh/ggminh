'use strict';
const {writeManagedUserJsBlock}=require('./geckoProxy');
// This preference exists only in the LHM-patched test build identified here.
const PATCHED_SHA256='1f1df2f8a2681d45dc2b37d24b75f45fc294ca0bb84f7f0dfdb987bc399cd331';
const BEGIN='// LHM_MANAGED_CAMOUFOX_DURABILITY_BEGIN';
const END='// LHM_MANAGED_CAMOUFOX_DURABILITY_END';
function preferencesForEngine(sha256){
 return typeof sha256==='string'&&sha256.toLowerCase()===PATCHED_SHA256
  ?{'dom.storage.flush_timeout_ms':0}:{};
}
function applyCamoufoxDurability(profileDir,sha256){
 const prefs=preferencesForEngine(sha256);
 if(!Object.keys(prefs).length)return {applied:false};
 const body=Object.entries(prefs).map(([key,value])=>
  'user_pref('+JSON.stringify(key)+', '+JSON.stringify(value)+');').join('\n');
 writeManagedUserJsBlock(profileDir,BEGIN,END,body,'Camoufox durability');
 return {applied:true};
}
module.exports={preferencesForEngine,applyCamoufoxDurability};
