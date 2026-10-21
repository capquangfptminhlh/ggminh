'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');

const PUBLIC_KEY='-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAQrZOTb8wh66eNTYWoegyBpiEgQUz7dlrXHJ8mHcBKR4=\n-----END PUBLIC KEY-----';
const PREFIX='lhmlic1';
const PLANS=new Set(['starter','pro','business']);
const FEATURES=new Set(['profiles','automation','api','team']);
const TOKEN_ID=/^lic_[a-f0-9]{24}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const DAY=86400000;
function canonicalClaims(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||
    p.version!==1||!TOKEN_ID.test(p.licenseId||'')||!UUID.test(p.installationId||'')||
    typeof p.customer!=='string'||!p.customer.trim()||p.customer.length>120||
    !PLANS.has(p.plan)||!Number.isInteger(p.maxProfiles)||p.maxProfiles<1||p.maxProfiles>10000||
    !Array.isArray(p.features)||p.features.length>4||
    p.features.some(x=>!FEATURES.has(x))||
    !UTC.test(p.issuedAt||'')||!UTC.test(p.expiresAt||''))
   throw Error('Invalid license fields');
 const first=Date.parse(p.issuedAt),last=Date.parse(p.expiresAt);
 if(!Number.isFinite(first)||!Number.isFinite(last)||last<=first||last-first>370*DAY ||
    new Date(first).toISOString()!==p.issuedAt||new Date(last).toISOString()!==p.expiresAt)
  throw Error('Invalid license period');
 const fields=['version','licenseId','customer','installationId','plan','maxProfiles','features','issuedAt','expiresAt'];
 if(Object.keys(p).sort().join('|')!==[...fields].sort().join('|'))
  throw Error('Unexpected license claims');
 const features=[...new Set(p.features)].sort();
 if(features.length!==p.features.length||JSON.stringify(p.features)!==JSON.stringify(features))
  throw Error('Invalid license entitlements');
 return JSON.stringify({
  version:1,licenseId:p.licenseId,customer:p.customer,installationId:p.installationId,
  plan:p.plan,maxProfiles:p.maxProfiles,features,issuedAt:p.issuedAt,expiresAt:p.expiresAt
 });
}
function b64read(v){
 if(typeof v!=='string'||!v||v.length>8192||!/^[A-Za-z0-9_-]+$/.test(v))
  throw Error('Invalid license encoding');
 const b=Buffer.from(v,'base64url');
 if(b.toString('base64url')!==v)throw Error('Invalid license encoding');
 return b;
}
function signLicense(claims,privateKey){
 const content=Buffer.from(canonicalClaims(claims)).toString('base64url');
 const message=Buffer.from(PREFIX+'.'+content);
 const signature=crypto.sign(null,message,privateKey);
 return PREFIX+'.'+content+'.'+signature.toString('base64url');
}
function verifyLicense(token,publicKey=PUBLIC_KEY){
 if(typeof token!=='string'||token.length>11000)throw Error('License format not recognized');
 const bits=token.trim().split('.');
 if(bits.length!==3||bits[0]!==PREFIX)throw Error('License format not recognized');
 const json=b64read(bits[1]),sig=b64read(bits[2]);
 if(sig.length!==64)throw Error('Invalid license signature');
 let claims;
 try{claims=JSON.parse(json.toString('utf8'));}
 catch(_){throw Error('License JSON is invalid');}
 const canonical=Buffer.from(canonicalClaims(claims));
 if(json.length!==canonical.length||!crypto.timingSafeEqual(json,canonical)||
    !crypto.verify(null,Buffer.from(PREFIX+'.'+bits[1]),publicKey,sig))
  throw Error('License signature mismatch');
 return claims;
}
function writeAtomic(filename,value){
 fs.mkdirSync(path.dirname(filename),{recursive:true});
 const tmp=filename+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 try{
  fs.writeFileSync(tmp,JSON.stringify(value),{flag:'wx',mode:0o600});
  fs.renameSync(tmp,filename);
 }catch(error){try{fs.rmSync(tmp,{force:true});}catch(_){}throw error;}
}
function readJson(file){
 try{return JSON.parse(fs.readFileSync(file,'utf8'));}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
}
class LicenseManager{
 constructor(root,{publicKey=PUBLIC_KEY,clock=()=>Date.now()}={}){
  this.root=root;this.publicKey=publicKey;this.clock=clock;
  this.identityFile=path.join(root,'installation-id.json');
  this.tokenFile=path.join(root,'license-activation.json');
  this.clockFile=path.join(root,'license-clock.json');
  const identity=readJson(this.identityFile);
  if(identity&&(!UUID.test(identity.installationId||'')||identity.version!==1))
   throw Error('Installation identity requires manual repair');
  this.installationId=identity?.installationId||crypto.randomUUID();
  if(!identity)writeAtomic(this.identityFile,{version:1,installationId:this.installationId});
  const oldClock=readJson(this.clockFile);
  if(oldClock&&(!Number.isSafeInteger(oldClock.highestSeen)||oldClock.highestSeen<0))
   throw Error('License clock metadata invalid');
  this.highestSeen=oldClock?.highestSeen||0;
  // A syntactically corrupt activation file must fail closed as an
  // 'invalid' license state, not crash construction with a raw
  // SyntaxError (main.js builds this manager unguarded at startup).
  let record=null;
  try{record=readJson(this.tokenFile);}
  catch(error){
   if(!(error instanceof SyntaxError))throw error;
   this.tokenFileCorrupt=true;
  }
  this.token=typeof record?.token==='string'?record.token:null;
 }
 clockStatus(){
  const ms=this.clock();
  if(!Number.isFinite(ms)||ms<0)throw Error('System clock is invalid');
  if(ms+5*60000<this.highestSeen)return {ok:false,now:ms};
  if(ms>this.highestSeen+3600000){
   writeAtomic(this.clockFile,{highestSeen:ms});
   this.highestSeen=ms;
  }
  return {ok:true,now:ms};
 }
 status(){
  const measured=this.clockStatus();
  const base={installationId:this.installationId,active:false,
   status:'inactive',plan:null,expiresAt:null,remainingDays:0,maxProfiles:null,features:[]};
  if(!measured.ok)return {...base,status:'clock_error'};
  if(this.tokenFileCorrupt)return {...base,status:'invalid'};
  if(!this.token)return base;
  try{
   const c=verifyLicense(this.token,this.publicKey);
   if(c.installationId!==this.installationId)return {...base,status:'different_installation'};
   const issued=Date.parse(c.issuedAt),expiry=Date.parse(c.expiresAt);
   if(issued>measured.now+5*60000)return {...base,status:'not_yet_valid'};
   return {...base,active:expiry>measured.now,status:expiry>measured.now?'active':'expired',
    plan:c.plan,customer:c.customer,licenseId:c.licenseId,
    expiresAt:c.expiresAt,remainingDays:Math.max(0,Math.ceil((expiry-measured.now)/DAY)),
    maxProfiles:c.maxProfiles,features:[...c.features]};
  }catch(_){return {...base,status:'invalid'};}
 }
 activate(token){
  const clock=this.clockStatus();
  if(!clock.ok)throw Error('System clock appears to have moved backwards');
  const c=verifyLicense(token,this.publicKey);
  if(c.installationId!==this.installationId)
   throw Error('License belongs to a different installation ID');
  if(Date.parse(c.issuedAt)>clock.now+5*60000)throw Error('License is not active yet');
  if(Date.parse(c.expiresAt)<=clock.now)throw Error('License expired');
  const previous=this.token;
  try{
   writeAtomic(this.tokenFile,{version:1,token:token.trim()});
   this.token=token.trim();
   this.tokenFileCorrupt=false;
  }catch(error){this.token=previous;throw error;}
  return this.status();
 }
 deactivate(){
  // Local deactivation does not revoke a license on other devices;
  // revocation requires an online entitlement service.
  writeAtomic(this.tokenFile,{version:1,token:null});
  this.token=null;
  this.tokenFileCorrupt=false;
  return this.status();
 }
}
module.exports={LicenseManager,signLicense,verifyLicense,canonicalClaims,PUBLIC_KEY};
