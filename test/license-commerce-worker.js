'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const {verifyLicense}=require('../src/licensing/manager');
const {verifyReceipt}=require('../src/licensing/receipts');
class D1Fixture{
 constructor(){this.customers=new Map();this.orders=new Map();this.issued=new Map();this.licenses=new Map();}
 prepare(sql){
  const db=this;
  return {bind(...a){
   const st={
    async first(){
     if(sql.startsWith('SELECT 1 AS ready'))return {ready:1};
     if(sql.includes('FROM sales_customers WHERE id')){const r=db.customers.get(a[0]);return r?{...r}:null;}
     if(sql.includes('FROM sales_orders WHERE id')){const r=db.orders.get(a[0]);return r?{...r}:null;}
     if(sql.includes('FROM sales_issued_keys WHERE order_id')){const x=[...db.issued.values()].find(r=>r.orderId===a[0]);return x?{claimsJson:x.claimsJson}:null;}
     if(sql.includes('FROM sales_issued_keys k WHERE k.license_id')){
      const r=db.issued.get(a[0]);return r&&r.customerId===a[1]?{claimsJson:r.claimsJson}:null;
     }
     if(sql.includes('FROM sales_issued_keys WHERE license_id')){
      const r=db.issued.get(a[0]);return r?{claimsJson:r.claimsJson}:null;
     }
     if(sql.includes('FROM licenses WHERE license_id')){
      const x=db.licenses.get(a[0]);return x?{...x}:null;
     }
     throw Error('Unmocked SELECT '+sql);
    },
    async all(){
     if(sql.includes('FROM sales_customers ORDER BY'))return {results:[...db.customers.values()]};
     if(sql.includes('FROM sales_orders o JOIN')){
      return {results:[...db.orders.values()].map(o=>({...o,customerName:db.customers.get(o.customerId).name}))};
     }
     throw Error('Unmocked LIST '+sql);
    },
    async run(){
     if(sql.includes('INSERT INTO sales_customers(')){
      const [id,name,email,createdAt]=a;db.customers.set(id,{id,name,email,createdAt});return {meta:{changes:1}};
     }
     if(sql.includes('INSERT INTO sales_orders')){
      const [id,customerId,kind,priorLicenseId,installationId,plan,months,maxProfiles,featuresJson,amountVnd,createdAt]=a;
      db.orders.set(id,{id,customerId,kind,priorLicenseId,installationId,plan,months,maxProfiles,featuresJson,amountVnd,createdAt,state:'pending',paymentReference:null,paidAt:null,licenseId:null});return {meta:{changes:1}};
     }
     if(sql.includes("SET state='paid'")){
      const [paymentReference,paidAt,_updatedAt,id]=a,order=db.orders.get(id);
      if(!order||order.state!=='pending')return {meta:{changes:0}};
      if([...db.orders.values()].some(r=>r.paymentReference===paymentReference))throw Error('UNIQUE constraint failed');
      Object.assign(order,{state:'paid',paymentReference,paidAt});return {meta:{changes:1}};
     }
     if(sql.includes("SET state='fulfilled'")){
      const [licenseId,_time,id]=a,order=db.orders.get(id);
      if(!order||order.state!=='paid')return {meta:{changes:0}};
      Object.assign(order,{state:'fulfilled',licenseId});return {meta:{changes:1}};
     }
     if(sql.includes('INSERT INTO licenses')&&sql.includes('SELECT')){
      const [licenseId,installationId,expiresAt,updatedAt,orderId,expectedId]=a,order=db.orders.get(orderId);
      if(!order||order.licenseId!==expectedId)return {meta:{changes:0}};
      db.licenses.set(licenseId,{licenseId,installationId,expiresAt,enforcementMode:'owner_sweep',revoked:0,updatedAt});
      return {meta:{changes:1}};
     }
     if(sql.includes('INSERT INTO sales_issued_keys')){
      const [licenseId,orderId,customerId,claimsJson,createdAt,id,expectedId]=a,order=db.orders.get(id);
      if(!order||order.licenseId!==expectedId)return {meta:{changes:0}};
      db.issued.set(licenseId,{licenseId,orderId,customerId,claimsJson,createdAt});
      return {meta:{changes:1}};
     }
     throw Error('Unmocked MUTATION '+sql);
    }
   };
   return st;
  }};
 }
 async batch(stmts){
  // D1 batch runs atomically on Cloudflare; fixture executes in order for
  // deterministic single-operator simulation (not a true concurrency test).
  const results=[];
  for(const p of stmts)results.push(await p.run());
  return results;
 }
}
(async()=>{
 const {createAuthority}=await import(pathToFileURL(path.join(__dirname,'../serverless/license-worker/src/index.mjs')).href);
 const {script}=await import(pathToFileURL(path.join(__dirname,'../serverless/license-worker/src/adminClient.mjs')).href);
 new vm.Script(script,{filename:'admin/app.js'});
 const mainKeys=crypto.generateKeyPairSync('ed25519');
 const pub=mainKeys.publicKey.export({format:'pem',type:'spki'});
 const now=Date.parse('2026-10-24T05:00:00.000Z');
 const db=new D1Fixture(),secret='admin-'+crypto.randomBytes(32).toString('hex');
 const env={LICENSE_DB:db,LHM_LICENSE_ADMIN_TOKEN:secret,
  LHM_ISSUER_PRIVATE_PKCS8_B64:mainKeys.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),
  LHM_ISSUER_PUBLIC_SPKI_B64:mainKeys.publicKey.export({format:'der',type:'spki'}).toString('base64')};
 const worker=createAuthority({clock:()=>now});
 const origin='https://browser.lhmcrm.com';
 async function post(data,valid=true){
  const response=await worker.fetch(new Request(origin+'/v1/admin/commerce',{method:'POST',
   headers:{'content-type':'application/json',authorization:'Bearer '+(valid?secret:'invalid'.repeat(7))},
   body:JSON.stringify(data)}),env);
  return {status:response.status,body:await response.json()};
 }
 const page=await worker.fetch(new Request(origin+'/'),env);
 assert.equal(page.status,200);const html=await page.text();
 assert(html.includes('Quản lý khách hàng')&&html.includes('Xác nhận đã nhận tiền'));
 assert(!html.includes('LHM_LICENSE_ADMIN_TOKEN_VALUE'));
 const js=await worker.fetch(new Request(origin+'/admin/app.js'),env);
 assert.equal(js.status,200);assert((await js.text()).includes('payment.confirm'));
 assert.equal((await worker.fetch(new Request(origin+'/unknown'),env)).status,404);
 assert.equal((await post({action:'customers.list'},false)).status,401,
  'No anonymous customer/finance details');
 const {body:created,status:createdCode}=await post({
  action:'customer.create',name:'Khách A',email:'khach@example.com'});
 assert.equal(createdCode,201);
 const customer=created.customer;
 assert.equal((await post({action:'customers.list'})).body.customers.length,1);
 const installationId=crypto.randomUUID();
 const orderPayload={action:'order.create',customerId:customer.id,kind:'new',priorLicenseId:'',
  installationId,plan:'starter',months:1,maxProfiles:5,features:['profiles'],amountVnd:250000};
 const {body:order,status:orderCode}=await post(orderPayload);
 assert.equal(orderCode,201);assert.equal(order.state,'pending');
 assert.equal(db.licenses.size,0);
 assert.equal((await post({action:'license.issue',orderId:order.orderId})).status,409,
  'Never issue before verified bank settlement');
 assert.equal((await post({action:'license.key',orderId:order.orderId})).status,409);
 assert.equal((await post({action:'payment.confirm',orderId:order.orderId,reference:'BANKTEST100'} ,false)).status,401);
 assert.equal((await post({action:'payment.confirm',orderId:order.orderId,reference:'BANKTEST100'})).status,200);
 assert.equal((await post({action:'payment.confirm',orderId:order.orderId,reference:'BANKTEST100'})).status,409,
  'Repeated payment confirmation must not re-activate');
 const issued=await post({action:'license.issue',orderId:order.orderId});
 assert.equal(issued.status,200);
 const claims=verifyLicense(issued.body.token,pub);
 assert.equal(claims.installationId,installationId);
 assert.equal(claims.plan,'starter');
 assert.equal(db.licenses.size,1);
 assert.equal(JSON.stringify([...db.issued.values()]).includes(issued.body.token),false,
  'DB holds canonical license claims, never bearer activation key');
 const again=await post({action:'license.key',orderId:order.orderId});
 assert.equal(again.body.token,issued.body.token,'Key retrieval must be stable');
 assert.equal((await post({action:'license.issue',orderId:order.orderId})).body.token,issued.body.token,
  'One paid order must not issue a second key');
 const nonce=crypto.randomBytes(16).toString('base64url');
 const verifier=await worker.fetch(new Request(origin+'/v1/verify',{method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({version:1,token:issued.body.token,nonce})}),env);
 assert.equal(verifier.status,200);
 const receipt=await verifier.json();
 assert.equal(verifyReceipt(receipt.receipt,{publicKey:pub,nonce,
  licenseId:claims.licenseId,installationId,now}).state,'valid');
 const {body:renew,status:renewStatus}=await post({
  ...orderPayload,kind:'renew',priorLicenseId:claims.licenseId,months:1,
  amountVnd:200000});
 assert.equal(renewStatus,201);
 assert.equal((await post({action:'license.issue',orderId:renew.orderId})).status,409);
 assert.equal((await post({action:'payment.confirm',orderId:renew.orderId,reference:'BANKTEST200'})).status,200);
 const renewed=await post({action:'license.issue',orderId:renew.orderId});
 assert.equal(renewed.status,200);
 const newClaims=verifyLicense(renewed.body.token,pub);
 assert(new Date(newClaims.expiresAt)>new Date(claims.expiresAt),'Renew extends from previous expiry');
 assert.equal(newClaims.installationId,claims.installationId);
 assert.notEqual(newClaims.licenseId,claims.licenseId);
 const hostile=await post({...orderPayload,customerId:'cus_'+crypto.randomBytes(12).toString('hex')});
 assert.equal(hostile.status,404);
 const other=await post({action:'customer.create',name:'Khách B',email:'b@example.com'});
 const cross=await post({...orderPayload,customerId:other.body.customer.id,kind:'renew',
  priorLicenseId:claims.licenseId});
 assert.equal(cross.status,403,'Cannot renew another customer license');
 const summary=await post({action:'orders.list'});
 assert.equal(summary.status,200);
 assert.equal(summary.body.orders.length,2);
 assert(summary.body.orders.every(o=>!('token' in o)), 'No raw activation token in admin lists');
 console.log('LHM Browser sales D1: protected admin dashboard, customers, manual bank confirmations, unpaid refusal, key issuance/retrieval, Windows signed receipt and renewal PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
