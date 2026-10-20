'use strict';
// Release license enforcement. All decisions are made in the main process,
// never from renderer-provided plan, limits or feature flags.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const DAY=86400000;
const TRIAL_DAYS=30;
const TRIAL_MAX_PROFILES=10;
const TRIAL_FEATURES=Object.freeze(['profiles','automation','api']);
function saveAtomic(filename,data){
 fs.mkdirSync(path.dirname(filename),{recursive:true});
 const temp=filename+'.'+process.pid+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';
 try{
  fs.writeFileSync(temp,JSON.stringify(data),{flag:'wx',mode:0o600});
  fs.renameSync(temp,filename);
 }catch(e){try{fs.rmSync(temp,{force:true});}catch(_){}throw e;}
}
class LicensePolicy{
 constructor(root,manager,{clock=()=>Date.now()}={}){
  this.manager=manager;this.clock=clock;
  this.file=path.join(root,'license-trial.json');
  let existing;
  try{existing=JSON.parse(fs.readFileSync(this.file,'utf8'));}
  catch(e){if(e.code!=='ENOENT')throw e;}
  if(existing){
   if(existing.version!==1||existing.installationId!==manager.installationId||
      !Number.isSafeInteger(existing.startedAt)||existing.startedAt<0)
    throw Error('Trial state invalid: manual license support required');
   this.startedAt=existing.startedAt;
  }else{
   this.startedAt=Math.floor(clock());
   if(!Number.isSafeInteger(this.startedAt)||this.startedAt<0)
    throw Error('System clock invalid');
   saveAtomic(this.file,{version:1,installationId:manager.installationId,
    startedAt:this.startedAt});
  }
 }
 status(){
  const base=this.manager.status();
  // A valid signed license always overrides trial and is read fresh on each
  // operation, preventing continued use of an expired cached token.
  if(base.active){
   const licensed={...base,access:'licensed',trial:false,allowed:true};
   return this.onlineVerifier?this.onlineVerifier.apply(licensed):licensed;
  }
  const now=this.clock();
  if(!Number.isFinite(now)||now+5*60000<this.startedAt ||
     base.status==='clock_error')
   return {...base,access:'blocked',trial:false,allowed:false,reason:'clock_error'};
  // A deactivated or expired license cannot restart the free trial. The first
  // successful installation starts one bounded local evaluation window.
  const elapsed=Math.max(0,now-this.startedAt);
  if(elapsed<TRIAL_DAYS*DAY){
   return {...base,access:'trial',trial:true,allowed:true,
    trialDaysLeft:Math.ceil((TRIAL_DAYS*DAY-elapsed)/DAY),
    features:[...TRIAL_FEATURES],maxProfiles:TRIAL_MAX_PROFILES};
  }
  return {...base,access:'blocked',trial:false,allowed:false,
   reason:base.status==='expired'?'expired':'trial_expired'};
 }
 require(feature){
  if(!['profiles','automation','api'].includes(feature))
   throw Error('Unknown licensed operation');
  const result=this.status();
  if(!result.allowed)
   throw Error('Giấy phép hết hạn, bị thu hồi hoặc chưa được máy chủ xác minh. Dữ liệu vẫn có thể xem, sao lưu và khôi phục.');
  if(!result.features.includes(feature))
   throw Error('Gói '+(result.plan||'dùng thử')+' không cho phép '+feature+'. Hãy gia hạn hoặc nâng gói.');
  return result;
 }
 assertCapacity(current,addition=1){
  const policy=this.require('profiles');
  if(!Number.isSafeInteger(current)||current<0||
     !Number.isSafeInteger(addition)||addition<1)
   throw Error('Invalid profile count');
  if(current+addition>policy.maxProfiles)
   throw Error('Giới hạn '+policy.maxProfiles+' profile của gói '+(policy.plan||'dùng thử')+
    ' đã đạt. Có thể mở hoặc sửa những profile hiện có.');
  return policy;
 }
}
module.exports={LicensePolicy,TRIAL_DAYS,TRIAL_MAX_PROFILES};
