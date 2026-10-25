// Cloudflare staging public-publish guard: read-only control-plane checks.
// NO production Worker/D1 or customer order mutation. No secret values printed.
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const legacyId=process.env.LHM_D1_DATABASE_ID;
const script='lhm-browser-commerce-staging',dbName='lhm-browser-saas-staging';
if(typeof token!=='string'||token.length<20||
   typeof account!=='string'||!/^[0-9a-f]{32}$/i.test(account))
 throw Error('Cloudflare staging deployment secrets are absent');
const base='https://api.cloudflare.com/client/v4/accounts/'+account;
async function api(path,options={}){
 const response=await fetch(base+path,{...options,headers:{
  Authorization:'Bearer '+token,'content-type':'application/json',
  ...(options.headers||{})},signal:AbortSignal.timeout(22000)});
 if(!response.ok)throw Error('Cloudflare staging preflight API HTTP '+response.status);
 const body=await response.json();
 if(!body||body.success!==true)throw Error('Cloudflare staging preflight API rejected request');
 return body.result;
}
const all=await api('/d1/database?per_page=100');
if(!Array.isArray(all))throw Error('Unexpected Cloudflare D1 list');
const target=all.filter(row=>row.name===dbName);
if(target.length!==1)throw Error('Dedicated staging D1 must exist exactly once');
const id=target[0].uuid||target[0].id;
if(!/^[a-f0-9-]{36}$/i.test(id||'')||
   legacyId&&id.toLowerCase()===legacyId.toLowerCase())
 throw Error('Refusing live legacy or invalid staging D1 database');
const rows=await api('/d1/database/'+id+'/query',{
 method:'POST',body:JSON.stringify({sql:"SELECT enabled,max_profiles,seat_limit,price_vnd FROM plans_v2 WHERE plan_code='personal_30'"})
});
if(!Array.isArray(rows)||!Array.isArray(rows[0]?.results)||rows[0].results.length!==1)
 throw Error('Staging plan table missing');
const p=rows[0].results[0];
if(p.enabled!==0||p.max_profiles!==null||p.seat_limit!==2||p.price_vnd!==499000)
 throw Error('Public staging refuses active or unauthorized paid plan; disable it first');
const secrets=await api('/workers/scripts/'+script+'/secrets');
if(!Array.isArray(secrets))throw Error('Private staging Worker not initialized with secrets');
const present=new Set(secrets.map(row=>row.name));
const needed=['BROWSER_GOOGLE_CLIENT_ID','BROWSER_GOOGLE_CLIENT_SECRET',
 'BROWSER_SESSION_SECRET','BROWSER_LEASE_PRIVATE_PKCS8_B64',
 'BROWSER_LEASE_PUBLIC_SPKI_B64','BROWSER_BANK_BIN',
 'BROWSER_BANK_ACCOUNT_NO','BROWSER_BANK_ACCOUNT_NAME',
 'BROWSER_SAAS_ADMIN_TOKEN','BROWSER_SAAS_ACCESS_TEAM_DOMAIN',
 'BROWSER_SAAS_ACCESS_AUD'];
const missing=needed.filter(name=>!present.has(name));
if(missing.length)throw Error('Staging Worker lacks required secret names: '+missing.join(', '));
console.log('PASS: isolated private Worker and D1 exist, public staging paid plan OFF, all secrets provisioned (values withheld)');
