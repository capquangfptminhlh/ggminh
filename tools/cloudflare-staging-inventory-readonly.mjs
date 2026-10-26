// Read-only Cloudflare inventory. NEVER print secrets, IDs, DNS values,
 // customer lists, worker source code or database rows.
 // Does not deploy, migrate, edit DNS or issue purchases.
const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(typeof token!=='string'||!token||typeof account!=='string'||
   !/^[a-f0-9]{32}$/i.test(account))throw Error('CLOUDFLARE_INPUT_MISSING');
const host='browser.lhmcrm.com',zoneName='lhmcrm.com';
async function read(path){
 try{
  const resp=await fetch('https://api.cloudflare.com/client/v4'+path,{
   headers:{Authorization:'Bearer '+token,'Accept':'application/json'},
   redirect:'error',signal:AbortSignal.timeout(16000)});
  if(!resp.ok)return {ok:false,status:resp.status};
  const obj=await resp.json();
  return obj?.success===true?{ok:true,result:obj.result}:{ok:false,status:resp.status};
 }catch(_){return {ok:false,status:0};}
}
const d1=await read('/accounts/'+account+'/d1/database?per_page=100');
const workers=await read('/accounts/'+account+'/workers/scripts');
const zones=await read('/zones?name='+zoneName+'&per_page=50');
const d1List=Array.isArray(d1.result)?d1.result:null;
const workerList=Array.isArray(workers.result)?workers.result:null;
const zoneList=Array.isArray(zones.result)?zones.result:null;
const zone=zoneList?.find(z=>z.name===zoneName&&typeof z.id==='string');
const domain=zone?await read('/zones/'+zone.id+'/dns_records?name='+host+'&per_page=100'):null;
const routes=zone?await read('/zones/'+zone.id+'/workers/routes?per_page=100'):null;
const dnsList=Array.isArray(domain?.result)?domain.result:null;
const routeList=Array.isArray(routes?.result)?routes.result:null;
const status=(v)=>v===null?'UNKNOWN':v?'YES':'NO';
const stagedD1=d1List===null?null:d1List.some(x=>x.name==='lhm-browser-saas-staging');
const stagedWorker=workerList===null?null:workerList.some(x=>x.id==='lhm-browser-commerce-staging'||x.name==='lhm-browser-commerce-staging');
const zoneFound=zoneList===null?null:!!zone;
const dnsFound=dnsList===null?null:dnsList.some(x=>x.name===host&&['A','AAAA','CNAME'].includes(x.type));
const v2Route=routeList===null?null:routeList.some(x=>x.pattern===host+'/v2/*');
const dangerousWholeHost=routeList===null?null:routeList.some(x=>x.pattern===host||x.pattern===host+'/*');
console.log('STAGING_D1_EXISTS='+status(stagedD1));
console.log('STAGING_WORKER_EXISTS='+status(stagedWorker));
console.log('ZONE_ACCESSIBLE='+status(zoneFound));
console.log('BROWSER_HOST_DNS_RECORD_EXISTS='+status(dnsFound));
console.log('V2_WORKER_ROUTE_EXISTS='+status(v2Route));
console.log('WHOLE_HOST_WORKER_ROUTE_EXISTS='+status(dangerousWholeHost));
console.log('No Cloudflare account, Worker, D1, zone or DNS mutation performed.');
