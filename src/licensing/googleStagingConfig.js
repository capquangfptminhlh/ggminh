'use strict';
// An explicit DEVELOPER-ONLY preview. Neither renderer nor customer settings
// can activate Google-only licensing. Packaged distribution stays legacy until
// the signer trust anchor is embedded at build time and real acceptance passes.
const fs=require('node:fs');
const crypto=require('node:crypto');
const STAGING_ORIGIN='https://browser-staging.lhmcrm.com';
function loadGoogleStagingConfig({packaged,env=process.env}={}){
  if(packaged||env.LHM_GOOGLE_BROWSER_STAGING!=='1')return null;
  const pem=env.LHM_GOOGLE_BROWSER_STAGING_PUBLIC_KEY_FILE;
  if(typeof pem!=='string'||!pem||!fs.statSync(pem).isFile())
    throw Error('Google staging requires a local Ed25519 public key file');
  const publicKey=crypto.createPublicKey(fs.readFileSync(pem,'utf8'));
  if(publicKey.asymmetricKeyType!=='ed25519')
    throw Error('Staging Browser lease public key must be Ed25519');
  return Object.freeze({apiOrigin:STAGING_ORIGIN,publicKey,
    mode:'google-saas-development',packaged:false});
}
module.exports={loadGoogleStagingConfig,STAGING_ORIGIN};
