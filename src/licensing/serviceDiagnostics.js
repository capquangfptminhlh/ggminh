'use strict';
/**
 * Public, read-only status for customer license screen. Does not initiate a
 * network request and must not expose a token, receipt, installation ID or key.
 */
function getLicenseServiceStatus(verifier,manager){
 if(!verifier||!manager||typeof manager.status!=='function')
  throw Error('License service diagnostics unavailable');
 const configured=typeof verifier.endpoint==='string'&&verifier.endpoint.length>0;
 const isActive=Boolean(manager.status()?.active);
 let authorityHost=null;
 if(configured){
  const url=new URL(verifier.endpoint);
  if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')
   throw Error('Unsafe license authority endpoint');
  authorityHost=url.host;
 }
 const state=!configured?'not-configured':
  isActive?'ready-to-verify':'awaiting-signed-license';
 return Object.freeze({
  configured,
  authorityHost,
  hasActiveSignedLicense:isActive,
  canVerifyNow:configured&&isActive,
  connectionHealth:'NOT_CHECKED',
  state
 });
}
module.exports={getLicenseServiceStatus};
