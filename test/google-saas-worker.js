'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');

(async()=>{
const {createGoogleSaasApi}=await import('../serverless/license-worker/src/googleSaas.mjs');
const {renderGooglePortal,renderGooglePortalScript}=await import('../serverless/license-worker/src/googlePortal.mjs');
const page=renderGooglePortal();
assert.equal(page.status,200);
assert(page.headers.get('content-security-policy').includes("script-src 'self'"));
assert((await page.text()).includes('/v2/portal.js'));
assert.equal(renderGooglePortalScript().status,200);
const sql=fs.readFileSync('serverless/license-worker/migrations/0003_google_saas_staging.sql','utf8');
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync('serverless/license-worker/migrations/0001_licenses.sql','utf8'));
db.exec(fs.readFileSync('serverless/license-worker/migrations/0002_billing_portal.sql','utf8'));
db.exec(sql);
assert(db.prepare("SELECT name FROM sqlite_master WHERE name='licenses'").get());
assert(db.prepare("SELECT name FROM sqlite_master WHERE name='portal_orders'").get());
const prepare=sql=>({
  query:sql,args:[],
  bind(...args){this.args=args;return this;},
  run(){const r=db.prepare(this.query).run(...this.args);return {meta:{changes:r.changes}};},
  first(){return db.prepare(this.query).get(...this.args)||null;},
  all(){return {results:db.prepare(this.query).all(...this.args)};}
});
const d1={prepare,async batch(statements){
  db.exec('BEGIN IMMEDIATE');
  try{const results=statements.map(x=>x.run());db.exec('COMMIT');return results;}
  catch(e){db.exec('ROLLBACK');throw e;}
}};
const origin='https://browser.lhmcrm.com';
const env={BROWSER_SAAS_STAGING:'enabled',BROWSER_SAAS_DB:d1,
 BROWSER_SESSION_SECRET:'staging-long-random-session-secret-must-never-be-in-repo-or-production',
 BROWSER_GOOGLE_CLIENT_ID:'browser.apps.googleusercontent.com',
 BROWSER_GOOGLE_CLIENT_SECRET:'staging-test-client-secret',
 BROWSER_GOOGLE_REDIRECT_URI:origin+'/v2/auth/google/callback',
 BROWSER_BANK_BIN:'970436',BROWSER_BANK_ACCOUNT_NO:'123456789012',
 BROWSER_BANK_ACCOUNT_NAME:'LHM STAGING TEST'};
let now=Date.parse('2026-10-25T10:00:00.000Z');
const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=rsa.publicKey.export({format:'jwk'});
Object.assign(jwk,{kid:'test-google-key',alg:'RS256',use:'sig'});
let nonce=null;
const jwt=()=>{
  const head=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid})).toString('base64url');
  const claim=Buffer.from(JSON.stringify({iss:'https://accounts.google.com',
    aud:env.BROWSER_GOOGLE_CLIENT_ID,sub:'123456789012345678901',
    email:'verified@gmail.com',email_verified:true,
    nonce,iat:Math.floor(now/1000)-10,exp:Math.floor(now/1000)+600}))
    .toString('base64url');
  const signed=head+'.'+claim;
  return signed+'.'+crypto.sign('sha256',Buffer.from(signed),rsa.privateKey).toString('base64url');
};
const fetcher=async url=>{
  if(url==='https://oauth2.googleapis.com/token')return new Response(JSON.stringify({id_token:jwt()}),{status:200});
  if(url==='https://www.googleapis.com/oauth2/v3/certs')
    return new Response(JSON.stringify({keys:[jwk]}),{status:200});
  throw Error('unrecognized external provider URL: '+url);
};
const api=createGoogleSaasApi({clock:()=>now,fetcher});
const adminAuth=async r=>r.headers.get('authorization')==='Bearer verified-admin';
const request=(path,method='GET',data=null,headers={})=>
  new Request(origin+path,{method,headers:{...(data?{'content-type':'application/json'}:{}),
    ...headers},body:data?JSON.stringify(data):undefined});
const invoke=(path,method,data,headers,appEnv=env)=>
  api(request(path,method,data,headers),appEnv,{adminAuth});
const body=async response=>response.json();
const getCookie=(response,name)=>{
  const item=response.headers.getSetCookie().find(x=>x.startsWith(name+'='));
  assert(item,'missing cookie '+name);
  return item.split(';')[0];
};
let result=await invoke('/v2/plans');
assert.equal(result.status,200);
assert.deepEqual((await body(result)).plans,[],'unapproved plan must not sell');
result=await invoke('/v2/auth/google/start','GET',null,{},{
 ...env,BROWSER_SAAS_STAGING:'disabled'});
assert.equal(result.status,404,'new API must be OFF unless explicitly enabled');
result=await invoke('/v2/auth/google/start');
assert.equal(result.status,302);
const target=new URL(result.headers.get('Location'));
assert.equal(target.host,'accounts.google.com');
assert.equal(target.searchParams.get('code_challenge_method'),'S256');
nonce=target.searchParams.get('nonce');
const oauthCookie=getCookie(result,'__Host-lhm-browser-oauth');
result=await invoke('/v2/auth/google/callback?state=wrong&code=mock-code','GET',null,
 {cookie:oauthCookie});
assert.equal(result.status,401,'OAuth state mismatch must reject');
result=await invoke('/v2/auth/google/callback?state='+
 encodeURIComponent(target.searchParams.get('state'))+'&code=mock-code','GET',null,
 {cookie:oauthCookie});
assert.equal(result.status,302,'signed Google token must authenticate');
assert.equal(result.headers.get('Location'),'/v2/portal');
const sessionCookie=getCookie(result,'__Host-lhm-browser-session');
result=await invoke('/v2/auth/session','GET',null,{cookie:sessionCookie});
assert.equal(result.status,200);
const session=await body(result);
assert.equal(session.email,'verified@gmail.com');
assert.equal(session.entitlement,null);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customers_v2').get().n,1);
const authHeaders={cookie:sessionCookie,origin,'x-csrf-token':session.csrf};
result=await invoke('/v2/orders','POST',{plan_code:'personal_30'},authHeaders);
assert.equal(result.status,409,'owner must approve a profile cap before selling');
db.prepare("UPDATE plans_v2 SET max_profiles=100,enabled=1 WHERE plan_code='personal_30'").run();
result=await invoke('/v2/plans');
assert.equal((await body(result)).plans[0].price_vnd,499000);
result=await invoke('/v2/orders','POST',{plan_code:'personal_30'},
 {cookie:sessionCookie,origin,'x-csrf-token':'invalid'});
assert.equal(result.status,403,'CSRF protection required');
result=await invoke('/v2/orders','POST',{plan_code:'personal_30'},authHeaders);
assert.equal(result.status,201);
const first=(await body(result)).order;
assert.equal(first.amount_vnd,499000);
assert(first.qr_url.includes('amount=499000'));
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM entitlements_v2").get().n,0,
 'order alone must not activate');
result=await invoke('/v2/admin/activate','POST',
 {order_id:first.order_id,payment_ref:'BANK-REF-1234'});
assert.equal(result.status,401);
result=await invoke('/v2/admin/activate','POST',
 {order_id:first.order_id,payment_ref:'BANK-REF-1234'},
 {authorization:'Bearer verified-admin'});
assert.equal(result.status,200,'manual verified payment should activate');
const expiry=db.prepare("SELECT expires_at_ms FROM entitlements_v2").get().expires_at_ms;
assert.equal(expiry,now+30*86400000);
result=await invoke('/v2/admin/activate','POST',
 {order_id:first.order_id,payment_ref:'BANK-REF-1234'},
 {authorization:'Bearer verified-admin'});
assert.equal(result.status,200);
assert.equal((await body(result)).idempotent,true);
assert.equal(db.prepare("SELECT expires_at_ms FROM entitlements_v2").get().expires_at_ms,expiry);
result=await invoke('/v2/admin/activate','POST',
 {order_id:first.order_id,payment_ref:'FAKE-REF-2222'},
 {authorization:'Bearer verified-admin'});
assert.equal(result.status,409);
result=await invoke('/v2/auth/session','GET',null,{cookie:sessionCookie});
assert.equal((await body(result)).entitlement.seat_limit,2);
now+=1000;
result=await invoke('/v2/orders','POST',{plan_code:'personal_30'},authHeaders);
const second=(await body(result)).order;
result=await invoke('/v2/admin/activate','POST',
 {order_id:second.order_id,payment_ref:'BANK-REF-5678'},
 {authorization:'Bearer verified-admin'});
assert.equal(result.status,200);
assert.equal(db.prepare("SELECT expires_at_ms FROM entitlements_v2").get().expires_at_ms,
 expiry+30*86400000,'renewal must extend exactly once');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM payment_reviews_v2").get().n,2);
db.close();
console.log('PASS: staging migration, default-off flag, Google OIDC PKCE/state, cookie session, CSRF, unapproved plan lock, 499k VietQR, manual/idempotent approval, no duplicate renewal');
})().catch(e=>{console.error(e);process.exitCode=1;});
