'use strict';
// Packaged-build gate for Camoufox. A packaged application may run Camoufox
// only when the shipped publisher trust anchor is the PRODUCTION publisher key
// that the owner created in the offline key ceremony. The owner pins that key
// here by its SPKI SHA-256 in a reviewed commit, after the ceremony.
//
// Until then this is null and every packaged build keeps Camoufox disabled
// (Chromium is unaffected). Source/development runs keep their existing gates
// (signed descriptor, capability policy, explicit internal-preview opt-in).
//
// Never pin a staging/rehearsal key here. The key currently in
// resources/camoufox-engine (SPKI sha256 bec427c0…) signed the RC1 rehearsal
// package and is NOT the production key.
const crypto=require('node:crypto');

const PRODUCTION_PUBLISHER_SPKI_SHA256=null;

function spkiSha256(publicKey){
 const key=publicKey.type==='public'?publicKey:crypto.createPublicKey(publicKey);
 if(key.asymmetricKeyType!=='ed25519')throw Error('Camoufox publisher key must use Ed25519');
 return crypto.createHash('sha256').update(key.export({format:'der',type:'spki'})).digest('hex');
}

function packagedCamoufoxTrust({packaged,publisherKey,
 productionSpkiSha256=PRODUCTION_PUBLISHER_SPKI_SHA256}={}){
 if(packaged!==true)return {allowed:true,reason:null};
 if(!publisherKey)return {allowed:false,
  reason:'Camoufox disabled: no publisher trust anchor in this package'};
 if(typeof productionSpkiSha256!=='string'||!/^[a-f0-9]{64}$/.test(productionSpkiSha256))
  return {allowed:false,
   reason:'Camoufox disabled: production publisher key has not been pinned for packaged builds'};
 let actual;
 try{actual=spkiSha256(publisherKey)}
 catch(error){return {allowed:false,reason:'Camoufox disabled: '+String(error.message||error)}}
 if(actual!==productionSpkiSha256)return {allowed:false,
  reason:'Camoufox disabled: packaged publisher key is not the pinned production key'};
 return {allowed:true,reason:null};
}

module.exports={packagedCamoufoxTrust,spkiSha256,PRODUCTION_PUBLISHER_SPKI_SHA256};
