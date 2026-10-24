'use strict';
// Safe, read-only live smoke. Never send credentials, write orders or log secrets.
// Usage: node tools/browser-production-smoke.js https://browser.lhmcrm.com
const assert = require('node:assert/strict');
const {URL}=require('node:url');
const crypto=require('node:crypto');
const {PUBLIC_KEY}=require('../src/licensing/manager');
const WINDOWS_ISSUER_SPKI_SHA256=crypto.createHash('sha256').update(
 crypto.createPublicKey(PUBLIC_KEY).export({format:'der',type:'spki'})
).digest('hex');
function assertIssuerMatch(health){
 assert.equal(health?.status,'ok','Live D1/issuer readiness is degraded');
 assert.equal(health.issuerKeySha256,WINDOWS_ISSUER_SPKI_SHA256,
  'Cloudflare issuer is not the signing key trusted by installed Windows clients');
 return true;
}

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
  const health=await fetchSafe('/health');
  assert.equal(health.status,200,'Live D1/issuer readiness health must be 200');
  const healthResult=await health.json();
  assertIssuerMatch(healthResult);
  const unauth=await fetchSafe('/v1/admin/portal/summary');
  assert.ok([401,403].includes(unauth.status),'Unauthenticated admin summary must be rejected');
  const verify=await fetchSafe('/v1/verify');
  assert.ok([404,405].includes(verify.status),'Verification API must not accept GET');
  console.log(JSON.stringify({origin:base.origin,home:home.status,health:health.status,anonymousAdmin:unauth.status,
    verifyGet:verify.status,securityHeaders:'present',issuerTrust:'MATCHES_WINDOWS_CLIENT',result:'PASS_READ_ONLY',note:'Health checks D1 readiness and configured issuer fingerprint; does NOT prove client activation, bank payments, Cloudflare Access or installed Windows'}));
}
if(require.main===module)run().catch(e=>{console.error('Production smoke failed:',e.message);process.exitCode=1;});
module.exports={run,assertIssuerMatch,WINDOWS_ISSUER_SPKI_SHA256};
