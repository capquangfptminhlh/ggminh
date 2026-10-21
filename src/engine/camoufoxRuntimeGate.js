'use strict';
// Native spawn does not require the Camoufox TypeScript module or Node 22.
// It is a MANUAL browser UI launcher, not a Playwright automation connection.
// A separately signed engine binary is still mandatory for real launches.
function assessRuntime({
 platform=process.platform,verifiedBundle=false
}={}){
 const platformCompatible=platform==='win32';
 return {
  platformCompatible,
  launcherPresent:false,
  nodeVersionRequired:false,
  manualOnly:true,
  canInstall:platformCompatible,
  ready:platformCompatible&&verifiedBundle===true,
  reason:!platformCompatible?'Native Camoufox desktop launch is Windows-only':
   !verifiedBundle?'Separately publisher-signed Camoufox EXE not available':
   'Native manual browser UI launcher ready; proxy, GeoIP and automation are not supported'
 };
}
module.exports={assessRuntime};
