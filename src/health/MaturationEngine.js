'use strict';
/**
 * Internal onboarding approvals, not an imitation of account "age".
 * Recording mock searches, video views or emails cannot establish that a
 * Gmail or Google Ads account is eligible to be created or run campaigns.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ID=/^[a-zA-Z0-9_-]{1,64}$/;
const APPROVALS=Object.freeze({
 POLICY_REVIEWED:'Company/platform policy checked',
 BILLING_AUTHORIZED:'Authorized billing owner confirmed',
 OWNER_APPROVED:'Asset owner approved profile use',
 CAMPAIGN_REVIEWED:'Campaign policy and content reviewed',
 NETWORK_CHECKED:'Proxy and network route manually reviewed'
});
function checkId(value,label){
 if(typeof value!=='string'||!ID.test(value))throw Error('Invalid '+label);
 return value;
}
class MaturationEngine{
 constructor(root,{now=()=>Date.now()}={}){
  if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Absolute storage path required');
  this.file=path.join(root,'profile-approvals.json');
  this.now=now;
  let data={schema:1,records:[]};
  if(fs.existsSync(this.file)){
   const raw=fs.readFileSync(this.file,'utf8');
   if(Buffer.byteLength(raw)>300000)throw Error('Approval data too large');
   data=JSON.parse(raw);
   if(data?.schema!==1||!Array.isArray(data.records)||data.records.length>2000)
    throw Error('Invalid approval records');
   for(const r of data.records){
    if(!r||!ID.test(r.profileId||'')||!ID.test(r.actorId||'')||
       !Object.hasOwn(APPROVALS,r.type)||typeof r.at!=='number'||
       r.at<0||!Number.isSafeInteger(r.at)||typeof r.id!=='string'||
       !/^ap_[a-f0-9]{24}$/.test(r.id))
     throw Error('Corrupt approval record');
   }
  }
  this.records=data.records;
 }
 save(next){
  const temp=this.file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try{
   fs.writeFileSync(temp,JSON.stringify({schema:1,records:next}),{mode:0o600,flag:'wx'});
   fs.renameSync(temp,this.file);
   this.records=next;
  }finally{try{fs.rmSync(temp,{force:true});}catch(_){}}
 }
 async logActivity(profileId,actionType,value=1,options={}){
  // The milestone is an explicit human approval, not fabricated website
  // activity. Any numeric counter is purposefully unsupported.
  checkId(profileId,'profile ID');
  if(!Object.hasOwn(APPROVALS,actionType))
   throw Error('Only manual agency compliance approvals can be recorded');
  if(value!==1||options.source!=='manual'||options.confirmation!=='CONFIRM')
   throw Error('Explicit one-time operator approval required');
  const actorId=checkId(options.actorId,'operator ID');
  if(this.records.some(x=>x.profileId===profileId&&x.type===actionType))
   throw Error('Milestone already approved; revoke it before reapproval');
  if(this.records.length>=2000)throw Error('Maximum approval entries reached');
  const record={
   id:'ap_'+crypto.randomBytes(12).toString('hex'),
   profileId,actorId,type:actionType,at:this.now()
  };
  this.save(this.records.concat(record));
  return this.checkUnlockStatus(profileId);
 }
 async checkUnlockStatus(profileId){
  checkId(profileId,'profile ID');
  const completed=new Set(this.records.filter(x=>x.profileId===profileId).map(x=>x.type));
  const missing=Object.entries(APPROVALS)
   .filter(([type])=>!completed.has(type))
   .map(([type,label])=>({type,label}));
  const canOperateInternally=missing.length===0;
  return {
   profileId,completed:[...completed].sort(),missing,
   internalReviewComplete:canOperateInternally,
   canCreateGmail:null,canRunAds:null,
   notice:'This is an internal approval checklist only. Google Account / Google Ads access is governed by Google, not by fabricated activity counters.'
  };
 }
 revoke(profileId,actionType,{actorId,confirmation}={}){
  checkId(profileId,'profile ID');checkId(actorId,'operator ID');
  if(!Object.hasOwn(APPROVALS,actionType)||confirmation!=='REVOKE')
   throw Error('Explicit revocation required');
  const after=this.records.filter(r=>!(r.profileId===profileId&&r.type===actionType));
  if(after.length===this.records.length)return {revoked:false};
  this.save(after);
  return {revoked:true};
 }
 list(profileId){
  checkId(profileId,'profile ID');
  return this.records.filter(r=>r.profileId===profileId).map(x=>({...x}));
 }
}
module.exports={MaturationEngine,APPROVALS};
