// Read-only public smoke of isolated Gmail staging. Never sends credentials,
// creates an order, triggers payment, performs account login or writes D1.
// The CI job is intentionally RED until the real staging hostname is live.
import dns from 'node:dns/promises';
// Customer-approved hostname. The smoke check is read-only and cannot deploy.
const host='browser.lhmcrm.com',origin='https://'+host;
function fail(kind,detail){
 console.error('LIVE_STAGING_'+kind+': '+detail);
 process.exitCode=1;
}
async function probe(path){
 const abort=AbortSignal.timeout(15000);
 return fetch(origin+path,{method:'GET',redirect:'manual',signal:abort,
  headers:{accept:'application/json,text/html'}});
}
try{
 try{
  const records=await Promise.allSettled([dns.resolve4(host),dns.resolve6(host)]);
  if(!records.some(r=>r.status==='fulfilled'&&r.value.length))
   throw Error('Public DNS A/AAAA for '+host+' not resolvable');
  console.log('PASS: real public staging hostname resolves in DNS');
 }catch(e){fail('DNS_NOT_READY',e.message);process.exit();}
 const home=await probe('/');
 if(home.status>=500)throw Error('Existing browser.lhmcrm.com homepage HTTP '+home.status);
 console.log('PASS: existing primary browser host responds (HTTP '+home.status+')');
 const plans=await probe('/v2/plans');
 if(plans.status!==200)throw Error('/v2/plans HTTP '+plans.status);
 const data=await plans.json();
 if(!Array.isArray(data?.plans)||data.plans.length!==0)
  throw Error('Staging must display NO enabled paid plans before acceptance');
 console.log('PASS: live staging HTTPS and NO paid plans');
 const deny=await probe('/v2/admin/readiness');
 if(deny.status!==401)throw Error('Unauthenticated admin endpoint returned HTTP '+deny.status);
 console.log('PASS: live staging rejects unprivileged admin');
 const portal=await probe('/v2/portal');
 if(portal.status!==200)throw Error('Portal HTTP '+portal.status);
 console.log('PASS: live staging Google customer portal HTTP 200');
 const login=await probe('/v2/auth/google/start');
 const dest=login.headers.get('location');
 if(login.status!==302||!dest||new URL(dest).origin!=='https://accounts.google.com')
  throw Error('Google OAuth did not issue expected Google HTTPS redirect');
 console.log('PASS: live staging OAuth start redirects to real Google (NOT a completed sign-in)');
}catch(e){fail('HTTP_NOT_READY',e instanceof Error?e.message:'Unknown HTTPS error');}
