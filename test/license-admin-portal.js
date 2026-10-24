'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {DatabaseSync}=require('node:sqlite');
const {verifyLicense}=require('../src/licensing/manager');
const {verifyReceipt}=require('../src/licensing/receipts');
const dir=path.join(__dirname,'../serverless/license-worker');
class D1Local {
 constructor(){
  this.sql=new DatabaseSync(':memory:');
  for(const script of ['0001_licenses.sql','0002_billing_portal.sql'])
   this.sql.exec(fs.readFileSync(path.join(dir,'migrations',script),'utf8'));
 }
 prepare(sql){
  const stmt=this.sql.prepare(sql),make=(args)=>({
   async first(){return stmt.get(...args)||null;},
   async all(){return {results:stmt.all(...args)};},
   async run(){const r=stmt.run(...args);return {meta:{changes:r.changes}};}
  });
  return {bind(...args){return make(args);},...make([])};
 }
 async batch(statements){
  this.sql.exec('BEGIN IMMEDIATE');
  try{
   const rows=[];
   for(const query of statements)rows.push(await query.run());
   this.sql.exec('COMMIT');
   return rows;
  }catch(e){this.sql.exec('ROLLBACK');throw e;}
 }
}
(async()=>{
 const {createAuthority}=await import(pathToFileURL(path.join(dir,'src/index.mjs')).href);
 const keypair=crypto.generateKeyPairSync('ed25519');
 const publicKey=keypair.publicKey.export({type:'spki',format:'pem'});
 const db=new D1Local();
 const encKey=crypto.randomBytes(32);
 const secret='admin_'+crypto.randomBytes(28).toString('hex');
 const env={
  LICENSE_DB:db,
  LHM_LICENSE_ADMIN_TOKEN:secret,
  LHM_ISSUER_PRIVATE_PKCS8_B64:keypair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),
  LHM_ISSUER_PUBLIC_SPKI_B64:keypair.publicKey.export({format:'der',type:'spki'}).toString('base64'),
  LHM_ORDER_TOKEN_ENC_KEY_B64:encKey.toString('base64')
 };
 let now=Date.parse('2026-10-24T10:00:00.000Z');
 const worker=createAuthority({clock:()=>now}),origin='https://browser.lhmcrm.com';
 async function call(route,body,{admin=true,headers={},envOverride=env}={}){
  const response=await worker.fetch(new Request(origin+route,{
   method:body===undefined?'GET':'POST',
   headers:{...(body!==undefined?{'content-type':'application/json',Origin:origin}:{}),
    ...(admin?{Authorization:'Bearer '+secret}:{}),...headers},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  }),envOverride);
  return {status:response.status,json:await response.json()};
 }
 const prefix='/v1/admin/portal/';
 assert.equal((await call(prefix+'summary',undefined,{admin:false})).status,401);
 assert.equal((await call(prefix+'summary')).status,200);
 assert.equal((await call(prefix+'summary',undefined,{headers:{Authorization:'Bearer wrong'}})).status,401);
 assert.equal((await call(prefix+'create',{},{headers:{Origin:'https://evil.example'}})).status,403);
 const install=crypto.randomUUID();
 const body={action:'new',customerName:'Khach hang Thu Nghiem',
  customerEmail:'testing@example.com',installationId:install,licenseId:null,months:1};
 const orderResult=await call(prefix+'create',body);
 assert.equal(orderResult.status,201,JSON.stringify(orderResult));
 const oid=orderResult.json.order.orderId;
 assert.equal(orderResult.json.order.amountVnd,499000);
 assert.equal(orderResult.json.order.status,'pending');
 assert.equal((await call(prefix+'issue',{orderId:oid})).status,409,'Never issue before payment');
 assert.equal((await call(prefix+'confirm-payment',{orderId:oid,paymentRef:'bad'})).status,400);
 const confirmed=await call(prefix+'confirm-payment',{orderId:oid,paymentRef:'BANK-TRANSACTION-001'});
 assert.equal(confirmed.status,200,JSON.stringify(confirmed));
 assert.equal(confirmed.json.order.status,'paid');
 const issued=await call(prefix+'issue',{orderId:oid});
 assert.equal(issued.status,200,JSON.stringify(issued));
 const token=issued.json.token;
 assert(token.startsWith('lhmlic1.'));
 const claims=verifyLicense(token,publicKey);
 assert.equal(claims.installationId,install);
 assert.equal(claims.plan,'starter');
 assert.equal(claims.maxProfiles,5);
 assert.equal(claims.enforcementMode,'owner_sweep');
 assert.equal(claims.version,2);
 const stored=db.sql.prepare('select * from portal_orders where order_id=?').get(oid);
 assert(!JSON.stringify(stored).includes(token),'Token must not be stored in plaintext');
 assert(stored.token_iv&&stored.token_ciphertext,'Token must be sealed using AES-GCM');
 const retried=await call(prefix+'issue',{orderId:oid});
 assert.equal(retried.status,200);assert.equal(retried.json.token,token);
 assert.equal((await call(prefix+'token',{orderId:oid})).json.token,token);
 assert.equal((await call(prefix+'confirm-payment',{orderId:oid,paymentRef:'BANK-TRANSACTION-009'})).status,409);
 const publicNonce=crypto.randomBytes(16).toString('base64url');
 const proof=await call('/v1/verify',{version:1,token,nonce:publicNonce},{admin:false});
 assert.equal(proof.status,200);
 assert.equal(verifyReceipt(proof.json.receipt,{
  publicKey,nonce:publicNonce,licenseId:claims.licenseId,installationId:install,now}).state,'valid');
 const duplicate=await call(prefix+'create',{...body,customerEmail:'another@example.com'});
 assert.equal(duplicate.status,201);
 assert.equal((await call(prefix+'confirm-payment',{orderId:duplicate.json.order.orderId,paymentRef:'BANK-TRANSACTION-001'})).status,409,
  'Cannot reuse one bank reference to confirm multiple orders');
 const renewal=await call(prefix+'create',{...body,action:'renew',licenseId:claims.licenseId,months:3});
 assert.equal(renewal.status,201);
 const rid=renewal.json.order.orderId;
 assert.equal(renewal.json.order.amountVnd,1497000);
 await call(prefix+'confirm-payment',{orderId:rid,paymentRef:'BANK-TRANSACTION-002'});
 const renewed=await call(prefix+'issue',{orderId:rid});
 assert.equal(renewed.status,200,JSON.stringify(renewed));
 const updated=verifyLicense(renewed.json.token,publicKey);
 assert.equal(updated.licenseId,claims.licenseId);
 assert(Date.parse(updated.expiresAt)>Date.parse(claims.expiresAt));
 assert.equal((await call('/v1/verify',{version:1,token,nonce:publicNonce},{admin:false})).status,403,
  'Old token cannot pass D1 enrollment after renewal');
 const newProof=await call('/v1/verify',{version:1,token:renewed.json.token,nonce:publicNonce},{admin:false});
 assert.equal(newProof.status,200);
 assert.equal(verifyReceipt(newProof.json.receipt,{
  publicKey,nonce:publicNonce,licenseId:claims.licenseId,installationId:install,now}).state,'valid');
 const summary=await call(prefix+'summary');
 assert.equal(summary.status,200);
 assert.equal(summary.json.orders.length,3);
 assert.equal(summary.json.counts.issued,2);
 assert.equal(summary.json.paymentAutomatic,false);
 assert(!JSON.stringify(summary.json).includes(token),'Summary must not leak activation tokens');
 const wrongEnc={...env,LHM_ORDER_TOKEN_ENC_KEY_B64:crypto.randomBytes(32).toString('base64')};
 assert.equal((await call(prefix+'token',{orderId:oid},{envOverride:wrongEnc})).status,503,
  'Lost encryption key must fail closed');
 assert.equal((await call('/v1/admin/revocation',{licenseId:claims.licenseId,revoked:true})).status,200);
 assert.equal((await call(prefix+'create',{...body,action:'renew',licenseId:claims.licenseId})).status,409);
 const pagereply=await worker.fetch(new Request(origin+'/'));
 const html=await pagereply.text();
 assert(html.includes('LHM License Center')&&html.includes('Tạo đơn hàng'));
 assert(!html.includes(secret));
 console.log('License commerce portal PASS: auth, orders, bank-payment manual confirmation, signed keys, encrypted D1, renewal, revocation, Windows proof parity');
})().catch(err=>{console.error(err);process.exitCode=1;});
