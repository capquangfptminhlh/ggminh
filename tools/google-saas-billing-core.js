'use strict';
// Operator-only v2 commerce tool. NEVER ship this in the Electron customer app.
// A receipt reference is NOT proof of funds: operator must inspect bank ledger.
// Staging-only merchant API namespace on owner-approved primary domain.
const ORIGIN='https://browser.lhmcrm.com';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF=/^[A-Za-z0-9_.:/-]{6,100}$/;
const CONFIRM='BANK_STATEMENT_MATCHED';
class ReviewError extends Error{constructor(code){super(code);this.code=code;}}
function config(env){
 const endpoint=env.BROWSER_SAAS_ADMIN_ORIGIN||ORIGIN;
 let url;
 try{url=new URL(endpoint);}
 catch(_){throw new ReviewError('INVALID_STAGING_ORIGIN');}
 if(url.origin!==ORIGIN||url.pathname!=='/'||url.search||url.hash||url.username||url.password)
  throw new ReviewError('INVALID_STAGING_ORIGIN');
 const token=env.BROWSER_SAAS_ADMIN_TOKEN;
 if(typeof token!=='string'||token.length<32||token.length>256||/[\r\n]/.test(token))
  throw new ReviewError('MISSING_STAGING_ADMIN_SECRET');
 if(!!env.CF_ACCESS_CLIENT_ID!==!!env.CF_ACCESS_CLIENT_SECRET)
  throw new ReviewError('INCOMPLETE_ACCESS_CREDENTIALS');
 return {origin:url.origin,headers:{
  authorization:'Bearer '+token,
  'accept':'application/json',
  ...(env.CF_ACCESS_CLIENT_ID?{
    'CF-Access-Client-Id':env.CF_ACCESS_CLIENT_ID,
    'CF-Access-Client-Secret':env.CF_ACCESS_CLIENT_SECRET}: {})
 }};
}
async function apiCall(cfg,route,init,fetchImpl){
 let result;
 try{result=await fetchImpl(cfg.origin+route,{
   method:init?.method||'GET',redirect:'error',
   headers:{...cfg.headers,...(init?.body?{'content-type':'application/json'}:{})},
   ...(init?.body?{body:JSON.stringify(init.body)}:{})
  });}
 catch(_){throw new ReviewError('STAGING_NETWORK_UNAVAILABLE');}
 let payload;
 try{payload=await result.json();}
 catch(_){throw new ReviewError('STAGING_RESPONSE_INVALID');}
 if(!result.ok||!payload||typeof payload!=='object')
  throw new ReviewError('STAGING_API_'+result.status+'_'+
   (typeof payload?.error==='string'?payload.error:'ERROR'));
 return payload;
}
async function runGoogleSaasBillingAdmin({args=[],env=process.env,
 fetchImpl=globalThis.fetch,write=console.log,now=Date.now()}={}){
 if(!Array.isArray(args)||typeof fetchImpl!=='function'||typeof write!=='function')
  throw new ReviewError('INVALID_OPERATOR_ARGUMENTS');
 const [command,id,ref,confirmation]=args;
 if(command!=='list'&&command!=='approve'&&command!=='ready')
  throw new ReviewError('USAGE: ready | list | approve <order-uuid> <bank-reference> BANK_STATEMENT_MATCHED');
 if(command==='approve'&&(!UUID.test(id||'')||!REF.test(ref||'')||
    confirmation!==CONFIRM||args.length!==4))
  throw new ReviewError('BANK_CONFIRMATION_REQUIRED');
 if((command==='list'||command==='ready')&&args.length!==1)
  throw new ReviewError('INVALID_OPERATOR_ARGUMENTS');
 const cfg=config(env);
 if(command==='ready'){
  const state=await apiCall(cfg,'/v2/admin/readiness',null,fetchImpl);
  const flags=state.checks;
  if(!flags||typeof flags!=='object'||Array.isArray(flags)||
     Object.values(flags).some(value=>typeof value!=='boolean')||
     typeof state.customer_registration_ready!=='boolean')
    throw new ReviewError('STAGING_READINESS_INVALID');
  const publicSha=state.issuer_public_spki_sha256;
  if(flags.ed25519_issuer&&
     (typeof publicSha!=='string'||!/^[a-f0-9]{64}$/.test(publicSha)))
    throw new ReviewError('STAGING_SIGNER_IDENTITY_INVALID');
  const approvedSha=env.BROWSER_LEASE_PUBLIC_SPKI_SHA256;
  if(approvedSha!==undefined&&
     (!/^[a-f0-9]{64}$/.test(approvedSha)||publicSha!==approvedSha))
    throw new ReviewError('STAGING_SIGNER_FINGERPRINT_MISMATCH');
  write('LHM Browser SaaS | Isolated staging readiness (not proof of bank/OAuth live transactions)');
  for(const key of Object.keys(flags).sort())
   write(key+': '+(flags[key]?'CONFIGURED':'BLOCKED'));
  if(publicSha)write('Worker lease public SPKI SHA-256: '+publicSha);
  write('Website registration: '+
    (state.customer_registration_ready?'CONFIGURED_FOR_LIVE_ACCEPTANCE_TEST':'BLOCKED'));
  return {status:state.customer_registration_ready?'configured':'blocked',checks:flags};
 }
 const orders=(await apiCall(cfg,'/v2/admin/orders',null,fetchImpl)).orders;
 if(!Array.isArray(orders)||orders.length>100)
  throw new ReviewError('STAGING_ORDER_LIST_INVALID');
 const vetted=orders.map(order=>{
  if(!UUID.test(order.order_id||'')||!Number.isSafeInteger(order.amount_vnd)||
     order.amount_vnd<1||typeof order.payment_code!=='string'||
     !['pending','paid','canceled'].includes(order.status)||
     !Number.isSafeInteger(order.expires_at_ms))
    throw new ReviewError('STAGING_ORDER_LIST_INVALID');
  return order;
 });
 if(command==='list'){
  write('LHM Browser SaaS | STAGING ONLY | Read-only list; no bank verification performed');
  for(const item of vetted)
   write([item.order_id,item.status,item.amount_vnd+' VND',item.payment_code,
    new Date(item.expires_at_ms).toISOString()].join(' | '));
  return {status:'listed',count:vetted.length};
 }
 const order=vetted.find(x=>x.order_id===id);
 if(!order)throw new ReviewError('ORDER_NOT_IN_RECENT_100');
 if(order.status!=='pending'||order.expires_at_ms<=now)
  throw new ReviewError('ORDER_NOT_PENDING');
 write('Operator declares independent bank statement comparison: order '+
  order.order_id+' | amount '+order.amount_vnd+' VND | transfer memo '+order.payment_code+
  ' | bank reference '+ref);
 const outcome=await apiCall(cfg,'/v2/admin/activate',{
  method:'POST',body:{order_id:id,payment_ref:ref}
 },fetchImpl);
 if(outcome.status!=='paid')throw new ReviewError('ACTIVATION_NOT_CONFIRMED');
 write('Staging payment activation confirmed by server; idempotent='+
  String(outcome.idempotent===true));
 return {status:'paid',idempotent:outcome.idempotent===true};
}
module.exports={runGoogleSaasBillingAdmin,ReviewError,ORIGIN};
