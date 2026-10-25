'use strict';
const fs=require('node:fs'),path=require('node:path');
const {TRUST,BUILDER}=require('./prepare-google-staging-package');
const {loadGoogleStagingConfig}=require('../src/licensing/googleStagingConfig');
function assertGoogleStagingPackage(root=path.resolve(__dirname,'..')){
 const configPath=path.join(root,BUILDER),trustPath=path.join(root,TRUST);
 if(!fs.existsSync(configPath)||!fs.existsSync(trustPath))
   throw Error('Isolated Gmail Staging builder and public-key trust must both be prepared');
 const cfg=JSON.parse(fs.readFileSync(configPath,'utf8'));
 if(cfg.appId!=='vn.lhm.adsbrowser.gmailstaging'||
    cfg.productName!=='LHM Ads Browser Gmail Staging'||
    cfg.directories?.output!=='dist-google-staging'||
    !cfg.nsis?.artifactName?.startsWith('LHM-Ads-Browser-Gmail-Staging-')||
    !cfg.asar||!cfg.files?.includes('**/*'))
   throw Error('Unexpected Gmail Staging package identity; refusing build');
 // The runtime checks the public key material, fingerprint and pinned origin.
 if(root===path.resolve(__dirname,'..')){
   const trust=loadGoogleStagingConfig({packaged:true,env:{}});
   if(!trust||trust.mode!=='google-saas-packaged-staging'||
      !/^[a-f0-9]{64}$/.test(trust.publicSpkiSha256))
     throw Error('Missing trusted packaged Ed25519 signer');
 }
 return true;
}
if(require.main===module){
 try{assertGoogleStagingPackage();console.log('PASS: staged Gmail installer is separate from Preview, signer pinned');}
 catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={assertGoogleStagingPackage};
