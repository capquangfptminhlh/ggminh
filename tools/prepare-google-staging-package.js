'use strict';
/**
 * An isolated Gmail STAGING build preparation command, never called by
 * npm run build:win or the legacy Preview workflow.
 * Embeds only a trusted PUBLIC Ed25519 SPKI inside app.asar.
 * Absolutely no private signer, OAuth client secret, Cloudflare token,
 * bank number or merchant token belongs in a customer installer.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ORIGIN='https://browser-staging.lhmcrm.com';
const TRUST='src/licensing/googleStagingPackageTrust.generated.js';
const BUILDER='build/google-staging-builder.generated.json';
const ALLOW='ISOLATED_GMAIL_STAGING_ONLY';
function prepareGoogleStagingPackage({root,publicKeyB64,confirmation,packageBuild}={}){
 if(confirmation!==ALLOW)throw Error('Explicit staging package authorization required');
 if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Invalid package root');
 if(typeof publicKeyB64!=='string'||publicKeyB64.length>300||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(publicKeyB64))
   throw Error('Missing valid public Ed25519 SPKI (never use a private key)');
 const der=Buffer.from(publicKeyB64,'base64');
 if(der.toString('base64')!==publicKeyB64||der.length<40||der.length>120)
   throw Error('Public Ed25519 SPKI must be canonical DER base64');
 let publicKey;
 try{publicKey=crypto.createPublicKey({key:der,format:'der',type:'spki'});}
 catch(_){throw Error('Malformed Ed25519 public key');}
 if(publicKey.asymmetricKeyType!=='ed25519'||
    !publicKey.export({format:'der',type:'spki'}).equals(der))
   throw Error('Only canonical Ed25519 public SPKI is permitted');
 const hash=crypto.createHash('sha256').update(der).digest('hex');
 const trust=Object.freeze({schema:'lhm-google-saas-staging-trust-v1',
   channel:'gmail-staging',apiOrigin:ORIGIN,
   publicSpkiB64:publicKeyB64,publicSpkiSha256:hash});
 const build=JSON.parse(JSON.stringify(packageBuild||
   JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).build));
 if(!build||!Array.isArray(build.files)||!build.files.includes('**/*')||
    !build.asar||!build.nsis)throw Error('Unrecognized Electron packaging manifest');
 build.appId='vn.lhm.adsbrowser.gmailstaging';
 build.productName='LHM Ads Browser Gmail Staging';
 build.directories={...build.directories,output:'dist-google-staging'};
 build.nsis={...build.nsis,
   artifactName:'LHM-Ads-Browser-Gmail-Staging-${version}-Setup-${arch}.${ext}'};
 const trustFile=path.join(root,TRUST);
 const builderFile=path.join(root,BUILDER);
 if(fs.existsSync(trustFile)||fs.existsSync(builderFile))
   throw Error('Generated staging trust/config already present; refusing overwrite');
 fs.mkdirSync(path.dirname(trustFile),{recursive:true});
 fs.mkdirSync(path.dirname(builderFile),{recursive:true});
 try{
   fs.writeFileSync(trustFile,"'use strict';\nmodule.exports=Object.freeze("+
      JSON.stringify(trust,null,2)+");\n",{flag:'wx',mode:0o600});
   fs.writeFileSync(builderFile,JSON.stringify(build,null,2)+'\n',
      {flag:'wx',mode:0o600});
 }catch(e){
   fs.rmSync(trustFile,{force:true});
   fs.rmSync(builderFile,{force:true});
   throw e;
 }
 return {trustFile,builderFile,publicSpkiSha256:hash,
   productName:build.productName,appId:build.appId};
}
if(require.main===module){
 try{
   const result=prepareGoogleStagingPackage({
     root:path.resolve(__dirname,'..'),
     publicKeyB64:process.env.BROWSER_LEASE_PUBLIC_SPKI_B64,
     confirmation:process.env.GOOGLE_STAGING_PACKAGE_CONFIRMATION});
   console.log('PASS: isolated Gmail STAGING build inputs prepared; public key SHA-256: '+
     result.publicSpkiSha256);
 }catch(e){
   console.error('Gmail staging packaging blocked: '+e.message);
   process.exitCode=1;
 }
}
module.exports={prepareGoogleStagingPackage,TRUST,BUILDER,ORIGIN,ALLOW};
