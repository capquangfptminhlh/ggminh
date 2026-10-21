'use strict';
/**
 * Bundled browser distribution trust boundary.
 * Manifest signature is domain-separated from license token signatures.
 * No unsigned engine, injected fingerprint flags or silent system fallback.
 */
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const {PUBLIC_KEY}=require('../licensing/manager');
const {inspectBinary}=require('./runtimeRegistry');

const DOMAIN='LHM_BROWSER_ENGINE_BUNDLE_V1\n';
const SHA=/^[a-f0-9]{64}$/;
const VERSION=/^\d{1,3}\.\d{1,5}\.\d{1,5}(?:\.\d{1,6})?$/;
const RELATIVE=/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*(?:\/[a-zA-Z0-9_][a-zA-Z0-9_.-]*)*$/;
const MAX_FILES=10000;
const MAX_FILE_SIZE=512*1024*1024;
const MAX_TOTAL_SIZE=3*1024*1024*1024;
function fileName(name){
 if(typeof name!=='string'||name.length>240||!RELATIVE.test(name)||
    name.split('/').some(part=>part==='.'||part==='..'))
  throw Error('Unsafe bundled engine relative file path');
 return name;
}
function canonicalManifest(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||
    Object.keys(payload).sort().join(',')!=='engine,entry,files,schema,version'||
    payload.schema!==1||!['chromium','camoufox'].includes(payload.engine)||
    !VERSION.test(payload.version||'')||
    !(payload.engine==='chromium'?['chrome.exe','msedge.exe']:['camoufox.exe']).includes(payload.entry)||
    !Array.isArray(payload.files)||!payload.files.length||
    payload.files.length>MAX_FILES)
  throw Error('Invalid bundled engine manifest');
 const names=new Set();
 const files=payload.files.map((f,i)=>{
  if(!f||typeof f!=='object'||Array.isArray(f)||
     Object.keys(f).sort().join(',')!=='bytes,path,sha256'||
     !fileName(f.path)||!SHA.test(f.sha256)||!Number.isSafeInteger(f.bytes)||
     f.bytes<1||f.bytes>MAX_FILE_SIZE)
   throw Error('Invalid bundled engine file at index '+i);
  if(names.has(f.path.toLowerCase()))throw Error('Duplicate bundled engine file');
  names.add(f.path.toLowerCase());
  return {path:f.path,bytes:f.bytes,sha256:f.sha256};
 });
 if(!names.has(payload.entry.toLowerCase()))
  throw Error('Manifest omits the browser executable');
 if(files.reduce((n,f)=>n+f.bytes,0)>MAX_TOTAL_SIZE)
  throw Error('Bundled engine exceeds the declared size limit');
 if(files.some((f,i)=>i>0&&files[i-1].path>=f.path))
  throw Error('Bundled manifest files must be sorted by path');
 return JSON.stringify({schema:1,engine:payload.engine,version:payload.version,
  entry:payload.entry,files});
}
function signedPayload(manifest){
 const signed={schema:manifest.schema,engine:manifest.engine,
  version:manifest.version,entry:manifest.entry,files:manifest.files};
 return Buffer.from(DOMAIN+canonicalManifest(signed),'utf8');
}
function decodeSignature(signature){
 if(typeof signature!=='string'||signature.length>100||
    !/^[A-Za-z0-9_-]+$/.test(signature))
  throw Error('Missing or invalid engine manifest signature');
 const data=Buffer.from(signature,'base64url');
 if(data.length!==64||data.toString('base64url')!==signature)
  throw Error('Invalid signed engine manifest signature bytes');
 return data;
}
function checkNoLinks(root,filename){
 const base=path.resolve(root);
 const target=path.resolve(filename);
 if(target===base||!target.startsWith(base+path.sep))
  throw Error('Bundled engine path escapes resource directory');
 const parts=path.relative(base,target).split(path.sep);
 let current=base;
 const origin=fs.lstatSync(base);
 if(!origin.isDirectory()||origin.isSymbolicLink())
  throw Error('Bundled engine root must be a real directory');
 for(const part of parts){
  current=path.join(current,part);
  const stat=fs.lstatSync(current);
  if(stat.isSymbolicLink())throw Error('Symlink in bundled engine resource');
 }
 return target;
}
function sha256File(filename){
 const fd=fs.openSync(filename,'r');
 const h=crypto.createHash('sha256');
 let size=0;
 try{
  const chunk=Buffer.allocUnsafe(1024*1024);
  let received;
  while((received=fs.readSync(fd,chunk,0,chunk.length,null))>0){
   size+=received;
   if(size>MAX_FILE_SIZE)throw Error('Bundled engine file too large');
   h.update(chunk.subarray(0,received));
  }
 }finally{fs.closeSync(fd);}
 return {sha256:h.digest('hex'),bytes:size};
}
function listFiles(root){
 const files=[];
 function visit(directory){
  for(const name of fs.readdirSync(directory)){
   const full=path.join(directory,name);
   const stat=fs.lstatSync(full);
   if(stat.isSymbolicLink())throw Error('Symlink in bundled engine resources');
   if(stat.isDirectory())visit(full);
   else if(stat.isFile()){
    const rel=path.relative(root,full).split(path.sep).join('/');
    if(rel!=='manifest.json')files.push(fileName(rel));
   }else throw Error('Unsupported engine resource file');
   if(files.length>MAX_FILES)throw Error('Too many bundled engine files');
  }
 }
 visit(root);
 return files.sort();
}
class BundledEngineManager{
 constructor(resourcesRoot,{
  publicKey=PUBLIC_KEY,platform=process.platform,inspect=inspectBinary,
  engine='chromium'
 }={}){
  if(!['chromium','camoufox'].includes(engine))throw Error('Unknown bundled browser engine');
  this.engine=engine;
  this.root=path.resolve(resourcesRoot);
  this.publicKey=publicKey;
  this.platform=platform;
  this.inspect=inspect;
 }
 verify(){
  if(this.platform!=='win32')throw Error('Bundled engine release currently supports Windows only');
  const manifestFile=checkNoLinks(this.root,path.join(this.root,'manifest.json'));
  if(!fs.lstatSync(manifestFile).isFile())throw Error('Invalid engine manifest file');
  if(fs.statSync(manifestFile).size>1024*1024)
   throw Error('Engine manifest exceeds 1 MB');
  const doc=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if(!doc||Object.keys(doc).sort().join(',')!=='engine,entry,files,schema,signature,version')
   throw Error('Unexpected engine manifest fields');
  if(doc.engine!==this.engine)throw Error('Unexpected engine type in release manifest');
  const signed=signedPayload(doc);
  const signature=decodeSignature(doc.signature);
  if(!crypto.verify(null,signed,this.publicKey,signature))
   throw Error('Bundled engine manifest signature is not trusted');
  const listed=listFiles(this.root);
  const expected=doc.files.map(f=>f.path).sort();
  if(JSON.stringify(listed)!==JSON.stringify(expected))
   throw Error('Bundled engine contains missing or unlisted files');
  for(const f of doc.files){
   const absolute=checkNoLinks(this.root,path.join(this.root,...f.path.split('/')));
   if(!fs.lstatSync(absolute).isFile())
    throw Error('Invalid bundled engine entry');
   const value=sha256File(absolute);
   if(value.bytes!==f.bytes||value.sha256!==f.sha256)
    throw Error('Bundled engine SHA-256 mismatch: '+f.path);
  }
  const executable=checkNoLinks(this.root,path.join(this.root,doc.entry));
  const binary=this.inspect(this.engine==='camoufox'?'gecko':'chromium',
   executable,{platform:this.platform,trustedCamoufox:this.engine==='camoufox'});
  const declared=doc.files.find(f=>f.path===doc.entry);
  if(binary.sha256!==declared.sha256||binary.bytes!==declared.bytes)
   throw Error('Bundled browser executable changed during verification');
  return {executable,version:doc.version,fileCount:doc.files.length,
   sha256:declared.sha256,engine:this.engine};
 }
 resolve(engine){
  if(engine!==this.engine)throw Error('Bundled engine not available for this browser family');
  return this.verify().executable;
 }
 status(){
  try{
   const r=this.verify();
   return {available:true,valid:true,version:r.version,sha256:r.sha256,
    fileCount:r.fileCount,name:path.basename(r.executable)};
  }catch(error){
   return {available:false,valid:false,reason:String(error.message).slice(0,220)};
  }
 }
}
module.exports={BundledEngineManager,canonicalManifest,signedPayload,
 decodeSignature,fileName,listFiles,sha256File,DOMAIN};
