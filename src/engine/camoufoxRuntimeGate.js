'use strict';
// Native spawn does not require the Camoufox TypeScript module or Node 22.
// It is a MANUAL browser UI launcher, not a Playwright automation connection.
// A separately signed engine binary is still mandatory for real launches.
function assessRuntime({
 platform=process.platform,publisherTrusted=false,releaseConfigured=false,
 verifiedBundle=false,version=null,manualApproved=false,
 approvedProxyTypes=[],evidence=null
}={}){
 const platformCompatible=platform==='win32';
 const proxyTypes=Array.isArray(approvedProxyTypes)
  ?['http','socks5'].filter(type=>approvedProxyTypes.includes(type)):[];
 const manualReady=platformCompatible&&verifiedBundle===true&&manualApproved===true;
 let reason;
 if(!platformCompatible)reason='Native Camoufox desktop launch is Windows-only';
 else if(!publisherTrusted)reason='Independent Camoufox publisher trust anchor is not configured';
 else if(!releaseConfigured&&!verifiedBundle)reason='Signed Camoufox release descriptor is not configured';
 else if(!verifiedBundle)reason='Signed Camoufox release is not installed';
 else if(!manualApproved)reason='Installed signed Camoufox version is not approved for manual release';
 else if(!proxyTypes.length)reason='Manual browser ready; proxy is not approved for this engine version';
 else reason='Manual browser ready; '+proxyTypes.map(x=>x.toUpperCase()).join('/')+
  ' proxy approved for this engine version';
 return {
  platformCompatible,
  launcherPresent:false,
  nodeVersionRequired:false,
  manualOnly:true,
  canInstall:platformCompatible&&publisherTrusted===true&&releaseConfigured===true,
  ready:manualReady,manualReady,verifiedBundle:verifiedBundle===true,
  version:typeof version==='string'?version:null,
  approvedProxyTypes:proxyTypes,evidence:typeof evidence==='string'?evidence:null,
  automationAvailable:false,reason
 };
}
module.exports={assessRuntime};
