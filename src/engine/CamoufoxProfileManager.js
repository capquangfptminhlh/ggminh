'use strict';
/**
 * Explicit Firefox preferences for Playwright-controlled Camoufox.
 * No unsupported "camoufox.geoip" preference: geolocation must be
 * verified using supported Playwright APIs + authorized lab evidence.
 * Do not overwrite unrelated user.js files.
 */
const path=require('path');
const {normalizedProxy}=require('./camoufoxProxyPlan');

function firefoxPrefs(profile,proxyPlan){
 const proxy=normalizedProxy(profile?.proxy);
 if(profile?.geoip===true||profile?.geoip?.enabled===true||
    profile?.geolocation?.mode==='proxy')
  throw Error('Unsupported automatic Camoufox GeoIP preference');
 if(proxy.type==='direct'){
  if(proxyPlan?.mode && proxyPlan.mode!=='direct')
   throw Error('Unexpected proxy gateway for a direct profile');
  return Object.freeze({
   'network.proxy.type':0,
   'network.proxy.socks_remote_dns':true
  });
 }
 if(!proxyPlan||proxyPlan.mode!=='authenticated-connect'||
    proxyPlan.gateway?.host!=='127.0.0.1'||
    !Number.isInteger(proxyPlan.gateway.port)||
    proxyPlan.gateway.port<1||proxyPlan.gateway.port>65535)
  throw Error('NETWORK_BLOCKED: verified loopback proxy gateway required');
 // The gateway handles HTTPS CONNECT using hostnames, not local DNS resolution.
 // The preference alone does NOT prove no DNS/WebRTC leaks.
 return Object.freeze({
  'network.proxy.type':1,
  'network.proxy.http':'127.0.0.1',
  'network.proxy.http_port':proxyPlan.gateway.port,
  'network.proxy.ssl':'127.0.0.1',
  'network.proxy.ssl_port':proxyPlan.gateway.port,
  'network.proxy.socks_remote_dns':true,
  'network.proxy.no_proxies_on':''
 });
}
function assertIsolatedProfileDirectory(root,dir){
 if(!path.isAbsolute(root)||!path.isAbsolute(dir))
  throw Error('Camoufox profile paths must be absolute');
 const relative=path.relative(path.resolve(root),path.resolve(dir));
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative))
  throw Error('Profile must be inside its designated storage root');
 return dir;
}
module.exports={firefoxPrefs,assertIsolatedProfileDirectory};