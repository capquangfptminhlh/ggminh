'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const ENGINES=new Set(['chromium','gecko']);
const MAX_BINARY=512*1024*1024;
const MIN_BINARY=4096;
const allowedWindowsNames={
 chromium:new Set(['chrome.exe','msedge.exe']),
 gecko:new Set(['firefox.exe'])
};
function validatePath(engine,filename,{platform=process.platform}={}){
 if(!ENGINES.has(engine))throw Error('Unsupported browser engine');
 if(typeof filename!=='string'||!path.isAbsolute(filename)||filename.includes('\0'))
  throw Error('Choose an absolute browser executable path');
 const ext=path.extname(filename).toLowerCase();
 if(platform==='win32'){
  if(!/^[a-zA-Z]:[\\/]/.test(filename))
   throw Error('Only local Windows drive paths are permitted');
  const allowed=engine==='gecko'&&opts.trustedCamoufox===true
   ?new Set(['camoufox.exe']):allowedWindowsNames[engine];
  if(!allowed.has(path.basename(filename).toLowerCase()))
   throw Error('Only official Chrome/Edge or Firefox executable names are accepted');
 }else if(!['.exe',''].includes(ext)){
  throw Error('Executable extension not supported');
 }
 return filename;
}
function inspectBinary(engine,filename,opts={}){
 validatePath(engine,filename,opts);
 const stat=fs.lstatSync(filename);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<MIN_BINARY||stat.size>MAX_BINARY)
  throw Error('Executable must be a regular file between 4 KB and 512 MB');
 // Inspect each ancestor directly. Windows realpath strings can differ due to
 // volume aliases, 8.3 names, and \\?\ device prefixes even for ordinary files.
 // Parent symlinks/junctions and executable symlinks are still rejected.
 const root=path.parse(filename).root;
 let folder=root;
 const relative=path.relative(root,path.dirname(filename));
 for(const segment of relative.split(path.sep).filter(Boolean)){
  folder=path.join(folder,segment);
  if(fs.lstatSync(folder).isSymbolicLink())
   throw Error('Symlink/junction-linked browser paths are not accepted');
 }
 if((opts.platform||process.platform)==='win32'){
  const fd=fs.openSync(filename,'r');
  try{
   const header=Buffer.alloc(64);
   if(fs.readSync(fd,header,0,64,0)!==64||header.toString('ascii',0,2)!=='MZ')
    throw Error('Not a valid Windows PE executable');
   const offset=header.readUInt32LE(60);
   if(offset<64||offset>1024*1024||offset+6>stat.size)
    throw Error('Malformed Windows PE header');
   const signature=Buffer.alloc(6);
   if(fs.readSync(fd,signature,0,6,offset)!==6||
      signature.toString('ascii',0,4)!=='PE\u0000\u0000')
    throw Error('Malformed Windows PE signature');
   const machine=signature.readUInt16LE(4);
   if(machine!==0x8664&&machine!==0x14c)
    throw Error('Unsupported Windows browser architecture');
  }finally{fs.closeSync(fd);}
 }
 const hash=crypto.createHash('sha256');
 const fd=fs.openSync(filename,'r');
 try{
  const buf=Buffer.allocUnsafe(1024*1024);
  let position=0,count;
  while((count=fs.readSync(fd,buf,0,buf.length,position))>0){
   hash.update(buf.subarray(0,count));position+=count;
   if(position>MAX_BINARY)throw Error('Browser executable exceeds size limit');
  }
  if(position!==stat.size)throw Error('Browser executable changed while hashing');
 }finally{fs.closeSync(fd);}
 const after=fs.statSync(filename);
 if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||
    after.ino!==stat.ino||after.dev!==stat.dev)
  throw Error('Browser executable changed during inspection');
 return {sha256:hash.digest('hex'),bytes:stat.size};
}
function saveAtomic(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 try{
  fs.writeFileSync(temp,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});
  fs.renameSync(temp,file);
 }catch(error){try{fs.rmSync(temp,{force:true});}catch(_){}throw error;}
}
class RuntimeRegistry{
 constructor(root,opts={}){
  this.file=path.join(root,'browser-runtimes.json');
  this.opts=opts;
  let saved={version:1,runtimes:{}};
  try{saved=JSON.parse(fs.readFileSync(this.file,'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(saved?.version!==1||!saved.runtimes||typeof saved.runtimes!=='object'||
     Array.isArray(saved.runtimes)||
     Object.keys(saved.runtimes).some(x=>!ENGINES.has(x)))
   throw Error('Browser runtime registry is corrupt');
  this.data=saved;
 }
 status(){
  const result={};
  for(const engine of ENGINES){
   const current=this.data.runtimes[engine];
   if(!current){result[engine]={configured:false};continue;}
   try{
    const actual=inspectBinary(engine,current.path,this.opts);
    const unchanged=actual.sha256===current.sha256&&actual.bytes===current.bytes;
    result[engine]={configured:true,valid:unchanged,
     name:path.basename(current.path),sha256:current.sha256,bytes:current.bytes,
     registeredAt:current.registeredAt,
     status:unchanged?'verified':'changed',
     message:unchanged?'Executable SHA-256 matches the pinned version':
      'Browser executable has changed: re-register after checking the update'};
   }catch(error){
    result[engine]={configured:true,valid:false,status:'unavailable',
     name:path.basename(String(current.path||'')),
     message:String(error.message).slice(0,180)};
   }
  }
  return result;
 }
 register(engine,filename){
  const {sha256,bytes}=inspectBinary(engine,filename,this.opts);
  const entry={path:filename,sha256,bytes,registeredAt:new Date().toISOString()};
  const next={version:1,runtimes:{...this.data.runtimes,[engine]:entry}};
  saveAtomic(this.file,next);this.data=next;
  return {engine,name:path.basename(filename),sha256,bytes,registeredAt:entry.registeredAt};
 }
 clear(engine){
  if(!ENGINES.has(engine))throw Error('Unknown browser engine');
  const next={version:1,runtimes:{...this.data.runtimes}};
  delete next.runtimes[engine];
  saveAtomic(this.file,next);this.data=next;
  return {cleared:true,engine};
 }
 binaryFor(engine){
  if(!ENGINES.has(engine))throw Error('Unknown browser engine');
  const current=this.data.runtimes[engine];
  if(!current)return null;
  const actual=inspectBinary(engine,current.path,this.opts);
  if(actual.sha256!==current.sha256||actual.bytes!==current.bytes)
   throw Error('Pinned browser executable changed. Verify the update and register it again.');
  return current.path;
 }
}
module.exports={RuntimeRegistry,inspectBinary,validatePath};
