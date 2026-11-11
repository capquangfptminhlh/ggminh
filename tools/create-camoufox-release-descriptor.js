#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const {validateRelease}=require('../src/engine/camoufoxInstallService');

const MAX_ARCHIVE=2*1024*1024*1024;

function regularFile(file,label){
 if(typeof file!=='string'||!path.isAbsolute(file))
  throw Error(label+' path must be absolute');
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error(label+' must be a regular file');
 return stat;
}

function hashArchive(file){
 const stat=regularFile(file,'Archive');
 if(stat.size<100||stat.size>MAX_ARCHIVE)throw Error('Archive size is outside release limits');
 const fd=fs.openSync(file,'r'),hash=crypto.createHash('sha256');
 try{
  const buffer=Buffer.allocUnsafe(4*1024*1024);
  let read;
  while((read=fs.readSync(fd,buffer,0,buffer.length,null))>0)
   hash.update(buffer.subarray(0,read));
 }finally{fs.closeSync(fd);}
 return {bytes:stat.size,sha256:hash.digest('hex')};
}

function createReleaseDescriptor({archiveFile,manifestFile,publicKeyFile,
 outputFile,url}){
 regularFile(manifestFile,'Manifest');
 regularFile(publicKeyFile,'Publisher public key');
 if(typeof outputFile!=='string'||!path.isAbsolute(outputFile))
  throw Error('Release descriptor output path must be absolute');
 if(fs.existsSync(outputFile))throw Error('Release descriptor already exists');
 const manifestStat=fs.statSync(manifestFile);
 if(manifestStat.size>1024*1024)throw Error('Manifest exceeds 1 MB');
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 const publicKey=crypto.createPublicKey(fs.readFileSync(publicKeyFile));
 const archive=hashArchive(archiveFile);
 const descriptor={schema:1,url,archiveSha256:archive.sha256,
  archiveBytes:archive.bytes,manifest};
 validateRelease(descriptor,{publicKey});
 const temp=outputFile+'.tmp-'+crypto.randomBytes(6).toString('hex');
 try{
  fs.writeFileSync(temp,JSON.stringify(descriptor,null,2)+'\n',{flag:'wx',mode:0o600});
  fs.renameSync(temp,outputFile);
 }finally{try{fs.rmSync(temp,{force:true});}catch(_){}}
 return descriptor;
}

if(require.main===module){
 try{
  if(process.argv.length!==7)throw Error(
   'Usage: node tools/create-camoufox-release-descriptor.js <archive> <manifest> <publisher-public-key> <output> <https-github-release-url>');
  const result=createReleaseDescriptor({archiveFile:path.resolve(process.argv[2]),
   manifestFile:path.resolve(process.argv[3]),publicKeyFile:path.resolve(process.argv[4]),
   outputFile:path.resolve(process.argv[5]),url:process.argv[6]});
  console.log(JSON.stringify({output:path.resolve(process.argv[5]),
   archiveBytes:result.archiveBytes,archiveSha256:result.archiveSha256,
   version:result.manifest.version,fileCount:result.manifest.files.length}));
 }catch(error){
  console.error('Camoufox release descriptor:',error.message);
  process.exitCode=1;
 }
}

module.exports={createReleaseDescriptor,hashArchive};
