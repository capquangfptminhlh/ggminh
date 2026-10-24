/* LHM admin-only commerce: manual verified bank transfer -> signed activation.
 * Payment is NEVER marked paid by the customer's browser, redirect or screenshot.
 * No secret / private key / plaintext key is persisted in D1.
 */
const ID=/^ord_[0-9a-f]{24}$/;
const LIC=/^lic_[0-9a-f]{24}$/;
const INSTALL=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MONTHS=new Set([1,3,6,12]);
const PRICE=499000;
const DAY=86400000;
const enc=new TextEncoder(),dec=new TextDecoder();
function json(status,data){
 return new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'
 }});
}
function hex(n){return [...crypto.getRandomValues(new Uint8Array(n))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function base64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}
function un64(value){if(typeof value!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('encryption_key_invalid');return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
async function key(env){
 const bytes=un64(env.LHM_ORDER_TOKEN_ENC_KEY_B64);
 if(bytes.length!==32)throw Error('encryption_key_invalid');
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
async function seal(value,env){
 const iv=crypto.getRandomValues(new Uint8Array(12)),k=await key(env);
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(value)));
 return {iv:base64(iv),ciphertext:base64(ciphertext)};
}
async function unseal(row,env){
 if(!row?.token_iv||!row?.token_ciphertext)throw Error('missing_sealed_token');
 const k=await key(env);
 return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(row.token_iv)},k,un64(row.token_ciphertext)));
}
function orderPublic(row){
 return {orderId:row.order_id,customerName:row.customer_name,customerEmail:row.customer_email,
  installationId:row.installation_id,action:row.action,plan:row.plan,months:row.months,
  amountVnd:row.amount_vnd,status:row.status,paymentRef:row.payment_ref,
  licenseId:row.license_id,expiresAt:row.expires_at,createdAt:row.created_at,
  paidAt:row.paid_at,issuedAt:row.issued_at};
}
function plusMonths(from,months){
 const d=new Date(from);
 const day=d.getUTCDate();
 d.setUTCDate(1);
 d.setUTCMonth(d.getUTCMonth()+months);
 const nextMonth=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0));
 d.setUTCDate(Math.min(day,nextMonth.getUTCDate()));
 return d.getTime();
}
async function getOrder(db,id){
 return db.prepare('SELECT * FROM portal_orders WHERE order_id = ?').bind(id).first();
}
function invalid(message){return json(400,{error:message});}
function paidState(row){return row.status==='paid'||row.status==='issued';}
export function createPortalApi({database,now,env,issuerKeys,signToken}){
 async function handle(path,input){
  if(path==='summary'){
   const [orders,licenses]=await Promise.all([
    database.prepare('SELECT * FROM portal_orders ORDER BY created_at DESC LIMIT 150').all(),
    database.prepare('SELECT license_id AS licenseId, installation_id AS installationId, expires_at AS expiresAt, enforcement_mode AS enforcementMode, revoked FROM licenses ORDER BY updated_at DESC LIMIT 150').all()
   ]);
   const rows=(orders.results||[]).map(orderPublic);
   return json(200,{currency:'VND',starterMonthlyVnd:PRICE,
    paymentMethod:'manual_bank_transfer',paymentAutomatic:false,
    orders:rows,licenses:licenses.results||[],
    counts:{orders:rows.length,pending:rows.filter(x=>x.status==='pending').length,
      issued:rows.filter(x=>x.status==='issued').length,
      paidValueVnd:rows.filter(x=>x.status==='issued').reduce((s,x)=>s+x.amountVnd,0)}});
  }
  if(path==='create'){
   if(!input||Object.keys(input).sort().join('|')!=='action|customerEmail|customerName|installationId|licenseId|months')
    return invalid('invalid_fields');
   const {action,customerName,customerEmail,installationId,licenseId,months}=input;
   if(!['new','renew'].includes(action)||!MONTHS.has(months)||
      typeof customerName!=='string'||customerName.trim().length<2||customerName.length>120||
      typeof customerEmail!=='string'||customerEmail.length>180||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)||
      !INSTALL.test(installationId||'')||
      !(action==='new' ? licenseId===null : LIC.test(licenseId||'')))
     return invalid('invalid_order');
   if(action==='renew'){
    const existing=await database.prepare('SELECT license_id AS licenseId, installation_id AS installationId, revoked FROM licenses WHERE license_id = ?').bind(licenseId).first();
    if(!existing||existing.installationId.toLowerCase()!==installationId.toLowerCase()||existing.revoked===1)
     return json(409,{error:'renewal_license_unavailable'});
   }
   const orderId='ord_'+hex(12);
   await database.prepare(`INSERT INTO portal_orders
    (order_id,customer_name,customer_email,installation_id,action,plan,months,amount_vnd,status,
    license_id,created_at) VALUES (?,?,?,?,?,'starter',?,?,'pending',?,?)`)
    .bind(orderId,customerName.trim(),customerEmail.trim().toLowerCase(),
      installationId,action,months,months*PRICE,licenseId,now).run();
   return json(201,{order:orderPublic(await getOrder(database,orderId)),
    warning:'Chưa thu tiền; không được cấp key trước khi xác minh giao dịch thực.'});
  }
  if(!input||!ID.test(input.orderId||''))return invalid('invalid_order_id');
  const row=await getOrder(database,input.orderId);
  if(!row)return json(404,{error:'order_not_found'});
  if(path==='confirm-payment'){
   if(Object.keys(input).sort().join('|')!=='orderId|paymentRef')return invalid('invalid_fields');
   if(row.status==='issued'||row.status==='paid')
    return json(409,{error:'payment_already_confirmed'});
   if(row.status!=='pending')return json(409,{error:'order_not_pending'});
   if(typeof input.paymentRef!=='string'||!/^[A-Z0-9][A-Z0-9_.-]{5,63}$/i.test(input.paymentRef))
    return invalid('invalid_payment_reference');
   // A human accountant must compare amount and transaction to the actual bank
   // statement BEFORE calling this authenticated admin-only endpoint.
   try{
    const result=await database.prepare(`UPDATE portal_orders SET status='paid',payment_ref=?,paid_at=?
       WHERE order_id=? AND status='pending'`).bind(input.paymentRef.toUpperCase(),now,row.order_id).run();
    if(result.meta?.changes!==1)return json(409,{error:'order_state_changed'});
   }catch(_){return json(409,{error:'payment_reference_duplicate_or_db_unavailable'});}
   return json(200,{order:orderPublic(await getOrder(database,row.order_id)),
    paymentVerifiedBy:'administrator_manual_confirmation'});
  }
  if(path==='token'){
   if(Object.keys(input).join('|')!=='orderId')return invalid('invalid_fields');
   if(row.status!=='issued')return json(409,{error:'license_not_issued'});
   return json(200,{order:orderPublic(row),token:await unseal(row,env)});
  }
  if(path==='issue'){
   if(Object.keys(input).join('|')!=='orderId')return invalid('invalid_fields');
   if(row.status==='issued')
    return json(200,{order:orderPublic(row),token:await unseal(row,env),alreadyIssued:true});
   if(row.status!=='paid')return json(409,{error:'payment_not_confirmed'});
   const old=row.action==='renew'
    ?await database.prepare('SELECT license_id AS licenseId,installation_id AS installationId,expires_at AS expiresAt,revoked FROM licenses WHERE license_id=?').bind(row.license_id).first():null;
   if(row.action==='renew'&&(!old||old.revoked===1||
      old.installationId.toLowerCase()!==row.installation_id.toLowerCase()))
    return json(409,{error:'renewal_license_unavailable'});
   const expiresMs=plusMonths(Math.max(now,old?Date.parse(old.expiresAt):now),row.months);
   if(expiresMs-now>370*DAY)return json(409,{error:'license_period_too_long'});
   const licenseId=old?.licenseId||'lic_'+hex(12);
   const claims={version:2,licenseId,customer:row.customer_name,installationId:row.installation_id,
    plan:'starter',maxProfiles:5,features:['profiles'],
    issuedAt:new Date(now).toISOString(),expiresAt:new Date(expiresMs).toISOString(),
    enforcementMode:'owner_sweep'};
   const keys=await issuerKeys(env);
   const token=await signToken(claims,keys.privateKey);
   const sealed=await seal(token,env);
   // Cloudflare D1 batch is transactional. No license updates unless the
   // order remains paid; retries return only the previously encrypted token.
   const statements=row.action==='new'
    ?[database.prepare(`INSERT INTO licenses
       (license_id,installation_id,expires_at,enforcement_mode,revoked,updated_at)
       SELECT ?, ?, ?, 'owner_sweep', 0, ? WHERE EXISTS
       (SELECT 1 FROM portal_orders WHERE order_id=? AND status='paid')`)
       .bind(licenseId,row.installation_id,claims.expiresAt,now,row.order_id)]
    :[database.prepare(`UPDATE licenses SET expires_at=?,revoked=0,updated_at=?
       WHERE license_id=? AND revoked=0 AND EXISTS
       (SELECT 1 FROM portal_orders WHERE order_id=? AND status='paid')`)
       .bind(claims.expiresAt,now,licenseId,row.order_id)];
   statements.push(database.prepare(`UPDATE portal_orders
     SET status='issued',license_id=?,expires_at=?,token_iv=?,token_ciphertext=?,issued_at=?
     WHERE order_id=? AND status='paid'`)
     .bind(licenseId,claims.expiresAt,sealed.iv,sealed.ciphertext,now,row.order_id));
   const result=await database.batch(statements);
   if(result[0]?.meta?.changes!==1||result[1]?.meta?.changes!==1){
    const latest=await getOrder(database,row.order_id);
    if(latest?.status==='issued')
     return json(200,{order:orderPublic(latest),token:await unseal(latest,env),alreadyIssued:true});
    return json(409,{error:'order_state_changed'});
   }
   return json(200,{order:orderPublic(await getOrder(database,row.order_id)),token});
  }
  return json(404,{error:'not_found'});
 }
 return {handle};
}
