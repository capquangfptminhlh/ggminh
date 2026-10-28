/* Cloudflare Access gate for Browser v2 finance/admin API.
 * Every admin request MUST have both an independently verified Access JWT
 * and the dedicated SaaS Bearer secret. This is not used for customer OAuth.
 */
const decoder=new TextDecoder();
function decodeBase64url(text,max=12000){
 if(typeof text!=='string'||text.length<1||text.length>max||
    !/^[A-Za-z0-9_-]+$/.test(text))throw Error('invalid_access_assertion');
 const value=text.replace(/-/g,'+').replace(/_/g,'/');
 const decoded=atob(value+'='.repeat((4-value.length%4)%4));
 const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
 let canonical='';for(const b of bytes)canonical+=String.fromCharCode(b);
 if(btoa(canonical).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')!==text)
  throw Error('invalid_access_assertion');
 return bytes;
}
export async function verifySaasAdminAccess(req,env,{fetcher=fetch,now=Date.now()}={}){
 const domain=env?.BROWSER_SAAS_ACCESS_TEAM_DOMAIN;
 const aud=env?.BROWSER_SAAS_ACCESS_AUD;
 if(typeof domain!=='string'||!/^[-a-z0-9]{1,63}\.cloudflareaccess\.com$/.test(domain)||
    typeof aud!=='string'||!/^[A-Za-z0-9_-]{20,128}$/.test(aud)||
    !Number.isSafeInteger(now)||now<0)return false;
 const assertion=req.headers.get('cf-access-jwt-assertion');
 if(typeof assertion!=='string'||assertion.length>12000)return false;
 const parts=assertion.split('.');if(parts.length!==3)return false;
 try{
  const header=JSON.parse(decoder.decode(decodeBase64url(parts[0],2000)));
  const claims=JSON.parse(decoder.decode(decodeBase64url(parts[1],6000)));
  const issuer='https://'+domain;
  if(header.alg!=='RS256'||typeof header.kid!=='string'||
    header.kid.length>160||header.kid.length<3||
    claims.iss!==issuer||!Array.isArray(claims.aud)||!claims.aud.includes(aud)||
    !Number.isSafeInteger(claims.exp)||claims.exp*1000<=now||
    !Number.isSafeInteger(claims.iat)||claims.iat*1000>now+60000||
    claims.iat*1000<now-2*86400000||
    (claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf*1000>now+60000)))
    return false;
  const response=await fetcher(issuer+'/cdn-cgi/access/certs',{
    method:'GET',redirect:'error'});
  if(!response.ok)return false;
  const data=await response.json();
  const jwk=Array.isArray(data.keys)?data.keys.find(key=>
    key.kid===header.kid&&key.kty==='RSA'&&
    (!key.alg||key.alg==='RS256')&&(!key.use||key.use==='sig')):null;
  if(!jwk)return false;
  const key=await crypto.subtle.importKey('jwk',jwk,
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,
    decodeBase64url(parts[2],5000),new TextEncoder().encode(parts[0]+'.'+parts[1]));
 }catch(_){return false;}
}
