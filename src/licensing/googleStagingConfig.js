'use strict';
/**
 * Two disjoint channels:
 * - Unpackaged, explicit dev-only Google preview using a local public PEM.
 * - Packaged, isolated Gmail staging build whose signing PUBLIC SPKI is
 *   embedded into app.asar at build time; never supplied by the customer.
 *
 * A standard Preview installer includes no generated trust and remains v1.
 */
const fs=require('node:fs'),crypto=require('node:crypto');
const STAGING_ORIGIN='https://browser-staging.lhmcrm.com';
const TRUST_SCHEMA='lhm-google-saas-staging-trust-v1';
function packagedTrust(){
 let record;
 try{record=require('./googleStagingPackageTrust.generated');}
 catch(error){
  // The normal customer Preview intentionally has no generated Gmail module.
  if(error.code==='MODULE_NOT_FOUND'&&
     /googleStagingPackageTrust\.generated/.test(error.message||''))return null;
  throw error;
 }
 const keys=['schema','channel','apiOrigin','publicSpkiB64','publicSpkiSha256'];
 if(!record||typeof record!=='object'||Array.isArray(record)||
    Object.keys(record).sort().join(',')!==keys.sort().join(',')||
    record.schema!==TRUST_SCHEMA||record.channel!=='gmail-staging'||
    record.apiOrigin!==STAGING_ORIGIN||
    typeof record.publicSpkiB64!=='string'||record.publicSpkiB64.length>300||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(record.publicSpkiB64)||
    typeof record.publicSpkiSha256!=='string'||
    !/^[a-f0-9]{64}$/.test(record.publicSpkiSha256))
   throw Error('Packaged Gmail staging public trust is invalid');
 const der=Buffer.from(record.publicSpkiB64,'base64');
 if(der.toString('base64')!==record.publicSpkiB64)
   throw Error('Packaged Gmail SPKI base64 is not canonical');
 const digest=crypto.createHash('sha256').update(der).digest('hex');
 if(digest!==record.publicSpkiSha256)
   throw Error('Packaged Gmail SPKI fingerprint mismatch');
 const publicKey=crypto.createPublicKey({key:der,format:'der',type:'spki'});
 if(publicKey.asymmetricKeyType!=='ed25519'||der.length>120||
    !publicKey.export({format:'der',type:'spki'}).equals(der))
   throw Error('Only an Ed25519 public signer may be embedded');
 return Object.freeze({apiOrigin:STAGING_ORIGIN,publicKey,
   publicSpkiSha256:digest,mode:'google-saas-packaged-staging',packaged:true});
}
function loadGoogleStagingConfig({packaged,env=process.env}={}){
 if(packaged===true)return packagedTrust();
 if(env.LHM_GOOGLE_BROWSER_STAGING!=='1')return null;
 const pem=env.LHM_GOOGLE_BROWSER_STAGING_PUBLIC_KEY_FILE;
 if(typeof pem!=='string'||!pem||!fs.statSync(pem).isFile())
   throw Error('Google staging requires a local Ed25519 public key file');
 const publicKey=crypto.createPublicKey(fs.readFileSync(pem,'utf8'));
 if(publicKey.asymmetricKeyType!=='ed25519')
   throw Error('Staging Browser lease public key must be Ed25519');
 return Object.freeze({apiOrigin:STAGING_ORIGIN,publicKey,
   mode:'google-saas-development',packaged:false});
}
module.exports={loadGoogleStagingConfig,STAGING_ORIGIN,TRUST_SCHEMA};
