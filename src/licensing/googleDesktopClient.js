'use strict';
/* Electron main-process ONLY, opt-in staging service.
 * Not referenced from renderer, preload, legacy main, CLI or API until the
 * commercial build gates are ready. Does not read, migrate, or delete profiles.
 * Secret grant + cached signed lease are persisted via safeStorage (DPAPI on Windows).
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {verifyBrowserLease}=require('./googleLease');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const TOKEN=/^bg1_[A-Za-z0-9_-]{43}$/;
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}$/;
const SEAT=/^[A-Za-z0-9_-]{16,100}$/;
const ALLOWED_HOSTS=new Set(['browser-staging.lhmcrm.com','browser.lhmcrm.com']);
const FEATURES=new Set(['profiles','api','automation']);
const iso=v=>new Date(v).toISOString();
function atomic(file,data){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const temp=file+'.'+process.pid+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 try{
  fs.writeFileSync(temp,data,{flag:'wx',mode:0o600});
  fs.renameSync(temp,file);
 }catch(e){try{fs.rmSync(temp,{force:true});}catch(_){/* best effort */}throw e;}
}
class BrowserSaasError extends Error{
 constructor(code,status=0){super(code);this.name='BrowserSaasError';this.code=code;this.status=status;}
}
class GoogleBrowserDesktopClient{
 constructor({root,safeStorage,apiOrigin,publicKey,fetchImpl=globalThis.fetch,
   clock=()=>Date.now()}={}){
  if(typeof root!=='string'||!path.isAbsolute(root)||!publicKey||
    !safeStorage||typeof safeStorage.encryptString!=='function'||
    typeof safeStorage.decryptString!=='function'||
    typeof safeStorage.isEncryptionAvailable!=='function'||
    !safeStorage.isEncryptionAvailable()||
    typeof fetchImpl!=='function'||typeof clock!=='function')
    throw Error('Trusted Browser desktop environment required (DPAPI/public key)');
  const url=new URL(apiOrigin);
  if(url.protocol!=='https:'||!ALLOWED_HOSTS.has(url.hostname)||
    url.pathname!=='/'||url.search||url.hash||url.port)
    throw Error('Browser SaaS origin not allowlisted');
  this.origin=url.origin;
  this.publicKey=publicKey;this.clock=clock;this.fetch=fetchImpl;
  this.safeStorage=safeStorage;
  this.file=path.join(root,'browser-google-saas-v2.enc');
  let stored=null;
  try{
   const buffer=fs.readFileSync(this.file);
   stored=JSON.parse(safeStorage.decryptString(buffer));
  }catch(e){
   if(e.code!=='ENOENT')throw Error('Encrypted SaaS device data unavailable; do not reset profile data');
  }
  if(stored&&(!HASH.test(stored.client_hash||'')||stored.version!==1||
    (stored.customer_id&&!UUID.test(stored.customer_id))||
    (stored.email&&(!EMAIL.test(stored.email)||stored.email.length>254))||
    (stored.grant&&!TOKEN.test(stored.grant))||
    (stored.seat_id&&!SEAT.test(stored.seat_id))))
    throw Error('Encrypted SaaS grant metadata invalid');
  this.state=stored||{version:1,client_hash:crypto.randomBytes(32).toString('hex'),
    pending:null,customer_id:null,email:null,grant:null,seat_id:null,lease:null,
    revoked_online:false,highest_seen:0};
  if(!stored)this.persist();
 }
 persist(){
  if(!this.safeStorage.isEncryptionAvailable())throw Error('Windows encryption unavailable');
  const payload=this.safeStorage.encryptString(JSON.stringify(this.state));
  if(!Buffer.isBuffer(payload)||!payload.length)throw Error('Invalid DPAPI encrypted payload');
  atomic(this.file,payload);
 }
 now(){
  const current=this.clock();
  if(!Number.isSafeInteger(current)||current<0)throw Error('System clock invalid');
  return current;
 }
 seen(){
  const current=this.now();
  if(!Number.isSafeInteger(this.state.highest_seen)||this.state.highest_seen<0)
    throw Error('Browser SaaS clock metadata invalid');
  if(current+5*60000<this.state.highest_seen)
    throw new BrowserSaasError('CLOCK_ROLLBACK');
  if(current>this.state.highest_seen+60000){
   this.state.highest_seen=current;this.persist();
  }
  return current;
 }
 async request(endpoint,data,authenticated=false){
  const names=new Set(['/v2/desktop/pair/start','/v2/desktop/pair/claim',
    '/v2/seats/attach','/v2/seats/heartbeat','/v2/seats/takeover',
    '/v2/seats/list','/v2/leases/issue','/v2/desktop/grant/revoke']);
  if(!names.has(endpoint))throw Error('Unsupported desktop license endpoint');
  if(authenticated&&!TOKEN.test(this.state.grant||''))throw new BrowserSaasError('LOGIN_REQUIRED');
  const headers={'Content-Type':'application/json'};
  if(authenticated)headers.Authorization='Bearer '+this.state.grant;
  let response;
  try{
   response=await this.fetch(this.origin+endpoint,{
     method:'POST',headers,body:JSON.stringify(data),redirect:'error'});
  }catch(_){throw new BrowserSaasError('NETWORK_UNAVAILABLE');}
  let body;
  try{body=await response.json();}
  catch(_){throw new BrowserSaasError('INVALID_SERVER_RESPONSE',response.status);}
  if(!response.ok){
    const code=typeof body?.error==='string'&&/^[A-Z0-9_]{3,60}$/.test(body.error)
      ?body.error:'SERVER_REJECTED';
    throw new BrowserSaasError(code,response.status);
  }
  if(!body||typeof body!=='object'||Array.isArray(body))
    throw new BrowserSaasError('INVALID_SERVER_RESPONSE',response.status);
  return body;
 }
 async startPair({label='Windows device'}={}){
  this.seen();
  if(typeof label!=='string'||label.length>50||!label.trim())throw Error('Invalid device label');
  const verifier=crypto.randomBytes(32).toString('base64url');
  const verifier_hash=crypto.createHash('sha256').update(verifier).digest('hex');
  const data=await this.request('/v2/desktop/pair/start',{
    client_hash:this.state.client_hash,verifier_hash,label});
  if(!UUID.test(data.pairing_id||'')||!/^\d{6}$/.test(data.comparison_code||'')||
    !Number.isSafeInteger(data.expires_at_ms)||
    data.expires_at_ms<=this.now()||data.expires_at_ms>this.now()+600000)
    throw new BrowserSaasError('INVALID_PAIRING_RESPONSE');
  const link=new URL(data.approval_url);
  if(link.origin!==this.origin||link.pathname!=='/v2/desktop/pair/'||
     link.searchParams.get('id')!==data.pairing_id||[...link.searchParams].length!==1)
    throw new BrowserSaasError('UNTRUSTED_PAIRING_URL');
  this.state.pending={pairing_id:data.pairing_id,verifier,expires_at_ms:data.expires_at_ms};
  this.persist();
  return {approvalUrl:link.toString(),comparisonCode:data.comparison_code,
    pairingExpiresAt:iso(data.expires_at_ms)};
 }
 async claimPair(){
  this.seen();
  const pending=this.state.pending;
  if(!pending||!UUID.test(pending.pairing_id||'')||
     !/^[A-Za-z0-9_-]{43}$/.test(pending.verifier||'')||
     this.now()>=pending.expires_at_ms)
    throw new BrowserSaasError('PAIR_EXPIRED');
  const claimed=await this.request('/v2/desktop/pair/claim',{
    pairing_id:pending.pairing_id,verifier:pending.verifier});
  if(!TOKEN.test(claimed.grant||'')||!UUID.test(claimed.customer_id||'')||
     !EMAIL.test(claimed.email||'')||claimed.email.length>254||
     claimed.client_hash!==this.state.client_hash)
    throw new BrowserSaasError('INVALID_GRANT_RESPONSE');
  // A different Google account cannot inherit the previous local grant,
  // cached lease or tenant workspace; profile migration is NOT automatic.
  this.state={version:1,client_hash:this.state.client_hash,pending:null,
    customer_id:claimed.customer_id,email:claimed.email,grant:claimed.grant,seat_id:null,lease:null,
    revoked_online:false,highest_seen:this.state.highest_seen};
  this.persist();
  return {customerId:claimed.customer_id,email:claimed.email,paired:true};
 }
 async attach({label='Windows device'}={}){
  this.seen();
  const data=await this.request('/v2/seats/attach',{label},true);
  if(!SEAT.test(data.seat_id||''))throw new BrowserSaasError('INVALID_SEAT_RESPONSE');
  this.state.seat_id=data.seat_id;this.state.lease=null;this.state.revoked_online=false;
  this.persist();
  return {seatId:data.seat_id,heartbeatSeconds:300};
 }
 async listSeats(){
  this.seen();
  const data=await this.request('/v2/seats/list',{},true);
  if(!Array.isArray(data.devices)||!Number.isSafeInteger(data.seat_limit)||
    data.seat_limit<1)throw new BrowserSaasError('INVALID_SEAT_LIST');
  return {seatLimit:data.seat_limit,devices:data.devices.map(item=>{
    if(!SEAT.test(item.seat_id||'')||typeof item.label!=='string')
      throw new BrowserSaasError('INVALID_SEAT_LIST');
    return {seatId:item.seat_id,label:item.label};
  })};
 }
 async takeover(replaceSeatId,{confirmation,label='Windows device'}={}){
  this.seen();
  if(!SEAT.test(replaceSeatId||'')||confirmation!=='REPLACE')
    throw new BrowserSaasError('TAKEOVER_CONFIRMATION_REQUIRED');
  const data=await this.request('/v2/seats/takeover',{
    replace_seat_id:replaceSeatId,confirmation,label},true);
  if(!SEAT.test(data.seat_id||''))throw new BrowserSaasError('INVALID_SEAT_RESPONSE');
  this.state.seat_id=data.seat_id;this.state.lease=null;this.state.revoked_online=false;
  this.persist();
  return {seatId:data.seat_id,replacedSeatId:replaceSeatId};
 }
 async refreshLease(){
  const now=this.seen();
  if(!this.state.seat_id)throw new BrowserSaasError('SEAT_REQUIRED');
  const data=await this.request('/v2/leases/issue',{seat_id:this.state.seat_id},true);
  if(typeof data.lease!=='string')throw new BrowserSaasError('INVALID_LEASE_RESPONSE');
  const claims=verifyBrowserLease(data.lease,{
    publicKey:this.publicKey,expectedCustomerId:this.state.customer_id,
    expectedClientHash:this.state.client_hash,now,maxSeenTime:this.state.highest_seen});
  if(claims.seat_id!==this.state.seat_id)
    throw new BrowserSaasError('LEASE_SEAT_MISMATCH');
  this.state.lease=data.lease;this.state.revoked_online=false;this.persist();
  return {plan:claims.plan_code,maxProfiles:claims.max_profiles,
    validUntil:claims.valid_until,features:[...claims.features]};
 }
 async heartbeat(){
  this.seen();
  if(!this.state.seat_id)throw new BrowserSaasError('SEAT_REQUIRED');
  try{return await this.request('/v2/seats/heartbeat',{seat_id:this.state.seat_id},true);}
  catch(e){
   // A positive online answer that the seat was replaced must lock
   // immediately. Transient connectivity loss does NOT invalidate an offline
   // signed lease; its bounded expiry still applies.
   if(e instanceof BrowserSaasError&&
      ['SEAT_EXPIRED','SEAT_REPLACED','SUBSCRIPTION_REQUIRED','DESKTOP_GRANT_INVALID'].includes(e.code)){
      this.state.revoked_online=true;this.state.lease=null;this.persist();
   }
   throw e;
  }
 }
 status(){
  let now;
  try{now=this.seen();}
  catch(e){return {allowed:false,reason:e.code||'CLOCK_ERROR',features:[],maxProfiles:null};}
  if(this.state.revoked_online)return {allowed:false,reason:'SEAT_REPLACED',features:[],maxProfiles:null};
  if(!this.state.lease||!this.state.customer_id)
    return {allowed:false,reason:'SIGNIN_REQUIRED',features:[],maxProfiles:null};
  try{
   const c=verifyBrowserLease(this.state.lease,{
     publicKey:this.publicKey,expectedCustomerId:this.state.customer_id,
     expectedClientHash:this.state.client_hash,now,maxSeenTime:this.state.highest_seen});
   if(c.seat_id!==this.state.seat_id)throw Error('Seat mismatch');
   return {allowed:true,plan:c.plan_code,features:[...c.features],
     maxProfiles:c.max_profiles,seatLimit:c.seat_limit,validUntil:c.valid_until,
     customerId:c.customer_id};
  }catch(_){return {allowed:false,reason:'LEASE_INVALID_OR_EXPIRED',features:[],maxProfiles:null};}
 }
 require(feature){
  if(!FEATURES.has(feature))throw Error('Invalid license operation');
  const s=this.status();
  if(!s.allowed)throw new BrowserSaasError(s.reason);
  if(!s.features.includes(feature))throw new BrowserSaasError('FEATURE_NOT_ALLOWED');
  return s;
 }
 assertCapacity(current,addition=1){
  const s=this.require('profiles');
  if(!Number.isSafeInteger(current)||current<0||
     !Number.isSafeInteger(addition)||addition<1)throw Error('Invalid profile count');
  if(current+addition>s.maxProfiles)throw new BrowserSaasError('PROFILE_LIMIT');
  return s;
 }
 async logout(){
  // A local-only forget cannot invalidate a stolen grant on the server.
  // Require an acknowledged online revocation before clearing it from DPAPI.
  this.seen();
  if(!TOKEN.test(this.state.grant||''))throw new BrowserSaasError('LOGIN_REQUIRED');
  const response=await this.request('/v2/desktop/grant/revoke',
    {confirmation:'REVOKE'},true);
  if(response.status!=='revoked')throw new BrowserSaasError('REVOKE_NOT_CONFIRMED');
  this.forgetGrant(true);
  return {revoked:true};
 }
 forgetGrant(confirmed){
  if(confirmed!==true)throw new BrowserSaasError('CONFIRMATION_REQUIRED');
  this.state.pending=null;this.state.customer_id=null;this.state.email=null;
  this.state.grant=null;
  this.state.seat_id=null;this.state.lease=null;this.state.revoked_online=false;
  this.persist();
  // Does not remove customer browser profiles, cookies or backups.
 }
}
module.exports={GoogleBrowserDesktopClient,BrowserSaasError};
