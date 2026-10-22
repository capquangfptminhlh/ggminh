'use strict';
// Local, deliberately low-granularity operational health snapshots.
// No browser/page telemetry, customer identifiers, IPs, URLs or sessions.
const fs=require('fs');
const path=require('path');
const MAX_SNAPSHOTS=90;
const MAX_AGE=90*24*60*60*1000;
const MIN_SPACING=30*60*1000;
const MAX_COUNT=100000;
const VERSION=/^(?:\d{1,3})(?:\.\d{1,5}){0,3}$/;
function count(v,name){
 if(!Number.isSafeInteger(v)||v<0||v>MAX_COUNT)
  throw Error('Invalid health counter: '+name);
 return v;
}
function normalize(input,now){
 if(!input||typeof input!=='object'||Array.isArray(input))
  throw Error('Health snapshot must be a plain object');
 const profiles=count(input.profiles,'profiles');
 const errors=count(input.errors,'errors');
 const warnings=count(input.warnings,'warnings');
 const active=count(input.active,'active');
 if(errors+warnings>profiles||active>profiles)
  throw Error('Health counters exceed profile count');
 const version=input.appVersion===undefined?'unknown':input.appVersion;
 if(version!=='unknown'&&(typeof version!=='string'||!VERSION.test(version)))
  throw Error('Invalid application version');
 return {at:now,profiles,errors,warnings,active,appVersion:version};
}
function validSaved(x,now){
 return x&&typeof x==='object'&&!Array.isArray(x)&&
  Number.isSafeInteger(x.at)&&x.at<=now&&x.at>=now-MAX_AGE&&
  Number.isSafeInteger(x.profiles)&&x.profiles>=0&&x.profiles<=MAX_COUNT&&
  Number.isSafeInteger(x.errors)&&x.errors>=0&&x.errors<=x.profiles&&
  Number.isSafeInteger(x.warnings)&&x.warnings>=0&&
  x.errors+x.warnings<=x.profiles&&
  Number.isSafeInteger(x.active)&&x.active>=0&&x.active<=x.profiles&&
  (x.appVersion==='unknown'||(typeof x.appVersion==='string'&&VERSION.test(x.appVersion)))&&
  Object.keys(x).sort().join(',')==='active,appVersion,at,errors,profiles,warnings';
}
function bucket(snapshots){
 const sum=snapshots.reduce((acc,x)=>{
  acc.profiles+=x.profiles;acc.errors+=x.errors;acc.warnings+=x.warnings;return acc;
 },{profiles:0,errors:0,warnings:0});
 return {snapshots:snapshots.length,profileObservations:sum.profiles,
  errorRate:sum.profiles?sum.errors/sum.profiles:0,
  warningRate:sum.profiles?sum.warnings/sum.profiles:0};
}
function detectDrift(snapshots){
 const ordered=snapshots.slice().sort((a,b)=>a.at-b.at);
 const current=ordered.slice(-3);
 const earlier=ordered.slice(-10,-3);
 const recent=bucket(current),baseline=bucket(earlier);
 const enough=recent.snapshots>=3&&baseline.snapshots>=3&&
  recent.profileObservations>=15&&baseline.profileObservations>=15;
 const errorIncrease=recent.errorRate-baseline.errorRate;
 const warningIncrease=recent.warningRate-baseline.warningRate;
 const versionChanged=ordered.length>=2&&
  ordered[ordered.length-1].appVersion!==ordered[ordered.length-2].appVersion;
 return {
  status:!enough?'insufficient':errorIncrease>=0.20?'investigate':
   warningIncrease>=0.30?'review':'stable',
  baseline,recent,
  errorChange:+errorIncrease.toFixed(4),
  warningChange:+warningIncrease.toFixed(4),
  versionChanged,
  note:enough?
   'Only local configuration-error proportions were compared; no conclusions about external anti-bot systems.' :
   'At least 6 explicitly saved checks and 15 profile observations in each comparison window are needed.'
 };
}
class LocalHealthDrift{
 constructor(baseDir,{now=()=>Date.now()}={}){
  if(typeof baseDir!=='string'||!path.isAbsolute(baseDir))throw Error('Absolute data path required');
  this.file=path.join(baseDir,'health-drift.json');
  this.now=now;this.snapshots=[];
  if(fs.existsSync(this.file)){
   try{
    const raw=fs.readFileSync(this.file,'utf8');
    if(Buffer.byteLength(raw)>50*1024)throw Error('Snapshot log too large');
    const saved=JSON.parse(raw);
    if(!Array.isArray(saved))throw Error('Invalid snapshot history');
    this.snapshots=saved.filter(x=>validSaved(x,this.now())).slice(-MAX_SNAPSHOTS);
   }catch(error){
    // Never silently overwrite possibly corrupted customer diagnostics.
    throw Error('Local health history cannot be read; move it aside manually after backup');
   }
  }
 }
 persist(items){
  const temp=this.file+'.'+process.pid+'.tmp';
  try{
   fs.writeFileSync(temp,JSON.stringify(items),{flag:'wx',mode:0o600});
   fs.renameSync(temp,this.file);
   this.snapshots=items;
  }finally{try{fs.rmSync(temp,{force:true});}catch(_){}}
 }
 add(input){
  const at=this.now();
  const snapshot=normalize(input,at);
  const latest=this.snapshots[this.snapshots.length-1];
  if(latest&&at-latest.at<MIN_SPACING)
   throw Error('Wait at least 30 minutes between saved health snapshots');
  const list=this.snapshots.filter(x=>x.at>=at-MAX_AGE).concat(snapshot).slice(-MAX_SNAPSHOTS);
  this.persist(list);
  return this.report();
 }
 report(){
  return {
   enabled:'manual-only',stored:this.snapshots.length,
   latest:this.snapshots.at(-1)||null,
   drift:detectDrift(this.snapshots),
   notice:'Local-only aggregate configuration counts. No click/key/scroll history, identities, URLs, IPs, cookies or remote upload.'
  };
 }
 exportReport(){
  // Export is an explicit user action. Never add arbitrary object fields.
  return JSON.stringify({schema:1,generatedAt:this.now(),snapshots:this.snapshots,
   drift:detectDrift(this.snapshots),
   privacy:'Aggregate configuration counts only; not an account risk or bot-detection score.'},null,2);
 }
 clear(){
  this.persist([]);
  return {cleared:true,stored:0};
 }
}
module.exports={LocalHealthDrift,detectDrift,normalize,validSaved};
