'use strict';
/**
 * Camoufox's native Firefox executable does not accept Chromium
 * --proxy-server / embedded credentials. Configure its isolated Firefox
 * user.js to use a loopback HTTP CONNECT gateway already supported by LHM.
 *
 * This is HTTPS CONNECT only. Proxy routing / DNS / WebRTC require a
 * separately authorized Windows lab before being called verified.
 */
const {updateGeckoProxy}=require('./geckoProxy');
const {createAuthenticatedSocksGateway}=require('./authenticatedSocksGateway');
const {createAuthenticatedHttpGateway}=require('./authenticatedHttpGateway');

function normalizedProxy(proxy){
 if(proxy===undefined||proxy===null)return {type:'direct'};
 if(!proxy||typeof proxy!=='object'||Array.isArray(proxy))
  throw Error('Invalid Camoufox proxy configuration');
 if(proxy.user!==undefined||proxy.pass!==undefined||
    proxy.username!==undefined||proxy.password!==undefined)
  throw Error('Camoufox proxy credentials must be in the encrypted Proxy Center vault, not profile fields');
 if(['direct','none'].includes(proxy.type)){
  if(proxy.authProxyId||proxy.host||proxy.port)
   throw Error('Direct Camoufox profile contains unexpected proxy configuration');
  return {type:'direct'};
 }
 if(!['http','socks5'].includes(proxy.type))
  throw Error('Unsupported Camoufox proxy type');
 if(typeof proxy.host!=='string'||!proxy.host||!Number.isInteger(Number(proxy.port))||
    Number(proxy.port)<1||Number(proxy.port)>65535)
  throw Error('Invalid Camoufox proxy host or port');
 if(typeof proxy.authProxyId!=='string'||!proxy.authProxyId)
  throw Error('Camoufox configured proxy requires a credential reference in Proxy Center; no direct fallback');
 return {type:proxy.type,host:proxy.host,port:Number(proxy.port),
  authProxyId:proxy.authProxyId};
}

async function prepareCamoufoxProxy(profile,profileDir,{
 store=null,proxyVault=null,applyPrefs=updateGeckoProxy,
 createSocksGateway=createAuthenticatedSocksGateway,
 createHttpGateway=createAuthenticatedHttpGateway
}={}){
 const proxy=normalizedProxy(profile?.proxy);
 if(proxy.type==='direct'){
  applyPrefs(profileDir,{type:'direct'});
  return {mode:'direct',gateway:null,close:async()=>{}};
 }
 if(!store||!proxyVault||!Array.isArray(store.data?.proxies)||
    typeof proxyVault.get!=='function')
  throw Error('Camoufox configured proxy requires the authorized Proxy Center vault; no direct fallback');
 const saved=store.data.proxies.find(x=>x.id===proxy.authProxyId);
 if(!saved||saved.type!==proxy.type||saved.host!==proxy.host||
    Number(saved.port)!==proxy.port)
  throw Error('Camoufox upstream proxy changed or was removed; reassign it in Proxy Center');
 const secret=proxyVault.get(proxy.authProxyId);
 if(!secret||typeof secret.user!=='string'||!secret.user||
    typeof secret.pass!=='string'||!secret.pass)
  throw Error('Camoufox proxy credentials missing from encrypted vault; no direct fallback');
 let gateway=null;
 try{
  // The existing gateways listen exclusively on 127.0.0.1 and support only
  // HTTPS CONNECT. SOCKS destinations are sent as hostnames to upstream.
  const config={type:proxy.type,host:proxy.host,port:proxy.port,
   user:secret.user,pass:secret.pass};
  gateway=await (proxy.type==='socks5'?createSocksGateway:createHttpGateway)(config);
  if(gateway?.host!=='127.0.0.1'||!Number.isInteger(gateway.port)||
     gateway.port<1||gateway.port>65535||typeof gateway.close!=='function')
   throw Error('Authenticated proxy gateway did not bind a valid loopback listener');
  applyPrefs(profileDir,{type:'http',host:'127.0.0.1',port:gateway.port});
  return {mode:'authenticated-connect',gateway,close:()=>gateway.close()};
 }catch(error){
  if(gateway&&typeof gateway.close==='function'){
   try{await gateway.close();}catch(_){}
  }
  throw error;
 }
}
module.exports={prepareCamoufoxProxy,normalizedProxy};
