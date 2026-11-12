#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
const {spawnSync}=require('child_process');
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

function configDeclaresBare(configFile){
 let inCore=false,bareValue=false,bareFound=false;
 for(const rawLine of fs.readFileSync(configFile,'utf8').split(/\r?\n/)){
  const line=rawLine.trim();
  if(!line||line.startsWith('#')||line.startsWith(';'))continue;
  const section=line.match(/^\[([^\]]+)\](?:\s*[#;].*)?$/);
  if(section){
   inCore=section[1].trim().toLowerCase()==='core';
   continue;
  }
  if(!inCore)continue;
  const setting=line.match(/^bare\s*=\s*([^\s#;]*)\s*(?:[#;].*)?$/i);
  if(setting){
   let value=setting[1];
   const quote=value[0];
   if((quote==='"'||quote==="'")&&value.at(-1)===quote)value=value.slice(1,-1);
   bareFound=true;
   bareValue=/^(?:true|yes|on|1)$/i.test(value);
  }else if(/^bare\s*(?:[#;].*)?$/i.test(line)){
   bareFound=true;
   bareValue=true;
  }
 }
 return bareFound&&bareValue;
}

function configUsesIncludes(configFile){
 for(const rawLine of fs.readFileSync(configFile,'utf8').split(/\r?\n/)){
  const line=rawLine.trim();
  if(!line||line.startsWith('#')||line.startsWith(';'))continue;
  if(/^\[include(?:if)?(?:\s|\])/i.test(line))return true;
 }
 return false;
}

function createdDirectoryChain(outputDir,firstCreated){
 if(firstCreated===undefined)return [];
 const comparable=location=>{
  let resolved=path.resolve(location);
  if(process.platform==='win32'){
   if(resolved.startsWith('\\\\?\\UNC\\'))resolved='\\\\'+resolved.slice(8);
   else if(resolved.startsWith('\\\\?\\'))resolved=resolved.slice(4);
   resolved=resolved.toLowerCase();
  }
  return resolved;
 };
 const first=comparable(firstCreated),created=[];
 let current=path.resolve(outputDir);
 while(true){
  created.push(current);
  if(comparable(current)===first)return created;
  const parent=path.dirname(current);
  if(parent===current)throw Error('Recursive directory creation returned an invalid path');
  current=parent;
 }
}

function gitProbeEnvironment(){
 const env={
  GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',GIT_CONFIG_NOSYSTEM:'1',LC_ALL:'C',
  GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'
 };
 for(const name of ['PATH','Path','PATHEXT','SystemRoot','SYSTEMROOT','WINDIR','COMSPEC']){
  if(typeof process.env[name]==='string')env[name]=process.env[name];
 }
 return env;
}

function gitPlumbingRepositoryState(location){
 const probe=spawnSync('git',['-C',path.resolve(location),'rev-parse','--git-dir'],{
  encoding:'utf8',env:gitProbeEnvironment(),stdio:['ignore','ignore','pipe'],
  windowsHide:true,timeout:5000,maxBuffer:1024
 });
 if(probe.error||probe.signal||probe.status===null)return 'indeterminate';
 if(probe.status===0)return 'repository';
 if(probe.status===128&&/\bnot a git repository\b/i.test(probe.stderr||''))
  return 'not-repository';
 return 'indeterminate';
}

function findGitRoot(location){
 let current=path.resolve(location);
 const plumbingState=gitPlumbingRepositoryState(current);
 if(plumbingState==='repository')return current;
 while(true){
  const marker=path.join(current,'.git');
  try{
   const markerType=fs.lstatSync(marker);
   if(markerType.isDirectory()||markerType.isFile()||markerType.isSymbolicLink())return current;
   const markerTarget=fs.statSync(marker);
   if(markerTarget.isDirectory()||markerTarget.isFile())return current;
  }catch(error){
   if(error.code!=='ENOENT')throw error;
  }
  if(plumbingState==='indeterminate'){
   try{
    const head=fs.lstatSync(path.join(current,'HEAD'));
    const objects=fs.lstatSync(path.join(current,'objects'));
    const refs=fs.lstatSync(path.join(current,'refs'));
    const configFile=path.join(current,'config');
    const config=fs.lstatSync(configFile);
    if(head.isFile()&&objects.isDirectory()&&refs.isDirectory()&&
       (config.isFile()||config.isSymbolicLink())&&
       (config.isSymbolicLink()||configDeclaresBare(configFile)||configUsesIncludes(configFile)))
     return current;
   }catch(error){
    if(error.code!=='ENOENT')throw error;
   }
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
 const firstCreated=fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
 const createdDirectories=createdDirectoryChain(outputDir,firstCreated);
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
  const persistedPublicPem=fs.readFileSync(publicKeyFile);
  const persistedPublic=crypto.createPublicKey(persistedPublicPem);
  const persistedSpki=persistedPublic.export({format:'der',type:'spki'});
  const persistedSpkiBase64=persistedSpki.toString('base64');
  const persistedSpkiSha256=crypto.createHash('sha256').update(persistedSpki).digest('hex');
  if(!crypto.createPublicKey(persistedPrivate).export({format:'der',type:'spki'}).equals(spki)||
     !persistedSpki.equals(spki)||persistedSpkiBase64!==spkiBase64||
     persistedSpkiSha256!==spkiSha256)
   throw Error('Preview issuer persisted key verification failed');
  return {
   privateKeyFile,publicKeyFile,publicKey:persistedPublicPem.toString(),
   spkiBase64:persistedSpkiBase64,spkiSha256:persistedSpkiSha256
  };
 }catch(error){
  const cleanupSteps=[];
  if(publicCreated)cleanupSteps.push(['public key file',()=>fs.rmSync(publicKeyFile,{force:true})]);
  if(privateCreated)cleanupSteps.push(['private key file',()=>fs.rmSync(privateKeyFile,{force:true})]);
  for(const directory of createdDirectories)
   cleanupSteps.push(['issuer directory',()=>fs.rmdirSync(directory)]);
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
