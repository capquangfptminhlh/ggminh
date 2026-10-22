'use strict';
// Admin-only local customer ledger. No secret keys, raw tokens, cookies or browser
// data are stored in the ledger. This does not replace payment accounting.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {signLicense,verifyLicense,PUBLIC_KEY}=require('./manager');
const ID=/^lic_[a-f0-9]{24}$/;
const CUSTOMER=/^cust_[a-f0-9]{20}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAN_FEATURES=Object.freeze({
 starter:['profiles'],
 pro:['api','automation','profiles'],
 business:['api','automation','profiles']
});
const MAX_BYTES=4*1024*1024;
function iso(value){
 const date=new Date(value);
 if(!Number.isFinite(date.valueOf()))throw Error('Invalid ledger time');
 return date.toISOString();
}
function addMonths(date,months){
 if(!Number.isInteger(months)||months<1||months>12)throw Error('Months must be 1–12');
 const start=new Date(date),end=new Date(date);
 end.setUTCDate(1);
 end.setUTCMonth(end.getUTCMonth()+months);
 const last=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();
 end.setUTCDate(Math.min(last,start.getUTCDate()));
 return end;
}
function empty(){return {version:1,customers:[],licenses:[],events:[]};}
function checkLedger(data){
 if(!data||data.version!==1||!Array.isArray(data.customers)||
    !Array.isArray(data.licenses)||!Array.isArray(data.events)||
    data.customers.length>10000||data.licenses.length>40000||data.events.length>50000)
  throw Error('License ledger format or limits invalid');
 const customers=new Set(),licenses=new Set();
 for(const c of data.customers){
  if(!CUSTOMER.test(c?.id||'')||typeof c.name!=='string'||
     c.name.length<1||c.name.length>120||!UUID.test(c.installationId||'')||
     typeof c.createdAt!=='string'||customers.has(c.id))throw Error('Invalid customer record');
  iso(c.createdAt);customers.add(c.id);
 }
 for(const x of data.licenses){
  if(!ID.test(x?.licenseId||'')||!customers.has(x.customerId)||
     !Object.hasOwn(PLAN_FEATURES,x.plan)||!Number.isInteger(x.maxProfiles)||
     x.maxProfiles<1||x.maxProfiles>10000||licenses.has(x.licenseId)||
     (x.renewalOf!==null&&!ID.test(x.renewalOf||''))||
     typeof x.revoked!=='boolean'||typeof x.issuedAt!=='string'||
     typeof x.expiresAt!=='string'||
     !['strict','owner_sweep'].includes(x.enforcementMode||'strict'))
    throw Error('Invalid license ledger entry');
  iso(x.issuedAt);iso(x.expiresAt);licenses.add(x.licenseId);
 }
 for(const e of data.events){
  if(!['customer_added','license_issued','license_renewed','license_revoked','license_allowed'].includes(e?.action)||
     typeof e.at!=='string'||!customers.has(e.customerId)||
     (e.licenseId!==null&&!ID.test(e.licenseId||'')))throw Error('Invalid audit event');
  iso(e.at);
 }
 if(data.events.length>50000)throw Error('Audit history full');
 return data;
}
function ensureFile(file){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Absolute private ledger path required');
 if(fs.existsSync(file)&&(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()))
  throw Error('Ledger must be a regular private file');
 return file;
}
function readLedger(file){
 file=ensureFile(file);
 if(!fs.existsSync(file))return empty();
 const st=fs.statSync(file);
 if(st.size>MAX_BYTES)throw Error('Ledger exceeds 4 MB limit');
 const value=JSON.parse(fs.readFileSync(file,'utf8'));
 return checkLedger(value);
}
function mutate(file,action){
 file=ensureFile(file);
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const lock=file+'.lock';
 let fd;
 try{fd=fs.openSync(lock,'wx',0o600);}
 catch(error){if(error.code==='EEXIST')throw Error('Ledger is locked by another admin process');throw error;}
 try{
  const data=readLedger(file);
  const result=action(data);
  checkLedger(data);
  const content=JSON.stringify(data,null,2)+'\n';
  if(Buffer.byteLength(content)>MAX_BYTES)throw Error('Ledger exceeds 4 MB');
  const tmp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
  try{
   fs.writeFileSync(tmp,content,{flag:'wx',mode:0o600});
   fs.renameSync(tmp,file);
  }catch(error){try{fs.rmSync(tmp,{force:true});}catch(_){}throw error;}
  return result;
 }finally{
  try{fs.closeSync(fd);}catch(_){}
  try{fs.unlinkSync(lock);}catch(_){}
 }
}
function addCustomer(file,name,installationId,{now=()=>Date.now()}={}){
 if(typeof name!=='string'||!name.trim()||name.trim().length>120||
    !UUID.test(installationId||''))throw Error('Customer name or installation ID invalid');
 return mutate(file,data=>{
  const normalized=name.trim();
  if(data.customers.some(c=>c.installationId.toLowerCase()===installationId.toLowerCase()))
   throw Error('Installation already belongs to a customer in this ledger');
  const entry={id:'cust_'+crypto.randomBytes(10).toString('hex'),
   name:normalized,installationId,createdAt:iso(now())};
  data.customers.push(entry);
  data.events.push({action:'customer_added',at:entry.createdAt,
   customerId:entry.id,licenseId:null});
  return structuredClone(entry);
 });
}
function issue(file,{
 customerId,plan,months,maxProfiles,privateKey,publicKey=PUBLIC_KEY,
 renewFrom=null,enforcementMode='owner_sweep',now=()=>Date.now()
}={}){
 if(!CUSTOMER.test(customerId||'')||!Object.hasOwn(PLAN_FEATURES,plan)||
    !Number.isInteger(months)||months<1||months>12||
    !Number.isInteger(maxProfiles)||maxProfiles<1||maxProfiles>10000||
    !['strict','owner_sweep'].includes(enforcementMode))
  throw Error('Invalid license issuance parameters');
 if(!privateKey)throw Error('Issuer signing key required');
 return mutate(file,data=>{
  const customer=data.customers.find(x=>x.id===customerId);
  if(!customer)throw Error('Customer not found');
  let old=null;
  if(renewFrom!==null){
   old=data.licenses.find(x=>x.licenseId===renewFrom&&x.customerId===customerId);
   if(!old)throw Error('Prior customer license not found');
  }
  const issuedAt=new Date(now());
  if(!Number.isFinite(issuedAt.getTime()))throw Error('Invalid issuer time');
  const start=old&&Date.parse(old.expiresAt)>issuedAt.getTime()
   ?new Date(old.expiresAt):issuedAt;
  const expiresAt=addMonths(start,months);
  if(expiresAt.getTime()-issuedAt.getTime()>370*86400000)
   throw Error('License renewal extends beyond 370-day signed-token maximum');
  const claims={
   version:2,licenseId:'lic_'+crypto.randomBytes(12).toString('hex'),
   customer:customer.name,installationId:customer.installationId,
   plan,maxProfiles,features:PLAN_FEATURES[plan],
   issuedAt:issuedAt.toISOString(),expiresAt:expiresAt.toISOString(),enforcementMode
  };
  const token=signLicense(claims,privateKey);
  verifyLicense(token,publicKey); // refuse a signing key mismatching shipped app
  const row={licenseId:claims.licenseId,customerId,plan,maxProfiles,enforcementMode,
   issuedAt:claims.issuedAt,expiresAt:claims.expiresAt,
   renewalOf:old?old.licenseId:null,revoked:false};
  data.licenses.push(row);
  data.events.push({action:old?'license_renewed':'license_issued',
   at:claims.issuedAt,customerId,licenseId:claims.licenseId});
  // Token only exists in return value, never in ledger or audits.
  return {token,record:structuredClone(row),customer:structuredClone(customer)};
 });
}
function recordRevocation(file,licenseId,revoked,{now=()=>Date.now()}={}){
 if(!ID.test(licenseId||'')||typeof revoked!=='boolean')throw Error('Invalid revocation');
 return mutate(file,data=>{
  const license=data.licenses.find(x=>x.licenseId===licenseId);
  if(!license)throw Error('License not found in customer ledger');
  if(license.revoked!==revoked){
   license.revoked=revoked;
   data.events.push({action:revoked?'license_revoked':'license_allowed',
    at:iso(now()),customerId:license.customerId,licenseId});
  }
  return structuredClone(license);
 });
}
function due(file,days=14,{now=()=>Date.now()}={}){
 if(!Number.isInteger(days)||days<0||days>365)throw Error('Days must be 0–365');
 const data=readLedger(file),t=now();
 const customers=new Map(data.customers.map(c=>[c.id,c]));
 const superseded=new Set(data.licenses.map(x=>x.renewalOf).filter(Boolean));
 return data.licenses.filter(x=>!superseded.has(x.licenseId)&&!x.revoked&&Date.parse(x.expiresAt)>=t&&
   Date.parse(x.expiresAt)<=t+days*86400000)
  .map(x=>({licenseId:x.licenseId,customerId:x.customerId,
   customer:customers.get(x.customerId)?.name,plan:x.plan,expiresAt:x.expiresAt}))
  .sort((a,b)=>a.expiresAt.localeCompare(b.expiresAt));
}
function summary(file){
 const data=readLedger(file);
 return {customers:data.customers.length,issued:data.licenses.length,
  revoked:data.licenses.filter(x=>x.revoked).length,
  audits:data.events.length,
  customersList:data.customers.map(c=>({id:c.id,name:c.name,installationId:c.installationId})),
  licenses:data.licenses.map(x=>({...x})),
  lastEvents:data.events.slice(-20).map(x=>({...x}))};
}
module.exports={addCustomer,issue,readLedger,recordRevocation,due,summary,addMonths};
