/* Browser Google SaaS: one-time desktop pairing, account-scoped device grants,
 * 2-seat server leases. STAGING ONLY. Never expose signer/DPAPI/profiles to JS.
 * Durable client identity is a random client hash; NOT a hardware fingerprint.
 */
const encoder=new TextEncoder();
const DAY=86400000;
const PRODUCT='ads-browser';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const GRANT=/^bg1_[A-Za-z0-9_-]{43}$/;
const SEAT=/^[A-Za-z0-9_-]{16,100}$/;
const FLAGS=new Set(['api','automation','profiles','team']);
function json(status,value){return new Response(JSON.stringify(value),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer'
}});}
const fail=(s,e)=>json(s,{error:e});
function randomBytes(size){const b=new Uint8Array(size);crypto.getRandomValues(b);return b;}
function b64(bytes) {
  let s='';for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function fromB64(value){
  if(typeof value!=='string'||value.length>8192||!/^[A-Za-z0-9_-]+$/.test(value))
    throw Error('bad_encoding');
  const base=value.replace(/-/g,'+').replace(/_/g,'/');
  const bytes=Uint8Array.from(atob(base+'='.repeat((4-base.length%4)%4)),c=>c.charCodeAt(0));
  if(b64(bytes)!==value)throw Error('bad_encoding');
  return bytes;
}
function fromBase64(s){
  if(typeof s!=='string'||s.length>8192||!/^[A-Za-z0-9+/]+={0,2}$/.test(s))
    throw Error('issuer_unconfigured');
  return Uint8Array.from(atob(s),x=>x.charCodeAt(0));
}
function token(size=24){return b64(randomBytes(size));}
async function sha(value){
  const hashed=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
  return Array.from(hashed,b=>b.toString(16).padStart(2,'0')).join('');
}
function constantEqual(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)
    diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
async function readBody(req){
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))
    throw Error('invalid_body');
  if(Number(req.headers.get('content-length')||0)>4096)throw Error('invalid_body');
  const raw=await req.text();
  if(raw.length>4096)throw Error('invalid_body');
  const value=JSON.parse(raw);
  if(!value||Array.isArray(value)||typeof value!=='object')throw Error('invalid_body');
  return value;
}
function label(value){
  if(value===undefined||value===null)return 'Windows device';
  if(typeof value!=='string'||value.length>50||!value.trim()||
     /[\u0000-\u001f\u007f<>]/.test(value))throw Error('invalid_label');
  return value.trim();
}
async function lookupGrant(req,db){
  const auth=req.headers.get('authorization')||'';
  if(!/^Bearer bg1_[A-Za-z0-9_-]{43}$/.test(auth))return null;
  const secret=auth.slice(7);
  if(!GRANT.test(secret))return null;
  const key=await sha(secret);
  return db.prepare(
    "SELECT g.grant_id,g.customer_id,g.client_hash,g.revoked,c.status AS customer_status FROM desktop_grants_v2 g JOIN customers_v2 c ON c.customer_id=g.customer_id WHERE g.grant_secret_hash=?")
    .bind(key).first();
}
async function entitlement(db,customerId,now){
  return db.prepare(
    "SELECT * FROM entitlements_v2 WHERE customer_id=? AND product_code='ads-browser' AND revoked=0 AND expires_at_ms>?")
    .bind(customerId,now).first();
}
async function signer(env){
  if(!env.BROWSER_LEASE_PRIVATE_PKCS8_B64||!env.BROWSER_LEASE_PUBLIC_SPKI_B64)
    throw Error('issuer_unconfigured');
  const priv=await crypto.subtle.importKey('pkcs8',
    fromBase64(env.BROWSER_LEASE_PRIVATE_PKCS8_B64),{name:'Ed25519'},false,['sign']);
  const pub=await crypto.subtle.importKey('spki',
    fromBase64(env.BROWSER_LEASE_PUBLIC_SPKI_B64),{name:'Ed25519'},false,['verify']);
  const proof=encoder.encode('LHM Browser staging lease authority pairing check');
  const test=new Uint8Array(await crypto.subtle.sign('Ed25519',priv,proof));
  if(!await crypto.subtle.verify('Ed25519',pub,test,proof))
    throw Error('issuer_unconfigured');
  return priv;
}
async function issueToken(claims,env){
  const sorted=['audience','client_hash','customer_id','features','issued_at',
    'max_profiles','plan_code','product_code','seat_id','seat_limit',
    'subscription_expires_at','valid_until'];
  const serialized=JSON.stringify(Object.fromEntries(sorted.map(k=>[k,claims[k]])));
  const head='lhmbrlease1.'+b64(encoder.encode(serialized));
  const key=await signer(env);
  return head+'.'+b64(new Uint8Array(await crypto.subtle.sign('Ed25519',key,encoder.encode(head))));
}
async function verifiedGrant(req,db,now){
  const grant=await lookupGrant(req,db);
  if(!grant||grant.revoked||grant.customer_status!=='active')
    return {error:fail(401,'DESKTOP_GRANT_INVALID')};
  const paid=await entitlement(db,grant.customer_id,now);
  if(!paid)return {error:fail(402,'SUBSCRIPTION_REQUIRED')};
  return {grant,paid};
}
export function createGoogleDeviceApi({clock=()=>Date.now()}={}){
 return async function dispatch(req,env,{db,getUser,checkCsrf}){
  const path=new URL(req.url).pathname,now=clock();
  if(!Number.isSafeInteger(now)||now<0)return fail(503,'service_unavailable');
  if(typeof env.BROWSER_SESSION_SECRET!=='string'||env.BROWSER_SESSION_SECRET.length<32)
    return fail(503,'service_unconfigured');
  if(req.method!=='POST'&&!(path==='/v2/devices'&&req.method==='GET'))
    return fail(405,'method_not_allowed');
  try{
   if(path==='/v2/desktop/pair/start'){
    const data=await readBody(req);
    if(!HASH.test(data.client_hash||'')||!HASH.test(data.verifier_hash||''))
      return fail(400,'INVALID_PAIRING');
    const clientLabel=label(data.label);
    const existing=await db.prepare(
      "SELECT COUNT(*) AS n FROM desktop_pairings_v2 WHERE client_hash=? AND created_at_ms>?")
      .bind(data.client_hash,now-600000).first();
    if(Number(existing?.n||0)>=3)return fail(429,'PAIR_RATE_LIMIT');
    const pairingId=crypto.randomUUID();
    const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
    const comparisonHash=await sha(pairingId+':'+code+':'+env.BROWSER_SESSION_SECRET);
    await db.prepare(
      "INSERT INTO desktop_pairings_v2(pairing_id,verifier_hash,comparison_code_hash,client_hash,label,status,created_at_ms,expires_at_ms) VALUES(?,?,?,?,?,'pending',?,?)")
      .bind(pairingId,data.verifier_hash,comparisonHash,data.client_hash,clientLabel,now,now+600000).run();
    const origin=new URL(req.url).origin;
    return json(201,{pairing_id:pairingId,comparison_code:code,
      approval_url:origin+'/v2/desktop/pair/?id='+encodeURIComponent(pairingId),
      expires_at_ms:now+600000});
   }
   if(path==='/v2/desktop/pair/approve'){
    const user=await getUser();
    if(!user)return fail(401,'SIGNIN_REQUIRED');
    if(!checkCsrf(user))return fail(403,'CSRF_REJECTED');
    const data=await readBody(req);
    if(!UUID.test(data.pairing_id||'')||!/^\d{6}$/.test(data.comparison_code||''))
      return fail(400,'INVALID_PAIRING');
    const row=await db.prepare('SELECT * FROM desktop_pairings_v2 WHERE pairing_id=?')
      .bind(data.pairing_id).first();
    if(!row||row.status!=='pending'||row.expires_at_ms<=now)
      return fail(409,'PAIR_NOT_PENDING');
    if(row.failed_attempts>=5)return fail(429,'PAIR_LOCKED');
    const expected=await sha(row.pairing_id+':'+data.comparison_code+':'+env.BROWSER_SESSION_SECRET);
    if(!constantEqual(expected,row.comparison_code_hash)){
      await db.prepare("UPDATE desktop_pairings_v2 SET failed_attempts=failed_attempts+1 WHERE pairing_id=? AND status='pending'")
        .bind(row.pairing_id).run();
      return fail(403,'PAIR_CODE_INVALID');
    }
    const outcome=await db.prepare(
      "UPDATE desktop_pairings_v2 SET status='approved',customer_id=? WHERE pairing_id=? AND status='pending' AND failed_attempts<5 AND expires_at_ms>?")
      .bind(user.customer_id,row.pairing_id,now).run();
    if(!Number(outcome?.meta?.changes))return fail(409,'PAIR_NOT_PENDING');
    return json(200,{status:'approved',pairing_id:row.pairing_id,label:row.label});
   }
   if(path==='/v2/desktop/pair/claim'){
    const data=await readBody(req);
    if(!UUID.test(data.pairing_id||'')||
       typeof data.verifier!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(data.verifier))
      return fail(400,'INVALID_PAIRING');
    const row=await db.prepare('SELECT * FROM desktop_pairings_v2 WHERE pairing_id=?')
      .bind(data.pairing_id).first();
    if(!row||row.expires_at_ms<=now)return fail(410,'PAIR_EXPIRED');
    if(row.status==='pending')return fail(409,'PAIR_PENDING');
    if(row.status!=='approved')return fail(409,'PAIR_ALREADY_CLAIMED');
    if(!constantEqual(await sha(data.verifier),row.verifier_hash))
      return fail(403,'PAIR_VERIFIER_INVALID');
    const grantSecret='bg1_'+token(32),grantHash=await sha(grantSecret);
    const unique=crypto.randomUUID();
    const operations=[
      db.prepare("UPDATE desktop_pairings_v2 SET status='claimed',claim_nonce=? WHERE pairing_id=? AND status='approved' AND verifier_hash=? AND expires_at_ms>?")
        .bind(unique,row.pairing_id,row.verifier_hash,now),
      db.prepare("INSERT INTO desktop_grants_v2(grant_id,customer_id,client_hash,grant_secret_hash,revoked,created_at_ms) SELECT ?,customer_id,client_hash,?,0,? FROM desktop_pairings_v2 WHERE pairing_id=? AND claim_nonce=? AND status='claimed' ON CONFLICT(customer_id,client_hash) DO UPDATE SET grant_secret_hash=excluded.grant_secret_hash,revoked=0,created_at_ms=excluded.created_at_ms")
        .bind(crypto.randomUUID(),grantHash,now,row.pairing_id,unique)
    ];
    const outcome=await db.batch(operations);
    if(!Number(outcome[0]?.meta?.changes)||!Number(outcome[1]?.meta?.changes))
      return fail(409,'PAIR_ALREADY_CLAIMED');
    return json(200,{grant:grantSecret,customer_id:row.customer_id,
      client_hash:row.client_hash,notice:'Store grant encrypted with Windows DPAPI; it will not be returned again.'});
   }
   if(path==='/v2/devices'){
    const user=await getUser();
    if(!user)return fail(401,'SIGNIN_REQUIRED');
    const rows=await db.prepare(
      "SELECT seat_id,label,heartbeat_at_ms,expires_at_ms FROM license_seats_v2 WHERE customer_id=? AND product_code='ads-browser' AND expires_at_ms>? ORDER BY heartbeat_at_ms DESC")
      .bind(user.customer_id,now).all();
    return json(200,{devices:rows.results||[]});
   }
   const verified=await verifiedGrant(req,db,now);
   if(verified.error)return verified.error;
   const {grant,paid}=verified;
   if(path==='/v2/seats/list'){
    const rows=await db.prepare(
      "SELECT seat_id,label,heartbeat_at_ms FROM license_seats_v2 WHERE customer_id=? AND product_code='ads-browser' AND expires_at_ms>? ORDER BY heartbeat_at_ms DESC")
      .bind(grant.customer_id,now).all();
    return json(200,{seat_limit:paid.seat_limit,
      devices:(rows.results||[]).map(x=>({seat_id:x.seat_id,label:x.label,
        last_seen_ms:x.heartbeat_at_ms}))});
   }
   if(path==='/v2/seats/attach'){
    const data=await readBody(req);
    const nick=label(data.label);
    const seatId=token(24),until=now+600000;
    const result=await db.prepare(
      "INSERT INTO license_seats_v2(seat_id,customer_id,product_code,client_hash,label,heartbeat_at_ms,expires_at_ms) SELECT ?,?,'ads-browser',?,?,?,? WHERE (SELECT COUNT(*) FROM license_seats_v2 s WHERE s.customer_id=? AND s.product_code='ads-browser' AND s.expires_at_ms>? AND s.client_hash<>?) < ? ON CONFLICT(customer_id,product_code,client_hash) DO UPDATE SET seat_id=excluded.seat_id,label=excluded.label,heartbeat_at_ms=excluded.heartbeat_at_ms,expires_at_ms=excluded.expires_at_ms,takeover_nonce=NULL")
      .bind(seatId,grant.customer_id,grant.client_hash,nick,now,until,
        grant.customer_id,now,grant.client_hash,paid.seat_limit).run();
    if(!Number(result?.meta?.changes))return fail(409,'SEAT_LIMIT');
    return json(200,{seat_id:seatId,heartbeat_interval_seconds:300,seat_ttl_seconds:600});
   }
   if(path==='/v2/seats/heartbeat'){
    const data=await readBody(req);
    if(!SEAT.test(data.seat_id||''))return fail(400,'INVALID_SEAT');
    const result=await db.prepare(
      "UPDATE license_seats_v2 SET heartbeat_at_ms=?,expires_at_ms=? WHERE seat_id=? AND customer_id=? AND client_hash=? AND product_code='ads-browser' AND expires_at_ms>?")
      .bind(now,now+600000,data.seat_id,grant.customer_id,grant.client_hash,now).run();
    return Number(result?.meta?.changes)?json(200,{status:'active',seat_ttl_seconds:600}):
      fail(409,'SEAT_EXPIRED');
   }
   if(path==='/v2/seats/takeover'){
    const data=await readBody(req);
    if(!SEAT.test(data.replace_seat_id||'')||data.confirmation!=='REPLACE')
      return fail(400,'TAKEOVER_CONFIRMATION_REQUIRED');
    const nonce=crypto.randomUUID(),newSeatId=token(24),nick=label(data.label);
    const op=[
      db.prepare("UPDATE license_seats_v2 SET expires_at_ms=?,takeover_nonce=? WHERE seat_id=? AND customer_id=? AND product_code='ads-browser' AND client_hash<>? AND expires_at_ms>?")
        .bind(now,nonce,data.replace_seat_id,grant.customer_id,grant.client_hash,now),
      db.prepare(
       "INSERT INTO license_seats_v2(seat_id,customer_id,product_code,client_hash,label,heartbeat_at_ms,expires_at_ms) SELECT ?,?,'ads-browser',?,?,?,? WHERE EXISTS(SELECT 1 FROM license_seats_v2 WHERE seat_id=? AND customer_id=? AND takeover_nonce=?) AND (SELECT COUNT(*) FROM license_seats_v2 WHERE customer_id=? AND product_code='ads-browser' AND client_hash<>? AND expires_at_ms>?)<? ON CONFLICT(customer_id,product_code,client_hash) DO UPDATE SET seat_id=excluded.seat_id,label=excluded.label,heartbeat_at_ms=excluded.heartbeat_at_ms,expires_at_ms=excluded.expires_at_ms,takeover_nonce=NULL")
        .bind(newSeatId,grant.customer_id,grant.client_hash,nick,now,now+600000,
          data.replace_seat_id,grant.customer_id,nonce,
          grant.customer_id,grant.client_hash,now,paid.seat_limit)
    ];
    const results=await db.batch(op);
    if(!Number(results[0]?.meta?.changes)||!Number(results[1]?.meta?.changes))
      return fail(409,'TARGET_SEAT_NOT_REPLACED');
    return json(200,{seat_id:newSeatId,replaced_seat_id:data.replace_seat_id,
      heartbeat_interval_seconds:300,seat_ttl_seconds:600});
   }
   if(path==='/v2/leases/issue'){
    const data=await readBody(req);
    if(!SEAT.test(data.seat_id||''))return fail(400,'INVALID_SEAT');
    const current=await db.prepare(
      "SELECT seat_id FROM license_seats_v2 WHERE seat_id=? AND customer_id=? AND client_hash=? AND product_code='ads-browser' AND expires_at_ms>?")
      .bind(data.seat_id,grant.customer_id,grant.client_hash,now).first();
    if(!current)return fail(409,'SEAT_EXPIRED');
    let features;
    try{features=JSON.parse(paid.features_json);}
    catch(_){return fail(503,'invalid_entitlement');}
    if(!Array.isArray(features)||features.length<1||features.length>4||
       features.some(f=>!FLAGS.has(f))||
       JSON.stringify(features)!==JSON.stringify([...new Set(features)].sort())||
       !Number.isSafeInteger(paid.max_profiles)||paid.max_profiles<1||
       !Number.isSafeInteger(paid.seat_limit)||paid.seat_limit<1)
      return fail(503,'invalid_entitlement');
    const claims={
      audience:'lhm-ads-browser-windows',client_hash:grant.client_hash,
      customer_id:grant.customer_id,features,issued_at:new Date(now).toISOString(),
      max_profiles:paid.max_profiles,plan_code:paid.plan_code,
      product_code:PRODUCT,seat_id:data.seat_id,seat_limit:paid.seat_limit,
      subscription_expires_at:new Date(paid.expires_at_ms).toISOString(),
      valid_until:new Date(Math.min(now+72*3600000,paid.expires_at_ms)).toISOString()
    };
    return json(200,{lease:await issueToken(claims,env),valid_until:claims.valid_until,
      offline_limit_hours:72});
   }
   return fail(404,'not_found');
  }catch(e){
   if(['invalid_body','invalid_label'].includes(e.message)||e instanceof SyntaxError)
     return fail(400,'invalid_request');
   if(['issuer_unconfigured','bad_encoding'].includes(e.message))
     return fail(503,'issuer_unconfigured');
   return fail(503,'device_service_unavailable');
  }
 };
}
