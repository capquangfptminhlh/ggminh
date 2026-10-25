'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');

(async()=>{
const {createGoogleSaasApi}=await import('../serverless/license-worker/src/googleSaas.mjs');
const {renderGooglePortal,renderGooglePortalScript}=await import('../serverless/license-worker/src/googlePortal.mjs');
const {renderPairPortal,renderPairScript}=await import('../serverless/license-worker/src/googlePairPortal.mjs');
assert.equal(renderPairPortal().status,200);
assert.equal(renderPairScript().status,200);

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
const pairReturn='/v2/desktop/pair/?id=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const pairStart=await invoke('/v2/auth/google/start?return_to='+encodeURIComponent(pairReturn));
assert.equal(pairStart.status,302);
assert(new URL(pairStart.headers.get('Location')).searchParams.has('state'));

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
// Signed pairing protocol: unauthenticated Windows initiation, Google approval,
// one-time verifier claim, grant auth, server 2-seat limit and 72h offline lease.
const issuer=crypto.generateKeyPairSync('ed25519');
env.BROWSER_LEASE_PRIVATE_PKCS8_B64=issuer.privateKey.export({format:'der',type:'pkcs8'}).toString('base64');
env.BROWSER_LEASE_PUBLIC_SPKI_B64=issuer.publicKey.export({format:'der',type:'spki'}).toString('base64');
const {verifyBrowserLease}=require('../src/licensing/googleLease');
async function pair(clientChar,nick){
 const clientHash=clientChar.repeat(64),verifier=crypto.randomBytes(32).toString('base64url');
 const verifierHash=crypto.createHash('sha256').update(verifier).digest('hex');
 let r=await invoke('/v2/desktop/pair/start','POST',
  {client_hash:clientHash,verifier_hash:verifierHash,label:nick});
 assert.equal(r.status,201,'desktop start pairing');
 const ticket=await body(r);
 assert(ticket.approval_url.includes('/v2/desktop/pair/?id='));
 r=await invoke('/v2/desktop/pair/claim','POST',
  {pairing_id:ticket.pairing_id,verifier});
 assert.equal(r.status,409,'claim before Google approval forbidden');
 r=await invoke('/v2/desktop/pair/approve','POST',
  {pairing_id:ticket.pairing_id,comparison_code:ticket.comparison_code});
 assert.equal(r.status,401,'browser approval must have Google session');
 r=await invoke('/v2/desktop/pair/approve','POST',
  {pairing_id:ticket.pairing_id,comparison_code:'111111'===ticket.comparison_code?'222222':'111111'},authHeaders);
 assert.equal(r.status,403,'incorrect comparison code rejected');
 r=await invoke('/v2/desktop/pair/approve','POST',
  {pairing_id:ticket.pairing_id,comparison_code:ticket.comparison_code},authHeaders);
 assert.equal(r.status,200,'authenticated Gmail owner can approve');
 r=await invoke('/v2/desktop/pair/claim','POST',
  {pairing_id:ticket.pairing_id,verifier:'z'.repeat(43)});
 assert.equal(r.status,403,'incorrect verifier rejected');
 r=await invoke('/v2/desktop/pair/claim','POST',{pairing_id:ticket.pairing_id,verifier});
 assert.equal(r.status,200,'one-time claim success');
 const claimed=await body(r);
 assert.equal(claimed.email,'verified@gmail.com','pairing returns Google-verified email');
 const grant=claimed.grant;
 r=await invoke('/v2/desktop/pair/claim','POST',{pairing_id:ticket.pairing_id,verifier});
 assert.equal(r.status,409,'claimed pairing cannot replay');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM desktop_grants_v2 WHERE customer_id=?').get(session.customer_id).n>=1,true);
 return {grant,clientHash,nick};
}
const devices=[];
for(const [ch,nick] of [['a','PC one'],['b','PC two'],['c','PC three']]){
 devices.push(await pair(ch,nick));
}
const auth=d=>({authorization:'Bearer '+d.grant});
result=await invoke('/v2/seats/attach','POST',{label:devices[0].nick},auth(devices[0]));
assert.equal(result.status,200);
const seat1=(await body(result)).seat_id;
result=await invoke('/v2/seats/attach','POST',{label:devices[1].nick},auth(devices[1]));
assert.equal(result.status,200);
const seat2=(await body(result)).seat_id;
result=await invoke('/v2/seats/list','POST',{},auth(devices[2]));
assert.equal(result.status,200);
assert.equal((await body(result)).devices.length,2,'desktop sees explicit takeover choices');
result=await invoke('/v2/seats/attach','POST',{label:devices[2].nick},auth(devices[2]));
assert.equal(result.status,409,'third simultaneous device forbidden');
assert.equal((await body(result)).error,'SEAT_LIMIT');
result=await invoke('/v2/devices','GET',null,{cookie:sessionCookie});
assert.equal((await body(result)).devices.length,2);
result=await invoke('/v2/leases/issue','POST',{seat_id:seat1},auth(devices[0]));
assert.equal(result.status,200,'valid paid seat receives Ed25519 lease');
const signed=(await body(result)).lease;
const verified=verifyBrowserLease(signed,{
 publicKey:issuer.publicKey,
 expectedCustomerId:session.customer_id,
 expectedClientHash:devices[0].clientHash,now});
assert.equal(verified.product_code,'ads-browser');
assert.equal(verified.seat_limit,2);
assert.equal(verified.remaining_ms,72*3600000);
result=await invoke('/v2/seats/takeover','POST',
 {replace_seat_id:seat1,confirmation:'wrong',label:'PC three'},auth(devices[2]));
assert.equal(result.status,400,'explicit takeover confirmation required');
result=await invoke('/v2/seats/takeover','POST',
 {replace_seat_id:seat1,confirmation:'REPLACE',label:'PC three'},auth(devices[2]));
assert.equal(result.status,200,'explicit takeover replaces chosen PC');
const seat3=(await body(result)).seat_id;
result=await invoke('/v2/seats/heartbeat','POST',{seat_id:seat1},auth(devices[0]));
assert.equal(result.status,409,'evicted device cannot renew its old server seat');
result=await invoke('/v2/leases/issue','POST',{seat_id:seat1},auth(devices[0]));
assert.equal(result.status,409,'evicted device cannot obtain new signed lease');
result=await invoke('/v2/seats/heartbeat','POST',{seat_id:seat2},auth(devices[1]));
assert.equal(result.status,200);
result=await invoke('/v2/seats/heartbeat','POST',{seat_id:seat3},auth(devices[2]));
assert.equal(result.status,200);
result=await invoke('/v2/leases/issue','POST',{seat_id:seat3},
 {authorization:'Bearer bg1_'+'x'.repeat(43)});
assert.equal(result.status,401,'unauthenticated desktop cannot issue lease');
assert.throws(()=>verifyBrowserLease(signed,{
 publicKey:issuer.publicKey,expectedCustomerId:session.customer_id,
 expectedClientHash:devices[0].clientHash,now:now+72*3600000}),/expired/);
db.prepare("UPDATE entitlements_v2 SET revoked=1 WHERE customer_id=?").run(session.customer_id);
result=await invoke('/v2/leases/issue','POST',{seat_id:seat3},auth(devices[2]));
assert.equal(result.status,402,'revoked paid entitlement rejects new lease');

// Revocation is allowed even after the entitlement expires or is revoked.
// A signed-offline lease already granted remains bounded by its old expiry.
result=await invoke('/v2/devices/revoke','POST',
 {seat_id:seat3,confirmation:'REVOKE'},authHeaders);
assert.equal(result.status,200,'Google owner can revoke device despite expired entitlement');
assert.equal((await body(result)).status,'revoked');
result=await invoke('/v2/seats/heartbeat','POST',{seat_id:seat3},auth(devices[2]));
assert.equal(result.status,401,'owner-revoked grant must not heartbeat');
result=await invoke('/v2/devices/revoke','POST',
 {seat_id:seat2,confirmation:'REVOKE'},{cookie:sessionCookie,origin,'x-csrf-token':'invalid'});
assert.equal(result.status,403,'device revocation requires CSRF token');
result=await invoke('/v2/desktop/grant/revoke','POST',
 {confirmation:'REVOKE'},auth(devices[1]));
assert.equal(result.status,200,'unpaid desktop can securely revoke its own grant');
result=await invoke('/v2/seats/heartbeat','POST',{seat_id:seat2},auth(devices[1]));
assert.equal(result.status,401,'revoked desktop grant cannot heartbeat');
result=await invoke('/v2/desktop/grant/revoke','POST',
 {confirmation:'REVOKE'},auth(devices[1]));
assert.equal(result.status,401,'desktop grant revoke cannot be replayed');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_events_v2 WHERE action IN ('device_revoked','grant_revoked')").get().n,2);

// Full in-process desktop ↔ real SaaS Worker contract with D1 SQLite and
// Google-session approval. No mocked pairing/seat/lease API responses.
db.prepare("UPDATE entitlements_v2 SET revoked=0 WHERE customer_id=?")
  .run(session.customer_id);
const os=require('node:os'),path=require('node:path');
const {GoogleBrowserDesktopClient}=require('../src/licensing/googleDesktopClient');
const tenantTmp=fs.mkdtempSync(path.join(os.tmpdir(),'ggminh-e2e-'));
const fakeDPAPI={
 isEncryptionAvailable:()=>true,
 encryptString:value=>Buffer.from('DPAPI-TEST:'+Buffer.from(value).toString('base64')),
 decryptString:value=>{
  const text=value.toString('utf8');
  if(!text.startsWith('DPAPI-TEST:'))throw Error('DPAPI fixture mismatch');
  return Buffer.from(text.slice('DPAPI-TEST:'.length),'base64').toString('utf8');
 }
};
try{
 const forward=(url,init)=>api(new Request(url,init),env,{adminAuth});
 const customerDesktop=new GoogleBrowserDesktopClient({
  root:tenantTmp,safeStorage:fakeDPAPI,apiOrigin:origin,
  publicKey:issuer.publicKey,fetchImpl:forward,clock:()=>now
 });
 const begin=await customerDesktop.startPair({label:'Integrated Windows device'});
 const id=new URL(begin.approvalUrl).searchParams.get('id');
 let confirmation=await invoke('/v2/desktop/pair/approve','POST',
  {pairing_id:id,comparison_code:begin.comparisonCode},authHeaders);
 assert.equal(confirmation.status,200,'Google session authorizes live desktop pairing');
 const identity=await customerDesktop.claimPair();
 assert.equal(identity.customerId,session.customer_id);
 assert.equal(identity.email,'verified@gmail.com');
 assert.equal(customerDesktop.status().allowed,false,'Gmail alone is not an entitlement');
 await customerDesktop.attach({label:'Integrated Windows device'});
 assert.equal(customerDesktop.status().allowed,false,'server seat alone is not a signed lease');
 const lease=await customerDesktop.refreshLease();
 assert.equal(lease.maxProfiles,100);
 assert.equal(customerDesktop.status().allowed,true,'signed SaaS Worker lease unlocks local profile');
 const grantBeforeLogout=customerDesktop.state.grant;
 assert.equal((await customerDesktop.logout()).revoked,true);
 assert.equal(customerDesktop.status().allowed,false,'logout blocks future launches');
 const revokeResult=await invoke('/v2/seats/list','POST',{},
  {authorization:'Bearer '+grantBeforeLogout});
 assert.equal(revokeResult.status,401,'server rejects retired Windows grant');
}finally{fs.rmSync(tenantTmp,{recursive:true,force:true});}

db.close();
console.log('PASS: staging migration, default-off flag, Google OIDC PKCE/state, cookie session, CSRF, unapproved plan lock, 499k VietQR, manual/idempotent approval, no duplicate renewal, one-time pairing, 2-seat takeover, signed 72h lease, Gmail seat revocation and server-acknowledged desktop logout, end-to-end desktop ↔ D1 Worker payment/license activation');
})().catch(e=>{console.error(e);process.exitCode=1;});
