#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const {TextDecoder}=require('node:util');
const {containsPrivateKeyMaterial}=require('../src/engine/bundledEngineManager');
const {validateRelease}=require('../src/engine/camoufoxInstallService');

const MAX_METADATA_BYTES=1024*1024;
const PUBLIC_FILE='publisher-ed25519.pub';
const RELEASE_FILE='release.json';

function readCheckedResource(file,stat,limit){
 if(stat.size>limit)throw Error('Camoufox release metadata exceeds size limits');
 const fd=fs.openSync(file,'r');
 try{
  const opened=fs.fstatSync(fd);
  if(!opened.isFile()||opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==stat.size)
   throw Error('Camoufox release resource changed during verification');
  const buffer=Buffer.allocUnsafe(stat.size+1);
  let length=0;
  while(length<buffer.length){
   const count=fs.readSync(fd,buffer,length,buffer.length-length,null);
   if(count===0)break;
   length+=count;
  }
  if(length!==stat.size)throw Error('Camoufox release resource changed during verification');
  return buffer.subarray(0,length);
 }finally{fs.closeSync(fd);}
}

function loadVerifiedCamoufoxReleaseResources(resourceDir,{licenseKey=null}={}){
 if(typeof resourceDir!=='string'||!path.isAbsolute(resourceDir))
  throw Error('Camoufox resource directory must be absolute');
 const root=fs.lstatSync(resourceDir);
 if(!root.isDirectory()||root.isSymbolicLink())
  throw Error('Camoufox resources must be a regular directory');
 const metadata=new Map();
 function visit(directory){
  for(const name of fs.readdirSync(directory)){
   const file=path.join(directory,name),stat=fs.lstatSync(file);
   if(stat.isSymbolicLink())throw Error('Camoufox release resources must not contain symlinks');
   const base=process.platform==='win32'?name.toLowerCase():name;
   const isMetadata=directory===resourceDir&&(base===PUBLIC_FILE||base===RELEASE_FILE);
   if(isMetadata&&(!stat.isFile()||metadata.has(base)))
    throw Error('Camoufox trust and release files must be unique regular files');
   if(stat.isDirectory())visit(file);
   else if(stat.isFile()){
    if(['camoufox.exe','manifest.json'].includes(name.toLowerCase()))
     throw Error('Camoufox engine payload must not ship inside the application');
    if(isMetadata||stat.size<=MAX_METADATA_BYTES){
     const limit=isMetadata&&base===PUBLIC_FILE?4096:MAX_METADATA_BYTES;
     const bytes=readCheckedResource(file,stat,limit);
     if(containsPrivateKeyMaterial(bytes))throw Error('Camoufox resources contain private key material: '+name);
     if(isMetadata)metadata.set(base,bytes);
    }
   }else throw Error('Unsupported Camoufox release resource');
  }
 }
 visit(resourceDir);
 if(metadata.size===1)
  throw Error('Camoufox publisher key and release descriptor must ship together');
 if(!metadata.size)return {summary:{configured:false},publicKey:null,descriptor:null,release:null};
 const publicKey=crypto.createPublicKey(metadata.get(PUBLIC_FILE));
 if(licenseKey){
  const licensePublicKey=licenseKey.type==='public'?licenseKey:crypto.createPublicKey(licenseKey);
  const spki={format:'der',type:'spki'};
  if(publicKey.export(spki).equals(licensePublicKey.export(spki)))
   throw Error('Camoufox publisher key must be independent of license signing key');
 }
 const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
 const descriptor=JSON.parse(utf8.decode(metadata.get(RELEASE_FILE)));
 const release=validateRelease(descriptor,{publicKey});
 const summary={configured:true,version:release.manifest.version,
  fileCount:release.manifest.files.length,archiveBytes:release.bytes,
  archiveSha256:release.sha256,url:release.url};
 return {summary,publicKey,descriptor,release};
}

function verifyCamoufoxReleaseResources(resourceDir){
 return loadVerifiedCamoufoxReleaseResources(resourceDir).summary;
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

module.exports={verifyCamoufoxReleaseResources,loadVerifiedCamoufoxReleaseResources};
