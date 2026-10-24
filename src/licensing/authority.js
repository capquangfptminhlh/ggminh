'use strict';
// Self-hosted license authority foundation, bound to loopback behind HTTPS proxy.
// Do not deploy public HTTP, ship private keys, or expose mutation endpoints.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {verifyLicense,PUBLIC_KEY}=require('./manager');
const {signReceipt}=require('./receipts');
const ID=/^lic_[0-9a-f]{24}$/;
const NONCE=/^[a-zA-Z0-9_-]{22}$/;
function readRegistry(filename){
 let saved;
 try{saved=JSON.parse(fs.readFileSync(filename,'utf8'));}
 catch(error){
  if(error.code==='ENOENT')return {version:1,revoked:[]};
  throw error;
 }
 if(saved?.version!==1||!Array.isArray(saved.revoked)||
    saved.revoked.length>50000||saved.revoked.some(x=>!ID.test(x))||
    new Set(saved.revoked).size!==saved.revoked.length)
  throw Error('Corrupted license revocation registry');
 return saved;
}
function saveRegistry(filename,record){
 readRegistrySafe(record);
 fs.mkdirSync(path.dirname(filename),{recursive:true});
 const tmp=filename+'.'+process.pid+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
 try{
  fs.writeFileSync(tmp,JSON.stringify(record,null,2),{flag:'wx',mode:0o600});
  fs.renameSync(tmp,filename);
 }catch(error){try{fs.rmSync(tmp,{force:true});}catch(_){}throw error;}
}
function readRegistrySafe(data){
 if(data?.version!==1||!Array.isArray(data.revoked)||
   data.revoked.length>50000||data.revoked.some(x=>!ID.test(x))||
   new Set(data.revoked).size!==data.revoked.length)
  throw Error('Invalid registry input');
 return data;
}
function changeRevocation(filename,licenseId,revoked){
 if(!ID.test(licenseId)||typeof revoked!=='boolean')throw Error('Invalid license ID or revoke option');
 const data=readRegistry(filename);
 const set=new Set(data.revoked);
 if(revoked)set.add(licenseId);else set.delete(licenseId);
 data.revoked=[...set].sort();
 saveRegistry(filename,data);
 return {licenseId,revoked:revoked===true,totalRevoked:data.revoked.length};
}
function makeAuthority({privateKey,registryFile,publicKey=PUBLIC_KEY,clock=()=>Date.now(),sweepHealth=null}={}){
 if(!privateKey||!registryFile)throw Error('Authority private key and registry path are required');
 const key=privateKey instanceof crypto.KeyObject&&privateKey.type==='private'
  ?privateKey:crypto.createPrivateKey(privateKey);
 const actual=crypto.createPublicKey(key).export({type:'spki',format:'pem'});
 const expected=crypto.createPublicKey(publicKey).export({type:'spki',format:'pem'});
 if(actual!==expected)throw Error('Authority signing key does not match app public key');
 // Every TLS-terminated customer is seen as 127.0.0.1 here. Throttle
 // *verified licenses* individually instead of blocking the 121st paying
 // customer behind the same reverse proxy. Do NOT trust spoofable
 // X-Forwarded-For headers. Bound aggregate work as a last-resort fuse.
 const perLicense=new Map();
 const WINDOW_MS=60_000,GLOBAL_PER_MINUTE=6000,LICENSE_PER_MINUTE=60;
 let total={until:0,count:0};
 function rateLimited(licenseId,now){
  let record=perLicense.get(licenseId);
  if(!record||now>=record.until){
   if(!record&&perLicense.size>=10000){
    for(const [id,item] of perLicense)if(now>=item.until)perLicense.delete(id);
    if(perLicense.size>=10000)return true;
   }
   record={count:0,until:now+WINDOW_MS};
   perLicense.set(licenseId,record);
  }
  record.count++;
  return record.count>LICENSE_PER_MINUTE;
 }
 return http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));};
  if(req.method==='GET'&&req.url==='/health'){
   const healthy=!sweepHealth||sweepHealth.healthy===true;
   return reply(healthy?200:503,{status:healthy?'ok':'degraded',service:'LHM License Authority',
    ownerSweep:sweepHealth?{healthy,lastRunAt:sweepHealth.lastRunAt||null}:null});
  }
  if(req.method!=='POST'||req.url!=='/v1/verify')return reply(404,{error:'not_found'});
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))
   return reply(415,{error:'json_required'});
  // Coarse circuit breaker counts all requests, regardless of origin. It
  // avoids infinite signature-verification work if the TLS edge is attacked.
  // The reverse proxy should enforce an additional network-layer limit.
  const now=clock();
  if(!Number.isSafeInteger(now)||now<0)return reply(503,{error:'clock_unavailable'});
  if(now>=total.until)total={until:now+WINDOW_MS,count:0};
  if(++total.count>GLOBAL_PER_MINUTE){
   res.setHeader('Retry-After','60');
   return reply(429,{error:'authority_overloaded'});
  }
  let chunks=[],length=0;
  try{
   for await(const chunk of req){
    length+=chunk.length;
    if(length>15000)throw Error('request_too_large');
    chunks.push(chunk);
   }
   const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(input?.version!==1||!NONCE.test(input.nonce||'')||
      typeof input.token!=='string'||input.token.length>11000||
      Object.keys(input).sort().join('|')!=='nonce|token|version')
    throw Error('invalid_request');
   const license=verifyLicense(input.token,publicKey);
   // Limit a single signed license (rather than localhost / reverse proxy).
   // Tokens are never stored; only a verified random license identifier.
   if(rateLimited(license.licenseId,now)){
    res.setHeader('Retry-After','60');
    return reply(429,{error:'rate_limited'});
   }
   const registry=readRegistry(registryFile);
   const ownerSweep=license.version===2&&license.enforcementMode==='owner_sweep';
   if(ownerSweep&&(!sweepHealth||sweepHealth.healthy!==true))
    return reply(503,{error:'owner_sweep_unavailable'});
   const state=registry.revoked.includes(license.licenseId)?'revoked':
    Date.parse(license.expiresAt)<=now&&!ownerSweep?'expired':'valid';
   const receipt=signReceipt({
    version:1,licenseId:license.licenseId,
    installationId:license.installationId,nonce:input.nonce,
    checkedAt:now,state
   },key);
   return reply(200,{receipt});
  }catch(error){
   if(error.message==='request_too_large')return reply(413,{error:'request_too_large'});
   if(error.message==='Corrupted license revocation registry')
    return reply(503,{error:'registry_unavailable'});
   return reply(400,{error:'invalid_license_or_request'});
  }
 });
}
module.exports={makeAuthority,readRegistry,changeRevocation};
