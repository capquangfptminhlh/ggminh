/* LHM Ads Browser: optional no-VPS license authority.
 * Cloudflare Workers + D1. No Node runtime, issuer key, customer token or
 * administrator credential is shipped to the Windows app / GitHub Pages.
 * Runs only over Cloudflare HTTPS; production keys are Worker secrets.
 * IMPORTANT: verify / sign use the EXACT lhmlic1 + lhmproof1 formats.
 */
import { adminHtml } from './admin.mjs';
import { adminScript } from './adminClient.mjs';
import { commerce } from './commerce.mjs';
const LICENSE_ID=/^lic_[a-f0-9]{24}$/;
const INSTALL_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const NONCE=/^[a-zA-Z0-9_-]{22}$/;
const DATE=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const PLANS=new Set(['starter','pro','business']);
const FEATURES=new Set(['profiles','automation','api','team']);
const DAY=86_400_000;
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});

function response(status,value,extra={}){
 return new Response(JSON.stringify(value),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  ...extra
 }});
}
function bytesFromBase64(value,max=8192,urlSafe=false){
 if(typeof value!=='string'||!value||value.length>max||
  !(urlSafe?/^[A-Za-z0-9_-]+$/:/^[A-Za-z0-9+/]+={0,2}$/).test(value))
  throw Error('invalid_encoding');
 const normal=(urlSafe?value.replace(/-/g,'+').replace(/_/g,'/'):value).replace(/=+$/,'');
 let result;
 try{const binary=atob(normal+'='.repeat((4-normal.length%4)%4));
  result=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
 }catch(_){throw Error('invalid_encoding');}
 const roundtrip=urlSafe?base64url(result):base64(result);
 if(roundtrip!==value)throw Error('invalid_encoding');
 return result;
}
function base64(bytes){let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);}
function base64url(bytes){return base64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function stableClaims(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_license');
 const v=value.version,mode=v===1?'strict':value.enforcementMode;
 const names=['version','licenseId','customer','installationId','plan',
  'maxProfiles','features','issuedAt','expiresAt'];
 if(v===2)names.push('enforcementMode');
 if(Object.keys(value).sort().join('|')!==names.sort().join('|')||
    ![1,2].includes(v)||!LICENSE_ID.test(value.licenseId||'')||
    !INSTALL_ID.test(value.installationId||'')||
    typeof value.customer!=='string'||!value.customer.trim()||
    value.customer.length>120||!PLANS.has(value.plan)||
    !Number.isInteger(value.maxProfiles)||value.maxProfiles<1||value.maxProfiles>10000||
    !['strict','owner_sweep'].includes(mode)||
    !Array.isArray(value.features)||value.features.length>4||
    value.features.some(x=>!FEATURES.has(x))||
    JSON.stringify(value.features)!==JSON.stringify([...new Set(value.features)].sort())||
    !DATE.test(value.issuedAt||'')||!DATE.test(value.expiresAt||''))
  throw Error('invalid_license');
 const issued=Date.parse(value.issuedAt),expires=Date.parse(value.expiresAt);
 if(!Number.isFinite(issued)||!Number.isFinite(expires)||issued>=expires||
    expires-issued>370*DAY||
    new Date(issued).toISOString()!==value.issuedAt||
    new Date(expires).toISOString()!==value.expiresAt)
  throw Error('invalid_license');
 const claims={version:v,licenseId:value.licenseId,customer:value.customer,
  installationId:value.installationId,plan:value.plan,
  maxProfiles:value.maxProfiles,features:value.features,
  issuedAt:value.issuedAt,expiresAt:value.expiresAt};
 if(v===2)claims.enforcementMode=mode;
 return JSON.stringify(claims);
}
async function issuerKeys(env){
 if(typeof env.LHM_ISSUER_PRIVATE_PKCS8_B64!=='string'||
    typeof env.LHM_ISSUER_PUBLIC_SPKI_B64!=='string')
  throw Error('missing_issuer_keys');
 const priv=bytesFromBase64(env.LHM_ISSUER_PRIVATE_PKCS8_B64,8192);
 const pub=bytesFromBase64(env.LHM_ISSUER_PUBLIC_SPKI_B64,8192);
 const privateKey=await crypto.subtle.importKey('pkcs8',priv,
  {name:'Ed25519'},false,['sign']);
 const publicKey=await crypto.subtle.importKey('spki',pub,
  {name:'Ed25519'},false,['verify']);
 const check=encoder.encode('LHM license authority issuer key pairing v1');
 const signature=await crypto.subtle.sign('Ed25519',privateKey,check);
 if(!await crypto.subtle.verify('Ed25519',publicKey,signature,check))
  throw Error('issuer_key_pair_mismatch');
 return {privateKey,publicKey};
}
async function verifyToken(token,publicKey){
 if(typeof token!=='string'||token.length>11000)throw Error('invalid_license');
 const pieces=token.split('.');
 if(pieces.length!==3||pieces[0]!=='lhmlic1')throw Error('invalid_license');
 const raw=bytesFromBase64(pieces[1],8192,true);
 const sig=bytesFromBase64(pieces[2],120,true);
 if(sig.length!==64)throw Error('invalid_license');
 let parsed;
 try{parsed=JSON.parse(decoder.decode(raw));}
 catch(_){throw Error('invalid_license');}
 const canonical=encoder.encode(stableClaims(parsed));
 if(raw.length!==canonical.length||raw.some((b,i)=>canonical[i]!==b))
  throw Error('invalid_license');
 const ok=await crypto.subtle.verify('Ed25519',publicKey,sig,
  encoder.encode('lhmlic1.'+pieces[1]));
 if(!ok)throw Error('invalid_license');
 return parsed;
}
async function signProof(data,privateKey){
 const payload=JSON.stringify({version:1,licenseId:data.licenseId,
  installationId:data.installationId,nonce:data.nonce,
  checkedAt:data.checkedAt,state:data.state});
 const message='lhmproof1.'+base64url(encoder.encode(payload));
 const signature=new Uint8Array(await crypto.subtle.sign('Ed25519',privateKey,
  encoder.encode(message)));
 return message+'.'+base64url(signature);
}
async function readJson(request){
 const mime=request.headers.get('content-type')||'';
 if(!/^application\/json(?:\s*;|$)/i.test(mime))
  return {error:response(415,{error:'json_required'})};
 const length=Number(request.headers.get('content-length')||0);
 if(!Number.isFinite(length)||length>15000||length<0)
  return {error:response(413,{error:'request_too_large'})};
 let data;
 try{
  // Bound the stream BEFORE allocating the complete request body.
  const chunks=[];
  let size=0;
  const reader=request.body?.getReader();
  if(!reader)throw Error('invalid_request');
  try{
   while(true){
    const {value,done}=await reader.read();
    if(done)break;
    size+=value.length;
    if(size>15000)throw Error('request_too_large');
    chunks.push(value);
   }
  }finally{reader.releaseLock();}
  const raw=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
  data=JSON.parse(decoder.decode(raw));
 }catch(e){return{error:response(e.message==='request_too_large'?413:400,{
  error:e.message==='request_too_large'?'request_too_large':'invalid_request'
 })};}
 if(!data||typeof data!=='object'||Array.isArray(data))
  return {error:response(400,{error:'invalid_request'})};
 return {data};
}
async function isAdmin(req,env){
 const expected=env.LHM_LICENSE_ADMIN_TOKEN;
 if(typeof expected!=='string'||expected.length<32)throw Error('admin_secret_missing');
 const auth=req.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9._~+/-]{32,256}$/.test(auth))return false;
 // No short-circuit string compare of a server secret.
 const [a,b]=await Promise.all([
  crypto.subtle.digest('SHA-256',encoder.encode(auth.slice(7))),
  crypto.subtle.digest('SHA-256',encoder.encode(expected))
 ]);
 const x=new Uint8Array(a),y=new Uint8Array(b);
 let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
 return diff===0;
}
function db(env){
 if(!env.LICENSE_DB||typeof env.LICENSE_DB.prepare!=='function')
  throw Error('d1_not_configured');
 return env.LICENSE_DB;
}
const SELECT='SELECT license_id AS licenseId, installation_id AS installationId, expires_at AS expiresAt, enforcement_mode AS enforcementMode, revoked FROM licenses WHERE license_id = ?';
function sameRegistration(existing,claims){
 return existing.licenseId===claims.licenseId&&
  existing.installationId.toLowerCase()===claims.installationId.toLowerCase()&&
  existing.expiresAt===claims.expiresAt&&
  existing.enforcementMode===(claims.version===2?claims.enforcementMode:'strict');
}
async function register(database,claims,now){
 const mode=claims.version===2?claims.enforcementMode:'strict';
 await database.prepare(`INSERT OR IGNORE INTO licenses
  (license_id, installation_id, expires_at, enforcement_mode, revoked, updated_at)
  VALUES (?, ?, ?, ?, 0, ?)`).bind(claims.licenseId,claims.installationId,
   claims.expiresAt,mode,now).run();
 const row=await database.prepare(SELECT).bind(claims.licenseId).first();
 if(!row||!sameRegistration(row,claims))return response(409,{error:'registration_conflict'});
 return response(200,{registered:true,licenseId:claims.licenseId,
  enforcementMode:mode,revoked:row.revoked===1});
}
async function verify(database,claims,nonce,keys,now){
 const row=await database.prepare(SELECT).bind(claims.licenseId).first();
 // Require owner enrollment. Never self-enroll a customer on verification.
 if(!row)return response(403,{error:'license_not_enrolled'});
 if(!sameRegistration(row,claims))return response(403,{error:'license_registration_mismatch'});
 if(Date.parse(claims.issuedAt)>now+300000)
  return response(400,{error:'invalid_license'});
 let state='valid';
 if(row.revoked===1)state='revoked';
 else if(Date.parse(claims.expiresAt)<=now){
  if(row.enforcementMode==='owner_sweep'){
   // Synchronous safeguard even when a scheduled Cron has not yet run.
   await database.prepare(`UPDATE licenses SET revoked = 1, updated_at = ?
     WHERE license_id = ? AND revoked = 0 AND enforcement_mode = 'owner_sweep'
     AND expires_at <= ?`).bind(now,claims.licenseId,new Date(now).toISOString()).run();
   state='revoked';
  }else state='expired';
 }
 const receipt=await signProof({version:1,licenseId:claims.licenseId,
  installationId:claims.installationId,nonce,checkedAt:now,state},keys.privateKey);
 return response(200,{receipt});
}
async function changeRevocation(database,licenseId,revoked,now){
 const row=await database.prepare(SELECT).bind(licenseId).first();
 if(!row)return response(404,{error:'license_not_enrolled'});
 if(!revoked&&row.enforcementMode==='owner_sweep'&&Date.parse(row.expiresAt)<=now)
  return response(409,{error:'expired_license_cannot_be_allowed'});
 await database.prepare('UPDATE licenses SET revoked = ?, updated_at = ? WHERE license_id = ?')
  .bind(revoked?1:0,now,licenseId).run();
 return response(200,{licenseId,revoked});
}
async function sweep(database,now){
 const result=await database.prepare(`UPDATE licenses SET revoked = 1, updated_at = ?
  WHERE revoked = 0 AND enforcement_mode = 'owner_sweep' AND expires_at <= ?`)
  .bind(now,new Date(now).toISOString()).run();
 return {swept:Number(result?.meta?.changes||0)};
}
export function createAuthority({clock=()=>Date.now()}={}){
 return {
  async fetch(request,env){
   const url=new URL(request.url);
   if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))
    return response(400,{error:'https_required'});
   // No payment/customer information in public HTML. Every sales API
   // request requires the existing strong owner Bearer secret.
   if((url.pathname==='/'||url.pathname==='/admin')&&['GET','HEAD'].includes(request.method))
    return adminHtml(request);
   if(url.pathname==='/admin/app.js'&&request.method==='GET')
    return adminScript();
   if(url.pathname==='/health'&&request.method==='GET'){
    try{
     const database=db(env);
     const keys=await issuerKeys(env);
     await database.prepare('SELECT 1 AS ready FROM licenses LIMIT 1').first();
     if(!keys)return response(503,{status:'degraded'});
     return response(200,{status:'ok',service:'LHM D1 License Authority'});
    }catch(_){return response(503,{status:'degraded'});}
   }
   const isVerify=url.pathname==='/v1/verify'&&request.method==='POST';
   const isRegister=url.pathname==='/v1/admin/register'&&request.method==='POST';
   const isRevoke=url.pathname==='/v1/admin/revocation'&&request.method==='POST';
   const isCommerce=url.pathname==='/v1/admin/commerce'&&request.method==='POST';
   if(!isVerify&&!isRegister&&!isRevoke&&!isCommerce)
    return response(404,{error:'not_found'});
   try{
    const database=db(env);
    const now=clock();
    if(!Number.isSafeInteger(now)||now<0)throw Error('clock_invalid');
    // Authenticate BEFORE reading an administrative request body.
    if((isRegister||isRevoke||isCommerce)&&!await isAdmin(request,env))
     return response(401,{error:'unauthorized'});
    const parsed=await readJson(request);
    if(parsed.error)return parsed.error;
    const input=parsed.data;
    const keys=await issuerKeys(env);
    if(isCommerce){
     const result=await commerce(database,now,keys,stableClaims,input);
     const {status,...body}=result;
     return response(status,body);
    }
    if(isRevoke){
     if(Object.keys(input).sort().join('|')!=='licenseId|revoked'||
        !LICENSE_ID.test(input.licenseId||'')||typeof input.revoked!=='boolean')
      return response(400,{error:'invalid_request'});
     return await changeRevocation(database,input.licenseId,input.revoked,now);
    }
    if(isRegister){
     if(Object.keys(input).join('|')!=='token')return response(400,{error:'invalid_request'});
     const claims=await verifyToken(input.token,keys.publicKey);
     return await register(database,claims,now);
    }
    if(input.version!==1||!NONCE.test(input.nonce||'')||
       typeof input.token!=='string'||
       Object.keys(input).sort().join('|')!=='nonce|token|version')
     return response(400,{error:'invalid_request'});
    const claims=await verifyToken(input.token,keys.publicKey);
    return await verify(database,claims,input.nonce,keys,now);
   }catch(error){
    if(['missing_issuer_keys','issuer_key_pair_mismatch',
       'd1_not_configured','admin_secret_missing','clock_invalid'].includes(error.message))
     return response(503,{error:'authority_unavailable'});
    if(['invalid_license','invalid_encoding'].includes(error.message))
     return response(400,{error:'invalid_license_or_request'});
    // No key, token, raw body, DB details or installation identifiers in errors.
    return response(503,{error:'authority_unavailable'});
   }
  },
  async scheduled(_event,env){
   const now=clock();
   if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid clock');
   await issuerKeys(env); // fail-closed if the issuer is misconfigured
   return sweep(db(env),now);
  }
 };
}
export default createAuthority();
