#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');

function underRoot(location,root=ROOT){
 const resolved=path.resolve(location),base=path.resolve(root);
 return resolved===base||resolved.startsWith(base+path.sep);
}

function existingAncestor(location){
 let current=path.resolve(location);
 while(!fs.existsSync(current)){
  const parent=path.dirname(current);
  if(parent===current)break;
  current=parent;
 }
 return current;
}

function writeNewFile(file,contents,mode,onCreate){
 const descriptor=fs.openSync(file,'wx',mode);
 onCreate();
 let error;
 try{fs.writeFileSync(descriptor,contents);}
 catch(writeError){error=writeError;}
 try{fs.closeSync(descriptor);}
 catch(closeError){if(!error)error=closeError;}
 if(error)throw error;
}

function setupPreviewIssuer(outputDir,{passphrase=process.env.LHM_ISSUER_PASSPHRASE}={}){
 if(!path.isAbsolute(outputDir||''))throw Error('Absolute issuer directory required');
 if(typeof passphrase!=='string'||passphrase.length<24)
  throw Error('Preview issuer passphrase must contain at least 24 characters');
 if(underRoot(outputDir))throw Error('Refusing Preview issuer directory inside repository');
 if(underRoot(fs.realpathSync(existingAncestor(outputDir)),fs.realpathSync(ROOT)))
  throw Error('Refusing Preview issuer directory resolving inside repository');
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
 const spki=publicKey.export({format:'der',type:'spki'});
 const publicKeyText=publicPem.toString();
 const spkiBase64=spki.toString('base64');
 const spkiSha256=crypto.createHash('sha256').update(spki).digest('hex');
 const unlocked=crypto.createPrivateKey({key:privatePem,format:'pem',passphrase});
 if(!crypto.createPublicKey(unlocked).export({format:'der',type:'spki'}).equals(spki))
  throw Error('Preview issuer key verification failed');
 let privateCreated=false,publicCreated=false;
 try{
  writeNewFile(privateKeyFile,privatePem,0o600,()=>{privateCreated=true;});
  writeNewFile(publicKeyFile,publicPem,0o644,()=>{publicCreated=true;});
  const persistedPrivate=crypto.createPrivateKey({
   key:fs.readFileSync(privateKeyFile),format:'pem',passphrase
  });
  const persistedPublic=crypto.createPublicKey(fs.readFileSync(publicKeyFile));
  if(!crypto.createPublicKey(persistedPrivate).export({format:'der',type:'spki'}).equals(spki)||
     !persistedPublic.export({format:'der',type:'spki'}).equals(spki))
   throw Error('Preview issuer persisted key verification failed');
  return {
   privateKeyFile,publicKeyFile,publicKey:publicKeyText,spkiBase64,spkiSha256
  };
 }catch(error){
  if(publicCreated)try{fs.rmSync(publicKeyFile,{force:true});}catch(_error){}
  if(privateCreated)try{fs.rmSync(privateKeyFile,{force:true});}catch(_error){}
  throw error;
 }
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
