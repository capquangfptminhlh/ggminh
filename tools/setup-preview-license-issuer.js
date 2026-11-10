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

function findGitRoot(location){
 let current=path.resolve(location);
 while(true){
  const marker=path.join(current,'.git');
  try{
   const markerType=fs.lstatSync(marker);
   if(markerType.isDirectory()||markerType.isFile())return current;
  }catch(error){
   if(error.code!=='ENOENT')throw error;
  }
  try{
   const head=fs.lstatSync(path.join(current,'HEAD'));
   const objects=fs.lstatSync(path.join(current,'objects'));
   const refs=fs.lstatSync(path.join(current,'refs'));
   if(head.isFile()&&objects.isDirectory()&&refs.isDirectory())return current;
  }catch(error){
   if(error.code!=='ENOENT')throw error;
  }
  const parent=path.dirname(current);
  if(parent===current)return null;
  current=parent;
 }
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

function rollback(error,cleanupSteps){
 const cleanupErrors=[];
 for(const [label,cleanup] of cleanupSteps){
  try{cleanup();}
  catch(cleanupError){
   cleanupErrors.push(new Error(`cleanup failure removing ${label}: ${cleanupError.message}`,
    {cause:cleanupError}));
  }
 }
 if(cleanupErrors.length){
  const count=cleanupErrors.length;
  throw new AggregateError([error,...cleanupErrors],
   `Preview issuer rollback incomplete (${count} cleanup failure${count===1?'':'s'})`,
   {cause:error});
 }
 throw error;
}

function setupPreviewIssuer(outputDir,{passphrase=process.env.LHM_ISSUER_PASSPHRASE}={}){
 if(!path.isAbsolute(outputDir||''))throw Error('Absolute issuer directory required');
 if(typeof passphrase!=='string'||passphrase.length<24)
  throw Error('Preview issuer passphrase must contain at least 24 characters');
 if(underRoot(outputDir))throw Error('Refusing Preview issuer directory inside repository');
 const canonicalAncestor=fs.realpathSync(existingAncestor(outputDir));
 if(underRoot(canonicalAncestor,fs.realpathSync(ROOT)))
  throw Error('Refusing Preview issuer directory resolving inside repository');
 if(findGitRoot(canonicalAncestor))
  throw Error('Refusing Preview issuer directory inside a Git repository or worktree');
 const outputCreated=fs.mkdirSync(outputDir,{recursive:true,mode:0o700})!==undefined;
 const privateKeyFile=path.join(outputDir,'preview-license-ed25519-private.pem');
 const publicKeyFile=path.join(outputDir,'preview-license-ed25519-public.pem');
 let privateCreated=false,publicCreated=false;
 try{
  const canonicalOutput=fs.realpathSync(outputDir);
  if(underRoot(canonicalOutput,fs.realpathSync(ROOT)))
   throw Error('Refusing Preview issuer directory resolving inside repository');
  if(findGitRoot(canonicalOutput))
   throw Error('Refusing Preview issuer directory inside a Git repository or worktree');
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
  const cleanupSteps=[];
  if(publicCreated)cleanupSteps.push(['public key file',()=>fs.rmSync(publicKeyFile,{force:true})]);
  if(privateCreated)cleanupSteps.push(['private key file',()=>fs.rmSync(privateKeyFile,{force:true})]);
  if(outputCreated)cleanupSteps.push(['issuer directory',()=>fs.rmdirSync(outputDir)]);
  rollback(error,cleanupSteps);
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
