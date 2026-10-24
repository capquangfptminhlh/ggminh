'use strict';
/**
 * Vendor-only license authority routing. Never accept renderer/profile URLs.
 * A signed license receipt remains verified by the pinned Ed25519 issuer key,
 * independently of this public transport configuration.
 */
const fs=require('node:fs');
const path=require('node:path');
const {verifyEndpoint}=require('./onlineVerifier');
const SCHEMA='lhm.license-authority-config.v1';
const EXPECTED='https://browser.lhmcrm.com/v1/verify';
const MAX_FILE_BYTES=1024;
const CONFIG_FILE='authority.json';
function validateConfig(document){
 if(!document||typeof document!=='object'||Array.isArray(document)||
    Object.keys(document).sort().join('|')!=='enabled|endpoint|schema'||
    document.schema!==SCHEMA||typeof document.enabled!=='boolean')
  throw Error('Invalid packaged license authority configuration');
 if(document.enabled===false){
  if(document.endpoint!==null)throw Error('Disabled license authority must have null endpoint');
  return null;
 }
 if(document.endpoint!==EXPECTED||
    verifyEndpoint(document.endpoint)!==EXPECTED)
  throw Error('Packaged license authority must use the reviewed LHM HTTPS endpoint');
 return EXPECTED;
}
function resolveLicenseEndpoint({
 packaged,resourcesPath,developmentEndpoint=null
}={}){
 if(packaged!==true){
  // Existing local development integration remains explicit. Never read
  // credentials, profile data, license tokens or a renderer-defined endpoint.
  return verifyEndpoint(developmentEndpoint);
 }
 if(typeof resourcesPath!=='string'||!path.isAbsolute(resourcesPath))
  throw Error('Missing absolute packaged resources path');
 const file=path.join(resourcesPath,'lhm-license-authority',CONFIG_FILE);
 let stat;
 try{stat=fs.lstatSync(file);}catch(e){
  if(e.code==='ENOENT')return null; // Preview has no live vendor config.
  throw e;
 }
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<20||
    stat.size>MAX_FILE_BYTES)
  throw Error('Unsafe packaged license authority config file');
 let parsed;
 try{parsed=JSON.parse(fs.readFileSync(file,'utf8'))}
 catch(_){throw Error('Malformed packaged license authority JSON')}
 return validateConfig(parsed);
}
module.exports={resolveLicenseEndpoint,validateConfig,SCHEMA,EXPECTED,CONFIG_FILE};
