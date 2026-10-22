'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {verifyReceipt}=require('./receipts');
const MAX_GRACE_MS=72*60*60*1000;
const REFRESH_MS=12*60*60*1000;
function verifyEndpoint(endpoint,{allowLocalhost=false}={}){
 if(!endpoint)return null;
 let url;
 try{url=new URL(endpoint);}catch(_){throw Error('License service URL invalid');}
 const allowed=url.protocol==='https:'||
  (allowLocalhost&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname));
 if(!allowed||url.username||url.password||url.search||url.hash||
   url.pathname!=='/v1/verify')
  throw Error('License service must use HTTPS /v1/verify, no credentials or query strings');
 return url.toString();
}
class OnlineLicenseVerifier{
 constructor(root,licenseManager,{
  endpoint=null,fetcher=globalThis.fetch,clock=()=>Date.now(),allowLocalhost=false
 }={}){
  this.manager=licenseManager;this.clock=clock;this.fetcher=fetcher;
  this.endpoint=verifyEndpoint(endpoint,{allowLocalhost});
  this.file=path.join(root,'license-online-receipt.json');
  this.lastReceipt=null;
  this.inFlight=null;
  try{
   const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));
   if(saved?.version===1&&typeof saved.receipt==='string')
    this.lastReceipt=saved.receipt;
  }catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
 }
 _verified(base){
  if(!this.lastReceipt||!base.licenseId)return null;
  try{
   return verifyReceipt(this.lastReceipt,{
    publicKey:this.manager.publicKey,licenseId:base.licenseId,
    installationId:this.manager.installationId,now:this.clock()
   });
  }catch(_){return null;}
 }
 apply(base){
  if(!base.active)return base;
  const ownerSweep=base.enforcementMode==='owner_sweep';
  if(!this.endpoint)return ownerSweep
   ?{...base,active:false,allowed:false,access:'blocked',
     reason:'owner_sweep_authority_unconfigured',
     online:{configured:false,state:'owner_sweep_authority_unconfigured',checkedAt:null}}
   :base;
  const proof=this._verified(base);
  const now=this.clock();
  let online;
  if(!proof)online={configured:true,state:ownerSweep?'owner_sweep_unenrolled':'unverified',checkedAt:null};
  else if(proof.state!=='valid')
   online={configured:true,state:proof.state,checkedAt:new Date(proof.checkedAt).toISOString()};
  else if(now-proof.checkedAt>MAX_GRACE_MS)
   online={configured:true,state:'verification_expired',checkedAt:new Date(proof.checkedAt).toISOString()};
  else online={
   configured:true,
   state:now-proof.checkedAt>REFRESH_MS?'offline_grace':'verified',
   checkedAt:new Date(proof.checkedAt).toISOString(),
   graceExpiresAt:new Date(proof.checkedAt+MAX_GRACE_MS).toISOString()
  };
  const ownerSweepAllowed=ownerSweep&&proof&&
   !['revoked','expired'].includes(online.state);
  return online.state==='verified'||online.state==='offline_grace'||ownerSweepAllowed
   ?{...base,online}
   :{...base,active:false,allowed:false,access:'blocked',
     reason:online.state,online};
 }
 async verifyNow(){
  if(!this.endpoint)return {configured:false};
  if(this.inFlight)return this.inFlight;
  this.inFlight=this._request().finally(()=>{this.inFlight=null;});
  return this.inFlight;
 }
 async _request(){
  const base=this.manager.status();
  if(!base.active||!this.manager.token)throw Error('Activate a valid signed license first');
  const nonce=crypto.randomBytes(16).toString('base64url');
  // The token includes license metadata, never cookies, browser data or proxy.
  // Redirects are forbidden to keep the token at the configured authority.
  const response=await this.fetcher(this.endpoint,{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(7000),
   headers:{'Content-Type':'application/json','Accept':'application/json'},
   body:JSON.stringify({version:1,token:this.manager.token,nonce})
  });
  if(!response?.ok)throw Error('License service HTTP '+response?.status);
  const maxLength=Number(response.headers?.get?.('content-length')||0);
  if(maxLength>16000)throw Error('License server response exceeds size limit');
  const result=await response.json();
  const proof=verifyReceipt(result?.receipt,{
   publicKey:this.manager.publicKey,nonce,
   licenseId:base.licenseId,installationId:this.manager.installationId,now:this.clock()
  });
  // Refuse rollback to an older valid receipt, especially after revocation.
  const previous=this._verified(base);
  if(previous&&proof.checkedAt<previous.checkedAt)
   throw Error('License verification receipt timestamp moved backwards');
  fs.mkdirSync(path.dirname(this.file),{recursive:true});
  const tmp=this.file+'.'+process.pid+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try{
   fs.writeFileSync(tmp,JSON.stringify({version:1,receipt:result.receipt}),{flag:'wx',mode:0o600});
   fs.renameSync(tmp,this.file);
  }catch(error){try{fs.rmSync(tmp,{force:true});}catch(_){}throw error;}
  this.lastReceipt=result.receipt;
  return {online:true,state:proof.state,checkedAt:new Date(proof.checkedAt).toISOString()};
 }
}
module.exports={OnlineLicenseVerifier,verifyEndpoint,MAX_GRACE_MS};
