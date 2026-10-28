import fs from 'node:fs';
const name='lhm-browser-saas-staging';
const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!token||!account||!process.env.GITHUB_OUTPUT)throw Error('Missing operator-provisioned Cloudflare credentials or GH output');
if(!/^[0-9a-f]{32}$/.test(account)||!/^[-_A-Za-z0-9]{20,200}$/.test(token))throw Error('Malformed Cloudflare credential environment');
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database';
async function request(url,options={}){
 const response=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,'content-type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Cloudflare staging D1 API HTTP '+response.status);
 const data=await response.json();
 if(data?.success!==true)throw Error('Cloudflare staging D1 rejected the request');
 return data;
}
const listed=await request(base+'?per_page=100');
if(!Array.isArray(listed.result))throw Error('Unexpected Cloudflare D1 list response');
let row=listed.result.find(x=>x.name===name);
if(!row){
 const total=listed.result_info?.total_count;
 if(typeof total==='number'&&total>100)throw Error('D1 listing exceeds 100; refusing possible duplicate');
 const created=await request(base,{method:'POST',body:JSON.stringify({name})});
 row=created.result;
}
const uuid=row?.uuid||row?.id;
if(typeof uuid!=='string'||!/^[0-9a-f-]{36}$/i.test(uuid))throw Error('Cloudflare returned invalid staging D1 UUID');
if(process.env.LHM_D1_DATABASE_ID&&uuid.toLowerCase()===process.env.LHM_D1_DATABASE_ID.toLowerCase())
 throw Error('Refusing to use production LICENSE_DB identifier');
fs.appendFileSync(process.env.GITHUB_OUTPUT,'d1_id='+uuid+'\n');
console.log('Isolated Browser SaaS staging D1 exists (UUID withheld)');
