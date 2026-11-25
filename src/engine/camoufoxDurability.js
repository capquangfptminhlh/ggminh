'use strict';
const {writeManagedUserJsBlock}=require('./geckoProxy');
const fs=require('node:fs'),path=require('node:path');
// This preference exists only in the LHM-patched test build identified here.
const PATCHED_SHA256='1f1df2f8a2681d45dc2b37d24b75f45fc294ca0bb84f7f0dfdb987bc399cd331';
const PATCHED_PAYLOADS=new Set([
 'c0595098721d0ca47e88e62a7cce7752b7e7ce8b5f421e7cfc4e4fcc5d6f19be',
 '0f8f588788079b9459bcaa0a4b56fbfcb3fdd50e012d7a14a583cd446ade769d',
 '9d8ed736963623977b9b56d9f6633e51b90edf33c97acce528552b57f0d825d4'
]);
const BEGIN='// LHM_MANAGED_CAMOUFOX_DURABILITY_BEGIN';
const END='// LHM_MANAGED_CAMOUFOX_DURABILITY_END';
function preferencesForEngine(sha256,payloadSha256){
 return typeof sha256==='string'&&sha256.toLowerCase()===PATCHED_SHA256&&
  typeof payloadSha256==='string'&&PATCHED_PAYLOADS.has(payloadSha256.toLowerCase())
  ?{'dom.storage.flush_timeout_ms':0}:{};
}
function applyCamoufoxDurability(profileDir,sha256,payloadSha256){
 const prefs=preferencesForEngine(sha256,payloadSha256);
 if(!Object.keys(prefs).length){
  const file=path.join(profileDir,'user.js');
  if(fs.existsSync(file)){
   const st=fs.lstatSync(file);
   if(!st.isFile()||st.isSymbolicLink()||st.size>2*1024*1024)throw Error('Unsafe Camoufox preferences');
   if(fs.readFileSync(file,'utf8').includes(BEGIN))
    throw Error('Camoufox engine changed: durability preference requires review before opening this profile');
  }
  return {applied:false};
 }
 const body=Object.entries(prefs).map(([key,value])=>
  'user_pref('+JSON.stringify(key)+', '+JSON.stringify(value)+');').join('\n');
 writeManagedUserJsBlock(profileDir,BEGIN,END,body,'Camoufox durability');
 return {applied:true};
}
module.exports={preferencesForEngine,applyCamoufoxDurability};
