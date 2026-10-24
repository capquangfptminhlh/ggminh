/* Private sales administration for browser.lhmcrm.com.
 * Authentication is enforced by the parent Worker BEFORE dispatch. All
 * payment confirmations are explicitly MANUAL; never trust customer clicks.
 * Signed keys can be derived again from stored CLAIMS, but signed token,
 * card details and issuer key never enter the D1 database.
 */
const enc=new TextEncoder();
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIC=/^lic_[a-f0-9]{24}$/;
const ORDER=/^ord_[0-9a-f]{24}$/;
const CUSTOMER=/^cus_[0-9a-f]{24}$/;
const plans=new Set(['starter','pro','business']);
const featuresAllowed=new Set(['profiles','automation','api','team']);
function goodText(x,n=120){return typeof x==='string'&&x.trim().length>0&&x.length<=n;}
function failure(status,code){return {status,error:code};}
function encode64(b){
 let t='';for(const v of b)t+=String.fromCharCode(v);
 return btoa(t).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function signedLicense(claims,keys,stableClaims){
 const normalized=stableClaims(claims);
 const message='lhmlic1.'+encode64(enc.encode(normalized));
 const sig=await crypto.subtle.sign('Ed25519',keys.privateKey,enc.encode(message));
 return message+'.'+encode64(new Uint8Array(sig));
}
function uuid(prefix){return prefix+Array.from(crypto.getRandomValues(new Uint8Array(12)),v=>v.toString(16).padStart(2,'0')).join('');}
const QUERY_CUSTOMERS='SELECT id, name, email, created_at AS createdAt FROM sales_customers ORDER BY created_at DESC LIMIT 200';
const QUERY_ORDERS=`SELECT o.id, o.customer_id AS customerId, c.name AS customerName,
o.kind, o.plan, o.months, o.amount_vnd AS amountVnd, o.state,
o.installation_id AS installationId, o.prior_license_id AS priorLicenseId,
o.max_profiles AS maxProfiles, o.features_json AS featuresJson,
o.payment_reference AS paymentReference, o.paid_at AS paidAt,
o.license_id AS licenseId, o.created_at AS createdAt
FROM sales_orders o JOIN sales_customers c ON c.id=o.customer_id
ORDER BY o.created_at DESC LIMIT 200`;
const FIND_ORDER=`SELECT id,customer_id AS customerId,kind,prior_license_id AS priorLicenseId,
installation_id AS installationId,plan,months,max_profiles AS maxProfiles,
features_json AS featuresJson,amount_vnd AS amountVnd,state,
license_id AS licenseId FROM sales_orders WHERE id=?`;
async function order(database,id){return database.prepare(FIND_ORDER).bind(id).first();}
async function issued(database,id){
 return database.prepare('SELECT claims_json AS claimsJson FROM sales_issued_keys WHERE order_id=?').bind(id).first();
}
function expiryFor(row,now,previous){
 let base=now;
 if(row.kind==='renew'){
  if(!previous)return null;
  base=Math.max(now,Date.parse(previous.expiresAt));
 }
 const end=new Date(base);
 end.setUTCMonth(end.getUTCMonth()+row.months);
 const expiresAt=end.toISOString();
 if(Date.parse(expiresAt)-now>370*86400000)return null;
 return expiresAt;
}
function validatedFeatures(arr){
 return Array.isArray(arr)&&arr.length>0&&arr.length<=4&&
  arr.every(x=>featuresAllowed.has(x))&&
  JSON.stringify(arr)===JSON.stringify([...new Set(arr)].sort());
}
export async function commerce(database,now,keys,stableClaims,input){
 const action=input?.action;
 if(typeof action!=='string')return failure(400,'invalid_action');
 if(action==='customers.list'){
  const results=await database.prepare(QUERY_CUSTOMERS).all();
  return {status:200,customers:results.results||[]};
 }
 if(action==='orders.list'){
  const results=await database.prepare(QUERY_ORDERS).all();
  return {status:200,orders:(results.results||[]).map(x=>({
   ...x,features:JSON.parse(x.featuresJson),featuresJson:undefined
  }))};
 }
 if(action==='customer.create'){
  if(!goodText(input.name,120)||!goodText(input.email,190)||
     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
   return failure(400,'invalid_customer');
  const id=uuid('cus_');
  await database.prepare('INSERT INTO sales_customers(id,name,email,created_at) VALUES(?,?,?,?)')
   .bind(id,input.name.trim(),input.email.trim().toLowerCase(),now).run();
  return {status:201,customer:{id,name:input.name.trim(),email:input.email.trim().toLowerCase()}};
 }
 if(action==='order.create'){
  if(!CUSTOMER.test(input.customerId||'')||!ID.test(input.installationId||'')||
     !plans.has(input.plan)||!Number.isInteger(input.months)||input.months<1||input.months>12||
     !Number.isInteger(input.maxProfiles)||input.maxProfiles<1||input.maxProfiles>10000||
     !Number.isSafeInteger(input.amountVnd)||input.amountVnd<=0||input.amountVnd>1000000000||
     !['new','renew'].includes(input.kind)||!validatedFeatures(input.features))
   return failure(400,'invalid_order');
  const customer=await database.prepare('SELECT id FROM sales_customers WHERE id=?').bind(input.customerId).first();
  if(!customer)return failure(404,'customer_not_found');
  let priorId=null;
  if(input.kind==='renew'){
   priorId=input.priorLicenseId;
   if(!LIC.test(priorId||''))return failure(400,'missing_prior_license');
   const previous=await database.prepare('SELECT k.claims_json AS claimsJson FROM sales_issued_keys k WHERE k.license_id=? AND k.customer_id=?')
    .bind(priorId,input.customerId).first();
   if(!previous)return failure(403,'prior_license_not_owned');
   const claims=JSON.parse(previous.claimsJson);
   if(claims.installationId.toLowerCase()!==input.installationId.toLowerCase())
    return failure(409,'installation_mismatch');
  }else if(input.priorLicenseId!==undefined&&input.priorLicenseId!==null&&input.priorLicenseId!=='')
   return failure(400,'unexpected_prior_license');
  const id=uuid('ord_');
  await database.prepare(`INSERT INTO sales_orders
   (id,customer_id,kind,prior_license_id,installation_id,plan,months,max_profiles,features_json,amount_vnd,state,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?,?)`)
   .bind(id,input.customerId,input.kind,priorId,input.installationId,
    input.plan,input.months,input.maxProfiles,JSON.stringify(input.features),
    input.amountVnd,now,now).run();
  return {status:201,orderId:id,state:'pending',amountVnd:input.amountVnd};
 }
 if(action==='payment.confirm'){
  if(!ORDER.test(input.orderId||'')||!goodText(input.reference,100)||
     !/^[a-zA-Z0-9\-_/.: ]+$/.test(input.reference))
   return failure(400,'invalid_payment');
  const existing=await order(database,input.orderId);
  if(!existing)return failure(404,'order_not_found');
  if(existing.state!=='pending')return failure(409,'not_pending');
  // The owner must verify the actual bank settlement independently.
  // The presence of a customer-supplied receipt or reference is NOT proof.
  const result=await database.prepare(`UPDATE sales_orders
    SET state='paid',payment_reference=?,paid_at=?,updated_at=?
    WHERE id=? AND state='pending'`)
   .bind(input.reference.trim(),now,now,input.orderId).run();
  if(result.meta?.changes!==1)return failure(409,'already_processed');
  return {status:200,orderId:input.orderId,state:'paid'};
 }
 if(action==='license.issue'||action==='license.key'){
  if(!ORDER.test(input.orderId||''))return failure(400,'invalid_order');
  const row=await order(database,input.orderId);
  if(!row)return failure(404,'order_not_found');
  if(row.state==='fulfilled'){
   const old=await issued(database,row.id);
   if(!old)return failure(503,'ledger_inconsistent');
   const claims=JSON.parse(old.claimsJson);
   return {status:200,orderId:row.id,licenseId:claims.licenseId,
    expiresAt:claims.expiresAt,state:'fulfilled',
    token:await signedLicense(claims,keys,stableClaims)};
  }
  if(action==='license.key')return failure(409,'order_not_fulfilled');
  if(row.state!=='paid')return failure(409,'payment_not_confirmed');
  const customer=await database.prepare('SELECT name FROM sales_customers WHERE id=?')
   .bind(row.customerId).first();
  if(!customer)return failure(503,'customer_missing');
  let previous=null;
  if(row.kind==='renew'){
   const prev=await database.prepare('SELECT claims_json AS claimsJson FROM sales_issued_keys WHERE license_id=? AND customer_id=?')
    .bind(row.priorLicenseId,row.customerId).first();
   if(!prev)return failure(403,'prior_license_not_owned');
   previous=JSON.parse(prev.claimsJson);
   if(previous.installationId.toLowerCase()!==row.installationId.toLowerCase())
    return failure(409,'installation_mismatch');
  }
  const expiresAt=expiryFor(row,now,previous);
  if(!expiresAt)return failure(409,'renewal_too_early');
  const claims={version:2,licenseId:uuid('lic_'),customer:customer.name,
   installationId:row.installationId,plan:row.plan,maxProfiles:row.maxProfiles,
   features:JSON.parse(row.featuresJson),issuedAt:new Date(now).toISOString(),
   expiresAt,enforcementMode:'owner_sweep'};
  const token=await signedLicense(claims,keys,stableClaims);
  // D1 batch is transactional. Concurrent operator requests cannot issue
  // two keys for the same paid order: UPDATE guards state and INSERTs
  // depend on its unique license_id. A subsequent license.key recovers
  // the exact signed token from canonical claims after lost responses.
  const batch=await database.batch([
   database.prepare(`UPDATE sales_orders SET state='fulfilled',license_id=?,updated_at=?
     WHERE id=? AND state='paid'`).bind(claims.licenseId,now,row.id),
   database.prepare(`INSERT INTO licenses
     (license_id,installation_id,expires_at,enforcement_mode,revoked,updated_at)
     SELECT ?,?,?,'owner_sweep',0,? WHERE EXISTS
     (SELECT 1 FROM sales_orders WHERE id=? AND license_id=?)`)
    .bind(claims.licenseId,row.installationId,expiresAt,now,row.id,claims.licenseId),
   database.prepare(`INSERT INTO sales_issued_keys
     (license_id,order_id,customer_id,claims_json,created_at)
     SELECT ?,?,?,?,? WHERE EXISTS
     (SELECT 1 FROM sales_orders WHERE id=? AND license_id=?)`)
    .bind(claims.licenseId,row.id,row.customerId,JSON.stringify(claims),
      now,row.id,claims.licenseId)
  ]);
  if(batch[0]?.meta?.changes!==1){
   const settled=await issued(database,row.id);
   if(!settled)return failure(409,'concurrent_issue_retry');
   const current=JSON.parse(settled.claimsJson);
   return {status:200,orderId:row.id,licenseId:current.licenseId,
    expiresAt:current.expiresAt,state:'fulfilled',
    token:await signedLicense(current,keys,stableClaims)};
  }
  if(batch[1]?.meta?.changes!==1||batch[2]?.meta?.changes!==1)
   return failure(503,'ledger_inconsistent');
  return {status:200,orderId:row.id,licenseId:claims.licenseId,
   expiresAt,state:'fulfilled',token};
 }
 return failure(404,'unknown_action');
}
