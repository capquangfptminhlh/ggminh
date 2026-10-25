'use strict';
const assert=require('node:assert/strict');
const {runGoogleSaasBillingAdmin,ReviewError}=require('../tools/google-saas-billing-core');
const uuid='11111111-1111-4111-8111-111111111111';
const entry={order_id:uuid,status:'pending',amount_vnd:499000,
 payment_code:'LHMAB1234',expires_at_ms:Date.parse('2026-11-01T00:00:00Z')};
const env={BROWSER_SAAS_ADMIN_TOKEN:'x'.repeat(64),
 BROWSER_SAAS_ADMIN_ORIGIN:'https://browser-staging.lhmcrm.com'};
const now=Date.parse('2026-10-25T11:00:00Z');
let calls=[];
const fetchImpl=async(url,options)=>{
 assert(url.startsWith('https://browser-staging.lhmcrm.com/v2/admin/'));
 assert.equal(options.headers.authorization,'Bearer '+env.BROWSER_SAAS_ADMIN_TOKEN);
 assert.equal(options.redirect,'error');
 calls.push({url,method:options.method,body:options.body});
 return new Response(JSON.stringify(url.endsWith('/orders')?{orders:[entry]}:
  {status:'paid',idempotent:false}),{status:200,headers:{'content-type':'application/json'}});
};
(async()=>{
 const output=[];
 const opts={env,fetchImpl,now,write:x=>output.push(x)};
 let result=await runGoogleSaasBillingAdmin({...opts,args:['list']});
 assert.equal(result.count,1);
 assert.equal(calls.length,1);
 assert(!output.join(' ').includes(env.BROWSER_SAAS_ADMIN_TOKEN));
 await assert.rejects(()=>runGoogleSaasBillingAdmin({...opts,
  args:['approve',uuid,'BANK-REF-1000']}),/BANK_CONFIRMATION_REQUIRED/);
 assert.equal(calls.length,1,'no bank confirmation should cause no API calls');
 await assert.rejects(()=>runGoogleSaasBillingAdmin({...opts,
  env:{...env,BROWSER_SAAS_ADMIN_ORIGIN:'https://browser.lhmcrm.com'},args:['list']}),
  /INVALID_STAGING_ORIGIN/);
 assert.equal(calls.length,1,'never contact production from staging operator');
 result=await runGoogleSaasBillingAdmin({...opts,args:[
  'approve',uuid,'BANK-REF-1000','BANK_STATEMENT_MATCHED']});
 assert.equal(result.status,'paid');
 assert.equal(calls.length,3);
 assert.equal(JSON.parse(calls[2].body).payment_ref,'BANK-REF-1000');
 assert.equal(calls[2].method,'POST');
 assert(!output.join(' ').includes(env.BROWSER_SAAS_ADMIN_TOKEN));
 assert(!output.join(' ').includes('CF_ACCESS_CLIENT_SECRET'));
 await assert.rejects(()=>runGoogleSaasBillingAdmin({...opts,env:{
  ...env,CF_ACCESS_CLIENT_ID:'test-client'},args:['list']}),
  /INCOMPLETE_ACCESS_CREDENTIALS/);
 await assert.rejects(()=>runGoogleSaasBillingAdmin({...opts,
  env:{...env,BROWSER_SAAS_ADMIN_TOKEN:''},args:['list']}),
  /MISSING_STAGING_ADMIN_SECRET/);
 const expired={...entry,expires_at_ms:now-1000};
 let attempted=0;
 await assert.rejects(()=>runGoogleSaasBillingAdmin({...opts,
  fetchImpl:async()=>{attempted++;return new Response(JSON.stringify({orders:[expired]}),{status:200});},
  args:['approve',uuid,'BANK-REF-1000','BANK_STATEMENT_MATCHED']}),/ORDER_NOT_PENDING/);
 assert.equal(attempted,1,'expired order must never trigger write');
 console.log('PASS: merchant staging-only host lock, real bank confirmation gate, bearer secrecy, read-only list, paid activation, expiry and Access credentials');
})().catch(e=>{console.error(e);process.exitCode=1;});
