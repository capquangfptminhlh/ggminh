'use strict';
const {verifyEndpoint}=require('./onlineVerifier');
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
  // The verifier already rejects untrusted URLs at construction. Recheck
  // in this pure boundary so renderer diagnostics can never print a secret
  // userinfo/query or a non-/v1/verify endpoint even under integration drift.
  const url=new URL(verifyEndpoint(verifier.endpoint,{allowLocalhost:true}));
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
