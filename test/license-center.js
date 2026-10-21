'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const {LicenseManager,signLicense,verifyLicense,canonicalClaims,PUBLIC_KEY}=require('../src/licensing/manager');
const {cli}=require('../tools/issue-license');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-license-test-'));
try{
 const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
 const pub=publicKey.export({type:'spki',format:'pem'});
 const now=Date.parse('2026-10-20T12:00:00.000Z');
 let time=now;
 const manager=new LicenseManager(dir,{publicKey:pub,clock:()=>time});
 assert(manager.installationId.match(/^[0-9a-f-]{36}$/));
 assert.strictEqual(manager.status().status,'inactive');
 const id=manager.installationId;
 assert.strictEqual(new LicenseManager(dir,{publicKey:pub,clock:()=>time}).installationId,id);
 function claims(mod={}){
  return {version:1,licenseId:'lic_'+crypto.randomBytes(12).toString('hex'),
   customer:'Example agency',installationId:id,plan:'pro',maxProfiles:80,
   features:['api','automation','profiles'],
   issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+31*86400000).toISOString(),
   ...mod};
 }
 const signed=signLicense(claims(),privateKey);
 assert.strictEqual(verifyLicense(signed,pub).maxProfiles,80);
 assert.throws(()=>verifyLicense(signed,PUBLIC_KEY),/signature/,'Dev test key must not match vendor production key');
 assert(!signed.includes('PRIVATE KEY'));
 const parts=signed.split('.');
 const tampered=parts[0]+'.'+parts[1]+'.'+
  (parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
 assert.throws(()=>manager.activate(tampered),/signature|encoding/);
 assert.strictEqual(manager.status().status,'inactive');
 assert.throws(()=>manager.activate(signLicense(claims({installationId:crypto.randomUUID()}),privateKey)),/different installation/);
 assert.throws(()=>manager.activate(signLicense(claims({
  issuedAt:new Date(now-60*86400000).toISOString(),
  expiresAt:new Date(now-86400000).toISOString()
 }),privateKey)),/expired/);
 assert.throws(()=>manager.activate(signLicense(claims({
  issuedAt:new Date(now+86400000).toISOString(),
  expiresAt:new Date(now+32*86400000).toISOString()
 }),privateKey)),/not active yet/);
 const result=manager.activate(signed);
 assert.strictEqual(result.status,'active');
 assert.strictEqual(result.plan,'pro');
 assert.strictEqual(result.remainingDays,31);
 assert.strictEqual(result.maxProfiles,80);
 assert(result.features.includes('profiles'));
 assert.strictEqual(result.installationId,id);
 assert(!JSON.stringify(result).includes(signed));
 assert(fs.readFileSync(manager.tokenFile,'utf8').includes(signed));
 const stored=new LicenseManager(dir,{publicKey:pub,clock:()=>time});
 assert.strictEqual(stored.status().status,'active');
 time=now+32*86400000;
 assert.strictEqual(stored.status().status,'expired');
 time=now-5*86400000;
 assert.strictEqual(stored.status().status,'clock_error');
 assert.throws(()=>stored.activate(signed),/clock/);
 time=now+33*86400000;
 assert.strictEqual(stored.deactivate().status,'inactive');
 assert(!fs.readFileSync(stored.tokenFile,'utf8').includes(signed));
 assert.throws(()=>canonicalClaims(claims({features:['profiles','api']})),/entitlements/);
 assert.throws(()=>canonicalClaims(claims({extra:'bad'})),/claims/);
 assert.throws(()=>canonicalClaims(claims({maxProfiles:0})),/fields/);
 const extra=path.join(dir,'test-issuer-key.pem');
 // For unit tests, the private key must be encrypted; never persist unencrypted signing keys.
 const passphrase='test-issuer-passphrase-only';
 fs.writeFileSync(extra,privateKey.export({type:'pkcs8',format:'pem',
  cipher:'aes-256-cbc',passphrase}),{mode:0o600});
 assert.throws(()=>cli(['--key',extra,'--installation',id,'--customer','QA',
  '--plan','pro','--months','1'],{LHM_ISSUER_PASSPHRASE:passphrase}),/signature/,
  'Issuer rejects private signing key not matching the vendor public key');
 assert.throws(()=>cli(['--key',extra,'--installation',id,'--customer','QA',
  '--plan','pro','--months','13'],{LHM_ISSUER_PASSPHRASE:passphrase}),/Months/);
 assert.throws(()=>cli(['--key',extra,'--installation',id,'--customer','QA',
  '--plan','pro','--months','1'],{}),/PASSPHRASE/);
 assert(fs.readFileSync(path.join(__dirname,'../src/licensing/manager.js'),'utf8')
  .includes('BEGIN PUBLIC KEY'));
 assert(!fs.readFileSync(path.join(__dirname,'../src/licensing/manager.js'),'utf8')
  .includes('BEGIN PRIVATE KEY'));
 console.log('v5.0 offline Ed25519 license: signature, expiry, wrong machine, persistence, anti-rollback and issuer-key separation passed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
