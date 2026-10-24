'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {signLicense}=require('../src/licensing/manager');
const {verifyReceipt}=require('../src/licensing/receipts');
const {run:adminRun}=require('../tools/license-cloudflare-sync');
const workerUrl=pathToFileURL(path.join(__dirname,'../serverless/license-worker/src/index.mjs')).href;
class D1Fixture {
 constructor(){this.records=new Map();}
 prepare(statement){
  const db=this;
  const prepared={bind(...args){
   return {
    async first(){
     if(statement.startsWith('SELECT 1 AS ready'))return db.records.size?{ready:1}:null;
     if(statement.startsWith('SELECT license_id AS licenseId')){
      const row=db.records.get(args[0]);return row?{...row}:null;
     }
     throw Error('Unknown D1 first: '+statement);
    },
    async run(){
     if(statement.includes('INSERT OR IGNORE INTO licenses')){
      const [id,installationId,expiresAt,enforcementMode,updatedAt]=args;
      if(!db.records.has(id))db.records.set(id,{
       licenseId:id,installationId,expiresAt,enforcementMode,
       revoked:0,updatedAt
      });
      return {meta:{changes:1}};
     }
     if(statement.includes('UPDATE licenses SET revoked = 1')){
      let changed=0;
      const single=statement.includes('WHERE license_id = ?');
      for(const row of db.records.values()){
       const match=single?row.licenseId===args[1]:true;
       const nowIso=single?args[2]:args[1];
       if(match&&row.revoked===0&&row.enforcementMode==='owner_sweep'&&
          row.expiresAt<=nowIso){
        row.revoked=1;row.updatedAt=args[0];changed++;
       }
      }
      return {meta:{changes:changed}};
     }
     if(statement.includes('UPDATE licenses SET revoked = ?')){
      const row=db.records.get(args[2]);
      if(row){row.revoked=args[0];row.updatedAt=args[1];}
      return {meta:{changes:row?1:0}};
     }
     throw Error('Unknown D1 run: '+statement);
    }
   };
  }};
  // Real Cloudflare D1 supports prepare(sql).first() with no bind.
  prepared.first=()=>prepared.bind().first();
  return prepared;
 }
}
(async()=>{
 const {createAuthority}=await import(workerUrl);
 let now=Date.parse('2026-10-24T07:00:00.000Z');
 const keys=crypto.generateKeyPairSync('ed25519');
 const pub=keys.publicKey.export({format:'pem',type:'spki'});
 const db=new D1Fixture(),secret='local-test-admin-'+crypto.randomBytes(24).toString('hex');
 const env={
  LICENSE_DB:db,LHM_LICENSE_ADMIN_TOKEN:secret,
  LHM_ISSUER_PRIVATE_PKCS8_B64:keys.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),
  LHM_ISSUER_PUBLIC_SPKI_B64:keys.publicKey.export({format:'der',type:'spki'}).toString('base64')
 };
 const worker=createAuthority({clock:()=>now});
 const base='https://license.example.test';
 async function query(route,body,{auth=false,method='POST',overrideEnv=env,headers={}}={}){
  const response=await worker.fetch(new Request(base+route,{
   method,headers:{...(method==='POST'?{'content-type':'application/json'}:{}),
    ...(auth?{authorization:'Bearer '+secret}:{}),...headers},
   ...(body?{body:JSON.stringify(body)}:{})
  }),overrideEnv);
  return {status:response.status,data:await response.json(),headers:response.headers};
 }
 function signed({mode='owner_sweep',expiresDays=30,licenseId}={}){
  const claims={version:2,
   licenseId:licenseId||'lic_'+crypto.randomBytes(12).toString('hex'),
   customer:'synthetic-test-customer',installationId:crypto.randomUUID(),
   plan:'pro',maxProfiles:50,features:['api','automation','profiles'],
   issuedAt:new Date(now-30000).toISOString(),
   expiresAt:new Date(now+expiresDays*86400000).toISOString(),
   enforcementMode:mode};
  return {claims,token:signLicense(claims,keys.privateKey)};
 }
 const initial=signed(),nonce=crypto.randomBytes(16).toString('base64url');
 assert.equal((await query('/health',null,{method:'GET'})).status,200);
 assert.equal((await query('/v1/verify',{version:1,token:initial.token,nonce})).status,403,
  'Never enroll a customer solely by presenting a signed token');
 assert.equal((await query('/v1/admin/register',{token:initial.token})).status,401,
  'Admin API must authenticate');
 const invalidEnv={...env,LHM_LICENSE_ADMIN_TOKEN:''};
 assert.equal((await query('/v1/admin/register',{token:initial.token},
  {auth:true,overrideEnv:invalidEnv})).status,503);
 const forged=signed(),imposter=crypto.generateKeyPairSync('ed25519');
 const badToken=signLicense(forged.claims,imposter.privateKey);
 assert.equal((await query('/v1/admin/register',{token:badToken},{auth:true})).status,400);
 const reg=await query('/v1/admin/register',{token:initial.token},{auth:true});
 assert.equal(reg.status,200);assert.equal(reg.data.registered,true);
 assert.equal((await query('/v1/admin/register',{token:initial.token},{auth:true})).status,200,
  'Idempotent registration');
 assert.equal(JSON.stringify([...db.records.values()]).includes(initial.token),false,
  'Never save the customer activation token to D1');
 const active=await query('/v1/verify',{version:1,token:initial.token,nonce});
 assert.equal(active.status,200);
 assert.equal(verifyReceipt(active.data.receipt,{publicKey:pub,nonce,
  licenseId:initial.claims.licenseId,
  installationId:initial.claims.installationId,now}).state,'valid');
 assert.equal((await query('/v1/verify',{version:1,token:initial.token,nonce:'bad'})).status,400);
 const wrongKey={...env,LHM_ISSUER_PRIVATE_PKCS8_B64:imposter.privateKey.export({
  format:'der',type:'pkcs8'}).toString('base64')};
 assert.equal((await query('/v1/verify',{version:1,token:initial.token,nonce},
  {overrideEnv:wrongKey})).status,503,'Mismatching publisher key must fail closed');
 const revoked=await query('/v1/admin/revocation',
  {licenseId:initial.claims.licenseId,revoked:true},{auth:true});
 assert.equal(revoked.status,200);
 const revProof=await query('/v1/verify',{version:1,token:initial.token,nonce});
 assert.equal(verifyReceipt(revProof.data.receipt,{publicKey:pub,nonce,
  licenseId:initial.claims.licenseId,
  installationId:initial.claims.installationId,now}).state,'revoked');
 assert.equal((await query('/v1/admin/revocation',{licenseId:initial.claims.licenseId,revoked:false},{auth:true})).status,200);
 assert.equal(verifyReceipt((await query('/v1/verify',{
  version:1,token:initial.token,nonce})).data.receipt,{publicKey:pub,nonce,
  licenseId:initial.claims.licenseId,installationId:initial.claims.installationId,now}).state,'valid');

 const strict=signed({mode:'strict',expiresDays:1}),swept=signed({expiresDays:1});
 for(const lic of [strict,swept])assert.equal((await query('/v1/admin/register',{token:lic.token},{auth:true})).status,200);
 now+=86400000+2000;
 const strictProof=await query('/v1/verify',{version:1,token:strict.token,nonce});
 assert.equal(verifyReceipt(strictProof.data.receipt,{publicKey:pub,nonce,
  licenseId:strict.claims.licenseId,installationId:strict.claims.installationId,now}).state,'expired');
 await worker.scheduled({},env);
 assert.equal(db.records.get(swept.claims.licenseId).revoked,1,
  'Scheduled D1 owner sweep must revoke expired owner_sweep licenses');
 const sweepProof=await query('/v1/verify',{version:1,token:swept.token,nonce});
 assert.equal(verifyReceipt(sweepProof.data.receipt,{publicKey:pub,nonce,
  licenseId:swept.claims.licenseId,installationId:swept.claims.installationId,now}).state,'revoked');
 assert.equal((await query('/v1/admin/revocation',{
  licenseId:swept.claims.licenseId,revoked:false},{auth:true})).status,409,
  'Never reallow a lapsed rental without new signed license');
 const onDemand=signed({expiresDays:1});
 await query('/v1/admin/register',{token:onDemand.token},{auth:true});
 now+=86400000+3000;
 const onDemandProof=await query('/v1/verify',{version:1,token:onDemand.token,nonce});
 assert.equal(verifyReceipt(onDemandProof.data.receipt,{publicKey:pub,nonce,
  licenseId:onDemand.claims.licenseId,installationId:onDemand.claims.installationId,now}).state,'revoked',
  'Verification must sweep when scheduled task has not yet run');

 // Real operator CLI contract: stdin-only token, forced HTTPS, no HTTP redirects.
 assert.throws(()=>require('../tools/license-cloudflare-sync').endpoint('http://license.example/'),/HTTPS/);
 const remote=signed({expiresDays:1});
 const cli=await adminRun(['register','--url',base+'/'],{
  env:{LHM_LICENSE_ADMIN_TOKEN:secret},readStdin:()=>remote.token,
  fetcher:(url,init)=>worker.fetch(new Request(url,init),env)
 });
 assert.equal(cli.registered,true);
 assert.equal(cli.licenseId,remote.claims.licenseId);
 assert(!JSON.stringify(cli).includes(remote.token));
 assert.equal((await adminRun(['revoke','--url',base+'/','--license-id',remote.claims.licenseId],{
  env:{LHM_LICENSE_ADMIN_TOKEN:secret},
  fetcher:(url,init)=>worker.fetch(new Request(url,init),env)
 })).revoked,true);
 const migration=fs.readFileSync(path.join(__dirname,'../serverless/license-worker/migrations/0001_licenses.sql'),'utf8');
 assert(migration.includes('CREATE TABLE IF NOT EXISTS licenses'));
 const docs=fs.readFileSync(path.join(__dirname,'../serverless/license-worker/wrangler.toml.example'),'utf8');
 assert(docs.includes('LICENSE_DB')&&docs.includes('crons'));
 console.log('Cloudflare D1 rental authority: Node client signed receipt parity, enrollment, revocation, strict/sweep expiry, admin CLI, key mismatch and HTTPS PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
