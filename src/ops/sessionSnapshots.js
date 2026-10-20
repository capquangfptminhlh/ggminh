'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {isolatedPaths,rejectSymlinks,assertProfileId}=require('../privacy/isolation');
const FORMAT='LHM-SESSION-1';
const MAX_BYTES=32*1024*1024;
const MAX_FILES=1200;
const SNAPSHOT_ID=/^snap_[0-9a-f]{24}$/;
const EXCLUDED=new Set([
 'Cache','Code Cache','GPUCache','ShaderCache','GrShaderCache','GraphiteDawnCache',
 'DawnCache','cache2','Crashpad','CacheStorage'
]);
const now=()=>new Date().toISOString();
function validatePassword(password){
 if(typeof password!=='string'||password.length<12||password.length>256)
  throw Error('Mật khẩu snapshot cần từ 12 đến 256 ký tự');
 return password;
}
function safePath(root,relative){
 if(typeof relative!=='string'||relative.length>512||relative.includes('\\')||
    relative.startsWith('/')||relative.includes('\0'))
  throw Error('Invalid snapshot entry path');
 const bits=relative.split('/');
 if(bits.some(x=>!x||x==='.'||x==='..'||x.includes(':')||
   /[\x00-\x1f<>|?"*]/.test(x)||/[. ]$/.test(x)||
   /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x)))
   throw Error('Invalid snapshot entry path');
 const full=path.resolve(root,...bits),rel=path.relative(root,full);
 if(!rel||rel.startsWith('..')||path.isAbsolute(rel))
  throw Error('Snapshot path escapes profile');
 return full;
}
function enumerate(root){
 const files=[];let bytes=0;
 function walk(dir,segments){
  if(segments.length>12)throw Error('Profile storage depth exceeds snapshot limit');
  for(const name of fs.readdirSync(dir)){
   const full=path.join(dir,name),st=fs.lstatSync(full);
   if(st.isSymbolicLink())throw Error('Refusing snapshot: symbolic link in profile');
   if(!(st.isDirectory()||st.isFile()))throw Error('Refusing special files');
   if(EXCLUDED.has(name))continue;
   const next=[...segments,name];
   if(st.isDirectory()){walk(full,next);continue;}
   bytes+=st.size;
   if(files.length>=MAX_FILES||bytes>MAX_BYTES)
    throw Error('Profile snapshot is larger than 1200 files or 32 MB');
   const rel=next.join('/');
   safePath(root,rel);
   files.push({path:rel,data:fs.readFileSync(full).toString('base64')});
  }
 }
 if(fs.existsSync(root)){
  if(!fs.lstatSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())
   throw Error('Invalid profile directory');
  walk(root,[]);
 }
 return {files,bytes};
}
function decode(envelope,password){
 if(!envelope||envelope.format!==FORMAT||
    typeof envelope.profileId!=='string'||
    !SNAPSHOT_ID.test(envelope.id)||!['chromium','gecko'].includes(envelope.engine))
  throw Error('Not a valid LHM encrypted session snapshot');
 const salt=Buffer.from(envelope.salt||'','base64'),
  nonce=Buffer.from(envelope.nonce||'','base64'),
  tag=Buffer.from(envelope.tag||'','base64'),
  data=Buffer.from(envelope.payload||'','base64');
 if(salt.length!==16||nonce.length!==12||tag.length!==16||data.length>MAX_BYTES*1.5)
  throw Error('Corrupted encrypted snapshot');
 const key=crypto.pbkdf2Sync(validatePassword(password),salt,220000,32,'sha256');
 let decrypted;
 try{
  const cipher=crypto.createDecipheriv('aes-256-gcm',key,nonce);
  cipher.setAAD(Buffer.from(FORMAT+':'+envelope.id+':'+envelope.profileId+':'+envelope.engine));
  cipher.setAuthTag(tag);
  decrypted=Buffer.concat([cipher.update(data),cipher.final()]);
 }catch(_){throw Error('Mật khẩu sai hoặc dữ liệu snapshot bị thay đổi');}
 if(decrypted.length>MAX_BYTES*1.5)throw Error('Snapshot exceeds allowed size');
 let value;
 try{value=JSON.parse(decrypted.toString('utf8'));}
 catch(_){throw Error('Corrupted decrypted snapshot content');}
 if(!Array.isArray(value.files)||value.files.length>MAX_FILES)throw Error('Invalid snapshot file count');
 return value;
}
function envelopeFor(id,profileId,engine,value,password){
 const salt=crypto.randomBytes(16),nonce=crypto.randomBytes(12);
 const key=crypto.pbkdf2Sync(validatePassword(password),salt,220000,32,'sha256');
 const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);
 cipher.setAAD(Buffer.from(FORMAT+':'+id+':'+profileId+':'+engine));
 const payload=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value))),cipher.final()]);
 return {format:FORMAT,id,profileId,engine,createdAt:now(),fileCount:value.files.length,
  salt:salt.toString('base64'),nonce:nonce.toString('base64'),
  tag:cipher.getAuthTag().toString('base64'),payload:payload.toString('base64')};
}
class SessionSnapshots{
 constructor(store,launcher,{inUse=()=>false}={}){
  this.store=store;this.launcher=launcher;this.inUse=inUse;
  this.base=path.join(store.baseDir,'session-snapshots');
  fs.mkdirSync(this.base,{recursive:true});
 }
 source(profileId){
  assertProfileId(profileId);
  const profile=this.store.getProfile(profileId);
  if(!profile)throw Error('Profile not found');
  if(this.launcher?.isBusy(profileId)||this.inUse(profileId))
   throw Error('Close the browser and finish RPA before changing session data');
  const engine=profile.engine==='gecko'?'gecko':'chromium';
  const directory=isolatedPaths(this.store.baseDir,profileId,engine).profileDir;
  rejectSymlinks(this.store.baseDir,directory);
  return {profileId,engine,directory};
 }
 folder(profileId){
  assertProfileId(profileId);
  const folder=path.join(this.base,profileId);
  rejectSymlinks(this.store.baseDir,folder);
  return folder;
 }
 list(profileId){
  this.source(profileId);
  const directory=this.folder(profileId);
  if(!fs.existsSync(directory))return [];
  return fs.readdirSync(directory).filter(x=>/^snap_[0-9a-f]{24}\.lhmsnap$/.test(x))
   .map(name=>{
    const filename=path.join(directory,name);
    const st=fs.lstatSync(filename);
    if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_BYTES*2.5)return null;
    const e=JSON.parse(fs.readFileSync(filename,'utf8'));
    if(e.format!==FORMAT||e.profileId!==profileId)return null;
    return {id:e.id,createdAt:e.createdAt,engine:e.engine,
      fileCount:e.fileCount,encryptedBytes:st.size};
   }).filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,20);
 }
 create(profileId,password){
  const info=this.source(profileId);
  validatePassword(password);
  const folder=this.folder(profileId);
  if(this.list(profileId).length>=10)
   throw Error('Maximum ten snapshots per profile; delete an older one first');
  const content=enumerate(info.directory);
  if(!content.files.length)throw Error('Profile directory is empty; open and close browser first');
  const id='snap_'+crypto.randomBytes(12).toString('hex');
  const envelope=envelopeFor(id,profileId,info.engine,
   {files:content.files,bytes:content.bytes},password);
  fs.mkdirSync(folder,{recursive:true});
  const target=path.join(folder,id+'.lhmsnap');
  const temp=target+'.tmp';
  try{
   fs.writeFileSync(temp,JSON.stringify(envelope),{mode:0o600,flag:'wx'});
   fs.renameSync(temp,target);
  }catch(error){
   try{fs.rmSync(temp,{force:true});}catch(_){}
   throw error;
  }
  return {id,createdAt:envelope.createdAt,fileCount:content.files.length,
   bytes:content.bytes,encryptedBytes:fs.statSync(target).size};
 }
 read(info,id,password){
  if(typeof id!=='string'||!SNAPSHOT_ID.test(id))throw Error('Invalid snapshot ID');
  const filename=path.join(this.folder(info.profileId),id+'.lhmsnap');
  const stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES*2.5)
   throw Error('Invalid encrypted snapshot file');
  const env=JSON.parse(fs.readFileSync(filename,'utf8'));
  if(env.id!==id||env.profileId!==info.profileId||env.engine!==info.engine)
   throw Error('Snapshot belongs to a different profile or browser engine');
  const decrypted=decode(env,password);
  const paths=new Set();let bytes=0;
  for(const file of decrypted.files){
   if(!file||typeof file.data!=='string'||file.data.length>MAX_BYTES*1.5)
    throw Error('Invalid encrypted file entry');
   const key=file.path;
   safePath(info.directory,key);
   if(paths.has(key))throw Error('Duplicate snapshot entry');
   paths.add(key);
   const buf=Buffer.from(file.data,'base64');
   bytes+=buf.length;
   if(bytes>MAX_BYTES)throw Error('Snapshot exceeds 32 MB');
   file.buffer=buf;
  }
  if(bytes!==decrypted.bytes)throw Error('Snapshot size validation failed');
  return {files:decrypted.files,bytes};
 }
 inspect(profileId,id,password){
  const info=this.source(profileId),parsed=this.read(info,id,password);
  return {id,profileId,files:parsed.files.length,bytes:parsed.bytes,
   warning:'Restoring replaces current browser session files; back up current session first.'};
 }
 restore(profileId,id,password,confirmation){
  if(confirmation!=='KHOI PHUC')throw Error('Type KHOI PHUC to confirm');
  const info=this.source(profileId),parsed=this.read(info,id,password);
  const parent=path.dirname(info.directory);
  fs.mkdirSync(parent,{recursive:true});
  rejectSymlinks(this.store.baseDir,parent);
  const token=crypto.randomBytes(6).toString('hex');
  const staged=path.join(parent,'.lhm-stage-'+token);
  const oldDir=path.join(parent,'.lhm-old-'+token);
  let movedOld=false,movedNew=false;
  try{
   fs.mkdirSync(staged,{recursive:false});
   for(const entry of parsed.files){
    const target=safePath(staged,entry.path);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,entry.buffer,{flag:'wx',mode:0o600});
   }
   // Double-check lifecycle immediately before swapping directories.
   this.source(profileId);
   if(fs.existsSync(info.directory)){
    fs.renameSync(info.directory,oldDir);movedOld=true;
   }
   fs.renameSync(staged,info.directory);movedNew=true;
  }catch(error){
   if(movedOld&&!movedNew){
    try{fs.renameSync(oldDir,info.directory);}
    catch(restoreError){
     throw Error('Restore rollback failed; original data remains at '+oldDir+
       ' ('+restoreError.message+')');
    }
   }
   throw error;
  }finally{
   if(!movedNew){try{fs.rmSync(staged,{recursive:true,force:true});}catch(_){}}
  }
  // Old data is removed only after the new session is fully installed.
  try{if(movedOld)fs.rmSync(oldDir,{recursive:true,force:true});}
  catch(error){console.warn('[Snapshots] Old profile cleanup deferred:',error.message);}
  return {restored:true,files:parsed.files.length,bytes:parsed.bytes};
 }
 remove(profileId,id,confirmation){
  this.source(profileId);
  if(confirmation!=='XOA SNAPSHOT')throw Error('Type XOA SNAPSHOT to confirm');
  if(typeof id!=='string'||!SNAPSHOT_ID.test(id))throw Error('Invalid snapshot ID');
  const file=path.join(this.folder(profileId),id+'.lhmsnap');
  if(!fs.existsSync(file))return false;
  if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())
   throw Error('Invalid snapshot');
  fs.unlinkSync(file);return true;
 }
}
module.exports={SessionSnapshots,enumerate,safePath,decode};
