#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const {containsPrivateKeyMaterial}=require('../src/engine/bundledEngineManager');
const {validateRelease}=require('../src/engine/camoufoxInstallService');

function verifyCamoufoxReleaseResources(resourceDir){
 if(typeof resourceDir!=='string'||!path.isAbsolute(resourceDir))
  throw Error('Camoufox resource directory must be absolute');
 const root=fs.lstatSync(resourceDir);
 if(!root.isDirectory()||root.isSymbolicLink())
  throw Error('Camoufox resources must be a regular directory');
 const publicFile=path.join(resourceDir,'publisher-ed25519.pub');
 const releaseFile=path.join(resourceDir,'release.json');
 const hasPublic=fs.existsSync(publicFile),hasRelease=fs.existsSync(releaseFile);
 function visit(directory){
  for(const name of fs.readdirSync(directory)){
   const file=path.join(directory,name),stat=fs.lstatSync(file);
   if(stat.isSymbolicLink())throw Error('Camoufox release resources must not contain symlinks');
   if(stat.isDirectory())visit(file);
   else if(stat.isFile()){
    if(['camoufox.exe','manifest.json'].includes(name.toLowerCase()))
     throw Error('Camoufox engine payload must not ship inside the application');
    if(stat.size<=1024*1024&&containsPrivateKeyMaterial(fs.readFileSync(file)))
     throw Error('Camoufox resources contain private key material: '+name);
   }else throw Error('Unsupported Camoufox release resource');
  }
 }
 visit(resourceDir);
 if(hasPublic!==hasRelease)
  throw Error('Camoufox publisher key and release descriptor must ship together');
 if(!hasPublic)return {configured:false};
 for(const file of [publicFile,releaseFile]){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink())
   throw Error('Camoufox trust and release files must be regular files');
 }
 if(fs.statSync(publicFile).size>4096||fs.statSync(releaseFile).size>1024*1024)
  throw Error('Camoufox release metadata exceeds size limits');
 const publicKey=crypto.createPublicKey(fs.readFileSync(publicFile));
 const descriptor=JSON.parse(fs.readFileSync(releaseFile,'utf8'));
 const release=validateRelease(descriptor,{publicKey});
 return {configured:true,version:release.manifest.version,
  fileCount:release.manifest.files.length,archiveBytes:release.bytes,
  archiveSha256:release.sha256,url:release.url};
}

if(require.main===module){
 try{
  if(process.argv.length!==3)throw Error('Exactly one Camoufox resource directory is required');
  console.log(JSON.stringify(verifyCamoufoxReleaseResources(
   path.resolve(process.argv[2]))));
 }catch(error){
  console.error('Camoufox release resources:',error.message);
  process.exitCode=1;
 }
}

module.exports={verifyCamoufoxReleaseResources};
