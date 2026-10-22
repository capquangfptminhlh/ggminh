'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
// Independent engine trust root: never authorize browser execution with an
// app-license signing key. Provision a reviewed public key at packaging time.
function loadCamoufoxPublisherKey(resourcesRoot,{licenseKey=null}={}){
 const file=path.join(resourcesRoot,'publisher-ed25519.pub');
 if(!fs.existsSync(file))return null;
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size<100||st.size>4096)
  throw Error('Invalid Camoufox publisher trust anchor file');
 const key=crypto.createPublicKey(fs.readFileSync(file,'utf8'));
 if(key.asymmetricKeyType!=='ed25519')
  throw Error('Camoufox publisher trust anchor must use Ed25519');
 if(licenseKey){
  const engineSpki=key.export({format:'der',type:'spki'});
  const licenseSpki=(licenseKey.type==='public'?licenseKey:crypto.createPublicKey(licenseKey))
   .export({format:'der',type:'spki'});
  if(engineSpki.equals(licenseSpki))
   throw Error('Camoufox publisher key must be independent of license signing key');
 }
 return key;
}
module.exports={loadCamoufoxPublisherKey};
