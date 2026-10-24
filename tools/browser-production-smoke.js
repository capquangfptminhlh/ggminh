'use strict';
// Safe, read-only live smoke. Never send credentials, write orders or log secrets.
// Usage: node tools/browser-production-smoke.js https://browser.lhmcrm.com
const assert = require('node:assert/strict');
const {URL}=require('node:url');
async function run(target=process.argv[2]||'https://browser.lhmcrm.com'){
  const base=new URL(target);
  assert.equal(base.protocol,'https:','Production URL must use HTTPS');
  assert.equal(base.username,'');assert.equal(base.password,'');
  if(base.pathname!=='/'||base.search||base.hash)throw Error('Use production origin only');
  const fetchSafe=async(path)=>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    try{
      return await fetch(new URL(path,base),{method:'GET',redirect:'manual',
        headers:{'Accept':'application/json, text/html'},signal:controller.signal});
    }finally{clearTimeout(timeout);}
  };
  const home=await fetchSafe('/');
  assert.equal(home.status,200,'Portal home must respond 200 (check Cloudflare Access separately if enabled)');
  const html=await home.text();
  assert.match(home.headers.get('content-type')||'',/text\/html/i);
  assert.match(html,/LHM/i,'Expected application identification');
  assert.ok(home.headers.get('content-security-policy'),'Missing Content-Security-Policy');
  assert.equal(home.headers.get('access-control-allow-origin'),null,'Unexpected permissive CORS on portal');
  const unauth=await fetchSafe('/v1/admin/portal/summary');
  assert.ok([401,403].includes(unauth.status),'Unauthenticated admin summary must be rejected');
  const verify=await fetchSafe('/v1/verify');
  assert.ok([404,405].includes(verify.status),'Verification API must not accept GET');
  console.log(JSON.stringify({origin:base.origin,home:home.status,anonymousAdmin:unauth.status,
    verifyGet:verify.status,securityHeaders:'present',result:'PASS_READ_ONLY',note:'Does not verify D1, payments, signing, Cloudflare Access or Windows activation'}));
}
if(require.main===module)run().catch(e=>{console.error('Production smoke failed:',e.message);process.exitCode=1;});
module.exports={run};
