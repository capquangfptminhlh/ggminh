import assert from 'node:assert/strict';
const required=['BROWSER_GOOGLE_CLIENT_ID','BROWSER_GOOGLE_CLIENT_SECRET',
 'BROWSER_SESSION_SECRET','BROWSER_LEASE_PRIVATE_PKCS8_B64',
 'BROWSER_LEASE_PUBLIC_SPKI_B64','BROWSER_BANK_BIN',
 'BROWSER_BANK_ACCOUNT_NO','BROWSER_BANK_ACCOUNT_NAME',
 'BROWSER_SAAS_ADMIN_TOKEN','BROWSER_SAAS_ACCESS_TEAM_DOMAIN',
 'BROWSER_SAAS_ACCESS_AUD'];
const stage='11111111-1111-4111-8111-111111111111';
const prod='22222222-2222-4222-8222-222222222222';
const save={...process.env};
process.env.CLOUDFLARE_API_TOKEN='test-token-with-several-safe-digits';
process.env.CLOUDFLARE_ACCOUNT_ID='a'.repeat(32);
process.env.LHM_D1_DATABASE_ID=prod;
const makeResponse=result=>new Response(JSON.stringify({success:true,result}),{
 status:200,headers:{'content-type':'application/json'}});
async function scenario(caseName,{dbId=stage,enabled=0,profiles=null,missing=null,sessionTable=true}={}){
 const old=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert(options.headers.Authorization.startsWith('Bearer test-token'));
  if(url.endsWith('/d1/database?per_page=100'))
   return makeResponse([{name:'lhm-browser-saas-staging',uuid:dbId}]);
  if(url.endsWith('/d1/database/'+dbId+'/query')){
   assert.equal(options.method,'POST');
   const statement=JSON.parse(options.body).sql;
   if(statement.includes("google_web_sessions_v2"))
    return makeResponse([{results:sessionTable?[{name:'google_web_sessions_v2'}]:[]}]);
   return makeResponse([{results:[{
    enabled,max_profiles:profiles,seat_limit:2,price_vnd:499000
   }]}]);
  }
  if(url.endsWith('/workers/scripts/lhm-browser-commerce-staging/secrets'))
   return makeResponse(required.filter(x=>x!==missing).map(name=>({name})));
  throw Error('Unexpected endpoint '+url);
 };
 try{
  await import('../tools/browser-saas-staging-public-preflight.mjs?case='+caseName);
 }finally{globalThis.fetch=old;}
}
try{
 await scenario('valid');
 await assert.rejects(()=>scenario('wrong-db',{dbId:prod}),/Refusing live legacy/);
 await assert.rejects(()=>scenario('enabled',{enabled:1,profiles:100}),/refuses active/);
 await assert.rejects(()=>scenario('secret',{missing:'BROWSER_SAAS_ACCESS_AUD'}),/lacks required secret names/);
 await assert.rejects(()=>scenario('no-session-table',{sessionTable:false}),/revocation migration missing/);
 console.log('PASS: public staging preflight rejects production DB, live paid plans and missing Cloudflare Access secrets');
}finally{
 for(const key of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','LHM_D1_DATABASE_ID']){
  if(save[key]===undefined)delete process.env[key];else process.env[key]=save[key];
 }
}
