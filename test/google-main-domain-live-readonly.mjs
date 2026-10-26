// Non-mutating, secret-free LIVE check of owner's chosen domain.
// Does not register users, start OAuth sessions, create orders, or deploy a Worker.
import dns from 'node:dns/promises';
const host='browser.lhmcrm.com';
const base='https://'+host;
async function check(path){
 try{
  const response=await fetch(base+path,{method:'GET',redirect:'manual',
   signal:AbortSignal.timeout(12000),headers:{accept:'text/html,application/json'}});
  const type=response.headers.get('content-type')||'';
  console.log(path+': HTTP '+response.status+', type='+(type||'none'));
  return {status:response.status,type,location:response.headers.get('location')};
 }catch(error){
  console.log(path+': UNREACHABLE '+(error?.cause?.code||error?.name||'network_error'));
  return {status:null,error:error?.cause?.code||error?.name||'network_error'};
 }
}
const r=await Promise.allSettled([dns.resolve4(host),dns.resolve6(host)]);
const dnsReady=r.some(x=>x.status==='fulfilled'&&x.value.length>0);
console.log('Production homepage DNS: '+(dnsReady?'RESOLVES':'NO A/AAAA RECORD'));
if(!dnsReady){process.exitCode=1;console.error('MAIN_DOMAIN_DNS_UNAVAILABLE');}
else{
 const home=await check('/');
 const plans=await check('/v2/plans');
 const portal=await check('/v2/portal');
 const admin=await check('/v2/admin/readiness');
 // Never pass Authorization or CF-Access headers. Never POST.
 const expectedAdminDenied=admin.status===401||admin.status===403;
 console.log('Main domain homepage reachable: '+(home.status!==null?'YES':'NO'));
 console.log('Google SaaS v2 API deployed: '+(plans.status===200?'YES':'NOT CONFIRMED'));
 console.log('Google customer portal: '+(portal.status===200?'YES':'NOT CONFIRMED'));
 console.log('Unauthenticated admin denied: '+(expectedAdminDenied?'YES':'NOT CONFIRMED'));
 if(home.status===null||plans.status!==200||portal.status!==200||!expectedAdminDenied){
  console.error('MAIN_DOMAIN_SAAS_NOT_READY: Domain and Google SaaS routing are separate requirements');
  process.exitCode=1;
 }
}
