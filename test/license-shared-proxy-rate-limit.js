'use strict';
// A TLS reverse proxy forwards all owner license checks to 127.0.0.1.
// Distinct customers must not share the old 120/min *socket IP* bucket.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {makeAuthority}=require('../src/licensing/authority');
const {signLicense}=require('../src/licensing/manager');
const {verifyReceipt}=require('../src/licensing/receipts');

(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-license-proxy-rate-'));
 let server;
 try{
  const keys=crypto.generateKeyPairSync('ed25519');
  const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
  let now=Date.parse('2026-10-24T01:00:00.000Z');
  const clock=()=>now;
  server=makeAuthority({
   privateKey:keys.privateKey,publicKey,
   registryFile:path.join(root,'revocation-registry.json'),clock
  });
  await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(0,'127.0.0.1',resolve);
  });
  const endpoint='http://127.0.0.1:'+server.address().port+'/v1/verify';
  function license(){
   const licenseId='lic_'+crypto.randomBytes(12).toString('hex');
   const installationId=crypto.randomUUID();
   const token=signLicense({
    version:1,licenseId,installationId,customer:'Independent customer fixture',
    plan:'starter',maxProfiles:5,features:['profiles'],
    issuedAt:new Date(now-1000).toISOString(),
    expiresAt:new Date(now+7*86400000).toISOString()
   },keys.privateKey);
   return {licenseId,installationId,token};
  }
  async function ask(item,forwardedFor){
   const nonce=crypto.randomBytes(16).toString('base64url');
   const response=await fetch(endpoint,{
    method:'POST',headers:{
     'Content-Type':'application/json',
     ...(forwardedFor?{'X-Forwarded-For':forwardedFor}:{})
    },body:JSON.stringify({version:1,token:item.token,nonce})
   });
   const body=await response.json();
   if(response.status===200){
    const valid=verifyReceipt(body.receipt,{
     publicKey,licenseId:item.licenseId,installationId:item.installationId,
     nonce,now
    });
    assert.equal(valid.state,'valid');
   }
   return {status:response.status,body,retryAfter:response.headers.get('retry-after')};
  }
  const owner=license();
  const one=await ask(owner,'203.0.113.80');
  assert.equal(one.status,200);
  // With the previous per-IP throttle, a single reverse proxy rejected
  // the 121st customer even if all had different valid licenses.
  for(let i=0;i<145;i++){
   const value=await ask(license(),'198.51.100.'+(i%250));
   assert.equal(value.status,200,'Distinct license '+(i+1)+' must work behind localhost');
  }
  // One abusive valid license must be capped, even if it spoofs its
  // X-Forwarded-For address or reconnects for every call.
  for(let i=1;i<60;i++){
   const value=await ask(owner,'192.0.2.'+(i%250));
   assert.equal(value.status,200);
  }
  const limited=await ask(owner,'198.51.100.254');
  assert.equal(limited.status,429,'The 61st request for one license is rate limited');
  assert.equal(limited.body.error,'rate_limited');
  assert.equal(limited.retryAfter,'60');
  assert.equal((await ask(license(),'198.51.100.254')).status,200,
   'No other signed license is affected by the abusive one');
  now+=60_001;
  assert.equal((await ask(owner)).status,200,'Per-license bucket resets after a minute');
  const wrong=await ask({...license(),token:'fake-token'},'203.0.113.4');
  assert.equal(wrong.status,400,'Forwarded IP does not enable unsigned license');
  console.log('Authority shared TLS reverse proxy: 146 independent licenses, per-license throttle, non-trusted forwarded IP and reset PASS');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
