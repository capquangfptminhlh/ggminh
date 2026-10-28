'use strict';
const assert=require('node:assert/strict');
const nodeCrypto=require('node:crypto');
let verifySaasAdminAccess;
const key=nodeCrypto.generateKeyPairSync('rsa',{modulusLength:2048});
const kid='merchant-key-2026',aud='a'.repeat(64),domain='lhm-test.cloudflareaccess.com';
const now=Date.parse('2026-10-26T01:00:00Z');
const b64=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign=(claims,header={alg:'RS256',kid})=>{
 const body=b64(header)+'.'+b64(claims);
 return body+'.'+nodeCrypto.sign('RSA-SHA256',Buffer.from(body),key.privateKey).toString('base64url');
};
const claims={iss:'https://'+domain,aud:[aud],iat:Math.floor(now/1000)-50,
 exp:Math.floor(now/1000)+300,sub:'operator',type:'app'};
let opens=0;
const fetcher=async(uri,init)=>{
 assert.equal(uri,'https://'+domain+'/cdn-cgi/access/certs');
 assert.equal(init.redirect,'error');opens++;
 return new Response(JSON.stringify({keys:[{...key.publicKey.export({format:'jwk'}),kid,kty:'RSA',use:'sig',alg:'RS256'}]}),
  {status:200,headers:{'content-type':'application/json'}});
};
const req=jwt=>new Request('https://browser-staging.lhmcrm.com/v2/admin/orders',{
 headers:{'Cf-Access-Jwt-Assertion':jwt}});
(async()=>{
 ({verifySaasAdminAccess}=await import('../serverless/license-worker/src/googleAdminAccess.mjs'));
 const env={BROWSER_SAAS_ACCESS_AUD:aud,BROWSER_SAAS_ACCESS_TEAM_DOMAIN:domain};
 assert.equal(await verifySaasAdminAccess(req(sign(claims)),env,{fetcher,now}),true);
 assert(opens>0);
 const denied=[
  [sign({...claims,aud:['b'.repeat(64)]}),env],
  [sign({...claims,iss:'https://attacker.cloudflareaccess.com'}),env],
  [sign({...claims,exp:Math.floor(now/1000)-1}),env],
  [sign({...claims,iat:Math.floor(now/1000)-3*86400}),env],
  [sign({...claims,nbf:Math.floor(now/1000)+999}),env],
  [sign(claims,{alg:'HS256',kid}),env],
  [sign(claims,{alg:'RS256',kid:'unknown'}),env],
  [sign(claims),{...env,BROWSER_SAAS_ACCESS_AUD:''}],
  [sign(claims),{...env,BROWSER_SAAS_ACCESS_TEAM_DOMAIN:'attacker.example'}],
  [sign(claims).slice(0,-2)+'xx',env]
 ];
 for(const [jwt,cfg] of denied)
  assert.equal(await verifySaasAdminAccess(req(jwt),cfg,{fetcher,now}),false,
   'invalid/mismatched Access claim must fail closed');
 assert.equal(await verifySaasAdminAccess(req(''),env,{fetcher,now}),false);
 assert.equal(await verifySaasAdminAccess(new Request('https://browser-staging.lhmcrm.com/'),env,{fetcher,now}),false);
 console.log('PASS: Cloudflare Access admin JWT RS256 verifies actual signature and blocks spoofed audience, issuer, time, key, algorithm and missing assertion');
})().catch(e=>{console.error(e);process.exitCode=1;});
