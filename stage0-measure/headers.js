'use strict';
const SAFE_HEADERS=Object.freeze(['user-agent','accept-language','accept','sec-fetch-site','sec-fetch-mode','sec-fetch-dest']);
function observedHeaders(req){
 const headers={};
 for(const name of SAFE_HEADERS){
  const value=req.headers?.[name];headers[name]=typeof value==='string'?value.slice(0,512):null;
 }
 const address=String(req.socket?.remoteAddress||'');
 return {method:req.method,headers,
  clientIsLoopback:['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address),
  classification:'SYNTHETIC_LOOPBACK_REQUEST',headerWhitelist:SAFE_HEADERS};
}
async function browserHeaders(page){
 if(!page||typeof page.evaluate!=='function')throw Error('Browser page required');
 return page.evaluate(async()=>{
  const response=await fetch('/stage0/headers',{method:'GET',cache:'no-store'});
  if(!response.ok)throw Error('Local header evidence endpoint unavailable');
  return response.json();
 });
}
function compareHeaders(snapshot,server){
 if(!snapshot||!server?.headers)throw Error('Snapshot and server header evidence required');
 const ua=server.headers['user-agent']||'',lang=server.headers['accept-language']||'';
 const primary=lang.split(',')[0]?.split(';')[0]?.trim()?.toLowerCase()||'';
 const matchUA=ua===snapshot.userAgent,matchLang=primary===String(snapshot.language||'').toLowerCase();
 return {classification:'OBSERVED_NOT_NETWORK_CERTIFICATION',
  requestObserved:server.method==='GET'&&server.clientIsLoopback===true,
  userAgentHeaderMatchesNavigator:matchUA,acceptLanguagePrimaryMatchesNavigator:matchLang,
  headerUserAgent:ua,acceptLanguage:lang,secFetchSite:server.headers['sec-fetch-site'],
  clientIsLoopback:server.clientIsLoopback===true,
  alert:matchUA&&matchLang?'NONE':'CLIENT_SERVER_MISMATCH',
  caveat:'Header matching does not certify proxy egress or unlinkability'};
}
module.exports={SAFE_HEADERS,observedHeaders,browserHeaders,compareHeaders};
