#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

function setupPreviewIssuer(outputDir,{passphrase=process.env.LHM_ISSUER_PASSPHRASE}={}){
 if(!path.isAbsolute(outputDir||''))throw Error('Absolute issuer directory required');
 if(typeof passphrase!=='string'||passphrase.length<24)
  throw Error('Preview issuer passphrase must contain at least 24 characters');
 fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
 const privateKeyFile=path.join(outputDir,'preview-license-ed25519-private.pem');
 const publicKeyFile=path.join(outputDir,'preview-license-ed25519-public.pem');
 if(fs.existsSync(privateKeyFile)||fs.existsSync(publicKeyFile))
  throw Error('Preview issuer already exists');
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
 const privatePem=privateKey.export({
  format:'pem',type:'pkcs8',cipher:'aes-256-cbc',passphrase
 });
 const publicPem=publicKey.export({format:'pem',type:'spki'});
 fs.writeFileSync(privateKeyFile,privatePem,{flag:'wx',mode:0o600});
 try{fs.writeFileSync(publicKeyFile,publicPem,{flag:'wx',mode:0o644});}
 catch(error){fs.rmSync(privateKeyFile,{force:true});throw error;}
 const spki=publicKey.export({format:'der',type:'spki'});
 return {
  privateKeyFile,publicKeyFile,publicKey:publicPem.toString(),
  spkiBase64:spki.toString('base64'),
  spkiSha256:crypto.createHash('sha256').update(spki).digest('hex')
 };
}

if(require.main===module){
 try{
  if(process.argv.length!==3)throw Error('Exactly one output directory is required');
  const result=setupPreviewIssuer(process.argv[2]);
  console.log(JSON.stringify({
   publicKeyFile:result.publicKeyFile,publicKey:result.publicKey,
   spkiBase64:result.spkiBase64,spkiSha256:result.spkiSha256
  },null,2));
 }catch(error){
  console.error('Preview issuer setup:',error.message);
  process.exitCode=1;
 }
}

module.exports={setupPreviewIssuer};
