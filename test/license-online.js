'use strict';
const assert=require('assert'),crypto=require('crypto'),fs=require('fs'),os=require('os'),path=require('path');
const {LicenseManager,signLicense}=require('../src/licensing/manager');
const {LicensePolicy}=require('../src/licensing/enforcement');
const {OnlineLicenseVerifier,verifyEndpoint,MAX_GRACE_MS}=require('../src/licensing/onlineVerifier');
const {makeAuthority,changeRevocation}=require('../src/licensing/authority');
const {verifyReceipt,signReceipt}=require('../src/licensing/receipts');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-online-authority-'));
 let server;
 try{
  let time=Date.parse('2026-10-20T06:00:00.000Z');
  const keys=crypto.generateKeyPairSync('ed25519');
  const pub=keys.publicKey.export({format:'pem',type:'spki'});
  const manager=new LicenseManager(root,{publicKey:pub,clock:()=>time});
  const token=signLicense({
   version:1,licenseId:'lic_'+crypto.randomBytes(12).toString('hex'),
   installationId:manager.installationId,customer:'Integration company',plan:'pro',
   maxProfiles:100,features:['api','automation','profiles'],
   issuedAt:new Date(time-86400000).toISOString(),
   expiresAt:new Date(time+30*86400000).toISOString()
  },keys.privateKey);
  manager.activate(token);
  const registryFile=path.join(root,'authority-registry.json');
  server=makeAuthority({privateKey:keys.privateKey,publicKey:pub,registryFile,clock:()=>time});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const local='http://127.0.0.1:'+server.address().port+'/v1/verify';
  assert.throws(()=>verifyEndpoint(local),/HTTPS/);
  assert.strictEqual(verifyEndpoint(local,{allowLocalhost:true}),local);
  assert.throws(()=>verifyEndpoint('https://user:pass@license.example/v1/verify'),/HTTPS/);
  assert.throws(()=>verifyEndpoint('http://website.example/v1/verify',{allowLocalhost:true}),/HTTPS/);
  const client=new OnlineLicenseVerifier(root,manager,{endpoint:local,
   allowLocalhost:true,clock:()=>time});
  const policy=new LicensePolicy(root,manager,{clock:()=>time});
  policy.onlineVerifier=client;
  assert.strictEqual(policy.status().access,'blocked','Online mode needs authenticated first receipt');
  const verified=await client.verifyNow();
  assert.strictEqual(verified.state,'valid');
  assert.strictEqual(policy.status().access,'licensed');
  assert.strictEqual(policy.status().online.state,'verified');
  const saved=fs.readFileSync(client.file,'utf8');
  assert(!saved.includes(token),'Never store full license inside receipt cache');
  const receipt=JSON.parse(saved).receipt;
  const content=verifyReceipt(receipt,{
   publicKey:pub,licenseId:manager.status().licenseId,
   installationId:manager.installationId,now:time
  });
  assert.strictEqual(content.state,'valid');
  assert.throws(()=>verifyReceipt(receipt,{publicKey:pub,nonce:'x'.repeat(22),
   licenseId:content.licenseId,installationId:content.installationId,now:time}),/another/);
  assert.throws(()=>verifyReceipt(receipt.slice(0,-3)+'abc',{
   publicKey:pub,licenseId:content.licenseId,
   installationId:content.installationId,now:time
  }),/signature|Malformed|Noncanonical/);
  assert.throws(()=>makeAuthority({privateKey:keys.privateKey,
   publicKey:require('../src/licensing/manager').PUBLIC_KEY,registryFile}),/does not match/);
  // Reloading the client must verify the signature on disk; no plaintext trust.
  const reopened=new OnlineLicenseVerifier(root,manager,{endpoint:local,
   allowLocalhost:true,clock:()=>time});
  assert.strictEqual(reopened.apply({...manager.status(),access:'licensed',allowed:true}).online.state,'verified');
  time+=13*60*60*1000;
  assert.strictEqual(policy.status().online.state,'offline_grace');
  time+=MAX_GRACE_MS;
  assert.strictEqual(policy.status().access,'blocked');
  assert.strictEqual(policy.status().reason,'verification_expired');
  // Server is available; next online verification restores entitlement.
  assert.strictEqual((await client.verifyNow()).state,'valid');
  assert.strictEqual(policy.status().access,'licensed');
  const id=manager.status().licenseId;
  changeRevocation(registryFile,id,true);
  assert.strictEqual((await client.verifyNow()).state,'revoked');
  assert.strictEqual(policy.status().access,'blocked');
  assert.strictEqual(policy.status().reason,'revoked');
  assert.throws(()=>policy.require('api'),/thu hồi|xác minh|hết hạn/);
  // Signed revocation persists while offline; older proof cannot overwrite it.
  const reload=new OnlineLicenseVerifier(root,manager,{endpoint:local,
   allowLocalhost:true,clock:()=>time,fetcher:async()=>{throw Error('Network unavailable')}});
  assert.strictEqual(reload.apply({...manager.status(),access:'licensed',allowed:true}).reason,'revoked');
  await assert.rejects(()=>reload.verifyNow(),/Network unavailable/);
  assert.strictEqual(policy.status().reason,'revoked');
  changeRevocation(registryFile,id,false);
  time+=1000;
  assert.strictEqual((await client.verifyNow()).state,'valid');
  assert.strictEqual(policy.status().access,'licensed');
  // Mock server response cannot forge a receipt without issuer private key.
  const attacker=crypto.generateKeyPairSync('ed25519');
  const tampered=signReceipt({...content,checkedAt:time,nonce:crypto.randomBytes(16).toString('base64url')},attacker.privateKey);
  const old=client.lastReceipt;
  const malicious=new OnlineLicenseVerifier(path.join(root,'new-cache'),manager,{
   endpoint:local,allowLocalhost:true,clock:()=>time,
   fetcher:async()=>({ok:true,headers:{get:()=>null},json:async()=>({receipt:tampered})})
  });
  await assert.rejects(()=>malicious.verifyNow(),/signature|another/);
  assert.strictEqual(malicious.lastReceipt,null);
  assert.strictEqual(client.lastReceipt,old);
  // Validate authority responds only to signed licenses.
  const bad=await fetch(local,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({version:1,token:'fake-token',nonce:crypto.randomBytes(16).toString('base64url')})});
  assert.strictEqual(bad.status,400);
  console.log('v5.2 authority: signed proof, nonce, expiry, rollback, revocation, offline grace and impersonation defense passed');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
