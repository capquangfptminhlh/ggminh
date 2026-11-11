#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const {setupPreviewIssuer}=require('./setup-preview-license-issuer');
const {PUBLIC_KEY:LICENSE_PUBLIC_KEY}=require('../src/licensing/manager');

function spki(key){
 const publicKey=key.type==='public'?key:crypto.createPublicKey(key);
 return publicKey.export({format:'der',type:'spki'});
}

function setupCamoufoxPublisher(outputDir,{
 passphrase=process.env.LHM_ENGINE_PUBLISHER_PASSPHRASE
}={}){
 const provisional=setupPreviewIssuer(outputDir,{passphrase});
 const privateKeyFile=path.join(outputDir,'lhm-engine-publisher-private.pem');
 const publicKeyFile=path.join(outputDir,'lhm-engine-publisher-public.pem');
 try{
  if(fs.existsSync(privateKeyFile)||fs.existsSync(publicKeyFile))
   throw Error('Camoufox publisher already exists');
  fs.renameSync(provisional.privateKeyFile,privateKeyFile);
  fs.renameSync(provisional.publicKeyFile,publicKeyFile);
  const publicPem=fs.readFileSync(publicKeyFile);
  const publicKey=crypto.createPublicKey(publicPem);
  if(publicKey.asymmetricKeyType!=='ed25519')
   throw Error('Camoufox publisher key must use Ed25519');
  if(spki(publicKey).equals(spki(LICENSE_PUBLIC_KEY)))
   throw Error('Camoufox publisher key must be independent of the license key');
  return {...provisional,privateKeyFile,publicKeyFile,
   publicKey:publicPem.toString()};
 }catch(error){
  for(const file of [privateKeyFile,publicKeyFile,
   provisional.privateKeyFile,provisional.publicKeyFile]){
   try{fs.rmSync(file,{force:true});}catch(_){}
  }
  throw error;
 }
}

if(require.main===module){
 try{
  if(process.argv.length!==3)throw Error('Exactly one output directory is required');
  const result=setupCamoufoxPublisher(process.argv[2]);
  console.log(JSON.stringify({
   publicKeyFile:result.publicKeyFile,publicKey:result.publicKey,
   spkiBase64:result.spkiBase64,spkiSha256:result.spkiSha256
  },null,2));
 }catch(error){
  console.error('Camoufox publisher setup:',error.message);
  process.exitCode=1;
 }
}

module.exports={setupCamoufoxPublisher};
