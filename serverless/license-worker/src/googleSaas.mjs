import { createGoogleDeviceApi,isGoogleLeaseIssuerConfigured,googleLeasePublicFingerprint } from './googleDevice.mjs';
/* Google-only Browser commerce API, staging only. No profile/proxy/Ads data leaves Electron.
 * The v1 licensing authority remains independent. Never silently enable this route.
 */
const enc = new TextEncoder();
const PRODUCT = 'ads-browser';
const DAY = 86400000;
const SESSION = '__Host-lhm-browser-session';
const OAUTH = '__Host-lhm-browser-oauth';
const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const UUID = /^[0-9a-f-]{36}$/i;
const CODE = /^[a-z0-9_-]{3,60}$/;
function respond(status, value, extra={}) {
  return new Response(JSON.stringify(value), {status,headers:{...JSON_HEADERS,...extra}});
}
function error(status, code){return respond(status,{error:code});}
function encode(bytes) {
  let s='';for(const byte of bytes)s+=String.fromCharCode(byte);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode(value) {
  if(typeof value!=='string'||value.length>8000||!/^[A-Za-z0-9_-]+$/.test(value))
    throw Error('invalid_token');
  const normal=value.replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(normal+'='.repeat((4-normal.length%4)%4));
  const bytes=Uint8Array.from(raw,ch=>ch.charCodeAt(0));
  if(encode(bytes)!==value)throw Error('invalid_token');
  return bytes;
}
function rand(n=32){const b=new Uint8Array(n);crypto.getRandomValues(b);return encode(b);}
function sha(value){return crypto.subtle.digest('SHA-256',enc.encode(value));}
function cookie(req,name){
  const found=(req.headers.get('cookie')||'').split(';').map(x=>x.trim())
    .find(x=>x.startsWith(name+'='));
  return found?found.slice(name.length+1):null;
}
function setCookie(name,value,age){
  return name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+age;
}
function secrets(env) {
  if(typeof env.BROWSER_SESSION_SECRET!=='string'||env.BROWSER_SESSION_SECRET.length<32)
    throw Error('session_secret_missing');
  return env.BROWSER_SESSION_SECRET;
}
async function hmac(env,bytes,sign=false,signature=null) {
  const key=await crypto.subtle.importKey('raw',enc.encode(secrets(env)),
    {name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  return sign?new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes)):
    crypto.subtle.verify('HMAC',key,signature,bytes);
}
async function seal(env,kind,claims){
  const body=encode(enc.encode(JSON.stringify({kind,...claims})));
  return body+'.'+encode(await hmac(env,enc.encode(body),true));
}
async function unseal(env,kind,value,now){
  if(typeof value!=='string'||value.length>6000)return null;
  const parts=value.split('.');
  if(parts.length!==2)return null;
  try{
    if(!await hmac(env,enc.encode(parts[0]),false,decode(parts[1])))return null;
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(parts[0])));
    if(data.kind!==kind||!Number.isSafeInteger(data.exp)||now>=data.exp)return null;
    return data;
  }catch(_){return null;}
}
async function bodyJson(req) {
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))
    throw Error('json_required');
  const value=await req.text();
  if(value.length>4096)throw Error('request_too_large');
  const parsed=JSON.parse(value);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('invalid_body');
  return parsed;
}
function database(env){
  if(!env.BROWSER_SAAS_DB||typeof env.BROWSER_SAAS_DB.prepare!=='function')
    throw Error('browser_d1_missing');
  return env.BROWSER_SAAS_DB;
}
function bank(env) {
  if(!/^\d{6}$/.test(env.BROWSER_BANK_BIN||'')||
     !/^\d{6,20}$/.test(env.BROWSER_BANK_ACCOUNT_NO||'')||
     typeof env.BROWSER_BANK_ACCOUNT_NAME!=='string'||
     !/^[\p{L}\p{M} .'-]{3,100}$/u.test(env.BROWSER_BANK_ACCOUNT_NAME))
    throw Error('bank_not_configured');
  return {bin:env.BROWSER_BANK_BIN,account:env.BROWSER_BANK_ACCOUNT_NO,
    name:env.BROWSER_BANK_ACCOUNT_NAME};
}
function requireOrigin(req,url){
  return req.headers.get('origin')===url.origin;
}
async function identity(req,env,now) {
  const current=await unseal(env,'session',cookie(req,SESSION),now);
  if(!current||!UUID.test(current.customer_id||'')||
     !/^\d{8,30}$/.test(current.sub||'')||
     typeof current.csrf!=='string')return null;
  const row=await database(env).prepare(
    'SELECT customer_id,email,status FROM customers_v2 WHERE customer_id=? AND google_sub=?')
    .bind(current.customer_id,current.sub).first();
  return row&&row.status==='active'?{...row,csrf:current.csrf}:null;
}
function authorizedPost(req,url,user) {
  return requireOrigin(req,url)&&req.headers.get('x-csrf-token')===user.csrf;
}
function callbackUrl(env,url){
  const uri=env.BROWSER_GOOGLE_REDIRECT_URI;
  if(typeof uri!=='string'||uri!==url.origin+'/v2/auth/google/callback')
    throw Error('redirect_mismatch');
  return uri;
}
function googleConfig(env,url) {
  const client=env.BROWSER_GOOGLE_CLIENT_ID,secret=env.BROWSER_GOOGLE_CLIENT_SECRET;
  if(typeof client!=='string'||!client.endsWith('.apps.googleusercontent.com')||
     typeof secret!=='string'||secret.length<16)
    throw Error('google_oauth_missing');
  return {client,secret,redirect:callbackUrl(env,url)};
}
async function verifyGoogleIdToken(jwt,client,nonce,now,fetcher){
  if(typeof jwt!=='string'||jwt.length>12000)throw Error('invalid_google_identity');
  const parts=jwt.split('.');
  if(parts.length!==3)throw Error('invalid_google_identity');
  let header,claims;
  try{
    header=JSON.parse(new TextDecoder().decode(decode(parts[0])));
    claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  }catch(_){throw Error('invalid_google_identity');}
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>160||
     claims.iss!=='https://accounts.google.com'&&claims.iss!=='accounts.google.com'||
     claims.aud!==client||claims.azp&&claims.azp!==client||
     claims.nonce!==nonce||claims.email_verified!==true||
     !/^\d{8,30}$/.test(claims.sub||'')||
     typeof claims.email!=='string'||claims.email.length>254||
     !Number.isSafeInteger(claims.exp)||claims.exp*1000<=now||
     !Number.isSafeInteger(claims.iat)||claims.iat*1000>now+60000)
    throw Error('invalid_google_identity');
  const jwksResponse=await fetcher('https://www.googleapis.com/oauth2/v3/certs');
  if(!jwksResponse.ok)throw Error('google_keys_unavailable');
  const jwks=await jwksResponse.json();
  const jwk=Array.isArray(jwks.keys)?jwks.keys.find(key=>
    key.kid===header.kid&&key.kty==='RSA'&&key.alg==='RS256'&&key.use==='sig'):null;
  if(!jwk)throw Error('invalid_google_identity');
  const publicKey=await crypto.subtle.importKey('jwk',jwk,
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,
    decode(parts[2]),enc.encode(parts[0]+'.'+parts[1])))
    throw Error('invalid_google_identity');
  return {sub:claims.sub,email:claims.email.trim().toLowerCase(),
    name:typeof claims.name==='string'?claims.name.slice(0,100):null};
}
function orderView(row,env){
  const b=bank(env);
  const amount=Number(row.amount_vnd);
  const url='https://img.vietqr.io/image/'+b.bin+'-'+b.account+
    '-compact2.png?amount='+amount+'&addInfo='+encodeURIComponent(row.payment_code)+
    '&accountName='+encodeURIComponent(b.name);
  return {order_id:row.order_id,plan_code:row.plan_code,status:row.status,
    amount_vnd:amount,payment_code:row.payment_code,expires_at_ms:row.expires_at_ms,
    qr_url:url,bank_bin:b.bin,bank_account:b.account,bank_name:b.name};
}
export function createGoogleSaasApi({clock=()=>Date.now(),fetcher=fetch}={}){
  return async function handle(req,env,{adminAuth=async()=>false}={}){
    const url=new URL(req.url),path=url.pathname,now=clock();
    if(!path.startsWith('/v2/'))return null;
    if(env.BROWSER_SAAS_STAGING!=='enabled')return error(404,'not_found');
    if(!Number.isSafeInteger(now)||now<0)return error(503,'clock_invalid');
    try{
      const db=database(env);
      if(path==='/v2/desktop/pair/start'||path==='/v2/desktop/pair/approve'||
         path==='/v2/desktop/pair/claim'||path==='/v2/devices'||
         path==='/v2/devices/revoke'||path==='/v2/desktop/grant/revoke'||
         path.startsWith('/v2/seats/')||path==='/v2/leases/issue')
        return createGoogleDeviceApi({clock})(req,env,{db,
          getUser:()=>identity(req,env,now),checkCsrf:u=>authorizedPost(req,url,u)});
      if(path==='/v2/plans'&&req.method==='GET'){
        const rows=await db.prepare(
          "SELECT plan_code,label,price_vnd,duration_days,seat_limit,max_profiles,features_json FROM plans_v2 WHERE product_code='ads-browser' AND enabled=1 AND max_profiles IS NOT NULL ORDER BY price_vnd")
          .all();
        return respond(200,{product_code:PRODUCT,plans:(rows.results||[]).map(p=>({
          plan_code:p.plan_code,label:p.label,price_vnd:p.price_vnd,
          duration_days:p.duration_days,seat_limit:p.seat_limit,
          max_profiles:p.max_profiles,features:JSON.parse(p.features_json)
        }))});
      }
      if(path==='/v2/auth/google/start'&&req.method==='GET'){
        const config=googleConfig(env,url),verifier=rand(32),state=rand(24),nonce=rand(24);
        const challenge=encode(new Uint8Array(await sha(verifier)));
        const requestedReturn=url.searchParams.get('return_to');
        const returnTo=typeof requestedReturn==='string'&&
          /^\/v2\/desktop\/pair\/\?id=[0-9a-f-]{36}$/i.test(requestedReturn)
          ?requestedReturn:'/v2/portal';
        const ticket=await seal(env,'oauth',{verifier,state,nonce,returnTo,exp:now+600000});
        const destination=new URL('https://accounts.google.com/o/oauth2/v2/auth');
        for(const [k,v] of Object.entries({client_id:config.client,redirect_uri:config.redirect,
          response_type:'code',scope:'openid email profile',code_challenge:challenge,
          code_challenge_method:'S256',state,nonce,prompt:'select_account'}))
          destination.searchParams.set(k,v);
        return new Response(null,{status:302,headers:{
          Location:destination.toString(),'Set-Cookie':setCookie(OAUTH,ticket,600),
          'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
      }
      if(path==='/v2/auth/google/callback'&&req.method==='GET'){
        const config=googleConfig(env,url),ticket=await unseal(env,'oauth',cookie(req,OAUTH),now);
        const clean=setCookie(OAUTH,'',0);
        if(!ticket||url.searchParams.get('state')!==ticket.state||
           !/^[\x21-\x7E]{1,3000}$/.test(url.searchParams.get('code')||''))
          return error(401,'oauth_state_invalid');
        const tokenResp=await fetcher('https://oauth2.googleapis.com/token',{
          method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
          body:new URLSearchParams({code:url.searchParams.get('code'),client_id:config.client,
            client_secret:config.secret,redirect_uri:config.redirect,
            grant_type:'authorization_code',code_verifier:ticket.verifier})
        });
        if(!tokenResp.ok)return error(401,'google_code_rejected');
        const tokens=await tokenResp.json();
        const google=await verifyGoogleIdToken(tokens.id_token,config.client,ticket.nonce,now,fetcher);
        await db.prepare('INSERT INTO customers_v2 (customer_id,google_sub,email,display_name,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at_ms=excluded.updated_at_ms')
          .bind(crypto.randomUUID(),google.sub,google.email,google.name,now,now).run();
        const person=await db.prepare('SELECT customer_id,status FROM customers_v2 WHERE google_sub=?')
          .bind(google.sub).first();
        if(!person||person.status!=='active')return error(403,'ACCOUNT_BLOCKED');
        const session=await seal(env,'session',{customer_id:person.customer_id,
          sub:google.sub,csrf:rand(24),exp:now+7*DAY});
        const headers=new Headers({'Location':ticket.returnTo||'/v2/portal','Cache-Control':'no-store',
          'Referrer-Policy':'no-referrer'});
        headers.append('Set-Cookie',clean);
        headers.append('Set-Cookie',setCookie(SESSION,session,7*86400));
        return new Response(null,{status:302,headers});
      }
      if(path.startsWith('/v2/admin/')){
        if(!await adminAuth(req,env))return error(401,'unauthorized');
        if(path==='/v2/admin/readiness'&&req.method==='GET'){
         // Never return credential contents, bank numbers, Google client IDs,
         // database names or customer details. A privileged operator sees
         // only which production gates are ready for activation.
         const names=['customers_v2','plans_v2','orders_v2','entitlements_v2',
           'license_seats_v2','desktop_pairings_v2','desktop_grants_v2',
           'desktop_pair_limits_v2','payment_reviews_v2','audit_events_v2'];
         const found=await db.prepare(
           "SELECT name FROM sqlite_master WHERE type='table' AND name IN ("+
              names.map(()=>'?').join(',')+")").bind(...names).all();
         const schema=names.every(name=>(found.results||[]).some(t=>t.name===name));
         let oauth=false,payments=false;
         try{googleConfig(env,url);oauth=true;}catch(_){/* missing or mismatched redirect */}
         try{bank(env);payments=true;}catch(_){/* staging bank config missing */}
         const issuer=await isGoogleLeaseIssuerConfigured(env);
         const secureSession=typeof env.BROWSER_SESSION_SECRET==='string'&&
           env.BROWSER_SESSION_SECRET.length>=32;
         const plan=await db.prepare(
           "SELECT enabled,max_profiles,seat_limit,price_vnd,duration_days,features_json FROM plans_v2 WHERE plan_code='personal_30'")
           .first();
         const approvedPlan=!!plan&&plan.enabled===1&&
           Number.isSafeInteger(plan.max_profiles)&&plan.max_profiles>0&&
           plan.seat_limit===2&&plan.price_vnd===499000&&plan.duration_days===30&&
           plan.features_json==='["api","automation","profiles"]';
         const checks={d1_schema:schema,google_oidc:oauth,bank_transfer:payments,
           ed25519_issuer:issuer,session_secret:secureSession,
           owner_approved_pilot_plan:approvedPlan};
         return respond(200,{product_code:PRODUCT,checks,
           issuer_public_spki_sha256:issuer?await googleLeasePublicFingerprint(env):null,
           customer_registration_ready:Object.values(checks).every(Boolean),
           note:'Readiness checks configuration and D1 only; real Google OAuth, bank payment, Windows DPAPI and Cloudflare Access need independent acceptance.'});
       }
       if(path==='/v2/admin/orders'&&req.method==='GET'){
          const rows=await db.prepare(
            "SELECT order_id,plan_code,amount_vnd,payment_code,status,created_at_ms,expires_at_ms FROM orders_v2 ORDER BY created_at_ms DESC LIMIT 100").all();
          return respond(200,{orders:rows.results||[]});
        }
        if(path==='/v2/admin/activate'&&req.method==='POST'){
          const input=await bodyJson(req);
          if(!UUID.test(input.order_id||'')||
             typeof input.payment_ref!=='string'||
             !/^[A-Za-z0-9_.:/-]{6,100}$/.test(input.payment_ref))
            return error(400,'invalid_payment_review');
          const order=await db.prepare('SELECT * FROM orders_v2 WHERE order_id=?')
            .bind(input.order_id).first();
          if(!order)return error(404,'order_missing');
          if(order.status==='paid')
            return order.payment_ref===input.payment_ref?
              respond(200,{status:'paid',idempotent:true}):error(409,'payment_reference_conflict');
          if(order.status!=='pending'||order.expires_at_ms<=now)
            return error(409,'order_not_pending');
          const nonce=crypto.randomUUID(),review=crypto.randomUUID();
          const changes=await db.batch([
            db.prepare("UPDATE orders_v2 SET status='paid',payment_ref=?,approval_nonce=?,approved_at_ms=?,approved_by='admin' WHERE order_id=? AND status='pending' AND expires_at_ms>?")
              .bind(input.payment_ref,nonce,now,input.order_id,now),
            db.prepare("INSERT INTO entitlements_v2 (customer_id,product_code,plan_code,max_profiles,seat_limit,features_json,activated_at_ms,expires_at_ms,revoked) SELECT customer_id,product_code,plan_code,max_profiles,seat_limit,features_json,?,?+duration_days*86400000,0 FROM orders_v2 WHERE order_id=? AND approval_nonce=? AND status='paid' ON CONFLICT(customer_id,product_code) DO UPDATE SET plan_code=excluded.plan_code,max_profiles=excluded.max_profiles,seat_limit=excluded.seat_limit,features_json=excluded.features_json,expires_at_ms=MAX(entitlements_v2.expires_at_ms,excluded.activated_at_ms)+(excluded.expires_at_ms-excluded.activated_at_ms),revoked=0")
              .bind(now,now,input.order_id,nonce),
            db.prepare("INSERT INTO payment_reviews_v2 (review_id,order_id,payment_ref,reviewed_by,reviewed_at_ms) SELECT ?,order_id,?,'admin',? FROM orders_v2 WHERE order_id=? AND approval_nonce=?")
              .bind(review,input.payment_ref,now,input.order_id,nonce),
            db.prepare("INSERT INTO audit_events_v2 (event_id,actor,action,object_id,created_at_ms) SELECT ?,'admin','payment_approved',order_id,? FROM orders_v2 WHERE order_id=? AND approval_nonce=?")
              .bind(crypto.randomUUID(),now,input.order_id,nonce)
          ]);
          if(!Number(changes[0]?.meta?.changes))return error(409,'order_conflict');
          return respond(200,{status:'paid',idempotent:false});
        }
        return error(404,'not_found');
      }
      const user=await identity(req,env,now);
      if(!user)return error(401,'SIGNIN_REQUIRED');
      if(path==='/v2/auth/session'&&req.method==='GET'){
        const entitlement=await db.prepare(
          "SELECT plan_code,seat_limit,max_profiles,expires_at_ms,revoked FROM entitlements_v2 WHERE customer_id=? AND product_code='ads-browser'")
          .bind(user.customer_id).first();
        return respond(200,{customer_id:user.customer_id,email:user.email,csrf:user.csrf,
          product_code:PRODUCT,entitlement:entitlement&&entitlement.expires_at_ms>now&&
          !entitlement.revoked?entitlement:null});
      }
      if(path==='/v2/auth/logout'&&req.method==='POST'){
        if(!authorizedPost(req,url,user))return error(403,'CSRF_REJECTED');
        return respond(200,{ok:true},{'Set-Cookie':setCookie(SESSION,'',0)});
      }
      if(path==='/v2/orders/current'&&req.method==='GET'){
        const row=await db.prepare(
          'SELECT * FROM orders_v2 WHERE customer_id=? ORDER BY created_at_ms DESC LIMIT 1')
          .bind(user.customer_id).first();
        return respond(200,{order:row?orderView(row,env):null});
      }
      if(path==='/v2/orders'&&req.method==='POST'){
        if(!authorizedPost(req,url,user))return error(403,'CSRF_REJECTED');
        const input=await bodyJson(req);
        if(!CODE.test(input.plan_code||'')||Object.keys(input).join(',')!=='plan_code')
          return error(400,'invalid_plan');
        const plan=await db.prepare(
          "SELECT * FROM plans_v2 WHERE plan_code=? AND product_code='ads-browser' AND enabled=1 AND max_profiles IS NOT NULL")
          .bind(input.plan_code).first();
        if(!plan)return error(409,'PLAN_UNAVAILABLE');
        const b=bank(env);
        const count=await db.prepare(
          "SELECT COUNT(*) AS n FROM orders_v2 WHERE customer_id=? AND status='pending' AND created_at_ms>?")
          .bind(user.customer_id,now-DAY).first();
        if(Number(count?.n||0)>=3)return error(429,'TOO_MANY_PENDING_ORDERS');
        const id=crypto.randomUUID(),payment='LHM'+rand(9).replace(/[-_]/g,'X').toUpperCase();
        const expiry=now+48*3600000;
        await db.prepare("INSERT INTO orders_v2 (order_id,customer_id,product_code,plan_code,amount_vnd,duration_days,seat_limit,max_profiles,features_json,payment_code,status,created_at_ms,expires_at_ms) VALUES (?,?,'ads-browser',?,?,?,?,?,?,?,'pending',?,?)")
          .bind(id,user.customer_id,plan.plan_code,plan.price_vnd,plan.duration_days,
            plan.seat_limit,plan.max_profiles,plan.features_json,payment,now,expiry).run();
        return respond(201,{order:orderView({order_id:id,plan_code:plan.plan_code,
          amount_vnd:plan.price_vnd,payment_code:payment,status:'pending',expires_at_ms:expiry},env),
          payment_notice:'Chỉ kích hoạt sau khi admin xác minh giao dịch thực tế.'});
      }
      if(path==='/v2/orders/cancel'&&req.method==='POST'){
        if(!authorizedPost(req,url,user))return error(403,'CSRF_REJECTED');
        const input=await bodyJson(req);
        if(!UUID.test(input.order_id||''))return error(400,'invalid_order');
        await db.prepare("UPDATE orders_v2 SET status='canceled' WHERE order_id=? AND customer_id=? AND status='pending'")
          .bind(input.order_id,user.customer_id).run();
        return respond(200,{ok:true});
      }
      return error(404,'not_found');
    }catch(e){
      if(['browser_d1_missing','session_secret_missing','google_oauth_missing',
           'redirect_mismatch','bank_not_configured'].includes(e.message))
        return error(503,'service_unconfigured');
      if(['json_required','request_too_large','invalid_body'].includes(e.message)||
         e instanceof SyntaxError)return error(400,'invalid_request');
      // Do not reveal database, OAuth token, bank or signing secrets.
      return error(503,'service_unavailable');
    }
  };
}
